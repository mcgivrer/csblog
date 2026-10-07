"""Phase 9d - per-module ambient occlusion (UV2 + Cycles bake, 512 px).
Each module gets its own AO image (textures/ao_<KEY>.png) and per-module material copies
STT_<Mat>@<KEY> wired for glTF occlusion (node group 'glTF Material Output', texCoord 1 = UV2)."""
import bpy, math, os
from . import stt_core as C

TEX_DIR = os.path.expanduser("~/Documents/Blender/space-travel/textures")
RES = 512
SKIP_MATS = ("Window", "Bridge_Glass", "Nav_", "Floodlight", "Engine_Glow", "Int_", "Decals", "ContDecals", "Human_Ref")
MODULE_COLL = {"CMD": "00_Commandement", "PAX": "01_Passagers", "CARGO": "02_Cargo", "CRG6": "02b_Cargo_Etoile",
               "TANK": "03_Reservoirs", "PWR": "04_Energie", "PROP": "05_Propulsion",
               "NODE6": "06_Noeud6", "NODE4": "06b_Noeud4", "ELBOW": "06c_Coude90", "TUNNEL": "06d_Tunnel",
               "BAY": "07_Baie", "SHUTTLE": "08_Navette"}

def bake_objects(key):
    root = bpy.data.objects[f"STT_{key}_ROOT"]
    out = []
    for o in [root] + list(root.children_recursive):
        if o.type != "MESH" or o.get("stt_decals") or o.get("stt_container") or o.get("stt_vfx"):
            continue
        if any(c.name.endswith("_Int") for c in o.users_collection):
            continue
        if o.parent and o.parent.get("stt_container"):
            continue
        out.append(o)
    return out

def container_objects():
    return [o for o in bpy.data.objects if o.get("stt_container") and o.name.startswith("STT_") and not o.name.startswith("FLEET")]

def gltf_output_group():
    ng = bpy.data.node_groups.get("glTF Material Output")
    if ng is None:
        ng = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        ng.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
        ng.interface.new_socket(name="Thickness", in_out="INPUT", socket_type="NodeSocketFloat")
        ng.nodes.new("NodeGroupInput")
    return ng

def _isolate(keep_names):
    state = {}
    for c in bpy.data.collections:
        state[c.name] = (c.hide_render, c.hide_viewport)
    for c in bpy.data.collections:
        if c.name in ("STT_Freighter", "99_Utils"):
            continue
        keep = any(c.name == k or c.name.startswith(k + "_") for k in keep_names)
        if c.name in ("FLEET", "STATIONS") or c.name.startswith(("FLEET_", "98_", "STATION_")) or c.name[:2].isdigit():
            c.hide_render = not keep
            c.hide_viewport = not keep
    for c in bpy.data.collections:
        if c.name.endswith("_Int"):
            c.hide_render = True
    state["__decals__"] = [o.name for o in bpy.data.objects if (o.get("stt_decals") or o.get("stt_vfx")) and not o.hide_render]
    for n in state["__decals__"]:
        bpy.data.objects[n].hide_render = True
    return state

def _restore(state):
    for n in state.pop("__decals__", []):
        o = bpy.data.objects.get(n)
        if o: o.hide_render = False
    for n, (hr, hv) in state.items():
        c = bpy.data.collections.get(n)
        if c:
            c.hide_render, c.hide_viewport = hr, hv

def unwrap_uv2(objs):
    meshes = []
    for o in objs:
        me = o.data
        if me in meshes:
            continue
        meshes.append(me)
        uv2 = me.uv_layers.get("UV2") or me.uv_layers.new(name="UV2")
        me.uv_layers.active = uv2
        for l in me.uv_layers:
            l.active_render = (l.name == "UVMap")
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")
    for me in meshes:
        me.uv_layers.active = me.uv_layers["UVMap"]

