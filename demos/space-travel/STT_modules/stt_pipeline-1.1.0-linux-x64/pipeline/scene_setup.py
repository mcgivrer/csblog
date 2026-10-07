"""Phase 0 - scene setup: units, collections, materials, lights, preview cameras, human reference."""
import bpy, math
from mathutils import Vector
from . import stt_core as C


def setup_scene():
    sc = bpy.context.scene
    sc.name = "STT_Freighter"
    us = sc.unit_settings
    us.system = "METRIC"; us.scale_length = 1.0; us.length_unit = "METERS"
    # remove default empty collection
    dc = bpy.data.collections.get("Collection")
    if dc is not None and len(dc.all_objects) == 0:
        bpy.data.collections.remove(dc)
    # collection tree
    C.coll(C.SHIP_ROOT_COLL)
    for k, cname, L in C.MODULES:
        C.coll(C.SHIP_ROOT_COLL + "/" + cname)
    C.coll(C.SHIP_ROOT_COLL + "/01_Passagers/01_Passagers_Ext")
    C.coll(C.SHIP_ROOT_COLL + "/01_Passagers/01_Passagers_Int")
    C.coll(C.SHIP_ROOT_COLL + "/02_Cargo/02_Cargo_Containers")
    utils = C.coll("99_Utils")
    C.build_all_materials()

    # world: deep space, faint ambient so shadows are readable
    w = sc.world or bpy.data.worlds.new("STT_Space")
    sc.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    bg = next((n for n in w.node_tree.nodes if n.type == "BACKGROUND"), None)
    if bg:
        bg.inputs[0].default_value = (0.012, 0.014, 0.02, 1.0)
        bg.inputs[1].default_value = 1.0

    C.clear_collection(utils)
    # lights: hard key sun (warm), cool rim, weak fill
    def sun(name, energy, color, rot, angle_deg=0.5):
        ld = bpy.data.lights.get(name) or bpy.data.lights.new(name, "SUN")
        ld.energy = energy; ld.color = color; ld.angle = math.radians(angle_deg)
        ob = bpy.data.objects.new(name, ld)
        utils.objects.link(ob)
        ob.rotation_euler = [math.radians(a) for a in rot]
        return ob
    sun("LGT_Key_Sun", 4.5, (1.0, 0.95, 0.88), (52, 0, 128))
    sun("LGT_Rim", 1.6, (0.55, 0.7, 1.0), (-60, 0, -40), 2.0)
    sun("LGT_Fill", 0.25, (0.8, 0.85, 1.0), (110, 0, 20), 10.0)

    # camera target + cameras
    tgt = C.empty("CAM_Target", utils, loc=(0, 0, 0), kind="SPHERE", size=1.0)
    def cam(name, loc, lens, target):
        cd = bpy.data.cameras.get(name) or bpy.data.cameras.new(name)
        cd.lens = lens; cd.clip_start = 0.1; cd.clip_end = 3000
        ob = bpy.data.objects.new(name, cd)
        utils.objects.link(ob)
        ob.location = loc
        con = ob.constraints.new("TRACK_TO"); con.target = target
        con.track_axis = "TRACK_NEGATIVE_Z"; con.up_axis = "UP_Y"
        return ob
    main = cam("CAM_Ship_34", (118, -112, 58), 50, tgt)
    cam("CAM_Ship_Side", (165, 0, 8), 50, tgt)
    kit_t = C.empty("CAM_Kit_Target", utils, loc=(0, 0, 1.5), kind="SPHERE", size=0.3)
    cam("CAM_Kit", (14, -16, 9), 50, kit_t)
    sc.camera = main

    # human scale reference (not exported)
    mb = C.MB()
    mb.cyl(0.18, 0.85, 8, "Human_Ref", C.look_mtx((0, 0, 0.85), (0, 0, 1)))       # torso along +Z
    mb.revolve([(0, 0), (0.12, 0.02), (0.12, 0.22), (0, 0.25)], 8, "Human_Ref", C.look_mtx((0, 0, 1.55), (0, 0, 1)))
    for x in (-0.09, 0.09):
        mb.cyl(0.075, 0.85, 6, "Human_Ref", C.look_mtx((x, 0, 0.0), (0, 0, 1)))
    for x in (-0.25, 0.25):
        mb.cyl(0.055, 0.7, 6, "Human_Ref", C.look_mtx((x, 0, 0.95), (0, 0, 1)))
    hr = mb.to_object("REF_Human_1m80", utils, weighted=False)
    hr["stt_export"] = False

    # render settings
    r = sc.render
    r.engine = "BLENDER_EEVEE"
    r.resolution_x, r.resolution_y, r.resolution_percentage = 1600, 900, 100
    r.film_transparent = False
    try:
        sc.eevee.taa_render_samples = 48
    except Exception:
        pass
    try:
        sc.view_settings.view_transform = "AgX"
        sc.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass

    # viewport clipping for a 110 m ship
    for win in bpy.context.window_manager.windows:
        for area in win.screen.areas:
            if area.type == "VIEW_3D":
                for sp in area.spaces:
                    if sp.type == "VIEW_3D":
                        sp.clip_start = 0.05; sp.clip_end = 3000
    return True
