"""Module 07 - BAIE (shuttle bay), in-line, lateral opening on +X.
Local Y: 0 -> 21. Section 13 (X) x 9 (Z), chamfered. Cavity 11.5 x 17 x 5.8 m open on +X,
landing deck = floor (-Z). Two door variants (game picks one):
  * mechanical clamshell (older): 2 leaves hinged on the opening edges, NLA 'BAY_DoorMech_Open'
  * energy field (newer): emitter rails + translucent field plane (toggle visibility).
Sockets: FWD / AFT (standard) + SOCKET_BAY_SHUTTLE (landing pad, +Z up, approach from +X)."""
import bpy, math
from mathutils import Vector, Matrix
from . import stt_core as C, stt_kit as K
from .stt_core import T

KEY = "BAY"
CS = 1
W, H, RC = 13.0, 9.0, 1.6
XO = W / 2                 # outer face (opening plane)
XB = -5.0                  # back wall of the cavity
ZF, ZC = -(H / 2 - RC), (H / 2 - RC)   # floor / ceiling (= flat side limits) -2.9 / 2.9
Y0, Y1 = 2.0, 19.0         # opening / cavity along the axis
PAD = Vector((0.6, 10.5, ZF))
TRACK = "BAY_DoorMech_Open"

def quad(mb, p0, p1, p2, p3, m):
    mb.face([mb.v(Vector(p)) for p in (p0, p1, p2, p3)], m)

