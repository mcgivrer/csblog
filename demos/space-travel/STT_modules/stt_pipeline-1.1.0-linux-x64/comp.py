"""Compositions stt-composition ↔ Blender.

Import : la composition (vaisseau ou station, fichier de l'éditeur « Chantier naval STT » ou du jeu) est assemblée avec
des doublons liés des modules de la scène (maillages partagés), règle d'accouplement du projet :
    racine_enfant = socket_parent @ RotX(180°) @ RotZ(roulis) @ socket_enfant_local⁻¹
Livrée et décals par compagnie (compagnies personnalisées et immatriculations propres : atlas générés avec Pillow),
zones, portes de baie, marques des containers, navettes, ports d'amarrage.
Export : les liens sont déduits de la géométrie (sockets qui coïncident, axes opposés), les options des propriétés.
Un assemblage modifié ou composé dans Blender repart donc vers l'éditeur ou le jeu."""
import json, math, os, re

import bpy
from mathutils import Matrix, Vector

from . import project as P

RX180 = Matrix.Rotation(math.pi, 4, "X")
PAX = {"PAX": 48, "SHUTTLE": 8}
TANK_M3, CONT_T = 840, 6.5
CREW = {"I": 2, "II": 4, "III": 6, "IV": 10}
ARCH = {"fret": "Cargo modulaire", "passagers": "Paquebot modulaire", "vrac": "Citernier modulaire",
        "independant": "Indépendant modulaire", "pousseur": "Pousseur modulaire"}
CLASS_MAX = {"S": 100, "M": 180, "L": 240}
ROOT_RE = re.compile(r"(?:^|_)STT_([A-Z0-9]+)_ROOT(?:\.\d+)?$")


def slug(s):
    import unicodedata
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower() or "composition"


def fleet():
    P.apply()
    return P.mod("decals").fleet()


def _norm(M):
    loc, rot, _ = M.decompose()
    return Matrix.Translation(loc) @ rot.to_matrix().to_4x4()


def socket_local(key, port):
    o = bpy.data.objects.get(f"SOCKET_{key}_{port}")
    if o is None:
        raise KeyError(f"socket {key}.{port} absent de la scène")
    return o.matrix_basis.copy()


def ports_of(key):
    root = bpy.data.objects.get(f"STT_{key}_ROOT")
    if not root:
        return []
    pre = f"SOCKET_{key}_"
    return [o.name[len(pre):] for o in root.children if o.name.startswith(pre) and o.get("stt_socket") not in (None, "container")]


def default_port(key, parent_key, parent_port):
    ps = ports_of(key)
    if parent_key == "BAY" and parent_port == "SHUTTLE" and "PAD" in ps:
        return "PAD"
    if key == "SHUTTLE" and "DORSAL" in ps:
        return "DORSAL"
    for p in ("FWD", "AFT", "PORT", "STBD", "TOP", "BOT"):
        if p in ps:
            return p
    return ps[0] if ps else "FWD"


# ------------------------------------------------------------------ compagnies, livrées, atlas de décals
def _rgb(h):
    h = h if re.match(r"^#[0-9a-fA-F]{6}$", h or "") else "#7b3fb3"
    return [int(h[i:i + 2], 16) for i in (1, 3, 5)]


def _lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def company(comp, key):
    """Compagnie de la composition : intégrée (fleet.json) ou personnalisée (bloc companies du fichier)."""
    fl = fleet()
    if key in fl["companies"]:
        return dict(fl["companies"][key], key=key, custom=False)
    d = (comp.get("companies") or {}).get(key)
    if not d:
        return dict(fl["companies"]["STT"], key="STT", custom=False)
    rgb = _rgb(d.get("livery_hex"))
    lin = [_lin(v) for v in rgb]
    return {"key": key, "custom": True, "name": d.get("name", key), "mark": (d.get("mark") or key).upper(),
            "tagline": (d.get("tagline") or d.get("name") or "").upper(), "registry": (d.get("registry") or key + "-0001").upper(),
            "emblem": d.get("emblem") or "chevrons", "livery_hex": "#%02x%02x%02x" % tuple(rgb), "livery_linear": lin,
            "livery_dark_linear": [v * 0.38 for v in lin], "accent": tuple(round(v * 0.82) for v in rgb),
            "accent_light": tuple(round(v + (255 - v) * 0.45) for v in rgb)}


