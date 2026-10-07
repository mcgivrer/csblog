"""Module 03 - RESERVOIRS. Local Y: 0 -> 19. Four round MLI-insulated pressure tanks
(diagonal quadrants) inside a rectangular chamfered cage (11.6 x 11.6), central spine,
saddles, feed lines to an aft manifold."""
import bpy, math
from mathutils import Vector, Matrix
from . import stt_core as C, stt_kit as K
from .stt_core import T, polar

KEY = "TANK"
CS = 1
FW, FRC = 11.6, 2.4            # cage / end frames
SW, SRC = 2.6, 0.5             # spine
Y_F0, Y_F1 = C.COLLAR_HALF, 1.6
Y_A0, Y_A1 = 17.4, 19.0 - C.COLLAR_HALF
TR, TD = 2.2, 2.75             # tank radius, centre offset on x and z
T_Y0, T_Y1 = 2.0, 17.0
HOOPS = (6.5, 12.0)

def build():
    root, c, info = C.module_root(KEY, {"stt_mass_t": 140.0, "stt_capacity": "4 tanks x 210 m3 (reaction mass)",
                                        "stt_tank_volume_m3": 4 * 210})
    L = info["length"]
    oct_loop = C.rect_loop(FW, FW, FRC, CS)
    sp_loop = C.rect_loop(SW, SW, SRC, CS)

    # ------------------------------------------------ end frames + spine
    mb = C.MB()
    K.collar(mb, "fwd", seg=24)
    C.loop_to_round_plate(mb, oct_loop, 2.8, Y_F0, -1, "Hull_Grey")
    K.rect_hull(mb, FW, FW, FRC, CS, Y_F0, Y_F1, livery=((Y_F0 + 0.2, Y_F1 - 0.2),), livery_mat="Livery")
    C.loop_to_loop_plate(mb, oct_loop, sp_loop, Y_F1, +1, "Hull_Grey")
    K.rect_hull(mb, SW, SW, SRC, CS, Y_F1, Y_A0, mat="Hull_Grey", grooves=(6.5, 12.0))
    C.loop_to_loop_plate(mb, oct_loop, sp_loop, Y_A0, -1, "Hull_Grey")
    K.rect_hull(mb, FW, FW, FRC, CS, Y_A0, Y_A1, livery=((Y_A0 + 0.2, Y_A1 - 0.2),), livery_mat="Livery")
    C.loop_to_round_plate(mb, oct_loop, 2.8, Y_A1, +1, "Hull_Grey")
    K.collar(mb, "aft", L, seg=24)
    mb.to_object("STT_TANK_Frame", c, root, bevel=0.03)

    # ------------------------------------------------ cage: 8 longerons + hoops
    mb = C.MB()
    lp = C.rect_loop(FW - 0.5, FW - 0.5, FRC - 0.25, CS)
    pts = [Vector((x, 0, z)) for x, z in lp]
    for p in pts:
        mb.box((0.35, Y_A0 - Y_F1, 0.35), (p.x, (Y_F1 + Y_A0) / 2, p.z), "Hull_Grey",
               rot=Matrix.Rotation(-math.atan2(p.z, p.x), 4, "Y"))
    for y in HOOPS:
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            K.beam(mb, Vector((a.x, y, a.z)), Vector((b.x, y, b.z)), 0.3, 0.45, "Hull_Light")
    # diagonal bracing on flat sides between hoops/frames
    ys = [Y_F1] + list(HOOPS) + [Y_A0]
    for k in range(len(ys) - 1):
        for side in range(4):
            i = side * 2 + 1                     # flat side segment index (rect_loop cseg=1)
            a, b = pts[i], pts[(i + 1) % 8]
            ya, yb = ys[k] + 0.25, ys[k + 1] - 0.25
            if k % 2:
                a, b = b, a
            mb.strut(Vector((a.x, ya, a.z)), Vector((b.x, yb, b.z)), 0.07, 6, "Metal_Dark")
    mb.to_object("STT_TANK_Cage", c, root)

    # ------------------------------------------------ tanks + saddles + plumbing
    mb = C.MB()
    centers = [Vector((sx * TD, 0, sz * TD)) for sx, sz in ((1, 1), (-1, 1), (-1, -1), (1, -1))]
    for cc in centers:
        K.pressure_tank(mb, T(cc.x, T_Y0, cc.z), TR, T_Y1 - T_Y0, 20, "MLI_Gold", "Metal_Dark", straps=3, dome=0.45)
    for y in HOOPS:
        for cc in centers:
            d = cc.normalized()
            inner = Vector((cc.x, y, cc.z)) - d * (TR + 0.02)
            outer = Vector((cc.x, y, cc.z)) + d * (TR + 0.02)
            K.beam(mb, Vector((d.x * 1.3, y, d.z * 1.3)), inner, 0.3, 0.35, "Metal_Dark")
            hoop_pt = Vector((d.x * (FW / 2 - 0.4) * 1.12, y, d.z * (FW / 2 - 0.4) * 1.12))
            K.beam(mb, outer, hoop_pt, 0.25, 0.3, "Metal_Dark")
    # feed lines: aft dome -> manifold ring on the aft frame
    for k, cc in enumerate(centers):
        a = Vector((cc.x * 0.55, T_Y1 + 0.15, cc.z * 0.55))
        mb.pipe([Vector((cc.x, T_Y1 - 0.2, cc.z)), Vector((cc.x, T_Y1 + 0.2, cc.z)), a, Vector((a.x * 0.6, Y_A0 - 0.05, a.z * 0.6))],
                0.14, 8, "Metal_Bare", fillet_r=0.35)
        mb.pipe([Vector((cc.x, T_Y0 + 0.2, cc.z)) + Vector((cc.x, 0, cc.z)).normalized() * 0.4,
                 Vector((cc.x * 0.5, T_Y0 - 0.1, cc.z * 0.5)), Vector((cc.x * 0.4, Y_F1 + 0.05, cc.z * 0.4))],
                0.08, 6, "Metal_Copper", fillet_r=0.3)
    mb.revolve([(1.75, Y_A0 - 0.35), (1.95, Y_A0 - 0.35), (1.95, Y_A0 - 0.02), (1.75, Y_A0 - 0.02)], 16, "Metal_Dark")
    # flood lights + handrails
    for side in ("top", "bottom", "left", "right"):
        K.floodlight(mb, C.side_frame(side, FW, FW, Y_F1 - 0.1, 0.0), aim=(0, 1, -0.8))
    for y in (Y_F0 + 0.4, Y_A1 - 0.4):
        Fh = C.side_frame("top", FW, FW, y, 0.0)
        K.handrail(mb, [Fh @ Vector((-2.2, 0, 0)), Fh @ Vector((2.2, 0, 0))], (0, 0, 1))
    mb.to_object("STT_TANK_Tanks", c, root)
    return {"tris": C.collection_tris(c)}
