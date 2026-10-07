"""Fleet previews: every ship of fleet.json (except the master 'meridian', built from the source
modules) is assembled from LINKED DUPLICATES of the module objects (shared meshes), with
object-level material overrides for the company livery, decal atlas and container brands.
The game does the same thing at runtime from the module GLBs + fleet.json."""
import bpy, json, os, math
from mathutils import Vector
from . import stt_core as C, decals as D

SPACING_X = 95.0
MASTER = "meridian"

def livery_material(co, dark=False, base=None):
    base = base or C.mat("Livery_Dark" if dark else "Livery")
    dark = "Livery_Dark" in base.name
    name = f"{base.name}#{co}"
    m = bpy.data.materials.get(name)
    if m is None:
        m = base.copy(); m.name = name
    info = D.fleet()["companies"][co]
    col = info["livery_dark_linear" if dark else "livery_linear"]
    mix = next((n for n in m.node_tree.nodes if n.type == "MIX"), None)
    alb = 0.806
    if mix is not None:
        mix.inputs[7].default_value = (*[min(1.0, c / alb) for c in col], 1.0)
    else:
        b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        b.inputs["Base Color"].default_value = (*col, 1.0)
    m.diffuse_color = (*col, 1.0)
    return m

def _subtree(root):
    return [root] + list(root.children_recursive)

def duplicate_module(key, ship_coll, parent, y, tag, overrides, roll_deg=0.0):
    src_root = bpy.data.objects[f"STT_{key}_ROOT"]
    mapping = {}
    for ob in _subtree(src_root):
        new = ob.copy()
        new.name = f"{tag}_{ob.name}"
        ship_coll.objects.link(new)
        mapping[ob] = new
    for ob, new in mapping.items():
        if ob is src_root:
            new.parent = parent
            new.matrix_parent_inverse.identity()
            new.location = (0.0, y, 0.0)
            new.rotation_mode = "XYZ"
            new.rotation_euler = (0, math.radians(roll_deg), 0)
        else:
            new.parent = mapping.get(ob.parent, parent)
        if new.type == "MESH":
            for slot in new.material_slots:
                src = slot.material
                nm = src.name if src else ""
                tgt = None
                if nm.startswith("STT_Livery"):
                    fn = overrides.get("__livery_fn__")
                    tgt = fn(src) if fn else livery_material(overrides["__co__"], base=src)
                elif nm in overrides:
                    tgt = overrides[nm]
                if tgt is not None:
                    slot.link = "OBJECT"
                    slot.material = tgt
    return mapping

def build_ship(ship, index):
    co = ship["company"]
    top = C.coll("FLEET")
    sc = C.coll(f"FLEET/FLEET_{ship['id']}")
    C.clear_collection(sc)
    root = C.empty(f"FLEET_{ship['id']}", sc, None, (SPACING_X * index, 0, 0), None, "ARROWS", 8.0)
    for k in ("name", "class", "company", "registry"):
        root[f"stt_{k}"] = ship[k]
    root["stt_modules"] = ",".join(ship["modules"])
    overrides = {"__co__": co, "STT_Decals_STT": D.decal_mat(co)}
    counts = {}
    rolls = ship.get("module_roll_deg", [0.0] * len(ship["modules"]))
    for key, y, roll in zip(ship["modules"], ship["module_offsets_m"], rolls):
        counts[key] = counts.get(key, 0) + 1
        tag = f"{ship['id'].upper()}_{key}{counts[key]}"
        mp = duplicate_module(key, sc, root, y, tag, overrides, roll)
        brands = ship.get("containers", {}).get(f"{key}#{counts[key]}")
        if brands:
            conts = sorted([n for o, n in mp.items() if o.get("stt_container")], key=lambda o: str(o.get("stt_slot")))
            for cont, br in zip(conts, brands):
                D.set_container_brand(cont, br, object_level=True)
                for ch in cont.children:
                    if ch.type == "MESH" and ch.get("stt_decals"):
                        D.decal_mat("C:" + br)
                        ch.material_slots[0].link = "OBJECT"
                        ch.material_slots[0].material = D.decal_mat("C:" + br)
    return root

def build_all():
    ships = D.fleet()["ships"]
    out = []
    for i, ship in enumerate(ships):
        if ship["id"] == MASTER:
            continue
        out.append(build_ship(ship, i).name)
    return out
