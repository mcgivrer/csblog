# Voyage Spatial — présentation à fond cinématique

Lecteur de slides HTML dont le fond est une cinématique **temps réel** du moteur du jeu, limitée au décor :
espace, étoiles, nébuleuses, planètes, lunes, anneaux, astéroïdes, systèmes. Aucun vaisseau, station, port ni navette.

Le moteur allégé est le module partagé [`../shared/cosmos.js`](../shared/cosmos.js) : même graine, mêmes systèmes que le jeu.

**En ligne** (après fusion dans `main`) : <https://mcgivrer.github.io/csblog/demos/space-travel/presentation/>

## État

| Lot | Contenu | État |
|---|---|---|
| P1 | moteur allégé `shared/cosmos.js` + visionneuse de test | ✅ |
| P2 | réalisateur céleste `src/realisateur.js` (10 types de plans, grammaire, cadrage aux tiers) + démonstration | ✅ |
| P3 | direction photo « Cinéma » `src/photo.js` (4 looks, profondeur de champ, flare anamorphique, bloom, grain, bandes, CRT) | ✅ |
| P4 | lecteur de slides `dist/presentation.html` (gabarit + 3 slides, calques, look IMAX, export de clips, qualité automatique) | ✅ |
| P5 | finition et publication : version compacte, page d'entrée et aperçu de partage, repli sans WebGL, écran noir | ✅ (en ligne après fusion) |
| P6 | présentation du jeu : 21 slides (but, univers, métier, campagne, moteur), illustrations, schémas, vue présentateur | ✅ |
| P7 | ambiances de l'image de fond, une par slide : Nolan IMAX, Nolan 35 mm, noir & blanc, sépia, Technicolor, Super 8, CRT, VHS, vision nocturne | ✅ |
| P8 | three.js r186 (dernière version) pour la présentation, aspect de r128 conservé ; le jeu garde r128 | ✅ |

