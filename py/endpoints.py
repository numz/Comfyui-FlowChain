import sys
import uuid

import server
from aiohttp import web
import shutil
import os
import subprocess
import json
import urllib.request
import copy
import folder_paths
from app.user_manager import UserManager
import multiprocessing as mp
import time
import queue
from multiprocessing import Process, Queue
import websocket
from nacl import hashlib

client_id = '5b49a023-b05a-4c53-8dc9-addc3a749911'
server_address = "127.0.0.1:8188"


@server.PromptServer.instance.routes.get("/flowchain/workflows")
async def workflows(request):
    user = UserManager().get_request_user_id(request)
    json_path = folder_paths.user_directory + "/" + user + "/workflows/api/"
    result = {}
    if os.path.exists(json_path):
        files = os.listdir(json_path)
        for idx, file in enumerate(files):
            with open(json_path + file, "r", encoding="utf-8") as f:
                json_content = json.load(f)
            nodes_input = {k: v for k, v in json_content.items() if v["class_type"] == "WorkflowInput"}
            nodes_output = {k: v for k, v in json_content.items() if v["class_type"] == "WorkflowOutput"}
            result[file] = {"inputs": nodes_input, "outputs": nodes_output}
    else:
        os.makedirs(json_path)
        result["No file in worflows/api folder"] = {"inputs": {}, "outputs": {}}
    if result == {}:
        result["No file in worflows/api folder"] = {"inputs": {}, "outputs": {}}
    return web.json_response(result, content_type='application/json')


@server.PromptServer.instance.routes.get("/flowchain/workflow")
async def workflow(request):
    user = UserManager().get_request_user_id(request)

    original_path = request.query.get("workflow_path")
    json_path = original_path.replace("\\", "/").split("/")
    if ".json" in json_path[0]:
        file_name = json_path[0]
        json_path = folder_paths.user_directory + "/" + user + "/workflows/api/" + file_name
    else:
        file_name = json_path[-1]
        json_path = folder_paths.user_directory + "/" + user + "/workflows/api/" + file_name
        if os.path.exists(original_path):
            shutil.copy(original_path, json_path)
    if os.path.exists(json_path):
        with open(json_path, "r", encoding="utf-8") as f:
            json_content = json.load(f)
        err = "none"
        if "nodes" in json_content:
            err = "Not a Json API format workflow"
        result = {"error": err, "workflow": json_content, "file_name": file_name}
    else:
        result = {"error": "File not found"}

    return web.json_response(result, content_type='application/json')


"""
def generate(workflow_path, kwargs):
    workflow = json.load(open(workflow_path, "r", encoding="utf-8"))
    outputs = get_outputs(workflow)
    workflow_optimized = copy.deepcopy(workflow)
    for idx, field in enumerate(kwargs):
        for node_id, node in workflow.items():
            if "input_" + field["name"] in node["_meta"]["title"]:
                # get first key of workflow[node_id]["inputs"]
                key = list(workflow[node_id]["inputs"].keys())[0]
                workflow[node_id]["inputs"][key] = field["value"]

    boolean_values = []
    for node_id, node in workflow.items():
        if "boolean" in node["inputs"] and "input_" in node["_meta"]["title"]:
            boolean_values.append((node_id, node["inputs"]["boolean"]))

    for node_id, active in boolean_values:
        for node_id2, value2 in workflow_optimized.items():
            if "boolean" in value2["inputs"] and (
                    "on_true" in value2["inputs"] or "on_false" in value2["inputs"]):
                if node_id2 in workflow:

                    if workflow[node_id2]["inputs"]["boolean"] == [node_id, 0]:
                        input_to_replace = None
                        if active:
                            if "on_true" in value2["inputs"]:
                                input_to_replace = workflow[node_id2]["inputs"]["on_true"]
                        else:
                            if "on_false" in value2["inputs"]:
                                input_to_replace = workflow[node_id2]["inputs"]["on_false"]
                        worflow_value_to_change = []
                        for key3, value3 in workflow.items():
                            for k, v in value3["inputs"].items():
                                if v == [node_id2, 0]:
                                    worflow_value_to_change.append((key3, k))
                                    # workflow[key3]["inputs"][k] = input_to_replace
                        for key3, k in worflow_value_to_change:
                            if input_to_replace:
                                workflow[key3]["inputs"][k] = input_to_replace
                            else:
                                del workflow[key3]["inputs"][k]
                        del workflow[node_id2]

    boolean_values = []
    for node_id, value in workflow.items():
        if value["class_type"] == "Continue Workflow":
            boolean_values.append((node_id, value["inputs"]["boolean"], value["inputs"]["line"]))

    for node_id, active, line in boolean_values:
        for node_id2, value2 in workflow_optimized.items():
            worflow_value_to_change = []
            for inp, val in value2["inputs"].items():
                if val == [node_id, 0]:
                    if type(active) == list:
                        continue_workflow = workflow_optimized[active[0]]['inputs']['boolean']
                    else:
                        continue_workflow = active
                    if continue_workflow:
                        worflow_value_to_change.append((node_id2, inp, line))
                    else:
                        worflow_value_to_change.append((node_id2, inp, None))

            for key3, k, line2 in worflow_value_to_change:
                if line2:
                    workflow[key3]["inputs"][k] = line2
                else:
                    del workflow[key3]["inputs"][k]
    queue_prompt(workflow, outputs)
    return True

def get_history(prompt_id):
    with urllib.request.urlopen("http://{}/history/{}".format(server_address, prompt_id)) as response:
        return json.loads(response.read())


def get_outputs(workflow):
    output_images_path = []
    for node_id, node in workflow.items():
        if "output_" in node["_meta"]["title"]:
            output_images_path.append(node["_meta"]["title"])
    return output_images_path


def queue_prompt(prompt, outputs):
    root_folder = os.path.dirname(__file__)
    if not os.path.exists(root_folder + "/../queue"):
        os.makedirs(root_folder + "/../queue")

    queues = {}
    if os.path.exists(root_folder + "/../queue/queue.json"):
        queues = json.loads(open(root_folder + "/../queue/queue.json", "r", encoding="utf-8").read())

    uid = str(uuid.uuid4())

    queues[uid] = {"prompt": prompt, "client_id": client_id, "output_fields": outputs, "status": {"completed": "false"}}
    print(uid)
    with open(root_folder + "/../queue/queue.json", "w", encoding="utf-8") as f:
        json.dump(queues, f)
    time.sleep(0.5)
    commands = [sys.executable, root_folder + "/../queue/queue.py", uid]
    try:
        subprocess.Popen(commands, stderr=subprocess.PIPE)
        return True
    except subprocess.CalledProcessError as exception:
        print(exception.stderr.decode().strip(), __name__.upper())
        return False
"""
