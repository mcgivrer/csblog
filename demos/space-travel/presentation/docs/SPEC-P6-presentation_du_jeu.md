# Présentation « Voyage Spatial » — lot P6 : présentation du jeu

## 1. Brief (chef de projet)

**Objectif.** Remplacer les trois slides de démonstration par la présentation du jeu, de son but, de ses concepts, de la
campagne en construction et de son moteur, sur le socle P1 à P5.

**Décisions de l'utilisateur (06/10/2026)**, sur le brouillon [`BROUILLON-slides-jeu.md`](BROUILLON-slides-jeu.md) :
17 slides recommandées, plus la slide « station » du chapitre campagne, soit 18 ; campagne en chapitre avec les
maquettes de SPEC-010 ; publication à la place de la démonstration ; vue présentateur avec les notes.

**Critères d'acceptation.**

1. 18 slides en 5 parties (ouverture, univers, métier, campagne, moteur, clôture), chacune pilotant le réalisateur
   (côté, plan, fondu de chapitre).
2. Illustrations dans les calques : captures du jeu, rendus de planètes (fond transparent), maquettes, trois schémas
   SVG à la charte (mission, tranches de profondeur, fabrication) ; images intégrées au fichier publié.
3. Aucun texte ne déborde de l'image en 1280 × 720 ni en 1920 × 1080.
4. Vue présentateur (`S`) : notes, slide suivante, minuteur, flèches ; fenêtre séparée, ou incrustée si le navigateur
   refuse la fenêtre (cas des pages Claude).

## 2. Spécification technique (architecte)

| Fichier | Rôle |
|---|---|
| `src/html/presentation.template.html` | les slides (18, puis 21), notes (`<aside class="notes">`), styles des captures, grilles, tableaux, schémas, liens ; vue présentateur incrustée |
| `src/lecteur.js` | vue présentateur : fenêtre séparée (`window.open`, document écrit par le lecteur, mêmes raccourcis) ou incrustée ; liens cliquables sans changer de slide |
| `build/build.py` | `inline_images` : `src="media/…"` et `src="../docs/…"` deviennent des data URI (type selon l'extension) |
| `media/illustrations/` | captures du jeu v2.17, rendus de planètes en WebP transparent |
| `tests/lecteur_test.py` | indépendant du contenu du deck ; ajouts : images intégrées, vue présentateur (fenêtre, incrustée), débordement sur toutes les slides |

Poids : la page publiée passe de 0,8 à 1,5 Mo (images ≈ 0,7 Mo encodées).

## 3. Revue (architecte) et vérification (développeur) — 06/10/2026

- Écarts approuvés : rendus de planètes détourés (le rendu d'origine avait un fond opaque) ; graduations du schéma des
  tranches décalées sur deux lignes ; le test de la règle des 2,5 s retire le plan de la slide visée (toutes les
  slides du jeu ont un plan ou un fondu de chapitre).
- Test `lecteur_test.py` : 38 contrôles verts sur `presentation.html`, 39 sur `presentation.min.html` (page d'entrée) ; 18 slides sans débordement en 1280 × 720 et
  1920 × 1080 ; vue présentateur en fenêtre et incrustée ; 11 images intégrées et chargées.

## 4. Ajout : version complète, 21 slides (06/10/2026)

**Demande de l'utilisateur** : ajouter les slides 6, 10 et 20 du brouillon, d'abord écartées.

| Slide | Titre | Plan | Illustration |
|---|---|---|---|
| 6 | Des soleils de cinéma (chapitre 01) | éclipse | trois vignettes 12:5 recadrées des captures de la démo « Observation des étoiles » (taches, éruption au limbe, éclipse totale par une lune), sans l'interface de la démo |
| 10 | La navette de baie (chapitre 02) | survol | capture `stt217-navette-pile.jpg`, quatre étapes, deux chiffres (97 s, ≤ 8 m/s) |
| 20 | Le moteur se filme lui-même (chapitre 04) | lune | schéma D4 : moteur allégé → réalisateur → direction photo → lecteur → écran ou clip |

- Styles ajoutés : `.vignettes` (grille de trois images), `.etapes` (étapes numérotées, sans puce) ; les captures
  (`img.capture`) ne s'étirent plus sur toute la largeur du calque : le cadre épouse l'image.
- Corrections : espaces insécables dans « 61 m » et « 237 m » (slide « La flotte ») ; « lui-même » ne se coupe plus
  au trait d'union.
- Notes de l'orateur des trois slides tirées des sources : `shared/stars.js` et le README de la démo (soleils),
  `sources/src/JS/game/20p-navette.js` (navette : vitesses de pointe, trajet dans le repère du vaisseau).

## 5. Ajout : l'éditeur STT Modules sur la slide 15 (06/10/2026)

**Demande de l'utilisateur** : remplacer la maquette de la spécification (`chantier.svg`) par une image de l'éditeur
issu de `STT_modules`, le chantier naval.

- Capture `media/illustrations/stt-editeur-meridian.jpg` (1280 × 720) : onglet Éditeur, STT Meridian ouvert depuis la
  galerie (6 pièces, 108,1 m, 1 191 t), barre des modules ; prise sous Playwright, l'éditeur servi en local.
- Mention : « Éditeur STT Modules · base du chantier naval, lot L2 (v2.20) » ; notes de l'orateur mises à jour (export
  « Pour le jeu », import au hangar).
- Le fond de la présentation profite du correctif des lunes (`shared/asteroids.js` : la géométrie partagée des lunes
  n'est plus aplatie comme celle d'un astéroïde).

