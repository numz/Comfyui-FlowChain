import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { setupWorkflowNode } from "./nodetype_workflow.js";
import { setupInputNode } from "./nodetype_input.js";
import { setupContinueNode } from "./nodetype_continue.js";
import { setupOutputNode } from "./nodetype_output.js";
import { setupLipSyncNode } from "./nodetype_lipSync.js";
//import JSZip from "jszip";

function addFileToZip(zip, file, name) {
  zip.file(name, file);
  return zip;
}

async function recursiveZip(nodes, zipInstance) {
  for (const node of nodes) {
    // Assurez-vous que widgets_values existe et a au moins un élément.
    if (!node.widgets_values || node.widgets_values.length === 0) {
      console.warn(
        "Node in recursiveZip does not have widgets_values or it's empty:",
        node
      );
      continue;
    }
    const path = node.widgets_values[0];
    if (!path || typeof path !== "string") {
      console.warn(
        "Node path is invalid in recursiveZip:",
        path,
        "for node:",
        node
      );
      continue;
    }

    try {
      console.log(`Fetching workflow for path: ${path}`);
      const response = await api.fetchApi(
        "/flowchain/workflow?workflow_path=" + encodeURIComponent(path)
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `Failed to fetch workflow ${path}: ${response.status} ${response.statusText}. Server response: ${errorText}`
        );
        // Vous pourriez vouloir informer l'utilisateur ici, par exemple en ajoutant une entrée d'erreur au ZIP
        zipInstance.file(
          `ERROR_fetching_${path.replace(/[^a-zA-Z0-9._-]/g, "_")}.txt`,
          `Failed to fetch: ${response.status} ${response.statusText}\n${errorText}`
        );
        continue; // Passe au nœud suivant
      }

      const jsonFile = await response.json();
      console.log(`Successfully fetched workflow: ${path}`, jsonFile);

      // S'assurer que le nom de fichier est valide et se termine par .json
      // Remplace les caractères non valides pour un nom de fichier par _
      const safePath = path.replace(/[^a-zA-Z0-9/._-]/g, "_");
      const fileNameInZip = safePath.endsWith(".json")
        ? safePath
        : `${safePath}.json`;

      zipInstance.file(fileNameInZip, JSON.stringify(jsonFile, null, 2));
      console.log(`Added ${fileNameInZip} to zip.`);

      if (jsonFile && jsonFile.workflow && jsonFile.workflow.nodes) {
        const subWorkflowNodes = jsonFile.workflow.nodes.filter(
          (n) => n.type === "Workflow" // 'n' pour éviter le shadowing avec 'node' de la boucle externe
        );
        if (subWorkflowNodes.length > 0) {
          console.log(
            `Found ${subWorkflowNodes.length} sub-workflow nodes in ${path}. Recursing...`
          );
          await recursiveZip(subWorkflowNodes, zipInstance); // Attendre l'appel récursif
        }
      } else {
        console.warn(
          `Workflow data for ${path} is not in the expected format or has no nodes.`,
          jsonFile
        );
      }
    } catch (error) {
      console.error(`Error processing node with path ${path}:`, error);
      zipInstance.file(
        `ERROR_processing_${path.replace(/[^a-zA-Z0-9._-]/g, "_")}.txt`,
        `Error during processing: ${error.message}\n${error.stack}`
      );
    }
  }
  return zipInstance; // JSZip instances sont mutables, mais retourner est une bonne pratique.
}
function addCustomMenu() {
  if (!app.graph) {
    requestAnimationFrame(addCustomMenu);
    return;
  }
  const Workflow_menu = document.getElementsByClassName("p-menubar-submenu")[0];

  if (!Workflow_menu) {
    console.warn(
      "Le menu cible 'pv_id_10_0_list' n'a pas été trouvé. L'élément 'Export FlowChain (Zip)' ne sera pas ajouté."
    );
    // Envisagez une méthode plus robuste pour ajouter votre menu si celui-ci n'est pas trouvé.
    return;
  }

  const div = document.createElement("div");
  div.className = "p-menubar-item-content"; // Assurez-vous que cette classe et les suivantes existent ou adaptez-les

  const icon = document.createElement("span");
  icon.className = "p-menubar-item-icon pi pi-download";

  const text = document.createElement("span");
  text.textContent = "Export FlowChain (Zip)";
  text.className = "p-menubar-item-label";

  const link = document.createElement("a");
  link.appendChild(icon);
  link.appendChild(text);
  link.className = "p-menubar-item-link";
  link.href = "#";
  link.style.color = "white"; // Ou utilisez une classe CSS

  link.onclick = async () => {
    try {
      if (typeof JSZip === "undefined") {
        alert(
          "JSZip library is not loaded. Please include it in your project (e.g., from cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js) or ensure it is loaded by ComfyUI."
        );
        console.error("JSZip is not defined. Please load the JSZip library.");
        return;
      }

      const workflow = app.graph.serialize();
      const workflowNodes = workflow.nodes.filter(
        (node) => node.type === "Workflow"
      );

      let zip = new JSZip();
      console.log("Starting recursive zip process for main workflow...");
      zip = await recursiveZip(workflowNodes, zip); // Attendre la complétion de la fonction récursive
      console.log("Recursive zip process finished.");

      const workflowJson = JSON.stringify(workflow, null, 2);
      zip.file("main_workflow.json", workflowJson); // Ajoute le workflow principal
      console.log("Added main_workflow.json to zip.");

      const zipContent = await zip.generateAsync({ type: "blob" });
      console.log("Zip content generated.");

      const now = new Date();
      const timestamp = `${now.getFullYear()}${(now.getMonth() + 1)
        .toString()
        .padStart(2, "0")}${now.getDate().toString().padStart(2, "0")}_${now
        .getHours()
        .toString()
        .padStart(2, "0")}${now.getMinutes().toString().padStart(2, "0")}${now
        .getSeconds()
        .toString()
        .padStart(2, "0")}`;
      const zipFilename = `FlowChain_Workflow_${timestamp}.zip`;

      const downloadLink = document.createElement("a");
      downloadLink.href = URL.createObjectURL(zipContent);
      downloadLink.download = zipFilename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(downloadLink.href);

      console.log("Workflow exporté avec succès :", zipFilename);
    } catch (error) {
      console.error("Erreur lors de l'exportation du workflow en ZIP:", error);
      alert(
        "Une erreur est survenue lors de l'exportation du workflow. Vérifiez la console pour plus de détails."
      );
    }
  };

  div.appendChild(link);
  const topMenuDiv = document.createElement("li");
  topMenuDiv.id = "pv_id_10_0_9";
  topMenuDiv.className = "p-menubar-item relative";
  topMenuDiv.role = "menuitem";
  topMenuDiv.ariaLabel = "Export FlowChain (Zip)";
  // Peut-être styler `topMenuDiv` ou `link` si les classes PrimeN
  // G ne sont pas disponibles globalement
  topMenuDiv.appendChild(div);
  Workflow_menu.appendChild(topMenuDiv);
}

app.registerExtension({
  name: "FlowChain.jsnodes",
  async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (!nodeData?.category?.startsWith("FlowChain")) {
      return;
    }
    switch (nodeData.name) {
      case "Workflow":
        setupWorkflowNode(nodeType);
        break;
      case "WorkflowInput":
        setupInputNode(nodeType);
        break;
      case "WorkflowContinue":
        setupContinueNode(nodeType);
        break;
      case "WorkflowOutput":
        setupOutputNode(nodeType);
        break;
      case "WorkflowLipSync":
        setupLipSyncNode(nodeType, nodeData, app);
        break;
    }
  },
  async setup(app) {
    // Ce code est exécuté lorsque l'extension est initialisée par ComfyUI
    addCustomMenu();
  },
  async init(app) {
    api
      .fetchApi("/flowchain/workflows")
      .then((response) => response.json())
      .then((data) => {
        app.lipsync_studio = data;
      })
      .catch((error) => {
        console.error("Error:", error);
        throw error;
      });

    const origRemoveNode = LGraphCanvas.prototype.removeNode;
    LGraphCanvas.prototype.removeNode = function (node) {
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
  },
});
