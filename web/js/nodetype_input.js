import { chainCallback } from "./utils.js";
import { ComfyWidgets } from "../../../scripts/widgets.js";
import { createColor } from "./inputs.js"; // Ensure clearInputs is imported
//import { ComfyUI } from "../../../scripts/comfyui.js";
import { string_widget } from "./constants.js";

// Graph-independent part of initialization
function initialisation_preGraph(node) {
  if (!node.widgets || node.widgets.length < 1) {
    console.error(
      "Node widgets not properly initialized for callback setup.",
      node.type,
      node.id
    );
    return;
  }

  node.onConnectionsChange = function (
    slotType, //1 = input, 2 = output
    slot,
    isChangeConnect,
    link_info,
    output
  ) {
    if (link_info && node.graph && slotType == 2 && isChangeConnect) {
      const fromNode = node.graph._nodes.find(
        (otherNode) => otherNode.id == link_info.origin_id
      );

      if (
        fromNode &&
        fromNode.inputs &&
        fromNode.inputs[link_info.origin_slot]
      ) {
        /*
        if (node.graph) {
          clearInputs(node, true, 1);
        }
        */

        const type = link_info.type;
        if (type !== "*") {
          const other_node = node.graph._nodes.find(
            (otherNode) => otherNode.id == link_info.target_id
          );

          const node_input = other_node.inputs[link_info.target_slot];
          let widget_input = null;
          let options = {};
          if (node_input.widget) {
            if ("name" in node_input.widget) {
              widget_input = other_node.widgets.find(
                (w) => w.name == node_input.widget.name
              );
              if ("options" in widget_input) {
                options = widget_input.options;
              }
            }
          }
          node.widgets = node.widgets.splice(0, 1);
          if (node.widgets_values) {
            if (node.widgets_values.length == 3) {
              node.widgets_values = [
                node.widgets_values[0],
                node.widgets_values[2],
              ];
            } else {
              node.widgets_values = node.widgets_values.splice(0, 2);
            }
          }
          if (node.inputs[2]) {
            node.removeInput(2);
          }
          if (node.widgets[0].value === "") {
            if (node.widgets_values && node.widgets_values.length == 2) {
              node.widgets[0].value = node.widgets_values[0];
            } else {
              node.widgets[0].value = node_input.name;
            }
          }
          switch (type) {
            case "INT":
              node.outputs[0].type = "INT";
              ComfyWidgets.INT(node, "default", ["INT", options], app);
              if (node.widgets_values.length == 2) {
                node.widgets[1].value = node.widgets_values[1];
              } else {
                node.widgets[1].value = widget_input.value;
              }
              node.widgets[1].options = options;

              node.inputs[0].type = node_input.type;
              if (
                !("widget" in node.inputs[0]) ||
                node.inputs[0].widget == undefined
              ) {
                node.inputs[0].widget = { name: "default" };
              } else {
                node.inputs[0].widget.name = "default";
              }

              node.local_input_defs.required["default"] = ["INT", options];
              break;
            case "FLOAT":
              node.outputs[0].type = "FLOAT";

              ComfyWidgets.FLOAT(node, "default", ["FLOAT", options], app);
              if (node.widgets_values.length == 2) {
                node.widgets[1].value = node.widgets_values[1];
              } else {
                node.widgets[1].value = widget_input.value;
              }
              node.widgets[1].options = options;
              node.inputs[0].type = node_input.type;
              if (
                !("widget" in node.inputs[0]) ||
                node.inputs[0].widget == undefined
              ) {
                node.inputs[0].widget = { name: "default" };
              } else {
                node.inputs[0].widget.name = "default";
              }

              node.local_input_defs.required["default"] = ["FLOAT", options];
              break;
            case "BOOLEAN":
              node.outputs[0].type = "BOOLEAN";
              node.addWidget("toggle", "default", false, () => {});
              if (node.widgets_values.length == 2) {
                node.widgets[1].value = node.widgets_values[1];
              } else {
                node.widgets[1].value = widget_input.value;
              }
              node.widgets[1].options = options;
              node.inputs[0].type = node_input.type;
              if (
                !("widget" in node.inputs[0]) ||
                node.inputs[0].widget == undefined
              ) {
                node.inputs[0].widget = { name: "default" };
              } else {
                node.inputs[0].widget.name = "default";
              }

              node.local_input_defs.required["default"] = ["BOOLEAN", false];
              break;
            case "COMBO":
              node.outputs[0].type = "COMBO";
              ComfyWidgets.COMBO(node, "default", ["COMBO", options], app);
              if (node.widgets_values.length == 2) {
                node.widgets[1].value = node.widgets_values[1][0];
              } else {
                node.widgets[1].value = widget_input.value;
              }
              if (options.values.length > 0) {
                node.widgets[1].options = options;
              } else {
                node.widgets[1].options = node.widgets_values[1][1];
              }
              node.inputs[0].type = node_input.type;
              if (
                !("widget" in node.inputs[0]) ||
                node.inputs[0].widget == undefined
              ) {
                node.inputs[0].widget = { name: "default" };
              } else {
                node.inputs[0].widget.name = "default";
              }

              node.local_input_defs.required["default"] = ["COMBO", options];
              break;
            case "none":
              if (
                node.outputs &&
                node.outputs.find((o) => o.name === "output")
              ) {
                const outputIndex = node.outputs.findIndex(
                  (o) => o.name === "output"
                );
                if (outputIndex !== -1) node.removeOutput(outputIndex);
              }
              break;

            default:
              if (string_widget.includes(type)) {
                node.outputs[0].type = "STRING";
                ComfyWidgets.STRING(
                  node,
                  "default",
                  ["STRING", { default: "" }],
                  app
                );

                if (node.widgets_values.length == 2) {
                  node.widgets[1].value = node.widgets_values[1];
                } else {
                  node.widgets[1].value = widget_input.value;
                }
                node.widgets[1].options = options;
                node.inputs[0].type = node_input.type;
                if (
                  !("widget" in node.inputs[0]) ||
                  node.inputs[0].widget == undefined
                ) {
                  node.inputs[0].widget = { name: "default" };
                } else {
                  node.inputs[0].widget.name = "default";
                }

                node.local_input_defs.required["default"] = [
                  "STRING",
                  { default: "" },
                ];
              } else {
                node.outputs[0].type = type;
                //node.widgets = node.widgets.splice(0, 1);
                //node.widgets_values = node.widgets_values.splice(0, 1);

                node.inputs[0].type = node_input.type;
                if (
                  !("widget" in node.inputs[0]) ||
                  node.inputs[0].widget == undefined
                ) {
                  node.inputs[0].widget = undefined;
                }

                node.local_input_defs.required["default"] = [type, null];
              }
              break;
          }
          node.color = createColor(type);
          //node.color = colors[node_type_list.indexOf(type)];
          node.bgcolor = createColor(type, true);
        }
        //node.bgcolor = bg_colors[node_type_list.indexOf(type)];
        //node.outputs[0].name = type;
      } else {
        showAlert("node output undefined");
      }
    } else {
      if (!isChangeConnect) {
        if (this.outputs[0].links && this.outputs[0].links.length == 0) {
          this.inputs[0].type = "*";
          this.outputs[0].type = "*";
          this.widgets[0].value = "";
          this.widgets = this.widgets.splice(0, 1);
          if (this.widgets_values) {
            this.widgets_values = this.widgets_values.splice(0, 1);
          }
        }
      }
    }
    //Update either way
    //node.update();
  };
  /*
  node.widgets[1].callback = (value) => {
    if (node.graph) {
      clearInputs(node);
    }

    switch (value) {
      case "INT":
        node.addOutput("output", "INT");
        ComfyWidgets.INT(
          node,
          "default",
          ["INT", { default: 0, min: 0, max: 18446744073709551616, step: 1 }],
          app
        );
        node.addInput("default", "INT", { widget: { name: "default" } });
        node.local_input_defs.required["default"] = [
          "INT",
          { default: 0, min: 0, max: 18446744073709551616, step: 1 },
        ];
        break;
      case "FLOAT":
        node.addOutput("output", "FLOAT");
        ComfyWidgets.FLOAT(
          node,
          "default",
          ["FLOAT", { default: 0, min: 0.0, max: 2048.0, step: 0.01 }],
          app
        );
        node.addInput("default", "FLOAT", { widget: { name: "default" } });
        node.local_input_defs.required["default"] = [
          "FLOAT",
          { default: 0, min: 0.0, max: 2048.0, step: 0.01 },
        ];
        break;
      case "BOOLEAN":
        node.addOutput("output", "BOOLEAN");
        node.addWidget("toggle", "default", false, () => {});
        node.addInput("default", "BOOLEAN", { widget: { name: "default" } });
        node.local_input_defs.required["default"] = ["BOOLEAN", false];
        break;
      case "none":
        if (node.outputs && node.outputs.find((o) => o.name === "output")) {
          const outputIndex = node.outputs.findIndex(
            (o) => o.name === "output"
          );
          if (outputIndex !== -1) node.removeOutput(outputIndex);
        }
        break;
      default:
        if (string_widget.includes(value)) {
          node.addOutput("output", "STRING");
          ComfyWidgets.STRING(
            node,
            "default",
            ["STRING", { default: "" }],
            app
          );
          node.addInput("default", "STRING", { widget: { name: "default" } });
          node.local_input_defs.required["default"] = [
            "STRING",
            { default: "" },
          ];
        } else {
          node.addOutput("output", value);
          node.local_input_defs.required["default"] = [value, null];
        }
        break;
    }
    node.color = colors[node_type_list.indexOf(value)];
    node.bgcolor = bg_colors[node_type_list.indexOf(value)];
  };
  */
  node.color = createColor("none");
  node.bgcolor = createColor("none", true);
}

