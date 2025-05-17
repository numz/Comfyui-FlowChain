import { ComfyWidgets } from "../../../scripts/widgets.js";

export function getDefaultOptions(type, value = 0) {
  let options = {};
  switch (type) {
    case "INT":
      options = { default: value, min: 0, max: 18446744073709551616, step: 1 };
      break;
    case "FLOAT":
      options = { default: value, min: 0.0, max: 2048.0, step: 0.01 };
      break;
    case "STRING":
      options = { default: value };
      break;
    case "COMBO":
      options = { default: value, values: ["option1", "option2", "option3"] };
      break;
    default:
      options = {};
  }
  return options;
}

export function addWidgets(root_obj, field_name, value, app) {
  let type = value.type;
  if (type == "converted-widget") {
    type = value.origType;
  }

  // S'assurer que le nœud a un objet de stockage local pour ses définitions d'entrée
  if (!root_obj.local_input_defs) {
    root_obj.local_input_defs = {
      required: {},
      optional: {},
    };
  }

  if ((type == "STRING" || type == "text") && field_name != "workflow") {
    ComfyWidgets.STRING(
      root_obj,
      field_name,
      ["STRING", getDefaultOptions("STRING", value.value)],
      app
    );
    root_obj.addInput(field_name, "STRING", { widget: { name: field_name } });
    // Stocker la définition localement au lieu de modifier nodeData
    root_obj.local_input_defs.required[field_name] = [
      "STRING",
      getDefaultOptions("STRING", value.value),
    ];
  }

  if (type == "INT" || type == "number") {
    ComfyWidgets.INT(
      root_obj,
      field_name,
      ["INT", getDefaultOptions("INT", value.value)],
      app
    );
    // Stocker la définition localement
    root_obj.addInput(field_name, "INT", { widget: { name: field_name } });
    root_obj.local_input_defs.required[field_name] = [
      "INT",
      getDefaultOptions("INT", value.value),
    ];
  }

  if (type == "FLOAT") {
    ComfyWidgets.FLOAT(
      root_obj,
      field_name,
      ["FLOAT", getDefaultOptions("FLOAT", value.value)],
      app
    );
    root_obj.addInput(field_name, "FLOAT", { widget: { name: field_name } });
    // Stocker la définition localement
    root_obj.local_input_defs.required[field_name] = [
      "FLOAT",
      getDefaultOptions("FLOAT", value.value),
    ];
  }

  if (type == "BOOLEAN" || type == "toggle") {
    root_obj.addWidget("toggle", field_name, value.value, () => {});
    // Stocker la définition localement
    root_obj.addInput(field_name, "BOOLEAN", { widget: { name: field_name } });
    root_obj.local_input_defs.required[field_name] = [
      "BOOLEAN",
      getDefaultOptions("BOOLEAN", value.value),
    ];
  }
  if (type == "COMBO") {
    ComfyWidgets.COMBO(
      root_obj,
      field_name,
      ["COMBO", getDefaultOptions("COMBO", value.value)],
      app
    );
    root_obj.widgets[root_obj.widgets.length - 1].options = value.options;
    root_obj.addInput(field_name, "COMBO", { widget: { name: field_name } });
    root_obj.local_input_defs.required[field_name] = ["COMBO", value.options];
  }
  /*ComfyWidgets.
    if (field_name == "workflow"){
        root_obj.addWidget("STRING", field_name, value.value, ()=>{});
        root_obj.widgets[root_obj.widgets.length - 1].hidden = true;
        // Stocker la définition localement 
        root_obj.local_input_defs.required[field_name] = ["STRING", {}];
    }*/
  if (type == "IMAGE") root_obj.addInput(field_name, "IMAGE");
  if (type == "LATENT") root_obj.addInput(field_name, "LATENT");
  if (type == "MODEL") root_obj.addInput(field_name, "MODEL");
  if (type == "CLIP") root_obj.addInput(field_name, "CLIP");
  if (type == "MASK") root_obj.addInput(field_name, "MASK");
  if (type == "CONDITIONING") root_obj.addInput(field_name, "CONDITIONING");
  if (type == "VAE") root_obj.addInput(field_name, "VAE");
}

export function hideWidget(node, widget, options = {}) {
  const { suffix = "", holdSpace = true } = options;

  if (widget.type?.startsWith("converted-widget")) return;
  widget.origType = widget.type;
  widget.origComputeSize = widget.computeSize;
  widget.origSerializeValue = widget.serializeValue;
  // @ts-expect-error custom widget type
  widget.type = "converted-widget" + suffix;
  if (holdSpace) {
    widget.computeSize = () => [0, LiteGraph.NODE_WIDGET_HEIGHT];
    widget.serializeValue = (node, index) => {
      // Prevent serializing the widget if we have no input linked
      if (!node.inputs) {
        return undefined;
      }
      let node_input = node.inputs.find((i) => i.widget?.name === widget.name);

      if (!node_input || !node_input.link) {
        return undefined;
      }
      return widget.origSerializeValue
        ? widget.origSerializeValue(node, index)
        : widget.value;
    };
  } else {
    // -4 is due to the gap litegraph adds between widgets automatically
    widget.computeSize = () => [0, -4];
    widget.serializeValue = (node, index) => {
      return widget.origSerializeValue
        ? widget.origSerializeValue(node, index)
        : widget.value;
    };
  }

  // Hide any linked widgets, e.g. seed+seedControl
  if (widget.linkedWidgets) {
    for (const w of widget.linkedWidgets) {
      hideWidget(node, w, { suffix: ":" + widget.name, holdSpace: false });
    }
  }
}

export function convertToInput(node, widget) {
  hideWidget(node, widget);
  // Add input and store widget config for creating on primitive node
  const [oldWidth, oldHeight] = node.size;

  for (const widget of node.widgets) {
    widget.last_y += LiteGraph.NODE_SLOT_HEIGHT;
  }

  // Restore original size but grow if needed
  node.setSize([
    Math.max(oldWidth, node.size[0]),
    Math.max(oldHeight, node.size[1]),
  ]);
  return node;
}
