# Space Travel & Transport — Vaisseaux et stations modulaires (chantier naval STT)

Statut : implémenté le 03/10/2026, dans `09c-vaisseaux-modulaires.js`. La note technique complète est le §13 de
`STT_INTEGRATION.md`, dans le projet Blender `~/Documents/Blender/space-travel/`.

## Objet

Les vaisseaux et stations composés dans l'éditeur « Chantier naval STT » entrent dans le jeu :

- chaque **vaisseau** devient un modèle jouable de `SHIPGEN.MODELS` (id `mod_…`). Il apparaît :
  - dans le hangar, repéré par ◆ ;
  - au chantier naval s'il est long-courrier ;
  - dans les missions, les navettes de baie, l'usure et les gros plans ;
- chaque **station** devient le 4ᵉ archétype de port orbital, `modular`. Il représente 30 % des ports autour des planètes non gazeuses.

## Chemin d'une création

1. Éditeur : **Fiche de jeu**, puis **Pour le jeu**. Le fichier `stt-composition` porte un bloc `game` : famille, palier, long-courrier, équipage, désignation, description, postes des stations.
2. Deux façons de mettre la création dans le jeu :
   - **publiée** : déposer le fichier dans `src/data/compositions/`, puis `python3 build.py` ;
   - **essai** : dans le hangar, **Importer une création…**. Elle est gardée dans le navigateur (`stt.game.compositions.v1`).
3. Modules 3D : `src/assets/` (pack produit par `scripts/build_game_pack.py` du projet Blender), embarqué par `build.py` dans `<script id="sttPack">`.

## Règles de jeu

| Sujet | Règle |
|---|---|
| Masses | Masses réelles des modules Blender, plus 6,5 t par container. Masse en charge : containers × 24 t, réservoirs × 0,92 t/m³, passagers × 0,1 t |
| Palier | I sous 800 t, II sous 1 300 t, III sous 2 000 t, IV au-delà. Paliers III et IV : long-courriers, avec anneaux de distorsion et générateur de saut autour du module de propulsion |
| Familles | Fret (missions à containers, livrées par les engins de baie), passagers, vrac, indépendant, pousseur. Les groupes du jeu sont réutilisés, sauf « Fret modulaire » |
| Baies | Un module BAY devient une baie latérale d'engins (ouverture 18 × 5,2 m). La navette amarrée s'efface pendant la sortie d'un engin. Sans baie : livraison directe |
| Postes des stations | Un poste par anneau déclaré, classe S / M / L de la fiche, mode `ring` (accostage par l'avant). Toujours au moins un poste L |
| Budget de rendu | Une maille par matériau. Vaisseau : 67 à 130 appels de dessin. Station : 60 au plus |

## Tests

- `src/test/modulaire_test.py` vérifie les points suivants :
  - pack décodé ;
  - contrat de chaque coque ;
  - fiches ;
  - import ;
  - baie et engin ;
  - hangar ;
  - stations ;
  - vol ;
  - aucune erreur JavaScript.
- Tests adaptés :
  - `ports_test.py` : budget par archétype ;
  - `commerce_test.py` : long-courriers modulaires au chantier naval.

## Suite possible

- La navette-cargo tire les containers des modules CARGO : la pile se vide à l'escale.
- L'amarrage P2 sur les postes `ring`.
- Les containers passent en atlas, pour des stations à environ 30 appels de dessin.
