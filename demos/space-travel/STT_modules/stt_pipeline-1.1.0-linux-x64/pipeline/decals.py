"""Phase 9c - decals (stickers): module names, registry, logos, signs, container markings.
Each decal is a quad floating `offset` above the surface, UV-mapped into a decal atlas
(textures/decals[_<company>].png + .json). Material STT_Decals_<COMPANY>: alpha MASK (Round node)."""
import bpy, bmesh, json, math, os
from mathutils import Vector, Matrix
from . import stt_core as C

TEX_DIR = os.path.expanduser("~/Documents/Blender/space-travel/textures")

FLEET_JSON = os.path.expanduser("~/Documents/Blender/space-travel/fleet.json")

def fleet():
    return json.load(open(FLEET_JSON))

def _paths(key):
    """key: company code ('STT', 'HLN'...) or 'C:<BRAND>' for a container shipper brand."""
    base = f"containers_{key[2:]}" if key.startswith("C:") else ("decals_station" if key == "station" else f"decals_{key}")
    return os.path.join(TEX_DIR, base + ".png"), os.path.join(TEX_DIR, base + ".json")

def _matname(key):
    if key == "station":
        return "STT_Decals_Station"
    return f"STT_ContDecals_{key[2:]}" if key.startswith("C:") else f"STT_Decals_{key}"

def brand_material(brand):
    name = fleet()["container_brands"][brand]["container_material"]
    base = C.mat(name[len("STT_"):])
    ao_var = bpy.data.materials.get(base.name + "@CONT")
    if ao_var is None and bpy.data.images.get("AO_CONT") is not None:
        from . import ao
        ao_var = ao.module_material(base, "CONT", bpy.data.images["AO_CONT"])
    return ao_var or base

def set_container_brand(ob, brand, object_level=False):
    """Recolour a container (its STT_Container_* slot) for a shipper brand."""
    m = brand_material(brand)
    for i, mm in enumerate(ob.data.materials):
        if mm and mm.name.startswith("STT_Container_") and not mm.name.startswith("STT_ContDecals"):
            if object_level:
                ob.material_slots[i].link = "OBJECT"; ob.material_slots[i].material = m
            else:
                ob.data.materials[i] = m
    ob["stt_brand"] = brand

def decal_mat(company="STT"):
    name = _matname(company)
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
    try: m.use_nodes = True
    except Exception: pass
    nt = m.node_tree
    nt.nodes.clear()
    N, L = nt.nodes, nt.links
    out = N.new("ShaderNodeOutputMaterial"); out.location = (600, 0)
    b = N.new("ShaderNodeBsdfPrincipled"); b.location = (300, 0)
    L.new(b.outputs[0], out.inputs[0])
    uv = N.new("ShaderNodeUVMap"); uv.uv_map = "UVMap"; uv.location = (-700, 0)
    t = N.new("ShaderNodeTexImage"); t.location = (-450, 0)
    png, _ = _paths(company)
    im = bpy.data.images.load(png, check_existing=True)
    im.reload()
    im.alpha_mode = "STRAIGHT"
    t.image = im
    L.new(uv.outputs[0], t.inputs[0])
    L.new(t.outputs["Color"], b.inputs["Base Color"])
    rnd = N.new("ShaderNodeMath"); rnd.operation = "ROUND"; rnd.location = (0, -200)
    L.new(t.outputs["Alpha"], rnd.inputs[0]); L.new(rnd.outputs[0], b.inputs["Alpha"])
    b.inputs["Roughness"].default_value = 0.55
    b.inputs["Metallic"].default_value = 0.0
    for attr, val in (("surface_render_method", "DITHERED"), ("blend_method", "CLIP")):
        try: setattr(m, attr, val)
        except Exception: pass
    m.use_backface_culling = True
    m.diffuse_color = (0.8, 0.8, 0.8, 1)
    return m

def read_right(n, up=(0, 0, 1)):
    """Text direction reading left->right for a viewer looking at a surface of normal n."""
    return (-Vector(n)).cross(Vector(up)).normalized()


