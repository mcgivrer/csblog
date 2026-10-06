# Voyage Spatial — brouillon des slides « le jeu et son moteur »

Brouillon v1 du 06/10/2026, à valider avant intégration dans le lecteur (`src/html/presentation.template.html`).

## Cadre

- **Sujet** : le jeu (son but, ses concepts), son univers, la campagne en cours de construction, et le moteur. Le fond de
  chaque slide est la cinématique temps réel du moteur (look Nolan IMAX), sans vaisseau.
- **Public supposé** : curieux et développeurs (blog csblog, réseaux, rencontres techniques). Aucune connaissance du jeu
  requise.
- **Version présentée** : `stt_v2.18.0` (main, 05/10/2026). La campagne complète (v3.0) est présentée comme feuille de
  route, avec les maquettes de SPEC-010.
- **Deux longueurs** : version complète de 21 slides (≈ 20 à 25 min) ; version courte de 13 slides marquées ★, sans
  intercalaires (≈ 12 min).
- **Chaque fiche** donne la mise en page, le côté du texte (le sujet du fond se place dans le tiers opposé), le plan
  demandé au réalisateur, le calque, le texte de la slide (en citation), l'illustration et des notes pour l'orateur.

Les choix à arbitrer sont regroupés en fin de document (§ Propositions).

---

## Ouverture

### 1 ★ — Titre

`layout-titre` · texte à gauche · plan : ouverture du premier système · sans calque

> // csblog · simulation spatiale
>
> # Voyage Spatial
>
> Transporteur de fret dans un univers procédural à l'échelle réelle, jouable dans un onglet de navigateur.
>
> Space Travel & Transport · v2.18 · Frédéric Delorme

**Illustration** : aucune. Le fond est le moteur du jeu, en direct.

**Notes** : commencer par signaler que tout ce qui défile derrière est calculé en temps réel par le moteur du jeu,
avec la même graine que la partie de démonstration.

### 2 ★ — Le but du jeu

`layout-contenu` · texte à gauche · plan : survol · calque normal

> // 00 · le principe
>
> ## Piloter un cargo, livrer, prospérer
>
> - **Accepter une mission** au port : fret, passagers ou eau, avec une prime et un niveau de risque.
> - **Voler jusqu'à destination** : transfert accéléré, approche finale au manche, mise en orbite.
> - **Livrer** par la navette de la baie et encaisser la prime.
> - **Réinvestir** : carburant, propulseurs, générateur de saut, nouveau vaisseau.
>
> **1** fichier HTML · **4** langues · **1** graine = 1 univers

**Notes** : depuis la v2.18, deux modes. *Partie libre* : tous les vaisseaux, sans sauvegarde. *Campagne* : départ sur
le Courlis avec 4 000 CR, et la partie est sauvegardée. Principe de conception : piloter reste
le plaisir central.

---

## Chapitre 01 — L'univers

### 3 — Intercalaire

`layout-chapitre` · texte à gauche · fondu au noir vers le système suivant

> 01
>
> ## Un univers à l'échelle réelle

### 4 ★ — Une graine, un univers

`layout-contenu` · texte à droite · plan : nébuleuse · calque léger

> // 01 · l'univers
>
> ## Tout naît d'une seule graine
>
> - Le champ d'étoiles est généré par cellules, à mesure qu'on avance : jamais tout l'univers en mémoire.
> - Les étoiles suivent la physique : classe spectrale, couleur du corps noir, magnitude apparente.
> - Chaque système est réalisé en mètres réels : zone habitable, lunes, anneaux, ceintures, ports.
> - Même graine, même univers : noms, planètes et ports se retrouvent à l'identique.
>
> *Le décor derrière ce texte est calculé en direct par le moteur du jeu.*

**Illustration** : aucune, le fond suffit.

**Notes** : générateur `xmur3` + `mulberry32`, une graine dérivée par usage (étoile, système, lunes…). Jusqu'à quatre
systèmes construits à la fois.

### 5 ★ — Six natures de planètes

`layout-illustration` · texte à droite · plan : limbe · calque normal

> // 01 · les planètes
>
> ## Six natures de planètes
>
> | | | |
> |---|---|---|
> | ![Océanique](../media/illustrations/planete-oceanique.webp) **Océanique** · surface immergée, habitable | ![Continentale](../media/illustrations/planete-continentale.webp) **Continentale** · terres et océans, habitable | ![Désertique](../media/illustrations/planete-desertique.webp) **Désertique** · aride, atmosphère ténue |
> | ![Glacée](../media/illustrations/planete-glacee.webp) **Glacée** · calottes et banquises | ![Volcanique](../media/illustrations/planete-volcanique.webp) **Volcanique** · coulées de lave, sans atmosphère stable | ![Géante gazeuse](../media/illustrations/planete-geante-gazeuse.webp) **Géante gazeuse** · bandes, parfois des anneaux |
>
> Surfaces procédurales, trois couches de nuages, atmosphère, aurores et villes de nuit. Rendus réels du shader du jeu.

