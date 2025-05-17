import server
from aiohttp import web
import os
import json
import folder_paths
from app.user_manager import UserManager


def get_workflow_data(workflow_file):
    nodes = {"WorkflowInput": {}, "WorkflowOutput": {}}
    # Extraire les nœuds WorkflowInput et WorkflowOutput
    # print(workflow_file["nodes"]);
    for node in workflow_file["nodes"]:
        
        node_type = node.get("type")
        if node_type in nodes.keys():
            # Convertir au format compatible pour le client
            node_id = str(node.get("id", "unknown"))
            w_values = node.get("widgets_values", [])
            inp = []
            if node_type == "WorkflowInput":
                if len(w_values) < 3:
                    inp = [w_values[0], node.get("inputs",[])[0].get("type", "")]
                    if len(w_values) == 2:
                        inp.append(w_values[1])
                else:
                    inp = w_values

            elif node_type == "WorkflowOutput":
                #print(node.get("outputs",[]))
                #print(w_values)
                if ('Name' in w_values):
                    inp = [w_values['Name']['value'], node.get("outputs",[])[0].get("type", "*")]
                elif len(w_values) < 3:
                    inp = [w_values[0], node.get("outputs",[])[0].get("type", "*")]
                    if len(w_values) == 2:
                        inp.append(w_values[1])
                else:
                    inp = w_values
                #print(inp)
            nodes[node_type][node_id] = {
                "class_type": node_type,
                "inputs": inp
            }
            if type(node.get("pos")) is list:
                nodes[node_type][node_id]["position"] = node["pos"][1]
            else:
                nodes[node_type][node_id]["position"] = node["pos"]['1']
        # sort by position
    nodes_input = dict(sorted(nodes["WorkflowInput"].items(), key=lambda item: item[1]["position"]))
    nodes_output = dict(sorted(nodes["WorkflowOutput"].items(), key=lambda item: item[1]["position"]))
    return {"inputs": nodes_input,
            "outputs": nodes_output,
            'workflow': workflow_file}


@server.PromptServer.instance.routes.get("/flowchain/workflows")
async def workflows(request):
    user = UserManager().get_request_user_id(request)
    json_path = os.path.join(folder_paths.user_directory, user, "workflows")
    result = {}

    # Vérifier si le répertoire principal existe
    if os.path.exists(json_path):
        # Utiliser os.walk pour parcourir récursivement tous les sous-répertoires
        for root, dirs, files in os.walk(str(json_path)):
            for file in files:
                # Ne traiter que les fichiers JSON
                if file.lower().endswith('.json'):
                    file_path = os.path.join(root, file)
                    
                    try:
                        with open(file_path, "r", encoding="utf-8") as f:
                            json_content = json.load(f)
                        print(file_path);
                        relative_path = os.path.relpath(file_path, str(json_path))
                        if "nodes" in json_content:
                            file_conf = get_workflow_data(json_content)
                            if file_conf["inputs"] or file_conf["outputs"]:
                                result[relative_path] = file_conf

                    except json.JSONDecodeError:
                        # Ignorer les fichiers JSON mal formés
                        print(f"Ignoring malformed JSON file: {file_path}")
                    except Exception as e:
                        print(f"Error processing, probably old format: {str(e)}")
    else:
        # Créer le répertoire s'il n'existe pas
        os.makedirs(json_path)
        result["No file in worflows folder"] = {"inputs": {}, "outputs": {}}

    # Si aucun fichier valide n'a été trouvé
    if not result:
        result["No compatible workflow files found"] = {"inputs": {}, "outputs": {}}

    return web.json_response(result, content_type='application/json')


@server.PromptServer.instance.routes.get("/flowchain/workflow")
async def workflow(request):
    user = UserManager().get_request_user_id(request)
    result = {}
    original_path = request.query.get("workflow_path")
    unversal_path = original_path.replace("\\", "/")
    json_path = unversal_path.split("/")
    if ".json" in json_path[-1]:
        # file_name = json_path[-1]
        json_path = folder_paths.user_directory + "/" + user + "/workflows/" + unversal_path

    if os.path.exists(json_path):
        with open(json_path, "r", encoding="utf-8") as f:
            json_content = json.load(f)
        if "nodes" in json_content:
            result = get_workflow_data(json_content)
        else:
            result = {"error": "File not found"}
    else:
        result = {"error": "File not found"}

    return web.json_response(result, content_type='application/json')
