import { app } from "../../../scripts/app.js";
import { api } from '../../../scripts/api.js'
import { ComfyWidgets } from '../../../scripts/widgets.js'

const colors = ["#222222", "#5940bb", "#FFFFFF", "#7cbb1a", "#29699c", "#777788", "#268bd2", "#2ab7ca", "#d33682", "#dc322f", "#facfad","#77ff77", "#5940bb"]
const bg_colors = ["#000000", "#392978", "#89888d", "#496c12", "#19466a", "#4b4b56", "#165481", "#176974", "#851f50", "#911e1c", "#9f826b", "#499f49", "#392978"]
const node_type_list = ["none", "IMAGE", "MASK", "STRING", "INT", "FLOAT", "LATENT", "CLIP", "CONDITIONING", "MODEL", "VAE", "BOOLEAN", "SWITCH"]

function chainCallback(object, property, callback) {
    if (object == undefined) {
        console.error("Tried to add callback to non-existant object")
        return;
    }
    if (property in object) {
        const callback_orig = object[property]
        object[property] = function () {
            const r = callback_orig.apply(this, arguments);
            callback.apply(this, arguments);
            return r
        };
    } else {
        object[property] = callback;
    }
}

function useKVState(nodeType) {
    chainCallback(nodeType.prototype, "onNodeCreated", function () {
        chainCallback(this, "onConfigure", function(info) {
            if (!this.widgets) {
                //Node has no widgets, there is nothing to restore
                return
            }
            if (typeof(info.widgets_values) != "object") {
                //widgets_values is in some unknown inactionable format
                return
            }
            let widgetDict = info.widgets_values

            if (widgetDict.length == undefined) {
                for (let w of this.widgets) {
                    if (w.name in widgetDict) {
                        w.value = widgetDict[w.name];
                        if (w.name == "videopreview") {
                            w.updateSource();
                        }
                    }

                }
            }
        });
        chainCallback(this, "onSerialize", function(info) {
            info.widgets_values = {};
            if (!this.widgets) {
                //object has no widgets, there is nothing to store
                return;
            }
            for (let w of this.widgets) {
                info.widgets_values[w.name] = w.value;
            }
        });
    })
}