// Graph-dependent part of initialization
function initialisation_onAdded(node) {
  if (!node.widgets || node.widgets.length < 1) {
    return;
  }
  //if (node.widgets[1].value === "none") {
  //  clearInputs(node); // This needs node.graph, which is available in onAdded
  //}
}

function configure(info) {
  if (info.widgets_values.length == 3) {
    info.widgets_values = [info.widgets_values[0], info.widgets_values[2]];
  }
  //info.widgets_values = [info.widgets_values[0], info.widgets_values[1]];
  if (info.widgets_values.length == 2 && this.widgets.length == 2) {
    this.widgets[1].value = info.widgets_values[1];
  }

  //const inputs = {};
  //inputs["default"] = {
  //  inputs: ["default", info.widgets_values[1], info.widgets_values[2]],
  //};

  //addInputs(this, inputs);
}

function serialize(info) {
  // Add check for this.local_input_defs
  if (
    !this.inputs ||
    !this.local_input_defs ||
    !this.local_input_defs.required
  ) {
    return; // Exit early if the required structures don't exist
  }

  for (let inp of this.inputs) {
    if (inp.widget) {
      // Check that the required path exists before accessing it
      if (
        this.local_input_defs.required[inp.name] &&
        this.local_input_defs.required[inp.name][0] !== undefined &&
        inp.type !== this.local_input_defs.required[inp.name][0]
      ) {
        inp.type = this.local_input_defs.required[inp.name][0];
        const wid = this.widgets.find((w) => w.name === inp.name);
        if (
          wid &&
          wid.origType !== this.local_input_defs.required[inp.name][0]
        ) {
          wid.origType = this.local_input_defs.required[inp.name][0];
        }
      }
    }
  }

  if (this.inputs[0].type == "COMBO") {
    if (this.widgets[1].options.values.length > 0) {
      info.widgets_values[1] = [this.widgets[1].value, this.widgets[1].options];
    }
  }
}

export function setupInputNode(nodeType) {
  const originalOnAdded = nodeType.prototype.onAdded;
  nodeType.prototype.onAdded = function (graph) {
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
