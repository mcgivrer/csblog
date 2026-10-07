"""Chemins du projet STT et réglage du pipeline embarqué avant chaque exécution.

Les scripts du projet écrivent dans des dossiers fixes (TEX_DIR, FLEET_JSON, EXPORT_DIR, RENDERS). La copie embarquée
garde ces constantes : `apply()` les remplace par les chemins des préférences, module par module, juste avant un
lancement. Les générateurs de textures lisent STT_TEXTURES_OUT et STT_FONT_DIR."""
import importlib, os

import bpy

PKG = __package__
HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "fonts")
MODULE_KEYS = ["CMD", "PAX", "CARGO", "CRG6", "TANK", "PWR", "PROP", "NODE6", "NODE4", "ELBOW", "TUNNEL", "BAY", "SHUTTLE"]
BUILDERS = {   # clé → (module du pipeline, fonction, argument)
    "CMD": ("mod_command", "build", None), "PAX": ("mod_passengers", "build", None), "CARGO": ("mod_cargo", "build", None),
    "CRG6": ("mod_cargo_star", "build", None), "TANK": ("mod_tanks", "build", None), "PWR": ("mod_energy", "build", None),
    "PROP": ("mod_propulsion", "build", None), "BAY": ("mod_bay", "build", None), "SHUTTLE": ("mod_shuttle", "build", None),
    "NODE6": ("mod_connectors", "build_node", "NODE6"), "NODE4": ("mod_connectors", "build_node", "NODE4"),
    "ELBOW": ("mod_connectors", "build_node", "ELBOW"), "TUNNEL": ("mod_connectors", "build_tunnel", None),
}


def prefs():
    return bpy.context.preferences.addons[PKG].preferences


def root():
    return bpy.path.abspath(prefs().project_root).rstrip("/\\") or os.path.expanduser("~/Documents/Blender/space-travel")


def path(*p):
    return os.path.join(root(), *p)


def game_root():
    g = bpy.path.abspath(prefs().game_root).rstrip("/\\")
    return g


def game_path(*p):
    return os.path.join(game_root(), *p)


def mod(name):
    """Module du pipeline embarqué (importé à la demande)."""
    return importlib.import_module(f".pipeline.{name}", PKG)


def apply():
    """Oriente le pipeline vers le projet des préférences (à appeler avant chaque étape)."""
    r = root()
    os.environ["STT_TEXTURES_OUT"] = os.path.join(r, "textures")
    os.environ["STT_FONT_DIR"] = FONTS
    targets = {"TEX_DIR": os.path.join(r, "textures"), "FLEET_JSON": os.path.join(r, "fleet.json"),
               "EXPORT_DIR": os.path.join(r, "export", "modules"), "RENDERS": os.path.join(r, "renders")}
    for name in ("ao", "decals", "materials", "export_glb", "stt_render"):
        m = mod(name)
        for k, v in targets.items():
            if hasattr(m, k):
                setattr(m, k, v)
    return r


def check():
    """État du projet pour le panneau : (libellé, ok) par élément."""
    r = root()
    out = [("Dossier du projet", os.path.isdir(r)),
           ("fleet.json", os.path.isfile(os.path.join(r, "fleet.json"))),
           ("Textures", os.path.isfile(os.path.join(r, "textures", "decals.png")))]
    n = sum(1 for k in MODULE_KEYS if bpy.data.objects.get(f"STT_{k}_ROOT"))
    out.append((f"Modules dans la scène : {n}/{len(MODULE_KEYS)}", n == len(MODULE_KEYS)))
    lib = os.path.join(r, "export", "modules", "STT_ModuleLibrary.glb")
    out.append(("Bibliothèque GLB exportée", os.path.isfile(lib)))
    g = game_root()
    out.append(("Dépôt du jeu", bool(g) and os.path.isfile(os.path.join(g, "sources", "build.py"))))
    return out


def pillow():
    try:
        import PIL  # noqa: F401
        return True
    except ImportError:
        return False
