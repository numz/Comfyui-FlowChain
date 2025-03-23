import os
import importlib.util
import sys
import traceback
from .lipsync_studio import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
from .workflow_nodes import NODE_CLASS_MAPPINGS_NODES, NODE_DISPLAY_NAME_MAPPINGS_NODES
from .workflow import NODE_CLASS_MAPPINGS_WORKFLOW, NODE_DISPLAY_NAME_MAPPINGS_WORKFLOW
from pathlib import Path

NODE_CLASS_MAPPINGS.update(NODE_CLASS_MAPPINGS_NODES)
NODE_CLASS_MAPPINGS.update(NODE_CLASS_MAPPINGS_WORKFLOW)
NODE_DISPLAY_NAME_MAPPINGS.update(NODE_DISPLAY_NAME_MAPPINGS_NODES)
NODE_DISPLAY_NAME_MAPPINGS.update(NODE_DISPLAY_NAME_MAPPINGS_WORKFLOW)


def get_ext_dir(subpath=None, mkdir=False):
    dir = os.path.dirname(__file__)
    if subpath is not None:
        dir = os.path.join(dir, subpath)

    dir = os.path.abspath(dir)

    if mkdir and not os.path.exists(dir):
        os.makedirs(dir)
    return dir


py = Path(get_ext_dir("py"))
files = list(py.glob("*.py"))
for file in files:
    try:
        name = os.path.splitext(file)[0]
        spec = importlib.util.spec_from_file_location(name, os.path.join(py, file))
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
        if hasattr(module, "NODE_CLASS_MAPPINGS") and getattr(module, "NODE_CLASS_MAPPINGS") is not None:
            NODE_CLASS_MAPPINGS.update(module.NODE_CLASS_MAPPINGS)
            if hasattr(module, "NODE_DISPLAY_NAME_MAPPINGS") and getattr(module,
                                                                         "NODE_DISPLAY_NAME_MAPPINGS") is not None:
                NODE_DISPLAY_NAME_MAPPINGS.update(module.NODE_DISPLAY_NAME_MAPPINGS)
    except Exception as e:
        traceback.print_exc()
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

WEB_DIRECTORY = "./web"
