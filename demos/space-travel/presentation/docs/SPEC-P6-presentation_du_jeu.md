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
| `src/html/presentation.template.html` | les 18 slides, notes (`<aside class="notes">`), styles des captures, grilles, tableaux, schémas, liens ; vue présentateur incrustée |
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
