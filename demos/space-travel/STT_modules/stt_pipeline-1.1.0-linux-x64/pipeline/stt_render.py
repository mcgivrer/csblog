"""Preview render helpers (checkpoints)."""
import bpy, os
from . import stt_core as C

RENDERS = os.path.expanduser("~/Documents/Blender/space-travel/renders")

def show_only(collection_names):
    """Hide (viewport+render) every STT module / kit collection except the given ones."""
    names = set(collection_names)
    for c in bpy.data.collections:
        if c.name.startswith(("0", "98_")) and "_" in c.name and c.name[:2].isdigit():
            vis = c.name in names or any(c.name.startswith(n) for n in names)
            c.hide_render = not vis
            c.hide_viewport = not vis

def show_all_modules():
    for c in bpy.data.collections:
        if c.name[:2].isdigit() and c.name[:2] not in ("98", "99"):
            variant = len(c.name) > 2 and c.name[2] != "_"
            top_variant = variant and not any(c.name.startswith(k) for k in ("01_Passagers_", "02_Cargo_"))
            c.hide_render = top_variant; c.hide_viewport = top_variant
    k = bpy.data.collections.get("98_Kit_Preview")
    if k: k.hide_render = True; k.hide_viewport = True

def render_view(name, cam_loc, target, lens=50, res=(1600, 900), samples=48):
    sc = bpy.context.scene
    cam = bpy.data.objects["CAM_Ship_34"]
    tgt = bpy.data.objects["CAM_Target"]
    cam.location = cam_loc; tgt.location = target
    cam.data.lens = lens
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = res
    try: sc.eevee.taa_render_samples = samples
    except Exception: pass
    out = os.path.join(RENDERS, name + ".png")
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    return out
