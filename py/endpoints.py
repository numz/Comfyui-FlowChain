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

    original_path = request.query.get("workflow_path")
    unversal_path = original_path.replace("\\", "/")
    json_path = unversal_path.split("/")
    if ".json" in json_path[-1]:
        file_name = json_path[-1]
        json_path = folder_paths.user_directory + "/" + user + "/workflows/" + unversal_path

    if os.path.exists(json_path):
        with open(json_path, "r", encoding="utf-8") as f:
            json_content = json.load(f)
        err = "none"
        """
        if "nodes" in json_content:
            try:
                api_workflow = convert_standard_to_api_format(json_content)
                if api_workflow:
                    json_content = api_workflow
                    # Conservons la référence au workflow original si nécessaire
                    # json_content["_original_standard_format"] = True
                else:
                    err = "Échec de la conversion du workflow standard en format API"
            except Exception as e:
                err = f"Erreur lors de la conversion: {str(e)}"
        """
        result = {"error": err, "workflow": json_content, "file_name": file_name}
    else:
        result = {"error": "File not found"}

    return web.json_response(result, content_type='application/json')


def convert_standard_to_api_format(standard_workflow):
    """
    Convertit un workflow au format standard en format API de manière similaire à graphToPrompt
    """
    # Vérifier si c'est un workflow valide
    if not standard_workflow or "nodes" not in standard_workflow or not isinstance(standard_workflow["nodes"], list):
        print("Format de workflow invalide")
        return None
    
    # Créer une structure pour retrouver les nœuds par ID
    nodes_by_id = {node["id"]: node for node in standard_workflow["nodes"]}
    
    # Créer une map des liens
    links_by_id = {}
    if "links" in standard_workflow and isinstance(standard_workflow["links"], list):
        for link in standard_workflow["links"]:
            # Format du lien: [id, origin_node, origin_slot, target_node, target_slot, type]
            if len(link) >= 5:
                links_by_id[link[0]] = {
                    "id": link[0],
                    "origin_id": link[1],
                    "origin_slot": link[2],
                    "target_id": link[3],
                    "target_slot": link[4],
                    "type": link[5] if len(link) > 5 else None
                }
    
    # Map des liens par cible (nœud + slot)
    links_by_target = {}
    for link_id, link in links_by_id.items():
        key = f"{link['target_id']}-{link['target_slot']}"
        links_by_target[key] = link
    
    # Résultat au format API
    api_format = {}
    
    # Obtenir un ordre d'exécution approximatif (simplifié)
    # Remarque: c'est une simplification, le vrai ordre d'exécution est plus complexe
    execution_order = simulate_execution_order(standard_workflow)
    
    # Traiter les nœuds selon l'ordre d'exécution simulé
    for node_id in execution_order:
        node = nodes_by_id.get(node_id)
        if not node:
            continue
        
        # Ignorer les nœuds désactivés (mode NEVER ou BYPASS) - similaire à LGraphEventMode
        # Le mode 2 correspond généralement à NEVER, le mode 3 à BYPASS dans LiteGraph
        if node.get("mode") in [2, 4]:
            continue
        
        # Initialiser le nœud au format API
        api_node = {
            "inputs": {},
            "class_type": node.get("type", ""),
            "_meta": {
                "title": node.get("title", node.get("type", ""))
            }
        }
        
        # Traiter les widgets (valeurs des paramètres)
        if "widgets_values" in node:
            # Si c'est un tableau (ancien format)
            if isinstance(node["widgets_values"], list):
                # Associer chaque valeur à son nom si disponible
                if "widgets" in node and isinstance(node["widgets"], list):
                    for i, widget in enumerate(node["widgets"]):
                        if i < len(node["widgets_values"]) and "name" in widget:
                            api_node["inputs"][widget["name"]] = node["widgets_values"][i]
            # Si c'est un objet (format plus récent)
            elif isinstance(node["widgets_values"], dict):
                for name, value in node["widgets_values"].items():
                    # Si la valeur a une structure spécifique avec une propriété "value"
                    if isinstance(value, dict) and "value" in value:
                        api_node["inputs"][name] = value["value"]
                    else:
                        api_node["inputs"][name] = value
        
        # Traiter les connexions d'entrée
        if "inputs" in node and isinstance(node["inputs"], list):
            for slot_index, input_data in enumerate(node["inputs"]):
                if not input_data:
                    continue
                
                input_name = input_data.get("name", f"input_{slot_index}")
                
                # Vérifier si cette entrée a un lien
                if "link" in input_data and input_data["link"] is not None:
                    link = links_by_id.get(input_data["link"])
                    if link:
                        # Suivre les redirections (nœuds en bypass)
                        origin_id, origin_slot = trace_link_through_bypasses(
                            link["origin_id"], 
                            link["origin_slot"], 
                            nodes_by_id, 
                            links_by_id
                        )
                        
                        if origin_id is not None:
                            # Format API pour une connexion: [node_id, output_slot]
                            api_node["inputs"][input_name] = [str(origin_id), origin_slot]
        
        # Ajouter le nœud au format API
        api_format[str(node_id)] = api_node
    
    # Nettoyer les liens qui pointent vers des nœuds inexistants
    for node_id, node_data in api_format.items():
        inputs_to_remove = []
        
        for input_name, input_value in node_data["inputs"].items():
            if isinstance(input_value, list) and len(input_value) == 2:
                source_node_id = input_value[0]
                if source_node_id not in api_format:
                    inputs_to_remove.append(input_name)
        
        for input_name in inputs_to_remove:
            del node_data["inputs"][input_name]
    
    return api_format


