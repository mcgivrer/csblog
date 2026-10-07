# SPDX-License-Identifier: GPL-3.0-or-later
"""STT Pipeline — extension Blender du projet « Space Travel & Transport ».

Panneau « STT » (barre latérale de la vue 3D) :
  * Reconstruction des modules STT-6 (pipeline embarqué : textures, scène, mod_*, assemblage, matériaux, décals, AO) ;
  * Export : GLB par module et bibliothèque, viewer de l'éditeur (glTF JSON + images), pack du jeu (gltfpack), build ;
  * Compositions : import / export stt-composition, assemblage au socket, envoi dans le jeu.
Le pipeline est une copie des scripts du projet (tools/sync_pipeline.py la met à jour)."""
from . import comp, ops, project, props, steps, ui  # noqa: F401

_modules = (props, ops, ui)


def register():
    for m in _modules:
        m.register()


def unregister():
    for m in reversed(_modules):
        m.unregister()
