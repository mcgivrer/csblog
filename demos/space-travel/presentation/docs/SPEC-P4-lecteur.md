# Présentation « Voyage Spatial » — lot P4 : lecteur de slides

## 1. Brief (chef de projet)

**Objectif.** Le produit lui-même : un lecteur de slides HTML autonome (un seul fichier) dont le fond est la cinématique
temps réel (moteur `cosmos.js`, réalisateur, direction photo), avec un gabarit pour écrire ses slides, trois slides de
démonstration, l'export de clips vidéo du fond et une qualité qui s'adapte à la machine.

**Décisions de l'utilisateur (05/10/2026).**

- Bandes noires gardées ; quand le texte compte, un **calque en transparence** est posé sur l'image, derrière le texte
  et/ou les illustrations.
- Direction photo : **look Nolan IMAX** pour toute la présentation (bandes 1.90, flare discret, grain fin).
- Charte McGivrer (web, sombre) pour l'interface et la typographie : JetBrains Mono (titres, labels), Inter (texte),
  ambre (accent, action), cyan (données), coins en équerre, angles vifs.

**Critères d'acceptation.**

1. Une slide = une `<section class="slide">` dans `dist/presentation.html` ; quatre mises en page (titre, contenu,
   illustration, chapitre) ; attributs pour piloter le réalisateur (côté du texte, type de plan, système suivant).
2. Navigation clavier, souris, tactile ; lien direct vers une slide (`#3`) ; plein écran ; interface masquable.
3. Changement de slide = **coupe** du réalisateur, sauf si le plan en cours a moins de 2,5 s (pas de rafale de coupes) ;
   le sujet passe dans le tiers opposé au texte.
4. Calque : image floutée, assombrie et teintée derrière le panneau, rendue par la direction photo (grain par-dessus,
   même étalonnage) ; texte lisible : 95 % des pixels derrière un calque `normal` sous 0,35 de luminance (contraste ≥ 4,5:1
   avec le texte `#e8edf5`). Repli CSS (fond sombre + `backdrop-filter`) quand les effets sont coupés.
5. Export de clips `.webm` du fond seul (sans texte ni calque) : un plan entier (suivant, ou d'un type choisi), 720p ou
   1080p, avec ou sans bandes ; taille ≤ 20 Mo pour un plan (lecteur vidéo des slides Claude).
6. Qualité automatique : résolution dynamique (50 à 100 %), puis paliers (MSAA, profondeur de champ, traînée) ;
   pixels plafonnés à ~2,2 M (1080p) ; `?quality=fixed` pour les tests.
7. Test `tests/lecteur_test.py`.

## 2. Spécification technique (architecte)

### 2.1 Fichiers

| Fichier | Rôle |
|---|---|
| `src/html/presentation.template.html` | **nouveau** : gabarit, styles (charte), 3 slides de démonstration |
| `src/lecteur.js` | **nouveau** : slides, navigation, synchronisation du réalisateur, calques, interface, enregistrement |
| `src/qualite.js` | **nouveau** : `window.__QUALITE.create(renderer, PH, opts)` — résolution dynamique et paliers |
| `src/clip.js` | **nouveau** : `window.__CLIP.create(canvas)` — encodage image par image (WebCodecs, VP9) et conteneur WebM ; repli temps réel (`MediaRecorder`) |
| `src/photo.js` | calques (`PH.setVeil`), réglages de qualité (`PH.quality`), `PH.grainScale`, `PH.crtChance` |
| `tests/lecteur_test.py` | test |

### 2.2 Écrire une slide

```html
<main id="deck" data-titre="Voyage Spatial" data-look="imax" data-systemes="6">
  <section class="slide layout-contenu" data-cote="gauche" data-plan="anneaux">
    <div class="calque" data-calque="normal"> … </div>
  </section>
</main>
```

| Attribut | Valeurs | Effet |
|---|---|---|
| `class="layout-…"` | `titre`, `contenu`, `illustration`, `chapitre` | mise en page |
| `data-cote` | `gauche`, `droite`, `centre` | côté du texte ; le sujet va dans le tiers opposé |
| `data-plan` | un des 10 types du réalisateur | coupe vers ce type de plan à l'arrivée sur la slide |
| `data-systeme` | `suivant` | fondu au noir vers le système suivant (chapitre) |
| `.calque` + `data-calque` | `leger`, `normal`, `fort` | panneau en transparence (assombrissement 0,38 / 0,55 / 0,72) |
| `data-look` (deck) | `imax` (défaut), `auto`, `denis`, `kodak`, `kubrick` | look de la direction photo |

### 2.3 Calque (direction photo)

Rectangles des `.calque` de la slide active relus à chaque image (`getBoundingClientRect`, ils suivent les animations),
au plus 3, convertis en coordonnées d'image. Quand un calque est actif : scène → ½ → ¼, deux flous séparables larges
(4 passes au ¼). En composition, dans le rectangle (bord net, anticrénelé sur 1 px) : image floutée, exposée et étalonnée
comme le reste, mêlée à la couleur de panneau de la charte (`#0b1220`) selon le niveau ; le grain passe par-dessus.
Apparition et disparition en fondu (0,45 s / 0,25 s), synchronisées avec le texte.

### 2.4 Lecteur

- Boucle : `D.update` → `W.update` → calques → `PH.render` → `Q.frame` → image poussée au clip si enregistrement.
- Bandes : `PH.state.letter` → hauteur des bandes en CSS (`--bar`) ; le cadre des slides est l'image entre les bandes ;
  la barre du bas porte le titre du deck, le numéro et la progression quand elle est assez haute (≥ 22 px), sinon elles
  passent dans l'image. Écran haut ou étroit (rapport < 1,2) : pas de bandes, texte empilé en bas.
- Touches : `→` `Espace` `PgDn` clic : suivante · `←` `PgUp` : précédente · `Début` `Fin` · `F` plein écran ·
  `H` interface · `E` export de clip · `P` effets · `N` système suivant · `?` aide · `Échap` ferme un panneau.
- Texte : apparition décalée de 0,35 s après la coupe, en cascade ; `prefers-reduced-motion` respecté.

### 2.5 Export de clip

`L.recordClip({ plan: 'suivant' | type, max: 30, height: 720 | 1080, bars: true })` :
1. verrouille la taille de rendu (16:9, `Q.lock`), coupe calques, CRT et navigation, grain × 0,6 (compression) ;
2. coupe vers le plan demandé ; enregistre de la première à la dernière image de ce plan (ou `max` secondes) ;
3. **image par image** (WebCodecs, Chrome, Edge, Firefox 130+) : la boucle d'affichage est suspendue, la simulation
   avance de 1/30 s par image, chaque image est encodée en VP9 avec un horodatage exact ; le conteneur WebM (durée,
   grappes à chaque image clé, index) est écrit par `clip.js`. Le clip est fluide même si le rendu est plus lent que le
   temps réel ;
4. **repli temps réel** (`MediaRecorder` sur `captureStream(0)`, images poussées une à une) : la simulation suit
   l'horloge (pas de borne à 0,1 s pendant la prise), la cadence est celle de la machine ;
5. télécharge `voyage-spatial_<système>_<plan>.webm` ; débit visé 5 Mbit/s (720p) ou 9 Mbit/s (1080p) ; `Échap` annule.

### 2.6 Qualité automatique

Moyenne glissante de l'intervalle entre images : plus de 1 s au-dessus de 22 ms → résolution × 0,85 (jusqu'à 50 %),
puis paliers (sans MSAA ; sans profondeur de champ ni traînée) ; plus de 4 s sous 18 ms → paliers rétablis, puis
résolution × 1,07. Une hausse suivie d'une chute dans les 2 s est annulée et les hausses suspendues 20 s.
Pendant l'enregistrement d'un clip : taille verrouillée.

