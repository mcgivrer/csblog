"""Module 02 - CARGO. Local Y: 0 -> 16. Two octagonal end frames, central spine (3.2 x 3.2),
4 diagonal longerons, hydraulic clamps and 4 detachable STT-36 space containers (3.6 x 3.6 x 12.2 m) in a cross
(A top, B port +X, C bottom, D starboard -X). Containers are separate objects with sockets."""
import bpy, math
from mathutils import Vector, Matrix
from . import stt_core as C, stt_kit as K
from .stt_core import T, surf_frame

KEY = "CARGO"
CS = 1
FW, FRC = 11.6, 3.0            # end frame octagon
SW, SRC = 3.6, 0.5             # spine
Y_F0, Y_F1 = C.COLLAR_HALF, 1.5          # front frame
Y_A0, Y_A1 = 14.5, 16.0 - C.COLLAR_HALF  # aft frame
ISO = (3.6, 12.192, 3.6)       # STT-36 space container W, L, H (40ft length)
GAP = 0.25
R_CONT = SW / 2 + GAP + ISO[2] / 2
SLOTS = [("A", math.pi / 2, "Container_Red"), ("B", 0.0, "Container_Blue"),
         ("C", -math.pi / 2, "Container_Orange"), ("D", math.pi, "Container_Green")]

def container_mesh(color):
    w, l, h = ISO
    mb = C.MB()
    mb.box((w - 0.04, l - 0.1, h - 0.04), (0, 0, 0), color)
    for sx in (-1, 1):
        for sz in (-1, 1):
            mb.box((0.12, l, 0.16), (sx * (w / 2 - 0.06), 0, sz * (h / 2 - 0.08)), color)       # rails
            for sy in (-1, 1):
                mb.box((0.16, 0.16, h), (sx * (w / 2 - 0.08), sy * (l / 2 - 0.08), 0), color)   # posts
                mb.box((0.2, 0.2, 0.2), (sx * (w / 2 - 0.1), sy * (l / 2 - 0.1), sz * (h / 2 - 0.1)), "Metal_Dark")
    n = int((l - 0.6) / 0.42)
    for sx in (-1, 1):
        for i in range(n):
            y = -l / 2 + 0.3 + (i + 0.5) * (l - 0.6) / n
            mb.box((0.05, 0.12, h - 0.36), (sx * (w / 2 - 0.005), y, 0), color)               # corrugation
    for i in range(int(l / 1.2)):
        y = -l / 2 + 0.6 + i * 1.2
        mb.box((w - 0.3, 0.1, 0.05), (0, y, h / 2 - 0.005), color)                           # roof ribs
    for sx in (-1, 1):                                                                         # doors (aft end)
        mb.box((w / 2 - 0.16, 0.04, h - 0.4), (sx * (w / 4 - 0.02), l / 2 - 0.03, 0), color)
        for k in (0.3, 0.8):
            x = sx * (w / 2 - 0.16) * k
            mb.pipe([Vector((x, l / 2 + 0.02, -h / 2 + 0.25)), Vector((x, l / 2 + 0.02, h / 2 - 0.25))], 0.025, 6, "Metal_Bare")
    # grapple fixture (door end) for drones / shuttles
    mb.box((0.7, 0.05, 0.7), (0, l / 2 + 0.03, 0), "Hazard_Yellow")
    mb.box((0.5, 0.06, 0.5), (0, l / 2 + 0.07, 0), "Hazard_Black")
    mb.cyl(0.07, 0.35, 8, "Metal_Bare", T(0, l / 2 + 0.08, 0))
    mb.cyl(0.13, 0.08, 8, "Metal_Bare", T(0, l / 2 + 0.43, 0))
    return mb