**Illustration** : 6 rendus du shader de planètes (fond transparent, 400 px).

### 6 — Des soleils de cinéma *(optionnelle)*

`layout-illustration` · texte à gauche · plan : éclipse · calque normal

> ## Des soleils de cinéma
>
> ![Éruptions et éclipses](../../docs/illustrations/solare-flares-and-eclipse-1.jpeg)
>
> - Couronne, taches, éruptions.
> - Éclipses : la planète passe devant son étoile et son atmosphère s'allume.

**Notes** : slide à garder si le public aime le rendu ; le fond la montre déjà souvent.

---

## Chapitre 02 — Le métier de transporteur

### 7 — Intercalaire

`layout-chapitre` · texte à gauche · fondu au noir vers le système suivant

> 02
>
> ## Le métier de transporteur

### 8 ★ — Dix vaisseaux

`layout-illustration` · texte à gauche · plan : anneaux · calque normal

> // 02 · la flotte
>
> ## Dix vaisseaux générés
>
> ![Hangar : la Banquise](../media/illustrations/stt217-selection-vaisseau.jpg)
>
> - Du pousseur Mistral (61 m) au cargo-poutre Longue-Échine (237 m).
> - Construits en chaîne : proue, habitat, section moteur de 2 à 6 tuyères.
> - Quatre long-courriers : anneaux de distorsion et générateur de saut.

**Notes** : en campagne, on part du Courlis, un vaisseau modulaire de palier I (4 conteneurs), qu'on agrandit au
chantier naval.

### 9 ★ — Une mission, de l'offre à la prime

`layout-illustration` · texte à droite · plan : croissant · calque fort

> // 02 · une mission
>
> ## De l'offre à la prime
>
> **Schéma D1 (à dessiner)** : Tableau des missions → **Transfert** (pilote automatique, temps × 300 à × 900) →
> **Approche finale** (au manche, couloir de portiques) → **Orbite** (≈ 8 km/s) → **Navette de baie** (≈ 97 s
> aller-retour) → **Prime**
>
> ![Approche finale](../media/illustrations/stt217-approche-orbite.jpg)
>
> 5 natures de fret : la couleur du conteneur dit la nature. Une mission locale dure 71 à 142 s.

**Notes** : les 71 et 142 s viennent du chronométrage du lot L0 (Courlis et e18). Alternative d'illustration : le port
en anneau (`stt217-port-anneau.jpg`).

### 10 — La navette de baie *(optionnelle)*

`layout-illustration` · texte à gauche · plan : survol · calque normal

> ## La navette de baie
>
> ![Navette sur la pile](../media/illustrations/stt217-navette-pile.jpg)
>
> 01 Sortie de baie · 02 Prise d'un conteneur ISO 20' sur la pile · 03 Livraison · 04 Retour en baie
>
> **97 s** aller-retour · **≤ 8 m/s** le long de la coque

### 11 ★ — Changer de système

`layout-illustration` · texte à droite · plan : étoile · calque normal

> // 02 · le voyage
>
> ## Distorsion et saut
>
> ![Belle-Étoile en distorsion, avec l'interface du jeu](../media/illustrations/stt217-supraluminique.jpg)
>
> - Carburant consommé en Δv réel, plein payé au port.
> - Distorsion : croisière de × 5 à × 10 selon la masse en charge.
> - Saut quantique vers une étoile choisie sur la carte (touche M).

**Notes** : la capture montre aussi l'interface complète (plan de vol, objet le plus proche, radio, propulsion) : bon
moment pour montrer à quoi ressemble une partie.

### 12 ★ — Une radio écrite par une IA locale

`layout-contenu` · texte à gauche · plan : terminateur · calque normal

> // 02 · la radio
>
> ## Une IA locale écrit la radio
>
> `[MIR-47]` Navette 2 larguée, cap sur le port.
> `[Contrôle]` Autorisation accordée, trajectoire propre.
>
> - Gemini Nano, intégré à Chrome, réécrit les répliques sur la machine du joueur, sans réseau.
> - Deux personnages, deux tons : le capitaine et la tour de contrôle.
> - Pas d'IA, ou plus de 2 s d'attente : le jeu reprend ses répliques écrites, sans rupture.
> - **Le jeu décide, le LLM raconte** : chances, prix et résultats restent calculés par le jeu.

**Illustration** : l'échange radio, mis en forme comme le panneau du jeu (texte, pas d'image).

