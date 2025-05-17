import { chainCallback, fitHeight } from "./utils.js";
import { addInputs, cleanInputs, removeInputs, addOutputs } from "./inputs.js"; // Consolidated imports
import { importWorkflow } from "./workflows.js";
import { hideWidget } from "./widgets.js";

// Graph-independent part of initialization (called onNodeCreated)
function initialisation_preGraph(node) {
  node.color = "#004670";
  node.bgcolor = "#002942";

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
        if (other_node.type == "WorkflowInput") {
          const node_output = other_node.outputs[link_info.origin_slot];
          if (node_output) {
            const type = node_output.type;
            other_node.onConnectionsChange(2, 1, true, link_info, node);
          }
        }
      }
    } else if (link_info && node.graph && slotType == 2 && isChangeConnect) {
      const fromNode = node.graph._nodes.find(
        (otherNode) => otherNode.id == link_info.origin_id
      );
      if (fromNode) {
        const other_node = node.graph._nodes.find(
          (otherNode) => otherNode.id == link_info.target_id
        );
        if (other_node.type == "WorkflowOutput") {
          const node_input = other_node.inputs[link_info.target_slot];
          if (node_input) {
            const type = node_input.type;
            other_node.onConnectionsChange(1, 2, true, link_info, node);
          }
        }
      }
    }
    //Update either way
    //node.update();
  };

  // Basic widget setup that doesn't depend on the graph
  if (node.widgets && node.widgets[0] && node.widgets[0].options) {
    if (app && app.lipsync_studio) {
      node.widgets[0].options.values = [
        "None",
        ...Object.keys(app.lipsync_studio),
      ];
    } else {
      console.warn(
        "App or lipsync_studio not available during preGraph setup for workflow node."
      );
      node.widgets[0].options.values = ["None"];
    }
  }

  const isReloading = node.title && node.title.startsWith("Workflow: ");
  if (!isReloading && node.widgets && node.widgets[0]) {
    node.widgets[0].value = "None"; // Default to "None"
    if (node.widgets[1]) {
      node.widgets[1].value = ""; // Clear workflow JSON
    }
  }

  if (node.widgets && node.widgets[1]) {
    hideWidget(node, node.widgets[1], { holdSpace: false });
  }

  // Setup the primary widget callback.
  // Operations inside this callback that need the graph (like cleanInputs, addInputs, addOutputs)
  // will be guarded by checking node.graph.
  if (node.widgets && node.widgets[0]) {
    node.widgets[0].callback = async (value) => {
      if (!node.graph) {
        console.warn(
          "Workflow widget callback triggered, but node.graph is not yet available. Action might be deferred or skipped."
        );
        // If critical, you might need a flag to re-process this in onAdded
        return;
      }

      cleanInputs(node); // Requires node.graph

      if (value === "None") {
        node.title = "Workflow (FlowChain ⛓️)";
        // Further cleanup of dynamic inputs/outputs might be needed here
        // For example, explicitly removing all but the essential widgets/inputs/outputs.
      } else if (app && app.lipsync_studio && app.lipsync_studio[value]) {
        try {
          let workflowJSON = await importWorkflow(node, value, app); // importWorkflow updates node.title
          workflowJSON = JSON.parse(workflowJSON);
          // Ensure app.lipsync_studio[value] (and its .inputs) is still valid after await
          if (app.lipsync_studio[value] && app.lipsync_studio[value].inputs) {
            const inputs = app.lipsync_studio[value].inputs;
            const outputs = app.lipsync_studio[value].outputs;
            for (let [key, value] of Object.entries(inputs)) {
              workflowJSON[key]["inputs"]["type"] = value["inputs"][1];
            }
            for (let [key, value] of Object.entries(outputs)) {
              if (value["inputs"].length === undefined) {
                workflowJSON[key]["inputs"]["type"] =
                  value["inputs"].type.value;
              } else {
                workflowJSON[key]["inputs"]["type"] = value["inputs"][1];
              }
            }
            workflowJSON = JSON.stringify(workflowJSON);

            if (node.widgets && node.widgets[1]) {
              node.widgets[1].value = workflowJSON;
            }

            addInputs(node, inputs, []); // Requires node.graph
            addOutputs(node, value); // Requires node.graph
            fitHeight(node);
          } else {
            console.error(
              "Workflow data or inputs became unavailable after import for:",
              value
            );
            node.title = "Workflow (FlowChain ⛓️)"; // Reset title on error
          }
        } catch (error) {
          console.error(
            "Error processing workflow selection in callback:",
            error
          );
          node.title = "Workflow (FlowChain ⛓️)"; // Reset title on error
        }
      } else {
        node.title = "Workflow (FlowChain ⛓️)";
      }
    };
  }
}

