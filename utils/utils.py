import os
import shutil
import subprocess


def ffmpeg_suitability(path):
    try:
        version = subprocess.run([path, "-version"], check=True,
                                 capture_output=True).stdout.decode("utf-8")
    except:
        return 0
    score = 0
    # rough layout of the importance of various features
    simple_criterion = [("libvpx", 20), ("264", 10), ("265", 3),
                        ("svtav1", 5), ("libopus", 1)]
    for criterion in simple_criterion:
        if version.find(criterion[0]) >= 0:
            score += criterion[1]
    # obtain rough compile year from copyright information
    copyright_index = version.find('2000-2')
    if copyright_index >= 0:
        copyright_year = version[copyright_index + 6:copyright_index + 9]
        if copyright_year.isnumeric():
            score += int(copyright_year)
    return score


if "VHS_FORCE_FFMPEG_PATH" in os.environ:
    ffmpeg_path = os.environ.get("VHS_FORCE_FFMPEG_PATH")
else:
    ffmpeg_paths = []
    try:
        from imageio_ffmpeg import get_ffmpeg_exe

        imageio_ffmpeg_path = get_ffmpeg_exe()
        ffmpeg_paths.append(imageio_ffmpeg_path)
    except:
        if "VHS_USE_IMAGEIO_FFMPEG" in os.environ:
            raise

    if "VHS_USE_IMAGEIO_FFMPEG" in os.environ:
        ffmpeg_path = imageio_ffmpeg_path
    else:
        system_ffmpeg = shutil.which("ffmpeg")
        if system_ffmpeg is not None:
            ffmpeg_paths.append(system_ffmpeg)
        if os.path.isfile("ffmpeg"):
            ffmpeg_paths.append(os.path.abspath("ffmpeg"))
        if os.path.isfile("ffmpeg.exe"):
            ffmpeg_paths.append(os.path.abspath("ffmpeg.exe"))
        if len(ffmpeg_paths) == 0:

            ffmpeg_path = None
        elif len(ffmpeg_paths) == 1:
            # Evaluation of suitability isn't required, can take sole option
            # to reduce startup time
            ffmpeg_path = ffmpeg_paths[0]
        else:
            ffmpeg_path = max(ffmpeg_paths, key=ffmpeg_suitability)


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
        if node.get("mode") in [2, 3]:
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