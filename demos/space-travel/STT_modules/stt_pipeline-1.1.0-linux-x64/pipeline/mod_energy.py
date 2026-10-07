"""Module 04 - ENERGIE. Local Y: 0 -> 11. Core rect 9 x 9, two deployable solar wings
(port +X / starboard -X, 4 accordion panels 6 x 8 m each, on a sun-tracking gimbal rotating about X)
and two deployable radiators (top / bottom, 3 panels 5 x 7 m, edge-on to the sun).
Each panel is its own object, origin at its hinge, chained by parenting.
Animation: NLA track 'PWR_Deploy' (frame 1 = stowed, frame 100 = deployed)."""
import bpy, math
from mathutils import Vector, Matrix
from . import stt_core as C, stt_kit as K
from .stt_core import T

KEY = "PWR"
CS = 1
W = H = 9.0
RC = 2.0
YC = 5.5                 # wing / radiator station
F0, F1 = 1, 100          # deploy frames
TRACK = "PWR_Deploy"

def solar_panel(sign, L=6.0, Wd=8.0, t=0.08, zc=0.0):
    """Panel along sign*X from its hinge (x=0)."""
    mb = C.MB()
    x0, x1 = 0.1, L - 0.1
    xm = sign * (x0 + x1) / 2
    mb.box((x1 - x0, Wd, t), (xm, 0, zc), "Solar_Frame")
    for side in (1, -1):
        for k in range(2):
            mb.box(((x1 - x0) - 0.3, (Wd - 0.5) / 2 - 0.1, 0.02), (xm, (k - 0.5) * (Wd / 2), zc + side * (t / 2 + 0.01)),
                   "Solar_Cell" if side > 0 else "Solar_Frame")
    mb.box((L, 0.22, 0.1), (sign * L / 2, 0, zc - t / 2 - 0.05), "Metal_Dark")
    for y in (-Wd / 2 + 0.6, Wd / 2 - 0.6):
        mb.cyl(0.07, 0.5, 8, "Metal_Bare", T(0, y - 0.25, zc))
    return mb

def radiator_panel(sign, L=5.0, Wd=7.0, t=0.12, xc=0.0):
    """Panel along sign*Z from its hinge (z=0), thin along X."""
    mb = C.MB()
    zm = sign * L / 2
    mb.box((t, Wd, L - 0.2), (xc, 0, zm), "Radiator")
    for y in (-Wd / 2 + 0.1, Wd / 2 - 0.1):
        mb.box((t + 0.04, 0.16, L - 0.2), (xc, y, zm), "Metal_Dark")
    for k in range(6):
        y = -Wd / 2 + 0.6 + k * (Wd - 1.2) / 5
        mb.pipe([Vector((xc + t / 2 + 0.03, y, sign * 0.2)), Vector((xc + t / 2 + 0.03, y, sign * (L - 0.2)))], 0.03, 5, "Metal_Copper", caps=False)
    for y in (-Wd / 2 + 0.6, Wd / 2 - 0.6):
        mb.cyl(0.07, 0.5, 8, "Metal_Bare", T(xc, y - 0.25, 0))
    return mb

def _fold_sign(ext, thick, s):
    v = Vector((ext.z, 0, -ext.x))          # d/dtheta of R_y(theta) @ ext at theta=0
    return 1.0 if v.dot(thick * s) > 0 else -1.0

def _key(ob, stowed_y):
    ob.rotation_mode = "XYZ"
    ob.rotation_euler = (0, stowed_y, 0)
    ob.keyframe_insert("rotation_euler", index=1, frame=F0)
    ob.rotation_euler = (0, 0, 0)
    ob.keyframe_insert("rotation_euler", index=1, frame=F1)
    ad = ob.animation_data
    act = ad.action
    act.name = f"{TRACK}_{ob.name}"
    tr = ad.nla_tracks.new()
    tr.name = TRACK
    st = tr.strips.new(TRACK, F0, act)
    try:
        if hasattr(st, "action_slot") and act.slots:
            st.action_slot = act.slots[0]
    except Exception:
        pass
    ad.action = None

def chain(prefix, coll, parent, hinge_loc, ext, thick, n, builder, L, root_stowed, gap=0.06):
    """Accordion chain of n panels. ext: panel length direction, thick: thickness direction."""
    objs = []
    par = parent
    loc = Vector(hinge_loc)
    zc = 0.0
    for k in range(n):
        s_prev = 1 if k % 2 else -1
        if k == 0:
            off = 0.0
        else:
            off = -s_prev * gap
        mb = builder(off)
        ob = mb.to_object(f"{prefix}_{k + 1}", coll, par, loc)
        if k == 0:
            stowed = root_stowed
        else:
            stowed = math.pi * _fold_sign(ext, thick, s_prev) * 0.995
        _key(ob, stowed)
        ob["stt_deploy_panel"] = k + 1
        objs.append(ob)
        s_next = 1 if (k + 1) % 2 else -1
        loc = ext * L + thick * (off + s_next * gap)
        par = ob
    return objs

