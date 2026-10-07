"""Préférences de l'extension, réglages de la scène (étapes cochées) et propriétés STT des objets (compositions)."""
import bpy
from bpy.props import BoolProperty, EnumProperty, IntProperty, PointerProperty, StringProperty

from . import project as P


class STT_Preferences(bpy.types.AddonPreferences):
    bl_idname = P.PKG

    project_root: StringProperty(name="Projet STT", subtype="DIR_PATH", default="~/Documents/Blender/space-travel",
                                 description="Dossier du projet : fleet.json, textures/, export/, viewer/")
    game_root: StringProperty(name="Dépôt du jeu", subtype="DIR_PATH", default="~/Projects/web/csblog/demos/space-travel",
                              description="Dossier space-travel du jeu (contient sources/build.py)")
    python_exe: StringProperty(name="Python système", default="python3",
                               description="Pour build.py du jeu, et pour les textures si Pillow manque dans Blender")
    use_gltfpack: BoolProperty(name="Compresser le pack (gltfpack)", default=True)
    gltfpack_cmd: StringProperty(name="Commande gltfpack", default="npx --yes gltfpack@0.21",
                                 description="Lancée pour la compression meshopt ; sans elle, le pack est écrit non compressé")
    max_tile: IntProperty(name="Textures MLI (px)", default=512, min=128, max=2048)
    max_decal: IntProperty(name="Atlas de décals (px)", default=1024, min=256, max=2048)

    def draw(self, context):
        col = self.layout.column()
        col.prop(self, "project_root"); col.prop(self, "game_root"); col.prop(self, "python_exe")
        box = col.box(); box.label(text="Pack du jeu", icon="PACKAGE")
        box.prop(self, "use_gltfpack"); r = box.row(); r.enabled = self.use_gltfpack; r.prop(self, "gltfpack_cmd")
        r = box.row(); r.prop(self, "max_tile"); r.prop(self, "max_decal")
        col.label(text=("Pillow disponible dans Blender" if P.pillow() else "Pillow absent : textures via le Python système"),
                  icon="CHECKMARK" if P.pillow() else "INFO")


def _mods():
    return {f"mod_{k}": BoolProperty(name=k, default=True) for k in P.MODULE_KEYS}


STT_Settings = type("STT_Settings", (bpy.types.PropertyGroup,), {"__annotations__": {
    **_mods(),
    "do_textures": BoolProperty(name="Textures et décals", default=False, description="gen_textures, gen_fleet_decals, gen_station_decals"),
    "do_scene": BoolProperty(name="Scène et matériaux", default=True),
    "do_modules": BoolProperty(name="Modules", default=True),
    "do_assembly": BoolProperty(name="Assemblage", default=True, description="Contrôle des écarts entre sockets"),
    "do_materials": BoolProperty(name="Textures sur matériaux", default=True),
    "do_decals": BoolProperty(name="Décals", default=True),
    "do_ao": BoolProperty(name="AO (Cycles)", default=False, description="Bake de l'occlusion par module : long"),
    "ao_samples": IntProperty(name="Échantillons", default=128, min=4, max=1024),
    "do_previews": BoolProperty(name="Aperçus flotte et stations", default=False),
    "exp_glb": BoolProperty(name="GLB par module", default=True),
    "exp_library": BoolProperty(name="Bibliothèque", default=True),
    "exp_viewer": BoolProperty(name="Viewer (éditeur)", default=True),
    "exp_standalone": BoolProperty(name="Viewer autonome (un fichier)", default=True,
                                   description="Éditeur en un seul fichier HTML, lançable sans serveur : Three.js, polices, bibliothèque, atlas et manuel embarqués (environ 15 Mo)"),
    "exp_standalone_manual": BoolProperty(name="Avec le manuel", default=True, description="Embarque les images du manuel (1,5 Mo)"),
    "exp_pack": BoolProperty(name="Pack du jeu", default=True),
    "exp_build": BoolProperty(name="Compiler le jeu", default=False, description="python3 build.py compile dans le dépôt du jeu"),
    "comp_key": EnumProperty(name="Module", items=[(k, k, "") for k in P.MODULE_KEYS], default="PAX"),
    "comp_port": StringProperty(name="Port", default="", description="Port du nouveau module (vide : automatique)"),
    "comp_roll": IntProperty(name="Roulis", default=0, min=-270, max=270, step=90),
    "comp_name": StringProperty(name="Nom", default="Nouvelle composition"),
    "comp_type": EnumProperty(name="Type", items=[("SHIP", "Vaisseau", ""), ("STATION", "Station", "")]),
    "write_build": BoolProperty(name="Compiler après l'export", default=False),
    "running": BoolProperty(default=False),
    "progress": IntProperty(default=0, min=0, max=100, subtype="PERCENTAGE"),
    "status": StringProperty(default=""),
    "ui_rebuild": BoolProperty(default=False), "ui_export": BoolProperty(default=True), "ui_comp": BoolProperty(default=True),
}})


