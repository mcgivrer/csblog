"""Module 02b - CARGO ETOILE (variant of CARGO). Local Y: 0 -> 6.5.
Six STT-36 containers mounted radially by their end face on a hexagonal hub (star layout).
Short module; diameter driven by the container length (~32.7 m). Doors + grapple fixture face
outward so a small shuttle or handling drone can grab and pull each container radially."""
import bpy, math
from mathutils import Vector, Matrix
from . import stt_core as C, stt_kit as K, mod_cargo as MC
from .stt_core import T, surf_frame

KEY = "CRG6"
RH = 4.4                         # hex circumradius (side 4.4 m)
AP = RH * math.cos(math.pi / 6)  # apothem
GAP = 0.35
Y0, Y1 = C.COLLAR_HALF, 6.5 - C.COLLAR_HALF
YC = (Y0 + Y1) / 2
COLORS = ["Container_Red", "Container_Blue", "Container_Orange", "Container_Green", "Container_Grey", "Container_Teal"]

def hexloop(r):
    return [(r * math.cos(k * math.pi / 3), r * math.sin(k * math.pi / 3)) for k in range(6)]

def build():
    root, c, info = C.module_root(KEY, {"stt_mass_t": 60.0,
                                        "stt_capacity": "6 x STT-36 containers, radial star (drone / shuttle handling)",
                                        "stt_container_max_t": 30.0})
    L = info["length"]
    cc = C.coll(C.SHIP_ROOT_COLL + "/02b_Cargo_Etoile/02b_Cargo_Etoile_Containers")
    C.clear_collection(cc)
    l, w = MC.ISO[1], MC.ISO[0]
    RC = AP + GAP + l / 2

    # ------------------------------------------------ hub
    mb = C.MB()
    K.collar(mb, "fwd", seg=24)
    secs = [(hexloop(RH * 0.86), Y0), (hexloop(RH), Y0 + 0.45), (hexloop(RH), Y1 - 0.45), (hexloop(RH * 0.86), Y1)]
    C.loft(mb, secs, ["Livery", "Hull_White", "Livery"])
    C.loop_to_round_plate(mb, secs[0][0], 2.8, Y0, -1, "Hull_Grey")
    C.loop_to_round_plate(mb, secs[-1][0], 2.8, Y1, +1, "Hull_Grey")
    K.collar(mb, "aft", L, seg=24)
    mb.to_object("STT_CRG6_Hub", c, root, bevel=0.04)

    # ------------------------------------------------ clamps, connectors, lights
    mb = C.MB()
    for k in range(6):
        th = math.pi / 6 + k * math.pi / 3
        F = surf_frame(th, AP, YC)
        hw = w / 2 + 0.25
        for sx in (-1, 1):
            mb.box((0.3, 2 * hw + 0.3, 0.35), (sx * hw, 0, 0.175), "Hull_Grey", F)
            mb.box((2 * hw - 0.3, 0.3, 0.35), (0, sx * hw, 0.175), "Hull_Grey", F)
        mb.box((1.0, 1.0, GAP - 0.02), (0, 0, (GAP - 0.02) / 2), "Metal_Dark", F)       # umbilical plate
        for sx in (-1, 1):
            for sy in (-1, 1):
                p0 = F @ Vector((sx * hw, sy * hw, 0.3))
                p1 = F @ Vector((sx * (w / 2 + 0.12), sy * (w / 2 + 0.12), GAP + 1.6))
                mid = p0.lerp(p1, 0.55)
                K.beam(mb, p0, mid, 0.26, 0.26, "Metal_Dark")
                K.beam(mb, mid, p1, 0.18, 0.18, "Hazard_Yellow")
                mb.box((0.32, 0.32, 0.5), (sx * (w / 2 + 0.1), sy * (w / 2 + 0.1), GAP + 1.6), "Hazard_Black", F)
    for k in range(6):                 # flood lights on the hub edges, aimed outward between containers
        a = k * math.pi / 3
        for y in (Y0 + 0.7, Y1 - 0.7):
            K.floodlight(mb, surf_frame(a, RH - 0.05, y), aim=(0, 0, 1))
    mb.to_object("STT_CRG6_Clamps", c, root)

    # ------------------------------------------------ containers + sockets
    for k in range(6):
        th = math.pi / 6 + k * math.pi / 3
        r_hat = Vector((math.cos(th), 0, math.sin(th)))
        t_hat = Vector((-math.sin(th), 0, math.cos(th)))
        Z = Vector((0, 1, 0))
        M = Matrix.Identity(4)
        for i in range(3):
            M[i][0], M[i][1], M[i][2] = t_hat[i], r_hat[i], Z[i]
        M.translation = r_hat * RC + Vector((0, YC, 0))
        n = k + 1
        C.empty(f"SOCKET_CRG6_CONTAINER_{n}", c, root, M.translation, r_hat, "SINGLE_ARROW", 2.0,
                {"stt_socket": "container", "stt_slot": str(n)})
        ob = MC.container_mesh(COLORS[k]).to_object(f"STT_CRG6_Container_{n}", cc, root, weighted=False)
        ob.matrix_basis = M
        ob["stt_container"] = True
        ob["stt_slot"] = str(n)
        ob["stt_container_type"] = "STT-36"
        ob["stt_mass_empty_t"] = 6.5
        ob["stt_release_axis"] = "+Y local (radial)"
    return {"tris": C.collection_tris(c), "diameter_m": round(2 * (AP + GAP + l), 2)}
