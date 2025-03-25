import { chainCallback, fitHeight } from "./utils.js";
import { addInputs, cleanInputs, removeInputs } from "./inputs.js";
import { importWorkflow } from "./workflows.js";
import { addOutputs } from "./inputs.js";
import { hideWidget } from "./widgets.js";

export function setupWorkflowNode(nodeType, nodeData, app) {
    nodeType.prototype.onNodeCreated =  function() {
        chainCallback(this, "onConfigure", function(info) {
            if (info.widgets_values[0] != "None"){
                const inputs = app.lipsync_studio[info.widgets_values[0]].inputs;
                
                addInputs(this, inputs, info.widgets_values);
                addOutputs(this, info.widgets_values[0]);
                removeInputs(this, inputs, info.widgets_values);
                fitHeight(this);
                importWorkflow(this, info.widgets_values[0], app, nodeData)
                    .then(data => {
                        if (data){
                            this.widgets[1].value = data;
                            const inputs = app.lipsync_studio[info.widgets_values[0]].inputs;
                            
                            addInputs(this, inputs, info.widgets_values);
                            addOutputs(this, info.widgets_values[0]);
                            removeInputs(this, inputs, info.widgets_values);
                            fitHeight(this);
                            //importWorkflow(this, info.widgets_values[0], app, nodeData)
                        }
                    })
                    .catch(error => {
                        console.error('Erreur lors de l\'importation:', error);
                    });
            }
        });
        
        chainCallback(this, "onSerialize", function(info) {
            for (let inp of this.inputs){
                if (inp.widget){
                    if (inp.type != this.local_input_defs.required[inp.name][0])
                        inp.type = this.local_input_defs.required[inp.name][0];
                }
            }
            if(this.widgets[0].options.values == "COMBO"){
                this.widgets[0].options.values = ["None", ...Object.keys(app.lipsync_studio)];
            }
        });
        const workflow_reload = this.title.startsWith("Workflow: ")?true:false;
        this.widgets[0].options.values = ["None", ...Object.keys(app.lipsync_studio)]
        this.widgets[0].callback =  ( value ) => {
            cleanInputs(this);
            if (value == "None"){
                this.title = "Workflow (FlowChain ⛓️)";
            }else{
                this.widgets[1].value = importWorkflow(this, value, app, nodeData);
                const inputs = app.lipsync_studio[value].inputs;
                addInputs(this, inputs, {}, true);
                addOutputs(this, value);
                fitHeight(this);
            }
        };
        if (!workflow_reload){
            this.widgets[0].value = "None";
            this.widgets[1].value = "";
        }
        hideWidget(this, this.widgets[1], { holdSpace: false })
        cleanInputs(this);
        this.color = "#004670";
        this.bgcolor = "#002942";
        
    }
}