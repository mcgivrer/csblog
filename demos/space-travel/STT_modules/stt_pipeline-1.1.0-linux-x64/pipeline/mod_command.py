"""Module 00 - COMMANDEMENT (bow). Local Y: 0 (bow docking port, STT-6) -> 13 (aft collar).
Nose loft with two rows of slit bridge windows, rect 8.5 x 8 chamfered main hull, 4 bow RCS clusters,
dish, comm mast, sensor dome, docking floodlights, nav lights, portholes."""
import bpy, math
from mathutils import Vector, Matrix
from . import stt_core as C, stt_kit as K
from .stt_core import T

KEY = "CMD"
CS = 1
W, H, RC = 8.5, 8.0, 1.5
Y_NOSE_END, Y_AFT = 4.8, 12.25

def build():
    root, c, info = C.module_root(KEY, {"stt_mass_t": 180.0, "stt_capacity": "crew 6 (bridge + ops)",
                                        "stt_bow_docking": True})
    L = info["length"]
    mb = C.MB()
    K.collar(mb, "fwd", seg=24)
    secs = [(C.rect_loop(5.9, 5.9, 1.6, CS), C.COLLAR_HALF), (C.rect_loop(6.8, 6.6, 1.6, CS), 1.7),
            (C.rect_loop(7.3, 7.05, 1.55, CS), 2.35), (C.rect_loop(7.42, 7.17, 1.55, CS), 2.55),
            (C.rect_loop(7.9, 7.6, 1.5, CS), 3.3), (C.rect_loop(W, H, RC, CS), Y_NOSE_END)]
    def nose_mats(i, j):
        if i == 1 and j in (0, 1, 2):
            return "Bridge_Glass"
        if i == 3 and j in (7, 0, 1, 2, 3):
            return "Bridge_Glass"
        return {0: "Hull_Grey", 2: "Hull_Dark"}.get(i, "Hull_White")
    C.loft(mb, secs, nose_mats)
    C.loop_to_round_plate(mb, secs[0][0], 2.8, C.COLLAR_HALF, -1, "Hull_Grey")
    K.rect_hull(mb, W, H, RC, CS, Y_NOSE_END, Y_AFT, grooves=(8.0,), livery=((10.3, 11.3),))
    C.rect_to_round_plate(mb, W, H, RC, CS, 2.8, Y_AFT, +1, "Hull_Grey")
    K.collar(mb, "aft", L, seg=24)
    mb.to_object("STT_CMD_Hull", c, root, bevel=0.04)

    mb = C.MB()
    K.rect_panels(mb, W, H, RC, CS, Y_NOSE_END + 0.2, Y_AFT - 0.2, sides=("top", "left", "right", "bottom"),
                  per_side=1, seed=8)
    rcs = {}
    for q, tag in enumerate(("TR", "TL", "BL", "BR")):
        rcs[tag] = K.rcs_cluster(mb, C.corner_frame(q, W, H, RC, CS, 6.0), 1.1)
    # dish + mast + sensor dome
    Ft = C.side_frame("top", W, H, 8.4, -1.6)
    mb.cyl(0.12, 0.9, 8, "Metal_Dark", C.look_mtx(Ft @ Vector((0, 0, 0)), (0, 0, 1)))
    K.dish(mb, C.look_mtx(Ft @ Vector((0, 0, 1.5)), (0.25, -0.55, 1.0)), 1.1)
    K.mast(mb, C.side_frame("top", W, H, 11.0, 2.3), 2.6)
    K.dome(mb, C.side_frame("bottom", W, H, 7.8, 0.0), 0.75)
    # docking flood lights aimed forward
    for side in ("top", "bottom"):
        for u in (-2.2, 2.2):
            K.floodlight(mb, C.side_frame(side, W, H, 5.15, u), aim=(0, -1, 0.25))
    navs = {
        "PORT": K.nav_light(mb, Vector((W / 2, 5.4, 0)), (1, 0, 0), "Nav_Red"),
        "STBD": K.nav_light(mb, Vector((-W / 2, 5.4, 0)), (-1, 0, 0), "Nav_Green"),
        "STROBE_BOT": K.nav_light(mb, Vector((0, 11.8, -H / 2)), (0, 0, -1), "Nav_White"),
    }
    # crew portholes (2 decks) on both sides, EVA hatch on -X side, handrail on top
    for side in ("left", "right"):
        for y in (7.0, 9.0):
            for u in (-2.0, 0.0, 2.0):
                if side == "left" and y == 9.0 and u == 0.0:
                    continue
                K.window(mb, C.side_frame(side, W, H, y, u), 0.8, 0.55)
    K.eva_hatch(mb, C.side_frame("left", W, H, 9.4, 0.0))
    Fh = C.side_frame("top", W, H, 0.0, 1.0)
    K.handrail(mb, [Fh @ Vector((0, 5.3, 0)), Fh @ Vector((0, 11.6, 0))], (0, 0, 1))
    mb.to_object("STT_CMD_Details", c, root)
    for tag, nl in rcs.items():
        for t, pnt, d in nl:
            C.empty(f"RCS_{KEY}_{tag}_{t}", c, root, pnt, d, "SINGLE_ARROW", 0.8, {"stt_rcs": True})
    for tag, pnt in navs.items():
        C.empty(f"NAVLIGHT_{KEY}_{tag}", c, root, pnt, None, "SPHERE", 0.3, {"stt_navlight": tag.lower()})
    return {"tris": C.collection_tris(c)}