def decal_key(comp, co_key, registry=None):
    """Clé d'atlas pour decals.decal_mat : l'atlas de la compagnie, ou un atlas généré (compagnie personnalisée,
    immatriculation propre à la composition). Sans Pillow : atlas de la compagnie (ou STT) et avertissement."""
    co = company(comp, co_key)
    reg = (registry or "").upper().strip()
    if not co["custom"] and (not reg or reg == co.get("registry")):
        return co["key"], None
    if not P.pillow():
        return (co["key"] if not co["custom"] else "STT"), "Pillow absent : stickers de la compagnie par défaut"
    P.apply()
    gf = P.mod("gen_fleet_decals")
    base = dict(gf.COMPANIES.get(co["key"], {})) if not co["custom"] else {
        "name": co["name"], "mark": co["mark"], "tagline": co["tagline"], "emblem": co["emblem"],
        "accent": co["accent"], "accent_light": co["accent_light"]}
    base["registry"] = reg or co["registry"]
    akey = re.sub(r"[^A-Z0-9]+", "", (co["key"] + "R" + base["registry"]).upper())[:24]
    png = P.path("textures", f"decals_{akey}.png")
    if not os.path.isfile(png):
        gf.OUT = P.path("textures"); gf.FONT_DIR = P.FONTS
        gf.company_atlas(akey, base)
    return akey, None


def livery_override(comp, co_key):
    """Fonction de livrée pour fleet.duplicate_module (None : livrée intégrée de fleet.json)."""
    co = company(comp, co_key)
    if not co["custom"]:
        return None

    def fn(base):
        dark = "Livery_Dark" in base.name
        name = f"{base.name.split('#')[0]}#{co['key']}_{co['livery_hex'][1:]}"
        m = bpy.data.materials.get(name)
        if m is None:
            m = base.copy(); m.name = name
        col = co["livery_dark_linear" if dark else "livery_linear"]
        mix = next((n for n in m.node_tree.nodes if n.type == "MIX"), None) if m.node_tree else None
        if mix is not None:
            mix.inputs[7].default_value = (*[min(1.0, c / 0.806) for c in col], 1.0)
        else:
            b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if m.node_tree else None
            if b:
                b.inputs["Base Color"].default_value = (*col, 1.0)
        m.diffuse_color = (*col, 1.0)
        return m
    return fn


# ------------------------------------------------------------------ import
def parts_of(comp):
    out = []
    for p in comp.get("parts") or []:
        if isinstance(p, list):
            out.append((str(p[0]), p[1], p[2] if len(p) > 2 and isinstance(p[2], dict) else {}))
        elif isinstance(p, dict):
            out.append((str(p.get("id")), p.get("key"), p))
    return out


def _new_name(key, used):
    n = 1
    while f"{key.lower()}{n}" in used:
        n += 1
    return f"{key.lower()}{n}"


