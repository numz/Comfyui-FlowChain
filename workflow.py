import json
import urllib.request
import urllib.parse
import torch
import logging
import time
import uuid
import traceback
import nodes
import copy
import asyncio
from enum import Enum
import numpy as np
import server
import hashlib
from torchvision import transforms
from .utils.logger import Logger
from .utils.utils import caches
from comfy_execution.graph import get_input_info, ExecutionList, DynamicPrompt, ExecutionBlocker
import comfy.model_management
import sys
from PIL import Image
from comfy_execution.graph_utils import is_link, GraphBuilder
from nodes import SaveImage
import gc

class ExecutionResult(Enum):
    SUCCESS = 0
    FAILURE = 1
    PENDING = 2


class AnyType(str):
    """A special class that is always equal in not equal comparisons. Credit to pythongosssss"""

    def __eq__(self, _) -> bool:
        return True

    def __ne__(self, __value: object) -> bool:
        return False


client_id = '5b49a023-b05a-4c53-8dc9-addc3a749911'
server_address = "127.0.0.1:8188"


def _map_node_over_list(obj, input_data_all, func, allow_interrupt=False, execution_block_cb=None, pre_execute_cb=None):
    # check if node wants the lists
    input_is_list = getattr(obj, "INPUT_IS_LIST", False)

    if len(input_data_all) == 0:
        max_len_input = 0
    else:
        max_len_input = max(len(x) for x in input_data_all.values())

    # get a slice of inputs, repeat last input when list isn't long enough
    def slice_dict(d, i):
        return {k: v[i if len(v) > i else -1] for k, v in d.items()}

    results = []

    def process_inputs(inputs, index=None):
        if allow_interrupt:
            nodes.before_node_execution()
        execution_block = None
        for k, v in inputs.items():
            if isinstance(v, ExecutionBlocker):
                execution_block = execution_block_cb(v) if execution_block_cb else v
                break
        if execution_block is None:
            if pre_execute_cb is not None and index is not None:
                pre_execute_cb(index)
            results.append(getattr(obj, func)(**inputs))
        else:
            results.append(execution_block)

    if input_is_list:
        process_inputs(input_data_all, 0)
    elif max_len_input == 0:
        process_inputs({})
    else:
        for i in range(max_len_input):
            input_dict = slice_dict(input_data_all, i)
            process_inputs(input_dict, i)
    return results


def merge_result_data(results, obj):
    # check which outputs need concatenating
    output = []
    output_is_list = [False] * len(results[0])
    if hasattr(obj, "OUTPUT_IS_LIST"):
        output_is_list = obj.OUTPUT_IS_LIST

    # merge node execution results
    for i, is_list in zip(range(len(results[0])), output_is_list):
        if is_list:
            output.append([x for o in results for x in o[i]])
        else:
            output.append([o[i] for o in results])
    return output


def get_output_data(obj, input_data_all, execution_block_cb=None, pre_execute_cb=None):
    results = []
    uis = []
    subgraph_results = []
    return_values = _map_node_over_list(obj, input_data_all, obj.FUNCTION, allow_interrupt=True,
                                        execution_block_cb=execution_block_cb, pre_execute_cb=pre_execute_cb)
    has_subgraph = False
    for i in range(len(return_values)):
        r = return_values[i]
        if isinstance(r, dict):
            if 'ui' in r:
                uis.append(r['ui'])
            if 'expand' in r:
                # Perform an expansion, but do not append results
                has_subgraph = True
                new_graph = r['expand']
                result = r.get("result", None)
                if isinstance(result, ExecutionBlocker):
                    result = tuple([result] * len(obj.RETURN_TYPES))
                subgraph_results.append((new_graph, result))
            elif 'result' in r:
                result = r.get("result", None)
                if isinstance(result, ExecutionBlocker):
                    result = tuple([result] * len(obj.RETURN_TYPES))
                results.append(result)
                subgraph_results.append((None, result))
        else:
            if isinstance(r, ExecutionBlocker):
                r = tuple([r] * len(obj.RETURN_TYPES))
            results.append(r)
            subgraph_results.append((None, r))

    if has_subgraph:
        output = subgraph_results
    elif len(results) > 0:
        output = merge_result_data(results, obj)
    else:
        output = []
    ui = dict()
    if len(uis) > 0:
        # ui = {k: [y for x in uis for y in x[k]] for k in uis[0].keys()}
        for k in uis[0].keys():
            for x in uis:
                ui[k] = x[k]
        # ui = {k: uis[0]["images"] for k in uis[0].keys()}
    return output, ui, has_subgraph