### 2.7 Vérification

Test en temps virtuel : chargement sans erreur ; look IMAX et bandes ; navigation (clavier, `#n`, Début/Fin) ; côté
du texte transmis au réalisateur ; coupe ou plan demandé à l'arrivée, pas de coupe sous 2,5 s ; calque aligné sur le
panneau et lisibilité (luminance) ; texte visible après l'apparition ; qualité automatique (baisse puis remontée) ;
puis, en temps réel, export d'un clip (durée et taille vérifiées par `ffprobe` quand il est présent) ; captures.

## 3. Revue (architecte) et vérification (développeur) — 06/10/2026

- Écarts à la spécification, approuvés :
  - **export image par image** (WebCodecs) en plus du temps réel : sur une machine qui rend un plan 1080p avec tous les
    effets à moins de 30 images/s, `MediaRecorder` donnait un clip saccadé, et, la simulation étant bornée à 0,1 s par
    image, un ralenti. Encodage VP9 et conteneur WebM écrits par `clip.js` (aucune bibliothèque) ; repli temps réel
    gardé pour les navigateurs sans WebCodecs, sans borne de pas pendant la prise ;
  - mesure : plan « anneaux » 1080p avec profondeur de champ, 6,7 Mbit/s effectifs, soit ≈ 11 Mo pour 13 s (sous les
    20 Mo du lecteur vidéo des slides Claude) ;
  - `Échap` annule un export ; clavier, souris et réalisateur sont gelés pendant la prise ;
  - réalisateur (P2) : quand une slide impose un côté (`gauche`, `droite`), les plans habituellement centrés (étoile,
    croissant, nébuleuse, lune, éclipse) passent aussi au tiers opposé — sinon l'étoile d'ouverture tombait sous le titre.
    La démonstration du réalisateur (`auto`) ne change pas ;
  - voile de lecture sans calque (titre, chapitre) : dégradé CSS du côté du texte, sous le texte ;
  - bandes : informations de tournage (système, plan, focale, look) en haut, slide et progression en bas ;
  - calques : 6 passes de plus (½ et ¼) ; jusqu'à 33 passes sur une slide à calque avec profondeur de champ.
- Test `tests/lecteur_test.py` : 28 contrôles verts — navigation, `#n`, côté transmis, plan demandé, pas de coupe sous
  2,5 s, calque aligné au pixel près ; lisibilité : 95 % de l'image derrière le calque `normal` à 0,20 de luminance
  (0,48 sans calque) ; écran haut ; qualité (1 → 0,61 à 20 i/s, paliers à 50 %, remontée à 0,80 à 60 i/s) ; clip image
  par image vérifié par `ffprobe` (75 images, 2,5 s exactes, 640 × 360) ; repli temps réel lisible ; annulation.
  Le navigateur de test (swiftshader) rend environ 2 images/s : la cadence du repli temps réel n'y est pas représentative.
