"""Opérateurs : pipeline pas à pas (modal), dossiers, compositions (import, export, jeu, assemblage)."""
import json, os, time, traceback

import bpy
from bpy.props import BoolProperty, EnumProperty, StringProperty
from bpy_extras.io_utils import ExportHelper, ImportHelper

from . import comp as CP
from . import project as P
from . import steps as ST

LOG = []


def log(msg):
    line = time.strftime("%H:%M:%S ") + msg
    LOG.append(line)
    del LOG[:-300]
    t = bpy.data.texts.get("STT_Pipeline.log") or bpy.data.texts.new("STT_Pipeline.log")
    t.write(line + "\n")
    print("[STT]", msg)


def redraw():
    for w in bpy.context.window_manager.windows:
        for a in w.screen.areas:
            if a.type in ("VIEW_3D", "TEXT_EDITOR"):
                a.tag_redraw()


# ------------------------------------------------------------------ pipeline pas à pas
class STT_OT_run(bpy.types.Operator):
    """Lance les étapes cochées, une par une (Échap pour arrêter après l'étape en cours)"""
    bl_idname = "stt.run"
    bl_label = "Lancer"
    kind: EnumProperty(items=[("REBUILD", "Reconstruire", ""), ("EXPORT", "Exporter", ""), ("ALL", "Tout", "")])

    _timer = None

    def execute(self, context):
        """Sans fenêtre (blender -b … --python-expr "bpy.ops.stt.run(kind='EXPORT')") : toutes les étapes d'affilée."""
        s = context.scene.stt_pipe
        steps = (ST.rebuild_steps(s) if self.kind in ("REBUILD", "ALL") else []) + (ST.export_steps(s) if self.kind in ("EXPORT", "ALL") else [])
        t0 = time.time()
        for label, fn in steps:
            t = time.time()
            try:
                msg = fn()
            except Exception as e:
                traceback.print_exc(); log(f"✗ {label} : {e}"); self.report({"ERROR"}, f"{label} : {e}")
                return {"CANCELLED"}
            log(f"✓ {label} ({time.time() - t:.1f} s) · {msg}")
        log(f"Terminé : {len(steps)} étape{'s' if len(steps) > 1 else ''} en {time.time() - t0:.0f} s")
        return {"FINISHED"}

    def invoke(self, context, event):
        if context.window is None:
            return self.execute(context)
        s = context.scene.stt_pipe
        if s.running:
            self.report({"WARNING"}, "Un lancement est déjà en cours")
            return {"CANCELLED"}
        self.steps = (ST.rebuild_steps(s) if self.kind in ("REBUILD", "ALL") else []) + (ST.export_steps(s) if self.kind in ("EXPORT", "ALL") else [])
        if not self.steps:
            self.report({"WARNING"}, "Aucune étape cochée")
            return {"CANCELLED"}
        self.i, self.t0, self.errors = 0, time.time(), 0
        s.running, s.progress, s.status = True, 0, f"0/{len(self.steps)} · {self.steps[0][0]}"
        log(f"— {dict(REBUILD='Reconstruction', EXPORT='Export', ALL='Pipeline complet')[self.kind]} : {len(self.steps)} étapes, projet {P.root()}")
        self._timer = context.window_manager.event_timer_add(0.05, window=context.window)
        context.window_manager.modal_handler_add(self)
        context.window_manager.progress_begin(0, len(self.steps))
        return {"RUNNING_MODAL"}

    def modal(self, context, event):
        s = context.scene.stt_pipe
        if event.type == "ESC":
            log("arrêt demandé"); return self.finish(context, cancelled=True)
        if event.type != "TIMER":
            return {"PASS_THROUGH"}
        label, fn = self.steps[self.i]
        t = time.time()
        try:
            msg = fn()
            log(f"✓ {label} ({time.time() - t:.1f} s) · {msg}")
        except Exception as e:
            self.errors += 1
            log(f"✗ {label} : {e}")
            traceback.print_exc()
            self.report({"ERROR"}, f"{label} : {e}")
            return self.finish(context, cancelled=True)
        self.i += 1
        context.window_manager.progress_update(self.i)
        s.progress = round(100 * self.i / len(self.steps))
        if self.i >= len(self.steps):
            return self.finish(context)
        s.status = f"{self.i}/{len(self.steps)} · {self.steps[self.i][0]}"
        redraw()
        return {"RUNNING_MODAL"}

    def finish(self, context, cancelled=False):
        s = context.scene.stt_pipe
        context.window_manager.event_timer_remove(self._timer)
        context.window_manager.progress_end()
        s.running = False
        s.status = f"{'Interrompu' if cancelled else 'Terminé'} : {self.i}/{len(self.steps)} étapes en {time.time() - self.t0:.0f} s"
        log(s.status)
        redraw()
        if not cancelled:
            self.report({"INFO"}, s.status)
        return {"CANCELLED" if cancelled else "FINISHED"}


