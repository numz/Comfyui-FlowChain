import { chainCallback } from "./utils.js";
import { createColor } from "./inputs.js";

function initialisation(node) {
  node.onConnectionsChange = function (
    slotType, //1 = input, 2 = output
    slot,
    isChangeConnect,
    link_info,
    output
  ) {
    if (link_info && node.graph && slotType == 1 && isChangeConnect) {
      const fromNode = node.graph._nodes.find(
        (otherNode) => otherNode.id == link_info.target_id
      );

      if (fromNode) {
        const other_node = node.graph._nodes.find(
          (otherNode) => otherNode.id == link_info.origin_id
        );

        const node_output = other_node.outputs[link_info.origin_slot];
        if (node_output) {
          const type = node_output.type;
          node.widgets = node.widgets.splice(0, 1);
          if (node.widgets_values && node.widgets_values.length === undefined) {
            node.widgets_values = [node.widgets_values.Name.value];
          } else {
            if (node.widgets_values[0] === "") {
              node.widgets_values = node_output.name;
            }
          }
          if (node.inputs[2]) {
            node.removeInput(1);
          }
          if (node.widgets[0].value === "") {
            if (node.widgets_values.length == 1) {
              node.widgets[0].value = node.widgets_values[0];
            } else {
              node.widgets[0].value = node_output.name;
            }
          }

          node.outputs[0].type = type;
          //node.widgets = node.widgets.splice(0, 1);
          //node.widgets_values = node.widgets_values.splice(0, 1);

          //node.inputs[0].type = node_input.type;
          if (
            !("widget" in node.inputs[0]) ||
            node.inputs[0].widget == undefined
          ) {
            node.inputs[0].widget = undefined;
          }

          //node.local_input_defs.required["default"] = [type, null];
          node.color = createColor(type);
          node.bgcolor = createColor(type, true);
        }
      }
    } else {
      if (!isChangeConnect) {
        node.inputs[1].type = "*";
        node.outputs[0].type = "*";
        node.widgets[0].value = "";

        node.widgets = this.widgets.splice(0, 1);
        if (node.widgets_values) {
          node.widgets_values = [""];
        }
      }
    }
    //Update either way
    //node.update();
  };

  /*
    node.widgets[1].callback =  ( value ) => {
        // D'abord, déconnecter tous les liens existants
        for (let i = 0; i < node.outputs.length; i++) {
            const output = node.outputs[i];
            if (output.links && output.links.length) {
                const links = output.links.slice();
                for (const linkId of links) {
                    node.graph.removeLink(linkId);
                }
            }
        }

        for (let i = 0; i < node.inputs.length; i++) {
            const input = node.inputs[i];
            if (input.link) {
                node.graph.removeLink(input.link);
            }
        }
        clearInputs(node);
        switch(value){
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
    */
  //if (node.widgets[1].value == "none") clearInputs(node);
  node.color = createColor("none");
  node.bgcolor = createColor("none", true);
}

function configure(info) {
  if (info.widgets_values.length == undefined) {
    let widgetDict = info.widgets_values;
    info.widgets_values = [info.widgets_values.Name.value];
  }
  if (this.inputs.length > 2) {
    this.removeInput(1);
  }
  this.widgets = this.widgets.splice(0, 1);
  /*
  if (this.inputs[1].link) {
    this.onConnectionsChange(
      1,
      1,
      true,
      this.graph.links[this.inputs[1].link],
      this.graph.links[this.inputs[1].link].origin_id
    );
  }*/
}

function serialize(info) {
  /*
    info.widgets_values = {};
  if (!this.widgets) {
    return;
  }

  for (let w of this.widgets) {
    info.widgets_values[w.name] = {
      name: w.name,
      options: w.options,
      value: w.value,
      type: w.type,
      origType: w.origType,
      last_y: w.last_y,
    };
  }

  for (let w of this.inputs) {
    // if w.name exists in info.widgets_values
    if (info.widgets_values[w.name]) {
      if (info.widgets_values[w.name].type == "converted-widget") {
        if (info.widgets_values[w.name].origType == "toggle") {
          w.type = "BOOLEAN";
        } else if (info.widgets_values[w.name].origType == "text") {
          w.type = "STRING";
        }
      }
    }
  }
  if (this.outputs.length > 0) {
    if (this.outputs[0].links == null) {
      info.outputs_values = {
        links: null,
        name: this.outputs[0].name,
        type: this.outputs[0].type,
      };
    } else {
      info.outputs_values = {
        links: [...this.outputs[0].links],
        name: this.outputs[0].name,
        slot_index: this.outputs[0].slot_index,
        type: this.outputs[0].type,
      };
    }
  }
  this.setSize(info.size);
  */
}

export function setupOutputNode(nodeType) {
  nodeType.prototype.onNodeCreated = function () {
    chainCallback(this, "onConfigure", configure);
    chainCallback(this, "onSerialize", serialize);
    initialisation(this);
  };
}
