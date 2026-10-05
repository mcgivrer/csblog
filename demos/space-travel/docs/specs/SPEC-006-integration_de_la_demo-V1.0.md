# Space Travel & Transport v2.16 — intégration de la démo « Observation des étoiles » v7.2.2

Document de référence de la fusion démo → jeu. Base : `space-travel.html` **v2.16** (26/09/2026).

## 1. Point de départ

La v2.16 a déjà intégré la démo jusqu'à sa v4 : générateur de vaisseaux (10 modèles, v2.13),
planètes et astéroïdes détaillés, quadrillage d'espace-temps du saut, traînées supraluminiques,
résolution dynamique. Elle a en propre : croisière supraluminique ×5–10 selon la masse (v2.15),
saut quantique acheté 18 000 cr et carte 3D (§23), carburant (§22), économie, radio Gemini Nano,
pause, tactile, sélecteur provisoire.

Reste à intégrer (démo v5 → v7.2.2) : soleils « cinéma », **échelle réelle** (rendu en couches,
origine flottante, tranches de profondeur, temps accéléré), vieillissement et livrées, moteurs
réalistes et tuyères orientables, hublots/baies/hangars réalistes, baies à champ de force et
petits engins, carte 2D et radar, profondeur de champ, tremblement de caméra, barre de
chargement, textures HD, anneaux en rotation, départ en distorsion, corrections v7.2.2.

Les modules de la démo sont des greffons posés sur le moteur du jeu (`__SHIPWEAR`,
`__SHIPDRIVE`, `__SHIPGLASS`, …) : même procédé que la section 7quater de la v2.16.
**Sources requises : `observation-des-etoiles-v7.2.2-projet.zip`** (absent du projet à ce jour).

## 2. Décisions