def build(comp, origin=(0.0, 0.0, 0.0)):
    """Assemble une composition dans la collection COMPOSITIONS/COMP_<nom>. Retourne (racine, avertissements)."""
    P.apply()
    C, D, F, S = P.mod("stt_core"), P.mod("decals"), P.mod("fleet"), P.mod("stations")
    if comp.get("format") not in (None, "stt-composition"):
        raise ValueError("ce n'est pas un fichier stt-composition")
    defs = {}
    for pid, key, opts in parts_of(comp):
        if not bpy.data.objects.get(f"STT_{key}_ROOT"):
            raise KeyError(f"module {key} absent de la scène : ouvre stt_freighter.blend ou reconstruis les modules")
        defs.setdefault(pid, (key, opts))
    if not defs:
        raise ValueError("composition vide")
    warn = []
    name = str(comp.get("name") or "Composition")
    coll = C.coll(f"COMPOSITIONS/COMP_{slug(name)}")
    C.clear_collection(coll)
    root = C.empty(f"COMP_{slug(name)}", coll, None, tuple(origin), None, "ARROWS", 8.0)
    co_key = comp.get("company") or "STT"
    dkey, w = decal_key(comp, co_key, comp.get("registry"))
    if w: warn.append(w)
    base_ov = {"__co__": co_key if co_key in fleet()["companies"] else "STT", "STT_Decals_STT": D.decal_mat(dkey)}
    lf = livery_override(comp, co_key)
    if lf: base_ov["__livery_fn__"] = lf
    st = root.stt_pipe
    st.role = "COMP"; st.comp_id = str(comp.get("id") or slug(name)); st.comp_name = name
    st.comp_type = "STATION" if comp.get("type") == "station" else "SHIP"
    st.company = co_key; st.registry = str(comp.get("registry") or "")
    g = comp.get("game") or {}
    st.game_family = g["family"] if g.get("family") in ARCH else "AUTO"
    st.game_tier = g["tier"] if g.get("tier") in CREW else "AUTO"
    st.game_ftl = "AUTO" if "ftl" not in g else ("YES" if g["ftl"] else "NO")
    st.game_crew = int(g.get("crew") or 0); st.game_arch = str(g.get("arch") or ""); st.game_desc = str(g.get("description") or "")
    root["stt_companies"] = json.dumps(comp.get("companies") or {}, ensure_ascii=False)
    berth = {b.get("port"): b.get("cls") for b in g.get("berths") or [] if isinstance(b, dict)}
    docks = {(d if isinstance(d, str) else (d or {}).get("port")) for d in comp.get("docking_ports") or []}

    def overrides(pid, key, opts):
        ov = dict(base_ov)
        if key == "SHUTTLE" and opts.get("company") and opts["company"] != co_key:
            k2, w2 = decal_key(comp, opts["company"])
            if w2 and w2 not in warn: warn.append(w2)
            ov = {"__co__": opts["company"] if opts["company"] in fleet()["companies"] else "STT", "STT_Decals_STT": D.decal_mat(k2)}
            l2 = livery_override(comp, opts["company"])
            if l2: ov["__livery_fn__"] = l2
        if comp.get("type") == "station" and opts.get("zone") in fleet().get("zones", {}):
            ov = dict(ov, __livery_fn__=S.zone_livery(opts["zone"]))
        return ov

    placed = {}

    def place(pid, M):
        key, opts = defs[pid]
        mp = S.place(key, coll, root, M, f"{slug(name).upper()}_{pid}", overrides(pid, key, opts))
        inst = mp[bpy.data.objects[f"STT_{key}_ROOT"]]
        ps = inst.stt_pipe
        ps.role = "PART"; ps.part_id = pid; ps.key = key
        ps.zone = opts["zone"] if opts.get("zone") in ("pax", "cont", "liq") else "NONE"
        ps.door = "FIELD" if opts.get("door") == "field" else "MECH"
        ps.company = opts.get("company") or ""
        if key == "BAY":
            S.set_door(mp, "field" if opts.get("door") == "field" else "mech")
        if comp.get("type") == "station" and opts.get("zone") and key in ("NODE6", "NODE4"):
            try: S.zone_signage(mp, key, opts["zone"])
            except Exception as e: warn.append(f"signalétique de zone {pid} : {e}")
        brands = (comp.get("containers") or {}).get(pid)
        if brands:
            conts = sorted([n for o, n in mp.items() if o.get("stt_container")], key=lambda o: str(o.get("stt_slot")))
            for cont, br in zip(conts, brands):
                if br and br in fleet()["container_brands"]:
                    S._brand({o: c for o, c in mp.items() if c is cont or c.parent is cont}, [br])
                else:
                    cont.hide_viewport = cont.hide_render = True
                    for ch in cont.children_recursive: ch.hide_viewport = ch.hide_render = True
                    cont["stt_brand"] = ""
        for o, n in mp.items():                         # ports d'amarrage déclarés et postes
            port = o.name[len(f"SOCKET_{key}_"):] if o.name.startswith(f"SOCKET_{key}_") else None
            if port and f"{pid}.{port}" in docks:
                n.stt_pipe.role = "SOCKET"; n.stt_pipe.dock = True
                n.stt_pipe.berth = berth.get(f"{pid}.{port}") if berth.get(f"{pid}.{port}") in CLASS_MAX else "AUTO"
                n.empty_display_type = "CIRCLE"; n.empty_display_size = 3.9
        placed[pid] = (key, M, inst)

    first = str(comp.get("root")) if str(comp.get("root")) in defs else next(iter(defs))
    place(first, Matrix.Identity(4))
    placed[first][2]["stt_root"] = True                  # racine de l'arbre à l'export
    pending = [l for l in comp.get("links") or [] if isinstance(l, list) and len(l) >= 2]
    progress = True
    while pending and progress:
        progress, nxt = False, []
        for l in pending:
            (pa, pp), (ca, cp) = str(l[0]).split("."), str(l[1]).split(".")
            r = float(l[2]) if len(l) > 2 else 0.0
            if pa not in defs or ca not in defs:
                warn.append(f"lien ignoré {l[0]} → {l[1]}"); continue
            if pa in placed and ca not in placed: src, sp, dst, dp, rr = pa, pp, ca, cp, r
            elif ca in placed and pa not in placed: src, sp, dst, dp, rr = ca, cp, pa, pp, -r
            elif pa in placed and ca in placed: continue
            else: nxt.append(l); continue
            skey, SM, _ = placed[src]
            try:
                Ps = _norm(SM @ socket_local(skey, sp))
                M = Ps @ RX180 @ Matrix.Rotation(math.radians(rr), 4, "Z") @ socket_local(defs[dst][0], dp).inverted()
            except KeyError as e:
                warn.append(str(e)); continue
            place(dst, M); progress = True
        pending = nxt
    for pid in defs:
        if pid not in placed:
            warn.append(f"pièce non reliée : {pid}")
    root["stt_source"] = json.dumps({k: comp[k] for k in ("format", "version", "generator") if k in comp}, ensure_ascii=False)
    return root, warn