def bake(key, objs, samples=48, distance=1.5):
    sc = bpy.context.scene
    name = f"AO_{key}"
    im = bpy.data.images.get(name) or bpy.data.images.new(name, RES, RES, alpha=False)
    im.colorspace_settings.name = "Non-Color"
    temp = []
    mats = {s.material for o in objs for s in o.material_slots if s.material}
    for m in mats:
        n = m.node_tree.nodes.new("ShaderNodeTexImage")
        n.image = im
        uvn = m.node_tree.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "UV2"
        m.node_tree.links.new(uvn.outputs[0], n.inputs[0])
        m.node_tree.nodes.active = n
        temp.append((m, n, uvn))
    prev_engine = sc.render.engine
    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples
    try:
        sc.cycles.device = "GPU" if bpy.context.preferences.addons["cycles"].preferences.has_active_device() else "CPU"
    except Exception:
        pass
    sc.world.light_settings.distance = distance
    sc.render.bake.margin = 6
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    for o in objs:   # bake on UV2
        o.data.uv_layers.active = o.data.uv_layers["UV2"]
    bpy.ops.object.bake(type="AO", margin=6, use_clear=True)
    for o in objs:
        o.data.uv_layers.active = o.data.uv_layers["UVMap"]
    for m, n, uvn in temp:
        m.node_tree.nodes.remove(n); m.node_tree.nodes.remove(uvn)
    sc.render.engine = prev_engine
    path = os.path.join(TEX_DIR, f"ao_{key}.png")
    im.filepath_raw = path
    im.file_format = "PNG"
    im.save()
    return im

def module_material(m, key, im):
    if any(s in m.name for s in SKIP_MATS):
        return m
    base = m.name.split("@")[0]
    name = f"{base}@{key}"
    mm = bpy.data.materials.get(name)
    if mm is None:
        mm = bpy.data.materials.get(base).copy()
        mm.name = name
    nt = mm.node_tree
    for n in list(nt.nodes):
        if n.get("stt_ao"):
            nt.nodes.remove(n)
    uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "UV2"; uvn["stt_ao"] = True; uvn.location = (-1100, -650)
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = im; tex["stt_ao"] = True; tex.location = (-850, -650)
    sep = nt.nodes.new("ShaderNodeSeparateColor"); sep["stt_ao"] = True; sep.location = (-550, -650)
    grp = nt.nodes.new("ShaderNodeGroup"); grp.node_tree = gltf_output_group(); grp["stt_ao"] = True; grp.location = (500, -650)
    nt.links.new(uvn.outputs[0], tex.inputs[0]); nt.links.new(tex.outputs[0], sep.inputs[0])
    nt.links.new(sep.outputs[0], grp.inputs["Occlusion"])
    mm["stt_ao_module"] = key
    return mm

def assign_module_materials(objs, key, im):
    for o in objs:
        for i, m in enumerate(o.data.materials):
            if m is not None:
                o.data.materials[i] = module_material(m, key, im)

def run(key, samples=128):
    keep = [MODULE_COLL[key]]
    state = _isolate(keep)
    try:
        objs = bake_objects(key)
        unwrap_uv2(objs)
        im = bake(key, objs, samples)
        assign_module_materials(objs, key, im)
    finally:
        _restore(state)
    return {"key": key, "objects": len(objs)}

def run_containers(samples=128):
    conts = container_objects()
    keep = ["02_Cargo"]
    state = _isolate(keep)
    try:
        ref = bpy.data.objects["STT_CARGO_Container_A"]
        for o in conts:
            unwrap_uv2([o])
        # bake the reference container alone (others hidden) and share the map
        hidden = []
        for o in bpy.data.objects:
            if o.type == "MESH" and o is not ref and not o.hide_render and o.visible_get():
                o.hide_render = True; hidden.append(o)
        im = bake("CONT", [ref], samples, distance=1.0)
        for o in hidden:
            o.hide_render = False
        for o in conts:
            assign_module_materials([o], "CONT", im)
    finally:
        _restore(state)
    return {"containers": len(conts)}
