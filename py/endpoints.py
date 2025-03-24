import server
from aiohttp import web
import os
import json
import folder_paths
from app.user_manager import UserManager


@server.PromptServer.instance.routes.get("/flowchain/workflows")
async def workflows(request):
    user = UserManager().get_request_user_id(request)
    json_path = folder_paths.user_directory + "/" + user + "/workflows/"
    result = {}

    # Vérifier si le répertoire principal existe
    if os.path.exists(json_path):
        # Utiliser os.walk pour parcourir récursivement tous les sous-répertoires
        for root, dirs, files in os.walk(json_path):
            for file in files:
                # Ne traiter que les fichiers JSON
                if file.lower().endswith('.json'):
                    file_path = os.path.join(root, file)
                    try:

                        with open(file_path, "r", encoding="utf-8") as f:
                            json_content = json.load(f)

                        nodes_input = {}
                        nodes_output = {}


                        # Vérifier le format du workflow (API ou standard)
                        if "nodes" in json_content:
                            # Format standard (non-API)
                            is_standard_format = True

                            # Extraire les nœuds WorkflowInput et WorkflowOutput
                            for node in json_content["nodes"]:
                                if node.get("type") == "WorkflowInput":
                                    # Convertir au format compatible pour le client
                                    node_id = str(node.get("id", "unknown"))
                                    nodes_input[node_id] = {
                                        "class_type": "WorkflowInput",
                                        "inputs": node.get("widgets_values", {})
                                    }
                                elif node.get("type") == "WorkflowOutput":
                                    node_id = str(node.get("id", "unknown"))
                                    nodes_output[node_id] = {
                                        "class_type": "WorkflowOutput",
                                        "inputs": node.get("widgets_values", {})
                                    }
                        else:
                            # Format API
                            nodes_input = {k: v for k, v in json_content.items() if
                                           v.get("class_type") == "WorkflowInput"}
                            nodes_output = {k: v for k, v in json_content.items() if
                                            v.get("class_type") == "WorkflowOutput"}

                        # Ajouter au résultat seulement si le fichier contient des nœuds WorkflowInput ou WorkflowOutput
                        if nodes_input or nodes_output:
                            # Créer une clé unique basée sur le chemin relatif
                            relative_path = os.path.relpath(file_path, json_path)
                            result[relative_path] = {"inputs": nodes_input,
                                                     "outputs": nodes_output,
                                                     'workflow': json_content}
                    except json.JSONDecodeError:
                        # Ignorer les fichiers JSON mal formés
                        print(f"Ignoring malformed JSON file: {file_path}")
                    except Exception as e:
                        print(f"Error processing {file_path}: {str(e)}")
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
        file_name = json_path[-1]
        json_path = folder_paths.user_directory + "/" + user + "/workflows/" + unversal_path

    if os.path.exists(json_path):
        with open(json_path, "r", encoding="utf-8") as f:
            json_content = json.load(f)

        nodes_input = {}
        nodes_output = {}

        # Vérifier le format du workflow (API ou standard)
        if "nodes" in json_content:
            # Extraire les nœuds WorkflowInput et WorkflowOutput
            for node in json_content["nodes"]:
                if node.get("type") == "WorkflowInput":
                    # Convertir au format compatible pour le client
                    node_id = str(node.get("id", "unknown"))
                    nodes_input[node_id] = {
                        "class_type": "WorkflowInput",
                        "inputs": node.get("widgets_values", {})
                    }
                elif node.get("type") == "WorkflowOutput":
                    node_id = str(node.get("id", "unknown"))
                    nodes_output[node_id] = {
                        "class_type": "WorkflowOutput",
                        "inputs": node.get("widgets_values", {})
                    }
        else:
            # Format API
            nodes_input = {k: v for k, v in json_content.items() if
                           v.get("class_type") == "WorkflowInput"}
            nodes_output = {k: v for k, v in json_content.items() if
                            v.get("class_type") == "WorkflowOutput"}

        # Ajouter au résultat seulement si le fichier contient des nœuds WorkflowInput ou WorkflowOutput
        if nodes_input or nodes_output:
            result = {"inputs": nodes_input,
                     "outputs": nodes_output,
                     'workflow': json_content}
    else:
        result = {"error": "File not found"}

    return web.json_response(result, content_type='application/json')

