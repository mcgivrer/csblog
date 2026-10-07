"""Module 05 - PROPULSION (tail). Local Y: 0 (front docking face) -> 28 (nozzle exit).
Sections: fwd machinery (rect 10x9) | open truss bay | reactor (rect 11x10) | taper to octagon |
gimbal ring + main bell (separate object, pivot at gimbal). Exhaust VFX = empty VFX_PROP_MAIN_EXHAUST."""
import bpy, math
from mathutils import Vector, Matrix
from . import stt_core as C, stt_kit as K
from .stt_core import T, polar, TAU

KEY = "PROP"
CS = 1                      # chamfered corners
FW, FH, FRC = 10.0, 9.0, 1.5     # forward section
RW, RH, RRC = 11.0, 10.0, 1.8    # reactor section
Y_FWD_END, Y_BAY_END, Y_REA_END, Y_TAPER_END = 6.0, 9.5, 16.0, 21.0
PIVOT_Y = 21.6
OCT = 6.6                   # octagon width at taper end (regular octagon)

def build():
    root, c, info = C.module_root(KEY, {"stt_mass_t": 420.0, "stt_capacity": "main drive 1x, RCS 4x4",
                                        "stt_thrust_axis": "-Y blender (forward)"})
    # tail module: no aft socket
    aft = bpy.data.objects.get(f"SOCKET_{KEY}_AFT")
    if aft: bpy.data.objects.remove(aft, do_unlink=True)
    L = info["length"]
    oct_rc = OCT / (1 + math.sqrt(2)) / math.sqrt(2)

    # ------------------------------------------------ hull
    mb = C.MB()
    K.collar(mb, "fwd", seg=24)
    C.rect_to_round_plate(mb, FW, FH, FRC, CS, 2.8, C.COLLAR_HALF, -1, "Hull_Grey")
    K.rect_hull(mb, FW, FH, FRC, CS, C.COLLAR_HALF, Y_FWD_END, grooves=(2.4,), livery=((3.2, 4.3),))
    C.rect_to_round_plate(mb, FW, FH, FRC, CS, 1.7, Y_FWD_END, +1, "Hull_Grey")
    # reactor section
    C.rect_to_round_plate(mb, RW, RH, RRC, CS, 1.7, Y_BAY_END, -1, "Hull_Grey")
    K.rect_hull(mb, RW, RH, RRC, CS, Y_BAY_END, Y_REA_END, grooves=(11.6, 13.8), mat="Hull_Light",
                livery=((15.2, 15.9),), livery_mat="Hull_Dark")
    # taper to octagon
    C.loft(mb, [(C.rect_loop(RW, RH, RRC, CS), Y_REA_END), (C.rect_loop(RW - 0.4, RH - 0.4, RRC, CS), Y_REA_END + 0.3),
                (C.rect_loop(OCT, OCT, oct_rc, CS), Y_TAPER_END)], ["Hull_Dark", "Hull_Grey"])
    C.loop_to_round_plate(mb, C.rect_loop(OCT, OCT, oct_rc, CS), 2.3, Y_TAPER_END, +1, "Metal_Dark")
    hull = mb.to_object("STT_PROP_Hull", c, root, bevel=0.04)

    # ------------------------------------------------ open truss bay (y 6 -> 9.5)
    mb = C.MB()
    mb.revolve([(1.6, Y_FWD_END), (1.6, 6.6), (1.68, 6.65), (1.68, 6.9), (1.6, 6.95), (1.6, 8.55), (1.68, 8.6),
                (1.68, 8.85), (1.6, 8.9), (1.6, Y_BAY_END)], 16,
               ["MLI_Silver", "Metal_Dark", "Metal_Dark", "Metal_Dark", "MLI_Silver", "Metal_Dark", "Metal_Dark", "Metal_Dark", "MLI_Silver"])
    corners = [C.corner_frame(q, FW, FH, FRC, CS, 0.0, lift=-0.35).translation for q in range(4)]
    for q, cp in enumerate(corners):
        mb.box((0.4, Y_BAY_END - Y_FWD_END, 0.4), (cp.x, (Y_FWD_END + Y_BAY_END) / 2, cp.z), "Hull_Grey")
    for q in range(4):
        a, b = corners[q], corners[(q + 1) % 4]
        y0, y1 = Y_FWD_END + 0.2, Y_BAY_END - 0.2
        mb.strut(Vector((a.x, y0, a.z)), Vector((b.x, y1, b.z)), 0.06, 6, "Metal_Dark")
        mb.strut(Vector((b.x, y0, b.z)), Vector((a.x, y1, a.z)), 0.06, 6, "Metal_Dark")
    for sx in (-1, 1):
        cen = Vector((sx * 3.15, 7.75, 0.0))
        K.sphere(mb, cen, 1.0, 16, 8, "MLI_Gold")
        mb.pipe([cen + Vector((-sx * 0.95, 0, 0)), Vector((sx * 1.62, 7.75, 0))], 0.09, 8, "Metal_Bare")
        mb.pipe([cen + Vector((0, 0, -0.98)), cen + Vector((0, 0, -1.6)), Vector((sx * 1.0, 7.75, -1.6)),
                 Vector((sx * 1.0, 7.75, -1.3))], 0.06, 6, "Metal_Copper", fillet_r=0.3)
        mb.box((0.5, 0.5, 0.15), (sx * 3.15, 7.75, 1.05), "Metal_Dark")
    for q, cp in enumerate(corners):   # work lights on the longerons, aimed at the core
        inward = Vector((-cp.x, 0, -cp.z)).normalized()
        M = C.look_mtx(Vector((cp.x, 7.75, cp.z)) + inward * 0.3, inward)
        mb.box((0.5, 0.12, 0.25), (0, 0, 0), "Hull_Dark", M)
        mb.box((0.42, 0.02, 0.18), (0, 0.07, 0), "Floodlight", M)
    mb.to_object("STT_PROP_Bay", c, root)

    # ------------------------------------------------ details
    mb = C.MB()
    K.rect_panels(mb, FW, FH, FRC, CS, C.COLLAR_HALF + 0.3, Y_FWD_END, sides=("top", "left", "right"), per_side=2, seed=21)
    K.rect_panels(mb, RW, RH, RRC, CS, Y_BAY_END, Y_REA_END - 1.0, sides=("top", "left", "right", "bottom"), per_side=2,
                  seed=33, mats=("Hull_White", "Hull_Grey"))
    K.eva_hatch(mb, C.side_frame("right", FW, FH, 1.9, 0.0))
    Ft = C.side_frame("top", FW, FH, 0.0, 2.6)
    K.handrail(mb, [Ft @ Vector((0, 1.2, 0)), Ft @ Vector((0, 5.6, 0))], (0, 0, 1))
    # coolant conduits along two corners, stepping out onto the reactor section
    for q in (1, 3):
        fa = C.corner_frame(q, FW, FH, FRC, CS, 0.0)
        fb = C.corner_frame(q, RW, RH, RRC, CS, 0.0)
        n = fa.to_3x3() @ Vector((0, 0, 1))
        pa = lambda y: fa @ Vector((0, y, 0.22))
        pb = lambda y: fb @ Vector((0, y, 0.22))
        K.conduits(mb, [pa(1.4), pa(9.0), pb(10.2), pb(15.4)], fa.to_3x3() @ Vector((1, 0, 0)), n=2, r=0.11, spacing=0.3,
                   fillet_r=0.7, clamps_every=2.5)
    # flood lights lighting the bell, strobes, nav lights (port = +X red, starboard = -X green)
    for u in (-3.0, 3.0):
        K.floodlight(mb, C.side_frame("top", RW, RH, 15.5, u), aim=(0, 1, 0.35))
    navs = {
        "PORT": K.nav_light(mb, Vector((RW / 2, 14.8, 0)), (1, 0, 0), "Nav_Red"),
        "STBD": K.nav_light(mb, Vector((-RW / 2, 14.8, 0)), (-1, 0, 0), "Nav_Green"),
        "STROBE_TOP": K.nav_light(mb, Vector((0, 15.6, RH / 2)), (0, 0, 1), "Nav_White"),
        "STROBE_BOT": K.nav_light(mb, Vector((0, 15.6, -RH / 2)), (0, 0, -1), "Nav_White"),
    }
    # RCS clusters on the 4 chamfered corners of the reactor section
    rcs = {}
    for q, tag in enumerate(("TR", "TL", "BL", "BR")):
        rcs[tag] = K.rcs_cluster(mb, C.corner_frame(q, RW, RH, RRC, CS, 12.6), 1.25)
    # gimbal actuators (taper -> ring)
    for k in range(4):
        a = TAU * k / 4 + TAU / 8
        p0, p1 = polar(a, 3.75, 19.4), polar(a, 2.95, PIVOT_Y + 0.15)
        mid = p0.lerp(p1, 0.55)
        mb.pipe([p0, mid], 0.16, 8, "Metal_Dark")
        mb.pipe([mid, p1], 0.09, 8, "Metal_Bare")
    det = mb.to_object("STT_PROP_Details", c, root, bevel=0.0)
    for tag, nl in rcs.items():
        for t, pnt, d in nl:
            C.empty(f"RCS_{KEY}_{tag}_{t}", c, root, pnt, d, "SINGLE_ARROW", 0.8, {"stt_rcs": True})
    for tag, pnt in navs.items():
        C.empty(f"NAVLIGHT_{KEY}_{tag}", c, root, pnt, None, "SPHERE", 0.3, {"stt_navlight": tag.lower()})

    # ------------------------------------------------ gimbal ring + main bell (pivot = gimbal)
    ribs = (23.7, 24.8, 26.0, 27.1)
    curve = [(1.6, 22.4), (1.9, 23.2), (2.4, 24.2), (3.0, 25.4), (3.5, 26.6), (3.9, 27.6), (4.05, L)]
    def r_at(y):
        for (r0, y0), (r1, y1) in zip(curve, curve[1:]):
            if y0 <= y <= y1:
                return r0 + (r1 - r0) * (y - y0) / (y1 - y0)
        return curve[-1][0]
    outer, omats = [], []
    pts = sorted([y for _, y in curve] + [y + d for y in ribs for d in (-0.08, 0.0, 0.08)])
    for y in pts:
        bump = 0.07 if any(abs(y - rb) < 1e-6 for rb in ribs) else 0.0
        outer.append((r_at(y) + bump, y))
    for i in range(len(outer) - 1):
        omats.append("Metal_Bare" if (outer[i][0] > r_at(outer[i][1]) + 1e-6 or outer[i + 1][0] > r_at(outer[i + 1][1]) + 1e-6) else "Metal_Dark")
    ring = [(0.0, 21.0), (2.4, 21.0), (2.4, 21.2), (2.75, 21.25), (2.75, 21.95), (2.4, 22.0), (1.9, 22.1)]
    rmats = ["Metal_Dark", "Metal_Dark", "Metal_Bare", "Hull_Dark", "Metal_Bare", "Metal_Dark", "Metal_Dark"]
    inner = [(4.05, L + 0.05), (3.92, L + 0.05), (3.78, 27.6), (3.38, 26.6), (2.88, 25.4), (2.28, 24.2), (1.78, 23.2),
             (1.45, 22.5), (1.2, 22.3), (0.0, 22.25)]
    imats = ["Metal_Bare", "Metal_Bare"] + ["Nozzle_Inner"] * 7 + ["Engine_Glow"]
    prof = ring + outer + inner
    mats = rmats + omats + imats
    mb = C.MB()
    mb.revolve(prof, 32, mats[:len(prof) - 1], T(0, -PIVOT_Y, 0))
    noz = mb.to_object("STT_PROP_Nozzle", c, root, (0, PIVOT_Y, 0), smooth_angle=50)
    noz["stt_gimbal"] = True
    noz["stt_gimbal_max_deg"] = 6.0
    C.empty(f"VFX_{KEY}_MAIN_EXHAUST", c, noz, (0, L - PIVOT_Y, 0), (0, 1, 0), "SINGLE_ARROW", 3.0, {"stt_vfx": "main_exhaust"})

    return {"tris": C.collection_tris(c), "objects": len(c.objects)}