def build():
    root, c, info = C.module_root(KEY, {"stt_mass_t": 95.0, "stt_capacity": "4 x STT-36 containers (3.6 x 3.6 x 12.2 m)",
                                        "stt_container_max_t": 30.0})
    L = info["length"]
    c_cont = C.coll(C.SHIP_ROOT_COLL + "/02_Cargo/02_Cargo_Containers")
    C.clear_collection(c_cont)
    oct_loop = C.rect_loop(FW, FW, FRC, CS)
    sp_loop = C.rect_loop(SW, SW, SRC, CS)

    # ------------------------------------------------ frames + spine
    mb = C.MB()
    K.collar(mb, "fwd", seg=24)
    C.loop_to_round_plate(mb, oct_loop, 2.8, Y_F0, -1, "Hull_Grey")
    K.rect_hull(mb, FW, FW, FRC, CS, Y_F0, Y_F1, livery=((Y_F0, Y_F1),), livery_mat="Hull_Light")
    C.loop_to_loop_plate(mb, oct_loop, sp_loop, Y_F1, +1, "Hull_Grey")
    K.rect_hull(mb, SW, SW, SRC, CS, Y_F1, Y_A0, grooves=(4.0, 12.0), livery=((7.4, 8.6),))
    C.loop_to_loop_plate(mb, oct_loop, sp_loop, Y_A0, -1, "Hull_Grey")
    K.rect_hull(mb, FW, FW, FRC, CS, Y_A0, Y_A1, livery=((Y_A0, Y_A1),), livery_mat="Hull_Light")
    C.loop_to_round_plate(mb, oct_loop, 2.8, Y_A1, +1, "Hull_Grey")
    K.collar(mb, "aft", L, seg=24)
    mb.to_object("STT_CARGO_Frame", c, root, bevel=0.03)

    # ------------------------------------------------ longerons, clamps, lights
    mb = C.MB()
    dpos = []
    for q in range(4):
        a = (q + 0.5) * math.pi / 2
        p = Vector((math.cos(a), 0, math.sin(a))) * 4.5
        dpos.append(p)
        mb.box((0.45, Y_A0 - Y_F1, 0.45), (p.x, (Y_F1 + Y_A0) / 2, p.z), "Hull_Grey", rot=Matrix.Rotation(-a, 4, "Y"))
    for y in (3.2, 8.0, 12.8):
        for q, p in enumerate(dpos):
            for slot_a in ((q) * math.pi / 2, (q + 1) * math.pi / 2):
                # container edge nearest to this longeron
                rad = Vector((math.cos(slot_a), 0, math.sin(slot_a)))
                tan = Vector((-math.sin(slot_a), 0, math.cos(slot_a)))
                side = 1 if tan.dot(p) > 0 else -1
                edge = rad * (R_CONT + 0.6) + tan * side * (ISO[0] / 2 + 0.05)
                pp = Vector((p.x, y, p.z)); ee = Vector((edge.x, y, edge.z))
                mid = pp.lerp(ee, 0.6)
                K.beam(mb, pp, mid, 0.22, 0.3, "Metal_Dark")
                K.beam(mb, mid, ee, 0.16, 0.22, "Hazard_Yellow")
                mb.box((0.3, 0.5, 0.3), (0, 0, 0), "Hazard_Black", T(ee.x, y, ee.z))
        # spine to longeron struts
        for p in dpos:
            K.beam(mb, Vector((p.x, y, p.z)) * 1.0, Vector((p.x * 0.38, y, p.z * 0.38)), 0.25, 0.25, "Metal_Dark")
    for q, p in enumerate(dpos):
        a = (q + 0.5) * math.pi / 2
        K.floodlight(mb, surf_frame(a, 4.75, 2.0), aim=(0, 1, -0.6))
        K.floodlight(mb, surf_frame(a, 4.75, 14.0), aim=(0, -1, -0.6))
    # spine umbilicals to each container slot
    for name, a, col in SLOTS:
        F = surf_frame(a, SW / 2, 8.0)
        mb.box((0.6, 1.2, GAP), (0, 0, GAP / 2), "Metal_Dark", F)
        K.conduits(mb, [F @ Vector((0, -5.5, 0.12)), F @ Vector((0, 5.5, 0.12))], F.to_3x3() @ Vector((1, 0, 0)), n=2, r=0.07,
                   spacing=0.5, clamps_every=2.2)
    # handrails on the end frames
    for y in (Y_F0 + 0.35, Y_A1 - 0.35):
        Fh = C.side_frame("top", FW, FW, y, 0.0)
        K.handrail(mb, [Fh @ Vector((-2.2, 0, 0)), Fh @ Vector((2.2, 0, 0))], (0, 0, 1))
    mb.to_object("STT_CARGO_Structure", c, root)

    # ------------------------------------------------ containers (detachable) + sockets
    for name, a, col in SLOTS:
        F = surf_frame(a, R_CONT, 8.0)
        sock = C.empty(f"SOCKET_CONTAINER_{name}", c, root, F.translation, F.to_3x3() @ Vector((0, 0, 1)), "SINGLE_ARROW", 2.0,
                       {"stt_socket": "container", "stt_slot": name})
        mb = container_mesh(col)
        ob = mb.to_object(f"STT_CARGO_Container_{name}", c_cont, root, weighted=False)
        ob.matrix_basis = F
        ob["stt_container"] = True
        ob["stt_slot"] = name
        ob["stt_container_type"] = "STT-36"
        ob["stt_mass_empty_t"] = 6.5
    return {"tris": C.collection_tris(c), "tris_containers": C.collection_tris(c_cont)}
