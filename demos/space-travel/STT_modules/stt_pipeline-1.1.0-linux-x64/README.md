# STT Pipeline : extension Blender

Extension Blender (4.2 et plus, testée avec 5.2.2 LTS) du projet *Space Travel & Transport*. Elle rassemble le pipeline des modules STT-6 dans un panneau, sans console Python. On passe de la géométrie paramétrique jusqu'au pack embarqué dans le jeu.

## Installation

1. Ouvre *Édition › Préférences › Extensions*, puis le menu ⌄ en haut à droite, puis *Installer depuis le disque…*.
2. Choisis `stt_pipeline-1.1.0-linux-x64.zip`.
3. Dans les préférences de l'extension, règle :

| Préférence | Rôle | Valeur par défaut |
|---|---|---|
| Projet STT | Dossier du projet (`fleet.json`, `textures/`, `export/`, `viewer/`) | `~/Documents/Blender/space-travel` |
| Dépôt du jeu | Dossier `space-travel` du jeu (contient `sources/build.py`) | |
| Python système | Lance `build.py` du jeu, et sert de repli pour les textures si Pillow manque dans Blender | `python3` |
| Commande gltfpack | Compression meshopt du pack. Sans Node, le pack est écrit non compressé (8,3 Mo au lieu de 3,5 Mo) | `npx --yes gltfpack@0.21` |

Pillow est fourni dans l'extension (wheel Linux x64, Python 3.13). Il sert à générer les textures, les atlas des compagnies personnalisées et les images WebP. Sur une autre plateforme, l'extension reconstruit le zip avec la wheel correspondante, ou utilise le Python système pour les textures.

## Panneau « STT » (barre latérale N de la vue 3D)

**État du projet** : dossier du projet, `fleet.json`, textures, 13 modules dans la scène, bibliothèque exportée, dépôt du jeu.

**Reconstruction des modules** : étapes à cocher, dans l'ordre du §10 de la note d'intégration. Les modules concernés se choisissent dans une grille de 13 boutons.

| Étape | Contenu |
|---|---|
| Textures et décals | `gen_textures`, `gen_fleet_decals`, `gen_station_decals` |
| Scène et matériaux | |
| Modules | `mod_*` |
| Assemblage | Avec contrôle des écarts entre sockets |
| Textures sur matériaux | |
| Décals | Les anciens décals sont remplacés, pas doublés |
| AO | Cycles, nombre d'échantillons réglable |
| Aperçus | Flotte et stations |

Les préréglages **Rapide** et **Complet** cochent les étapes d'un coup.

**Export** :
- GLB par module, et bibliothèque. Avant l'export, l'extension vérifie que les racines et les sockets sont présents.
- **Viewer** : `STT_ModuleLibrary.json`, `lib/`, atlas WebP dans `tex/`, `fleet.json`.
- **Viewer autonome** : `viewer/chantier_naval_stt_autonome.html`, l'éditeur en un seul fichier d'environ 15 Mo. Il s'ouvre d'un double-clic, sans serveur ni réseau. Il embarque :
  - Three.js r169 et les polices Barlow Condensed et IBM Plex ;
  - la bibliothèque, les atlas et, si **Manuel** est coché, les images du manuel.

  L'étape copie le bundle Three.js et les polices dans `viewer/vendor/`. Si `viewer/index.html` manque ou date d'avant la version 11 de l'éditeur, elle utilise la copie de l'éditeur fournie avec l'extension, sans modifier le projet. **Ouvrir le viewer autonome** l'affiche dans le navigateur.
- **Pack du jeu**, écrit dans `sources/src/assets/`.
- **Compiler le jeu** : lance `build.py compile`.
- Le bouton **Reconstruire + exporter** enchaîne les deux.

Les étapes s'exécutent une par une, avec une barre de progression. Échap arrête après l'étape en cours. Le journal est dans le texte `STT_Pipeline.log`.

**Compositions** :
- **Importer** : un fichier `stt-composition` (éditeur « Chantier naval STT » ou dossier du jeu) est assemblé avec des doublons liés des modules, selon la même règle d'accouplement que l'éditeur. L'import reprend :
  - la livrée et les décals, y compris les compagnies personnalisées et les immatriculations propres, dont les atlas sont générés ;
  - les zones, les portes de baie, les marques des containers, les navettes ;
  - les ports d'amarrage (cercles).
- **Nouvelle composition** : une racine et un premier module.
- **Assembler** : sélectionne un socket libre (une flèche `SOCKET_…`), choisis un module, un port (vide pour automatique) et un roulis, puis clique **Ajouter au socket**. **Sockets libres** les sélectionne tous. **Supprimer la pièce** enlève une pièce.
- **Fiche de jeu** : famille, palier, long-courrier, équipage, désignation et description (« Auto » suit les règles du jeu). Pour une station, chaque socket peut être déclaré port d'amarrage, avec sa classe de poste S, M ou L.
- **Contrôler**, **Exporter**, **Envoyer dans le jeu** (écrit dans `sources/src/data/compositions/`, avec compilation en option). Les liens sont déduits des sockets en contact : un assemblage composé ou modifié dans Blender repart tel quel vers l'éditeur ou le jeu.

## Ligne de commande

```bash
blender -b stt_freighter.blend --python-expr "import bpy; bpy.ops.stt.run(kind='EXPORT')"
```

Sans fenêtre, toutes les étapes cochées s'enchaînent. `kind` vaut `REBUILD`, `EXPORT` ou `ALL`.

## Mettre à jour le pipeline embarqué

L'extension contient une copie des scripts du projet, dans `pipeline/`. Ses imports sont rendus relatifs, et les générateurs de textures sont paramétrés par des variables d'environnement. Après une modification des scripts :

```bash
python3 tools/sync_pipeline.py ~/Documents/Blender/space-travel/scripts .
zip -r ../stt_pipeline-1.1.0-linux-x64.zip . -x '*__pycache__*'
```

Une autre façon de faire le zip : `blender --command extension build --source-dir .`.

Le viewer autonome se construit aussi sans Blender :

```bash
python3 scripts/build_viewer_standalone.py viewer          # depuis le projet
python3 tools/build_viewer_standalone.py ~/…/viewer --no-manual
```

Pour ajouter un module Three.js à l'éditeur, suis `viewer/vendor/LISEZMOI.md`.

## Licences

- Code : GPL-3.0-or-later.
- Polices Barlow Condensed et IBM Plex : SIL Open Font License 1.1 (`fonts/OFL.txt`, `viewer/vendor/OFL-*.txt`).
- Three.js : licence MIT (`viewer/vendor/LICENSE-three.txt`).
- Pillow : licence MIT-CMU.
