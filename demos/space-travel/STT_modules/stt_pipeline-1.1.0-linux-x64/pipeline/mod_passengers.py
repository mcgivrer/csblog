"""Module 01 - PASSAGERS. Local Y: 0 -> 21. Tail-sitter: 5 decks stacked along the axis
(floor = aft side of each deck, because thrust pushes occupants toward +Y).
Deck 0 = commons (lounge/galley), decks 1-4 = 6 cabins + 2 washrooms each (24 cabins).
Exterior: rect 12 x 12 chamfered hull, windows per cabin, escape-pod hatches, EVA hatches.
Interior blockout in 01_Passagers_Int (separate objects, togglable in game)."""
import bpy, math
from mathutils import Vector, Matrix
from . import stt_core as C, stt_kit as K
from .stt_core import T

KEY = "PAX"
CS = 1
W = H = 12.0
RC = 2.0
DECKS = [1.0, 4.6, 8.2, 11.8, 15.4, 19.0]      # deck boundaries (slabs)
Y_FRONT, Y_AFT = C.COLLAR_HALF, 21.0 - C.COLLAR_HALF
LIN = 0.3            # inner lining inset
A = 2.4              # corridor square half-size
SHAFT = 1.3          # central lift shaft half-size
WASH = (3, 7)        # washroom cells (no window)
BELTS = ((4.5, 5.45), (11.3, 12.3))   # technical belts (y ranges)

def cell_window(k):
    """(side, u) of the exterior window for cabin cell k (centre angle 22.5 + 45k deg)."""
    return {0: ("right", -2.2), 1: ("top", 2.2), 2: ("top", -2.2), 4: ("left", -2.2),
            5: ("bottom", 2.2), 6: ("bottom", -2.2), 3: ("left", 2.2), 7: ("right", 2.2)}[k]