---

## Chapitre 03 — La campagne

### 13 — Intercalaire

`layout-chapitre` · texte à gauche · fondu au noir vers le système suivant

> 03
>
> ## De l'indépendant à la compagnie
>
> La campagne, de la v2.18 à la v3.0

### 14 ★ — Cinq actes

`layout-contenu` · texte au centre · plan : nébuleuse · calque fort

> // 03 · la campagne
>
> ## Cinq actes, sans victoire imposée
>
> | Acte | Vers | Ce qui s'ouvre |
> |---|---|---|
> | I · Indépendant | 0 h | un vaisseau, missions locales, chantier naval |
> | II · Armateur | 1 h 45 | deuxième vaisseau, premier capitaine, missions entre systèmes |
> | III · Compagnie | 4 h | trois vaisseaux, sigle et livrée, choix d'un site |
> | IV · Base | 6 h | station fondée, laboratoire, chantier à domicile |
> | V · Expansion | 9 h | industrie, deuxième station, contrats stratégiques |
>
> Trois boucles imbriquées : la mission (5 à 10 min), la flotte (30 à 60 min), la compagnie (des heures).

**Notes** : la v2.18 livre le socle (choix Campagne ou Partie libre, départ sur le Courlis, sauvegarde). Les heures
sont des cibles d'équilibrage, à calibrer en jeu. Des objectifs de compagnie servent de jalons (flotte de 6, 1 M CR de
valeur…).

### 15 ★ — Ce qu'on assemble est ce qu'on pilote

`layout-illustration` · texte à gauche · plan : anneaux · calque normal

> // 03 · le chantier naval
>
> ## Ce qu'on assemble est ce qu'on pilote
>
> ![Maquette : chantier naval](../../docs/specs/img/spec010/chantier.svg)
>
> - La masse pèse sur l'accélération et sur le carburant.
> - Le palier fixe l'équipage et le poste d'amarrage ; le palier III ouvre le saut.
> - Flotte hybride : on pilote l'amiral, les autres vaisseaux suivent des ordres, à 65 % du rendement d'un vaisseau piloté.
>
> *Maquette · lot L2 (v2.20)*

### 16 — Recherche, puis une station *(optionnelle)*

`layout-illustration` · texte à droite · plan : limbe · calque normal

> ## Recherche, puis une station
>
> ![Maquette : choix du site de la station](../../docs/specs/img/spec010/station-site.svg)
>
> - Six branches de quatre paliers : Voyage, Transport, Énergie, Sécurité, Industrie, Organisation.
> - Les missions rapportent des points de recherche ; les technologies ouvrent des missions plus complexes.
> - Trois vaisseaux et l'Ingénierie orbitale : on fonde sa station sur un site choisi parmi 3 à 5 planètes notées, et
>   sa propre flotte la construit.
>
> *Maquettes · lots L4 et L5 (v2.22, v2.23)*

**Notes** : variante d'illustration, l'arbre technologique (`technologie.svg`).

---

## Chapitre 04 — Le moteur

### 17 — Intercalaire

`layout-chapitre` · texte à gauche · fondu au noir vers le système suivant

> 04
>
> ## Le moteur
>
> Du mètre à la galaxie, dans un seul fichier

### 18 ★ — Du mètre à la galaxie

`layout-illustration` · texte à gauche · plan : anneaux · calque fort

> // 04 · le rendu
>
> ## Du mètre à la galaxie
>
> **Schéma D2 (à dessiner)** : axe logarithmique de 0,2 m à 1,3 × 10¹⁹ m, découpé en six tranches de profondeur
> (0,2 m · 400 m · 800 km · 1,6 M km · 3,2 × 10¹² m · 6,4 × 10¹⁵ m · 1,3 × 10¹⁹ m), et les deux couches : la galaxie
> (1 unité = 1/38 parsec), le système (en mètres).
>
> - Deux couches de rendu : la galaxie, puis le système en mètres.
> - Origine flottante : la précision reste au centimètre près du vaisseau, même à 10¹¹ m de son étoile.
> - Six tranches de profondeur, rendues de la plus lointaine à la plus proche.

**Notes** : c'est la réponse au manque de précision des nombres flottants du GPU (32 bits) à ces échelles. Les tranches
vides sont sautées.

### 19 ★ — Un jeu, un fichier

`layout-illustration` · texte à droite · plan : survol · calque normal