# ------------------------------------------------------------------ lecture d'un assemblage Blender
def comp_root_of(ob):
    while ob is not None:
        if ob.stt_pipe.role == "COMP":
            return ob
        ob = ob.parent
    return None


def instances(root):
    out = []
    for o in root.children_recursive:
        m = ROOT_RE.search(o.name)
        if m and o.get("stt_module") and o.type == "EMPTY" and not any(ROOT_RE.search(a.name) for a in _ancestors(o, root)):
            out.append((o, m.group(1)))
    return out


def _ancestors(o, stop):
    a = o.parent
    while a is not None and a is not stop:
        yield a
        a = a.parent


def _sockets(inst, key):
    pre = re.compile(rf"SOCKET_{key}_([A-Z0-9]+)(?:\.\d+)?$")
    out = {}
    for o in inst.children:
        m = pre.search(o.name)
        if m and o.get("stt_socket") not in (None, "container"):
            out[m.group(1)] = o
    return out


def scan(root, tol=0.05):
    """Pièces, liens (déduits des sockets), containers, ports d'amarrage d'une composition dans la scène."""
    insts = instances(root)
    if not insts:
        raise ValueError("aucun module dans cette composition")
    used, parts = set(), []
    for inst, key in insts:
        pid = inst.stt_pipe.part_id if inst.stt_pipe.role == "PART" and inst.stt_pipe.part_id else ""
        if not pid or pid in used:
            pid = _new_name(key, used)
            inst.stt_pipe.role = "PART"; inst.stt_pipe.part_id = pid; inst.stt_pipe.key = key
        used.add(pid)
        parts.append({"inst": inst, "key": key, "id": pid, "socks": _sockets(inst, key)})
    bpy.context.view_layer.update()
    S = []
    for i, p in enumerate(parts):
        for port, so in p["socks"].items():
            S.append((i, port, so, so.matrix_world.copy()))
    links, taken = [], set()
    for a in range(len(S)):
        for b in range(a + 1, len(S)):
            ia, pa, oa, Ma = S[a]; ib, pb, ob_, Mb = S[b]
            if ia == ib or (ia, pa) in taken or (ib, pb) in taken:
                continue
            if (Ma.translation - Mb.translation).length > tol:
                continue
            za, zb = Ma.to_3x3() @ Vector((0, 0, 1)), Mb.to_3x3() @ Vector((0, 0, 1))
            if za.normalized().dot(zb.normalized()) > -0.95:
                continue
            R = (_norm(Ma) @ RX180).inverted() @ _norm(Mb)
            roll = round(math.degrees(math.atan2(R[1][0], R[0][0]))) % 360
            links.append((ia, pa, ib, pb, roll)); taken |= {(ia, pa), (ib, pb)}
    # arbre depuis la racine (première pièce marquée racine, sinon la plus proche de l'origine de la composition)
    rid = next((i for i, p in enumerate(parts) if p["inst"].get("stt_root")), None)
    if rid is None:
        rid = min(range(len(parts)), key=lambda i: (parts[i]["inst"].matrix_world.translation - root.matrix_world.translation).length)
    adj = {i: [] for i in range(len(parts))}
    for l in links:
        adj[l[0]].append(l); adj[l[2]].append(l)
    order, seen, tree, extra = [rid], {rid}, [], []
    for i in order:
        for l in adj[i]:
            j, pi, pj, roll = (l[2], l[1], l[3], l[4]) if l[0] == i else (l[0], l[3], l[1], (-l[4]) % 360)
            if j in seen:
                continue
            seen.add(j); order.append(j); tree.append((i, pi, j, pj, roll))
    used_l = {(t[0], t[1]) for t in tree} | {(t[2], t[3]) for t in tree}
    for l in links:
        if (l[0], l[1]) not in used_l and (l[2], l[3]) not in used_l:
            extra.append(l)
    loose = [parts[i]["id"] for i in range(len(parts)) if i not in seen]
    return parts, order, tree, extra, loose


