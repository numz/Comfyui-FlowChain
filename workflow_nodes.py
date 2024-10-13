import torch
import numpy as np
from PIL import Image
import hashlib
from torchvision import transforms


class AnyType(str):
    """A special class that is always equal in not equal comparisons. Credit to pythongosssss"""

    def __eq__(self, _) -> bool:
        return True

    def __ne__(self, __value: object) -> bool:
        return False


BOOLEAN = ("BOOLEAN", {"default": True})
STRING = ("STRING", {"default": ""})
any_input = AnyType("*")
node_type_list = ["none", "IMAGE", "MASK", "STRING", "INT", "FLOAT", "LATENT", "BOOLEAN", "CLIP", "CONDITIONING", "MODEL", "VAE"]
"""
class WorkflowOutputImage:
    def __init__(self):
        self.prompt_id = None

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "Name": STRING,
                "default": ("IMAGE", {"default": []})
            },
            "hidden": {
                "ui": BOOLEAN
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    FUNCTION = "execute"
    OUTPUT_NODE = True
    CATEGORY = "LipSync Studio 🎤"

    def execute(self, Name, default, ui=True):
        if ui:
            if default is None:
                return (torch.tensor([]),)
            return (default,)
        else:
            if default is None:
                black_image_np = np.zeros((255, 255, 3), dtype=np.uint8)
                black_image_pil = Image.fromarray(black_image_np)
                transform = transforms.ToTensor()
                image_tensor = transform(black_image_pil)
                image_tensor = image_tensor.permute(1, 2, 0)
                image_tensor = image_tensor.unsqueeze(0)
                return {"ui": {"images": image_tensor}}
            return {"ui": {"images": default}}


class WorkflowInputImage:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "Name": STRING,
                "default": ("IMAGE", {"default": []})
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    FUNCTION = "execute"
    CATEGORY = "LipSync Studio 🎤"

    def execute(self, Name, default):
        # get current file path
        return (default,)


class WorkflowInputString:
    def __init__(self):
        self.prompt_id = None

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "Name": STRING,
                "default": STRING
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("string",)
    FUNCTION = "execute"
    CATEGORY = "LipSync Studio 🎤"

    def execute(self, Name, default):
        return (default,)


class WorkflowInputBoolean:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "Name": STRING,
                "default": ("BOOLEAN", {"default": False})
            }
        }

    RETURN_TYPES = ("BOOLEAN",)
    RETURN_NAMES = ("boolean",)
    FUNCTION = "execute"
    CATEGORY = "LipSync Studio 🎤"

    def execute(self, Name, default):
        return (default,)


class WorkflowInputInteger:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "Name": STRING,
                "default": ("INT", {"default": 0})
            }
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("int",)
    FUNCTION = "execute"
    CATEGORY = "LipSync Studio 🎤"

    def execute(self, Name, default):
        return (default,)


class WorkflowInputFloat:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "Name": STRING,
                "default": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 10.0, "step": 0.01})
            }
        }

    RETURN_TYPES = ("FLOAT",)
    RETURN_NAMES = ("float",)
    FUNCTION = "execute"
    CATEGORY = "LipSync Studio 🎤"

    def execute(self, Name, default):
        return (default,)


class WorkflowInputSwitch:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "Name": STRING,
                "images": ("IMAGE", {"default": []}),
                "default": BOOLEAN,
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    FUNCTION = "execute"
    CATEGORY = "LipSync Studio 🎤"

    def execute(self, Name, images, default):
        if default:
            return (images,)
        else:
            return (images[0].unsqueeze(0),)


class WorkflowContinueImage:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "input": ("IMAGE", {"default": []}),
                "continue_workflow": BOOLEAN,
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("output",)
    FUNCTION = "execute"
    CATEGORY = "LipSync Studio 🎤"

    @classmethod
    def IS_CHANGED(s, input, continue_workflow):
        m = hashlib.sha256()
        if input is None:
            return "0"
        else:
            m.update(input.encode()+str(continue_workflow).encode())
        return m.digest().hex()

    def execute(self, input, continue_workflow):
        print("WorkflowContinue", continue_workflow)
        if continue_workflow:
            return (input,)
        else:
            return (input[0].unsqueeze(0),)


class WorkflowContinueLatent:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "input": ("LATENT", {"default": []}),
                "continue_workflow": BOOLEAN,
            }
        }

    RETURN_TYPES = ("LATENT",)
    RETURN_NAMES = ("output",)
    FUNCTION = "execute"
    CATEGORY = "LipSync Studio 🎤"

    @classmethod
    def IS_CHANGED(s, input, continue_workflow):
        m = hashlib.sha256()
        m.update(input.encode()+str(continue_workflow).encode())
        return m.digest().hex()

    def execute(self, input, continue_workflow):
        print("WorkflowContinue", continue_workflow)
        if continue_workflow:
            return (input,)
        else:
            ret = {"samples": input["samples"][0].unsqueeze(0)}
            if "noise_mask" in input:
                ret["noise_mask"] = input["noise_mask"][0].unsqueeze(0)
            return (ret,)
"""