def get_input_data(inputs, class_def, unique_id, outputs=None, dynprompt=None, extra_data=None):
    if extra_data is None:
        extra_data = {}
    valid_inputs = class_def.INPUT_TYPES()
    input_data_all = {}
    missing_keys = {}
    for x in inputs:
        input_data = inputs[x]
        input_type, input_category, input_info = get_input_info(class_def, x)

        def mark_missing():
            missing_keys[x] = True
            input_data_all[x] = (None,)

        if is_link(input_data) and (not input_info or not input_info.get("rawLink", False)):
            input_unique_id = input_data[0]
            output_index = input_data[1]
            if outputs is None:
                mark_missing()
                continue  # This might be a lazily-evaluated input
            cached_output = outputs.get(input_unique_id)
            if cached_output is None:
                mark_missing()
                continue
            if output_index >= len(cached_output):
                mark_missing()
                continue
            obj = cached_output[output_index]
            input_data_all[x] = obj
        elif input_category is not None:
            input_data_all[x] = [input_data]

    if "hidden" in valid_inputs:
        h = valid_inputs["hidden"]
        for x in h:
            if h[x] == "PROMPT":
                input_data_all[x] = [dynprompt.get_original_prompt() if dynprompt is not None else {}]
            if h[x] == "DYNPROMPT":
                input_data_all[x] = [dynprompt]
            if h[x] == "EXTRA_PNGINFO":
                input_data_all[x] = [extra_data.get('extra_pnginfo', None)]
            if h[x] == "UNIQUE_ID":
                input_data_all[x] = [unique_id]
    return input_data_all, missing_keys


def full_type_name(klass):
    module = klass.__module__
    if module == 'builtins':
        return klass.__qualname__
    return module + '.' + klass.__qualname__


def format_value(x):
    if x is None:
        return None
    elif isinstance(x, (int, float, bool, str)):
        return x
    else:
        return str(x)


