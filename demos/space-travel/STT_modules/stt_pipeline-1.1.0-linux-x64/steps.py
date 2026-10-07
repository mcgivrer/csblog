"""Étapes du pipeline STT : chaque étape est (libellé, fonction sans argument → texte de rapport).
Les listes sont construites d'après les options de la scène (props.STT_Settings) ; l'opérateur modal les exécute une à
une (l'interface se rafraîchit entre deux étapes). Les fonctions sont aussi utilisables sans interface (tests)."""
import json, os, re, shutil, subprocess, sys, tempfile

import bpy

from . import project as P

GEN_SCRIPTS = ("gen_textures.py", "gen_fleet_decals.py", "gen_station_decals.py")


# ------------------------------------------------------------------ textures (Pillow dans Blender, sinon Python système)
def _textures_inproc():
    import importlib
    gt = importlib.reload(P.mod("gen_textures"))
    gt.gen_panels(); gt.gen_metal(); gt.gen_mli(); gt.gen_container(); gt.gen_solar(); gt.gen_decals()
    gf = importlib.reload(P.mod("gen_fleet_decals"))
    gf.main()
    importlib.reload(P.mod("gen_station_decals"))          # le module génère son atlas à l'import
    return "textures, décals des compagnies et de la station générés (Pillow dans Blender)"


def _textures_subprocess():
    """Repli : les trois générateurs, lancés avec le Python système (numpy + Pillow requis)."""
    py = P.prefs().python_exe or "python3"
    src = os.path.join(P.HERE, "pipeline")
    with tempfile.TemporaryDirectory() as tmp:
        for f in GEN_SCRIPTS:
            text = open(os.path.join(src, f), encoding="utf-8").read().replace("from .gen_fleet_decals import", "from gen_fleet_decals import")
            open(os.path.join(tmp, f), "w", encoding="utf-8").write(text)
        env = dict(os.environ, STT_TEXTURES_OUT=P.path("textures"), STT_FONT_DIR=P.FONTS, PYTHONPATH=tmp)
        for f in GEN_SCRIPTS:
            r = subprocess.run([py, os.path.join(tmp, f)], cwd=tmp, env=env, capture_output=True, text=True, timeout=900)
            if r.returncode:
                raise RuntimeError(f"{f} ({py}) : {(r.stderr or r.stdout).strip()[-400:]}")
    return f"textures générées avec {py}"


def textures():
    P.apply()
    os.makedirs(P.path("textures"), exist_ok=True)
    return _textures_inproc() if P.pillow() else _textures_subprocess()


# ------------------------------------------------------------------ scène, modules, assemblage, matériaux, décals, AO
def scene():
    P.apply()
    P.mod("scene_setup").setup_scene()
    P.mod("stt_core").build_all_materials()
    return "scène, collections, lumières et matériaux"


def module(key):
    def run():
        P.apply()
        mname, fn, arg = P.BUILDERS[key]
        m = P.mod(mname)
        getattr(m, fn)(*([arg] if arg else []))
        root = bpy.data.objects.get(f"STT_{key}_ROOT")
        n = len(root.children_recursive) if root else 0
        return f"{key} : {n} objets"
    return run


def assembly():
    P.apply()
    r = P.mod("assembly").assemble()
    issues = r.get("issues") or []
    return f"{r['tris'].get('TOTAL', 0):,} triangles".replace(",", " ") + (f" · {len(issues)} écart(s) : {', '.join(issues[:3])}" if issues else " · sockets alignés")


def materials():
    P.apply()
    return f"{len(P.mod('materials').apply_textures())} matériaux texturés"


def _source_decals():
    out = []
    for k in P.MODULE_KEYS:
        root = bpy.data.objects.get(f"STT_{k}_ROOT")
        if root:
            out += [o for o in root.children_recursive if o.get("stt_decals")]
    return out


def decals():
    P.apply()
    old = _source_decals()
    for o in old:                                        # décals déjà posés : retirés pour ne pas les doubler
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if data is not None and data.users == 0:
            bpy.data.meshes.remove(data)
    D = P.mod("decals")
    names = D.apply_all()
    for fn in ("bay", "shuttle", "connectors"):
        if all(bpy.data.objects.get(f"STT_{k}_ROOT") for k in {"bay": ["BAY"], "shuttle": ["SHUTTLE"], "connectors": ["NODE6", "NODE4", "ELBOW", "TUNNEL"]}[fn]):
            r = getattr(D, fn)()
            names += r if isinstance(r, list) else [r]
    return f"{len(names)} jeux de décals ({len(old)} remplacés)"


