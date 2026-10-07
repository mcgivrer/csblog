"""Kit preview v2 - rectangular hull sections: A chamfered vs B rounded (checkpoint 1b)."""
import bpy, math
from mathutils import Vector, Matrix
from . import stt_core as C, stt_kit as K
from .stt_core import T

def sample(c, root, name, x, cseg, rc, w=8.0, h=7.0, L=6.75):
    mb = C.MB()
    K.collar(mb, "fwd", seg=24)
    C.rect_to_round_plate(mb, w, h, rc, cseg, 2.8, C.COLLAR_HALF, -1, "Hull_Grey")
    K.rect_hull(mb, w, h, rc, cseg, C.COLLAR_HALF, L, grooves=(2.6, 5.2), livery=((3.3, 4.4),))
    hull = mb.to_object(f"KIT_{name}_Hull", c, root, (x, -3, 0), bevel=0.03)
    mb = C.MB()
    K.rect_panels(mb, w, h, rc, cseg, C.COLLAR_HALF, L, per_side=2, seed=4)
    noz = []
    for q in (0, 3):
        noz += K.rcs_cluster(mb, C.corner_frame(q, w, h, rc, cseg, 1.6), 1.0)
    K.nav_light(mb, Vector((w / 2, 6.0, 0)), (1, 0, 0), "Nav_Green")
    K.floodlight(mb, C.side_frame("top", w, h, 1.2, -2.0), aim=(0, -1, 0.5))
    Ft = C.side_frame("top", w, h, 0, 1.8)
    K.handrail(mb, [Ft @ Vector((0, 1.2, 0)), Ft @ Vector((0, 6.3, 0))], (0, 0, 1))
    Fr = C.side_frame("right", w, h, 0, -1.6)
    K.conduits(mb, [Fr @ Vector((0, 1.0, 0.2)), Fr @ Vector((0, 6.5, 0.2))], Fr.to_3x3() @ Vector((1, 0, 0)), n=3)
    det = mb.to_object(f"KIT_{name}_Details", c, root, (x, -3, 0))
    for tag, pnt, d in noz:
        C.empty(f"RCS_KIT_{name}_{tag}", c, det, pnt, d, "SINGLE_ARROW", 0.5)
    return hull, det

def build():
    c = C.coll("98_Kit_Preview")
    C.clear_collection(c)
    root = C.empty("KIT_ROOT", c, kind="PLAIN_AXES", size=1.0)
    root["stt_export"] = False
    sample(c, root, "A_Chamfer", -6.0, 1, 1.3)
    sample(c, root, "B_Rounded", 6.0, 4, 1.3)
    hr = bpy.data.objects.get("REF_Human_1m80")
    if hr:
        hr.location = (0.0, -4.0, -2.6)
    return C.collection_tris(c)