class STT_OT_preset(bpy.types.Operator):
    """Coche un ensemble d'étapes"""
    bl_idname = "stt.preset"
    bl_label = "Préréglage"
    which: EnumProperty(items=[("MODS_ALL", "Tous les modules", ""), ("MODS_NONE", "Aucun module", ""),
                               ("QUICK", "Rapide", "Scène, modules, assemblage, matériaux, décals"),
                               ("FULL", "Complet", "Toutes les étapes, AO comprise")])

    def execute(self, context):
        s = context.scene.stt_pipe
        if self.which in ("MODS_ALL", "MODS_NONE"):
            for k in P.MODULE_KEYS:
                setattr(s, "mod_" + k, self.which == "MODS_ALL")
        else:
            full = self.which == "FULL"
            s.do_textures = s.do_ao = s.do_previews = full
            s.do_scene = s.do_modules = s.do_assembly = s.do_materials = s.do_decals = True
        return {"FINISHED"}


class STT_OT_open(bpy.types.Operator):
    """Ouvre un dossier du projet ou du jeu, ou le viewer autonome dans le navigateur"""
    bl_idname = "stt.open"
    bl_label = "Ouvrir"
    where: EnumProperty(items=[("PROJECT", "Projet", ""), ("EXPORT", "Export", ""), ("VIEWER", "Viewer", ""),
                               ("GAME", "Pack du jeu", ""), ("COMPS", "Compositions du jeu", ""),
                               ("STANDALONE", "Viewer autonome", "")])

    def execute(self, context):
        p = {"PROJECT": P.root(), "EXPORT": P.path("export", "modules"), "VIEWER": P.path("viewer"),
             "GAME": P.game_path("sources", "src", "assets"), "COMPS": P.game_path("sources", "src", "data", "compositions"),
             "STANDALONE": P.path("viewer", ST.STANDALONE)}[self.where]
        if not os.path.exists(p):
            self.report({"WARNING"}, f"Absent : {p}"); return {"CANCELLED"}
        bpy.ops.wm.path_open(filepath=p)
        return {"FINISHED"}


class STT_OT_prefs(bpy.types.Operator):
    """Préférences de l'extension (chemins du projet et du jeu)"""
    bl_idname = "stt.prefs"
    bl_label = "Préférences"

    def execute(self, context):
        bpy.ops.screen.userpref_show()
        context.preferences.active_section = "ADDONS"
        bpy.ops.preferences.addon_show(module=P.PKG)
        return {"FINISHED"}


# ------------------------------------------------------------------ compositions
def active_comp(context):
    ob = context.active_object
    return CP.comp_root_of(ob) if ob else None