class Decals:
    def __init__(self, company="STT"):
        self.company = company
        js = json.load(open(_paths(company)[1]))
        self.S, self.R = js["size"], js["rects"]
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")

    def add(self, key, center, normal, right, w, h=None, offset=0.02):
        x0, y0, x1, y1 = self.R[key]
        S = self.S
        if h is None:
            h = w * (y1 - y0) / (x1 - x0)
        n = Vector(normal).normalized()
        r = Vector(right); r = (r - n * r.dot(n)).normalized()
        u = n.cross(r)
        c = Vector(center) + n * offset
        pts = [c - r * w / 2 - u * h / 2, c + r * w / 2 - u * h / 2, c + r * w / 2 + u * h / 2, c - r * w / 2 + u * h / 2]
        uvs = [(x0 / S, 1 - y1 / S), (x1 / S, 1 - y1 / S), (x1 / S, 1 - y0 / S), (x0 / S, 1 - y0 / S)]
        f = self.bm.faces.new([self.bm.verts.new(p) for p in pts])
        for lp, uvv in zip(f.loops, uvs):
            lp[self.uv].uv = uvv

    def frame(self, key, F, w, h=None, offset=0.02, along_axis=False):
        """Place on a surface frame (Z = normal). along_axis: text runs along the frame Y axis."""
        R3 = F.to_3x3()
        n = R3 @ Vector((0, 0, 1))
        right = R3 @ (Vector((0, 1, 0)) if along_axis else Vector((1, 0, 0)))
        self.add(key, F.translation, n, right, w, h, offset)

    def finish(self, name, coll, parent):
        old = bpy.data.objects.get(name)
        if old is not None:
            bpy.data.objects.remove(old, do_unlink=True)
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me); self.bm.free()
        me.materials.append(decal_mat(self.company))
        ob = bpy.data.objects.new(name, me)
        coll.objects.link(ob)
        ob.parent = parent
        ob["stt_decals"] = self.company
        return ob


# ------------------------------------------------------------------ containers
def container_decals(ob, brand="STTC", logo="cont_logo", code="cont_code"):
    from . import mod_cargo as MC
    w, l, h = MC.ISO
    set_container_brand(ob, brand)
    D = Decals("C:" + brand)
    xs = w / 2 + 0.06
    for sx in (1, -1):
        n = Vector((sx, 0, 0))
        rr = read_right(n)
        D.add(logo, (sx * xs, 0, 0.35), n, rr, 6.4, offset=0)
        D.add(code, (sx * xs, l / 2 - 2.2, 1.22), n, rr, 2.0, offset=0)
    nd = Vector((0, 1, 0))
    D.add("grapple", (0, l / 2 + 0.1, 0.78), nd, read_right(nd), 1.5, offset=0)
    return D.finish(ob.name + "_Decals", ob.users_collection[0], ob)


# ------------------------------------------------------------------ modules
def cmd(company="STT"):
    from . import mod_command as M
    root = bpy.data.objects["STT_CMD_ROOT"]
    W, H = M.W, M.H
    D = Decals(company)
    for sx in (1, -1):
        n = (sx, 0, 0)
        D.add("code_cmd", (sx * W / 2, 5.8, 1.7), n, read_right(n), 1.6)
    D.add("reg_dark", (0, 6.1, -H / 2), (0, 0, -1), read_right((0, 0, -1), (-1, 0, 0)), 1.5)
    D.add("eva", (-W / 2, 9.4, -0.95), (-1, 0, 0), read_right((-1, 0, 0)), 1.6)
    D.add("dock_target", (0, 0.10, 0), (0, -1, 0), (1, 0, 0), 1.6, offset=0.01)
    return D.finish("STT_CMD_Decals", root.users_collection[0], root)

def pax(company="STT"):
    from . import mod_passengers as M
    root = bpy.data.objects["STT_PAX_ROOT"]
    W, H, RC = M.W, M.H, M.RC
    coll = bpy.data.collections["01_Passagers_Ext"]
    D = Decals(company)
    D.add("logo_dark", (W / 2, 15.9, -2.2), (1, 0, 0), read_right((1, 0, 0)), 6.0)
    D.add("logo_dark", (-W / 2, 15.9, 2.2), (-1, 0, 0), read_right((-1, 0, 0)), 6.0)
    D.add("reg_dark", (0, 15.8, H / 2), (0, 0, 1), read_right((0, 0, 1), (-1, 0, 0)), 6.0)
    D.add("reg_dark", (0, 15.8, -H / 2), (0, 0, -1), read_right((0, 0, -1), (-1, 0, 0)), 6.0)
    D.add("code_pax", (W / 2, 2.6, -3.0), (1, 0, 0), read_right((1, 0, 0)), 2.0)
    D.add("code_pax", (-W / 2, 2.6, 3.0), (-1, 0, 0), read_right((-1, 0, 0)), 2.0)
    for q in (1, 3):
        for d in range(1, 5):
            D.frame("pod", C.corner_frame(q, W, H, RC, 1, M.DECKS[d] + 1.8 + 1.05), 1.4)
        D.frame("eva", C.corner_frame(q, W, H, RC, 1, 4.05), 1.5)
    return D.finish("STT_PAX_Decals", coll, root)

