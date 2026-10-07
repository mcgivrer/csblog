"""Station connectors: NODE6 (6 ports, 3 axes), NODE4 (planar +), ELBOW (90 deg), TUNNEL (spacer).
All ports are standard STT-6 half collars + sockets SOCKET_<KEY>_<PORT> (standard frames, see
stt_core.socket_quat). Ports: FWD (-Y), AFT (+Y), PORT (+X), STBD (-X), TOP (+Z), BOT (-Z)."""
import bpy, math
from mathutils import Vector, Matrix
from . import stt_core as C, stt_kit as K
from .stt_core import T

CS = 1
S, RC = 8.6, 1.2                 # node body (cube) size and chamfer
PORTS = {"FWD": (0, -1, 0), "AFT": (0, 1, 0), "PORT": (1, 0, 0), "STBD": (-1, 0, 0), "TOP": (0, 0, 1), "BOT": (0, 0, -1)}
NODE_PORTS = {"NODE6": ("FWD", "AFT", "PORT", "STBD", "TOP", "BOT"), "NODE4": ("FWD", "AFT", "PORT", "STBD"),
              "ELBOW": ("FWD", "PORT")}

def _root(key, ports, extra=None):
    root, c, info = C.module_root(key, dict({"stt_ports": ",".join(ports)}, **(extra or {})))
    # module_root made FWD/AFT sockets: drop AFT if unused, add side ports
    for o in list(c.objects):
        if o.name == f"SOCKET_{key}_AFT" and "AFT" not in ports:
            bpy.data.objects.remove(o, do_unlink=True)
    return root, c, info

def build_node(key):
    ports = NODE_PORTS[key]
    root, c, info = _root(key, ports, {"stt_mass_t": 45.0, "stt_capacity": f"{len(ports)}-port connection node"})
    L = info["length"]
    cen = Vector((0, L / 2, 0))
    half = S / 2
    mb = C.MB()
    C.rect_to_round_plate(mb, S, S, RC, CS, 2.8, C.COLLAR_HALF, -1, "Hull_Grey")
    K.rect_hull(mb, S, S, RC, CS, C.COLLAR_HALF, L - C.COLLAR_HALF, grooves=(L / 2 - 2.2, L / 2 + 2.2),
                livery=((L / 2 - 0.35, L / 2 + 0.35),))
    if "AFT" in ports:
        C.rect_to_round_plate(mb, S, S, RC, CS, 2.8, L - C.COLLAR_HALF, +1, "Hull_Grey")
    else:
        C.rect_to_round_plate(mb, S, S, RC, CS, 2.0, L - C.COLLAR_HALF, +1, "Hull_Grey")
        mb.revolve([(2.0, L - C.COLLAR_HALF), (2.0, L - C.COLLAR_HALF - 0.15), (0.0, L - C.COLLAR_HALF - 0.15)], 24,
                   ["Hull_Dark", "Bridge_Glass"])                         # observation dome window
    for p in ports:
        d = Vector(PORTS[p])
        if p == "FWD":
            K.collar(mb, "fwd", seg=24)
        elif p == "AFT":
            K.collar(mb, "aft", L, seg=24)
        else:
            K.collar(mb, M=K.port_matrix(cen, d, half + C.COLLAR_HALF), seg=24)
    mb.to_object(f"STT_{key}_Body", c, root, bevel=0.04)
    # sockets for side ports
    for p in ports:
        if p in ("FWD", "AFT"):
            continue
        d = Vector(PORTS[p])
        C.socket(f"SOCKET_{key}_{p}", c, root, cen + d * (half + C.COLLAR_HALF), d, p.lower())
    # details on the 4 chamfered edges: floods, beacons, small RCS, windows
    mb = C.MB()
    rcs = {}
    for q in range(4):
        F = C.corner_frame(q, S, S, RC, CS, L / 2)
        K.window(mb, F, 1.0, 0.6)
        K.floodlight(mb, C.corner_frame(q, S, S, RC, CS, 1.6), aim=(0, -1, 0.4))
        if key == "NODE6":
            rcs[q] = K.rcs_cluster(mb, C.corner_frame(q, S, S, RC, CS, L - 1.8), 0.9)
    navs = {"BEACON_A": K.nav_light(mb, C.corner_frame(0, S, S, RC, CS, L - 0.9).translation, C.corner_frame(0, S, S, RC, CS, 0).to_3x3() @ Vector((0, 0, 1)), "Nav_White"),
            "BEACON_B": K.nav_light(mb, C.corner_frame(2, S, S, RC, CS, L - 0.9).translation, C.corner_frame(2, S, S, RC, CS, 0).to_3x3() @ Vector((0, 0, 1)), "Nav_White")}
    # free faces get equipment: radiator fins / dish
    free = [p for p in ("TOP", "BOT", "PORT", "STBD") if p not in ports]
    for p in free:
        side = {"TOP": "top", "BOT": "bottom", "PORT": "right", "STBD": "left"}[p]
        F = C.side_frame(side, S, S, L / 2, 0.0)
        mb.box((4.6, 4.6, 0.12), (0, 0, 0.06), "Hull_Dark", F)
        for k in range(9):
            mb.box((0.06, 4.2, 0.7), (-2.0 + k * 0.5, 0, 0.47), "Radiator", F)
    if key == "NODE4":
        Fd = C.side_frame("top", S, S, L / 2 + 1.6, 1.6)
        K.dish(mb, C.look_mtx(Fd @ Vector((0, 0, 1.6)), (0.3, -0.4, 1.0)), 1.0)
    for side in ("top", "bottom"):
        Fh = C.side_frame(side, S, S, 0.0, -2.6)
        K.handrail(mb, [Fh @ Vector((0, 1.3, 0)), Fh @ Vector((0, L - 1.3, 0))], Fh.to_3x3() @ Vector((0, 0, 1)))
    mb.to_object(f"STT_{key}_Details", c, root)
    for q, nl in rcs.items():
        for t, pnt, d in nl:
            C.empty(f"RCS_{key}_{q}_{t}", c, root, pnt, d, "SINGLE_ARROW", 0.6, {"stt_rcs": True})
    for tag, pnt in navs.items():
        C.empty(f"NAVLIGHT_{key}_{tag}", c, root, pnt, None, "SPHERE", 0.3, {"stt_navlight": tag.lower()})
    return {"tris": C.collection_tris(c)}