class STT_OT_comp_import(bpy.types.Operator, ImportHelper):
    """Assemble dans la scène une composition de l'éditeur ou du jeu (fichier stt-composition)"""
    bl_idname = "stt.comp_import"
    bl_label = "Importer une composition"
    filename_ext = ".json"
    filter_glob: StringProperty(default="*.json", options={"HIDDEN"})
    at_cursor: BoolProperty(name="Au curseur 3D", default=True)

    def execute(self, context):
        try:
            data = json.load(open(self.filepath, encoding="utf-8"))
            items = data if isinstance(data, list) else data.get("compositions", [data]) if isinstance(data, dict) else []
            n = 0
            for i, c in enumerate(items):
                o = tuple(context.scene.cursor.location) if self.at_cursor else (0, 0, 0)
                root, warn = CP.build(c, origin=(o[0] + 160 * i, o[1], o[2]))
                for w in warn:
                    log(f"{c.get('name')} : {w}")
                log(f"composition importée : {root.stt_pipe.comp_name} ({len(CP.instances(root))} pièces)")
                n += 1
                context.view_layer.objects.active = root
        except Exception as e:
            traceback.print_exc()
            self.report({"ERROR"}, str(e)); return {"CANCELLED"}
        self.report({"INFO"}, f"{n} composition(s) importée(s)")
        return {"FINISHED"}


