"""Panneau « STT » de la barre latérale de la vue 3D (N)."""
import os

import bpy

from . import comp as CP
from . import project as P
from . import steps as ST
from .ops import LOG


class STT_PT_main(bpy.types.Panel):
    bl_space_type, bl_region_type, bl_category = "VIEW_3D", "UI", "STT"
    bl_label = "STT Pipeline"

    def draw(self, context):
        s, L = context.scene.stt_pipe, self.layout
        try:
            checks = P.check()
        except Exception as e:
            L.label(text=f"Préférences à régler : {e}", icon="ERROR"); L.operator("stt.prefs", icon="PREFERENCES"); return
        col = L.column(align=True)
        for label, ok in checks:
            col.label(text=label, icon="CHECKMARK" if ok else "ERROR")
        r = L.row(align=True)
        r.operator("stt.prefs", text="Chemins", icon="PREFERENCES")
        r.operator("stt.open", text="", icon="FILE_FOLDER").where = "PROJECT"
        if s.running or s.status:
            box = L.box()
            if s.running:
                box.progress(factor=s.progress / 100, type="BAR", text=s.status)
                box.label(text="Échap : arrêter après l'étape en cours", icon="INFO")
            else:
                box.label(text=s.status, icon="CHECKMARK")


class STT_PT_rebuild(bpy.types.Panel):
    bl_space_type, bl_region_type, bl_category = "VIEW_3D", "UI", "STT"
    bl_label = "Reconstruction des modules"
    bl_parent_id = "STT_PT_main"
    bl_options = {"DEFAULT_CLOSED"}

    def draw(self, context):
        s, L = context.scene.stt_pipe, self.layout
        L.enabled = not s.running
        r = L.row(align=True)
        r.operator("stt.preset", text="Rapide").which = "QUICK"
        r.operator("stt.preset", text="Complet").which = "FULL"
        col = L.column(align=True)
        col.prop(s, "do_textures"); col.prop(s, "do_scene"); col.prop(s, "do_modules")
        col.prop(s, "do_assembly"); col.prop(s, "do_materials"); col.prop(s, "do_decals")
        r = col.row(align=True); r.prop(s, "do_ao"); sub = r.row(); sub.enabled = s.do_ao; sub.prop(s, "ao_samples", text="")
        col.prop(s, "do_previews")
        box = L.box()
        r = box.row(align=True); r.label(text="Modules concernés")
        r.operator("stt.preset", text="", icon="CHECKBOX_HLT").which = "MODS_ALL"
        r.operator("stt.preset", text="", icon="CHECKBOX_DEHLT").which = "MODS_NONE"
        g = box.grid_flow(columns=3, align=True)
        for k in P.MODULE_KEYS:
            g.prop(s, "mod_" + k, toggle=True)
        L.operator("stt.run", text="Reconstruire", icon="MODIFIER").kind = "REBUILD"
        if s.do_textures and not P.pillow():
            L.label(text="Textures : Python système (numpy + Pillow)", icon="INFO")


class STT_PT_export(bpy.types.Panel):
    bl_space_type, bl_region_type, bl_category = "VIEW_3D", "UI", "STT"
    bl_label = "Export"
    bl_parent_id = "STT_PT_main"

    def draw(self, context):
        s, L = context.scene.stt_pipe, self.layout
        L.enabled = not s.running
        col = L.column(align=True)
        r = col.row(align=True); r.prop(s, "exp_glb"); r.prop(s, "exp_library")
        col.prop(s, "exp_viewer")
        r = col.row(align=True); r.prop(s, "exp_standalone")
        sub = r.row(align=True); sub.active = s.exp_standalone; sub.prop(s, "exp_standalone_manual", text="Manuel")
        col.prop(s, "exp_pack"); col.prop(s, "exp_build")
        if s.exp_glb:
            L.label(text="GLB par module : modules cochés dans Reconstruction", icon="INFO")
        r = L.row(align=True)
        r.scale_y = 1.3
        r.operator("stt.run", text="Exporter", icon="EXPORT").kind = "EXPORT"
        r = L.row(align=True)
        r.operator("stt.run", text="Reconstruire + exporter", icon="PLAY").kind = "ALL"
        r = L.row(align=True)
        for w, t in (("EXPORT", "GLB"), ("VIEWER", "Viewer"), ("GAME", "Pack"), ("COMPS", "Compos")):
            r.operator("stt.open", text=t, icon="FILE_FOLDER").where = w
        if os.path.isfile(P.path("viewer", ST.STANDALONE)):
            L.operator("stt.open", text="Ouvrir le viewer autonome", icon="WORLD").where = "STANDALONE"