// Graph-dependent part of initialization (called onAdded)
function initialisation_onAdded(node) {
  if (!node.graph) {
    console.error(
      "CRITICAL: initialisation_onAdded called for workflow node, but node.graph is not set."
    );
    return;
  }

  // Perform an initial cleanInputs now that we are sure the graph exists.
  // This is important if the node was configured (e.g. from graph load) before being added.
  cleanInputs(node);

  // If a workflow was already selected (e.g. loading a saved graph),
  // ensure its inputs/outputs are correctly set up.
  // The widget callback might have already run if `configure` set its value.
  // We re-evaluate or trigger necessary setup steps.
  if (node.widgets && node.widgets[0]) {
    const selectedWorkflow = node.widgets[0].value;
    if (selectedWorkflow && selectedWorkflow !== "None") {
      if (
        app &&
        app.lipsync_studio &&
        app.lipsync_studio[selectedWorkflow] &&
        app.lipsync_studio[selectedWorkflow].inputs
      ) {
        // If workflow JSON is loaded and inputs are known, ensure UI is consistent
        if (
          node.widgets[1] &&
          (node.widgets[1].value === "" ||
            typeof node.widgets[1].value !== "string" ||
            !node.widgets[1].value.startsWith("{"))
        ) {
          // Workflow selected, but JSON not loaded in widget[1] or inputs/outputs not added by callback yet.
          // Trigger the callback logic.
          console.log(
            `Workflow node ${node.id}: Re-evaluating selected workflow '${selectedWorkflow}' onAdded.`
          );
          node.widgets[0].callback(selectedWorkflow);
        } else {
          // Workflow JSON likely loaded, ensure inputs/outputs are present
          // This can be a fallback if the callback didn't fully setup due to timing
          const inputs = app.lipsync_studio[selectedWorkflow].inputs;
          const currentWidgetValues = node.widgets_values || []; // from node.configure
          addInputs(node, inputs, currentWidgetValues);
          addOutputs(node, selectedWorkflow);
          removeInputs(node, inputs, currentWidgetValues); // Ensure this logic is sound for onAdded
          fitHeight(node);
        }
      } else if (selectedWorkflow !== "None") {
        // Workflow selected, but its definition isn't in app.lipsync_studio. Try to load it.
        console.warn(
          `Workflow node ${node.id}: '${selectedWorkflow}' selected but not in lipsync_studio. Attempting import via callback.`
        );
        node.widgets[0].callback(selectedWorkflow); // This will attempt importWorkflow
      }
    } else {
      node.title = "Workflow (FlowChain ⛓️)";
    }
  }
}

