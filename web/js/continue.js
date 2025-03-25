import { app } from "../../../scripts/app.js";
import {chainCallback} from "./utils.js";
import {clearInputs} from "./inputs.js";
import {addWidgets} from "./widgets.js";
import {colors, bg_colors, node_type_list} from "./constants.js";

function initialisation(node) {
    node.widgets[0].callback =  ( value ) => {
        clearInputs(node);
        node.addOutput("output", value);
        node.addInput("input", value);
        node.color = colors[node_type_list.indexOf(value)];
        node.bgcolor = bg_colors[node_type_list.indexOf(value)];
    };
    node.color = colors[node_type_list.indexOf("none")];
    node.bgcolor = bg_colors[node_type_list.indexOf("none")];
}

function configure(info) {
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
};


function serialize(info) {
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
}


export function setupContinueNode(nodeType, nodeData, app) {
    nodeType.prototype.onNodeCreated =  function() {
        chainCallback(this, "onConfigure", configure);
        chainCallback(this, "onSerialize", serialize);
        initialisation(this);
    }
}
