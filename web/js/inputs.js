import { addWidgets, convertToInput, getDefaultOptions } from "./widgets.js";

export function cleanInputs(root_obj, start_index = 2, reset_value=true) {

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
        const max_node_output = root_obj.outputs.length;
        for(let i = 0; i<max_node_output; i++)
            root_obj.removeOutput(0)
    }

    const max_node_input = root_obj.inputs.length;
    for(let i = 0; i<max_node_input; i++)
        root_obj.removeInput(0)

}

export function clearInputs(root_obj, reset_value=true) {
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


export function addOutputs(root_obj, workflow_name){
    const outputs = app.lipsync_studio[workflow_name].outputs;
    for (let [key, value] of Object.entries(outputs)){
        const isoutput = root_obj.outputs.find(i => i.name == value.inputs.Name.value);
        if (!isoutput){
            root_obj.addOutput(value.inputs.Name.value, value.inputs.type.value);
        }
    }
    organizeOutputs(root_obj, workflow_name);
}

  
export function addInputs(node, inputs, widgets_values) {
    // Phase 1: Préparer les données triées et simplifiées
    const mapped_input = Object.entries(inputs)
        .sort(([, a], [, b]) => a.position - b.position)
        .map(([, input], index) => {
            return {
                name: input.inputs[0],
                type: input.inputs[1],
                value: input.inputs.length > 2 ? input.inputs[2] : undefined,
                orderIndex: index // Ajouter un index d'ordre basé sur la position
            };
        });

    // Séparer les inputs pour un traitement différencié
    const widget_inputs = mapped_input.filter(input => input.value !== undefined && input.value !== null);
    // replace value in widget_inputs with the value in widgets_values
    if (widgets_values){
        for (let i = 0; i < widget_inputs.length; i++) {
            const widget_input = widget_inputs[i];
            const widget_value = widgets_values[2 + i];
            //find name in mapped_input and replace value
            for (let j = 0; j < mapped_input.length; j++){
                if (mapped_input[j].name == widget_input.name){
                    mapped_input[j].value = widget_value;
                    break;
                }
            }
        }
    }

    const pure_inputs = mapped_input.filter(input => input.value === undefined || input.value === null);
    
    // S'assurer que le nœud a un objet local_input_defs
    if (!node.local_input_defs) {
        node.local_input_defs = {
            required: {},
            optional: {}
        };
    }

    // Phase 2: Ajouter les nouveaux widgets/inputs avec leur index d'ordre
    for (const input of mapped_input) {
        const { name, type, value, orderIndex } = input;
        let isWidget = node.widgets.find(w => w.name === name);
        let isinput = node.inputs.find(i => i.name === name);
        
        if (!isWidget && (!isinput || isinput.widget)) {
            if (value !== undefined) {
                // Ajouter un widget avec sa valeur et son index d'ordre
                const widget_param = { value, type };
                addWidgets(node, name, widget_param, app);
                isWidget = node.widgets.find(w => w.name === name);
                isWidget.orderIndex = orderIndex; // Stocker l'index d'ordre
                
                if (isinput && !isinput.widget) {
                    convertToInput(node, isWidget);
                    // Préserver l'index d'ordre sur l'input converti
                    const newInput = node.inputs.find(i => i.name === name);
                    if (newInput) newInput.orderIndex = orderIndex;
                    newInput.pos = isWidget.pos;
                }
            } else {
                // C'est un input pur
                if (!isinput) {
                    node.addInput(name, type);
                    const newInput = node.inputs[node.inputs.length - 1];
                    newInput.orderIndex = orderIndex; // Stocker l'index d'ordre
                }
            }
        } else {
            // Mettre à jour l'index d'ordre des éléments existants
            if (isWidget) isWidget.orderIndex = orderIndex;
            if (isinput) isinput.orderIndex = orderIndex;
        }
    }

    // Phase 3: Mettre à jour les types si nécessaires
    for (const input of mapped_input) {
        const { name, type, value } = input;
        let isWidget = node.widgets.find(w => w.name === name);
        let isinput = node.inputs.find(i => i.name === name);
        
        if (isWidget || isinput) {
            const localType = node.local_input_defs?.required[name] || null;
            
            // Vérifier si le type est différent et le mettre à jour
            if (localType && localType[0] !== type) {
                if (isinput) {
                    if (isinput.link) {
                        node.graph.removeLink(isinput.link);
                    }
                    isinput.type = type;
                }
                
                if (isWidget) {
                    isWidget.type = type;
                    const options = getDefaultOptions(type, value);
                    node.local_input_defs.required[name] = [type, options];
                    isWidget.options = options;
                    isWidget.value = value !== undefined ? value : isWidget.value;
                }
            }
        }
    }
    
    // Phase 4: Réorganiser les widgets selon leur index d'ordre
    // Séparer les widgets système (les 2 premiers) des widgets à trier
    const systemWidgets = node.widgets.slice(0, 2);
    const sortableWidgets = node.widgets.slice(2);
    
    // Trier les widgets par index d'ordre
    sortableWidgets.sort((a, b) => {
        if (a.orderIndex === undefined) return 1;
        if (b.orderIndex === undefined) return -1;
        return a.orderIndex - b.orderIndex;
    });
    
    // Reconstruire le tableau des widgets
    node.widgets = [...systemWidgets, ...sortableWidgets];
    
    // Maintenant ajuster les positions visuelles des widgets
    for (let i = 2; i < node.widgets.length; i++) {
        node.widgets[i].y = node.widgets[i-1].y + (node.widgets[i-1].computedHeight || LiteGraph.NODE_WIDGET_HEIGHT);
        node.widgets[i].last_y = node.widgets[i].y;
    }
    
    // Réorganiser les inputs purs
    for (let i = 0; i < pure_inputs.length; i++) {
        const targetInput = pure_inputs[i];
        const actualIndex = node.inputs.findIndex(input => input.name === targetInput.name);
        
        if (actualIndex !== -1) {
            // const actualIndex = node.inputs.indexOf(pureNodeInputs[inputIndex]);
            const expected_position = i;
            
            if (actualIndex !== expected_position) {
                // Déconnecter temporairement le lien s'il existe
                let link = null;
                if (node.inputs[actualIndex].link) {
                    link = node.graph.links[node.inputs[actualIndex].link];
                    node.graph.removeLink(node.inputs[actualIndex].link);
                }
                
                // Sauvegarder les propriétés importantes
                const inputToMove = node.inputs[actualIndex];
                const inputName = inputToMove.name;
                const inputType = inputToMove.type;
                const inputWidget = inputToMove.widget;
                const inputPos = inputToMove.pos;
                
                // Supprimer l'input
                node.removeInput(actualIndex);
                
                // Ajouter à la position attendue
                node.addInput(inputName, inputType, {pos: inputPos, widget: inputWidget}, expected_position);
                
                // Reconnecter le lien si nécessaire
                if (link && link.origin_id !== null) {
                    const newIndex = node.inputs.findIndex(input => input.name === targetInput.name);
                    link.target_slot = newIndex;
                    node.graph.links[link.id] = link;
                    node.inputs[newIndex].link = link.id;
                }
            }
        }
    }

    // Phase 6: S'assurer que les inputs avec widget sont toujours à la fin de la liste
    const inputsWithWidgets = [];
    const inputsWithoutWidgets = [];

    // 1. Trier les inputs en deux groupes
    for (let i = 0; i < node.inputs.length; i++) {
        if (node.inputs[i].widget) {
            inputsWithWidgets.push(i);
        } else {
            inputsWithoutWidgets.push(i);
        }
    }

    // 2. Si des inputs avec widgets ne sont pas déjà à la fin, les réorganiser
    if (inputsWithWidgets.length > 0 && inputsWithWidgets[0] < inputsWithoutWidgets[inputsWithoutWidgets.length - 1]) {
        // Déplacer tous les inputs avec widgets à la fin
        for (let i = 0; i < inputsWithWidgets.length; i++) {
            const currentIndex = inputsWithWidgets[i] - i; // Ajuster l'index car la liste change à chaque suppression
            
            // Sauvegarder les informations de l'input et son lien
            let link = null;
            if (node.inputs[currentIndex].link) {
                let link = null;
                if (node.inputs[actualIndex].link) {
                    link = node.graph.links[node.inputs[actualIndex].link];
                    node.graph.removeLink(node.inputs[actualIndex].link);
                }
            }
            
            // Sauvegarder les propriétés importantes
            const inputToMove = node.inputs[currentIndex];
            const inputName = inputToMove.name;
            const inputType = inputToMove.type;
            const inputWidget = inputToMove.widget;
            const inputPos = inputToMove.pos;
            
            node.removeInput(currentIndex);
            node.addInput(inputName, inputType, {pos: inputPos, widget: inputWidget});
            
            // Reconnecter le lien si nécessaire
            if (link && link.origin_id !== null) {
                const newIndex = node.inputs.findIndex(input => input.name === inputName);
                if (node.graph)
                    node.graph.links[link.id].target_slot = newIndex;
                    node.inputs[expected_position].link = link.id;
                    
            }
            if (link && link.origin_id !== null) {
                const newIndex = node.inputs.findIndex(input => input.name === inputName);
                link.target_slot = newIndex;
                node.graph.links[link.id] = link;
                node.inputs[newIndex].link = link.id;
            }

        }
        
        // Rafraîchir le canvas
        if (node.graph) {
            node.graph.setDirtyCanvas(true);
        }
    }
    
    // Rafraîchir le canvas si nécessaire
    if (node.graph) {
        node.graph.setDirtyCanvas(false, true);
        //node.graph.afterChange();
        //node.graph.connectionChange(node);
    }
}

function organizeOutputs(node, workflow_name) {
    const outputs = app.lipsync_studio[workflow_name].outputs;
    
    // Extraire et trier les outputs selon leur position
    const sortedOutputs = Object.entries(outputs)
        .sort(([, a], [, b]) => a.position - b.position)
        .map(([, output]) => ({
            name: output.inputs.Name.value,
            type: output.inputs.type.value
        }));
    
    // Réorganiser les outputs selon l'ordre déterminé
    for (let i = 0; i < sortedOutputs.length; i++) {
        const targetOutput = sortedOutputs[i];
        const actualIndex = node.outputs.findIndex(output => output.name === targetOutput.name);
        
        if (actualIndex !== -1 && actualIndex !== i) {
            // Sauvegarder les liens existants
            let links = [];
            if (node.outputs[actualIndex].links && node.outputs[actualIndex].links.length > 0) {
                for (const linkId of node.outputs[actualIndex].links) {
                    const linkInfo = node.graph.links[linkId];
                    if (linkInfo) {
                        links.push({
                            id: linkId,
                            origin_id: linkInfo.origin_id,
                            origin_slot: linkInfo.origin_slot,
                            target_id: linkInfo.target_id,
                            target_slot: linkInfo.target_slot
                        });
                        // Déconnecter temporairement
                        node.graph.removeLink(linkId);
                    }
                }
            }
            
            // Sauvegarder les propriétés importantes
            const outputToMove = node.outputs[actualIndex];
            const outputName = outputToMove.name;
            const outputType = outputToMove.type;
            
            // Supprimer l'output
            node.removeOutput(actualIndex);
            
            // Ajouter à la position attendue
            node.addOutput(outputName, outputType, i);
            const newOutput = node.outputs.findIndex(output => output.name === outputName);
            
            // Reconnecter les liens sauvegardés
            for (const link of links) {
                const targetNode = node.graph.getNodeById(link.target_id);
                node.connect(newOutput, targetNode, link.target_slot);
            }
        }
    }
    
    // Rafraîchir le canvas
    if (node.graph) {
        node.graph.setDirtyCanvas(true);
    }
}


export function removeInputs(node, inputs, widgets_values){
    // Ensemble des noms d'entrées valides à partir de inputs
    const validInputNames = new Set();
    for (let [key, value] of Object.entries(inputs)) {
        if (value.inputs && value.inputs[0]) {
            validInputNames.add(value.inputs[0]);
        }
    }
    
    // Noms à préserver quoi qu'il arrive
    const preserveNames = new Set(["workflows", "workflow"]);
    
    // Collecter les noms d'entrées actuelles
    const currentInputNames = new Set();
    for (let input of node.inputs)
        if (!preserveNames.has(input.name))
            currentInputNames.add(input.name);
    
    // Collecter les noms de widgets actuels (à partir de l'index 2)
    const currentWidgetNames = new Set();
    for (let i = 2; i < node.widgets.length; i++)
        if (!preserveNames.has(node.widgets[i].name))
            currentWidgetNames.add(node.widgets[i].name);
    
    // Identifier les éléments à supprimer (ceux qui sont dans current mais pas dans valid)
    const inputsToRemove = [...currentInputNames].filter(name => !validInputNames.has(name));
    const widgetsToRemove = [...currentWidgetNames].filter(name => !validInputNames.has(name));
    
    // Supprimer les entrées identifiées (en parcourant en sens inverse)
    if (inputsToRemove.length > 0)
        for (let i = node.inputs.length - 1; i >= 0; i--)
            if (inputsToRemove.includes(node.inputs[i].name)){
                // Déconnecter le lien s'il existe
                if (node.inputs[i].link != null)
                    node.graph.removeLink(node.inputs[i].link);
                node.removeInput(i);
            }
    
    // Supprimer les widgets identifiés (en parcourant en sens inverse)
    if (widgetsToRemove.length > 0)
        for (let i = node.widgets.length - 1; i >= 2; i--)
            if (widgetsToRemove.includes(node.widgets[i].name)) {
                widgetName = node.widgets[i].name;
                node.widgets.splice(i, 1);
                widgets_values.splice(i, 1);
                if (node.local_input_defs && node.local_input_defs.required[widgetName]){
                    delete node.local_input_defs.required[widgetName];
                }
                // change y and last_y of widgets
                for (let j = i; j < node.widgets.length; j++){
                    node.widgets[j].y -= node.widgets[j].computedHeight;
                    node.widgets[j].last_y -= node.widgets[j].computedHeight;
                }
            }
}