function addVideoPreview(nodeType) {
    chainCallback(nodeType.prototype, "onNodeCreated", function() {
        var element = document.createElement("div");
        const previewNode = this;
        var previewWidget = this.addDOMWidget("videopreview", "preview", element, {
            serialize: false,
            hideOnZoom: false,
            getValue() {
                return element.value;
            },
            setValue(v) {
                element.value = v;
            },
        });
        previewWidget.computeSize = function(width) {
            if (this.aspectRatio && !this.parentEl.hidden) {
                let height = (previewNode.size[0]-20)/ this.aspectRatio + 10;
                if (!(height > 0)) {
                    height = 0;
                }
                this.computedHeight = height + 10;
                return [width, height];
            }
            return [width, -4];//no loaded src, widget should not display
        }
        element.addEventListener('contextmenu', (e)  => {
            e.preventDefault()
            return app.canvas._mousedown_callback(e)
        }, true);
        element.addEventListener('pointerdown', (e)  => {
            e.preventDefault()
            return app.canvas._mousedown_callback(e)
        }, true);
        element.addEventListener('mousewheel', (e)  => {
            e.preventDefault()
            return app.canvas._mousewheel_callback(e)
        }, true);
        previewWidget.value = {hidden: false, paused: false, params: {}}
        previewWidget.parentEl = document.createElement("div");
        previewWidget.parentEl.className = "vhs_preview";
        previewWidget.parentEl.style['width'] = "100%"
        element.appendChild(previewWidget.parentEl);
        previewWidget.videoEl = document.createElement("video");
        previewWidget.videoEl.controls = false;
        previewWidget.videoEl.loop = true;
        previewWidget.videoEl.muted = true;
        previewWidget.videoEl.style['width'] = "100%"
        previewWidget.videoEl.addEventListener("loadedmetadata", () => {

            previewWidget.aspectRatio = previewWidget.videoEl.videoWidth / previewWidget.videoEl.videoHeight;
            fitHeight(this);
        });
        previewWidget.videoEl.addEventListener("error", () => {
            //TODO: consider a way to properly notify the user why a preview isn't shown.
            previewWidget.parentEl.hidden = true;
            fitHeight(this);
        });
        previewWidget.videoEl.onmouseenter =  () => {
            previewWidget.videoEl.muted = false;
        };
        previewWidget.videoEl.onmouseleave = () => {
            previewWidget.videoEl.muted = true;
        };

        previewWidget.imgEl = document.createElement("img");
        previewWidget.imgEl.style['width'] = "100%"
        previewWidget.imgEl.hidden = true;
        previewWidget.imgEl.onload = () => {
            previewWidget.aspectRatio = previewWidget.imgEl.naturalWidth / previewWidget.imgEl.naturalHeight;
            fitHeight(this);
        };

        var timeout = null;
        this.updateParameters = (params, force_update) => {
            if (!previewWidget.value.params) {
                if(typeof(previewWidget.value != 'object')) {
                    previewWidget.value =  {hidden: false, paused: false}
                }
                previewWidget.value.params = {}
            }
            Object.assign(previewWidget.value.params, params)
            timeout = setTimeout(() => previewWidget.updateSource(),100);
        };
        previewWidget.updateSource = function () {
            if (this.value.params == undefined) {
                return;
            }
            let params =  {}
            Object.assign(params, this.value.params);//shallow copy
            this.parentEl.hidden = this.value.hidden;
            if (params.format?.split('/')[0] == 'video' ||
                app.ui.settings.getSettingValue("VHS.AdvancedPreviews", false) &&
                (params.format?.split('/')[1] == 'gif') || params.format == 'folder') {
                this.videoEl.autoplay = !this.value.paused && !this.value.hidden;
                let target_width = 256
                if (element.style?.width) {
                    //overscale to allow scrolling. Endpoint won't return higher than native
                    target_width = element.style.width.slice(0,-2)*2;
                }
                if (!params.force_size || params.force_size.includes("?") || params.force_size == "Disabled") {
                    params.force_size = target_width+"x?"
                } else {
                    let size = params.force_size.split("x")
                    let ar = parseInt(size[0])/parseInt(size[1])
                    params.force_size = target_width+"x"+(target_width/ar)
                }
                if (app.ui.settings.getSettingValue("VHS.AdvancedPreviews", false)) {
                    this.videoEl.src = api.apiURL('/viewvideo?' + new URLSearchParams(params));
                } else {
                    previewWidget.videoEl.src = api.apiURL('/view?' + new URLSearchParams(params));
                }
                this.videoEl.hidden = false;
                this.imgEl.hidden = true;
            } else if (params.format?.split('/')[0] == 'image'){
                //Is animated image
                this.imgEl.src = api.apiURL('/view?' + new URLSearchParams(params));
                this.videoEl.hidden = true;
                this.imgEl.hidden = false;
            }
        }
        previewWidget.parentEl.appendChild(previewWidget.videoEl)
        previewWidget.parentEl.appendChild(previewWidget.imgEl)
    });
}
function fitHeight(node) {
    node.setSize([node.size[0], node.computeSize([node.size[0], node.size[1]])[1]])
    node?.graph?.setDirtyCanvas(true);
}
function addPreviewOptions(nodeType) {
    chainCallback(nodeType.prototype, "getExtraMenuOptions", function(_, options) {
        let optNew = []
        const previewWidget = this.widgets.find((w) => w.name === "videopreview");

        let url = null
        if (previewWidget.videoEl?.hidden == false && previewWidget.videoEl.src) {
            url = api.apiURL('/view?' + new URLSearchParams(previewWidget.value.params));
            url = url.replace('%2503d', '001')
        } else if (previewWidget.imgEl?.hidden == false && previewWidget.imgEl.src) {
            url = previewWidget.imgEl.src;
            url = new URL(url);
        }
        if (url) {
            optNew.push(
                {
                    content: "Open preview",
                    callback: () => {
                        window.open(url, "_blank")
                    },
                },
                {
                    content: "Save preview",
                    callback: () => {
                        const a = document.createElement("a");
                        a.href = url;
                        a.setAttribute("download", new URLSearchParams(previewWidget.value.params).get("filename"));
                        document.body.append(a);
                        a.click();
                        requestAnimationFrame(() => a.remove());
                    },
                }
            );
        }
        const PauseDesc = (previewWidget.value.paused ? "Resume" : "Pause") + " preview";
        if(previewWidget.videoEl.hidden == false) {
            optNew.push({content: PauseDesc, callback: () => {
                if(previewWidget.value.paused) {
                    previewWidget.videoEl?.play();
                } else {
                    previewWidget.videoEl?.pause();
                }
                previewWidget.value.paused = !previewWidget.value.paused;
            }});
        }
        //TODO: Consider hiding elements if no video preview is available yet.
        //It would reduce confusion at the cost of functionality
        //(if a video preview lags the computer, the user should be able to hide in advance)
        const visDesc = (previewWidget.value.hidden ? "Show" : "Hide") + " preview";
        optNew.push({content: visDesc, callback: () => {
            if (!previewWidget.videoEl.hidden && !previewWidget.value.hidden) {
                previewWidget.videoEl.pause();
            } else if (previewWidget.value.hidden && !previewWidget.videoEl.hidden && !previewWidget.value.paused) {
                previewWidget.videoEl.play();
            }
            previewWidget.value.hidden = !previewWidget.value.hidden;
            previewWidget.parentEl.hidden = previewWidget.value.hidden;
            fitHeight(this);

        }});
        optNew.push({content: "Sync preview", callback: () => {
            //TODO: address case where videos have varying length
            //Consider a system of sync groups which are opt-in?
            for (let p of document.getElementsByClassName("vhs_preview")) {
                for (let child of p.children) {
                    if (child.tagName == "VIDEO") {
                        child.currentTime=0;
                    } else if (child.tagName == "IMG") {
                        child.src = child.src;
                    }
                }
            }
        }});
        if(options.length > 0 && options[0] != null && optNew.length > 0) {
            optNew.push(null);
        }
        options.unshift(...optNew);
    });
}
function addLoadVideoCommon(nodeType, nodeData) {
    addVideoPreview(nodeType);
    addPreviewOptions(nodeType);
}
function cleanInputs(root_obj, start_index = 2, reset_value=true) {
    //nodeData.input.required = {};
    /*
    if (!root_obj.inputs) root_obj.inputs = [];
    if (!root_obj.outputs) root_obj.outputs = [];
    if (!root_obj.widgets) root_obj.widgets = [];
    if (!root_obj.widgets_values) root_obj.widgets_values = [];
    */
    // Disconnect all links first
    for (let i = 0; i < root_obj.outputs.length; i++) {
        const output = root_obj.outputs[i];
        if (output.links && output.links.length) {
            // Make a copy of the links array because it will be modified during disconnection
            const links = output.links.slice();
            for (const linkId of links) {
                root_obj.graph.removeLink(linkId);
            }
        }
    }
    
    // Same for inputs
    for (let i = 0; i < root_obj.inputs.length; i++) {
        const input = root_obj.inputs[i];
        if (input.link) {
            root_obj.graph.removeLink(input.link);
        }
    }


    root_obj.widgets = root_obj.widgets.splice(0,start_index)
    if(reset_value){
        root_obj.widgets_values = [];
        /*
        for (let key in root_obj.widgets_values) {
            if (key != "workflows"){
                delete root_obj.widgets_values[key];
            }
        }*/
        const max_node_output = root_obj.outputs.length;
        for(let i = 0; i<max_node_output; i++)
            root_obj.removeOutput(0)
    }

    const max_node_input = root_obj.inputs.length;
    for(let i = 0; i<max_node_input; i++)
        root_obj.removeInput(0)
    /*
    if (root_obj.graph) {
        root_obj.graph.setDirtyCanvas(true);
        root_obj.graph.change();
    }*/

}
function clearInputs(root_obj, reset_value=true) {
    //nodeData.input.required = {};

    if (!root_obj.widgets_values) root_obj.widgets_values = [];

    // Déconnecter tous les liens d'abord pour les entrées
    for (let i = 0; i < root_obj.outputs.length; i++) {
        const output = root_obj.outputs[i];
        if (output.links && output.links.length) {
            const links = output.links.slice();
            for (const linkId of links) {
                root_obj.graph.removeLink(linkId);
            }
        }
    }

    // Parcourir les entrées en sens inverse pour éviter les problèmes d'indice
    for (let i = root_obj.inputs.length - 1; i >= 0; i--) {
        const input = root_obj.inputs[i];
        if ((input.name === "default" || input.name === "input") && input.link) {
            root_obj.graph.removeLink(input.link);
        }
    }

    for(let i = 0; i<root_obj.inputs.length; i++){
        if (root_obj.inputs[i].name == "default" || root_obj.inputs[i].name == "input"){
            root_obj.removeInput(i);
        }
    }

    root_obj.widgets = root_obj.widgets.splice(0,2)
    if(reset_value){
        for (let key in root_obj.widgets_values) {
            if (key != "Name" && key != "type"){
                delete root_obj.widgets_values[key];
            }
        }
    }

    const max_node_input = root_obj.outputs.length;
    for(let i = root_obj.outputs.length - 1; i >= 0; i--)
        root_obj.removeOutput(i);
    /*
    if (root_obj.graph) {
        root_obj.graph.setDirtyCanvas(true);
        root_obj.graph.change();
    }*/

}
/*
function addWidgetType(root_obj, value, nodeData){
    if (!root_obj.widgets) {
        root_obj.widgets = [];
    }
    if (!root_obj.inputs) {
        root_obj.inputs = [];
    }
    const field_name = value.Name
    const type = value.type
    if (type == "IMAGE" && root_obj.inputs.filter(i => i.name === field_name).length == 0){
        root_obj.addInput(field_name, "IMAGE");
        
    }
    
    //const input_value = root_obj.widgets.length + 1 < root_obj.widgets_values.length?root_obj.widgets_values[root_obj.widgets.length]:value.default;
    if (type == "STRING" || type =="text"){
        ComfyWidgets.STRING(root_obj, field_name,  ['STRING', {default: value.default},], app,)
        if (nodeData.input.required == undefined) nodeData.input.required = {};
        //nodeData.input.required[field_name] = ["STRING", {"min": 0, "max": 18446744073709551616, "step": 1}]
        root_obj.local_input_defs.required[field_name] = ["STRING", {}];

     }

    if (type == "INT"){
        ComfyWidgets.INT(
            root_obj,
            field_name,
            ['INT',{default: value.default},], app,)
        if (nodeData.input.required == undefined) nodeData.input.required = {};
        //nodeData.input.required[field_name] = ["INT", {"min": 0, "max": 18446744073709551616, "step": 1}]
        root_obj.local_input_defs.required[field_name] = ["INT", {"min": 0, "max": 18446744073709551616, "step": 1}];

        
    }
    if (type == "FLOAT"){
        ComfyWidgets.FLOAT(
            root_obj,
            field_name,
            ['FLOAT',{default: value.default, "min": 0.00, "max": 2048.00, "step": 0.01},],
            app,
        )
        if (nodeData.input.required == undefined) nodeData.input.required = {};
        //nodeData.input.required[field_name] = ["FLOAT", {"min": 0.00, "max": 2048.00, "step": 0.01}]
        root_obj.local_input_defs.required[field_name] = ["FLOAT", {"min": 0.00, "max": 2048.00, "step": 0.01}];

    }

    if (type == "BOOLEAN"){
        root_obj.addWidget("toggle",field_name,  value.default, ()=>{});
        const widget = root_obj.inputs.filter(i => i.name === field_name);
        if(widget.length > 0)
            app.convertToWidget(root_obj, widget[0]);
    }

    if (type == "LATENT") root_obj.addInput(field_name, "LATENT");
    if (type == "MODEL") root_obj.addInput(field_name, "MODEL");
    if (type == "CLIP") root_obj.addInput(field_name, "CLIP");
    if (type == "MASK") root_obj.addInput(field_name, "MASK");
    if (type == "CONDITIONING") root_obj.addInput(field_name, "CONDITIONING");
    if (type == "VAE") root_obj.addInput(field_name, "VAE");
}

*/
async function convertWorkflowToApiFormat(standardWorkflow) {
    try {
        return new Promise((resolve, reject) => {
            // Sauvegarder les prototypes originaux de onConfigure pour tous les types de nœuds
            const originalCallbacks = new Map();
            
            // Temporairement désactiver tous les callbacks onConfigure
            for (const nodeTypeName in LiteGraph.registered_node_types) {
                const nodeType = LiteGraph.registered_node_types[nodeTypeName];
                if (nodeType.prototype.onConfigure) {
                    originalCallbacks.set(nodeTypeName, nodeType.prototype.onConfigure);
                    nodeType.prototype.onConfigure = function() {}; // Fonction vide
                }
            }
            
            // Sauvegarder l'état des callbacks du graphe principal
            const originalOnConfigure = LGraph.prototype.onConfigure;
            LGraph.prototype.onConfigure = function() {}; // Désactiver temporairement
            
            try {
                // Créer un graph temporaire isolé
                const tempGraph = new LGraph();
                
                // Configurer sans déclencher de callbacks
                tempGraph.configure(standardWorkflow);
                
                // Sauvegarder la référence du graphe original
                const originalGraph = app.graph;
                
                // Utiliser graphToPrompt en mode isolé
                app.graph = tempGraph;
                
                app.graphToPrompt(tempGraph)
                    .then(apiData => {
                        // Restaurer le graphe original
                        app.graph = originalGraph;
                        
                        // Résoudre avec le format API
                        resolve(apiData.output);
                    })
                    .catch(error => {
                        console.error("Erreur lors de la conversion:", error);
                        reject(error);
                    })
                    .finally(() => {
                        // Nettoyer le graphe temporaire
                        tempGraph.clear();
                        
                        // Assurer que toutes les références sont supprimées
                        if (tempGraph._nodes) {
                            while (tempGraph._nodes.length > 0) {
                                tempGraph.remove(tempGraph._nodes[0]);
                            }
                            tempGraph._nodes = null;
                        }
                        
                        // Supprimer les écouteurs d'événements
                        tempGraph.removeAllListeners && tempGraph.removeAllListeners();
                        tempGraph._links = null;
                        
                        // Restaurer tous les callbacks originaux
                        for (const [nodeTypeName, callback] of originalCallbacks.entries()) {
                            LiteGraph.registered_node_types[nodeTypeName].prototype.onConfigure = callback;
                        }
                        
                        // Restaurer le callback du graphe
                        LGraph.prototype.onConfigure = originalOnConfigure;
                        
                        console.log("Conversion terminée et sandbox nettoyée");
                    });
            } catch (error) {
                // En cas d'erreur, restaurer les callbacks et rejeter
                for (const [nodeTypeName, callback] of originalCallbacks.entries()) {
                    LiteGraph.registered_node_types[nodeTypeName].prototype.onConfigure = callback;
                }
                LGraph.prototype.onConfigure = originalOnConfigure;
                
                reject(error);
            }
        });
    } catch (error) {
        console.error("Erreur lors de la préparation du graph:", error);
        throw error;
    }
}