def stats(parts, idx):
    fl = fleet()
    mass = cont = pax = tank = 0
    pts = []
    for i in idx:
        p = parts[i]; k = p["key"]
        src = bpy.data.objects.get(f"STT_{k}_ROOT")
        mass += float(src.get("stt_mass_t", 50.0)) if src else 50.0
        pax += PAX.get(k, 0); tank += TANK_M3 if k == "TANK" else 0
        for c in containers_of(p):
            if c and c in fl["container_brands"]:
                cont += 1; mass += CONT_T
        for o in [p["inst"]] + list(p["inst"].children_recursive):
            if o.type == "MESH" and o.visible_get() is not False and not o.hide_render:
                pts += [o.matrix_world @ Vector(v) for v in o.bound_box]
    size = [0, 0, 0]
    if pts:
        size = [round(max(v[a] for v in pts) - min(v[a] for v in pts), 1) for a in range(3)]
    return {"parts": len(idx), "mass": round(mass), "containers": cont, "passengers": pax, "tank_m3": tank,
            "length_m": max(size), "size_m": [size[0], size[2], size[1]]}


def containers_of(p):
    if p["key"] not in ("CARGO", "CRG6"):
        return []
    conts = sorted([o for o in p["inst"].children_recursive if o.get("stt_container")], key=lambda o: str(o.get("stt_slot")))
    return [(o.get("stt_brand") or None) if not o.hide_render else None for o in conts]


