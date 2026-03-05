"""
ComfyUI-dynamicvramstats: Visualize dynamic VRAM page residency.
"""

import logging
import os
from server import PromptServer
from aiohttp import web
import comfy.model_management
import comfy.memory_management

log = logging.getLogger(__name__)

WEB_DIRECTORY = "./js"

@PromptServer.instance.routes.get("/dynamicvramstats/status")
async def get_vram_status(request):
    device = comfy.model_management.get_torch_device()
    total_vram = comfy.model_management.get_total_memory(device)
    free_vram = comfy.model_management.get_free_memory(device)

    results = {
        "aimdo_enabled": comfy.memory_management.aimdo_enabled,
        "total_vram_mb": total_vram // (1024 * 1024),
        "free_vram_mb": free_vram // (1024 * 1024),
        "models": []
    }

    for loaded in comfy.model_management.current_loaded_models:
        patcher = loaded.model
        class_name = patcher.model.__class__.__name__

        filename = ""
        if patcher.cached_patcher_init is not None:
            path_arg = patcher.cached_patcher_init[1][0]
            if isinstance(path_arg, str):
                filename = os.path.basename(path_arg)
            elif isinstance(path_arg, (list, tuple)) and path_arg:
                filename = ", ".join(os.path.basename(p) for p in path_arg)

        model_info = {
            "name": class_name,
            "filename": filename,
            "is_dynamic": patcher.is_dynamic(),
            "vbar": None
        }

        if patcher.is_dynamic():
            vbar = patcher._vbar_get()
            if vbar is not None:
                try:
                    residency = vbar.get_residency()
                    used_pages = vbar.offset // (32 * 1024 * 1024)
                    if vbar.offset % (32 * 1024 * 1024) > 0:
                        used_pages += 1
                    model_info["vbar"] = {
                        "nr_pages": vbar.get_nr_pages(),
                        "used_pages": used_pages,
                        "watermark": vbar.get_watermark(),
                        "loaded_size_mb": vbar.loaded_size() // (1024 * 1024),
                        "resident_count": sum(1 for r in residency if r & 1),
                        "pinned_count": sum(1 for r in residency if r & 2),
                        "page_size_mb": 32,
                        "residency": residency[:used_pages]
                    }
                except Exception as e:
                    log.error(f"[dynamicvramstats] Error querying VBAR for {model_info['name']}: {e}")

        results["models"].append(model_info)

    return web.json_response(results)

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
