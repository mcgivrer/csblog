"""Phase 9b - glTF-friendly textured materials.
Shared tileable sets are multiplied by each material's factors (glTF baseColorFactor, roughnessFactor,
metallicFactor), with tiling through a Mapping node (exported as KHR_texture_transform).
UV0 is in metres, so `tile` = texture size in metres."""
import bpy, os
from . import stt_core as C

TEX_DIR = os.path.expanduser("~/Documents/Blender/space-travel/textures")
# set: (tile m, mean linear albedo, mean roughness G)
SETS = {"panels": (4.0, 0.806, 0.82), "metal": (2.0, 0.778, 0.90), "mli": (1.5, 0.714, 0.86),
        "container": (3.0, 0.745, 0.825), "solar": (1.0, 1.0, 1.0)}
MAT_SET = {
    "Hull_White": "panels", "Hull_Light": "panels", "Hull_Grey": "panels", "Hull_Dark": "panels",
    "Livery": "panels", "Livery_Dark": "panels", "Radiator": ("panels", 2.0),
    "Hazard_Yellow": "metal", "Hazard_Black": "metal", "Metal_Bare": "metal", "Metal_Dark": "metal",
    "Metal_Copper": "metal", "Solar_Frame": "metal", "Nozzle_Inner": "metal",
    "MLI_Gold": "mli", "MLI_Silver": "mli",
    "Container_Red": "container", "Container_Blue": "container", "Container_Orange": "container",
    "Container_Green": "container", "Container_Grey": "container", "Container_White": "container", "Container_Teal": "container",
    "Solar_Cell": "solar",
}

def img(name, data=False):
    path = os.path.join(TEX_DIR, name)
    im = bpy.data.images.load(path, check_existing=True)
    im.colorspace_settings.name = "Non-Color" if data else "sRGB"
    try:
        im.filepath = bpy.path.relpath(path)
    except Exception:
        pass
    return im

def textured(mname, set_name, tile=None):
    base, metal, rough, emc, ems = C.MAT_DEFS[mname]
    t, alb_mean, r_mean = SETS[set_name]
    tile = tile or t
    m = C.mat(mname)
    nt = m.node_tree
    nt.nodes.clear()
    N, Lk = nt.nodes, nt.links
    out = N.new("ShaderNodeOutputMaterial"); out.location = (900, 0)
    bsdf = N.new("ShaderNodeBsdfPrincipled"); bsdf.location = (500, 0)
    Lk.new(bsdf.outputs[0], out.inputs[0])
    uv = N.new("ShaderNodeUVMap"); uv.uv_map = "UVMap"; uv.location = (-1100, 0)
    mp = N.new("ShaderNodeMapping"); mp.location = (-900, 0)
    mp.inputs["Scale"].default_value = (1.0 / tile, 1.0 / tile, 1.0)
    Lk.new(uv.outputs[0], mp.inputs[0])
    ta = N.new("ShaderNodeTexImage"); ta.image = img(f"{set_name}_albedo.png"); ta.location = (-600, 300)
    to = N.new("ShaderNodeTexImage"); to.image = img(f"{set_name}_orm.png", True); to.location = (-600, 0)
    tn = N.new("ShaderNodeTexImage"); tn.image = img(f"{set_name}_normal.png", True); tn.location = (-600, -300)
    for t_ in (ta, to, tn):
        Lk.new(mp.outputs[0], t_.inputs[0])
    if set_name == "solar":
        Lk.new(ta.outputs[0], bsdf.inputs["Base Color"])
    else:
        mix = N.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"; mix.location = (-200, 300)
        mix.inputs[0].default_value = 1.0
        f = tuple(min(1.0, c / alb_mean) for c in base)
        Lk.new(ta.outputs[0], mix.inputs[6])
        mix.inputs[7].default_value = (*f, 1.0)
        Lk.new(mix.outputs[2], bsdf.inputs["Base Color"])
    sep = N.new("ShaderNodeSeparateColor"); sep.location = (-300, 0)
    Lk.new(to.outputs[0], sep.inputs[0])
    mr = N.new("ShaderNodeMath"); mr.operation = "MULTIPLY"; mr.location = (0, 50)
    mr.inputs[1].default_value = 1.0 if set_name == "solar" else min(1.0, rough / r_mean)
    Lk.new(sep.outputs[1], mr.inputs[0]); Lk.new(mr.outputs[0], bsdf.inputs["Roughness"])
    mm = N.new("ShaderNodeMath"); mm.operation = "MULTIPLY"; mm.location = (0, -100)
    mm.inputs[1].default_value = metal
    Lk.new(sep.outputs[2], mm.inputs[0]); Lk.new(mm.outputs[0], bsdf.inputs["Metallic"])
    nm = N.new("ShaderNodeNormalMap"); nm.uv_map = "UVMap"; nm.location = (0, -300)
    Lk.new(tn.outputs[0], nm.inputs["Color"]); Lk.new(nm.outputs[0], bsdf.inputs["Normal"])
    if emc:
        bsdf.inputs["Emission Color"].default_value = (*emc, 1.0)
        bsdf.inputs["Emission Strength"].default_value = ems
    m["stt_texture_set"] = set_name
    m["stt_tile_m"] = tile
    return m

def apply_textures():
    done = []
    for mname, spec in MAT_SET.items():
        if mname not in C.MAT_DEFS:
            continue
        set_name, tile = (spec, None) if isinstance(spec, str) else spec
        textured(mname, set_name, tile)
        done.append(mname)
    return done