> // 04 · la fabrication
>
> ## Un jeu, un fichier
>
> **Schéma D3 (à dessiner)** : 70 modules JavaScript (ordre fixé) + données JSON + three.js r128 → `build.py` →
> `space-travel.html`, ≈ 6 Mo
>
> - Aucun serveur, aucune installation : on ouvre le fichier et on joue.
> - Des modules partagés entre le jeu, la démo « Observation des étoiles » et cette présentation.
> - 547 contrôles automatisés (Playwright et Node) à chaque version.

**Notes** : la nouvelle couche de simulation de campagne (`sim/`) n'utilise ni three.js ni le DOM : elle se teste sous
Node. Le développement suit un mode agentique documenté (chef de projet, architecte, développeur), visible sur le Kanban
du dépôt.

### 20 — Le moteur se filme lui-même *(optionnelle)*

`layout-illustration` · texte à gauche · plan : lune · calque fort

> ## Le moteur se filme lui-même
>
> **Schéma** (repris de la slide de démonstration actuelle) : moteur allégé → réalisateur → direction photo → lecteur
>
> - Aucun vaisseau dans le fond : seulement l'espace, ses étoiles et ses planètes.
> - Dix types de plans ; à chaque slide, une coupe, et le sujet à l'opposé du texte.
> - Look Nolan IMAX : bandes 1.90, flare discret, grain fin, profondeur de champ.

---

## Clôture

### 21 ★ — À vous de piloter

`layout-contenu` · texte au centre · plan : croissant · calque léger

> ## À vous de piloter
>
> **Jouer** : mcgivrer.github.io/csblog/demos/space-travel/sources/target/space-travel.min.html
>
> **Sources** (licence MIT) : github.com/mcgivrer/csblog, dossier `demos/space-travel`
>
> **Feuille de route** : v2.19 Console · v2.20 Chantier · v2.21 Flotte et équipages · v2.22 Technologies · v2.23 Station
> · v2.24 Marché et missions · v3.0

---

## Illustrations

| Slide | Fichier | Origine | État |
|---|---|---|---|
| 5 | `media/illustrations/planete-*.webp` (6) | rendus du shader de planètes du jeu (v2.17) | prêts |
| 6 | `../docs/illustrations/solare-flares-and-eclipse-1.jpeg` | captures de la démo « Observation des étoiles » | dans le dépôt |
| 8 | `media/illustrations/stt217-selection-vaisseau.jpg` | capture du jeu v2.17 | prête |
| 9 | `media/illustrations/stt217-approche-orbite.jpg` (+ `stt217-port-anneau.jpg`) | captures du jeu v2.17 | prêtes |
| 10 | `media/illustrations/stt217-navette-pile.jpg` | capture du jeu v2.17 | prête |
| 11 | `media/illustrations/stt217-supraluminique.jpg` | capture du jeu v2.17, interface complète | prête |
| 15 | `../docs/specs/img/spec010/chantier.svg` | maquette SPEC-010 | dans le dépôt |
| 16 | `../docs/specs/img/spec010/station-site.svg` (ou `technologie.svg`) | maquettes SPEC-010 | dans le dépôt |
| 9 | schéma D1 : déroulé d'une mission | à dessiner en SVG, à la charte | à faire |
| 18 | schéma D2 : tranches de profondeur | à dessiner en SVG | à faire |
| 19 | schéma D3 : du code au fichier unique | à dessiner en SVG | à faire |
| 20 | schéma du lecteur | slide de démonstration actuelle | à adapter |

Les images seront intégrées au fichier publié (data URI, environ 0,9 Mo de plus) : la page reste autonome, sur GitHub
Pages comme en page Claude.

## Propositions

| # | Question | Options | Recommandation |
|---|---|---|---|
| 1 | Longueur | A. complète, 21 slides · B. courte, 13 slides ★ · C. courte + intercalaires, 17 slides | **C** : le rythme des chapitres, sans les slides optionnelles |
| 2 | Campagne (v3.0 à venir) | A. un chapitre avec maquettes (slides 13 à 16) · B. une seule slide « feuille de route » · C. ne pas en parler | **A** : c'est la direction du jeu, et les maquettes sont parlantes |
| 3 | Illustrations | A. captures et maquettes dans les calques (+ 0,9 Mo) · B. fond seul et schémas SVG (page plus légère, moins concrète) | **A** : le public veut voir le jeu, pas seulement son décor |
| 4 | Publication | A. remplacer les 3 slides de démonstration (même adresse, même page Claude) · B. une deuxième page `jeu.html`, la démonstration reste le gabarit | **A** : une seule présentation à tenir à jour ; le gabarit reste documenté dans le README |
| 5 | Notes de l'orateur | A. vue présentateur (touche `S` : notes, slide suivante, minuteur) · B. pas de notes à l'écran | **A** si tu présentes en public ; effort modéré |