def executes(server, dynprompt, caches, current_item, extra_data, executed, prompt_id, execution_list,
             pending_subgraph_results):
    unique_id = current_item
    real_node_id = dynprompt.get_real_node_id(unique_id)
    display_node_id = dynprompt.get_display_node_id(unique_id)
    parent_node_id = dynprompt.get_parent_node_id(unique_id)
    inputs = dynprompt.get_node(unique_id)['inputs']
    class_type = dynprompt.get_node(unique_id)['class_type']
    class_def = nodes.NODE_CLASS_MAPPINGS[class_type]
    if caches.outputs.get(unique_id) is not None:
        if server.client_id is not None:
            cached_output = caches.ui.get(unique_id) or {}
            server.send_sync("executed", {"node": unique_id, "display_node": display_node_id,
                                          "output": cached_output.get("output", None), "prompt_id": prompt_id},
                             server.client_id)
        return (ExecutionResult.SUCCESS, None, None)

    input_data_all = None
    try:
        if unique_id in pending_subgraph_results:
            cached_results = pending_subgraph_results[unique_id]
            resolved_outputs = []
            for is_subgraph, result in cached_results:
                if not is_subgraph:
                    resolved_outputs.append(result)
                else:
                    resolved_output = []
                    for r in result:
                        if is_link(r):
                            source_node, source_output = r[0], r[1]
                            node_output = caches.outputs.get(source_node)[source_output]
                            for o in node_output:
                                resolved_output.append(o)

                        else:
                            resolved_output.append(r)
                    resolved_outputs.append(tuple(resolved_output))
            output_data = merge_result_data(resolved_outputs, class_def)
            output_ui = []
            has_subgraph = False
        else:
            input_data_all, missing_keys = get_input_data(inputs, class_def, unique_id, caches.outputs, dynprompt,
                                                          extra_data)
            if server.client_id is not None:
                server.last_node_id = display_node_id
                server.send_sync("executing",
                                 {"node": unique_id, "display_node": display_node_id, "prompt_id": prompt_id},
                                 server.client_id)

            obj = caches.objects.get(unique_id)
            if obj is None:
                obj = class_def()
                caches.objects.set(unique_id, obj)

            if hasattr(obj, "check_lazy_status"):
                required_inputs = _map_node_over_list(obj, input_data_all, "check_lazy_status", allow_interrupt=True)
                required_inputs = set(sum([r for r in required_inputs if isinstance(r, list)], []))
                required_inputs = [x for x in required_inputs if isinstance(x, str) and (
                        x not in input_data_all or x in missing_keys
                )]
                if len(required_inputs) > 0:
                    for i in required_inputs:
                        execution_list.make_input_strong_link(unique_id, i)
                    return (ExecutionResult.PENDING, None, None)

            def execution_block_cb(block):
                if block.message is not None:
                    """mes = {
                        "prompt_id": prompt_id,
                        "node_id": unique_id,
                        "node_type": class_type,
                        "executed": list(executed),

                        "exception_message": f"Execution Blocked: {block.message}",
                        "exception_type": "ExecutionBlocked",
                        "traceback": [],
                        "current_inputs": [],
                        "current_outputs": [],
                    }"""
                    """server.send_sync("execution_error", mes, server.client_id)"""
                    return ExecutionBlocker(None)
                else:
                    return block

            def pre_execute_cb(call_index):
                GraphBuilder.set_default_prefix(unique_id, call_index, 0)

            output_data, output_ui, has_subgraph = get_output_data(obj, input_data_all,
                                                                   execution_block_cb=execution_block_cb,
                                                                   pre_execute_cb=pre_execute_cb)
        if len(output_ui) > 0:
            caches.ui.set(unique_id, {
                "meta": {
                    "node_id": unique_id,
                    "display_node": display_node_id,
                    "parent_node": parent_node_id,
                    "real_node_id": real_node_id,
                },
                "output": output_ui
            })
            if server.client_id is not None:
                server.send_sync("executed", {"node": unique_id, "display_node": display_node_id, "output": output_ui,
                                              "prompt_id": prompt_id}, server.client_id)
        if has_subgraph:
            cached_outputs = []
            new_node_ids = []
            new_output_ids = []
            new_output_links = []
            for i in range(len(output_data)):
                new_graph, node_outputs = output_data[i]
                if new_graph is None:
                    cached_outputs.append((False, node_outputs))
                else:
                    # Check for conflicts

                    for node_id, node_info in new_graph.items():
                        new_node_ids.append(node_id)
                        display_id = node_info.get("override_display_id", unique_id)
                        dynprompt.add_ephemeral_node(node_id, node_info, unique_id, display_id)
                        # Figure out if the newly created node is an output node
                        class_type = node_info["class_type"]
                        class_def = nodes.NODE_CLASS_MAPPINGS[class_type]
                        if hasattr(class_def, 'OUTPUT_NODE') and class_def.OUTPUT_NODE == True:
                            new_output_ids.append(node_id)
                    for i in range(len(node_outputs)):
                        if is_link(node_outputs[i]):
                            from_node_id, from_socket = node_outputs[i][0], node_outputs[i][1]
                            new_output_links.append((from_node_id, from_socket))
                    cached_outputs.append((True, node_outputs))
            new_node_ids = set(new_node_ids)
            for cache in caches.all:
                cache.ensure_subcache_for(unique_id, new_node_ids).clean_unused()
            for node_id in new_output_ids:
                execution_list.add_node(node_id)
            for link in new_output_links:
                execution_list.add_strong_link(link[0], link[1], unique_id)
            pending_subgraph_results[unique_id] = cached_outputs
            return (ExecutionResult.PENDING, None, None)
        caches.outputs.set(unique_id, output_data)
    except comfy.model_management.InterruptProcessingException as iex:
        logging.info("Processing interrupted")

        # skip formatting inputs/outputs
        error_details = {
            "node_id": real_node_id,
        }

        return (ExecutionResult.FAILURE, error_details, iex)
    except Exception as ex:
        typ, _, tb = sys.exc_info()
        exception_type = full_type_name(typ)
        input_data_formatted = {}
        if input_data_all is not None:
            input_data_formatted = {}
            for name, inputs in input_data_all.items():
                input_data_formatted[name] = [format_value(x) for x in inputs]

        logging.error(f"!!! Exception during processing !!! {ex}")
        logging.error(traceback.format_exc())

        error_details = {
            "node_id": real_node_id,
            "exception_message": str(ex),
            "exception_type": exception_type,
            "traceback": traceback.format_tb(tb),
            "current_inputs": input_data_formatted
        }
        if isinstance(ex, comfy.model_management.OOM_EXCEPTION):
            logging.error("Got an OOM, unloading all loaded models.")
            comfy.model_management.unload_all_models()

        return (ExecutionResult.FAILURE, error_details, ex)

    executed.add(unique_id)

    return (ExecutionResult.SUCCESS, None, None)


