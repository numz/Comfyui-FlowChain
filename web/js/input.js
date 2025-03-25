import { chainCallback } from "./utils.js";
import { addInputs, cleanInputs, clearInputs } from "./inputs.js";
import { colors, bg_colors, node_type_list } from "./constants.js";

export function setupInputNode(nodeType, nodeData, app) {
    nodeType.prototype.onNodeCreated =  function() {
        chainCallback(this, "onConfigure", function(info) {
            let widgetDict = info.widgets_values;
            const inputs = {};

            inputs["default"] = {
                inputs: ["default", info.widgets_values[1], info.widgets_values[2]]
            };

            addInputs(this, inputs, info.widgets_values);
        });
        chainCallback(this, "onSerialize", function(info) {
            let widgetDict = info.widgets_values;

            for (let inp of this.inputs){
                // if w.name exists in info.widgets_values
                if (inp.widget){
                    if (inp.type != this.local_input_defs.required[inp.name][0]){
                        inp.type = this.local_input_defs.required[inp.name][0];
                        const wid = this.widgets.find(w => w.name == inp.name);
                        if (wid && wid.origType != this.local_input_defs.required[inp.name][0])
                            wid.origType = this.local_input_defs.required[inp.name][0];
                    }
                }
            }
        });

        this.widgets[1].callback =  ( value ) => {
            cleanInputs(this);

            switch(value){
                case "STRING":
                    this.addOutput("output", "STRING");
                    ComfyWidgets.STRING(
                        this,
                        "default",
                        ["STRING",{default: "",},],
                        app,
                    )
                    
                    break;
                case "INT":
                    this.addOutput("output", "INT");
                    ComfyWidgets.INT(
                        this,
                        "default",
                        //['',{default: 0, "min": 0, "max": 18446744073709551616, "step": 1},],
                        ['',{default: 0},],
                        app,
                    )
                    break;
                case "FLOAT":
                    this.addOutput("output", "FLOAT");
                    ComfyWidgets.FLOAT(
                        this,
                        "default",
                        ['',{default: 0, "min": 0.00, "max": 2048.00, "step": 0.01},],
                        app,
                    )
                    break;
                case "BOOLEAN":
                    this.addOutput("output", "BOOLEAN");
                    this.addWidget("toggle", "default", false, ()=>{});
                    break;
                case "none":
                    break;
                default:
                    this.addOutput("output", value);
                    this.addInput("default", value);
                    break;
            }
            this.color = colors[node_type_list.indexOf(value)];
            this.bgcolor = bg_colors[node_type_list.indexOf(value)];
        };
        if (this.widgets[1].value == "none")
            clearInputs(this);
        this.color = colors[node_type_list.indexOf("none")];
        this.bgcolor = bg_colors[node_type_list.indexOf("none")];
    }
}