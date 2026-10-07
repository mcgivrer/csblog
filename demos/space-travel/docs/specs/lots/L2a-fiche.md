# LOT L2a — Noyau d'assemblage `sttcomp` et données géométriques

Fiche du CP (SPEC-010 § 3.6). Brouillon préparé pendant la clôture de L1 ; le lot sera développé sur sa propre branche créée depuis `main` après la fusion de L1. Version visée : fait partie de `stt_v2.20` (avec L2). Parallélisable avec L1 : fichiers distincts (SPEC-010 § 3.4).

**But :** extraire du Chantier Naval STT (éditeur autonome) les **règles d'assemblage** dans un noyau `demos/space-travel/shared/sttcomp.js`, sans rendu et indépendant de la version de three, testable sous Node, utilisé par l'éditeur ET (en L2) par le jeu. Fournir les données géométriques nécessaires dans `modules-geom.json`.

**Périmètre**
- `shared/sttcomp.js` (SPEC-010 § 2.2, option B ★) : graphe de pièces (`addPart`, `movePart`, `replacePart`, `deletePart`, ports libres, compatibilité), contrôles (OBB, SAT, jet contre OBB), fiche (masse, palier, famille, équipage), import et export `stt-composition`, mini-bibliothèque de matrices 4×4 interne (environ 80 lignes), **aucune dépendance à three ni au DOM**.
- `modules-geom.json` : matrices des sockets et boîtes de coque, extraites du pack des modules. Vérifier si `STT_modules/build_game_pack.py` peut le produire à partir de `stt_modules.glb` sans Blender ; sinon dire exactement ce qui manque.
- Rebrancher l'éditeur autonome (`STT_modules/sources/index.html`, three r169) pour qu'il lise `shared/sttcomp.js` : l'éditeur doit continuer à fonctionner à l'identique.
- Tests Node (`src/test/unit/*.test.mjs`) sur les compositions réelles de `src/data/compositions/` ; le build du jeu embarque `modules-geom.json` (`sttData`) sans casser les tests existants.

**Hors périmètre :** onglet Chantier et vue 3D r128 (L2), prix, travaux, revente, effets du design, salaires (L2), nouveaux maillages (L6), toute modification de la logique de vol.

**Critères d'acceptation**
1. `sttcomp.js` s'exécute sous Node seul (aucun `THREE`, aucun `document`, aucune globale hors espace de noms), API conforme à la liste ci-dessus.
2. Tests Node verts : construction, déplacement, remplacement, suppression, ports libres, collisions (OBB, SAT, jet), fiche (masse, palier, famille, équipage), aller-retour import/export `stt-composition` sur au moins les compositions du dépôt (par exemple `stt-courlis`, `stt-meridian`).
3. L'éditeur autonome charge et utilise `sttcomp.js` ; ses fonctions d'assemblage donnent les mêmes résultats qu'avant (comparaison sur des compositions existantes).
4. `modules-geom.json` présent, produit par un script reproductible, embarqué par le build du jeu ; parité avec les sockets du pack.
5. Poids ajouté au HTML du jeu ≤ 60 Ko (SPEC-010 § 2.2) ; `python3 build.py compile` et la suite existante restent verts.

**Entrées :** SPEC-010 § 2.2, 2.4, 2.6, 2.10, 2.12, 3.3 ; `demos/space-travel/STT_modules/STT_INTEGRATION.md` ; `STT_modules/sources/index.html` (éditeur, par plages) ; `STT_modules/build_game_pack.py` ; `sources/src/JS/game/09c-vaisseaux-modulaires.js` (`MODSHIP`) ; `docs/specs/CODEMAP.md` ; compositions `sources/src/data/compositions/`.

**Points d'attention pour l'ARCHI :** repérer dans l'éditeur où vivent aujourd'hui les règles (graphe, collisions, fiche, import/export) et ce qui dépend de three ; proposer un découpage en tâches livrables seules (matrices, graphe, collisions, fiche, import/export, données, rebranchement de l'éditeur, tests) ; indiquer les risques de régression de l'éditeur et comment les mesurer ; dire si `shared/` est consommé par la démo « Observation des étoiles » (règle de `demos/space-travel/CLAUDE.md` : un module partagé affecte les deux builds).

**Budget :** 350 k tokens (contrat ≤ 150 lignes, tâches 40–100 k chacune). Arrêt et question au mainteneur si > 450 k.
