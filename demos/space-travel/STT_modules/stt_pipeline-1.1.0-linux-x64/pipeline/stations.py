"""Station builder: assembles fleet.json 'stations' graphs from linked duplicates of the modules.
Mating rule: child_root_world = parent_socket_world @ RotX(180) @ RotZ(roll) @ child_socket_local^-1."""
import bpy, math
from mathutils import Matrix, Vector
from . import stt_core as C, decals as D, fleet as F

RX180 = Matrix.Rotation(math.pi, 4, "X")

def socket_local(key, port):
    o = bpy.data.objects[f"SOCKET_{key}_{port}"]
    return o.matrix_basis.copy()

def _norm(M):
    loc, rot, sca = M.decompose()
    return Matrix.Translation(loc) @ rot.to_matrix().to_4x4()

def place(key, coll, parent, M, tag, overrides):
    mp = F.duplicate_module(key, coll, parent, 0.0, tag, overrides)
    src_root = bpy.data.objects[f"STT_{key}_ROOT"]
    new_root = mp[src_root]
    new_root.matrix_parent_inverse.identity()
    new_root.matrix_basis = M
    return mp

def zone_livery(zone):
    info = D.fleet()["zones"][zone]
    col = info["livery_linear"]
    def fn(base):
        name = f"{base.name}#Z_{zone}"
        m = bpy.data.materials.get(name)
        if m is None:
            m = base.copy(); m.name = name
        dark = "Livery_Dark" in base.name
        c = [v * 0.35 for v in col] if dark else col
        mix = next((n for n in m.node_tree.nodes if n.type == "MIX"), None)
        if mix is not None:
            mix.inputs[7].default_value = (*[min(1.0, v / 0.806) for v in c], 1.0)
        m.diffuse_color = (*c, 1.0)
        return m
    return fn

def zone_signage(mp, key, zone):
    from . import mod_connectors as MC
    src_root = bpy.data.objects[f"STT_{key}_ROOT"]
    node_root = mp[src_root]
    rect = D.fleet()["zones"][zone]["decal"]
    Dc = D.Decals("station")
    L = 10.1
    for q in range(4):
        Dc.frame(rect, C.corner_frame(q, MC.S, MC.S, MC.RC, 1, L / 2 - 1.9), 3.0, along_axis=True)
    return Dc.finish(f"{node_root.name}_ZoneDecals", node_root.users_collection[0], node_root)

def set_door(mp, variant):
    for o, n in mp.items():
        d = o.get("stt_door") or (o.parent.get("stt_door") if o.parent else None)
        if d and d != variant:
            n.hide_render = True; n.hide_viewport = True

def dock_ship(ship, coll, station_root, Ps, overrides_co):
    """Dock a fleet ship by its bow port (CMD FWD socket) on the station socket world matrix Ps."""
    tag0 = f"{ship['id'].upper()}"
    co = ship["company"]
    off = ship["module_offsets_m"][0]
    S_rel = Matrix.Translation((0, off, 0)) @ socket_local("CMD", "FWD")
    Mship = Ps @ RX180 @ S_rel.inverted()
    sroot = C.empty(f"{coll.name}_{tag0}_SHIP", coll, station_root, (0, 0, 0), None, "ARROWS", 6.0)
    sroot.matrix_parent_inverse.identity()
    sroot.matrix_basis = station_root.matrix_world.inverted() @ Mship
    overrides = {"__co__": co, "STT_Decals_STT": D.decal_mat(co)}
    counts = {}
    for key, y in zip(ship["modules"], ship["module_offsets_m"]):
        counts[key] = counts.get(key, 0) + 1
        mp = F.duplicate_module(key, coll, sroot, y, f"{coll.name}_{tag0}_{key}{counts[key]}", overrides)
        brands = ship.get("containers", {}).get(f"{key}#{counts[key]}")
        if brands:
            _brand(mp, brands)
    return sroot