async function importWorkflow(root_obj, workflow_path, app, nodeData, reset_values=true){
    const filename = workflow_path.replace(/\\/g, '/').split("/");
    root_obj.title = "Workflow: "+filename[filename.length-1].replace(".json", "").replace(/_/g, " ");
    

    return api.fetchApi("/flowchain/workflow?workflow_path="+workflow_path)
        .then(response => response.json())
        .then(async data => {
            //cleanInputs(root_obj,nodeData, reset_values);
            
            let workflow = data.workflow;
            app.lipsync_studio[workflow_path] = data;
            
            // Si c'est un format standard, le convertir en format API
            if ("nodes" in workflow) {
                try {
                    workflow = await convertWorkflowToApiFormat(workflow);
                } catch (error) {
                    console.error("Échec de la conversion du workflow:", error);
                    return false;
                }
            }
            
            if (!workflow) {
                console.error('Workflow invalide ou échec de conversion');
                return false;
            }
            /*
            // Traiter le workflow API
            const nodes_input = Object.fromEntries(
                Object.entries(workflow).filter(([k, v]) => v.class_type == "WorkflowInput")
            );

            const nodes_output = Object.fromEntries(
                Object.entries(workflow).filter(([k, v]) => v.class_type == "WorkflowOutput")
            );
            root_obj.widgets[1].value = JSON.stringify(workflow);
            
            
            Object.entries(nodes_input).forEach(node => {
                addWidgetType(root_obj, node[1].inputs, nodeData);
            });

            // Ajouter les sorties
            Object.entries(nodes_output).forEach(node => {
                root_obj.addOutput(`${node[1].inputs.Name}`, node[1].inputs.type);
            });
            
            

            root_obj.size[0] = 400;*/
            return JSON.stringify(workflow);
        
        })
        .catch(error => {
            console.error('Erreur lors de l\'importation:', error);
            return false;
        });
}