| Sujet | Décision |
|---|---|
| Périmètre | Parité complète avec la démo |
| Échelle | Migration complète en échelle réelle (deux couches : champ galactique + système en mètres) |
| Ordre | **Échelle réelle d'abord**, greffons visuels ensuite |
| Modèles sans saut ni distorsion (6/10) | **Progression** : commerce local dans le système jusqu'à l'achat d'un long-courrier |
| Carte | **Carte 2D de la démo** (secteur · système · orbite) + **ciblage de saut du jeu** (§23) |
| Usure | Progressive, réappliquée par paliers (à chaque escale) |
| Sélecteur | Devient la boutique du chantier naval (statistiques de jeu par modèle) |
| Trafic | Ambiant, avec concurrence et escorte (niveau intermédiaire, sans combat) |
| Saut | Séquence de la démo (géode, charge, repli, éclair, onde) |
| Pilotage | Automatique pendant les transferts accélérés, manuel dans les phases en temps réel (approche, orbite) |
| Orbite de livraison | Arc en temps réel (≈ 36 s d'une orbite basse de 90 min) : minutages radio inchangés |
| Portiques | Couloir holographique sur l'approche finale, à l'échelle de la planète |

Conséquence de la progression : trois paliers cohérents avec les rangs I–IV déjà présents —
commerce local (vaisseau de départ) → long-courrier (distorsion) → module de saut quantique (§23).

## 3. Architecture

- Greffons de la démo intégrés tels quels, chacun dans son espace de noms, raccordés par un
  **adaptateur de contexte** qui fournit ce que `cine.js` fournit dans la démo (direction et
  couleur de l'étoile, temps, âge, chaleur des tuyères, champ des anneaux).
- Échelle réelle : rendu en couches repris de `cine.js` ; propre au jeu : transferts
  accélération/freinage dans le système (temps ×300–900), supraluminique obligatoire entre
  étoiles, carburant recalibré (réservoir exprimé en Δv plutôt qu'en unités compressées).
- Copies v4 déjà présentes (planètes, astéroïdes, effets de saut) : **remplacées** par les
  versions de la démo, jamais empilées.
- Sources dans `src/`, page unique assemblée par `build.py` (voir §5).

## 4. Lots

| Lot | Contenu | Dépend de |
|---|---|---|
| L1 | Sources + build + tests ✅ ; adaptateur de contexte, barre de chargement et pré-compilation des shaders | — |
| L2 ✅ | Échelle réelle : rendu en couches, temps accéléré, transferts, supraluminique obligatoire, carburant, HUD, radio | L1, zip |
| L3 ✅ | Commerce local et progression : contrats dans le système, vaisseau de départ, boutique du chantier naval | L2 |
| L4 ✅ | Carte 2D de la démo + ciblage de saut du jeu (carte 3D conservée hors échelle réelle) | L2 |
| L5 ✅ | Saut et distorsion de la démo (géode, départ violet, règles v7.2.2) | L2 |
| L6 ✅ | Greffons vaisseau : moteurs, usure et livrées, textures HD, anneaux, tremblement | L1 |
| L7 ✅ | Hublots, baies et hangars réalistes | L1 |
| L8 | ~~Soleils « cinéma »~~ — absorbé par L2.2 | — |
| L9 | Trafic, petits engins, baies à champ de force, concurrence et escorte, radar — **spécifié** : [`SPEC-007-l9_trafic_concurrence_escorte_jeu-V1.0.md`](SPEC-007-l9_trafic_concurrence_escorte_jeu-V1.0.md), [`SPEC-007-l9_trafic_concurrence_escorte_technique-V1.0.md`](SPEC-007-l9_trafic_concurrence_escorte_technique-V1.0.md) | L2, L4 |
| L10 ✅ | Profondeur de champ, gros plans | L6 |

## 4 bis. Avancement du lot 2

**Compatibilité vérifiée** : les 371 globaux du moteur v2.15 piloté par la démo existent tous dans la
v2.16 (388) ; les 17 ajouts de la v2.16 sont les copies v4 de la démo, à remplacer. Dans la démo, la
couche galactique reste en unités du jeu : champ d'étoiles, nébuleuses, décor, itinéraires et carte
du §23 ne changent pas ; seul le système passe en mètres.

**L2.1 livré — deux couches, mêmes unités.** Module `05b-couches-de-rendu.js` (repris de
`renderLayers` de cine.js) : couche galactique = scène d'origine ; couche système (`LAYERS.sysScene`,
groupes `sysWorld` et `shipWorld`) en origine flottante et tranches de profondeur. Raccordés : vaisseau,
systèmes planétaires, portiques, navettes, conteneurs et traînées, quadrillage de saut et traînées
supraluminiques, lumière du soleil local, passe de lentille. Uniformes en coordonnées monde passés dans
le repère de rendu (portiques, atmosphères, traînées).
Validation (temps virtuel, même graine, même état de simulation) : 0,10–0,14 % de pixels différents
avec la v2.16, uniquement aux occultations entre couches ; 293 → 303 appels de dessin (+3 %).

**L2.2 livré — système en mètres, derrière `?echelle=reelle`.** Sans ce paramètre, le jeu reste la
v2.16 (comparaison d'images inchangée). Avec : module `20c-echelle-reelle.js` (fonctions de passage à
l'échelle réelle reprises telles quelles de cine.js), copies v7.2.2 de `planets.js`, `asteroids.js`
(espaces de noms `__PLANETS_R`, `__AST_R`) et `stars.js` dans `src/JS/demo/` ; 6 tranches de la démo
avec rendu des seules tranches occupées ; caméra galactique à la position galactique du vaisseau ;
étoile hôte masquée dans le champ et dessinée à taille réelle par stars.js ; vaisseau à sa taille réelle ;
HUD en m/s, km, ua, al. Le vaisseau est posé au point d'arrivée de la première étape (32–60 rayons),
rotation libre : le vol, la carte et le saut à l'échelle réelle arrivent avec L2.3 et L2.4.
Mesures (seed L22-TEST) : planète habitable R = 7 230 km à 0,886 ua (√L = 0,915 ua), vaisseau à
45,8 rayons, 299 appels de dessin et 3 tranches sur la vue de départ.

**L2.3 livré — vol par étape, derrière `?echelle=reelle`.** Profils de poussée, chemins de Bézier et
orientation repris tels quels de cine.js. Arrivée à 32–60 rayons → **transfert** en pilote automatique
(accélération, retournement, freinage, erre finale nez en avant ; temps accéléré, facteur ⏱ affiché) →
**approche** en temps réel dans le couloir holographique (10 portiques, pilotage latéral et vertical au
clavier ou à la souris, recentrage automatique au repos) → **orbite basse** à 6,5 % du rayon, vitesse
képlérienne réelle, arc au-dessus du port, escale v2.16 (navettes, radio, paiement) → **départ** en
poussée continue vers un point à 25–45 rayons dans la direction de l'étoile suivante → **erre** de 3 s →
**passage** par fondu (provisoire : distorsion et saut de la démo en L2.4). Caméras co-mobiles ;
carburant compté en Δv (10 unités par km/s). Dock, navettes et conteneurs mis à l'échelle du vaisseau.
Mesures (seed L23-TEST, temps virtuel) : transfert 21 s à ×672 (61 km/s au maximum), approche 30 s à
9,87 km/s, orbite à rayon constant (écart < 0,01 %), altitude minimale 6,5 % du rayon, 3 navettes et
livraison payée, 2 090 unités de carburant par étape, passage à l'étoile suivante.
Limites : plans de coupe des navettes désactivés à l'échelle réelle (repris avec les gros plans, L10) ;
les vaisseaux sans saut ni distorsion suivent encore l'itinéraire interstellaire (commerce local : L3) ;
coût du passage interstellaire en carburant : L2.4.

**L2.4 livré — passage entre étoiles, derrière `?echelle=reelle`.** Sur l'erre, selon l'équipement :
**saut quantique** (générateur installé, §23) = séquence du jeu v2.16 (charge, pli, éclair, onde,
quadrillage), la téléportation devenant l'entrée dans le système suivant ; **distorsion** (anneaux) =
traversée réelle de l'espace interstellaire comme dans la démo (la caméra galactique parcourt la distance
entre les deux étoiles, anneaux et traînées à plein régime, système quitté masqué, système suivant
construit derrière un éclair), vitesse WARP_FACTOR × 100 c, facteur de temps affiché ; sans moyen
supraluminique : fondu provisoire (L3). Coût : `quantumJumpFuelCost` du jeu (distance), identique pour les
deux modes ; réservoir insuffisant : saut refusé, distorsion sur la réserve de secours (2,5 fois plus lente).
Mesures (seed L24-TEST, Basalte) : 28,4 pc traversés en 11,5 s en distorsion ; saut et départ ≈ 1 830
unités de carburant ; arrivée au point d'arrivée du système suivant, transfert repris après l'onde.
Correctif : au déclenchement du saut, la caméra (fixe pendant la séquence) est calée sur la dernière
position co-mobile — sinon, à 66 km/s, elle restait 8 km en arrière.

**Ajustement du plan** : `stars.js` avance en L2.2 — l'étoile hôte doit exister à taille réelle dans
la couche système dès le passage en mètres. L8 est absorbé.

**L3 livré — commerce local**, pour les 6 modèles sans saut ni distorsion. Généralisation de
`R.plan`/`arrival`/`arriveOrbit` à une cible quelconque (avant : uniquement la planète-port) ; vitesse
d'approche fixe (`FLIGHT.DOCK_SPEED`, 120 m/s) et durée d'escale fixe (repli déjà là depuis L2.3) quand
la cible n'a pas de gravité propre (lune, station). Stations orbitales : petite structure procédurale
(anneau, moyeu, hublots, balise), 0 à 2 par système, accrochées à une planète notable, position fixe
(pas de pivot animé). Tableau de contrats : s'ouvre automatiquement à la fin de toute escale tant que le
vaisseau n'a ni générateur de saut ni anneaux, propose 4 destinations (planètes secondaires, lunes,
stations) tirées à chaque ouverture — jamais un stock qui s'épuise. Chantier naval : les 4 long-courriers
du catalogue avec un prix par rang (II 22 000 · III 34 000 · IV 50 000 CR, dans la continuité du module
de saut à 18 000 CR) ; achat = changement de coque immédiat. Un vaisseau équipé garde exactement le
comportement L2.3/L2.4 (jamais de tableau de contrats, aucune régression mesurée).

Bug trouvé et corrigé en cours de route : `R.afterEscale` se rappelait à chaque image tant que
`flightPhase` restait `'CRUISE'` en phase ORBIT — pour un vaisseau équipé, `planDeparture` fait
sortir de cet état immédiatement, mais ouvrir un panneau n'y change rien. Conséquence : le tableau de
contrats se retirait au hasard à chaque image, et pouvait recouvrir le chantier naval l'image suivante.
Corrigé en ne rouvrant le tableau que si ni lui ni le chantier ne sont déjà affichés ; le tableau perd
son bouton de fermeture (choix obligatoire pour reprendre le vol), le chantier garde le sien (fermable,
on retombe alors sur le tableau à l'image suivante). Deux bugs mineurs corrigés aussi : le rayon d'une
lune se lisait sur une géométrie remplacée par le retexturage de la démo (c'est l'échelle du maillage
qui code le rayon depuis §20) ; le tableau de contrats dupliquait le type d'une planète en guise de nom
(corrigé : nom propre de la planète, §14).

Mesures (seed L3-TEST, temps virtuel) : livraison locale complète (transfert, approche, orbite,
navettes, paiement) sur une planète secondaire, crédits 10 000 → 10 660 ; tableau stable sur plusieurs
images ; achat d'un long-courrier confirmé (bascule immédiate vers le départ interstellaire direct).
Vitesse d'approche d'une station confirmée à 120 m/s (repli, pas de vitesse orbitale).

**L7 livré — hublots, baies et hangars réalistes** (livré par erreur sous le nom « L4 » ; le vrai L4 est la carte 2D). Copie inchangée de `shipglass.js` (démo v7.2.2)
dans `src/JS/demo/`, chargée juste après le générateur de vaisseaux (§9) : le module s'enveloppe
lui-même autour de `SHIPGEN.build` sans qu'aucune retouche du générateur ait été nécessaire — sa
fonction `survey()` repère les vitrages existants par leur géométrie et leur matériau (`PlaneGeometry` +
signature de shader), pas par un balisage propre au jeu, et cette détection s'est révélée directement
compatible avec le générateur v2.16. Vitrages plats remplacés par un rendu en « interior mapping » (pièce
virtuelle derrière chaque ouverture, une pièce par cabine quand la répartition du modèle est connue de la
démo, sinon une pièce par hublot) ; baies à champ de force (halo, ondulation) ajoutées aux pousseurs
moyen/lourd et au paquebot, là où le générateur prévoit une grande ouverture de soute.

**Contrairement aux lots précédents, ce changement s'applique aussi hors du paramètre `?echelle=reelle`**
— c'était prévu ainsi depuis l'étude initiale (greffon « vaisseau », indépendant de l'échelle). Vérifié sur
4 modèles : Carrelet et Basalte reçoivent leurs hublots (1 maillage de vitrage, pas de baie — hors des
tables de la démo, calibrées sur 4 modèles précis) ; Tramontane et Belle-Étoile reçoivent en plus une baie
à champ de force (2 maillages : masque + rendu). Aucune erreur, appels de dessin stables (293 → 298).

**Conséquence sur la comparaison avec la v2.16** : à partir de L7, elle ne peut plus servir de garde-fou
« zéro changement » — c'est le but même de ce lot. Le test relevait 1,3 à 1,6 % de pixels différents ; le
masque montre que l'essentiel vient d'ailleurs que des vitrages : le générateur de vaisseaux consomme
maintenant quelques tirages aléatoires de plus, ce qui décale le flux commun à toute la génération
procédurale (astéroïdes, détails de planètes) en aval. Rien d'anormal, mais `couches_test.py` cesse
d'être un test de non-régression pertinent à partir d'ici — gardé pour mémoire, plus lancé en routine.

**L4 livré — carte 2D de la démo + ciblage de saut du jeu**, à l'échelle réelle (la carte 3D du §23
reste celle de la v2.16 hors du paramètre). `starmap.js` copié de la démo avec trois adaptations
documentées en tête du fichier : traduction fr / de / es par une couche `trm()` (textes du canevas —
`fillText`/`measureText` enveloppés — et des panneaux ; l'anglais d'origine reste intact), libellés des
types de planètes repris du jeu, pas d'action « caméra » (le jeu n'a pas le réalisateur de la démo).
`20e-carte-2d.js` fournit l'API `window.__CINE` que la carte attend (systemInfo, moonsInfo, mapState,
shipsInfo, focus, setNextStar), bâtie sur REAL : systèmes du secteur rejoués depuis leur graine (données
pures, aucun maillage), système courant lu tel que construit. **Ciblage selon les règles du jeu (§23)** :
générateur de saut acheté, étoile parmi les 24 plus proches dans 5 cellules, carburant du saut ; refus
explicites (générateur requis, hors de portée, carburant). La cible remplace l'étape suivante au départ ;
une cible choisie pendant un passage attend le suivant. Arrivée hors itinéraire : l'itinéraire est
recalculé depuis la nouvelle étoile et l'escale qui suit ne consomme pas d'étape. Touche M, icône de la
barre, Échap ; la carte capte ses touches avant le pilotage.
Mesures (seed L4-TEST, Basalte) : 496 étoiles et 148 cibles au niveau secteur ; ciblage de
Surya-Wander 782 (4,8 pc) puis saut réussi, itinéraire neuf de 8 étapes ; refus vérifiés pour une étoile
hors de portée, un carburant insuffisant, un vaisseau à distorsion seule et un vaisseau sans FTL.
Limite : les nombres de la carte gardent le séparateur décimal anglais (« 15.7 al »).

