import json
import torch
import uuid
import copy
import os
from enum import Enum
import numpy as np
import hashlib
from torchvision import transforms
from .utils.logger import Logger
import comfy.model_management
from PIL import Image
from nodes import SaveImage
import gc
import folder_paths
from server import PromptServer
from execution import PromptExecutor
from .utils.utils import convert_standard_to_api_format


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


#client_id = '5b49a023-b05a-4c53-8dc9-addc3a749911'
script_list_path = os.path.join(folder_paths.user_directory, "default", "workflows")


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
            "required": {
                "workflows": ("COMBO", {"values": []}),
                "workflow": ("STRING", {"default": ""})
            },
            "optional": {

                # "workflows": ("STRING", {"default": ""}),

            }
        }

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

    def generate(self, workflows, workflow, **kwargs):

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
                    if not value["inputs"]["default"]:
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
            # prendre le premier workflow
            workflow_node = [{"id":k, **v} for k, v in workflow.items() if v["class_type"] == "Workflow" and v["inputs"]["workflows"] == workflow_name][0]
            sub_input_nodes = {k: v for k, v in subworkflow.items() if v["class_type"] == "WorkflowInput"}
            do_not_delete = []
            for sub_id, sub_node in sub_input_nodes.items():
                if sub_node["inputs"]["Name"] in workflow_node["inputs"]:
                    value = workflow_node["inputs"][sub_node["inputs"]["Name"]]
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
                            if input_value[0] == workflow_node["id"]:
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
            # if workflows[-5:] == ".json":
            #    workflow = get_workflow(workflows)
            # else:
            workflow = json.loads(workflows)
            workflow, max_id = redefine_id(workflow, max_id)
            sub_workflows = {k: v for k, v in workflow.items() if v["class_type"] == "Workflow"}
            for key, sub_workflow_node in sub_workflows.items():
                workflow_json = sub_workflow_node["inputs"]["workflow"]
                workflow_name = sub_workflow_node["inputs"]["workflows"]
                subworkflow, max_id = get_recursive_workflow(workflow_json, max_id)

                workflow_outputs_sub = {k: v for k, v in subworkflow.items() if v["class_type"] == "WorkflowOutput"}
                workflow, subworkflow = merge_inputs_outputs(workflow, workflow_name, subworkflow, workflow_outputs_sub)
                workflow = {k: v for k, v in workflow.items() if k != key}
                # add subworkflow to workflow
                workflow.update(subworkflow)
            return workflow, max_id
        
        server_instance = PromptServer.instance
        client_id = server_instance.client_id
        if server_instance and hasattr(server_instance, 'prompt_queue'):
            current_queue = server_instance.prompt_queue.get_current_queue()
            queue_info = {
                'queue_running': current_queue[0],
                'queue_pending': current_queue[1]
            }
            
            # Now you can access the original inputs as before
            queue_to_use = queue_info["queue_running"]
            original_inputs = [v["inputs"] for k, v in queue_to_use[0][2].items() if
                            "workflows" in v["inputs"] and v["inputs"]["workflows"] == workflows][0]

        else:
            # Fallback to empty inputs if server instance not available
            original_inputs = {}
        
        workflow, _ = get_recursive_workflow(workflow, 5000)
        workflow, workflow_outputs = clean_workflow(workflow, original_inputs, kwargs)
        workflow_outputs_id = [k for k, v in workflow.items() if v["class_type"] == "WorkflowOutput"]

        prompt_id = str(uuid.uuid4())

        class SimpleServer:
            def __init__(self):
                self.client_id = client_id
                self.last_node_id = None
                self.last_prompt_id = prompt_id

            def send_sync(self, *args, **kwargs):
                pass  # No-op implementation
            
        simple_server = SimpleServer()
        executor = PromptExecutor(simple_server)
        executor.execute(workflow, prompt_id, {"client_id": client_id}, workflow_outputs_id)

        history_result = executor.history_result
        comfy.model_management.unload_all_models()
        gc.collect()

        output = []
        for id_node, node in workflow_outputs.items():
            if id_node in history_result["outputs"]:
                result_value = history_result["outputs"][id_node]["default"]
                # Apply formatting based on the expected output type
                # formatted_value = format_output_value(result_value, node["inputs"]["type"])
                output.append(result_value[0])
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
