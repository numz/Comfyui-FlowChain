import { chainCallback } from "./utils.js";
import { ComfyWidgets } from '../../../scripts/widgets.js';
import { addInputs, cleanInputs, clearInputs } from "./inputs.js"; // Ensure clearInputs is imported
import { colors, bg_colors, node_type_list } from "./constants.js";

// Graph-independent part of initialization
function initialisation_preGraph(node) {
    if (!node.widgets || node.widgets.length < 2) {
        console.error("Node widgets not properly initialized for callback setup.", node.type, node.id);
        return;
    }
    node.widgets[1].callback = (value) => {
        if (node.graph) { // Still check for graph here for safety, though cleanInputs might be called from onAdded too
            clearInputs(node);
        }

        switch (value) {
            case "STRING":
                node.addOutput("output", "STRING");
                ComfyWidgets.STRING(
                    node,
                    "default",
                    ["STRING", { default: "" }],
                    app
                );
                break;
            case "INT":
                node.addOutput("output", "INT");
                ComfyWidgets.INT(
                    node,
                    "default",
                    ['INT', { default: 0, min: 0, max: 18446744073709551616, step: 1 }],
                    app
                );
                break;
            case "FLOAT":
                node.addOutput("output", "FLOAT");
                ComfyWidgets.FLOAT(
                    node,
                    "default",
                    ['FLOAT', { default: 0, min: 0.00, max: 2048.00, step: 0.01 }],
                    app
                );
                break;
            case "BOOLEAN":
                node.addOutput("output", "BOOLEAN");
                node.addWidget("toggle", "default", false, () => {});
                break;
            case "none":
                // If type is 'none', outputs might have been cleared by clearInputs.
                // Ensure no "output" is present if it's truly "none".
                if (node.outputs && node.outputs.find(o => o.name === "output")) {
                    const outputIndex = node.outputs.findIndex(o => o.name === "output");
                    if (outputIndex !== -1) node.removeOutput(outputIndex);
                }
                break;
            default:
                node.addOutput("output", value);
                node.addInput("default", value);
                break;
        }
        node.color = colors[node_type_list.indexOf(value)];
        node.bgcolor = bg_colors[node_type_list.indexOf(value)];
    };

    node.color = colors[node_type_list.indexOf("none")];
    node.bgcolor = bg_colors[node_type_list.indexOf("none")];
}

// Graph-dependent part of initialization
function initialisation_onAdded(node) {
    if (!node.widgets || node.widgets.length < 2) {
        return;
    }
    if (node.widgets[1].value === "none") {
        clearInputs(node); // This needs node.graph, which is available in onAdded
    }
}

function configure(info) {
    const inputs = {};
    inputs["default"] = { inputs: ["default", info.widgets_values[1], info.widgets_values[2]] };
    addInputs(this, inputs);
}

function serialize(info) {
    // Add check for this.local_input_defs
    if (!this.inputs || !this.local_input_defs || !this.local_input_defs.required) {
        return; // Exit early if the required structures don't exist
    }

    for (let inp of this.inputs) {
        if (inp.widget) {
            // Check that the required path exists before accessing it
            if (this.local_input_defs.required[inp.name] && 
                this.local_input_defs.required[inp.name][0] !== undefined &&
                inp.type !== this.local_input_defs.required[inp.name][0]) {
                
                inp.type = this.local_input_defs.required[inp.name][0];
                const wid = this.widgets.find(w => w.name === inp.name);
                if (wid && wid.origType !== this.local_input_defs.required[inp.name][0]) {
                    wid.origType = this.local_input_defs.required[inp.name][0];
                }
            }
        }
    }
}

export function setupInputNode(nodeType) {
    const originalOnAdded = nodeType.prototype.onAdded;
    nodeType.prototype.onAdded = function(graph) {
        if (originalOnAdded) {
            originalOnAdded.apply(this, arguments);
        }
        initialisation_onAdded(this);
    };

    nodeType.prototype.onNodeCreated = function () {
        this.local_input_defs = this.local_input_defs || { required: {} };
        
        initialisation_preGraph(this);

        chainCallback(this, "onConfigure", configure);
        chainCallback(this, "onSerialize", serialize);
    };
}