def cargo(company="STT", brands=None):
    from . import mod_cargo as M
    root = bpy.data.objects["STT_CARGO_ROOT"]
    D = Decals(company)
    sides = {"A": "top", "B": "right", "C": "bottom", "D": "left"}
    for y in (1.125, 14.875):
        for L_, side in sides.items():
            D.frame(f"slot_{L_}", C.side_frame(side, M.FW, M.FW, y, 0.0), 0.6)
        for q in range(4):
            D.frame("code_crg", C.corner_frame(q, M.FW, M.FW, M.FRC, 1, y), 2.4)
    ob = D.finish("STT_CARGO_Decals", root.users_collection[0], root)
    brands = brands or fleet()["ships"][0]["containers"]["CARGO#1"]
    for (name, a, col), br in zip(M.SLOTS, brands):
        container_decals(bpy.data.objects[f"STT_CARGO_Container_{name}"], br)
    return ob

def cargo_star(company="STT", brands=("VESTA", "ORION", "STTC", "NOVA", "LUNA", "POLARIS")):
    from . import mod_cargo_star as M
    root = bpy.data.objects["STT_CRG6_ROOT"]
    D = Decals(company)
    for k in range(6):
        th = math.pi / 6 + k * math.pi / 3
        r_hat = Vector((math.cos(th), 0, math.sin(th)))
        D.add(f"slot_{k + 1}", r_hat * 3.05 + Vector((0, M.Y0, 0)), (0, -1, 0), (math.sin(th), 0, -math.cos(th)), 0.42, offset=0.01)
    for th in (math.pi / 2, -math.pi / 2):
        r_hat = Vector((math.cos(th), 0, math.sin(th)))
        t_hat = Vector((-math.sin(th), 0, math.cos(th)))
        n = r_hat * 0.645 + Vector((0, -0.764, 0))
        for y0, sgn in ((M.Y0, 1), (M.Y1, -1)):
            nn = r_hat * 0.645 + Vector((0, -0.764 * sgn, 0))
            D.add("code_crg2_light", r_hat * 3.54 + Vector((0, y0 + sgn * 0.225, 0)), nn, read_right(nn, r_hat), 2.0, 0.5)
    ob = D.finish("STT_CRG6_Decals", root.users_collection[0], root)
    for k in range(6):
        container_decals(bpy.data.objects[f"STT_CRG6_Container_{k + 1}"], brands[k])
    return ob

def tank(company="STT"):
    from . import mod_tanks as M
    root = bpy.data.objects["STT_TANK_ROOT"]
    D = Decals(company)
    for y in (1.175, 17.825):
        for q in range(4):
            D.frame("code_tnk_light", C.corner_frame(q, M.FW, M.FW, M.FRC, 1, y), 1.6)
    return D.finish("STT_TANK_Decals", root.users_collection[0], root)

def pwr(company="STT"):
    from . import mod_energy as M
    root = bpy.data.objects["STT_PWR_ROOT"]
    D = Decals(company)
    for sx in (1, -1):
        n = (sx, 0, 0)
        D.add("code_pwr", (sx * M.W / 2, 7.6, 1.8), n, read_right(n), 1.6)
        D.add("sign_volt", (sx * M.W / 2, 2.6, 1.8), n, read_right(n), 0.8)
    return D.finish("STT_PWR_Decals", root.users_collection[0], root)

def prop(company="STT"):
    from . import mod_propulsion as M
    root = bpy.data.objects["STT_PROP_ROOT"]
    D = Decals(company)
    for sx in (1, -1):
        n = (sx, 0, 0)
        D.add("code_prp", (sx * M.FW / 2, 5.15, 2.2), n, read_right(n), 1.3, offset=0.07)
        D.add("reg_dark", (sx * M.RW / 2, 12.4, -2.3), n, read_right(n), 5.0, offset=0.07)
        D.add("logo_dark", (sx * M.RW / 2, 12.4, 1.05), n, read_right(n), 4.4, offset=0.07)
    D.add("sign_rad", (0, 12.7, M.RH / 2), (0, 0, 1), (1, 0, 0), 1.0)
    D.add("eva", (M.FW / 2, 1.9, 0.85), (1, 0, 0), read_right((1, 0, 0)), 1.6)
    D.add("plume", (0, 15.55, M.RH / 2), (0, 0, 1), (1, 0, 0), 5.4, 0.6)
    D.add("plume", (0, 15.55, -M.RH / 2), (0, 0, -1), read_right((0, 0, -1), (0, 1, 0)), 5.4, 0.6)
    return D.finish("STT_PROP_Decals", root.users_collection[0], root)