def auto_game(s):
    tier = "I" if s["mass"] < 800 else "II" if s["mass"] < 1300 else "III" if s["mass"] < 2000 else "IV"
    fam = "fret" if s["containers"] >= 4 else "passagers" if s["passengers"] >= 48 else "vrac" if s["tank_m3"] >= 1680 else "pousseur" if s["parts"] <= 4 else "independant"
    return {"tier": tier, "family": fam, "ftl": tier in ("III", "IV"), "crew": CREW[tier]}


def export(root, for_game=True):
    """Composition de la scène → dict stt-composition (avec bloc game résolu si for_game). Lève ValueError si invalide."""
    parts, order, tree, extra, loose = scan(root)
    st = root.stt_pipe
    if loose:
        raise ValueError(f"pièces non reliées (aucun socket en contact) : {', '.join(loose[:6])}")
    station = st.comp_type == "STATION"
    keys = [parts[i]["key"] for i in order]
    if station and "PROP" in keys:
        raise ValueError("une station ne peut pas avoir de module PROP")
    if for_game and not station and "PROP" not in keys:
        raise ValueError("un vaisseau du jeu a besoin d'un module de propulsion (PROP)")
    out_parts, out_links, conts = [], [], {}
    for i in order:
        p = parts[i]; ps = p["inst"].stt_pipe; o = {}
        if station and ps.zone != "NONE": o["zone"] = ps.zone
        if p["key"] == "BAY": o["door"] = "field" if ps.door == "FIELD" else "mech"
        if p["key"] == "SHUTTLE" and ps.company: o["company"] = ps.company
        out_parts.append([p["id"], p["key"], o] if o else [p["id"], p["key"]])
        cs = containers_of(p)
        if any(cs): conts[p["id"]] = cs
    for (i, pi, j, pj, roll) in tree:
        out_links.append([f"{parts[i]['id']}.{pi}", f"{parts[j]['id']}.{pj}", roll])
    for (i, pi, j, pj, roll) in extra:
        out_links.append([f"{parts[i]['id']}.{pi}", f"{parts[j]['id']}.{pj}", roll])
    linked = {(parts[i]["id"], pi) for i, pi, *_ in tree + extra} | {(parts[j]["id"], pj) for _, _, j, pj, _ in tree + extra}
    docks, berths = [], []
    for p in parts:
        for port, so in p["socks"].items():
            if so.stt_pipe.dock and (p["id"], port) not in linked:
                docks.append(f"{p['id']}.{port}")
                if so.stt_pipe.berth != "AUTO": berths.append({"port": f"{p['id']}.{port}", "cls": so.stt_pipe.berth})
    try:
        companies = json.loads(root.get("stt_companies") or "{}")
    except ValueError:
        companies = {}
    used = {st.company} | {parts[i]["inst"].stt_pipe.company for i in order if parts[i]["inst"].stt_pipe.company}
    companies = {k: v for k, v in companies.items() if k in used}
    s = stats(parts, order)
    out = {"format": "stt-composition", "version": 1, "generator": "STT Pipeline (Blender)", "id": st.comp_id or slug(st.comp_name),
           "name": st.comp_name or root.name, "type": "station" if station else "ship", "company": st.company or "STT",
           "registry": st.registry or company({"companies": companies}, st.company or "STT").get("registry", "")}
    if companies: out["companies"] = companies
    out.update({"root": parts[order[0]]["id"], "parts": out_parts, "links": out_links, "containers": conts,
                "docking_ports": [{"port": d} for d in docks]})
    if for_game:
        if station:
            cls = {b["port"]: b["cls"] for b in berths}
            out["game"] = {"version": 1, "class": "station", "description": st.game_desc, "berths": [{"port": d, "cls": cls.get(d, "M")} for d in docks]}
        else:
            a = auto_game(s)
            fam = a["family"] if st.game_family == "AUTO" else st.game_family
            tier = a["tier"] if st.game_tier == "AUTO" else st.game_tier
            ftl = (st.game_ftl == "YES") if st.game_ftl != "AUTO" else tier in ("III", "IV")
            out["game"] = {"version": 1, "class": "ship", "family": fam, "tier": tier, "ftl": ftl,
                           "crew": st.game_crew or CREW[tier], "arch": st.game_arch or ARCH[fam], "description": st.game_desc}
    else:
        g = {}
        if st.game_family != "AUTO": g["family"] = st.game_family
        if st.game_tier != "AUTO": g["tier"] = st.game_tier
        if st.game_ftl != "AUTO": g["ftl"] = st.game_ftl == "YES"
        if st.game_crew: g["crew"] = st.game_crew
        if st.game_arch: g["arch"] = st.game_arch
        if st.game_desc: g["description"] = st.game_desc
        if berths: g["berths"] = berths
        if g: out["game"] = g
    out["stats"] = s
    return out


