import { app } from "../../../scripts/app.js";
import { api } from '../../../scripts/api.js'

async function convertWorkflowToApiFormat(standardWorkflow) {
    try {
        return new Promise((resolve, reject) => {
            // Sauvegarder les prototypes originaux de onConfigure pour tous les types de nœuds
            const originalCallbacks = new Map();
            
            // Temporairement désactiver tous les callbacks onConfigure
            for (const nodeTypeName in LiteGraph.registered_node_types) {
                const nodeType = LiteGraph.registered_node_types[nodeTypeName];
                if (nodeType.prototype.onConfigure) {
                    originalCallbacks.set(nodeTypeName, nodeType.prototype.onConfigure);
                    nodeType.prototype.onConfigure = function() {}; // Fonction vide
                }
            }
            
            // Sauvegarder l'état des callbacks du graphe principal
            const originalOnConfigure = LGraph.prototype.onConfigure;
            LGraph.prototype.onConfigure = function() {}; // Désactiver temporairement
            
            try {
                // Créer un graph temporaire isolé
                const tempGraph = new LGraph();
                
                // Configurer sans déclencher de callbacks
                tempGraph.configure(standardWorkflow);
                
                // Sauvegarder la référence du graphe original
                const originalGraph = app.graph;
                
                // Utiliser graphToPrompt en mode isolé
                app.graph = tempGraph;
                
                app.graphToPrompt(tempGraph)
                    .then(apiData => {
                        // Restaurer le graphe original
                        app.graph = originalGraph;
                        
                        // Résoudre avec le format API
                        resolve(apiData.output);
                    })
                    .catch(error => {
                        console.error("Erreur lors de la conversion:", error);
                        reject(error);
                    })
                    .finally(() => {
                        // Nettoyer le graphe temporaire
                        tempGraph.clear();
                        
                        // Assurer que toutes les références sont supprimées
                        if (tempGraph._nodes) {
                            while (tempGraph._nodes.length > 0) {
                                tempGraph.remove(tempGraph._nodes[0]);
                            }
                            tempGraph._nodes = null;
                        }
                        
                        // Supprimer les écouteurs d'événements
                        tempGraph.removeAllListeners && tempGraph.removeAllListeners();
                        tempGraph._links = null;
                        
                        // Restaurer tous les callbacks originaux
                        for (const [nodeTypeName, callback] of originalCallbacks.entries()) {
                            LiteGraph.registered_node_types[nodeTypeName].prototype.onConfigure = callback;
                        }
                        
                        // Restaurer le callback du graphe
                        LGraph.prototype.onConfigure = originalOnConfigure;
                        
                        console.log("Conversion terminée et sandbox nettoyée");
                    });
            } catch (error) {
                // En cas d'erreur, restaurer les callbacks et rejeter
                for (const [nodeTypeName, callback] of originalCallbacks.entries()) {
                    LiteGraph.registered_node_types[nodeTypeName].prototype.onConfigure = callback;
                }
                LGraph.prototype.onConfigure = originalOnConfigure;
                
                reject(error);
            }
        });
    } catch (error) {
        console.error("Erreur lors de la préparation du graph:", error);
        throw error;
    }
}

export async function importWorkflow(root_obj, workflow_path, app, nodeData, reset_values=true){
    const filename = workflow_path.replace(/\\/g, '/').split("/");
    root_obj.title = "Workflow: "+filename[filename.length-1].replace(".json", "").replace(/_/g, " ");
    

    return api.fetchApi("/flowchain/workflow?workflow_path="+workflow_path)
        .then(response => response.json())
        .then(async data => {
            //cleanInputs(root_obj,nodeData, reset_values);
            
            let workflow = data.workflow;
            app.lipsync_studio[workflow_path] = data;
            
            // Si c'est un format standard, le convertir en format API
            if ("nodes" in workflow) {
                try {
                    workflow = await convertWorkflowToApiFormat(workflow);
                } catch (error) {
                    console.error("Échec de la conversion du workflow:", error);
                    return false;
                }
            }
            
            if (!workflow) {
                console.error('Workflow invalide ou échec de conversion');
                return false;
            }
            return JSON.stringify(workflow);
        
        })
        .catch(error => {
            console.error('Erreur lors de l\'importation:', error);
            return false;
        });
}