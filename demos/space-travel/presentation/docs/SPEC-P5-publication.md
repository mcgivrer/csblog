# Présentation « Voyage Spatial » — lot P5 : finition et publication

## 1. Brief (chef de projet)

**Objectif.** Publier la présentation au même endroit que le jeu : sur GitHub Pages, dans `demos/space-travel/`,
avec une adresse courte et partageable, une page légère et un lecteur robuste.

**Critères d'acceptation.**

1. Adresse courte : `https://mcgivrer.github.io/csblog/demos/space-travel/presentation/` ouvre la présentation (la
   requête et le numéro de slide `#n` sont conservés).
2. Version compacte `dist/presentation.min.html`, produite par le minifieur du jeu ; elle passe le même test que la
   version lisible.
3. Partage : description, aperçu Open Graph / Twitter (image 1200 × 630 de la slide de titre), icône.
4. Robustesse : sans WebGL, les slides restent lisibles et navigables sur un fond fixe à la charte ; contexte WebGL
   perdu puis rétabli : rechargement à la même slide.
5. Présentateur : écran noir (`B` ou `.`), comme dans les logiciels de présentation.
6. Documentation : README de la présentation (publication), README du jeu et du dépôt (lien vers la présentation).

## 2. Spécification technique (architecte)

| Fichier | Rôle |
|---|---|
| `presentation/index.html` | **nouveau** : page d'entrée (métadonnées de partage, redirection vers `dist/presentation.min.html` en gardant `?…` et `#n`) |
| `presentation/media/apercu.jpg` | **nouveau** : aperçu 1200 × 630 (slide de titre), produit par `build.py apercu` |
| `build/build.py` | `package` (minifieur du jeu, `../sources/tools/minify.js`) ; `apercu` ; test de la version compacte |
| `src/html/presentation.template.html` | métadonnées, icône, écran noir, fond de repli sans WebGL |
| `src/lecteur.js` | repli sans WebGL (moteur remplacé par des bouchons inertes), perte de contexte, écran noir |
| `tests/lecteur_test.py` | repli sans WebGL, écran noir, page d'entrée |

Le minifieur du jeu ne compresse que le dernier `<script>` (les modules), three r128 étant déjà minifié ; il demande
`npm install` dans `sources/` (déjà nécessaire pour le jeu). Sans Node, `package` avertit et la version lisible reste
publiable.

Publication : les pages de `dist/` sont suivies par git ; GitHub Pages sert `main` tel quel. Il suffit de fusionner la
branche dans `main` (pull request, comme pour le jeu).

## 3. Revue (architecte) et vérification (développeur) — 06/10/2026

- Conforme à la spécification. Précisions :
  - version compacte : 805 → 741 Ko (three r128, déjà minifié, fait l'essentiel du poids ; GitHub Pages sert les pages
    compressées) ;
  - repli sans WebGL : three r128 journalise « Error creating WebGL context » avant de lever l'erreur ; le lecteur la
    rattrape, remplace moteur, réalisateur, direction photo, qualité et export par des bouchons inertes, masque le
    bouton d'export et l'annonce dans la bande du haut ; le calque passe en CSS (fond sombre et `backdrop-filter`) ;
  - écran noir : le moteur se met en pause 0,7 s après le noir (fin du fondu), reprend là où il était ;
  - aperçu : univers par défaut (`COSMOS`), montage figé (`rz=APERCU-1` : nébuleuse et planète aux lumières de villes),
    sans interface, curseur figé allumé.
- Tests : `lecteur_test.py` passé sur `presentation.html` (30 contrôles) et sur `presentation.min.html` (31, avec la
  page d'entrée) ; ajoutés : écran noir, repli sans WebGL (contexte WebGL refusé), redirection de la page d'entrée.
- Publication : la branche ne peut pas être poussée depuis l'environnement de travail (dépôt hors des dépôts autorisés) ;
  fusion dans `main` par l'auteur, comme pour le jeu.
- Ajout (page Claude privée, 06/10/2026) : la même version compacte, sans squelette HTML, publiée comme page Claude ;
  l'export de clip y passe par la capacité `downloads` (le visiteur confirme l'enregistrement), le lien de
  téléchargement reste utilisé ailleurs ; l'apparition du texte et des calques suit le temps réel (et non le temps de
  simulation, borné à 0,1 s par image) : sur une machine lente, le texte arrive à l'heure.