Spécifications : [`docs/SPEC-P1-cosmos.md`](docs/SPEC-P1-cosmos.md), [`docs/SPEC-P2-realisateur.md`](docs/SPEC-P2-realisateur.md),
[`docs/SPEC-P3-photo.md`](docs/SPEC-P3-photo.md), [`docs/SPEC-P4-lecteur.md`](docs/SPEC-P4-lecteur.md),
[`docs/SPEC-P5-publication.md`](docs/SPEC-P5-publication.md), [`docs/SPEC-P6-presentation_du_jeu.md`](docs/SPEC-P6-presentation_du_jeu.md),
[`docs/SPEC-P7-ambiances.md`](docs/SPEC-P7-ambiances.md), [`docs/SPEC-P8-three.md`](docs/SPEC-P8-three.md).
Contenu des slides (texte, illustrations, notes de l'orateur) : [`docs/BROUILLON-slides-jeu.md`](docs/BROUILLON-slides-jeu.md).

## Construire et tester

```bash
cd demos/space-travel/presentation
python3 build/build.py            # compile, version compacte, puis test
python3 build/build.py compile    # -> dist/presentation.html (+ pages de test : cosmos, réalisateur, photo)
python3 build/build.py package    # -> dist/presentation.min.html (minifieur du jeu : npm install dans ../sources/)
python3 build/build.py test       # Playwright + Chromium ; parité avec ../sources/target/space-travel.html si présent
python3 build/build.py apercu     # -> media/apercu.jpg, aperçu de partage 1200 × 630
```

Seul Python 3 est nécessaire pour compiler : three.js r186 est embarqué depuis `vendor/three.min.js`, un sous-ensemble
(les symboles utilisés) produit par `python3 build/three_vendor.py [version]` (npm et réseau requis) ; la compilation
vérifie que chaque `THREE.X` utilisé y figure. Le jeu et la démo « Observation des étoiles » gardent three r128. Les captures du test
vont dans `dist/shots/` (non suivi).

## Visionneuse de test

`dist/cosmos-test.html` s'ouvre directement dans le navigateur. Paramètres : `?seed=XXX` (graine, la même que dans le jeu),
`?density=0.5` (fond d'étoiles allégé), `?quality=fixed` (résolution figée).

| Touche | Action |
|---|---|
| `0` | l'étoile |
| `1` à `3` | les planètes |
| `L` | lune suivante de la planète visée |
| `A` | amas d'astéroïdes de la ceinture (ou entre deux orbites) |
| `N` / `P` | système suivant / précédent (les 6 plus spectaculaires du voisinage) |
| glisser · molette | orbiter · distance |
| `F` | focale suivante (24 à 135 mm) |
| `H` | masquer les informations |

## Démonstration du réalisateur

`dist/realisateur-test.html` filme en boucle les six systèmes les plus spectaculaires du voisinage, sans aucune intervention.
Paramètres : `?seed=XXX` (univers), `?rz=YYY` (graine du réalisateur ; sans elle, un montage différent à chaque chargement).

| Touche | Action |
|---|---|
| `Espace` | coupe vers le plan suivant |
| `N` | fondu au noir vers le système suivant |
| `F` | côté du texte : auto, gauche, droite, centre (le sujet va dans le tiers opposé) |
| `T` | affiche la zone de texte simulée |
| `H` | masquer les informations |

## Direction photo « Cinéma »

`dist/photo-test.html` : le réalisateur, habillé par la direction photo. Un look par système, tiré parmi quatre :

| Look | Inspiration | Image |
|---|---|---|
| Villeneuve | Dune, Blade Runner 2049 | désaturé, ombres froides, hautes lumières chaudes, 2.39, flare bleu |
| Nolan IMAX | Interstellar | naturel, 1.90, flare discret, grain fin |
| Kodak 2383 | tirage argentique | chaud, noirs denses, halation, 2.39, flare ambré, grain marqué |
| Kubrick 2001 | 2001 | neutre et froid, 2.20, sans traînée (fantômes seuls) |

Effets motivés par le plan : flare et fantômes seulement si l'étoile est dans le cadre (selon sa visibilité) ; profondeur
de champ sur les plans à premier plan (lune, ceinture, anneaux, nébuleuse), avec bascule de point ; transition CRT rare,
à l'ouverture d'un système. Paramètres : `?seed`, `?rz` (comme la démonstration du réalisateur), `?look=denis|imax|kodak|kubrick`,
`?crt=0..1` (probabilité du CRT), `?fx=0` (sans effet au départ).

| Touche | Action |
|---|---|
| `Espace` · `N` · `F` · `T` | comme la démonstration du réalisateur |
| `P` | effets oui / non (image du jeu) |
| `V` | avant \| après (moitié gauche sans effet) |
| `L` | look suivant (auto, Villeneuve, Nolan IMAX, Kodak 2383, Kubrick 2001) |
| `B` | bandes : celles du look, aucune, 2.39, 1.85 |
| `D` | carte de flou (rouge : arrière-plan flou, vert : premier plan flou) |
| `C` | transition CRT |
| `H` | masquer les informations |

## Lecteur de slides

`dist/presentation.html` : un seul fichier, à ouvrir dans le navigateur (ou à publier tel quel). Le fond est la cinématique
temps réel, filmée au look **Nolan IMAX** (bandes 1.90) ; chaque slide peut changer d'**ambiance** (filtre de l'image de
fond : noir & blanc, sépia, CRT…), appliquée sur la coupe. Le texte des slides est en HTML par-dessus, à la charte McGivrer.
Chaque changement de slide fait couper le réalisateur (sauf si le plan a moins de 2,5 s) ; le sujet se place dans le
tiers opposé au texte. Quand le texte compte, un **calque** en transparence (image floutée et assombrie, rendue par la
direction photo) passe derrière le texte ou l'illustration.

| Touche | Action |
|---|---|
| `→` `Espace` `PgDn` clic | slide suivante (`Maj` + clic : précédente) |
| `←` `PgUp` | slide précédente |
| `Début` `Fin` | première, dernière slide |
| `F` | plein écran |
| `H` | masquer l'interface |
| `E` | exporter un clip du fond |
| `B` ou `.` | écran noir (le fond se met en pause) |
| `S` | vue présentateur : notes, slide suivante, minuteur (fenêtre séparée, ou incrustée si le navigateur la refuse) |
| `N` | système suivant |
| `P` | effets de la direction photo (comparaison) |
| `A` | ambiance imposée à toutes les slides, en boucle, puis retour à celle de chaque slide |
| `?` | aide · `Échap` : fermer, annuler un export |

Paramètres : `#3` (slide), `?seed=` (univers), `?rz=` (montage reproductible), `?look=` (une ambiance pour toutes les slides),
`?crt=0..1`, `?quality=fixed`, `?webgl=0` (repli sans fond animé). Sans WebGL, les slides restent lisibles et
navigables sur un fond fixe à la charte.

### Écrire ses slides

Dans `src/html/presentation.template.html`, puis `python3 build/build.py compile`. Une slide = une `<section class="slide">` :

```html
<section class="slide layout-contenu" data-cote="gauche" data-plan="anneaux">
  <div class="calque" data-calque="normal">
    <p class="eyebrow anim">01 · le réalisateur</p>
    <h2 class="anim">Une caméra sans opérateur</h2>
    <ul><li class="anim">…</li></ul>
  </div>
</section>
```

| Attribut | Valeurs | Effet |
|---|---|---|
| `class="layout-…"` | `titre`, `contenu`, `illustration`, `chapitre` | mise en page |
| `data-cote` | `gauche`, `droite`, `centre` | côté du texte ; le sujet va dans le tiers opposé |
| `data-plan` | `etoile`, `croissant`, `nebuleuse`, `survol`, `terminateur`, `limbe`, `anneaux`, `lune`, `eclipse`, `ceinture` | plan joué à l'arrivée sur la slide |
| `data-systeme` | `suivant` | fondu au noir vers le système suivant |
| `data-titre-court` | texte | titre de la bande du bas |
| `data-ambiance` | `imax`, `nolan35`, `nb`, `sepia`, `technicolor`, `super8`, `crt`, `vhs`, `nuit`, `denis`, `kodak`, `kubrick` | filtre de l'image de fond, appliqué sur la coupe ; les bandes suivent le format |
| `.calque` + `data-calque` | `leger`, `normal`, `fort` | calque en transparence derrière le bloc |
| `.anim` | — | apparition en cascade après la coupe |
| `<aside class="notes">` | texte | notes de l'orateur, affichées dans la vue présentateur |
| `<img src="media/…">` | chemin relatif à `presentation/` (ou `../docs/…`) | illustration, intégrée au fichier publié par `build.py` |

Sur `<main id="deck">` : `data-titre`, `data-look` (ambiance par défaut, `imax` ; `auto` : une par système), `data-systemes`
(systèmes filmés en boucle).

### Export de clips

`E` ou le bouton « ● clip » : un plan entier (le suivant, ou d'un type choisi), en 720p ou 1080p, avec ou sans bandes,
le fond seul (ni texte ni calque). Avec Chrome, Edge ou Firefox 130+, le clip est rendu **image par image** à 30 i/s
(fluide quelle que soit la machine) ; sinon, en temps réel. Fichier `voyage-spatial_<système>_<plan>.webm`, ≈ 11 Mo pour
un plan de 13 s en 1080p : utilisable comme vidéo dans les slides Claude (20 Mo au plus). Publiée comme page Claude, la présentation
propose le clip à l'enregistrement (le visiteur confirme).

### Qualité automatique

La résolution s'adapte (50 à 100 %, plafond ~1080p), puis les effets coûteux (MSAA, profondeur de champ, traînée) si la
machine peine ; ils reviennent dès qu'elle a de la marge.

## Publication

La présentation est publiée par GitHub Pages, au même endroit que le jeu : les pages de `dist/` sont suivies par git,
il suffit de fusionner dans `main`.

| Fichier | Rôle |
|---|---|
| `index.html` | page d'entrée : adresse courte `…/demos/space-travel/presentation/`, aperçu de partage (Open Graph), redirection vers la version compacte en gardant `?…` et `#n` |
| `dist/presentation.min.html` | version publiée (compacte) |
| `dist/presentation.html` | version lisible, identique |
| `media/apercu.jpg` | aperçu de partage 1200 × 630 (`build.py apercu`) |

Après une modification des slides : `python3 build/build.py` (compile, compacte, teste), puis commit et fusion.
