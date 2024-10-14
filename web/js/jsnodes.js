import { app } from "../../../scripts/app.js";
import { api } from '../../../scripts/api.js'
import { ComfyWidgets } from '../../../scripts/widgets.js'
const client_id = '5b49a023-b05a-4c53-8dc9-addc3a749911'

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
function cleanInputs(root_obj, reset_value=true) {
    if (!root_obj.inputs) {
        root_obj.inputs = [];
    }
    if (!root_obj.outputs) {
        root_obj.outputs = [];
    }
    if (!root_obj.widgets) {
        root_obj.widgets = [];
        //root_obj.widgets_values = [];
    }
    if (!root_obj.widgets_values) {
        root_obj.widgets_values = [];
    }

    root_obj.widgets = root_obj.widgets.splice(0,3)
    if(reset_value){
        for (let key in root_obj.widgets_values) {
            if (key != "workflows" && key != "workflow_api_path" && key != "Import Workflow"){
                delete root_obj.widgets_values[key];
            }
        }
        const max_node_output = root_obj.outputs.length;
        for(let i = 0; i<max_node_output; i++)
            root_obj.removeOutput(0)
    }

    const max_node_input = root_obj.inputs.length;
    for(let i = 0; i<max_node_input; i++)
        root_obj.removeInput(0)

}
function clearInputs(root_obj, reset_value=true) {
    if (!root_obj.inputs) {
        root_obj.inputs = [];
    }
    if (!root_obj.outputs) {
        root_obj.outputs = [];
    }
    if (!root_obj.widgets) {
        root_obj.widgets = [];
    }
    if (!root_obj.widgets_values) {
        root_obj.widgets_values = [];
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
    for(let i = 0; i<max_node_input; i++)
        root_obj.removeOutput(0)

}
function addWidgetType(root_obj, value){
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

    const input_value = root_obj.widgets.length + 1 < root_obj.widgets_values.length?root_obj.widgets_values[root_obj.widgets.length]:value.default;
    if (type == "STRING" || type =="text"){
        ComfyWidgets.STRING(root_obj, field_name,  ['STRING',{default: value.default,callback: () => {},},],app,)
     }

    if (type == "INT"){
        ComfyWidgets.INT(
            root_obj,
            field_name,
            ['',{default: input_value,callback: () => {},},], app,)
    }
    if (type == "FLOAT"){
        ComfyWidgets.FLOAT(
            root_obj,
            field_name,
            ['',{default: input_value,callback: (val) => console.log('VALUE', val), "min": 0.00, "max": 1.00, "step": 0.01},],
            app,
        )
        const widget = root_obj.inputs.filter(i => i.name === field_name);
        if(widget.length > 0)
            app.convertToWidget(root_obj, widget[0]);
    }

    if (type == "BOOLEAN"){

        root_obj.addWidget("toggle",field_name,  input_value, ()=>{});
        const widget = root_obj.inputs.filter(i => i.name === field_name);
        if(widget.length > 0)
            app.convertToWidget(root_obj, widget[0]);
    }

    if (type == "LATENT"){
        root_obj.addInput(field_name, "LATENT");
    }

    if (type == "MODEL"){
        root_obj.addInput(field_name, "MODEL");
    }


    if (type == "CLIP"){
        root_obj.addInput(field_name, "CLIP");
    }

    if (type == "MASK"){
        root_obj.addInput(field_name, "MASK");
    }

    if (type == "CONDITIONING"){
        root_obj.addInput(field_name, "CONDITIONING");
    }
    if (type == "VAE"){
        root_obj.addInput(field_name, "VAE");
    }

}

function importWorkflow(root_obj, workflow_path, app, reset_values=true){
    const filename = workflow_path.replace(/\\/g, '/').split("/");
    root_obj.title = "Workflow: "+filename[filename.length-1].replace(".json", "").replace(/_/g, " ");
    api.fetchApi("/flowchain/workflow?workflow_path="+workflow_path)
        .then(response => response.json())
        .then(data => {
            cleanInputs(root_obj, reset_values);
            if (data.error != "none"){
                return false
            }else{
                const workflow = data.workflow;
                console.log('Workflow:', workflow);
                const nodes_input = Object.fromEntries(
                    Object.entries(workflow).filter(([k, v]) => v.class_type == "WorkflowInput")
                );

                const nodes_output = Object.fromEntries(
                    Object.entries(workflow).filter(([k, v]) => v.class_type == "WorkflowOutput")
                );

                Object.fromEntries(
                    Object.entries(nodes_input).filter((node, idx) => addWidgetType(root_obj, node[1].inputs))
                );

                Object.fromEntries(
                    Object.entries(nodes_output).filter((node, idx) =>root_obj.addOutput(`${node[1].inputs.Name}`, node[1].inputs.type))
                );

                console.log('Nodes:', nodes_input);

                root_obj.size[0] = 400;
                return true
            }
        })
        .catch(error => {
            console.error('Error:', error);
            throw error; // Rilancia l'errore per consentire al chiamante di gestirlo
        });
}

function addWidgetInfo(root_obj, field_name, value, app){
    let type = value.type;
    if (type == "converted-widget"){
        type = value.origType;
    }
    if (type == "STRING" || type =="text"){
        ComfyWidgets.STRING(root_obj, field_name, ['STRING',{default: value.value,callback: () => {},},],app,)
    }
    if (type == "INT" || type == "number"){
        ComfyWidgets.INT(
            root_obj,
            field_name,
            ['',{default: value.value, callback: () => {},},],
            app,
        )
    }
    if (type == "FLOAT"){
        ComfyWidgets.FLOAT(
            root_obj,
            field_name,
            ['',{default: value.value, callback: (val) => console.log('VALUE', val),},],
            app,
        )
    }
    if (type == "BOOLEAN" || type == "toggle"){
        root_obj.addWidget("toggle",field_name,  value.value, ()=>{});
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
                        let widgetDict = info.widgets_values
                        if (info.widgets_values.length == undefined) {
                            if(info.widgets_values.workflows.value != "None"){
                                const workflow_name = info.widgets_values.workflows.value;
                                console.log("workflow_name", workflow_name)
                                console.log(app.lipsync_studio[workflow_name])
                                const inputs = app.lipsync_studio[workflow_name].inputs;

                                for (let w of this.widgets) {
                                    if (w.name in widgetDict) {
                                        w.value = widgetDict[w.name].value;
                                    }
                                }
                                for (let [key, value] of Object.entries(widgetDict)) {
                                    let widget = this.widgets.find(w => w.name === key);
                                    if(!widget){
                                        addWidgetInfo(this, key, value, app);
                                        widget = this.widgets.find(w => w.name === key);
                                    }
                                    widget.options = info.widgets_values[key].options;
                                    widget.value = info.widgets_values[key].value;
                                    for (let input of this.inputs)
                                        if (input.name == key){
                                            for (let [key2, value2] of Object.entries(inputs)){
                                                if (value2.inputs.Name == key){
                                                    input.type = value2.inputs.type;
                                                    widget.type = "converted-widget"
                                                    widget.origType = info.widgets_values[key].origType;
                                                    widget.origComputeSize = undefined;
                                                    widget.last_y = info.widgets_values[key].last_y;
                                                    widget.origSerializeValue = nodeType.prototype.serializeValue;
                                                    widget.value = info.widgets_values[key].value;
                                                    break;
                                                }
                                            }
                                            break;
                                        }
                                }
                            }
                        }
                        for(let i = this.outputs.length - 1; i>0; i--){
                            if (this.outputs[i].name == "*"){
                                this.removeOutput(i);
                            }
                        }
                    });
                    chainCallback(this, "onSerialize", function(info) {
                        let inps = {};
                        if (info.widgets_values[2] != "None"){
                            const workflow_name = info.widgets_values[2];
                            inps = app.lipsync_studio[workflow_name].inputs
                        }
                        info.widgets_values = {};
                        if (!this.widgets) {
                            return;
                        }

                        for (let w of this.widgets) {
                            info.widgets_values[w.name] = {name: w.name, options : w.options, value: w.value, type: w.type, origType: w.origType, last_y: w.last_y};
                        }

                        for (let w of this.inputs){
                            for (let [key, value] of Object.entries(inps)){
                                if (value.inputs.Name == w.name){
                                    w.type = value.inputs.type;
                                    break;
                                }
                            }
                        }


                    });
				    const workflow_reload = this.title.startsWith("Workflow: ")?true:false;

                    const filename = this.title.replace("Workflow: ", "");
                    this.addWidget("STRING", "workflow_api_path", "", ()=>{});
                    this.addWidget("button", "Import Workflow", null, () => {
                        const workflow_path = this.widgets.find(w => w.name === "workflow_api_path")["value"];
                        const filename = workflow_path.replace(/\\/g, '/').split("/");
                        this.title = "Workflow: "+filename[filename.length-1].replace(".json", "").replace(/_/g, " ");
                        cleanInputs(this);

                        if (workflow_path != "" && workflow_path != "None")
                            api.fetchApi("/flowchain/workflow?workflow_path="+workflow_path)
                                .then(response => response.json())
                                .then(data => {
                                    // Eseguire l'elaborazione dei dati
                                    const workflow = data.workflow;
                                    //console.log('Workflow:', workflow);
                                    if (data.error == "none"){
                                        const combo = this.widgets.find(w => w.name === "workflows");
                                        combo.options.values.push(data.file_name);
                                        combo.value = data.file_name;
                                        importWorkflow(this, data.file_name, app)
                                    }else{
                                        alert(data.error)
                                    }
                                })
                                .catch(error => {
                                    console.error('Error:', error);
                                    throw error; // Rilancia l'errore per consentire al chiamante di gestirlo
                            });
                    });
                    this.addWidget("combo", "workflows", "None", (value) => {
                        if (value == "None" || value == ""){
                            this.title = "Workflow (FlowChain ⛓️)";
                            cleanInputs(this);
                        }else{
                            importWorkflow(this, value, app)
                        }
                    },{
                        values: ["None", ...Object.keys(app.lipsync_studio)]
                    });
                    if(!workflow_reload || !filename in app.lipsync_studio){
                        cleanInputs(this);
                    }
                    this.color = "#004670";
                    this.bgcolor = "#002942";
                }
			    break;
			case "WorkflowInput":
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
                                if(!widget)
                                    addWidgetInfo(this, key, value, app);
                                    widget = this.widgets.find(w => w.name === key);
                                    //this.widgets.push(value);
                                widget.options = info.widgets_values[key].options;
                                widget.value = info.widgets_values[key].value;
                                //if value exists in inputs
                                for (let input of this.inputs)
                                    if (input.name == key){
                                        //find if key exists in inputs array in inputs.Name
                                        if (info.widgets_values[key].type == "converted-widget"){
                                            input.type = info.widgets_values.type.value;
                                            widget.type = "converted-widget"
                                            widget.origType = info.widgets_values[key].origType;
                                            widget.origComputeSize = undefined;
                                            widget.last_y = info.widgets_values[key].last_y;
                                            widget.origSerializeValue = nodeType.prototype.serializeValue;
                                        }else{
                                            this.removeInput(this.inputs.indexOf(input));
                                        }
                                        break;
                                    }
                            }

                        }
                        for(let i = this.outputs.length - 1; i>0; i--){
                            if (this.outputs[i].name == "*"){
                                this.removeOutput(i);
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

                    });

                    this.widgets[1].callback =  ( value ) => {
                        clearInputs(this);
                        switch(value){
                            case "IMAGE":
                                this.addOutput("output", "IMAGE");
                                this.addInput("default", "IMAGE");

                                break;
                            case "MASK":
                                this.addOutput("output", "MASK");
                                this.addInput("default", "MASK");
                                break;
                            case "STRING":
                                this.addOutput("output", "STRING");
                                ComfyWidgets.STRING(
                                    this,
                                    "default",
                                    ["STRING",{default: "",callback: (val) => console.log('VALUE', val),},],
                                    app,
                                )
                                break;
                            case "INT":
                                this.addOutput("output", "INT");
                                ComfyWidgets.INT(
                                    this,
                                    "default",
                                    ['',{default: 0,callback: (val) => console.log('VALUE', val),},],
                                    app,
                                )
                                break;
                            case "FLOAT":
                                this.addOutput("output", "FLOAT");
                                ComfyWidgets.FLOAT(
                                    this,
                                    "default",
                                    ['',{default: 0,callback: (val) => console.log('VALUE', val), "min": 0.00, "max": 1.00, "step": 0.01},],
                                    app,
                                )
                                break;

                            case "BOOLEAN":
                                this.addOutput("output", "BOOLEAN");
                                this.addWidget("toggle", "default", false, ()=>{});
                                break;
                            case "LATENT":
                                this.addOutput("output", "LATENT");
                                this.addInput("default", "LATENT");
                                break;
                            case "MODEL":
                                this.addOutput("output", "MODEL");
                                this.addInput("default", "MODEL");
                                break;
                            case "CLIP":
                                this.addOutput("output", "CLIP");
                                this.addInput("default", "CLIP");
                                break;
                            case "CONDITIONING":
                                this.addOutput("output", "CONDITIONING");
                                this.addInput("default", "CONDITIONING");
                                break;
                            case "VAE":
                                this.addOutput("output", "VAE");
                                this.addInput("default", "VAE");
                                break;
                        }
                        this.color = colors[node_type_list.indexOf(value)];
                        this.bgcolor = bg_colors[node_type_list.indexOf(value)];
                    };
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
                                if(!widget)
                                    addWidgetInfo(this, key, value, app);
                                    widget = this.widgets.find(w => w.name === key);
                                    //this.widgets.push(value);
                                widget.options = info.widgets_values[key].options;
                                widget.value = info.widgets_values[key].value;
                                //if value exists in inputs
                                for (let input of this.inputs)
                                    if (input.name == key){
                                        //find if key exists in inputs array in inputs.Name
                                        if (info.widgets_values[key].type == "converted-widget"){
                                            input.type = info.widgets_values.type.value;
                                            widget.type = "converted-widget"
                                            widget.origType = info.widgets_values[key].origType;
                                            widget.origComputeSize = undefined;
                                            widget.last_y = info.widgets_values[key].last_y;
                                            widget.origSerializeValue = nodeType.prototype.serializeValue;
                                        }else{
                                            this.removeInput(this.inputs.indexOf(input));
                                        }
                                        break;
                                    }
                            }

                        }
                        for(let i = this.outputs.length - 1; i>0; i--){
                            if (this.outputs[i].name == "*"){
                                this.removeOutput(i);
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
                                    }else if(info.widgets_values[w.name].origType == "combo"){
                                        w.type = "COMBO";
                                    }
                                }
                            }
                        }

                    });

                    this.widgets[0].callback =  ( value ) => {
                        clearInputs(this);
                        switch(value){
                            case "IMAGE":
                                this.addOutput("output", "IMAGE");
                                this.addInput("input", "IMAGE");
                                break;
                            case "LATENT":
                                this.addOutput("output", "LATENT");
                                this.addInput("input", "LATENT");
                                break;
                        }
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
                                if(!widget)
                                    addWidgetInfo(this, key, value, app);
                                    widget = this.widgets.find(w => w.name === key);
                                    //this.widgets.push(value);
                                widget.options = info.widgets_values[key].options;
                                widget.value = info.widgets_values[key].value;
                                //if value exists in inputs
                                for (let input of this.inputs)
                                    if (input.name == key){
                                        //find if key exists in inputs array in inputs.Name
                                        if (info.widgets_values[key].type == "converted-widget"){
                                            input.type = info.widgets_values.type.value;
                                            widget.type = "converted-widget"
                                            widget.origType = info.widgets_values[key].origType;
                                            widget.origComputeSize = undefined;
                                            widget.last_y = info.widgets_values[key].last_y;
                                            widget.origSerializeValue = nodeType.prototype.serializeValue;
                                        }else{
                                            this.removeInput(this.inputs.indexOf(input));
                                        }
                                        break;
                                    }
                            }

                        }
                        for(let i = this.outputs.length - 1; i>0; i--){
                            if (this.outputs[i].name == "*"){
                                this.removeOutput(i);
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

                    });
                    this.widgets[1].callback =  ( value ) => {
                        clearInputs(this);
                        switch(value){
                            case "IMAGE":
                                this.addOutput("output", "IMAGE");
                                this.addInput("default", "IMAGE");
                                break;
                            case "MASK":
                                this.addOutput("output", "MASK");
                                this.addInput("default", "MASK");
                                break;
                            case "STRING":
                                this.addOutput("output", "STRING");
                                this.addInput("default","STRING");
                                break;
                            case "INT":
                                this.addOutput("output", "INT");
                                this.addInput("default","INT");
                                break;
                            case "FLOAT":
                                this.addOutput("output", "FLOAT");
                                this.addInput("default","FLOAT");
                                break;
                            case "BOOLEAN":
                                this.addOutput("output", "BOOLEAN");
                                this.addInput("default","BOOLEAN");
                                break;
                            case "LATENT":
                                this.addOutput("output", "LATENT");
                                this.addInput("default", "LATENT");
                                break;
                            case "MODEL":
                                this.addOutput("output", "MODEL");
                                this.addInput("default", "MODEL");
                                break;
                            case "CLIP":
                                this.addOutput("output", "CLIP");
                                this.addInput("default", "CLIP");
                                break;
                            case "CONDITIONING":
                                this.addOutput("output", "CONDITIONING");
                                this.addInput("default", "CONDITIONING");
                                break;
                            case "VAE":
                                this.addOutput("output", "VAE");
                                this.addInput("default", "VAE");
                                break;
                        }
                        this.color = colors[node_type_list.indexOf(value)];
                        this.bgcolor = bg_colors[node_type_list.indexOf(value)];
                    };
                    clearInputs(this);
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
    }
});