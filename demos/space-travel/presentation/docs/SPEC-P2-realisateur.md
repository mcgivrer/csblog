# Présentation « Voyage Spatial » — lot P2 : réalisateur céleste

## 1. Brief (chef de projet)

**Objectif.** Filmer automatiquement l'univers de `cosmos.js`, sans aucun vaisseau pour sujet : des plans dont les
sujets sont les astres eux-mêmes, enchaînés selon une grammaire de cinéma, beaux sous n'importe quelle graine.

**Critères d'acceptation.**

1. Onze types de plans au moins, chacun disponible selon le contenu du système (anneaux, lunes, ceinture, nébuleuses).
2. Grammaire : chaque système s'ouvre sur un plan d'ensemble (approche de l'étoile, croissant, nébuleuse) ; jamais
   deux plans du même type à la suite ; un type au plus une fois par système (sauf le survol) ; 5 à 6 plans par système ;
   le système change par un fondu au noir ; à l'intérieur d'un système, coupe franche ou bref creux au noir.
3. Caméra : jamais dans un astre (étoile, planète, atmosphère, lune, roche) ; aucun à-coup d'orientation en dehors
   des coupes ; focales de 24 à 300 mm (le très long foyer est réservé au plan `lune`).
4. Cadrage : le sujet sur un tiers de l'image, du côté opposé au texte de la slide (`setFraming('left'|'right'|'center')`).
5. Métadonnées par image pour la direction photo (P3) : type de plan, focale, distance de mise au point (et bascule
   de point quand il y a un premier plan), position de l'étoile à l'écran et visibilité, niveau de fondu.
6. Déterministe à graine égale (tests) ; aléatoire à chaque projection sinon.
7. Page `dist/realisateur-test.html` en lecture automatique ; test `tests/realisateur_test.py` en temps virtuel.

## 2. Spécification technique (architecte)

### 2.1 Fichiers

| Fichier | Rôle |
|---|---|
| `presentation/src/realisateur.js` | **nouveau** : `window.__REALISATEUR.create(W, camera, opts)` |
| `presentation/src/realisateur-test.js` + `src/html/realisateur-test.template.html` | page de démonstration |
| `presentation/tests/realisateur_test.py` | test en temps virtuel (sans rendu), puis captures |
| `shared/cosmos.js` | ajout de `W.dropCluster(x)` (retirer un amas d'astéroïdes) |

Le réalisateur reste propre au produit (dans `presentation/src/`) : il n'est pas un module partagé.

### 2.2 Types de plans

| Type | Sujet | Mouvement | Focale |
|---|---|---|---|
| `etoile` | l'étoile : couronne, protubérances, éruptions | approche en arc de 16 à 10 rayons stellaires | 35–50 |
| `croissant` | planète à contre-jour, l'étoile dans le cadre (alignement « 2001 ») | lente avancée | 24–28 |
| `nebuleuse` | une planète au bas du cadre, une nébuleuse au-dessus | panoramique lent | 24–35 |
| `survol` | planète, du jour vers le terminateur | arc de 1,2 rad autour de la planète | 35–50 |
| `terminateur` | planète habitée : lumières des villes, ligne de l'aube | orbite lente vers la nuit | 35–50 |
| `limbe` | horizon en rase-mottes, l'étoile qui se lève | glissé vers l'étoile (lever de soleil) | 24–28 |
| `anneaux` | plan rasant sur les anneaux, la géante au fond | travelling tangent | 28–35 |
| `lune` | lune devant sa planète (compression au téléobjectif : la lune paraît 0,5 à 0,7 fois la planète), bascule de point ; lune trop lointaine : la lune au premier plan | travelling latéral, la lune traverse le disque | adaptée, ≤ 300 |
| `eclipse` | l'étoile derrière la planète : couronne, anneau d'atmosphère, « bague de diamant » à la fin | glissé latéral | selon la taille apparente |
| `ceinture` | amas d'astéroïdes, fragments au premier plan, bascule de point | passage entre les roches | 28–50 |

Ouvertures : `etoile`, `croissant`, `nebuleuse`. Fermetures préférées : `croissant`, `eclipse`, `nebuleuse`, `lune`.

### 2.3 Temps, transitions, cadrage

- Durée d'un plan : 8 à 14 s selon le type. Système : 5 à 6 plans, environ 1 min.
- Coupe franche (80 %) ou creux au noir de 0,5 s (20 %) entre deux plans ; fondu au noir 0,9 s + 0,35 s de noir +
  0,9 s entre deux systèmes (le nouveau système est construit pendant le noir).
- Tiers : rotation de la caméra autour de son axe vertical de `atan(tan(hfov/2)/3)` ; plans centrés : `etoile`,
  `croissant`, `eclipse`. `auto` alterne gauche et droite.
- Focale → champ vertical : `2·atan(12 mm / f)` (capteur plein format).

### 2.4 API

```js
const D = __REALISATEUR.create(W, camera, { seed, systems: 6, framing: 'auto' });
D.update(dt)            // avant W.update : plan courant, caméra, métadonnées ; change de système pendant le noir
D.cut()                 // coupe immédiate vers le plan suivant (synchronisation avec un changement de slide, P4)
D.nextSystem()          // fondu au noir vers le système suivant
D.setFraming(side)      // côté du TEXTE : le sujet va dans le tiers opposé
D.meta                  // { type, label, focal, fov, subject, focus, focusNear, rack, star: { ndc, onScreen, vis }, fade, k, seq, system }
D.log                   // plans joués : { seq, type, subject, dur, system }
```

### 2.5 Sécurité caméra

Chaque position est repoussée hors des sphères de garde : étoile 1,15 Rs ; planète 1,02 R (au-dessus de l'atmosphère
et des nuages) ; lune 1,3 r ; roche 2,5 r. Pour une planète à anneaux, distance minimale 1,08 × rayon externe des
anneaux (sauf `anneaux`, qui reste au-delà du bord externe). La visée est lissée sur tout le plan (pas de saut).

### 2.6 Vérification

`python3 tests/realisateur_test.py dist/realisateur-test.html` : 3 systèmes en temps virtuel à 30 i/s (sans rendu),
contrôle à chaque image (garde, vitesse angulaire hors coupes, valeurs finies), contrôle de la grammaire sur le
journal, puis une capture au milieu de chaque plan (planche dans `dist/shots/`).

## 3. Revue (architecte) et vérification (développeur) — 06/10/2026

- Écarts à la spécification, approuvés :
  - `D.play(type, planète?)` ajouté : joue un type précis par une coupe franche ; servira à donner une ambiance à
    chaque slide (P4) et permet au test de couvrir les dix types, quel que soit le tirage ;
  - `lune` n'est proposé que si la composition au téléobjectif tient sous 300 mm (lune côté jour, caméra au-delà de la
    lune, lune ≈ 0,5 à 0,7 fois la planète) : les lunes très éloignées des planètes telluriques donnaient une planète
    minuscule ; plan magnifique sur les géantes (lune qui traverse le disque et ses anneaux) ;
  - `croissant` : l'étoile est placée juste au-delà du limbe (4 à 9°), planète plus grande ;
  - `nebuleuse` : de préférence une planète sans anneaux (cadre trop chargé sinon).
- Test `tests/realisateur_test.py` : 3 systèmes, ~5 900 images en temps virtuel, 19 contrôles verts — dont caméra
  jamais dans un astre (marge minimale 2 % sur le plan `limbe`, par construction), vitesse angulaire maximale
  0,17 rad/s hors coupes, focales 26 à 97 mm sur le tirage du test, les dix types joués à la demande.