def apply_all(company="STT"):
    out = []
    for f in (cmd, pax, cargo, cargo_star, tank, pwr, prop):
        out.append(f(company).name)
    return out


# ------------------------------------------------------------------ stations: bay, shuttle, connectors
def bay():
    from . import mod_bay as M
    root = bpy.data.objects["STT_BAY_ROOT"]
    D = Decals("station")
    D.add("pad", M.PAD, (0, 0, 1), (0, 1, 0), 5.0, offset=0.02)
    for y in (6.0, 15.0):
        D.add("floor_arrow", (M.XO - 1.4, y, M.ZF), (0, 0, 1), (0, 1, 0), 1.2, offset=0.02)
    yc = (M.Y0 + M.Y1) / 2
    D.frame("bay_plate", C.corner_frame(0, M.W, M.H, M.RC, 1, yc), 3.0, along_axis=True)
    for y in ((C.COLLAR_HALF + M.Y0) / 2, (M.Y1 + M.L_END) / 2 if hasattr(M, "L_END") else (M.Y1 + 21.0 - C.COLLAR_HALF) / 2):
        D.add("code_bay01_light", (M.XO, y, 1.6), (1, 0, 0), (0, 0, -1), 1.6)
    D.add("dock_here", (0, 0.12, 0), (0, -1, 0), (1, 0, 0), 2.0, offset=0.0) if False else None
    out = [D.finish("STT_BAY_Decals", root.users_collection[0], root)]
    up = bpy.data.objects["STT_BAY_DoorMech_Upper"]
    D = Decals("station")
    D.add("keep_clear", (0.52, 0, -1.2), (1, 0, 0), (0, 1, 0), 5.0, offset=0)
    out.append(D.finish("STT_BAY_DoorMech_Decals", up.users_collection[0], up))
    em = bpy.data.objects["STT_BAY_DoorField_Emitters"]
    D = Decals("station")
    D.add("field", (M.XO + 0.33, (M.Y0 + M.Y1) / 2, M.ZC + 0.05), (1, 0, 0), (0, 1, 0), 2.6, offset=0.01)
    out.append(D.finish("STT_BAY_DoorField_Decals", em.users_collection[0], em))
    return out

def shuttle(company="STT"):
    from . import mod_shuttle as M
    root = bpy.data.objects["STT_SHUTTLE_ROOT"]
    D = Decals(company)
    for sx in (1, -1):
        n = (sx, 0, 0)
        D.add("logo_dark", (sx * M.BW / 2, 2.6, M.ZC + 0.25), n, read_right(n), 2.0, offset=0.02)
    a = D.finish("STT_SHUTTLE_Decals", root.users_collection[0], root)
    D = Decals("station")
    for sx in (1, -1):
        n = (sx, 0, 0)
        D.add("code_sht01", (sx * M.BW / 2, -3.9, M.ZC - 0.5), n, read_right(n), 1.0, offset=0.02)
    b = D.finish("STT_SHUTTLE_StationDecals", root.users_collection[0], root)
    return [a, b]

def connectors():
    from . import mod_connectors as M
    out = []
    for key, code in (("NODE6", "code_nod01"), ("NODE4", "code_nod02"), ("ELBOW", "code_elb01"), ("TUNNEL", "code_tun01")):
        root = bpy.data.objects[f"STT_{key}_ROOT"]
        D = Decals("station")
        if key == "TUNNEL":
            for side in ("top", "bottom"):
                D.frame(code, C.side_frame(side, 6.8, 6.8, 3.0, 1.6), 1.0, along_axis=True)
        else:
            L = 10.1
            for q in range(4):
                D.frame(code, C.corner_frame(q, M.S, M.S, M.RC, 1, L / 2 + 1.5), 1.0)
        out.append(D.finish(f"STT_{key}_Decals", root.users_collection[0], root))
    return out