function configure(info) {
  // `this` is the node. Called when loading graph data.
  // `info.widgets_values` contains the saved values for widgets.
  if (!app || !app.lipsync_studio) {
    console.error(
      "App or lipsync_studio not available during workflow node configure."
    );
    return;
  }

  // Update widget options first, in case lipsync_studio has changed since last save
  if (this.widgets && this.widgets[0] && this.widgets[0].options) {
    this.widgets[0].options.values = [
      "None",
      ...Object.keys(app.lipsync_studio),
    ];
  }

  let selectedWorkflowName = info.widgets_values
    ? info.widgets_values[0]
    : "None";

  if (this.widgets && this.widgets[0]) {
    this.widgets[0].value = selectedWorkflowName; // Set the widget value from saved data
  }
  if (
    this.widgets &&
    this.widgets[1] &&
    info.widgets_values &&
    info.widgets_values[1]
  ) {
    this.widgets[1].value = info.widgets_values[1]; // Set the hidden workflow JSON
  }

  if (selectedWorkflowName === "None") {
    this.title = "Workflow (FlowChain ⛓️)";
    if (this.graph) {
      // Only clean if graph is available
      cleanInputs(this);
    }
    return;
  }

  // If the node is already on a graph, we can proceed with fuller setup.
  // If not, onAdded will handle the rest.
  if (this.graph) {
    let inputs = [];
    if (selectedWorkflowName in app.lipsync_studio) {
      inputs = app.lipsync_studio[selectedWorkflowName].inputs;
    } else {
      if (selectedWorkflowName.replaceAll("\\", "/") in app.lipsync_studio) {
        selectedWorkflowName = selectedWorkflowName.replaceAll("\\", "/");
        info.widgets_values[0] = selectedWorkflowName;
        this.widgets[0].value = selectedWorkflowName;
        inputs = app.lipsync_studio[selectedWorkflowName].inputs;
      } else {
        selectedWorkflowName = selectedWorkflowName.replaceAll("/", "\\");
        info.widgets_values[0] = selectedWorkflowName;
        this.widgets[0].value = selectedWorkflowName;
        inputs = app.lipsync_studio[selectedWorkflowName].inputs;
      }
    }

    if (inputs) {
      this.title =
        app.lipsync_studio[selectedWorkflowName].title ||
        `Workflow: ${selectedWorkflowName}`;
      //const inputs = app.lipsync_studio[selectedWorkflowName].inputs;
      addInputs(this, inputs, info.widgets_values || []);
      addOutputs(this, selectedWorkflowName);
      removeInputs(this, inputs, info.widgets_values || []);
      fitHeight(this);
      importWorkflow(this, selectedWorkflowName, app)
        .then((data) => {
          if (data) {
            const data_json = JSON.parse(data);
            const inputs = app.lipsync_studio[selectedWorkflowName].inputs;
            const outputs = app.lipsync_studio[selectedWorkflowName].outputs;

            for (let [key, value] of Object.entries(inputs)) {
              data_json[key]["inputs"]["type"] = value["inputs"][1];
            }
            for (let [key, value] of Object.entries(outputs)) {
              if (value["inputs"].length === undefined) {
                data_json[key]["inputs"]["type"] = value["inputs"].type.value;
              } else {
                data_json[key]["inputs"]["type"] = value["inputs"][1];
              }
            }
            this.widgets[1].value = JSON.stringify(data_json);

            addInputs(this, inputs, info.widgets_values);
            addOutputs(this, selectedWorkflowName);
            removeInputs(this, inputs, info.widgets_values);
            fitHeight(this);
          }
        })
        .catch((error) => {
          console.error("Erreur lors de l'importation:", error);
        });
    } else {
      // Data not yet in lipsync_studio, try to import.
      // The callback of widget[0] will handle this if triggered by value change,
      // or onAdded will pick it up.
      // For configure, we might just set the title and let onAdded handle full setup.
      this.title = `Workflow: ${selectedWorkflowName} (loading...)`;
      // Avoid calling importWorkflow directly here if onAdded will robustly handle it,
      // to prevent multiple calls.
    }
  } else {
    // Graph not yet available, title will be set, onAdded will do the heavy lifting.
    this.title = `Workflow: ${selectedWorkflowName}`;
  }
}

function serialize(info) {
  // Standard serialization of widget values is usually handled by LiteGraph.
  // This custom serialize can ensure specific data is captured if needed.
  // info.widgets_values will be populated by LiteGraph based on current widget values.

  // If local_input_defs logic is still needed for type adjustments:
  if (this.inputs && this.local_input_defs && this.local_input_defs.required) {
    for (let inp of this.inputs) {
      if (
        inp.widget &&
        this.local_input_defs.required[inp.name] &&
        this.local_input_defs.required[inp.name][0] !== undefined &&
        inp.type !== this.local_input_defs.required[inp.name][0]
      ) {
        inp.type = this.local_input_defs.required[inp.name][0];
      }
    }
  }
}

export function setupWorkflowNode(nodeType) {
  const originalOnAdded = nodeType.prototype.onAdded;
  nodeType.prototype.onAdded = function (graph) {
    if (originalOnAdded) {
      originalOnAdded.apply(this, arguments);
    }
    initialisation_onAdded(this); // Our graph-dependent setup
  };

  const originalOnRemoved = nodeType.prototype.onRemoved;
  nodeType.prototype.onRemoved = function () {
    // Perform any cleanup specific to this node when removed from graph
    // For example, disconnecting callbacks or releasing resources
    if (originalOnRemoved) {
      originalOnRemoved.apply(this, arguments);
    }
  };

  nodeType.prototype.onNodeCreated = function () {
    // This is one of the first lifecycle hooks.
    // Initialize properties that don't depend on the graph.
    this.local_input_defs = this.local_input_defs || { required: {} };

    // Add essential widgets if not already present (LiteGraph usually handles this from type definition)
    // For a "COMBO" and a "STRING" (hidden)
    if (!this.widgets || this.widgets.length < 2) {
      this.addWidget("combo", "Workflow", "None", () => {}, {
        values: ["None"],
      });
      this.addWidget("string", "workflow_json", "", () => {}, {
        multiline: true,
      });
    }

    initialisation_preGraph(this); // Our graph-independent setup

    chainCallback(this, "onConfigure", configure);
    chainCallback(this, "onSerialize", serialize);
  };
}