function addWidgets(root_obj, field_name, value, app){
    let type = value.type;
    if (type == "converted-widget"){
        type = value.origType;
    }
    
    // S'assurer que le nœud a un objet de stockage local pour ses définitions d'entrée
    if (!root_obj.local_input_defs) {
        root_obj.local_input_defs = {
            required: {},
            optional: {}
        };
    }
    
    if ((type == "STRING" || type =="text") && field_name != "workflow"){
        ComfyWidgets.STRING(root_obj, field_name, ['STRING',{default: value.value,},],app,)
        // Stocker la définition localement au lieu de modifier nodeData
        root_obj.local_input_defs.required[field_name] = ["STRING", {}];
    }
    
    if (type == "INT" || type == "number"){
        ComfyWidgets.INT(
            root_obj,
            field_name,
            ['INT',{default: value.value, "min": 0, "max": 18446744073709551616, "step": 1},],
            app,
        )
        // Stocker la définition localement
        root_obj.local_input_defs.required[field_name] = ["INT", {"min": 0, "max": 18446744073709551616, "step": 1}];
    }
    
    if (type == "FLOAT"){
        ComfyWidgets.FLOAT(
            root_obj,
            field_name,
            ['FLOAT',{default: value.value, "min": 0.00, "max": 2048.00, "step": 0.01},],
            app,
        )
        // Stocker la définition localement
        root_obj.local_input_defs.required[field_name] = ["FLOAT", {"min": 0.00, "max": 2048.00, "step": 0.01}];
    }
    
    if (type == "BOOLEAN" || type == "toggle"){
        root_obj.addWidget("toggle",field_name, value.value, ()=>{});
        // Stocker la définition localement
        root_obj.local_input_defs.required[field_name] = ["BOOLEAN", {}];
    }
    
    if (field_name == "workflow"){
        root_obj.addWidget("STRING", field_name, value.value, ()=>{});
        root_obj.widgets[root_obj.widgets.length - 1].hidden = true;
        // Stocker la définition localement 
        root_obj.local_input_defs.required[field_name] = ["STRING", {}];
    }
    if (type == "LATENT") root_obj.addInput(field_name, "LATENT");
    if (type == "MODEL") root_obj.addInput(field_name, "MODEL");
    if (type == "CLIP") root_obj.addInput(field_name, "CLIP");
    if (type == "MASK") root_obj.addInput(field_name, "MASK");
    if (type == "CONDITIONING") root_obj.addInput(field_name, "CONDITIONING");
    if (type == "VAE") root_obj.addInput(field_name, "VAE");
}

