import { app } from "../../../scripts/app.js";
import { api } from '../../../scripts/api.js'
import { setupWorkflowNode } from './workflow.js';
import { setupInputNode } from "./input.js";
import { setupContinueNode } from "./continue.js";
import { setupOutputNode } from "./output.js";
import { setupLipSyncNode } from "./lipSync.js";

app.registerExtension({
	name: "FlowChain.jsnodes",
	async beforeRegisterNodeDef(nodeType, nodeData, app) {
		if(!nodeData?.category?.startsWith("FlowChain")) {
		    return;
		}
		switch (nodeData.name) {
			case "Workflow":
                setupWorkflowNode(nodeType, nodeData, app);
			    break;
			case "WorkflowInput":
			    setupInputNode(nodeType, nodeData, app);
			    break;
			case "WorkflowContinue":
                setupContinueNode(nodeType, nodeData, app);
			    break;
			case "WorkflowOutput":
                setupOutputNode(nodeType, nodeData, app);
			    break;
			case "WorkflowLipSync":
                setupLipSyncNode(nodeType, nodeData, app);
			    break;
    	}
    },
    async init(app) {
        api.fetchApi("/flowchain/workflows")
            .then(response => response.json())
            .then(data => {
                app.lipsync_studio = data
            })
            .catch(error => {
                console.error('Error:', error);
                throw error;
            });


        const origRemoveNode = LGraphCanvas.prototype.removeNode;
        LGraphCanvas.prototype.removeNode = function(node) {
            if (node && node.inputs && node.outputs) {
                // Assurer que tous les liens sont déconnectés avant de supprimer le nœud
                for (let i = 0; i < node.inputs.length; i++) {
                    const input = node.inputs[i];
                    if (input.link != null) {
                        this.graph.removeLink(input.link);
                    }
                }
                for (let i = 0; i < node.outputs.length; i++) {
                    const output = node.outputs[i];
                    if (output.links && output.links.length) {
                        const links = output.links.slice(); // Copier pour éviter les problèmes lors de la modification
                        for (const linkId of links) {
                            this.graph.removeLink(linkId);
                        }
                    }
                }
            }
            // Appeler la méthode originale
            return origRemoveNode.call(this, node);
        };
    }
});