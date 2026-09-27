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
| L2 | Échelle réelle : rendu en couches, temps accéléré, transferts, supraluminique obligatoire, carburant, HUD, radio | L1, zip |
| L3 | Commerce local et progression : contrats dans le système, vaisseau de départ, boutique du chantier naval | L2 |
| L4 | Carte 2D de la démo + ciblage de saut du jeu ; retrait de la carte 3D | L2 |
| L5 | Saut et distorsion de la démo (géode, départ violet, règles v7.2.2) | L2 |
| L6 | Greffons vaisseau : moteurs, usure et livrées, textures HD, anneaux, tremblement | L1 |
| L7 | Hublots, baies et hangars réalistes | L1 |
| L8 | ~~Soleils « cinéma »~~ — absorbé par L2.2 | — |
| L9 | Trafic, petits engins, baies à champ de force, concurrence et escorte, radar | L2, L4 |
| L10 | Profondeur de champ, gros plans | L6 |

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

## 5. Build et tests

```
npm install                 # terser, html-minifier-terser (une fois)
python3 build.py            # compile → package → test
python3 build.py compile    # src/ → target/space-travel.html
python3 build.py package    # → target/space-travel.min.html (obfusquée)
python3 build.py test       # src/test/*_test.py sur les deux pages
```

Tests : `smoke_test.py` (démarrage, route, déplacement, passe de lentille, navette, erreurs) ;
`couches_test.py` (comparaison d'images en temps virtuel avec `ref/space-travel-v2.16.html`) ;
`echelle_test.py` (mode échelle réelle : données physiques, tranches, HUD, vues planète, orbite basse, soleil) ;
`vol_test.py` (vol par étape en temps virtuel : phases, couloir, orbite, carburant, passage, captures) ;
`passage_test.py` (saut puis distorsion sur un long-courrier : séquence, parallaxe, HUD, coût, arrivée).

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