function addOutputs(root_obj, workflow_name){
    const outputs = app.lipsync_studio[workflow_name].outputs;
    for (let [key, value] of Object.entries(outputs)){
        const isoutput = root_obj.outputs.find(i => i.name == value.inputs.Name.value);
        if (!isoutput){
            root_obj.addOutput(value.inputs.Name.value, value.inputs.type.value);
        }
    }
}

// change

function hideWidget(
    node,
    widget,
    options = {}
  ) {
    const { suffix = '', holdSpace = true } = options
  
    if (widget.type?.startsWith("converted-widget")) return
    widget.origType = widget.type
    widget.origComputeSize = widget.computeSize
    widget.origSerializeValue = widget.serializeValue
    // @ts-expect-error custom widget type
    widget.type = "converted-widget" + suffix
    if (holdSpace) {
        widget.computeSize = () => [0, LiteGraph.NODE_WIDGET_HEIGHT]
        widget.serializeValue = (node, index) => {
            // Prevent serializing the widget if we have no input linked
            if (!node.inputs) {
              return undefined
            }
            let node_input = node.inputs.find((i) => i.widget?.name === widget.name)
        
            if (!node_input || !node_input.link) {
              return undefined
            }
            return widget.origSerializeValue
              ? widget.origSerializeValue(node, index)
              : widget.value
        }
    } else {
        // -4 is due to the gap litegraph adds between widgets automatically
        widget.computeSize = () => [0, -4]
        widget.serializeValue = (node, index) => {
            return widget.origSerializeValue
                ? widget.origSerializeValue(node, index)
                : widget.value
        }   
    }


  
    // Hide any linked widgets, e.g. seed+seedControl
    if (widget.linkedWidgets) {
      for (const w of widget.linkedWidgets) {
        hideWidget(node, w, { suffix: ':' + widget.name, holdSpace: false })
      }
    }
  }

  
  function getWidgetType(config) {
    // Special handling for COMBO so we restrict links based on the entries
    let type = config[0]
    if (type instanceof Array) {
      type = 'COMBO'
    }
    return { type }
  }

  const GET_CONFIG = Symbol()

  export function convertToInput(
    node,
    widget,
    config
  ) {
    hideWidget(node, widget)
  
    const { type } = getWidgetType(config)
  
    // Add input and store widget config for creating on primitive node
    const [oldWidth, oldHeight] = node.size

    for (const widget of node.widgets) {
      widget.last_y += LiteGraph.NODE_SLOT_HEIGHT
    }
  
    // Restore original size but grow if needed
    node.setSize([
      Math.max(oldWidth, node.size[0]),
      Math.max(oldHeight, node.size[1])
    ])
    return node
  }
  
export function addInputs(root_obj, inputs, widgets_values){
    

    let start_index = 2;
    for (let [key, value] of Object.entries(inputs)){
        const isinput = root_obj.inputs.find(i => i.name == value.inputs[0]);
        const isWidget = root_obj.widgets.find(w => w.name == value.inputs[0]);
        
        if (!isWidget && (!isinput||isinput.widget)){
            if (value.inputs[2]){
                const values = widgets_values[start_index] ?? value.inputs[2];
                const widget_param = {value: values, type: value.inputs[1]}
                //const widget_param = {value: widgets_values[start_index], type: value.inputs.default.type}
                addWidgets(root_obj, value.inputs[0], widget_param, app);
                if (isinput){
                    //node.removeInput(node.inputs.findIndex((i) => i.widget?.name === widget.name))
                    const config = [value.inputs[2]]
                    convertToInput(root_obj, root_obj.widgets[start_index], config)
                }
                start_index += 1;
            }else{
                const input_param = {type: value.inputs[1]};
                addWidgets(root_obj, value.inputs[0], input_param, app);
            }
        }
    }

}