def build_tunnel():
    key = "TUNNEL"
    root, c, info = _root(key, ("FWD", "AFT"), {"stt_mass_t": 12.0, "stt_capacity": "pressurised spacer tunnel"})
    L = info["length"]
    W, R = 6.8, 2.0
    mb = C.MB()
    K.collar(mb, "fwd", seg=24); K.collar(mb, "aft", L, seg=24)
    C.rect_to_round_plate(mb, W, W, R, CS, 2.8, C.COLLAR_HALF, -1, "Hull_Grey")
    C.rect_to_round_plate(mb, W, W, R, CS, 2.8, L - C.COLLAR_HALF, +1, "Hull_Grey")
    def mats(i, j):
        return "Window" if (i in (2,) and j in (3, 7)) else ("Hull_Dark" if i in (1, 3) else "Hull_White")
    y0, y1 = C.COLLAR_HALF, L - C.COLLAR_HALF
    C.rect_sweep(mb, W, W, R, CS, [(0, y0), (0, y0 + 0.5), (0, L / 2 - 1.5), (0, L / 2 + 1.5), (0, y1 - 0.5), (0, y1)],
                 lambda i, j: {0: "Livery", 4: "Livery"}.get(i, "Window" if (i == 2 and j in (3, 7)) else ("Hull_Dark" if i in (1, 3) else "Hull_White")))
    for (ya, yb) in ((y0 + 0.5, y0 + 0.9), (y1 - 0.9, y1 - 0.5)):
        C.rect_sweep(mb, W, W, R, CS, [(0.0, ya), (-0.12, ya + 0.05), (-0.12, yb - 0.05), (0.0, yb)], "Hull_Grey")
    mb.to_object("STT_TUNNEL_Body", c, root, bevel=0.03)
    mb = C.MB()
    for side in ("top", "bottom"):
        Fh = C.side_frame(side, W, W, 0.0, 0.0)
        K.handrail(mb, [Fh @ Vector((0, 1.1, 0)), Fh @ Vector((0, L - 1.1, 0))], Fh.to_3x3() @ Vector((0, 0, 1)))
    mb.to_object("STT_TUNNEL_Details", c, root)
    return {"tris": C.collection_tris(c)}

def build_all():
    out = {k: build_node(k) for k in ("NODE6", "NODE4", "ELBOW")}
    out["TUNNEL"] = build_tunnel()
    return out
