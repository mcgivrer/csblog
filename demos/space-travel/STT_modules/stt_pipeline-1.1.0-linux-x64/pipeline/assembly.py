"""Phase 8 - assembly: ship root, socket checks, ship-level properties, tri report."""
import bpy
from mathutils import Vector
from . import stt_core as C

SHIP = "STT_SHIP_Freighter"

def assemble():
    top = C.coll(C.SHIP_ROOT_COLL)
    ship = bpy.data.objects.get(SHIP)
    if ship is None:
        ship = C.empty(SHIP, top, None, (0, 0, 0), None, "ARROWS", 6.0)
    ship["stt_ship_class"] = "Freighter"
    ship["stt_module_order"] = ",".join(k for k, _, _ in C.MODULES)
    ship["stt_length_m"] = sum(L for _, _, L in C.MODULES)
    ship["stt_forward_axis"] = "-Y blender / +Z glTF"
    report, issues = {}, []
    prev_aft = None
    for key, cname, L in C.MODULES:
        root = bpy.data.objects.get(f"STT_{key}_ROOT")
        if root is None:
            issues.append(f"missing {key}"); continue
        mw = root.matrix_world.copy()
        root.parent = ship
        root.matrix_world = mw
        fwd = bpy.data.objects.get(f"SOCKET_{key}_FWD")
        aft = bpy.data.objects.get(f"SOCKET_{key}_AFT")
        if prev_aft is not None and fwd is not None:
            d = (prev_aft.matrix_world.translation - fwd.matrix_world.translation).length
            if d > 1e-3:
                issues.append(f"{key}: socket gap {d:.3f} m")
        prev_aft = aft
        coll = bpy.data.collections[cname]
        report[key] = C.collection_tris(coll)
    report["TOTAL"] = sum(v for k, v in report.items())
    return {"tris": report, "issues": issues}