def ao(key, samples):
    def run():
        P.apply()
        r = P.mod("ao").run(key, samples=samples)
        return f"AO {key} : {r['objects']} objets, {samples} échantillons"
    return run


def ao_containers(samples):
    def run():
        P.apply()
        r = P.mod("ao").run_containers(samples=samples)
        return f"AO des containers : {r['containers']}"
    return run


def previews():
    P.apply()
    ships = P.mod("fleet").build_all()
    st = P.mod("stations").build_all()
    return f"aperçus : {len(ships)} vaisseaux, {len(st)} stations"


# ------------------------------------------------------------------ exports
def export_glb(keys, library):
    """1 GLB par module choisi (+ le container), et/ou la bibliothèque. Contrôle préalable : racines et sockets présents."""
    def run():
        P.apply()
        E = P.mod("export_glb")
        need = set(keys) | (set(E.MODULE_KEYS) if library else set())
        missing = [k for k in sorted(need) if not bpy.data.objects.get(f"STT_{k}_ROOT")]
        if missing:
            raise RuntimeError(f"modules absents de la scène : {', '.join(missing)} (reconstruis-les ou ouvre stt_freighter.blend)")
        nosock = [k for k in sorted(need) if not any(o.name.startswith(f"SOCKET_{k}_") for o in bpy.data.objects[f"STT_{k}_ROOT"].children)]
        if nosock:
            raise RuntimeError(f"modules sans socket : {', '.join(nosock)}")
        if library and not bpy.data.objects.get(E.CONTAINER):
            raise RuntimeError(f"{E.CONTAINER} absent")
        os.makedirs(E.EXPORT_DIR, exist_ok=True)
        E._unhide_all()
        out = {}
        for k in keys:
            out[k] = E.export_module(k)
        if keys:
            out["CONTAINER"] = E.export_container()
        if library:
            out["LIBRARY"] = E.export_library()
        bpy.context.scene.frame_set(100)
        return " · ".join(f"{k} {v / 1e6:.2f} Mo" for k, v in out.items())
    return run


def _tool(name):
    import importlib
    return importlib.import_module(f".tools.{name}", P.PKG)


def viewer():
    """Bibliothèque en glTF JSON + images (lib/), atlas des livrées en WebP (tex/) et fleet.json, pour l'éditeur."""
    P.apply()
    glb = P.path("export", "modules", "STT_ModuleLibrary.glb")
    if not os.path.isfile(glb):
        raise RuntimeError("bibliothèque absente : exporte d'abord les GLB")
    vdir = P.path("viewer")
    out, imgs, blen = _tool("glb_to_gltf_json").convert(glb, vdir)
    tex_out = os.path.join(vdir, "tex"); os.makedirs(tex_out, exist_ok=True)
    n = 0
    if P.pillow():
        from PIL import Image
        for f in sorted(os.listdir(P.path("textures"))):
            if re.match(r"(decals|containers)_[A-Z0-9]+\.png$", f):
                Image.open(P.path("textures", f)).save(os.path.join(tex_out, f[:-4] + ".webp"), "WEBP", quality=85, method=6)
                n += 1
    if os.path.isfile(P.path("fleet.json")):
        shutil.copyfile(P.path("fleet.json"), os.path.join(vdir, "fleet.json"))
    return f"{os.path.basename(out)} {os.path.getsize(out) / 1e6:.1f} Mo, {len(imgs)} images" + (f", {n} atlas WebP" if n else " (atlas WebP : Pillow absent)")


STANDALONE = "chantier_naval_stt_autonome.html"


