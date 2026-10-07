"""SHUTTLE (library asset, ~14 m utility shuttle). Forward = -Y, up = +Z.
Origin = landing point (bottom centre of the skids) -> mate SOCKET_SHUTTLE_PAD (dir -Z) with
SOCKET_BAY_SHUTTLE (dir +Z). Company livery + decals are overridden like the ships."""
import bpy, math
from mathutils import Vector, Matrix
from . import stt_core as C, stt_kit as K
from .stt_core import T

KEY = "SHUTTLE"
CS = 1
ZC = 2.3           # body axis height above the skids
BW, BH, BR = 4.2, 2.8, 0.7

def build():
    root, c, info = C.module_root(KEY, {"stt_mass_t": 38.0, "stt_capacity": "2 crew + 8 passengers or 6 t cargo",
                                        "stt_forward_axis": "-Y blender / +Z glTF"})
    for o in list(c.objects):
        if o.name.startswith(f"SOCKET_{KEY}_"):
            bpy.data.objects.remove(o, do_unlink=True)
    A = T(0, 0, ZC)
    secs = [((1.6, 1.2, 0.4), -7.0), ((3.0, 2.0, 0.6), -6.2), ((3.8, 2.6, 0.7), -5.2), ((BW, BH, BR), -4.2),
            ((BW, BH, BR), -1.2), ((BW, BH, BR), -0.4), ((BW, BH, BR), 4.0), ((3.6, 2.4, 0.7), 5.6), ((3.6, 2.4, 0.7), 6.0)]
    loops = [(C.rect_loop(w, h, r, CS), y) for (w, h, r), y in secs]
    def mats(i, j):
        if i == 1 and j in (0, 1, 2):
            return "Bridge_Glass"
        return {0: "Hull_Grey", 4: "Livery", 6: "Hull_Grey", 7: "Hull_Dark"}.get(i, "Hull_White")
    mb = C.MB()
    rings = C.loft(mb, loops, mats, A)
    mb.face(rings[0], "Hull_Dark")
    mb.face(list(reversed(rings[-1])), "Hull_Dark")
    # side sponsons
    for sx in (-1, 1):
        mb.box((0.9, 6.4, 1.0), (sx * (BW / 2 + 0.35), 0.6, ZC - 0.9), "Hull_Grey", taper=0.92)
        mb.box((0.7, 1.2, 0.8), (sx * (BW / 2 + 0.35), 4.3, ZC - 0.9), "Hull_Dark")
    mb.to_object("STT_SHUTTLE_Hull", c, root, bevel=0.025)

    mb = C.MB()
    # main engines
    for sx in (-1, 1):
        M = C.look_mtx(Vector((sx * 0.95, 6.0, ZC)), (0, 1, 0))
        mb.revolve([(0.42, -0.05), (0.42, 0.1), (0.36, 0.2), (0.62, 1.05), (0.56, 1.05), (0.3, 0.3), (0.0, 0.25)], 16,
                   ["Metal_Dark", "Metal_Dark", "Metal_Dark", "Metal_Bare", "Nozzle_Inner", "Nozzle_Inner"], M)
    # skids + struts
    for sx in (-1, 1):
        x = sx * 1.9
        mb.box((0.26, 9.4, 0.18), (x, 0.0, 0.09), "Metal_Dark")
        for y in (-4.6, 4.6):
            mb.box((0.5, 0.6, 0.12), (x, y, 0.06), "Rubber")
        for y in (-3.6, 0.0, 3.6):
            mb.pipe([Vector((x, y, 0.18)), Vector((x * 0.82, y, ZC - BH / 2 + 0.05))], 0.08, 8, "Metal_Bare")
            mb.pipe([Vector((x, y, 0.18)), Vector((x * 0.6, y + 0.6, ZC - BH / 2 + 0.05))], 0.05, 6, "Metal_Dark")
    rcs = {}
    for q, tag in enumerate(("TR", "TL", "BL", "BR")):
        for y, yt in ((-3.6, "F"), (3.4, "A")):
            rcs[f"{tag}{yt}"] = K.rcs_cluster(mb, A @ C.corner_frame(q, BW, BH, BR, CS, y), 0.55)
    # windows, hatch, dorsal docking port, nav lights
    for side in ("left", "right"):
        for y in (-3.0, -1.9, 1.4, 2.5):
            if side == "left" and y in (-1.9,):
                continue
            K.window(mb, A @ C.side_frame(side, BW, BH, y, 0.25), 0.5, 0.42)
    K.eva_hatch(mb, A @ C.side_frame("left", BW, BH, -0.6, 0.0), 1.1, 1.6)
    Ftop = A @ C.side_frame("top", BW, BH, 1.6, 0.0)
    mb.revolve([(0.0, 0.18), (0.6, 0.18), (0.6, 0.0)], 16, ["Hull_Grey", "Metal_Dark"], Ftop @ Matrix.Rotation(-math.pi / 2, 4, "X"))
    mb.revolve([(0.62, 0.0), (0.82, 0.0), (0.82, 0.22), (0.62, 0.22)], 16, ["Hazard_Yellow", "Hazard_Black", "Hazard_Yellow"],
               Ftop @ Matrix.Rotation(-math.pi / 2, 4, "X"))
    navs = {"PORT": K.nav_light(mb, Vector((BW / 2 + 0.8, -1.0, ZC - 0.9)), (1, 0, 0), "Nav_Red"),
            "STBD": K.nav_light(mb, Vector((-BW / 2 - 0.8, -1.0, ZC - 0.9)), (-1, 0, 0), "Nav_Green"),
            "STROBE": K.nav_light(mb, Vector((0, 5.3, ZC + 1.2)), (0, 0, 1), "Nav_White")}
    K.floodlight(mb, A @ C.side_frame("bottom", BW, BH, -5.0, 0.0), aim=(0, -1, 0.6))
    mb.to_object("STT_SHUTTLE_Details", c, root)
    for tag, nl in rcs.items():
        for t, pnt, d in nl:
            C.empty(f"RCS_SHUTTLE_{tag}_{t}", c, root, pnt, d, "SINGLE_ARROW", 0.4, {"stt_rcs": True})
    for tag, pnt in navs.items():
        C.empty(f"NAVLIGHT_SHUTTLE_{tag}", c, root, pnt, None, "SPHERE", 0.2, {"stt_navlight": tag.lower()})
    for sx, t in ((-1, "L"), (1, "R")):
        C.empty(f"VFX_SHUTTLE_MAIN_{t}", c, root, (sx * 0.95, 7.05, ZC), (0, 1, 0), "SINGLE_ARROW", 1.0, {"stt_vfx": "main_exhaust"})
    C.socket("SOCKET_SHUTTLE_PAD", c, root, (0, 0, 0), (0, 0, -1), "landing_pad", 1.5)
    C.socket("SOCKET_SHUTTLE_DORSAL", c, root, Ftop.translation + Vector((0, 0, 0.22)), (0, 0, 1), "mini_dock", 1.0)
    return {"tris": C.collection_tris(c)}