def simulate_execution_order(workflow):
    """
    Simule un ordre d'exécution approximatif des nœuds.
    C'est une simplification de graph.computeExecutionOrder().
    """
    # Fonction simplifiée - dans un vrai graphe, cela serait plus complexe
    # en impliquant une analyse topologique du graphe de dépendances
    
    # On construit un graphe de dépendances
    nodes_by_id = {node["id"]: node for node in workflow["nodes"]}
    dependencies = {node["id"]: set() for node in workflow["nodes"]}
    
    # Trouver les dépendances de chaque nœud
    if "links" in workflow and isinstance(workflow["links"], list):
        for link in workflow["links"]:
            if len(link) >= 5:
                target_id = link[3]  # Le nœud qui reçoit la connexion
                source_id = link[1]  # Le nœud d'origine
                if target_id in dependencies:
                    dependencies[target_id].add(source_id)
    
    # Tri topologique simplifié
    visited = set()
    result = []
    
    def visit(node_id):
        if node_id in visited:
            return
        visited.add(node_id)
        for dep_id in dependencies[node_id]:
            if dep_id in dependencies:  # S'assurer que le nœud existe
                visit(dep_id)
        result.append(node_id)
    
    # Visiter tous les nœuds
    for node_id in dependencies:
        if node_id not in visited:
            visit(node_id)
    
    return result


def trace_link_through_bypasses(origin_id, origin_slot, nodes_by_id, links_by_id):
    """
    Suit une chaîne de nœuds en mode BYPASS pour trouver la source réelle.
    Simule le comportement de la boucle while dans graphToPrompt.
    """
    current_id = origin_id
    current_slot = origin_slot
    
    # Maximum d'itérations pour éviter les boucles infinies
    max_iterations = 100
    iterations = 0
    
    while iterations < max_iterations:
        iterations += 1
        
        parent = nodes_by_id.get(current_id)
        if not parent:
            break
        
        # Si le nœud parent n'est pas en mode BYPASS, on a trouvé la source
        if parent.get("mode") != 3:  # 3 est généralement le mode BYPASS
            return current_id, current_slot
        
        # Chercher le lien d'entrée correspondant pour continuer à remonter
        if "inputs" in parent and isinstance(parent["inputs"], list):
            for i, input_data in enumerate(parent["inputs"]):
                if not input_data or "link" not in input_data:
                    continue
                
                # Vérifier si le type correspond (simplifié)
                # Dans le vrai code, il y a une vérification plus complexe des types
                link = links_by_id.get(input_data["link"])
                if link:
                    # Mise à jour pour la prochaine itération
                    current_id = link["origin_id"]
                    current_slot = link["origin_slot"]
                    break
            else:
                # Aucun lien compatible trouvé
                break
    
    # Si on arrive ici, soit on a atteint le maximum d'itérations,
    # soit on n'a pas trouvé de chemin valide
    return origin_id, origin_slot