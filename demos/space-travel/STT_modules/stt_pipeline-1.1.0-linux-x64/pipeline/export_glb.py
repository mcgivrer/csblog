"""Phase 10 - GLB export: one GLB per module type, one container GLB, and a library GLB
(all modules in one file, textures embedded once, module roots at the origin)."""
import bpy, os, time
from mathutils import Matrix

EXPORT_DIR = os.path.expanduser("~/Documents/Blender/space-travel/export/modules")
MODULE_KEYS = ["CMD", "PAX", "CARGO", "CRG6", "TANK", "PWR", "PROP", "NODE6", "NODE4", "ELBOW", "TUNNEL", "BAY", "SHUTTLE"]
FRAME = {"PWR": 100, "BAY": 1}
CONTAINER = "STT_CARGO_Container_A"

def subtree(root):
    out = [root]
    for o in root.children_recursive:
        if o.get("stt_container") or (o.parent and o.parent.get("stt_container")):
            continue
        out.append(o)
    return out

def _unhide_all():
    for c in bpy.data.collections:
        if c.name[:2].isdigit():
            c.hide_viewport = False; c.hide_render = False
    lc = bpy.context.view_layer.layer_collection
    def walk(l):
        if l.collection.name[:2].isdigit():
            l.exclude = False; l.hide_viewport = False
        for ch in l.children:
            walk(ch)
    walk(lc)

def _select(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.hide_set(False); o.hide_viewport = False
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]

def _gltf(path):
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
                              export_yup=True, export_extras=True, export_cameras=False, export_lights=False,
                              export_animations=True, export_animation_mode="NLA_TRACKS",
                              export_image_format="WEBP", export_image_quality=85,
                              export_texcoords=True, export_normals=True, export_tangents=False,
                              export_materials="EXPORT", export_draco_mesh_compression_enable=False)

class AtOrigin:
    def __init__(self, objs):
        self.objs = objs
    def __enter__(self):
        self.saved = [(o, o.parent, o.matrix_world.copy()) for o in self.objs]
        for o in self.objs:
            o.parent = None
            o.matrix_world = Matrix.Identity(4)
    def __exit__(self, *a):
        for o, par, mw in self.saved:
            o.parent = par
            o.matrix_world = mw

def export_module(key):
    root = bpy.data.objects[f"STT_{key}_ROOT"]
    bpy.context.scene.frame_set(FRAME.get(key, 100))
    objs = subtree(root)
    path = os.path.join(EXPORT_DIR, f"STT_{key}.glb")
    with AtOrigin([root]):
        _select(objs)
        _gltf(path)
    return os.path.getsize(path)

def export_container():
    c = bpy.data.objects[CONTAINER]
    objs = [c] + list(c.children_recursive)
    path = os.path.join(EXPORT_DIR, "STT_Container_STT36.glb")
    with AtOrigin([c]):
        _select(objs)
        _gltf(path)
    return os.path.getsize(path)

def export_library():
    roots = [bpy.data.objects[f"STT_{k}_ROOT"] for k in MODULE_KEYS]
    cont = bpy.data.objects[CONTAINER]
    objs = []
    for r in roots:
        objs += subtree(r)
    objs += [cont] + list(cont.children_recursive)
    bpy.context.scene.frame_set(100)
    path = os.path.join(EXPORT_DIR, "STT_ModuleLibrary.glb")
    with AtOrigin(roots + [cont]):
        _select(objs)
        _gltf(path)
    return os.path.getsize(path)

def run(keys=None, library=True):
    os.makedirs(EXPORT_DIR, exist_ok=True)
    _unhide_all()
    out = {}
    for k in (keys or MODULE_KEYS):
        out[k] = export_module(k)
    out["CONTAINER"] = export_container()
    if library:
        out["LIBRARY"] = export_library()
    bpy.context.scene.frame_set(100)
    return {k: round(v / 1e6, 2) for k, v in out.items()}