class STT_OT_comp_export(bpy.types.Operator, ExportHelper):
    """Écrit la composition active en stt-composition (liens déduits des sockets en contact)"""
    bl_idname = "stt.comp_export"
    bl_label = "Exporter la composition"
    filename_ext = ".json"
    filter_glob: StringProperty(default="*.json", options={"HIDDEN"})
    for_game: BoolProperty(name="Fiche de jeu résolue", default=True, description="Valeurs automatiques figées, PROP exigé pour un vaisseau")

    @classmethod
    def poll(cls, context):
        return active_comp(context) is not None

    def invoke(self, context, event):
        root = active_comp(context)
        self.filepath = CP.slug(root.stt_pipe.comp_name or root.name) + ".json"
        return super().invoke(context, event)

    def execute(self, context):
        root = active_comp(context)
        try:
            data = CP.export(root, for_game=self.for_game)
        except Exception as e:
            self.report({"ERROR"}, str(e)); return {"CANCELLED"}
        with open(self.filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        log(f"composition exportée : {self.filepath} ({len(data['parts'])} pièces, {len(data['links'])} liens)")
        self.report({"INFO"}, f"Exporté : {os.path.basename(self.filepath)}")
        return {"FINISHED"}


class STT_OT_comp_to_game(bpy.types.Operator):
    """Écrit la composition active dans sources/src/data/compositions/ du jeu (fiche de jeu résolue)"""
    bl_idname = "stt.comp_to_game"
    bl_label = "Envoyer dans le jeu"

    @classmethod
    def poll(cls, context):
        return active_comp(context) is not None

    def execute(self, context):
        root = active_comp(context)
        d = P.game_path("sources", "src", "data", "compositions")
        if not os.path.isdir(P.game_path("sources")):
            self.report({"ERROR"}, "Dépôt du jeu non réglé (préférences)"); return {"CANCELLED"}
        try:
            data = CP.export(root, for_game=True)
        except Exception as e:
            self.report({"ERROR"}, str(e)); return {"CANCELLED"}
        os.makedirs(d, exist_ok=True)
        path = os.path.join(d, CP.slug(data["name"]) + ".json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        log(f"envoyé dans le jeu : {path}")
        if context.scene.stt_pipe.write_build:
            try:
                log("build du jeu : " + ST.game_build())
            except Exception as e:
                self.report({"WARNING"}, f"Écrit, mais la compilation a échoué : {e}"); return {"FINISHED"}
        self.report({"INFO"}, f"Écrit : {os.path.basename(path)}")
        return {"FINISHED"}


class STT_OT_comp_new(bpy.types.Operator):
    """Crée une composition vide avec un premier module (choisi dans « Module »)"""
    bl_idname = "stt.comp_new"
    bl_label = "Nouvelle composition"

    def execute(self, context):
        s = context.scene.stt_pipe
        try:
            root = CP.new_comp(s.comp_name, s.comp_type, tuple(context.scene.cursor.location))
            inst = CP.add_module(root, s.comp_key)
        except Exception as e:
            self.report({"ERROR"}, str(e)); return {"CANCELLED"}
        for o in context.selected_objects:
            o.select_set(False)
        context.view_layer.objects.active = root; root.select_set(True)
        log(f"nouvelle composition : {s.comp_name} ({s.comp_key})")
        return {"FINISHED"}


class STT_OT_comp_add(bpy.types.Operator):
    """Ajoute le module choisi au socket sélectionné (objet SOCKET d'une pièce de la composition)"""
    bl_idname = "stt.comp_add"
    bl_label = "Ajouter au socket"

    @classmethod
    def poll(cls, context):
        ob = context.active_object
        return ob is not None and ob.get("stt_socket") not in (None, "container") and active_comp(context) is not None

    def execute(self, context):
        s, ob = context.scene.stt_pipe, context.active_object
        root = active_comp(context)
        if ob.get("stt_socket") in (None, "container"):
            self.report({"WARNING"}, "Sélectionne un socket libre (flèche SOCKET_…) d'une pièce"); return {"CANCELLED"}
        if ob not in CP.free_sockets(root):
            self.report({"WARNING"}, "Ce socket est déjà occupé"); return {"CANCELLED"}
        try:
            inst = CP.add_module(root, s.comp_key, ob, s.comp_port.strip().upper() or None, s.comp_roll)
        except Exception as e:
            self.report({"ERROR"}, str(e)); return {"CANCELLED"}
        ob.select_set(False); inst.select_set(True); context.view_layer.objects.active = inst
        log(f"{inst.stt_pipe.part_id} ({s.comp_key}) ajouté à {ob.name}")
        return {"FINISHED"}


class STT_OT_comp_delete(bpy.types.Operator):
    """Supprime la pièce sélectionnée et tout son sous-arbre d'objets (les pièces qui y étaient accrochées restent)"""
    bl_idname = "stt.comp_delete"
    bl_label = "Supprimer la pièce"

    def execute(self, context):
        ob = context.active_object
        while ob is not None and ob.stt_pipe.role != "PART":
            ob = ob.parent
        if ob is None:
            self.report({"WARNING"}, "Sélectionne une pièce d'une composition"); return {"CANCELLED"}
        pid = ob.stt_pipe.part_id
        n = CP.delete_module(ob)
        log(f"pièce {pid} supprimée ({n} objets)")
        return {"FINISHED"}


class STT_OT_comp_free(bpy.types.Operator):
    """Sélectionne les sockets libres de la composition active"""
    bl_idname = "stt.comp_free"
    bl_label = "Sockets libres"

    @classmethod
    def poll(cls, context):
        return active_comp(context) is not None

    def execute(self, context):
        root = active_comp(context)
        for o in context.selected_objects:
            o.select_set(False)
        free = CP.free_sockets(root)
        for so in free:
            so.hide_set(False); so.select_set(True)
        if free:
            context.view_layer.objects.active = free[0]
        self.report({"INFO"}, f"{len(free)} socket(s) libre(s)")
        return {"FINISHED"}


class STT_OT_comp_check(bpy.types.Operator):
    """Contrôle la composition active : pièces reliées, liens, statistiques et fiche de jeu automatique"""
    bl_idname = "stt.comp_check"
    bl_label = "Contrôler"

    @classmethod
    def poll(cls, context):
        return active_comp(context) is not None

    def execute(self, context):
        root = active_comp(context)
        try:
            d = CP.export(root, for_game=True)
        except Exception as e:
            self.report({"ERROR"}, str(e)); log(f"contrôle : {e}"); return {"CANCELLED"}
        s, g = d["stats"], d.get("game", {})
        msg = f"{s['parts']} pièces, {len(d['links'])} liens, {s['mass']} t, {s['containers']} containers, {s['passengers']} passagers"
        if g.get("class") == "ship":
            msg += f" · {g['family']}, palier {g['tier']}{', long-courrier' if g['ftl'] else ''}"
        log("contrôle : " + msg)
        self.report({"INFO"}, msg)
        return {"FINISHED"}


classes = (STT_OT_run, STT_OT_preset, STT_OT_open, STT_OT_prefs, STT_OT_comp_import, STT_OT_comp_export, STT_OT_comp_to_game,
           STT_OT_comp_new, STT_OT_comp_add, STT_OT_comp_delete, STT_OT_comp_free, STT_OT_comp_check)


def register():
    for c in classes:
        bpy.utils.register_class(c)


def unregister():
    for c in reversed(classes):
        bpy.utils.unregister_class(c)