class WorkflowContinue:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "input": ("IMAGE", {"default": []}),
                "type": (
                    ["none", "IMAGE", "LATENT"],),
                "continue_workflow": BOOLEAN,
            }
        }

    RETURN_TYPES = (AnyType("*"),)
    RETURN_NAMES = ("output",)
    FUNCTION = "execute"
    CATEGORY = "FlowChain ⛓️"

    @classmethod
    def IS_CHANGED(s, input, type, continue_workflow):
        m = hashlib.sha256()
        if input is None:
            return "0"
        else:
            m.update(input.encode()+str(continue_workflow).encode())
        return m.digest().hex()

    def execute(self, input, type, continue_workflow):
        print("WorkflowContinue", continue_workflow)
        if continue_workflow:
            if type == "LATENT":
                ret = {"samples": input["samples"][0].unsqueeze(0)}
                if "noise_mask" in input:
                    ret["noise_mask"] = input["noise_mask"][0].unsqueeze(0)
                return (ret,)
            else:
                return (input,)
        else:
            return (input[0].unsqueeze(0),)


class WorkflowInput:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "Name": STRING,
            "type": (node_type_list,),
            "default": ("*",)
        }}

    RETURN_TYPES = (AnyType("*"),)
    RETURN_NAMES = ("output",)
    FUNCTION = "execute"
    CATEGORY = "FlowChain ⛓️"
    #OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(s, Name, type,default, **kwargs):
        m = hashlib.sha256()
        if default is not None:
            m.update(str(default).encode())
        else:
            m.update(Name.encode()+type.encode())
        return m.digest().hex()

    def execute(self, Name, type, default, **kwargs):
        """if type == "SWITCH":
            if "boolean" in kwargs:
                if kwargs["boolean"]:
                    return (kwargs["default"],)
                else:
                    return (kwargs["default"][0].unsqueeze(0),)
            else:
                return (kwargs["default"],)
        else:"""
        return (default,)


class WorkflowOutput:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "Name": STRING,
            "type": (node_type_list,)
        },
            "hidden": {
                "ui": BOOLEAN
            }}

    RETURN_TYPES = (AnyType("*"),)
    RETURN_NAMES = ("output",)
    FUNCTION = "execute"
    CATEGORY = "FlowChain ⛓️"
    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(s, Name, type, ui=True, **kwargs):
        m = hashlib.sha256()
        m.update(Name.encode()+type.encode())
        return m.digest().hex()

    def execute(self, Name, type, ui=True, **kwargs):
        if ui:
            if kwargs["default"] is None:
                return (torch.tensor([]),)
            return (kwargs["default"],)
        else:
            if type in ["IMAGE", "MASK"]:
                if kwargs["default"] is None:
                    black_image_np = np.zeros((255, 255, 3), dtype=np.uint8)
                    black_image_pil = Image.fromarray(black_image_np)
                    transform = transforms.ToTensor()
                    image_tensor = transform(black_image_pil)
                    image_tensor = image_tensor.permute(1, 2, 0)
                    image_tensor = image_tensor.unsqueeze(0)
                    return {"ui": {"default": image_tensor}}
                return {"ui": {"default": kwargs["default"]}}
            elif type == "LATENT":
                if kwargs["default"] is None:
                    return {"ui": {"default": torch.tensor([])}}
                return {"ui": {"default": kwargs["default"]}}
            else:
                ui = {"ui": {}}
                ui["ui"]["default"] = kwargs["default"]
                return ui



NODE_CLASS_MAPPINGS_NODES = {
    "WorkflowInput": WorkflowInput,
    "WorkflowOutput": WorkflowOutput,

    #"WorkflowInputImage": WorkflowInputImage,
    #"WorkflowInputString": WorkflowInputString,
    #"WorkflowInputBoolean": WorkflowInputBoolean,
    #"WorkflowInputInteger": WorkflowInputInteger,
    #"WorkflowInputFloat": WorkflowInputFloat,
    #"WorkflowOutputImage": WorkflowOutputImage,
    #"WorkflowInputSwitch": WorkflowInputSwitch,
    #"WorkflowContinueImage": WorkflowContinueImage,
    #"WorkflowContinueLatent": WorkflowContinueLatent,
    "WorkflowContinue": WorkflowContinue,

}

# A dictionary that contains the friendly/humanly readable titles for the nodes
NODE_DISPLAY_NAME_MAPPINGS_NODES = {
    "WorkflowInput": "Workflow Input (FlowChain ⛓️)",
    "WorkflowOutput": "Workflow Output (FlowChain ⛓️)",
    #"WorkflowInputImage": "Workflow Input Image (Lipsync Studio)",
    #"WorkflowInputString": "Workflow Input String (Lipsync Studio)",
    #"WorkflowInputBoolean": "Workflow Input Boolean (Lipsync Studio)",
    #"WorkflowInputInteger": "Workflow Input Integer (Lipsync Studio)",
    #"WorkflowInputFloat": "Workflow Input Float (Lipsync Studio)",
    #"WorkflowOutputImage": "Workflow Output Image (Lipsync Studio)",
    #"WorkflowInputSwitch": "Workflow Input Switch (Lipsync Studio)",
    #"WorkflowContinueImage": "Workflow Continue Image (Lipsync Studio)",
    #"WorkflowContinueLatent": "Workflow Continue Latent (Lipsync Studio)",
    "WorkflowContinue": "Workflow Continue (FlowChain ⛓️)",
    # "VisualizeOpticalFlow": "Visualize optical flow",
}