def build():
    root, c, info = C.module_root(KEY, {"stt_mass_t": 150.0, "stt_capacity": "1 shuttle (14 x 8 x 4.5 m), lateral access +X",
                                        "stt_door_variants": "mech,field", "stt_anim_door": TRACK})
    L = info["length"]
    c_mech = C.coll(C.SHIP_ROOT_COLL + "/07_Baie/07_Baie_PorteMeca")
    c_field = C.coll(C.SHIP_ROOT_COLL + "/07_Baie/07_Baie_PorteChamp")
    C.clear_collection(c_mech); C.clear_collection(c_field)

    # ------------------------------------------------ shell with lateral opening
    mb = C.MB()
    K.collar(mb, "fwd", seg=24); K.collar(mb, "aft", L, seg=24)
    C.rect_to_round_plate(mb, W, H, RC, CS, 2.8, C.COLLAR_HALF, -1, "Hull_Grey")
    C.rect_to_round_plate(mb, W, H, RC, CS, 2.8, L - C.COLLAR_HALF, +1, "Hull_Grey")
    loop = C.rect_loop(W, H, RC, CS)
    ys = [C.COLLAR_HALF, Y0, Y1, L - C.COLLAR_HALF]
    rings = [[mb.v(Vector((x, y, z))) for x, z in loop] for y in ys]
    n = len(loop)
    for i in range(len(ys) - 1):
        for j in range(n):
            if i == 1 and j == n - 1:          # right (+X) flat side inside the door zone -> opening
                continue
            jn = (j + 1) % n
            m = "Livery" if i != 1 else "Hull_White"
            mb.face([rings[i][j], rings[i + 1][j], rings[i + 1][jn], rings[i][jn]], m)
    # cavity (inward facing)
    quad(mb, (XB, Y0, ZF), (XO, Y0, ZF), (XO, Y1, ZF), (XB, Y1, ZF), "Hull_Grey")      # floor (+Z)
    quad(mb, (XB, Y0, ZC), (XB, Y1, ZC), (XO, Y1, ZC), (XO, Y0, ZC), "Hull_Dark")      # ceiling (-Z)
    quad(mb, (XB, Y0, ZF), (XB, Y1, ZF), (XB, Y1, ZC), (XB, Y0, ZC), "Hull_Light")     # back wall (+X)
    quad(mb, (XB, Y0, ZF), (XB, Y0, ZC), (XO, Y0, ZC), (XO, Y0, ZF), "Hull_Light")     # fwd end wall (+Y)
    quad(mb, (XB, Y1, ZF), (XO, Y1, ZF), (XO, Y1, ZC), (XB, Y1, ZC), "Hull_Light")     # aft end wall (-Y)
    mb.to_object("STT_BAY_Shell", c, root, bevel=0.03)

    # ------------------------------------------------ interior equipment
    mb = C.MB()
    for x in (XB + 0.5, XO - 0.35):                                   # amber edge guide strips
        mb.box((0.14, Y1 - Y0 - 0.6, 0.03), (x, (Y0 + Y1) / 2, ZF + 0.015), "Guide_Amber")
    mb.box((0.14, Y1 - Y0 - 0.6, 0.03), (XO - 0.15, (Y0 + Y1) / 2, ZC - 0.015), "Guide_Green")
    for sx in (-1, 1):                                                # landing brackets + clamps
        for sy in (-1, 1):
            p = PAD + Vector((sx * 1.9, sy * 4.6, 0))
            mb.box((0.6, 1.1, 0.32), (p.x, p.y, ZF + 0.16), "Hazard_Black")
            mb.box((0.62, 0.3, 0.06), (p.x, p.y, ZF + 0.35), "Hazard_Yellow")
            mb.box((1.8, 0.16, 0.03), (PAD.x + sx * 3.6, PAD.y + sy * 6.6, ZF + 0.015), "Hazard_Yellow")
            mb.box((0.16, 1.8, 0.03), (PAD.x + sx * 4.4, PAD.y + sy * 5.8, ZF + 0.015), "Hazard_Yellow")
    for y in (4.0, 10.5, 17.0):                                      # ceiling flood lights
        for x in (-2.0, 3.0):
            F = Matrix.Translation((x, y, ZC)) @ Matrix.Rotation(math.pi, 4, "X")
            K.floodlight(mb, F, aim=(0, 0, 1))
    for y in (3.0, 18.0):                                            # ceiling light strips
        mb.box((XO - XB - 1.0, 0.25, 0.04), ((XB + XO) / 2, y, ZC - 0.02), "Int_Light")
    # back wall: control booth window + inner airlock door + conduits
    mb.box((0.5, 6.4, 1.6), (XB + 0.25, 10.5, 1.5), "Hull_Dark")
    mb.box((0.06, 6.0, 1.2), (XB + 0.53, 10.5, 1.5), "Bridge_Glass")
    mb.box((0.12, 2.8, 2.9), (XB + 0.06, 15.4, ZF + 1.45), "Hazard_Yellow")
    mb.box((0.16, 2.3, 2.5), (XB + 0.08, 15.4, ZF + 1.3), "Hull_Grey")
    K.conduits(mb, [Vector((XB + 0.25, Y0 + 0.4, 2.2)), Vector((XB + 0.25, Y1 - 0.4, 2.2))], (0, 0, 1), n=3, r=0.09,
               spacing=0.25, clamps_every=2.0)
    # refuelling arm (folded) near the fwd end
    K.beam(mb, Vector((XB + 0.3, 4.0, 0.6)), Vector((XB + 2.2, 4.0, 1.8)), 0.25, 0.25, "Hazard_Yellow")
    K.beam(mb, Vector((XB + 2.2, 4.0, 1.8)), Vector((XB + 3.6, 4.0, 0.4)), 0.2, 0.2, "Metal_Dark")
    mb.pipe([Vector((XB + 0.3, 4.3, 0.6)), Vector((XB + 2.2, 4.3, 1.8)), Vector((XB + 3.6, 4.3, 0.4))], 0.06, 6, "Rubber",
            fillet_r=0.4)
    mb.to_object("STT_BAY_Interior", c, root)

    # ------------------------------------------------ exterior details
    mb = C.MB()
    for side in ("top", "bottom"):
        Fh = C.side_frame(side, W, H, 0.0, -3.0)
        K.handrail(mb, [Fh @ Vector((0, 1.2, 0)), Fh @ Vector((0, L - 1.2, 0))], Fh.to_3x3() @ Vector((0, 0, 1)))
        for y in (Y0 + 1.0, Y1 - 1.0):
            K.floodlight(mb, C.side_frame(side, W, H, y, 4.4 if side == "top" else -4.4), aim=(0.6, 0, 0.5))
    navs = {}
    for (y, col, tag) in ((Y0 - 0.5, "Nav_Red", "FWD"), (Y1 + 0.5, "Nav_Green", "AFT")):
        for z, zt in ((ZC - 0.3, "T"), (ZF + 0.3, "B")):
            navs[f"DOOR_{tag}_{zt}"] = K.nav_light(mb, Vector((XO, y, z)), (1, 0, 0), col)
    navs["STROBE"] = K.nav_light(mb, Vector((0, L / 2, H / 2)), (0, 0, 1), "Nav_White")
    mb.to_object("STT_BAY_Details", c, root)
    for tag, pnt in navs.items():
        C.empty(f"NAVLIGHT_BAY_{tag}", c, root, pnt, None, "SPHERE", 0.3, {"stt_navlight": tag.lower()})
    C.socket("SOCKET_BAY_SHUTTLE", c, root, PAD, (0, 0, 1), "shuttle_pad", 3.0)
    bpy.data.objects["SOCKET_BAY_SHUTTLE"]["stt_approach_axis"] = "+X (module local)"

    # ------------------------------------------------ door A: mechanical clamshell
    span = Y1 - Y0
    yc = (Y0 + Y1) / 2
    leaves = []
    for tag, zh, sgn, open_ang in (("Upper", ZC + 0.05, -1, -math.pi / 2), ("Lower", ZF - 0.05, 1, math.pi / 2)):
        mb = C.MB()
        h = ZC - 0.0 + 0.05
        zc = sgn * h / 2
        mb.box((0.3, span - 0.1, h), (0.15, 0, zc), "Hull_Light")
        for k in range(8):
            mb.box((0.12, 0.2, h - 0.2), (0.36, -span / 2 + 1.1 + k * (span - 2.2) / 7, zc), "Hull_Grey")
        for zz in (0.3, 0.62):
            mb.box((0.1, span - 0.6, 0.18), (0.35, 0, sgn * h * zz), "Hull_Grey")
        mb.box((0.32, span - 0.1, 0.16), (0.15, 0, sgn * (h - 0.08)), "Hazard_Yellow")
        for k in range(6):
            yk = -span / 2 + 1.0 + k * (span - 2.0) / 5
            mb.cyl(0.16, 0.8, 10, "Metal_Dark", C.look_mtx(Vector((0.0, yk - 0.4, 0.0)), (0, 1, 0)))
        ob = mb.to_object(f"STT_BAY_DoorMech_{tag}", c_mech, root, (XO, yc, zh))
        ob.rotation_mode = "XYZ"
        ob.rotation_euler = (0, 0, 0); ob.keyframe_insert("rotation_euler", index=1, frame=1)
        ob.rotation_euler = (0, open_ang, 0); ob.keyframe_insert("rotation_euler", index=1, frame=60)
        ad = ob.animation_data; act = ad.action; act.name = f"{TRACK}_{tag}"
        tr = ad.nla_tracks.new(); tr.name = TRACK
        st = tr.strips.new(TRACK, 1, act)
        try:
            if hasattr(st, "action_slot") and act.slots:
                st.action_slot = act.slots[0]
        except Exception:
            pass
        ad.action = None
        ob["stt_door"] = "mech"
        leaves.append(ob)

    # ------------------------------------------------ door B: energy field
    mb = C.MB()
    for z, sg in ((ZC, 1), (ZF, -1)):
        mb.box((0.45, span + 0.3, 0.3), (XO + 0.1, yc, z + sg * 0.05), "Hull_Dark")
        mb.box((0.12, span, 0.06), (XO + 0.1, yc, z - sg * 0.13), "Force_Emitter")
    for y in (Y0 - 0.05, Y1 + 0.05):
        mb.box((0.45, 0.3, ZC - ZF + 0.4), (XO + 0.1, y, 0), "Hull_Dark")
        for z in (ZC - 0.2, ZF + 0.2):
            mb.box((0.6, 0.6, 0.6), (XO + 0.2, y, z), "Metal_Dark")
            mb.box((0.62, 0.3, 0.3), (XO + 0.2, y, z), "Force_Emitter")
    em = mb.to_object("STT_BAY_DoorField_Emitters", c_field, root)
    em["stt_door"] = "field"
    mb = C.MB()
    quad(mb, (XO - 0.05, Y0, ZF), (XO - 0.05, Y1, ZF), (XO - 0.05, Y1, ZC), (XO - 0.05, Y0, ZC), "Force_Field")
    fp = mb.to_object("STT_BAY_DoorField_Plane", c_field, root, weighted=False)
    fp["stt_door"] = "field"; fp["stt_vfx"] = "force_field"
    return {"tris": C.collection_tris(c)}