class IsChangedCache:
    def __init__(self, dynprompt, outputs_cache):
        self.dynprompt = dynprompt
        self.outputs_cache = outputs_cache
        self.is_changed = {}

    def get(self, node_id):
        if node_id in self.is_changed:
            return self.is_changed[node_id]

        node = self.dynprompt.get_node(node_id)
        class_type = node["class_type"]
        class_def = nodes.NODE_CLASS_MAPPINGS[class_type]
        if not hasattr(class_def, "IS_CHANGED"):
            self.is_changed[node_id] = False
            return self.is_changed[node_id]

        if "is_changed" in node:
            self.is_changed[node_id] = node["is_changed"]
            return self.is_changed[node_id]

        # Intentionally do not use cached outputs here. We only want constants in IS_CHANGED
        input_data_all, _ = get_input_data(node["inputs"], class_def, node_id, None)
        try:
            is_changed = _map_node_over_list(class_def, input_data_all, "IS_CHANGED")
            node["is_changed"] = [None if isinstance(x, ExecutionBlocker) else x for x in is_changed]
        except Exception as e:
            logging.warning("WARNING: {}".format(e))
            node["is_changed"] = float("NaN")
        finally:
            self.is_changed[node_id] = node["is_changed"]
        return self.is_changed[node_id]


status_messages = []


def add_message(servers, event, data: dict, broadcast: bool):
    data = {
        **data,
        "timestamp": int(time.time() * 1000),
    }
    status_messages.append((event, data))
    """if servers.client_id is not None or broadcast:
        servers.send_sync(event, data, servers.client_id)"""


def handle_execution_error(servers, prompt_id, prompt, current_outputs, executed, error, ex):
    node_id = error["node_id"]
    class_type = prompt[node_id]["class_type"]

    # First, send back the status to the frontend depending
    # on the exception type
    if isinstance(ex, comfy.model_management.InterruptProcessingException):
        mes = {
            "prompt_id": prompt_id,
            "node_id": node_id,
            "node_type": class_type,
            "executed": list(executed),
        }
        add_message(servers, "execution_interrupted", mes, broadcast=True)
    else:
        mes = {
            "prompt_id": prompt_id,
            "node_id": node_id,
            "node_type": class_type,
            "executed": list(executed),
            "exception_message": error["exception_message"],
            "exception_type": error["exception_type"],
            "traceback": error["traceback"],
            "current_inputs": error["current_inputs"],
            "current_outputs": list(current_outputs),
        }
        add_message(servers, "execution_error", mes, broadcast=False)


def execute(server, prompt, prompt_id, extra_data={}, execute_outputs=[]):
    nodes.interrupt_processing(False)

    if "client_id" in extra_data:
        server.client_id = extra_data["client_id"]

    status_messages = []
    add_message(server,"execution_start", {"prompt_id": prompt_id}, broadcast=False)

    with torch.inference_mode():
        dynamic_prompt = DynamicPrompt(prompt)
        is_changed_cache = IsChangedCache(dynamic_prompt, caches.outputs)
        for cache in caches.all:
            cache.set_prompt(dynamic_prompt, prompt.keys(), is_changed_cache)
            cache.clean_unused()

        cached_nodes = []
        for node_id in prompt:
            if caches.outputs.get(node_id) is not None:
                cached_nodes.append(node_id)

        comfy.model_management.cleanup_models()
        add_message(server, "execution_cached",{"nodes": cached_nodes, "prompt_id": prompt_id}, broadcast=False)
        pending_subgraph_results = {}
        executed = set()
        execution_list = ExecutionList(dynamic_prompt, caches.outputs)
        current_outputs = caches.outputs.all_node_ids()
        for node_id in list(execute_outputs):
            execution_list.add_node(node_id)

        while not execution_list.is_empty():
            node_id, error, ex = execution_list.stage_node_execution()
            if error is not None:
                handle_execution_error(server, prompt_id, dynamic_prompt.original_prompt, current_outputs, executed,
                                       error, ex)
                break
            if "type" in prompt[node_id]["inputs"] and prompt[node_id]["inputs"]["type"] in ["IMAGE", "LATENT"]:
                logging.info("node : {} {} image_count => {}".format(node_id, prompt[node_id]["class_type"],
                                                                  len(prompt[node_id]["inputs"]["default"])))
            else:
                logging.info(
                    "node : {} {} {}".format(node_id, prompt[node_id]["class_type"], prompt[node_id]["inputs"]))

            result, error, ex = executes(server, dynamic_prompt, caches, node_id, extra_data, executed,
                                         prompt_id, execution_list, pending_subgraph_results)
            success = result != ExecutionResult.FAILURE
            if result == ExecutionResult.FAILURE:
                handle_execution_error(server, prompt_id, dynamic_prompt.original_prompt, current_outputs, executed,
                                       error, ex)
                break
            elif result == ExecutionResult.PENDING:
                execution_list.unstage_node_execution()
            else:  # result == ExecutionResult.SUCCESS:
                execution_list.complete_node_execution()
        else:
            # Only execute when the while-loop ends without break
            #print("execution_success", prompt_id)
            add_message(server, "execution_success", {"prompt_id": prompt_id}, broadcast=False)

        ui_outputs = {}
        meta_outputs = {}
        all_node_ids = caches.ui.all_node_ids()
        for node_id in all_node_ids:
            ui_info = caches.ui.get(node_id)
            if ui_info is not None:
                ui_outputs[node_id] = ui_info["output"]
                meta_outputs[node_id] = ui_info["meta"]
        history_result = {"outputs": ui_outputs, "meta": meta_outputs,}
        for node_id in history_result["outputs"]:
            for output in history_result["outputs"][node_id]:
                if type(history_result["outputs"][node_id][output]) == torch.Tensor:
                    logging.info("output : {} {} image_count => {}".format(node_id, prompt[node_id]["class_type"],
                                                                         len(history_result["outputs"][node_id][output])))
                elif len(str(history_result["outputs"][node_id][output])) > 100:
                    logging.info("output : {} {} {}".format(node_id, prompt[node_id]["class_type"],
                                                            str(history_result["outputs"][node_id][output])[:100]))
                else:
                    logging.info("output : {} {}".format(node_id, history_result["outputs"][node_id][output]))

        server.last_node_id = None
        """if comfy.model_management.DISABLE_SMART_MEMORY:
            comfy.model_management.unload_all_models()"""
        return history_result