## 4 ter. v2.17 — l'échelle réelle devient le seul mode

Décision : l'ancien monde compressé de la v2.16 est **abandonné** ; plus de paramètre `?echelle`.
Retrait du code mort par tranches, chacune testée sur les deux versions (lisible, obfusquée).

**Fait**
- **Bascule** : `REAL.active` est inconditionnel ; `20e-carte-2d.js` ne se désactive plus.
- **Copies v4 retirées** (modules 18, 19, 20 : 46 Ko) — les modules de la démo `planets.js` et
  `asteroids.js` reprennent leurs espaces de noms d'origine (`__PLANETS`, `__AST`) et redeviennent des
  copies inchangées. `ensureSystemsBuilt` et `updatePlanetSystems` (systèmes en unités de jeu) vidées ;
  `disposePlanetGroup` n'appelle plus `__PLANETS.release` (absent de la démo, qui ne tient pas de registre).
- **Tests** : `couches_test.py` et `ref/space-travel-v2.16.html` supprimés (comparaison avec un mode qui
  n'existe plus). Tous les autres tests passent sans paramètre : fumée, échelle, vol, saut et distorsion,
  commerce local, carte — 86 vérifications.

- **Tranche 1 — carte 3D retirée** : module 28 (30 → 12 Ko : état, scène, étiquettes, interaction,
  confirmation, `performQuantumTeleport`, retirés via l'arbre syntaxique), rendu en pause (boucle),
  gabarit HTML (`#starMapOverlay`, `#starMapLabels`), 30 règles CSS, 64 textes traduits (16 clés × 4
  langues). `openStarMap`/`closeStarMap` gardent leur nom mais ouvrent la carte 2D ; nouveau
  `isStarMapOpen()`. Espace, Entrée, Échap et P ferment la carte en priorité, comme avant. Reste :
  achat du générateur, `quantumJumpFuelCost`, séquence de saut, `STAR_MAP_RADIUS`.
- **Tranche 2 — vol en unités de jeu retiré** (module 36 : 38,6 → 28,6 Ko) : suivi de la spline
  d'itinéraire et détection d'arrivée, pilote automatique par champ de vecteurs, ralentissement
  d'approche, croisière supraluminique, translation et consommation au km. Reste le pilotage manuel
  (couple sur l'attitude). **Défaut corrigé au passage** : la poussée affichée des moteurs valait
  vitesse ÷ vitesse de croisière — en m/s réels, elle saturait à 100 % en permanence (erre, orbite
  comprises) ; elle suit maintenant le profil de vol réel (`REAL.throttle`).
- Taille : 1 325 → 1 287 Ko (source), 1 050 → 1 005 Ko (obfusquée). 72 vérifications vertes après
  chaque tranche (fumée ×2, vol, saut et distorsion, commerce local, carte).

**Constat à trancher** : l'amélioration « Propulseurs » du port (§21) agit sur la vitesse de croisière de
l'ancien vol ; à l'échelle réelle elle n'a plus aucun effet (les transferts durent ~22 s à l'écran quel que
soit le vaisseau, le temps s'adapte). À redéfinir : accélération plus forte, moins de carburant par Δv, ou
durée de transfert réduite.

**Reste à retirer**
3. **Portiques et spline d'itinéraire** (module 23) : `ROUTE.curve`, portiques en unités de jeu ;
   `computeRoute` garde uniquement le calcul des étapes galactiques.
4. **Branches mortes** `REAL.active ? … : …` et drapeau `REAL.parked` : orbite à 2,3 R, capture d'orbite,
   brouillard, tranches par défaut de `LAYERS`, `mountHull` à taille de jeu, constantes de croisière.
5. **Panneau d'itinéraire** : la progression lit encore `ROUTE.s` (spline) — à réécrire sur les phases
   de vol réelles.

## 4 quater. L5 et L6 — greffons vaisseau et séquences de la démo

**Modules copiés tels quels** (`src/JS/demo/`, ordre de chargement de la démo) : `shipdrive.js` (ensembles
moteur : cloche de profil Rao, tubes de refroidissement, bobines, cardans, jet de torche de fusion),
`warpring.js` (anneaux sur pivots, 12 émetteurs, halo), `shipwear.js` (usure : peinture, crasse, rouille,
coulures, tôles remplacées, suie ; livrées v7.2), `hitex.js` (textures de coque ×4, ×2 avec `?quality=low`).
Avec `shipglass.js` (L7), les cinq enveloppent `SHIPGEN.build` sans retouche du générateur.

**Pilotage par le jeu** — `20f-greffons-vaisseau.js` (`SHIPFX`), appelé en fin de `REAL.update` :
- tuyères : poussée du profil de vol réel ; col qui chauffe en ~1 s et refroidit en ~5 s ; cardans qui
  suivent la vitesse de rotation mesurée du vaisseau (retournements compris), vibration pendant la poussée ;
- anneaux : un tour en 50 s au repos, pré-charge sur l'erre avant une distorsion (un tour en 6 s),
  1,2 tour/s en distorsion, retour τ = 2 s ; halo et émetteurs allumés par le champ ; lueur sur la coque ;
- usure progressive : coque neuve à l'achat (âge 0,04), +0,012 par escale (« usé » après une cinquantaine
  d'escales), uniforme `uAge` sans reconstruction ; graine par coque (livrée et dessin de l'usure stables,
  y compris après la pose du générateur de saut) ;
- tremblement de caméra (formule de la démo) : allumage, poussée, charge/repli/éclair du saut, engagement
  de la distorsion ; seulement caméra proche ; `?shake=0` ou « réduire les animations » le coupent ;
- **L5 · géode** : un tour en 40 s, battements pendant la charge (0,8 → 0,07 s), accélération jusqu'à
  ~3 tours/s au repli, étincelle violette ; **durées du saut alignées sur la démo** (charge 3,4 s, repli
  1,25 s, éclair 0,32 s, onde 1,7 s — v2.16 : 1,8 / 1,0 / 0,3 / 1,3) ;
- **L5 · départ en distorsion (v7.2.1)** : plan de trois quarts, le vaisseau s'éloigne en accélérant sur
  2,2 s en laissant une traînée violette et disparaît dans une gerbe ; la caméra reste 1,3 s sur la gerbe
  puis rejoint le vaisseau pour la traversée (`buildDepFX` extraite telle quelle de cine.js).
- **L5 · règles v7.2.2** : déjà satisfaites par le jeu — pas de saut sans générateur (la géode n'apparaît
  qu'une fois le module posé, `refitJumpCore`), les modèles sans FTL n'ont aucun moyen de saut.

Mesures (Basalte) : 6 ensembles moteur, 2 anneaux, géode, 4 textures agrandies ; source 1 287 → 1 354 Ko,
obfusquée 1 005 → 1 047 Ko. Traversée en distorsion : 12,5 s (dont 1,3 s de plan extérieur).
Non repris : RCS à bouffées pulsées (v6.1, dans cine.js et non dans un module) — le jeu garde ses RCS.

## 4 quinquies. Survol du système (plan cinématique, suite de L5)

`20g-survol-systeme.js` (`SURVOL`). **Déclenchement** : automatique à l'arrivée par saut ou distorsion dans un
système jamais survolé (pendant le transfert en pilote automatique) ; à la demande avec **G** (hors approche
manuelle et hors passage) ; toute touche ou un clic ramène au vaisseau.
**Trajectoire** : chaque planète du système, de proche en proche depuis la caméra, la planète de destination en
dernier (le survol finit là où le vaisseau arrive) ; passage rectiligne et lent (3,4 s) à 3,2 rayons (5 avec
anneaux) côté éclairé, un peu au-dessus du plan des orbites ; transits interpolés en échelle logarithmique de la
distance (1,4 à 4,2 s selon la distance), regard qui pivote de la planète quittée vers la suivante ; retour
derrière le vaisseau (2,6 s). Un transit ne traverse jamais une planète (caméra repoussée à 1,6 rayon).
**Accord avec le vol** : l'accélération du temps du transfert est recalculée au lancement pour que le vaisseau
atteigne le couloir d'approche juste après la fin du survol — le pilotage manuel n'est jamais pris de court.
**Légende** McGivrer à chaque passage : nom, type, rayon, orbite (fr, en, de, es).
**Ordre dans `REAL.update`** : le plan extérieur du départ en distorsion et le survol placent la caméra AVANT le
ciel galactique et la mise à jour des planètes (niveau de détail, atmosphère relatifs à la caméra) — placés en
fin de fonction, ciel et planètes auraient été calculés pour la caméra restée près du vaisseau.
Mesures (seed SURVOL-TEST) : 2 planètes passées à 2,2 rayons de la surface, survol de 16,6 s, transfert recalé à
×436, approche atteinte juste après ; interruption par une touche : retour au vaisseau en 1,1 s.
Test : `survol_test.py`. `vol_test.py` exclut désormais les instants de survol de sa vérification « caméra près
du vaisseau ».

## 4 sexies. L10 — profondeur de champ et gros plans

**Profondeur de champ** : `postfx.js` de la démo copié tel quel, branché dans `renderMain` avant la lentille du
saut (scène en tranches rendue dans sa cible, la dernière tranche — 0,2 → 400 m — fournit la profondeur du
premier plan). Ouverture tirée par plan (0,45–0,75 % de la hauteur d'image), mise au point lissée sur le point
visé, ouverture progressive ; coupée sous 0,7 de résolution dynamique (`?dof=1` : jamais coupée, `?dof=0` : jamais
de flou). Au passage : la cible de rendu de la lentille du saut reçoit un stencil (portails des baies de L7 corrects
pendant un saut).

**Mode de caméra « GROS PLANS »** (cycle existant, icône, libellés fr/en/de/es) — `20h-gros-plans.js` (`GP`) :
tuyères, géode (si générateur posé), anneaux (long-courriers), proue et passerelle, travelling le long de la coque,
module d'amarrage ; coupes franches toutes les 6 à 9 s ; caméra calculée dans le repère du vaisseau à chaque image,
jamais dans la coque (repoussée hors de la boîte englobante élargie).

**Plans des navettes à l'escale** (coupés depuis L2.3) : chargement au module d'amarrage (3,4 s), puis suivi en plan
latéral de la navette et de son conteneur, une fois dégagés du vaisseau (4,2 s) ; automatiques quel que soit le mode
de caméra, sauf en escale abrégée. Trois défauts corrigés avant d'obtenir un plan lisible :
- la navette (~30 km/s) est déplacée après le calcul de la caméra : caméra en retard d'une image, ≈ 1 km mesuré —
  position extrapolée d'une image ;
- le cadrage se fondait sur une longueur de navette estimée d'après le vaisseau (×3 trop grande), puis sur une boîte
  englobante gonflée par la lueur du moteur (sprite) : mesure sur la coque seule ;
- dans l'axe, juste après le départ, la caméra voyait à travers les anneaux : plan latéral, déclenché navette dégagée.
Le rétrécissement des navettes en fin de trajet (ancien jeu, simulation de distance) est coupé à l'échelle réelle.

**Modes « plan-séquence » et « plans lointains »** remis à l'échelle du vaisseau (95 m et 260–520 m de l'ancien
jeu : dans la coque d'un vaisseau de 300 m).

Mesures (seed GP-TEST, Basalte) : 5 types de plans en 48 s, caméra jamais dans la coque (0/240), sujet toujours à
l'écran (0/240), flou actif sur 239/240 relevés, mise au point exacte ; navette cadrée sur 125/125 relevés.
Test : `gros_plans_test.py`. `survol_test.py` accepte qu'après interruption en orbite les plans des navettes
reprennent la main.

## 4 septies. Correctifs du largage des navettes (signalés en jeu)

**Conteneur trop grand** (masquait la navette, ne passait pas la porte de soute) : régression de L2.3 — le
conteneur était agrandi à l'échelle du vaisseau (f) PUIS accroché à la pince et au berceau, déjà agrandis de f :
échelle f² (9,06 au lieu de 3,01 pour le Basalte). Échelle 1 sous la pince et le berceau ; proportions de la v2.16
d'origine retrouvées (conteneur = 0,4 × la navette).

**Mouvements incohérents** — cinq causes :
- orientation de la navette calculée avec la verticale ABSOLUE de la scène : repère dégénéré pendant la chute hors
  soute (nez vers le bas) et bascules à chaque changement de phase. Désormais : attitude du vaisseau en sortie de
  soute, pivot progressif vers la route avec la verticale de la PLANÈTE pour haut (secours : avant du vaisseau si la
  route est verticale), réalignement pour l'arrimage, rotations lissées ;
- distances de sortie de soute et arcs de trajectoire en unités de l'ancien jeu : à l'échelle du vaisseau ;
- traînée : historique de positions à ~30 km/s → 15 km de ligne ; plafonnée à ~3 longueurs de navette (panache),
  historique reporté dans le repère du vaisseau ;
- caméra de suivi orientée sur le DÉPLACEMENT de la navette, qui mélange vitesse orbitale et trajet : orientée sur
  l'attitude de la navette ;
- plan de chargement visant conteneur et navette une image trop tôt (ils sont replacés contre le dock plus tard dans
  l'image, ≈ 330 m en orbite) : vise les ancres du vaisseau ; cadrage sur la longueur RÉELLE de la navette.

Preuve — `largage_test.py` (nouveau, 30 images/s) sur la version livrée avant correction puis après :
échelle du conteneur 9,06 → 3,01 ; conteneur/navette 1,69 → 0,56 ; rotation max de la navette 84 → 0,8 rad/s ;
rotation max de la caméra de suivi (dans un même plan) 86 → 0,6 rad/s ; traînée 15,7 km → 72 m ; dock dans l'image
au chargement 22 (hors champ) → 0,4. Avant : 6 échecs sur 7 ; après : 7/7.
`vol_test.py` exclut désormais aussi les plans de suivi des navettes de sa vérification « caméra près du vaisseau »
(24 relevés jusqu'à 8,9 longueurs pendant ces plans ; 2,7 au plus en dehors).

## 4 octies. Séquence de titre — plans-séquences dans des systèmes réels

Remplace l'ancienne cinématique de titre (ciel en unités compressées, sans aucun système). `20i-sequence-titre.js`
(`TITLE`), avec `REAL.titleEnter/titleExit/titleUpdate` (système construit et animé SANS vaisseau, caméra seule).
Choix (joueur) : systèmes les plus spectaculaires du voisinage, fondu au noir, ~30 s par système.
- **Choix des systèmes** : tous les systèmes à ≤ 2 cellules notés d'après leurs données (`REAL.systemInfo`, rien de
  construit) — anneaux, lunes, planète habitable, géantes, étoile bleue ou géante ; les 4 meilleurs, de proche en
  proche, en boucle (seed TITRE-TEST : notes 10,6 à 13,6 pour une médiane de 5,8 sur 54 systèmes).
- **Un plan-séquence par système** : approche de l'étoile (couronne, taches, éruptions) jusqu'à ~9 rayons stellaires,
  puis les 2 plus belles planètes — avec une lune : on longe la planète puis on glisse jusque derrière la lune, regard
  vers la planète (la lune au premier plan) ; sans lune : arc lent du jour vers le terminateur ; transits en échelle
  logarithmique, contournement de l'étoile par une courbe si besoin.
- **Fondu au noir** (0,8 s + 0,25 s + 0,8 s) : le système suivant est construit dans le noir, sa prise démarre
  pendant la remontée ; voile sous le titre (couche 2 < titre 6).
- Démarrage de la partie : séquence arrêtée, système de titre libéré, premier système de l'itinéraire construit.
Défauts trouvés et corrigés par le test (`titre_test.py`) : glissement planète→lune tracé par une courbe de Bézier qui
traversait la planète (caméra repoussée à 1,30 R) → arc autour de la planète (≥ 2,98 R) ; « haut » de caméra fixe
(verticale absolue), dégénéré → normale au plan des orbites + garde ; orientation de départ des transits recalculée
vers l'astre quitté → figée ; interpolation « plus court chemin » qui changeait de côté près d'un demi-tour (53 rad/s)
→ sens choisi au départ du segment ; fin de glissement regardant la lune toute proche → regard vers la planète.
Rotation maximale de la caméra dans un système : 1,95 rad/s.

## 4 nonies. Correctif : saccades des plans rapprochés de navettes (signalé en jeu)

**Cause** : les navettes étaient déplacées APRÈS le placement des caméras dans la boucle (module 41 :
`REAL.update` → gros plans, puis `updateShuttles`). La caméra filmait toujours la navette de l'image précédente ; le
correctif précédent l'extrapolait d'une image, ce qui ne tient qu'à cadence parfaitement régulière. Les tests
d'alors avançaient à pas constant : le défaut n'y apparaissait pas.
**Correction** : `updateShuttles` appelée juste après `updateFlight`, avant `REAL.update` ; extrapolation supprimée ;
cap de la caméra de suivi lissé (τ = 0,7 s) au lieu d'être rivé à l'attitude de la navette ; dernier cap horizontal
conservé quand la navette plonge presque à la verticale vers le port.
**Preuve** — `saccades_test.py` (nouveau), à **cadence irrégulière** (images de 10 à 45 ms), sur le plan de suivi :
tremblement de la navette à l'écran 2 242 → 0,0003 (2 = largeur d'écran) ; saut de distance caméra–navette par image
30 → 0,003 longueur de navette ; rotation max de la caméra 13,5 → 1,3 rad/s ; décor (planète) stable (0,0002 rad).
Défauts de mesure corrigés en route : navette mesurée ≠ navette filmée (plusieurs en route à la fois) ; stabilité du
décor d'abord « nulle » faute de relevés (centre de la planète au-delà du plan lointain) → mesure par direction.

## 4 decies. Lots N et N2 — navette-cargo et navettes de baie

Voir [`SPEC-008-ports_orbitaux_et_navette-V1.0.md`](SPEC-008-ports_orbitaux_et_navette-V1.0.md) (décisions, chorégraphie, mesures). En bref :
`20p-navette.js` (`CARGO`) — conteneur ISO 20' réel ; navette-cargo (corps de navette de la démo + berceau dorsal) ;
**baie ventrale ajoutée aux 4 porte-conteneurs** (table `BELLY` de `shipglass.js`, seule modification de la copie) ;
prise directe sur la pile ; engins de baie sans conteneur pour les autres vaisseaux ; plus aucun module d'amarrage.
`smallcraft.js` de la démo copié tel quel. Tests : `navette_baie_test.py`, `escale_baie_test.py`, `largage_test.py`,
`saccades_test.py` (fenêtres allongées à la durée d'une escale à baie).

## 4 undecies. Lot P1 — ports orbitaux (génération et rendu)

`20n-ports-orbitaux.js` (`PORTS`) : anneau, moyeu à pontons, tour d'amarrage, déclinés par graine ; poste L sur chaque
port ; stations du commerce local absorbées (mêmes planètes et noms) ; toute géante gazeuse dotée d'une tour. Détails,
rendus et mesures : [`SPEC-008-ports_orbitaux_et_navette-V1.0.md`](SPEC-008-ports_orbitaux_et_navette-V1.0.md) §B.3 bis. Test : `ports_test.py`.

## 5. Build et tests

```
npm install                 # terser, html-minifier-terser (une fois)
python3 build.py            # compile → package → test
python3 build.py compile    # src/ → target/space-travel.html
python3 build.py package    # → target/space-travel.min.html (obfusquée)
python3 build.py test       # src/test/*_test.py sur les deux pages
```

Tests : `smoke_test.py` (démarrage, route, déplacement, passe de lentille, navette, erreurs) ;
`echelle_test.py` (mode échelle réelle : données physiques, tranches, HUD, vues planète, orbite basse, soleil) ;
`vol_test.py` (vol par étape en temps virtuel : phases, couloir, orbite, carburant, passage, captures) ;
`passage_test.py` (saut puis distorsion sur un long-courrier : séquence, parallaxe, HUD, coût, arrivée) ;
`survol_test.py` (survol du système : déclenchement, chaque planète, légendes, retour, G, interruption) ;
`gros_plans_test.py` (mode gros plans, coque, cadrage, profondeur de champ, plans des navettes) ;
`largage_test.py` (largage : échelle du conteneur, rotations de la navette et de la caméra, traînée, cadrage du chargement) ;
`titre_test.py` (séquence de titre : choix des systèmes, étoile, planètes, lune, fondu, continuité, démarrage du jeu) ;
`saccades_test.py` (plans de suivi de navette à cadence irrégulière : tremblement à l'écran, distance, rotation, décor) ;
`navette_baie_test.py` (navette de baie des porte-conteneurs : départ et rangement en baie, vitesses de manœuvre, contact, encombrement) ;
`escale_baie_test.py` (escale d'un vaisseau à baie : fin navette rentrée, plan de suivi, rotations, éloignement) ;
`ports_test.py` (ports orbitaux : postes L, altitudes, géantes, budget, absorption des stations — `ports_test.py page [ancienne]` pour la comparaison) ;
`commerce_test.py` (commerce local : tableau de contrats, livraison sur cible quelconque, boucle, achat au chantier naval, bascule long-courrier).
`carte_test.py` (carte 2D : ouverture, traduction, secteur et système, règles du ciblage, saut vers la cible, itinéraire recalculé, escale hors itinéraire).
`couches_test.py` : supprimé en v2.17 (voir §4 ter).

`src/JS/game/ORDER.txt` fixe l'ordre des 43 modules de jeu : scripts classiques à portée
globale, l'ordre fait partie du code. Découpage fait aux frontières d'instructions de premier
niveau (vérifié par l'arbre syntaxique) ; la page reconstruite est **identique à l'octet près**
à la v2.16 d'origine.

## 6. Performances de référence (v2.16, avant fusion)

Test de fumée, Chromium headless en rendu logiciel (ordre de grandeur uniquement) :
≈ 290–330 appels de dessin et 0,45–1,2 M triangles par image en croisière.
Budget visé d'après la démo : ≈ 280 appels médians en système riche en baies, textures HD
+22 Mo GPU (5,5 Mo en qualité basse), profondeur de champ +1–2 ms (1080p, GPU intégré, gros
plans seulement), carte et radar sans coût quand ils sont fermés.
