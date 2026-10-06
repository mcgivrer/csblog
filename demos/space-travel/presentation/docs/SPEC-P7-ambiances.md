# Présentation « Voyage Spatial » — lot P7 : ambiances de l'image de fond

## 1. Brief (chef de projet)

**Demande de l'auteur (06/10/2026).** « Ajoute d'autres filtres de rendu, pour des ambiances différentes (uniquement sur
l'image de fond) : sépia, noir & blanc, CRT, cinéma Nolan, IMAX, etc. Tu poses des filtres en fonction de la vue. »

**Décisions de l'auteur.**

| Question | Choix |
|---|---|
| Attribution | une ambiance **par slide**, choisie selon le sujet et le plan |
| Ambiances en plus de Nolan IMAX, Nolan 35 mm, noir & blanc, sépia et CRT | Super 8, Technicolor, vision nocturne, VHS |
| Passage d'une ambiance à l'autre | **sur la coupe** du réalisateur ; les bandes glissent d'un format à l'autre |

**Critères d'acceptation.**

1. Les filtres ne touchent que l'image de fond (WebGL) : textes, illustrations et schémas des slides restent intacts.
2. Chaque slide déclare son ambiance (`data-ambiance`) ; elle s'applique au moment de la coupe, jamais avant ; s'il n'y a
   pas de coupe (plan de moins de 2,5 s), l'ambiance attend la coupe, faite dès que le plan atteint 2,5 s ; vers un
   chapitre, elle arrive avec le nouveau système, après le noir.
3. Le format suit l'ambiance (bandes 2.39, 2.20, 1.90, 1.85 ou plein cadre) et glisse en ≈ 0,4 s ; aucun texte ne
   déborde en 1280 × 720.
4. Touche `A` : ambiance imposée à toutes les slides, en boucle, puis retour à celle de chaque slide ; `?look=…` impose
   une ambiance à tout le deck.
5. Coût maîtrisé : aucune passe de rendu en plus (tout est dans la passe de composition), 30 passes au plus par image.

## 2. Spécification technique (architecte)

| Fichier | Rôle |
|---|---|
| `src/photo.js` | 8 ambiances ajoutées à `LOOKS` (poids 0 : jamais tirées au hasard en mode `auto`) ; `PH.queueLook(nom)` (appliquée au prochain changement de plan ou de système, `PH.state.pending` en attendant), `PH.setLook(nom)` immédiat ; bandes en fraction de hauteur lissée (`PH.state.barF`) ; effets dans le shader de composition |
| `src/lecteur.js` | ambiance de la slide (`L.ambOf`), mise en attente au changement de slide, coupe différée, touche `A` |
| `src/html/presentation.template.html` | `data-ambiance` sur les 21 slides ; aide (touche `A`) ; gabarit documenté |
| `tests/photo_test.py` | planche des 12 looks sur un même plan (`dist/shots/photo-looks.jpg`) et contrôles par ambiance |
| `tests/lecteur_test.py` | ambiance de chaque slide, attente de la coupe, touche `A` |

**Effets ajoutés au shader de composition** (activés par uniformes, sans coût quand ils valent 0) : monochrome viré
(ombres et hautes lumières), séparation trichrome, exposition, grain à grains plus gros, flottement et pompage du film
(18 images/s), fenêtre de projection arrondie, poussières, rayure, écran cathodique permanent (bombé, lignes, masque
RVB), VHS (lignes instables, commutation des têtes, bavure de chrominance, bande de tracking), oculaire de
l'intensificateur. Le calque derrière le texte reçoit la même ambiance que l'image.

| Ambiance | Clé | Format | Caractère |
|---|---|---|---|
| Nolan IMAX | `imax` | 1.90 | look de base du deck |
| Nolan 35 mm | `nolan35` | 2.39 | anamorphique, flare bleu marqué, grain plus présent, ombres froides, hautes lumières chaudes |
| Noir & blanc | `nb` | 1.90 | pellicule noir et blanc contrastée, grain fin |
| Sépia | `sepia` | 1.85 | monochrome viré brun, noirs levés, vignettage fort, pompage, poussières, rayure |
| Technicolor | `technicolor` | 1.85 | trichrome saturé, primaires séparées |
| Super 8 | `super8` | plein cadre | fenêtre arrondie, couleurs chaudes passées, gros grain, flottement, pompage, poussières |
| CRT | `crt` | plein cadre | écran bombé, lignes de balayage, masque RVB, lueur des phosphores |
| VHS | `vhs` | plein cadre | image molle, chrominance qui bave, lignes instables, tracking, commutation des têtes |
| Vision nocturne | `nuit` | plein cadre | intensificateur vert, bruit fort, halos, oculaire |
| Villeneuve, Kodak 2383, Kubrick 2001 | `denis`, `kodak`, `kubrick` | 2.39, 2.39, 2.20 | looks du lot P3 |

**Ambiances des slides** (selon le propos et le plan) :

| Slides | Ambiance | Raison |
|---|---|---|
| 1, 2, 5, 8, 9, 15, 21 | Nolan IMAX | ouverture, planètes, flotte, mission, chantier, clôture : le look de référence |
| 3, 7, 13, 17 (chapitres) | Nolan 35 mm | intertitres en scope 2.39, comme un générique |
| 4 Une graine, un univers (nébuleuse) | Technicolor | les couleurs de la nébuleuse |
| 6 Des soleils de cinéma (éclipse) | noir & blanc | l'éclipse comme une photographie d'archive |
| 10 La navette de baie | Super 8 | le film de bord d'une manœuvre de tous les jours |
| 11 Le voyage (distorsion, saut) | Kubrick 2001 | le voyage au-delà |
| 12 La radio (IA locale) | CRT | le terminal radio |
| 14 Cinq actes | sépia | la chronique de la compagnie |
| 16 La station (choix du site) | vision nocturne | la reconnaissance du site |
| 18 Le rendu | Villeneuve | l'échelle, désaturée |
| 19 La fabrication | Kodak 2383 | la pellicule de tirage |
| 20 Le moteur se filme lui-même | VHS | le caméscope |

La slide 20 cite désormais les ambiances (« Une ambiance par slide : Nolan IMAX, 35 mm, noir & blanc, sépia, Super 8,
CRT, VHS… ») ; ses notes mentionnent la touche `A`.

## 3. Revue (architecte) et vérification (développeur) — 06/10/2026

- Conforme à la spécification. Précisions :
  - les effets « de surface » (poussières, rayure, bande de tracking, bruit de commutation) sont atténués de 85 % sous
    les calques : le texte reste net ; le bruit de commutation des têtes VHS est discret (bande du bas, sous la légende) ;
  - le grain d'une ambiance monochrome est viré comme l'image (vert pour la vision nocturne, brun pour le sépia) ;
  - `PH.setLook` applique désormais une ambiance tout de suite (sans repasser par le choix du système, donc sans
    mise sous tension CRT parasite) ; le mode `auto` ne tire au hasard que les quatre looks du lot P3 ;
  - bandes : `PH.state.barF` (fraction de la hauteur) glisse à chaque image ; rendu à `dt` nul (tests) : sans glissement.
- Tests :
  - `photo_test` : 12 looks sur un même plan (`dist/shots/photo-looks.jpg`) ; noir & blanc sans couleur, sépia chaud
    (R > V > B), vision nocturne verte, coins noirs du CRT et du Super 8, bandes 2.39 du Nolan 35 mm, plein cadre pour
    CRT, Super 8, VHS et vision nocturne ; coût inchangé (17 à 27 passes) ;
  - `lecteur_test` (version lisible et compacte) : ambiance de chaque slide après la coupe (12 ambiances), attente de
    la coupe sous 2,5 s, touche `A` ; aucun débordement en 1280 × 720 (et 1920 × 1080 au tour des slides) ;
  - `realisateur_test` inchangé, vert.