def recursive_delete(workflow, to_delete):
    # workflow_copy = copy.deepcopy(workflow)
    new_delete = []
    for node_id in to_delete:
        for node_id2, node in workflow.items():
            for input_name, input_value in node["inputs"].items():
                if type(input_value) == list:
                    if len(input_value) > 0:
                        if input_value[0] == node_id:
                            new_delete.append(node_id2)
        if node_id in workflow:
            del workflow[node_id]
    if len(new_delete) > 0:
        workflow = recursive_delete(workflow, new_delete)
    return workflow


class Workflow(SaveImage):
    def __init__(self):
        self.logger = Logger()
        self.ws = None

    @classmethod
    def INPUT_TYPES(cls):
        return {

        "hidden": {
            "workflows": ("STRING", {"default": ""})
        }}

    RETURN_TYPES = (
        AnyType("*"), AnyType("*"), AnyType("*"), AnyType("*"), AnyType("*"), AnyType("*"), AnyType("*"), AnyType("*"),
        AnyType("*"), AnyType("*"), AnyType("*"), AnyType("*"), AnyType("*"), AnyType("*"), AnyType("*"), AnyType("*"),
    )
    FUNCTION = "generate"
    CATEGORY = "FlowChain ⛓️"

    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(s, workflows, **kworgs):
        m = hashlib.sha256()
        m.update(workflows.encode())
        return m.digest().hex()

    def generate(self, workflows, **kwargs):
        # get current file path

        def get_workflow(workflow_name):
            with urllib.request.urlopen(
                    "http://{}/flowchain/workflow?workflow_path={}".format(server_address, workflow_name)) as response:
                workflow = json.loads(response.read())
            return workflow["workflow"]

        def populate_inputs(workflow, inputs, kwargs_values):
            workflow_inputs = {k: v for k, v in workflow.items() if v["class_type"] == "WorkflowInput"}
            for key, value in workflow_inputs.items():
                if value["inputs"]["Name"] in inputs:
                    if type(inputs[value["inputs"]["Name"]]) == list:
                        if value["inputs"]["Name"] in kwargs_values:
                            workflow[key]["inputs"]["default"] = kwargs_values[value["inputs"]["Name"]]
                    else:
                        workflow[key]["inputs"]["default"] = inputs[value["inputs"]["Name"]]

            workflow_inputs_images = {k: v for k, v in workflow.items() if
                                      v["class_type"] == "WorkflowInput" and v["inputs"]["type"] == "IMAGE"}
            for key, value in workflow_inputs_images.items():
                if "default" not in value["inputs"]:
                    workflow[key]["inputs"]["default"] = torch.tensor([])
                else:
                    if value["inputs"]["default"] == []:
                        workflow[key]["inputs"]["default"] = torch.tensor([])
            return workflow

        def treat_switch(workflow):
            to_delete = []
            #do_net_delete = []
            switch_to_delete = [-1]
            while len(switch_to_delete) > 0:
                switch_nodes = {k: v for k, v in workflow.items() if
                                v["class_type"].startswith("Switch") and v["class_type"].endswith("[Crystools]")}
                # order switch nodes by inputs.boolean value
                switch_to_delete = []
                switch_nodes_copy = copy.deepcopy(switch_nodes)
                for switch_id, switch_node in switch_nodes.items():
                    # create list of inputs who have switch in their inputs
                    """inputs_from_switch = {node_id: node for node_id, node in workflow.items() if any(
                        input_value[0] == switch_id for input_value in node["inputs"].values() if type(input_value) == list)}"""
                    inputs_from_switch = []
                    for node_ids, node in workflow.items():
                        for input_name, input_value in node["inputs"].items():
                            if type(input_value) == list:
                                if len(input_value) > 0:
                                    if input_value[0] == switch_id:
                                        inputs_from_switch.append({node_ids: input_name})
                    # convert to dictionary
                    inputs_from_switch = {k: v for d in inputs_from_switch for k, v in d.items()}
                    switch = switch_nodes_copy[switch_id]
                    for node_id, input_name in inputs_from_switch.items():
                        if type(switch["inputs"]["boolean"]) == list:
                            switch_boolean_value = workflow[switch["inputs"]["boolean"][0]]["inputs"]

                            other_input_name = None
                            if "default" in switch_boolean_value:
                                other_input_name = "default"
                            elif "boolean" in switch_boolean_value:
                                other_input_name = "boolean"

                            if other_input_name is not None:
                                if switch_boolean_value[other_input_name] == True:
                                    if type(switch["inputs"]["on_true"]) == list:
                                        workflow[node_id]["inputs"][input_name] = switch["inputs"]["on_true"]
                                        if node_id in switch_nodes_copy:
                                            switch_nodes_copy[node_id]["inputs"][input_name] = switch["inputs"]["on_true"]
                                    else:
                                        to_delete.append(node_id)
                                else:
                                    if type(switch["inputs"]["on_false"]) == list:
                                        workflow[node_id]["inputs"][input_name] = switch["inputs"]["on_false"]
                                        if node_id in switch_nodes_copy:
                                            switch_nodes_copy[node_id]["inputs"][input_name] = switch["inputs"]["on_false"]
                                    else:
                                        to_delete.append(node_id)
                                switch_to_delete.append(switch_id)
                        else:
                            if switch["inputs"]["boolean"] == True:
                                if type(switch["inputs"]["on_true"]) == list:
                                    workflow[node_id]["inputs"][input_name] = switch["inputs"]["on_true"]
                                    if node_id in switch_nodes_copy:
                                        switch_nodes_copy[node_id]["inputs"][input_name] = switch["inputs"]["on_true"]
                                else:
                                    to_delete.append(node_id)
                            else:
                                if type(switch["inputs"]["on_false"]) == list:
                                    workflow[node_id]["inputs"][input_name] = switch["inputs"]["on_false"]
                                    if node_id in switch_nodes_copy:
                                        switch_nodes_copy[node_id]["inputs"][input_name] = switch["inputs"]["on_false"]
                                else:
                                    to_delete.append(node_id)
                            switch_to_delete.append(switch_id)
                print(switch_to_delete)
                workflow = {k: v for k, v in workflow.items() if
                            not (v["class_type"].startswith("Switch") and v["class_type"].endswith(
                                "[Crystools]") and k in switch_to_delete)}

            return workflow, to_delete

        def treat_continue(workflow):
            to_delete = []
            continue_nodes = {k: v for k, v in workflow.items() if
                              v["class_type"].startswith("WorkflowContinue")}
            do_net_delete = []
            for continue_node_id, continue_node in continue_nodes.items():
                for node_id, node in workflow.items():
                    for input_name, input_value in node["inputs"].items():
                        if type(input_value) == list:
                            if len(input_value) > 0:
                                if input_value[0] == continue_node_id:
                                    if type(continue_node["inputs"]["continue_workflow"]) == list:
                                        input_other_node = \
                                            workflow[continue_node["inputs"]["continue_workflow"][0]][
                                                "inputs"]
                                        other_input_name = None
                                        if "default" in input_other_node:
                                            other_input_name = "default"
                                        elif "boolean" in input_other_node:
                                            other_input_name = "boolean"

                                        if other_input_name is not None:
                                            if input_other_node[other_input_name]:
                                                workflow[node_id]["inputs"][input_name] = continue_node["inputs"]["input"]
                                            else:
                                                to_delete.append(node_id)
                                        else:
                                            do_net_delete.append(continue_node_id)
                                    else:
                                        if continue_node["inputs"]["continue_workflow"]:
                                            workflow[node_id]["inputs"][input_name] = continue_node["inputs"]["input"]
                                        else:
                                            to_delete.append(node_id)

            workflow = {k: v for k, v in workflow.items() if
                                    not (v["class_type"].startswith("WorkflowContinue") and k not in do_net_delete)}
            return workflow, to_delete

        def redefine_id(subworkflow, max_id):
            new_sub_workflow = {}

            for k, v in subworkflow.items():
                max_id += 1
                new_sub_workflow[str(max_id)] = v
                # replace old id by new id items in inputs of workflow
                for node_id, node in subworkflow.items():
                    for input_name, input_value in node["inputs"].items():
                        if type(input_value) == list:
                            if len(input_value) > 0:
                                if input_value[0] == k:
                                    subworkflow[node_id]["inputs"][input_name][0] = str(max_id)
                for node_id, node in new_sub_workflow.items():
                    for input_name, input_value in node["inputs"].items():
                        if type(input_value) == list:
                            if len(input_value) > 0:
                                if input_value[0] == k:
                                    new_sub_workflow[node_id]["inputs"][input_name][0] = str(max_id)
            return new_sub_workflow, max_id

        def change_subnode(subworkflow, node_id_to_find, value):
            for node_id, node in subworkflow.items():
                for input_name, input_value in node["inputs"].items():
                    if type(input_value) == list:
                        if len(input_value) > 0:
                            if input_value[0] == node_id_to_find:
                                subworkflow[node_id]["inputs"][input_name] = value

            return subworkflow

        def merge_inputs_outputs(workflow, workflow_name, subworkflow, workflow_outputs):
            # get max workflow id
            # coinvert workflow_outputs to list
            workflow_outputs = list(workflow_outputs.values())
            workflow_node = {"node": {"id":k, **v} for k, v in workflow.items() if v["class_type"] == "Workflow" and v["inputs"]["workflows"] == workflow_name}
            sub_input_nodes = {k: v for k, v in subworkflow.items() if v["class_type"] == "WorkflowInput"}
            do_not_delete = []
            for sub_id, sub_node in sub_input_nodes.items():
                if sub_node["inputs"]["Name"] in workflow_node["node"]["inputs"]:
                    value = workflow_node["node"]["inputs"][sub_node["inputs"]["Name"]]
                    if type(value) == list:
                        subworkflow = change_subnode(subworkflow, sub_id, value)
                    else:
                        subworkflow[sub_id]["inputs"]["default"] = value
                        do_not_delete.append(sub_id)

            # remove input node
            subworkflow = {k: v for k, v in subworkflow.items() if not (v["class_type"] == "WorkflowInput" and k not in do_not_delete)}

            sub_output_nodes = {k: v for k, v in subworkflow.items() if v["class_type"] == "WorkflowOutput"}
            workflow_copy = copy.deepcopy(workflow)
            for node_id, node in workflow_copy.items():
                for input_name, input_value in node["inputs"].items():
                    if type(input_value) == list:
                        if len(input_value) > 0:
                            if input_value[0] == workflow_node["node"]["id"]:
                                for sub_output_id, sub_output_node in sub_output_nodes.items():
                                    if sub_output_node["inputs"]["Name"] == workflow_outputs[input_value[1]]["inputs"]["Name"]:
                                        workflow[node_id]["inputs"][input_name] = sub_output_node["inputs"]["default"]

            # remove output node
            subworkflow = {k: v for k, v in subworkflow.items() if not (v["class_type"] == "WorkflowOutput")}

            return workflow, subworkflow

        def clean_workflow(workflow, inputs=None, kwargs_values=None):
            if kwargs_values is None:
                kwargs_values = {}
            if inputs is None:
                inputs = {}
            if inputs is not None:
                workflow = populate_inputs(workflow, inputs, kwargs_values)

            workflow_outputs = {k: v for k, v in workflow.items() if v["class_type"] == "WorkflowOutput"}

            for output_id, output_node in workflow_outputs.items():
                workflow[output_id]["inputs"]["ui"] = False

            workflow, switch_to_delete = treat_switch(workflow)
            workflow, continue_to_delete = treat_continue(workflow)
            workflow = recursive_delete(workflow, switch_to_delete + continue_to_delete)
            return workflow, workflow_outputs

        def get_recursive_workflow(workflows, max_id=0):
            workflow = get_workflow(workflows)
            workflow, max_id = redefine_id(workflow, max_id)
            sub_workflows = {k: v for k, v in workflow.items() if v["class_type"] == "Workflow"}
            for key, sub_workflow_node in sub_workflows.items():
                workflow_name = sub_workflow_node["inputs"]["workflows"]
                subworkflow, max_id = get_recursive_workflow(workflow_name, max_id)

                #subworkflow = get_workflow(workflow_name)
                #max_id = max([int(k) for k in workflow.keys() if k.isdigit()])

                # change all id in subworkflow
                #subworkflow = redefine_id(subworkflow["workflow"], max_id)
                workflow_outputs_sub = {k: v for k, v in subworkflow.items() if v["class_type"] == "WorkflowOutput"}
                workflow, subworkflow = merge_inputs_outputs(workflow, workflow_name, subworkflow, workflow_outputs_sub)
                # sub_workflow, workflow_outputs_sub = treat_workflow(subworkflow)
                workflow = {k: v for k, v in workflow.items() if
                            not (v["class_type"] == "Workflow" and v["inputs"]["workflows"] == workflow_name)}
                # add subworkflow to workflow
                workflow.update(subworkflow)
            return workflow, max_id

        with urllib.request.urlopen("http://{}/queue".format(server_address)) as response:
            queue_info = json.loads(response.read())

        original_inputs = [v["inputs"] for k, v in queue_info["queue_running"][0][2].items() if
                           "workflows" in v["inputs"] and v["inputs"]["workflows"] == workflows][0]

        workflow, _ = get_recursive_workflow(workflows, 5000)
        workflow, workflow_outputs = clean_workflow(workflow, original_inputs, kwargs)
        workflow_outputs_id = [k for k, v in workflow.items() if v["class_type"] == "WorkflowOutput"]

        prompt_id = str(uuid.uuid4())
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        servers = server.PromptServer(loop)

        servers.last_prompt_id = prompt_id
        servers.client_id = client_id
        execution_start_time = time.perf_counter()
        logging.info("workflow : {}".format(workflows))
        history_result = execute(servers, workflow, prompt_id, {}, workflow_outputs_id)
        current_time = time.perf_counter()
        execution_time = current_time - execution_start_time
        logging.info("Prompt executed in {:.2f} seconds".format(execution_time))
        comfy.model_management.unload_all_models()
        del servers
        gc.collect()

        output = []
        for id_node, node in workflow_outputs.items():
            if id_node in history_result["outputs"]:
                mask = history_result["outputs"][id_node]["default"]
                # create hash from mask + node name
                """hash = hashlib.sha256(mask
                hash = hash.update(node["inputs"]["Name"].encode())
                filename_prefix = node["inputs"]["Name"]+"/"+hash
                if node["inputs"]["type"] == "IMAGE":
                    self.save_images(history_result["outputs"][id_node]["default"], filename_prefix)
                elif node["inputs"]["type"] == "MASK":
                    preview = mask.reshape((-1, 1, mask.shape[-2], mask.shape[-1])).movedim(1, -1).expand(-1, -1, -1, 3)
                    self.save_images(preview, filename_prefix)"""
                output.append(history_result["outputs"][id_node]["default"])
            else:
                if node["inputs"]["type"] == "IMAGE" or node["inputs"]["type"] == "MASK":
                    black_image_np = np.zeros((255, 255, 3), dtype=np.uint8)
                    black_image_pil = Image.fromarray(black_image_np)
                    transform = transforms.ToTensor()
                    image_tensor = transform(black_image_pil)
                    image_tensor = image_tensor.permute(1, 2, 0)
                    image_tensor = image_tensor.unsqueeze(0)
                    output.append(image_tensor)
                else:
                    output.append(None)

        return tuple(output)
        # return tuple(queue[uid]["outputs"])


NODE_CLASS_MAPPINGS_WORKFLOW = {
    "Workflow": Workflow,
}

NODE_DISPLAY_NAME_MAPPINGS_WORKFLOW = {
    "Workflow": "Workflow (FlowChain ⛓️)",
}
