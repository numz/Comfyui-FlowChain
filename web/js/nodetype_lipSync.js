import { useKVState } from "./utils.js";
import { chainCallback } from "./utils.js";
import { addLoadVideoCommon } from "./videoPreview.js";

export function setupLipSyncNode(nodeType, nodeData, app) {
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
}