import { chainCallback } from "./utils.js";
import { ComfyWidgets } from '../../../scripts/widgets.js'
import { addInputs, cleanInputs, clearInputs } from "./inputs.js";
import { colors, bg_colors, node_type_list } from "./constants.js";

function initialisation(node) {
    node.widgets[1].callback =  ( value ) => {
        cleanInputs(node);

        switch(value){
            case "STRING":
                node.addOutput("output", "STRING");
                ComfyWidgets.STRING(
                    node,
                    "default",
                    ["STRING",{default: "",},],
                    app,
                )

                break;
            case "INT":
                node.addOutput("output", "INT");
                ComfyWidgets.INT(
                    node,
                    "default",
                    ['INT',{default: 0, "min": 0, "max": 18446744073709551616, "step": 1},],
                    //['INT',{default: 0},],
                    app,
                )
                break;
            case "FLOAT":
                node.addOutput("output", "FLOAT");
                ComfyWidgets.FLOAT(
                    node,
                    "default",
                    ['FLOAT',{default: 0, "min": 0.00, "max": 2048.00, "step": 0.01},],
                    app,
                )
                break;
            case "BOOLEAN":
                node.addOutput("output", "BOOLEAN");
                node.addWidget("toggle", "default", false, ()=>{});
                break;
            case "none":
                break;
            default:
                node.addOutput("output", value);
                node.addInput("default", value);
                break;
        }
        node.color = colors[node_type_list.indexOf(value)];
        node.bgcolor = bg_colors[node_type_list.indexOf(value)];
    };
    if (node.widgets[1].value == "none")
        clearInputs(node);
    node.color = colors[node_type_list.indexOf("none")];
    node.bgcolor = bg_colors[node_type_list.indexOf("none")];
}

function configure(info) {
    const inputs = {};
    inputs["default"] = {inputs: ["default", info.widgets_values[1], info.widgets_values[2]]};
    addInputs(this, inputs);
}

function serialize(info) {
    for (let inp of this.inputs){
        if (inp.widget){
            if (inp.type != this.local_input_defs.required[inp.name][0]){
                inp.type = this.local_input_defs.required[inp.name][0];
                const wid = this.widgets.find(w => w.name == inp.name);
                if (wid && wid.origType != this.local_input_defs.required[inp.name][0])
                    wid.origType = this.local_input_defs.required[inp.name][0];
            }
        }
    }
}

export function setupInputNode(nodeType) {
    nodeType.prototype.onNodeCreated =  function() {
        chainCallback(this, "onConfigure", configure);
        chainCallback(this, "onSerialize", serialize);
        initialisation(this);
    }
}