def _brand(mp, brands):
    conts = sorted([n for o, n in mp.items() if o.get("stt_container")], key=lambda o: str(o.get("stt_slot")))
    for cont, br in zip(conts, brands):
        D.set_container_brand(cont, br, object_level=True)
        for ch in cont.children:
            if ch.type == "MESH" and ch.get("stt_decals"):
                ch.material_slots[0].link = "OBJECT"
                ch.material_slots[0].material = D.decal_mat("C:" + br)

def build_station(st):
    coll = C.coll(f"STATIONS/STATION_{st['id']}")
    C.clear_collection(coll)
    root = C.empty(f"STATION_{st['id']}", coll, None, tuple(st["origin"]), None, "ARROWS", 10.0)
    for k in ("name", "class", "company"):
        root[f"stt_{k}"] = st[k]
    co = st["company"]
    overrides = {"__co__": co, "STT_Decals_STT": D.decal_mat(co)}
    parts = {p[0]: (p[1], p[2] if len(p) > 2 else {}) for p in st["parts"]}
    placed = {}      # id -> (key, root world matrix (station space), mapping)
    first = st["parts"][0][0]
    k0, o0 = parts[first]
    ov0 = dict(overrides, __livery_fn__=zone_livery(o0["zone"])) if o0.get("zone") else overrides
    mp0 = place(k0, coll, root, Matrix.Identity(4), f"{st['id'].upper()}_{first}", ov0)
    if o0.get("zone") and k0 in ("NODE6", "NODE4"):
        zone_signage(mp0, k0, o0["zone"])
    placed[first] = (k0, Matrix.Identity(4), mp0)
    pending = list(st["links"])
    guard = 0
    while pending and guard < 500:
        guard += 1
        link = pending.pop(0)
        (pa, pp), (ca, cp) = link[0].split("."), link[1].split(".")
        roll = math.radians(link[2]) if len(link) > 2 else 0.0
        if pa in placed and ca not in placed:
            src, sp, dst, dp, r = pa, pp, ca, cp, roll
        elif ca in placed and pa not in placed:
            src, sp, dst, dp, r = ca, cp, pa, pp, -roll
        elif pa in placed and ca in placed:
            continue
        else:
            pending.append(link); continue
        skey, SM, _ = placed[src]
        Ps = _norm(SM @ socket_local(skey, sp))
        dkey, opts = parts[dst]
        Mc = Ps @ RX180 @ Matrix.Rotation(r, 4, "Z") @ socket_local(dkey, dp).inverted()
        ov = overrides
        if opts.get("zone"):
            ov = dict(overrides, __livery_fn__=zone_livery(opts["zone"]))
        mp = place(dkey, coll, root, Mc, f"{st['id'].upper()}_{dst}", ov)
        if opts.get("zone") and dkey in ("NODE6", "NODE4"):
            zone_signage(mp, dkey, opts["zone"])
        placed[dst] = (dkey, Mc, mp)
        if "door" in opts:
            set_door(mp, opts["door"])
        if st.get("containers", {}).get(dst):
            _brand(mp, st["containers"][dst])
    # shuttles on bay pads
    for spec in st.get("shuttles", []):
        pa, pp = spec[0].split(".")
        pkey, PM, _ = placed[pa]
        Ps = _norm(PM @ socket_local(pkey, pp))
        Ms = Ps @ RX180 @ socket_local("SHUTTLE", "PAD").inverted()
        ov = {"__co__": spec[1], "STT_Decals_STT": D.decal_mat(spec[1])}
        place("SHUTTLE", coll, root, Ms, f"{st['id'].upper()}_SHT_{pa}", ov)
    # docked ships
    ships = {s["id"]: s for s in D.fleet()["ships"]}
    for spec in st.get("docked_ships", []):
        pa, pp = spec[0].split(".")
        pkey, PM, _ = placed[pa]
        Ps = root.matrix_world @ _norm(PM @ socket_local(pkey, pp))
        dock_ship(ships[spec[1]], coll, root, Ps, co)
    return {"parts": len(placed), "objects": len(coll.objects)}

def build_all():
    out = {}
    for st in D.fleet().get("stations", []):
        out[st["id"]] = build_station(st)
    return out