# ------------------------------------------------------------------ assemblage dans Blender
def new_comp(name, ctype="SHIP", origin=(0, 0, 0)):
    P.apply()
    C = P.mod("stt_core")
    coll = C.coll(f"COMPOSITIONS/COMP_{slug(name)}")
    root = C.empty(f"COMP_{slug(name)}", coll, None, tuple(origin), None, "ARROWS", 8.0)
    st = root.stt_pipe
    st.role = "COMP"; st.comp_id = slug(name); st.comp_name = name; st.comp_type = ctype; st.company = "STT"
    root["stt_companies"] = "{}"
    return root


def add_module(root, key, target=None, port=None, roll=0.0):
    """Ajoute un module à la composition : au socket `target` (objet SOCKET d'une pièce) ou à l'origine s'il n'y en a pas."""
    P.apply()
    S, D = P.mod("stations"), P.mod("decals")
    if not bpy.data.objects.get(f"STT_{key}_ROOT"):
        raise KeyError(f"module {key} absent de la scène")
    coll = root.users_collection[0]
    used = {o.stt_pipe.part_id for o, _ in instances(root)}
    pid = _new_name(key, used)
    comp = {"companies": json.loads(root.get("stt_companies") or "{}")}
    co = root.stt_pipe.company or "STT"
    dk, _ = decal_key(comp, co, root.stt_pipe.registry)
    ov = {"__co__": co if co in fleet()["companies"] else "STT", "STT_Decals_STT": D.decal_mat(dk)}
    lf = livery_override(comp, co)
    if lf: ov["__livery_fn__"] = lf
    M = Matrix.Identity(4)
    if target is not None:
        tinst = target.parent
        tm = ROOT_RE.search(tinst.name) if tinst else None
        tkey = tm.group(1) if tm else None
        port = port or default_port(key, tkey, (target.name.split("_")[-1]).split(".")[0])
        bpy.context.view_layer.update()
        Ps = root.matrix_world.inverted() @ _norm(target.matrix_world)
        M = Ps @ RX180 @ Matrix.Rotation(math.radians(roll), 4, "Z") @ socket_local(key, port).inverted()
    mp = S.place(key, coll, root, M, f"{root.name}_{pid}", ov)
    inst = mp[bpy.data.objects[f"STT_{key}_ROOT"]]
    inst.stt_pipe.role = "PART"; inst.stt_pipe.part_id = pid; inst.stt_pipe.key = key
    if target is None and not any(o.get("stt_root") for o, _ in instances(root)):
        inst["stt_root"] = True
    return inst


def delete_module(inst):
    objs = [inst] + list(inst.children_recursive)
    for o in objs:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if data is not None and getattr(data, "users", 1) == 0 and isinstance(data, bpy.types.Mesh):
            bpy.data.meshes.remove(data)
    return len(objs)


def free_sockets(root):
    parts, order, tree, extra, loose = scan(root)
    linked = {(t[0], t[1]) for t in tree + extra} | {(t[2], t[3]) for t in tree + extra}
    return [so for i, p in enumerate(parts) for port, so in p["socks"].items() if (i, port) not in linked]