FAMILIES = [("AUTO", "Auto", ""), ("fret", "Fret", ""), ("passagers", "Passagers", ""), ("vrac", "Vrac", ""),
            ("independant", "Indépendant", ""), ("pousseur", "Pousseur", "")]

STT_ObjectProps = type("STT_ObjectProps", (bpy.types.PropertyGroup,), {"__annotations__": {
    "role": EnumProperty(items=[("NONE", "—", ""), ("COMP", "Composition", ""), ("PART", "Pièce", ""), ("SOCKET", "Socket", "")], default="NONE"),
    "comp_id": StringProperty(name="Identifiant"),
    "comp_name": StringProperty(name="Nom"),
    "comp_type": EnumProperty(name="Type", items=[("SHIP", "Vaisseau", ""), ("STATION", "Station", "")]),
    "company": StringProperty(name="Compagnie", description="Clé : STT, HLN, KVF, SHL, AQB ou une compagnie personnalisée"),
    "registry": StringProperty(name="Immatriculation"),
    "game_family": EnumProperty(name="Famille", items=FAMILIES),
    "game_tier": EnumProperty(name="Palier", items=[("AUTO", "Auto", ""), ("I", "I", ""), ("II", "II", ""), ("III", "III", ""), ("IV", "IV", "")]),
    "game_ftl": EnumProperty(name="Long-courrier", items=[("AUTO", "Auto", ""), ("YES", "Oui", ""), ("NO", "Non", "")]),
    "game_crew": IntProperty(name="Équipage", default=0, min=0, max=60, description="0 : automatique"),
    "game_arch": StringProperty(name="Désignation"),
    "game_desc": StringProperty(name="Description"),
    "part_id": StringProperty(name="Pièce"),
    "key": StringProperty(name="Module"),
    "zone": EnumProperty(name="Zone", items=[("NONE", "Aucune", ""), ("pax", "A · Passagers", ""), ("cont", "B · Containers", ""), ("liq", "C · Liquides", "")]),
    "door": EnumProperty(name="Porte", items=[("MECH", "Mécanique", ""), ("FIELD", "Champ de force", "")]),
    "dock": BoolProperty(name="Port d'amarrage", default=False),
    "berth": EnumProperty(name="Poste", items=[("AUTO", "Auto (M)", ""), ("S", "S · 100 m", ""), ("M", "M · 180 m", ""), ("L", "L · 240 m", "")]),
}})

classes = (STT_Preferences, STT_Settings, STT_ObjectProps)


def register():
    for c in classes:
        bpy.utils.register_class(c)
    bpy.types.Scene.stt_pipe = PointerProperty(type=STT_Settings)
    bpy.types.Object.stt_pipe = PointerProperty(type=STT_ObjectProps)


def unregister():
    del bpy.types.Object.stt_pipe
    del bpy.types.Scene.stt_pipe
    for c in reversed(classes):
        bpy.utils.unregister_class(c)
