"""
Tests unitaires du gestionnaire de scènes (src/JS/scenes/scene.js) : pile, événements, table des transitions,
politique de mise à jour. Sans navigateur : exécutés par Node (src/test/scenes_unit.js).
Usage : python3 src/test/scenes_unit_test.py   (l'argument de page passé par build.py est ignoré)
"""
import os, subprocess, sys
here = os.path.dirname(os.path.abspath(__file__))
r = subprocess.run(["node", os.path.join(here, "scenes_unit.js")])
sys.exit(r.returncode)
