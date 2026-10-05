# Présentation « Voyage Spatial » — lot P1 : moteur allégé `shared/cosmos.js`

## 1. Brief (chef de projet)

**Objectif.** Un lecteur de slides HTML dont le fond est une cinématique temps réel du moteur du jeu, limitée au décor :
espace, étoiles, nébuleuses, planètes, lunes, anneaux, astéroïdes, systèmes. **Aucun** vaisseau, station, port ni navette.

**Décisions de l'utilisateur (05/10/2026).**

| Sujet | Choix |
|---|---|
| Format | deck HTML temps réel + bouton « exporter un clip » (webm réutilisable dans Slides) |
| Moteur | module partagé propre `shared/cosmos.js` (pas de bouchons, pas d'instantané figé) |
| Direction photo | look « Cinéma » (flare anamorphique, 2.39, bascules de point, grain, halation ; CRT en transition rare) |
| Contenu | gabarit + 3 slides de démonstration |
| Lecteur | nouveau, écrit pour ce produit |

**Lots.** P1 cosmos · P2 réalisateur céleste · P3 direction photo · P4 lecteur, export de clip, qualité auto · P5 finition, publication.

**Critères d'acceptation du lot P1.**

1. `shared/cosmos.js` ne dépend d'aucun global du jeu (ni `SEED`, ni `scene`, ni `shipRig`, ni `REAL`…) ; il ne
   requiert que `THREE` (r128) et les modules partagés `planets.js`, `stars.js`, `asteroids.js`.
2. **Même graine → même univers que le jeu** : pour une graine et une cellule données, nom, désignation, planètes
   (nom, type, rayon, demi-grand axe, anneaux, lunes, habitable) sont identiques à `REAL.systemInfo` du jeu.
3. Aucune géométrie de vaisseau, station, port, balise ou navette dans les scènes.
4. Page de test `dist/cosmos-test.html` : un système complet, caméra libre, passage d'un astre à l'autre et d'un
   système à l'autre, amas d'astéroïdes de la ceinture ; aucune erreur JavaScript.
5. Test automatisé `tests/cosmos_test.py` (Playwright) couvrant 1 à 4, avec captures.

## 2. Spécification technique (architecte)

### 2.1 Fichiers

| Fichier | Rôle |
|---|---|
| `shared/cosmos.js` | **nouveau** module partagé : `window.__COSMOS.create(opts)` → un monde |
| `presentation/build/build.py` | assemble `src/` + vendor three r128 + modules partagés → `dist/*.html` |
| `presentation/src/html/cosmos-test.template.html` | gabarit de la page de test (marqueurs `/*@VENDOR@*/`, `/*@JS@*/`) |
| `presentation/src/cosmos-test.js` | visionneuse de test : caméra libre, HUD minimal |
| `presentation/tests/cosmos_test.py` | test Playwright (parité avec le jeu, absence de vaisseau, rendu) |

Le jeu (`sources/`) et la démo ne sont **pas modifiés** dans ce lot. `cosmos.js` reprend, à l'identique des
tirages, le code des modules 02, 03, 04, 05 (textures), 05b (rendu en tranches), 07, 11, 12, 14, 15/16 (anneaux,
lunes) et la partie « système » de 20c. Faire adopter `cosmos.js` par le jeu et la démo est un lot ultérieur
(d'ici là, la parité est garantie par le test 2).

### 2.2 API

```js
const W = __COSMOS.create({ seed, portPrefix: 'Port ', starDensity: 1, timeScale: 40 });
W.starData(ix, iy, iz)        // données d'une cellule stellaire (ou null), identiques au jeu
W.systemInfo(cell)            // résumé d'un système sans rien construire (mêmes champs que REAL.systemInfo)
W.pickSystems(n, radius)      // n systèmes les plus spectaculaires autour de la cellule 0,0,0 (score de la séquence de titre)
W.enter(cell)                 // construit le système en mètres (étoile à l'origine), libère le précédent → leg
W.leg                         // système courant : planets[], star3, Rs, lum, beltInfo, orbitN
W.beltCluster(angle)          // amas d'astéroïdes posé dans la ceinture (ou à défaut entre deux orbites) → { group, position, R, rocks }
W.galScene, W.sysScene, W.stats // scènes (lecture seule) et statistiques du dernier rendu (appels, tranches)
W.update(dt, camera, renderer) // rotation des planètes, lunes képlériennes, soleil (éruptions, occultations), champ galactique
W.render(renderer, camera)    // couche galactique puis couche système en tranches de profondeur (origine flottante)
W.dispose()
```

`camera` est une `PerspectiveCamera` de l'hôte, en mètres, dans le repère du système. Réglages du rendu
(sRGB, ACES, exposition) : à la charge de l'hôte, comme dans le jeu.

### 2.3 Données et flux

graine → `starData` (cellules de 190 u, 1 u = 1/38 pc) → `enter(cell)` : `generateSystemData` (tirages `:system:`)
→ `realizeSystem` (`:real:`, mètres) → maillages (anneaux `:ring:`, lunes `:moons:`) → `__PLANETS.enhance`,
`__AST.apply`, `realizeMoons` (`:moons-real:`), `__STARS.create`. Couche galactique : fond (`skybox`… `accent`,
`backdrop-neb`), cellules d'étoiles et de nébuleuses autour de la position galactique ; l'étoile hôte y est masquée
(c'est `stars.js` qui la dessine à sa vraie taille).

### 2.4 Contraintes et risques

- `planets.js` et `asteroids.js` lisent `ATMO_FRAG`, `ASTEROID_MAT`, `ASTEROID_TEMPLATES` (globaux du jeu) :
  `cosmos.js` les déclare sur `window` **seulement s'ils sont absents** (aucun effet dans le jeu).
- Coût : ~300 000 points de fond, planètes à 256×192 segments, nuages : `starDensity` réduit le fond ; la
  résolution dynamique est le travail du lecteur (P4).
- Le champ de vision galactique suit la caméra du système ; la parallaxe galactique dans un système est nulle à
  l'œil (déplacement de quelques ua contre 1 u = 8·10¹⁴ m).

### 2.5 Vérification

`python3 build/build.py` puis `python3 tests/cosmos_test.py dist/cosmos-test.html [../sources/target/space-travel.html]`.

Alternatives écartées : bouchons de `shipRig`/`FLIGHT` dans les modules du jeu (fragile), instantané du jeu
complet (lourd, vaisseaux simulés), reprise de `cine.js` (réalisateur centré sur un vaisseau sujet).

## 3. Revue (architecte) et vérification (développeur) — 05/10/2026

- Écarts à la spécification : `update` reçoit aussi le moteur de rendu (taille angulaire d'un pixel pour le détail
  adaptatif des planètes) ; `beltCluster` rend aussi les roches. Approuvé.
- Test `tests/cosmos_test.py` : 16 contrôles verts, dont la **parité avec le jeu** sur 5 systèmes (graine
  `COSMOS-TEST` : noms, désignations, rayons, demi-grands axes, angles, anneaux, lunes, ceinture identiques),
  l'absence de tout objet ou module de vaisseau, et l'absence de fuite après 5 changements de système.