def build():
    root, c, info = C.module_root(KEY, {"stt_mass_t": 70.0, "stt_capacity": "solar 2 x 192 m2, radiators 2 x 105 m2",
                                        "stt_anim_deploy": TRACK, "stt_sun_tracking_axis": "X"})
    L = info["length"]
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = F0, F1
    for o in list(c.all_objects):
        if o.animation_data:
            o.animation_data_clear()
    # ------------------------------------------------ core
    mb = C.MB()
    K.collar(mb, "fwd", seg=24)
    C.rect_to_round_plate(mb, W, H, RC, CS, 2.8, C.COLLAR_HALF, -1, "Hull_Grey")
    K.rect_hull(mb, W, H, RC, CS, C.COLLAR_HALF, L - C.COLLAR_HALF, grooves=(3.2, 7.8), livery=((8.6, 9.5),))
    C.rect_to_round_plate(mb, W, H, RC, CS, 2.8, L - C.COLLAR_HALF, +1, "Hull_Grey")
    K.collar(mb, "aft", L, seg=24)
    mb.to_object("STT_PWR_Hull", c, root, bevel=0.04)

    mb = C.MB()
    for sx in (1, -1):        # solar gimbal drums (SARJ)
        mb.revolve([(0.0, 0.0), (1.1, 0.0), (1.1, 0.25), (0.85, 0.3), (0.85, 1.0), (1.0, 1.05), (1.0, 1.2), (0.0, 1.2)], 16,
                   ["Hull_Grey", "Hull_Grey", "Metal_Dark", "Metal_Bare", "Metal_Dark", "Hull_Grey", "Hull_Grey"],
                   C.look_mtx(Vector((sx * W / 2, YC, 0)), (sx, 0, 0)))
    for sz in (1, -1):        # radiator hinge blocks
        mb.box((1.2, 7.4, 0.5), (0, YC, sz * (H / 2 + 0.25)), "Hull_Grey")
    for side in ("top", "bottom"):
        for u in (-2.0, 2.0):
            Fp = C.side_frame(side, W, H, 2.0, u)
            mb.box((1.4, 1.2, 0.5), (0, 0, 0.25), "Hull_Light", Fp, taper=0.9)   # battery / PMAD boxes
    for side in ("left", "right"):
        Fp = C.side_frame(side, W, H, 0.0, 0.0)
        K.conduits(mb, [Fp @ Vector((0, 1.0, 0.18)), Fp @ Vector((0, YC - 1.4, 0.18))], Fp.to_3x3() @ Vector((1, 0, 0)), n=2,
                   r=0.08, spacing=0.3, clamps_every=1.5)
    mb.to_object("STT_PWR_Details", c, root)

    # ------------------------------------------------ deployables
    rcol = c
    wings = {}
    for tag, sx in (("P", 1), ("S", -1)):
        g = C.empty(f"STT_PWR_SolarGimbal_{tag}", c, root, (sx * (W / 2 + 1.2), YC, 0), None, "CIRCLE", 1.2,
                    {"stt_sun_tracking": True, "stt_rotation_axis": "X"})
        g.rotation_mode = "XYZ"
        yoke = C.MB()
        yoke.box((0.6, 1.6, 0.6), (sx * 0.3, 0, 0), "Metal_Dark")
        yoke.box((0.3, 8.2, 0.3), (sx * 0.55, 0, 0), "Metal_Dark")
        yoke.to_object(f"STT_PWR_SolarYoke_{tag}", c, g)
        ext = Vector((sx, 0, 0)); thick = Vector((0, 0, 1))
        root_stowed = -math.pi / 2 if sx > 0 else math.pi / 2
        wings[tag] = chain(f"STT_PWR_SolarWing_{tag}", rcol, g, (sx * 0.7, 0, 0), ext, thick, 4,
                           lambda off, sx=sx: solar_panel(sx, zc=off), 6.0, root_stowed)
    for tag, sz in (("T", 1), ("B", -1)):
        ext = Vector((0, 0, sz)); thick = Vector((1, 0, 0))
        root_stowed = -math.pi / 2
        chain(f"STT_PWR_Radiator_{tag}", rcol, root, (0, YC, sz * (H / 2 + 0.5)), ext, thick, 3,
              lambda off, sz=sz: radiator_panel(sz, xc=off), 5.0, root_stowed, gap=0.09)
    sc.frame_set(F1)
    return {"tris": C.collection_tris(c)}
