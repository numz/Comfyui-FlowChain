import { chainCallback, fitHeight } from "./utils.js";
import { addInputs, cleanInputs, removeInputs } from "./inputs.js";
import { importWorkflow } from "./workflows.js";
import { addOutputs } from "./inputs.js";
import { hideWidget } from "./widgets.js";

function initialisation(node) {
    const workflow_reload = node.title.startsWith("Workflow: ")?true:false;
    node.widgets[0].options.values = ["None", ...Object.keys(app.lipsync_studio)]
    node.widgets[0].callback =  ( value ) => {
        cleanInputs(node);
        if (value == "None"){
            node.title = "Workflow (FlowChain ⛓️)";
        }else{
            node.widgets[1].value = importWorkflow(node, value, app);
            const inputs = app.lipsync_studio[value].inputs;
            addInputs(node, inputs, {}, true);
            addOutputs(node, value);
            fitHeight(node);
        }
    };
    if (!workflow_reload){
        node.widgets[0].value = "None";
        node.widgets[1].value = "";
    }
    hideWidget(node, node.widgets[1], { holdSpace: false })
    cleanInputs(node);
    node.color = "#004670";
    node.bgcolor = "#002942";
}

function configure(info) {
    if (info.widgets_values[0] != "None"){
        const inputs = app.lipsync_studio[info.widgets_values[0]].inputs;

        addInputs(this, inputs, info.widgets_values);
        addOutputs(this, info.widgets_values[0]);
        removeInputs(this, inputs, info.widgets_values);
        fitHeight(this);
        importWorkflow(this, info.widgets_values[0], app)
            .then(data => {
                if (data){
                    this.widgets[1].value = data;
                    const inputs = app.lipsync_studio[info.widgets_values[0]].inputs;

                    addInputs(this, inputs, info.widgets_values);
                    addOutputs(this, info.widgets_values[0]);
                    removeInputs(this, inputs, info.widgets_values);
                    fitHeight(this);
                }
            })
            .catch(error => {
                console.error('Erreur lors de l\'importation:', error);
            });
    }
}

function serialize(info) {
    for (let inp of this.inputs){
        if (inp.widget){
            if (inp.type != this.local_input_defs.required[inp.name][0])
                inp.type = this.local_input_defs.required[inp.name][0];
        }
    }
    if(this.widgets[0].options.values == "COMBO"){
        this.widgets[0].options.values = ["None", ...Object.keys(app.lipsync_studio)];
    }
}

export function setupWorkflowNode(nodeType, nodeData, app) {
    nodeType.prototype.onNodeCreated =  function() {
        chainCallback(this, "onConfigure", configure);
        chainCallback(this, "onSerialize", serialize);
        initialisation(this);
    }
}