def viewer_standalone():
    """Éditeur en un seul fichier HTML (Three.js, polices, bibliothèque, atlas et manuel embarqués) : s'ouvre sans serveur."""
    P.apply()
    vdir = P.path("viewer")
    if not os.path.isfile(os.path.join(vdir, "STT_ModuleLibrary.json")):
        raise RuntimeError("viewer absent : lance d'abord l'étape Viewer")
    ext_viewer = os.path.join(os.path.dirname(os.path.abspath(__file__)), "viewer")
    src, note = os.path.join(vdir, "index.html"), ""
    try:
        with open(src, encoding="utf-8") as f:
            ok = "STT_EMBED" in f.read()
    except OSError:
        ok = False
    if not ok:  # éditeur du projet absent ou antérieur à la v11 : copie embarquée, sans toucher au projet
        src, note = os.path.join(ext_viewer, "index.html"), " · éditeur de l'extension"
    # le bundle Three.js et les polices vont dans viewer/vendor : le script marche aussi hors de Blender
    vend_src, vend = os.path.join(ext_viewer, "vendor"), os.path.join(vdir, "vendor")
    os.makedirs(vend, exist_ok=True)
    for f in os.listdir(vend_src):
        a, b = os.path.join(vend_src, f), os.path.join(vend, f)
        if not os.path.isfile(b) or os.path.getsize(b) != os.path.getsize(a):
            shutil.copyfile(a, b)
    s = bpy.context.scene.stt_pipe
    lines = []
    r = _tool("build_viewer_standalone").build(vdir, os.path.join(vdir, STANDALONE), src=src,
                                               manual=s.exp_standalone_manual, log=lines.append)
    miss = f" · {len(r['missing'])} fichier(s) absent(s)" if r["missing"] else ""
    return f"{STANDALONE} {r['size'] / 1e6:.1f} Mo, {r['files']} fichiers embarqués{miss}{note}"


def game_pack():
    P.apply()
    g = P.game_root()
    if not g or not os.path.isdir(os.path.join(g, "sources")):
        raise RuntimeError("dépôt du jeu non réglé (préférences de l'extension)")
    glb = P.path("export", "modules", "STT_ModuleLibrary.glb")
    if not os.path.isfile(glb):
        raise RuntimeError("bibliothèque absente : exporte d'abord les GLB")
    tex = P.path("viewer", "tex") if os.path.isdir(P.path("viewer", "tex")) else P.path("textures")
    log = []
    pr = P.prefs()
    r = _tool("build_game_pack").build(glb, P.path("fleet.json"), tex, P.game_path("sources", "src", "assets"),
                                       gltfpack=pr.gltfpack_cmd, max_tile=pr.max_tile, max_decal=pr.max_decal,
                                       compress=pr.use_gltfpack, log=log.append)
    msg = f"pack du jeu {r['total']} Mo ({'meshopt' if r['compressed'] else 'non compressé'}, {r['images']} images)"
    return msg + (f" · {r['warning']}" if r["warning"] else "")


def game_build():
    """python3 build.py compile dans le dépôt du jeu (HTML lisible ; le paquet minifié reste à ta charge)."""
    py = P.prefs().python_exe or "python3"
    src = P.game_path("sources")
    r = subprocess.run([py, "build.py", "compile"], cwd=src, capture_output=True, text=True, timeout=900)
    if r.returncode:
        raise RuntimeError(f"build.py : {(r.stderr or r.stdout).strip()[-400:]}")
    return (r.stdout.strip().splitlines() or ["compilé"])[-1].strip()


# ------------------------------------------------------------------ listes d'étapes selon les réglages
def rebuild_steps(s):
    keys = [k for k in P.MODULE_KEYS if getattr(s, "mod_" + k)]
    out = []
    if s.do_textures: out.append(("Textures et décals", textures))
    if s.do_scene: out.append(("Scène et matériaux", scene))
    if s.do_modules:
        for k in keys: out.append((f"Module {k}", module(k)))
    if s.do_assembly: out.append(("Assemblage et contrôle des sockets", assembly))
    if s.do_materials: out.append(("Textures sur les matériaux", materials))
    if s.do_decals: out.append(("Décals", decals))
    if s.do_ao:
        for k in keys: out.append((f"AO {k}", ao(k, s.ao_samples)))
        if {"CARGO", "CRG6"} & set(keys): out.append(("AO des containers", ao_containers(s.ao_samples)))
    if s.do_previews: out.append(("Aperçus flotte et stations", previews))
    return out


def export_steps(s):
    out = []
    if s.exp_glb or s.exp_library:
        keys = [k for k in P.MODULE_KEYS if getattr(s, "mod_" + k)] if s.exp_glb else []
        out.append(("Export GLB", export_glb(keys, s.exp_library)))
    if s.exp_viewer: out.append(("Viewer (glTF JSON, images, atlas)", viewer))
    if s.exp_standalone: out.append(("Viewer autonome (un fichier HTML)", viewer_standalone))
    if s.exp_pack: out.append(("Pack du jeu", game_pack))
    if s.exp_build: out.append(("Build du jeu (compile)", game_build))
    return out