def build():
    root, c, info = C.module_root(KEY, {"stt_mass_t": 260.0, "stt_capacity": "24 cabins / 48 passengers",
                                        "stt_decks": 5})
    L = info["length"]
    c_ext = C.coll(C.SHIP_ROOT_COLL + "/01_Passagers/01_Passagers_Ext")
    c_int = C.coll(C.SHIP_ROOT_COLL + "/01_Passagers/01_Passagers_Int")
    C.clear_collection(c_ext); C.clear_collection(c_int)

    # ------------------------------------------------ exterior hull
    mb = C.MB()
    K.collar(mb, "fwd", seg=24)
    C.rect_to_round_plate(mb, W, H, RC, CS, 2.8, Y_FRONT, -1, "Hull_Grey")
    K.rect_hull(mb, W, H, RC, CS, Y_FRONT, Y_AFT, grooves=DECKS[1:], livery=((19.35, 20.05),))
    C.rect_to_round_plate(mb, W, H, RC, CS, 2.8, Y_AFT, +1, "Hull_Grey")
    K.collar(mb, "aft", L, seg=24)
    mb.to_object("STT_PAX_Hull", c_ext, root, bevel=0.04)

    # ------------------------------------------------ exterior details
    mb = C.MB()
    # commons deck: panoramic lounge windows on the 4 sides (floor at y=4.6)
    for side in ("top", "bottom", "left", "right"):
        K.window(mb, C.side_frame(side, W, H, DECKS[1] - 1.7, 0.0), 1.0, 3.0)
    for d in range(1, 5):
        yw = DECKS[d + 1] - 1.6
        for k in range(8):
            if k in WASH:
                continue
            side, u = cell_window(k)
            K.window(mb, C.side_frame(side, W, H, yw, u), 1.1, 0.75)
        for q in (1, 3):
            K.pod_hatch(mb, C.corner_frame(q, W, H, RC, CS, DECKS[d] + 1.8), 0.72)
    for q in (1, 3):
        K.eva_hatch(mb, C.corner_frame(q, W, H, RC, CS, 2.8), 1.0, 1.7)
    Ft = C.side_frame("top", W, H, 0.0, 4.2)
    K.handrail(mb, [Ft @ Vector((0, 1.2, 0)), Ft @ Vector((0, 19.8, 0))], (0, 0, 1))
    Fb = C.side_frame("bottom", W, H, 0.0, 4.2)
    K.handrail(mb, [Fb @ Vector((0, 1.2, 0)), Fb @ Vector((0, 19.8, 0))], (0, 0, -1))
    for u in (-3.6, 3.6):
        K.floodlight(mb, C.side_frame("top", W, H, 1.3, u), aim=(0, 1, 0.15))
    mb.to_object("STT_PAX_Details", c_ext, root)

    # ------------------------------------------------ technical belts (survival radiators + airlock caissons)
    mb = C.MB()
    O = 0.28
    for (y0, y1) in BELTS:
        C.rect_sweep(mb, W, H, RC, CS, [(0.0, y0), (-O, y0 + 0.12), (-O, y1 - 0.12), (0.0, y1)],
                     ["Hull_Dark", "Hull_Grey", "Hull_Dark"])
        yc, bl = (y0 + y1) / 2, (y1 - y0)
        for q in range(4):
            F = C.corner_frame(q, W + 2 * O, H + 2 * O, RC + O, CS, yc)
            mb.box((2.9, bl - 0.1, 0.06), (0, 0, 0.03), "Metal_Dark", F)
            for k in range(7):
                x = -1.26 + k * 0.42
                mb.box((0.05, bl - 0.2, 0.75), (x, 0, 0.42), "Radiator", F)
            mb.pipe([F @ Vector((-1.4, -bl / 2 + 0.1, 0.12)), F @ Vector((1.4, -bl / 2 + 0.1, 0.12))], 0.05, 6, "Metal_Copper")
        for side in ("left", "right"):
            F = C.side_frame(side, W + 2 * O, H + 2 * O, yc, 0.0)
            mb.box((2.4, bl + 0.5, 0.85), (0, 0, 0.425), "Hull_Light", F, taper=0.92)
            K.eva_hatch(mb, F @ T(0, 0, 0.85), 1.0, 1.1)
        for side in ("top", "bottom"):
            for u in (-3.0, 3.0):
                F = C.side_frame(side, W + 2 * O, H + 2 * O, yc, u)
                mb.box((1.2, bl - 0.2, 0.3), (0, 0, 0.15), "Hull_Grey", F)
                for k in range(4):
                    mb.box((1.0, 0.06, 0.06), (0, -bl / 2 + 0.25 + k * (bl - 0.5) / 3, 0.33), "Metal_Dark", F)
    mb.to_object("STT_PAX_Belts", c_ext, root)

    # ------------------------------------------------ interior structure
    mb = C.MB()
    C.rect_sweep(mb, W - 2 * LIN, H - 2 * LIN, RC - LIN, CS, [(0.0, DECKS[-1]), (0.0, DECKS[0])], "Int_Wall")
    lin_loop = C.rect_loop(W - 2 * LIN, H - 2 * LIN, RC - LIN, CS)
    sh_loop = C.rect_loop(2 * SHAFT, 2 * SHAFT, 0.25, CS)
    for i, y in enumerate(DECKS):
        if i > 0:      # floor of the deck in front (faces -Y)
            C.loop_to_loop_plate(mb, lin_loop, sh_loop, y - 0.15, -1, "Int_Floor")
        if i < len(DECKS) - 1:   # ceiling of the deck behind (faces +Y)
            C.loop_to_loop_plate(mb, lin_loop, sh_loop, y + 0.15, +1, "Int_Wall")
    C.rect_sweep(mb, 2 * SHAFT, 2 * SHAFT, 0.25, CS, [(0.0, DECKS[0]), (0.0, DECKS[-1])], "Int_Wall")
    ap = W / 2 - LIN
    cham_mid = ap - (RC - LIN) / 2
    for d in range(1, 5):
        y0, y1 = DECKS[d] + 0.15, DECKS[d + 1] - 0.15
        # corridor square
        for (p0, p1) in (((-A, A), (A, A)), ((A, A), (A, -A)), ((A, -A), (-A, -A)), ((-A, -A), (-A, A))):
            K.wall(mb, p0, p1, y0, y1)
        # radial walls: mid-sides and corners
        for (sx, sz) in ((1, 0), (0, 1), (-1, 0), (0, -1)):
            K.wall(mb, (sx * A, sz * A), (sx * ap, sz * ap), y0, y1)
        for (sx, sz) in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
            K.wall(mb, (sx * A, sz * A), (sx * cham_mid, sz * cham_mid), y0, y1)
        # cabin doors (on the corridor side) + lift door
        for k in range(8):
            phi = math.radians(22.5 + 45 * k)
            # door on corridor wall, halfway between mid-side and corner
            mx, mz = math.cos(phi), math.sin(phi)
            if abs(mx) > abs(mz):
                p = (math.copysign(A, mx), A * 0.5 * (1 if mz > 0 else -1)); n = (-math.copysign(1, mx), 0)
            else:
                p = (A * 0.5 * (1 if mx > 0 else -1), math.copysign(A, mz)); n = (0, -math.copysign(1, mz))
            yf = DECKS[d + 1] - 0.15
            Fd = Matrix.Identity(4)
            Zd = Vector((n[0], 0, n[1])); Yd = Vector((0, 1, 0)); Xd = Yd.cross(Zd)
            for r_ in range(3):
                Fd[r_][0], Fd[r_][1], Fd[r_][2] = Xd[r_], Yd[r_], Zd[r_]
            Fd.translation = Vector((p[0] + n[0] * 0.06, yf - 1.05, p[1] + n[1] * 0.06))
            mb.box((0.9, 2.1, 0.04), (0, 0, 0), "Hull_Dark" if k not in WASH else "Hull_Grey", Fd)
        mb.box((1.1, 2.2, 0.06), (SHAFT + 0.03, DECKS[d + 1] - 0.15 - 1.1, 0), "Metal_Bare")
    mb.box((1.1, 2.2, 0.06), (SHAFT + 0.03, DECKS[1] - 0.15 - 1.1, 0), "Metal_Bare")
    mb.to_object("STT_PAX_Int_Structure", c_int, root, weighted=False)

    # ------------------------------------------------ interior furniture + lights
    mb = C.MB()
    def ffr(phi):
        t = Vector((-math.sin(phi), 0, math.cos(phi)))
        Y = Vector((0, 1, 0)); Z = t.cross(Y)
        M = Matrix.Identity(4)
        for r_ in range(3):
            M[r_][0], M[r_][1], M[r_][2] = t[r_], Y[r_], Z[r_]
        return M
    def put(phi, radial, tang, yf, size, m):
        r_hat = Vector((math.cos(phi), 0, math.sin(phi)))
        t_hat = Vector((-math.sin(phi), 0, math.cos(phi)))
        M = ffr(phi)
        M.translation = r_hat * radial + t_hat * tang + Vector((0, yf - size[1] / 2, 0))
        mb.box(size, (0, 0, 0), m, M)
    for d in range(1, 5):
        yf = DECKS[d + 1] - 0.15
        yc = DECKS[d] + 0.15
        for k in range(8):
            phi = math.radians(22.5 + 45 * k)
            if k in WASH:
                put(phi, 4.3, -0.6, yf, (0.9, 2.2, 0.9), "Int_Wall")      # shower
                put(phi, 3.2, 0.6, yf, (0.5, 0.45, 0.6), "Int_Wall")      # wc
                put(phi, 4.6, 0.8, yf, (0.9, 0.85, 0.5), "Int_Furniture")  # basin unit
            else:
                put(phi, 4.65, 0.0, yf, (2.0, 0.55, 0.95), "Int_Furniture")   # bed
                put(phi, 3.25, 0.6, yf, (1.1, 0.75, 0.55), "Int_Furniture")   # desk
                put(phi, 3.0, -0.85, yf, (0.6, 2.0, 0.6), "Int_Wall")         # locker
            put(phi, 3.9, 0.0, yc + 0.06, (0.8, 0.04, 0.4), "Int_Light")      # ceiling light (on ceiling side)
    # commons deck: 4 tables + benches, galley counter
    yf, yc = DECKS[1] - 0.15, DECKS[0] + 0.15
    for k in range(4):
        phi = math.radians(45 + 90 * k)
        put(phi, 3.9, 0.0, yf, (1.6, 0.75, 0.9), "Int_Furniture")
        put(phi, 4.85, 0.0, yf, (1.6, 0.45, 0.45), "Int_Wall")
        put(phi, 2.95, 0.0, yf, (1.6, 0.45, 0.45), "Int_Wall")
    put(math.radians(90), 5.2, 0.0, yf, (3.4, 1.0, 0.7), "Int_Wall")        # galley counter
    for k in range(8):
        put(math.radians(22.5 + 45 * k), 3.6, 0.0, yc + 0.06, (1.2, 0.04, 0.4), "Int_Light")
    mb.to_object("STT_PAX_Int_Furniture", c_int, root, weighted=False)
    return {"tris": C.collection_tris(c), "tris_int": C.collection_tris(c_int)}