class STT_PT_comp(bpy.types.Panel):
    bl_space_type, bl_region_type, bl_category = "VIEW_3D", "UI", "STT"
    bl_label = "Compositions"
    bl_parent_id = "STT_PT_main"

    def draw(self, context):
        s, L = context.scene.stt_pipe, self.layout
        r = L.row(align=True)
        r.operator("stt.comp_import", text="Importer", icon="IMPORT")
        r.operator("stt.comp_export", text="Exporter", icon="EXPORT")
        ob = context.active_object
        root = CP.comp_root_of(ob) if ob else None
        box = L.box()
        if root is None:
            box.label(text="Nouvelle composition", icon="ADD")
            box.prop(s, "comp_name"); box.row().prop(s, "comp_type", expand=True); box.prop(s, "comp_key", text="Premier module")
            box.operator("stt.comp_new", icon="OUTLINER_OB_EMPTY")
            L.label(text="Sélectionne un objet d'une composition pour la modifier.", icon="INFO")
            return
        st = root.stt_pipe
        box.label(text=st.comp_name or root.name, icon="OUTLINER_COLLECTION")
        box.prop(st, "comp_name"); box.row().prop(st, "comp_type", expand=True)
        r = box.row(align=True); r.prop(st, "company"); r.prop(st, "registry", text="")
        sub = box.box(); sub.label(text="Fiche de jeu", icon="PROPERTIES")
        if st.comp_type == "SHIP":
            g = sub.grid_flow(columns=2, align=True)
            g.prop(st, "game_family"); g.prop(st, "game_tier"); g.prop(st, "game_ftl"); g.prop(st, "game_crew")
            sub.prop(st, "game_arch")
        sub.prop(st, "game_desc")
        r = box.row(align=True)
        r.operator("stt.comp_check", icon="CHECKMARK")
        r.operator("stt.comp_to_game", icon="EXPORT")
        box.prop(s, "write_build")
        # assemblage
        ab = L.box(); ab.label(text="Assembler", icon="SNAP_ON")
        r = ab.row(align=True); r.prop(s, "comp_key", text=""); r.prop(s, "comp_port", text="Port"); r.prop(s, "comp_roll", text="")
        r = ab.row(align=True)
        r.operator("stt.comp_add", icon="ADD"); r.operator("stt.comp_free", icon="RESTRICT_SELECT_OFF")
        ab.operator("stt.comp_delete", icon="TRASH")
        if ob is not None and ob.get("stt_socket") not in (None, "container"):
            sb = L.box(); sb.label(text=f"Socket {ob.name.split('SOCKET_')[-1]}", icon="EMPTY_SINGLE_ARROW")
            r = sb.row(align=True); r.prop(ob.stt_pipe, "dock", toggle=True)
            sr = r.row(); sr.enabled = ob.stt_pipe.dock and st.comp_type == "STATION"; sr.prop(ob.stt_pipe, "berth", text="")
        part = ob
        while part is not None and part.stt_pipe.role != "PART":
            part = part.parent
        if part is not None:
            pb = L.box(); ps = part.stt_pipe
            pb.label(text=f"Pièce {ps.part_id} · {ps.key}", icon="MESH_CUBE")
            if st.comp_type == "STATION": pb.prop(ps, "zone")
            if ps.key == "BAY": pb.row().prop(ps, "door", expand=True)
            if ps.key == "SHUTTLE": pb.prop(ps, "company", text="Compagnie de la navette")
            pb.label(text="Zone, porte et compagnie : appliquées à l'export et au prochain import.", icon="INFO")


class STT_PT_log(bpy.types.Panel):
    bl_space_type, bl_region_type, bl_category = "VIEW_3D", "UI", "STT"
    bl_label = "Journal"
    bl_parent_id = "STT_PT_main"
    bl_options = {"DEFAULT_CLOSED"}

    def draw(self, context):
        col = self.layout.column(align=True)
        for line in LOG[-14:] or ["(vide)"]:
            col.label(text=line[:90])
        col.label(text="Journal complet : texte « STT_Pipeline.log »", icon="TEXT")


classes = (STT_PT_main, STT_PT_rebuild, STT_PT_export, STT_PT_comp, STT_PT_log)


def register():
    for c in classes:
        bpy.utils.register_class(c)


def unregister():
    for c in reversed(classes):
        bpy.utils.unregister_class(c)