app.registerExtension({
	name: "FlowChain.jsnodes",
	async beforeRegisterNodeDef(nodeType, nodeData, app) {
		if(!nodeData?.category?.startsWith("FlowChain")) {
		    return;
		}

		switch (nodeData.name) {
			case "Workflow":
                nodeType.prototype.onNodeCreated =  function() {
                    chainCallback(this, "onConfigure", function(info) {
                        //let widgetDict = info.widgets_values
                        if (info.widgets_values[0] != "None"){
                                //this.widgets[1].value = importWorkflow(this, info.widgets_values[0], app, nodeData)
                            //if (this.widgets.length==2){
                                const inputs = app.lipsync_studio[info.widgets_values[0]].inputs;
                                addInputs(this, inputs, info.widgets_values);
                                addOutputs(this, info.widgets_values[0]);
                                importWorkflow(this, info.widgets_values[0], app, nodeData)
                                    .then(data => {
                                        if (data){
                                            this.widgets[1].value = data;
                                            const inputs = app.lipsync_studio[info.widgets_values[0]].inputs;
                                            addInputs(this, inputs, info.widgets_values);
                                            addOutputs(this, info.widgets_values[0]);
                                            importWorkflow(this, info.widgets_values[0], app, nodeData)
                                        }
                                    })
                                    .catch(error => {
                                        console.error('Erreur lors de l\'importation:', error);
                                    });

                                /*
                                if (info.widgets_values[1] != this.widgets[1].value){
                                    this.widgets[1].value = info.widgets_values[1];
                                }
                                const inputs = app.lipsync_studio[info.widgets_values[0]].inputs;

                                let start_index = 2;
                                for (let [key, value] of Object.entries(inputs)){
                                    const isinput = this.inputs.find(i => i.name == value.inputs.Name.value);
                                    const isWidget = this.widgets.find(w => w.name == value.inputs.Name.value);
                                    if (!isWidget && (!isinput||isinput.widget)){
                                        const widget_param = {value: info.widgets_values[start_index], type: value.inputs.default.type}
                                        addWidgets(this, value.inputs.Name.value, widget_param, app, nodeData);
                                        if (isinput){
                                            //node.removeInput(node.inputs.findIndex((i) => i.widget?.name === widget.name))
                                            const config = [value.inputs.default.type]
                                            convertToInput(this, this.widgets[start_index], config)
                                        }
                                        start_index += 1;
                                    }
                                }*/
                            //}
                            /* 
                            if(info.widgets_values[0] != "None")
                                api.fetchApi("/flowchain/workflow?workflow_path="+info.widgets_values[0])
                                    .then(response => response.json())
                                    .then(async data => {
                                        cleanInputs(this);
                                        app.lipsync_studio[info.widgets_values[0]] = data;
                                        addInputs(this, info.widgets_values[0], info.widgets_values);
                                    })
                                    .catch(error => {
                                        console.error('Erreur lors de l\'importation:', error);
                                    });*/
                        }
                    });
                    
                    chainCallback(this, "onSerialize", function(info) {
                        for (let w of this.inputs){
                            // if w.name exists in info.widgets_values

                            if (w.widget){
                                if (w.type != this.local_input_defs.required[w.name][0])
                                    w.type = this.local_input_defs.required[w.name][0];
                            }
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
                            addInputs(this, inputs, {});
                            addOutputs(this, value);
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
			    break;
			case "WorkflowInput":
			    nodeType.prototype.onNodeCreated =  function() {
                    chainCallback(this, "onConfigure", function(info) {
                        let widgetDict = info.widgets_values;
                        const inputs = {};

                        inputs["default"] = {
                            inputs: ["default", info.widgets_values[1], info.widgets_values[2]]
                                /*
                                default:{value: info.widgets_values[2], type: info.widgets_values[1]},
                                Name: {value: "default", type: "STRING"},
                                type: {value: info.widgets_values[1], type: "COMBO"}*/
                        };

                        addInputs(this, inputs, info.widgets_values);
                        /*
                        const inputs = {};
                        for (let [k, value] of Object.entries(info.widgets_values)) {
                            if (k == "default"){
                                inputs[k] = {
                                    inputs: {
                                        default:{value: value.value, type: info.widgets_values.default.type}, 
                                        Name: {value: k, type: "STRING"},
                                        type: {value: info.widgets_values.default.type, type: "STRING"}
                                    }
                                };
                            }else{
                                inputs[k] = {
                                    inputs: {
                                        default:{value: value.value, type: value.type}, 
                                        Name: {value: k, type: value.type},
                                        type: {value: value.type, type: value.type}
                                    }
                                };
                            }
                        }
                        let widgetDict = {};
                        if(info.widgets_values.default)
                            widgetDict = [info.widgets_values.Name.value, info.widgets_values.default.type, info.widgets_values.default.value];
                        else
                            widgetDict = [info.widgets_values.Name.value, info.widgets_values.type.value];

                        addInputs(this, inputs, widgetDict);*/
                        /*if (info.widgets_values.length == undefined) {
                            
                            
                            for (let w of this.widgets) {
                                if (w.name in widgetDict) {
                                    w.value = widgetDict[w.name].value;
                                }
                            }

                            // check if widgetDict in this.widgets
                            for (let [key, value] of Object.entries(widgetDict)) {
                                let widget = this.widgets.find(w => w.name === key);
                                let type = this.widgets.find(w => w.name === "type");
                                if(!widget){
                                    let widget_param = {}
                                    if (value.name == "default"){
                                        widget_param = {value: value.value, type: type.value}
                                    }else{
                                        widget_param = value;
                                    }
                                    // addWidgets(this, key, widget_param, app);
                                    addInputs(this, {inputs: {Name: {value: key}, type: {value: type.value}}}, widgetDict);
                                    widget = this.widgets.find(w => w.name === key);
                                }
                                    //this.widgets.push(value);
                                widget.options = info.widgets_values[key].options;
                                widget.value = info.widgets_values[key].value;
                                //if value exists in inputs

                                for (let input of this.inputs){
                                    if (input.name == key){
                                        //find if key exists in inputs array in inputs.Name
                                        if (info.widgets_values[key].type != "converted-widget"){
                                            this.removeInput(this.inputs.indexOf(input));
                                        }
                                        break;
                                    }
                                }

                            }
                        }
                        // get inputs by name

                        for (let w of this.inputs){
                            if (w.name=="default"){
                                w.type = info.widgets_values.type.value;
                            }
                        }
                        if (info.outputs_values != undefined){
                            // deep copy outputs
                            if(this.id == -1){
                                this.outputs[0] = {links: null, name: info.outputs_values.name, type: info.outputs_values.type};
                            }else{
                                this.outputs[0] = {...info.outputs_values};
                            }
                        }
                        this.setSize(info.size);*/

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
                        /*
                        info.widgets_values = {};
                        if (!this.widgets) {
                            return;
                        }

                        for (let w of this.widgets) {
                            if (w.name == "default"){
                                const default_type = this.inputs.find(i => i.name == "default");
                                if (default_type)
                                    info.widgets_values[w.name] = {name: w.name, options : w.options, value: w.value, type: default_type.type};
                                else
                                    info.widgets_values[w.name] = {name: w.name, options : w.options, value: w.value, type: info.widgets_values.type.value};
                            }else{
                                info.widgets_values[w.name] = {name: w.name, options : w.options, value: w.value, type: w.type};
                            }
                        }*/
                        /*
                        for (let w of this.inputs){
                            // if w.name exists in info.widgets_values
                            if (info.widgets_values[w.name]){
                                w.type = info.widgets_values[w.name].type;
                                if(info.widgets_values[w.name].type == "converted-widget"){
                                    if(info.widgets_values[w.name].origType == "toggle"){
                                        w.type = "BOOLEAN";
                                    }else if(info.widgets_values[w.name].origType == "text"){
                                        w.type = "STRING";
                                    }
                                }
                            }
                        }
                        // deep copy outputs without reference
                        if (this.outputs.length > 0){
                            if (this.outputs[0].links == null){
                                info.outputs_values = {links: null, name: this.outputs[0].name, type: this.outputs[0].type};
                            }else{
                                info.outputs_values = {links: [...this.outputs[0].links], name: this.outputs[0].name, slot_index: this.outputs[0].slot_index, type: this.outputs[0].type};
                            }
                        }
                            
                        this.setSize(info.size);*/
                    });

                    this.widgets[1].callback =  ( value ) => {
                        // D'abord, déconnecter tous les liens existants
                        /*for (let i = 0; i < this.outputs.length; i++) {
                            const output = this.outputs[i];
                            if (output.links && output.links.length) {
                                const links = output.links.slice();
                                for (const linkId of links) {
                                    this.graph.removeLink(linkId);
                                }
                            }
                        }
                        
                        for (let i = 0; i < this.inputs.length; i++) {
                            const input = this.inputs[i];
                            if (input.link) {
                                this.graph.removeLink(input.link);
                            }
                        }
                        clearInputs(this);*/
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
			    break;
			case "WorkflowContinue":
			    nodeType.prototype.onNodeCreated =  function() {
                    chainCallback(this, "onConfigure", function(info) {
                        let widgetDict = info.widgets_values
                        if (info.widgets_values.length == undefined) {

                            for (let w of this.widgets) {
                                if (w.name in widgetDict) {
                                    w.value = widgetDict[w.name].value;
                                }
                            }
                            // check if widgetDict in this.widgets
                            for (let [key, value] of Object.entries(widgetDict)) {
                                let widget = this.widgets.find(w => w.name === key);
                                let type = this.widgets.find(w => w.name === "type");
                                if(!widget){
                                    addWidgets(this, key, value, app);
                                    widget = this.widgets.find(w => w.name === key);
                                }
                                    //this.widgets.push(value);
                                widget.options = info.widgets_values[key].options;
                                widget.value = info.widgets_values[key].value;
                                //if value exists in inputs

                                for (let input of this.inputs)
                                    if (input.name == key){
                                        //find if key exists in inputs array in inputs.Name
                                        if (info.widgets_values[key].type != "converted-widget"){
                                            this.removeInput(this.inputs.indexOf(input));
                                        }
                                        break;
                                    }
                            }
                        }

                        if (info.outputs_values != undefined){
                            // deep copy outputs
                            if(this.id == -1){
                                this.outputs[0] = {links: null, name: info.outputs_values.name, type: info.outputs_values.type};
                            }else{
                                this.outputs[0] = {...info.outputs_values};
                            }
                        }
                        this.setSize(info.size);
                    });
                    chainCallback(this, "onSerialize", function(info) {
                        info.widgets_values = {};
                        if (!this.widgets) {
                            return;
                        }

                        for (let w of this.widgets) {
                            info.widgets_values[w.name] = {name: w.name, options : w.options, value: w.value, type: w.type, origType: w.origType, last_y: w.last_y};
                        }
                        for (let w of this.inputs){
                            // if w.name exists in info.widgets_values
                            if (info.widgets_values[w.name]){
                                if(info.widgets_values[w.name].type == "converted-widget"){
                                    if(info.widgets_values[w.name].origType == "toggle"){
                                        w.type = "BOOLEAN";
                                    }else if(info.widgets_values[w.name].origType == "combo"){
                                        w.type = "COMBO";
                                    }
                                }
                            }
                        }
                        for (let w of this.inputs){
                            if (w.name=="input"){
                                w.type = info.widgets_values.type.value;
                            }
                        }
                        if (this.outputs.length > 0){
                            if (this.outputs[0].links == null){
                                info.outputs_values = {links: null, name: this.outputs[0].name, type: this.outputs[0].type};
                            }else{
                                info.outputs_values = {links: [...this.outputs[0].links], name: this.outputs[0].name, slot_index: this.outputs[0].slot_index, type: this.outputs[0].type};
                            }
                        }
                        this.setSize(info.size);
                    });

                    this.widgets[0].callback =  ( value ) => {
                        clearInputs(this);
                        this.addOutput("output", value);
                        this.addInput("input", value);
                        this.color = colors[node_type_list.indexOf(value)];
                        this.bgcolor = bg_colors[node_type_list.indexOf(value)];
                    };
                    this.color = colors[node_type_list.indexOf("none")];
                    this.bgcolor = bg_colors[node_type_list.indexOf("none")];
                }
			    break;
			case "WorkflowOutput":
			    nodeType.prototype.onNodeCreated =  function() {
                    chainCallback(this, "onConfigure", function(info) {
                        let widgetDict = info.widgets_values
                        if (info.widgets_values.length == undefined) {

                            for (let w of this.widgets) {
                                if (w.name in widgetDict) {
                                    w.value = widgetDict[w.name].value;
                                }
                            }
                            // check if widgetDict in this.widgets
                            for (let [key, value] of Object.entries(widgetDict)) {
                                let widget = this.widgets.find(w => w.name === key);
                                let type = this.widgets.find(w => w.name === "type");
                                if(!widget){
                                    addWidgets(this, key, value, app);
                                    widget = this.widgets.find(w => w.name === key);
                                }
                                    //this.widgets.push(value);
                                widget.options = info.widgets_values[key].options;
                                widget.value = info.widgets_values[key].value;
                                //if value exists in inputs

                                for (let input of this.inputs){
                                    if (input.name == key){
                                        //find if key exists in inputs array in inputs.Name
                                        if (info.widgets_values[key].type != "converted-widget"){
                                            this.removeInput(this.inputs.indexOf(input));
                                        }
                                        break;
                                    }
                                }

                            }
                        }

                        for (let w of this.inputs){
                            if (w.name=="default"){
                                w.type = info.widgets_values.type.value;
                            }
                        }
                        if (info.outputs_values != undefined){
                            // deep copy outputs
                            if(this.id == -1){
                                this.outputs[0] = {links: null, name: info.outputs_values.name, type: info.outputs_values.type};
                            }else{
                                this.outputs[0] = {...info.outputs_values};
                            }
                        }

                    });
                    chainCallback(this, "onSerialize", function(info) {
                        info.widgets_values = {};
                        if (!this.widgets) {
                            return;
                        }

                        for (let w of this.widgets) {
                            info.widgets_values[w.name] = {name: w.name, options : w.options, value: w.value, type: w.type, origType: w.origType, last_y: w.last_y};
                        }


                        for (let w of this.inputs){
                            // if w.name exists in info.widgets_values
                            if (info.widgets_values[w.name]){
                                if(info.widgets_values[w.name].type == "converted-widget"){
                                    if(info.widgets_values[w.name].origType == "toggle"){
                                        w.type = "BOOLEAN";
                                    }else if(info.widgets_values[w.name].origType == "text"){
                                        w.type = "STRING";
                                    }
                                }
                            }
                        }
                        if (this.outputs.length > 0){
                            if (this.outputs[0].links == null){
                                info.outputs_values = {links: null, name: this.outputs[0].name, type: this.outputs[0].type};
                            }else{
                                info.outputs_values = {links: [...this.outputs[0].links], name: this.outputs[0].name, slot_index: this.outputs[0].slot_index, type: this.outputs[0].type};
                            }
                        }
                        this.setSize(info.size);
                    });
                    this.widgets[1].callback =  ( value ) => {
                        // D'abord, déconnecter tous les liens existants
                        for (let i = 0; i < this.outputs.length; i++) {
                            const output = this.outputs[i];
                            if (output.links && output.links.length) {
                                const links = output.links.slice();
                                for (const linkId of links) {
                                    this.graph.removeLink(linkId);
                                }
                            }
                        }
                        
                        for (let i = 0; i < this.inputs.length; i++) {
                            const input = this.inputs[i];
                            if (input.link) {
                                this.graph.removeLink(input.link);
                            }
                        }
                        clearInputs(this);
                        switch(value){
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
                    if (this.widgets[1].value == "none") clearInputs(this);
                    this.color = colors[node_type_list.indexOf("none")];
                    this.bgcolor = bg_colors[node_type_list.indexOf("none")];
                }
			    break;
			case "WorkflowLipSync":
                useKVState(nodeType);
                chainCallback(nodeType.prototype, "onNodeCreated", function () {
                    let new_widgets = []
                    if (this.widgets) {
                        for (let w of this.widgets) {
                            let input = this.constructor.nodeData.input
                            let config = input?.required[w.name] ?? input.optional[w.name]
                            if (!config) {
                                continue
                            }
                            if (w?.type == "text" && config[1].vhs_path_extensions) {
                                new_widgets.push(app.widgets.VHSPATH({}, w.name, ["VHSPATH", config[1]]));
                            } else {
                                new_widgets.push(w)
                            }
                        }
                        this.widgets = new_widgets;
                    }
                });
                addLoadVideoCommon(nodeType, nodeData);
                const onGetImageSizeExecuted = nodeType.prototype.onExecuted;
				nodeType.prototype.onExecuted = function(message) {
					const r = onGetImageSizeExecuted? onGetImageSizeExecuted.apply(this,arguments): undefined
					let video = message["video_path"][0];
					if(video){
                        this.updateParameters({format: "video/mp4", filename: message["video_path"][0], subfolder: message["video_path"][1], "type": "output"});
                    }
					return r
				}
			    break;
    	}
    },
    async init(app) {
        api.fetchApi("/flowchain/workflows")
            .then(response => response.json())
            .then(data => {
                app.lipsync_studio = data
            })
            .catch(error => {
                console.error('Error:', error);
                throw error;
            });


        const origRemoveNode = LGraphCanvas.prototype.removeNode;
        LGraphCanvas.prototype.removeNode = function(node) {
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
    }
});