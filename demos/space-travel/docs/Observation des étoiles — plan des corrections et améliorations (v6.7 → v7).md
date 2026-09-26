# Observation des étoiles — plan des corrections et améliorations (v6.7 → v7)

Sep 26, 2026 · @Frédéric Delorme

## Synthèse

Quatre livraisons, dans l'ordre : les deux bugs et le sélecteur d'abord (v6.7), puis la carte et le radar (v6.8), les effets de caméra et de tuyères (v6.9), les finitions (v7.0). Chaque livraison garde le rythme habituel : version normale + minifiée, README, zip du projet, tests de non-régression.

| Livraison | Contenu | Effort | Valeur | Risque |
| --- | --- | --- | --- | --- |
| v6.7 | Bugs (sens de marche, héros plus variés) + lot 1 (sélecteur de vaisseaux) | moyen | forte : corrige ce qui se voit à chaque orbite | faible |
| v6.8 | Lot 2 : carte de l'univers détaillée + radar McGivrer | élevé | forte : la démo devient explorable | moyen (interface, performances de la carte) |
| v6.9 | Lot 3 : profondeur de champ, tuyères orientables, tremblement caméra | moyen | forte en gros plan | moyen (coût GPU du flou) |
| v7.0 | Lot 4 : cabines multi-hublots, cadre de la géode en rotation | faible | moyenne | faible |

Le principe ne change pas : le moteur du jeu (v2.15) reste intact, tout passe par les modules de la démo.

## Bugs — v6.7

Les deux bugs sont confirmés par mesure (orientation du nez comparée à la vitesse, graines OBS-2 et OBS-5) et se corrigent dans `cine.js` sans toucher au moteur.

### B1 — marche arrière au-dessus des planètes

- **Cause** : le transfert *flip-and-burn* freine jusqu'au point d'insertion en orbite. Le vaisseau descend donc de 20 rayons planétaires à 1,09 rayon **tuyères en avant**, puis reste à l'envers pendant les 3 premières secondes de l'orbite en temps réel (fondu d'attitude de 6 s). C'est physiquement juste, mais c'est exactement ce qui se voit au ras de la planète.
- **Correctif recommandé — retournement final** : le freinage s'achève plus tôt, à la vitesse orbitale, vers 3 rayons ; suit une courte erre (≈ 2,5 s à l'écran) pendant laquelle le vaisseau pivote de 180° aux RCS. Il arrive nez en avant, l'orbite démarre sans fondu à l'envers.
- **Mise en œuvre** : un segment d'erre final dans `flipProfile`, un second retournement dans `pathState` (même axe de tangage, donc RCS déjà animés), fondu d'orbite réduit à 2 s.
- **Trafic** : les cargos en navette freinent aussi à l'envers près de leurs points d'arrêt ; même traitement proposé en option (ils s'arrêtent, le gain est moindre).
- **Test** : aucune mesure « nez opposé à la vitesse » sous 3 rayons planétaires, sur 10 graines ; continuité d'attitude (test existant).

### B2 — toujours le même vaisseau

- **Cause** : le relais vers un autre vaisseau n'a lieu que 3 fois sur 10 par système ; on suit donc le même héros environ 3 systèmes de suite (≈ 3 min).
- **Correctif** :
  - relais 6 fois sur 10, et obligatoire après 2 systèmes avec le même héros ;
  - le relais part de préférence d'un vaisseau déjà vu en plan de coupe (continuité pour le spectateur), jamais du même modèle que les 2 héros précédents ;
  - plans de coupe sur le trafic un peu plus fréquents (25 % → 35 % en temps réel), petits engins compris.
- **Test** : sur 20 min simulées, au moins 6 héros différents et aucun héros suivi plus de 2 systèmes.

## Lot 1 — sélecteur de vaisseaux (v6.7)

Le jeu contient déjà le sélecteur voulu (`openShipSelect`, carrousel des 10 modèles avec aperçu 3D et fiche technique) : la démo le réutilise tel quel, ce qui garantit l'aspect « comme dans le jeu » pour un effort faible.

- **Accès** : sur l'écran d'accueil (bouton « Choisir un vaisseau » à côté de « Lancer », avec une entrée « Aléatoire ») et pendant la démo (touche `V`, petit bouton discret en haut à droite qui n'apparaît qu'au survol).
- **Effet du choix** :
  - le vaisseau choisi entre en scène dans le système courant, en orbite, et devient le héros au plan suivant (relais immédiat) ;
  - un mode **Suivre** le garde comme héros ; le mode **Auto** (par défaut) reprend ensuite les relais du bug B2.
- **Pendant l'ouverture** : la démo se met en pause (musique comprise) pour éviter deux rendus WebGL simultanés.
- **À adapter** :
  - la garde d'entrées (`head_guard2.js`) laisse passer les événements vers le sélecteur et, tant qu'il est ouvert, ses images d'animation ;
  - `cine.js` expose `C.setHero(modèle, { follow })` ;
  - les options du jeu (distorsion, saut) sont reprises si le modèle les permet.
- **Hors périmètre (option)** : les petits engins de la v6.6 ne sont pas dans le catalogue du jeu ; les ajouter demanderait un onglet dédié.
- **Tests** : ouverture et fermeture à chaque phase (arrivée, transfert, orbite, saut), choix de chaque modèle, clavier seul, aucune erreur et aucun contexte WebGL qui s'accumule.

## Lot 2 — carte de l'univers et radar (v6.8)

La carte du jeu (`openStarMap`) montre les 24 étoiles les plus proches en 3D, pour choisir un saut ; celle de la démo sera une vue de dessus à zoom continu, de l'échelle des nuages jusqu'à l'orbite basse, dessinée en 2D dans la charte McGivrer. Le radar est nouveau : le jeu n'a qu'un panneau « objet le plus proche ».

### Carte (touche `M`)

| Niveau de zoom | Ce qui s'affiche | Source des données |
| --- | --- | --- |
| Secteur (≈ 80 pc de large) | étoiles (couleur spectrale, taille selon la luminosité), nébuleuses (nappes par type), itinéraire parcouru et prochain saut, position du héros | `starDataForCell` (cellules de 190 u, 1 sur 2 occupée), données des nébuleuses recalculées sans construire leurs maillages |
| Système (0,1–100 UA) | étoile, orbites, planètes nommées, lunes, ceinture d'astéroïdes, zone habitable, vaisseaux | données réelles de la démo (`ensureSystemData`), calculées à la demande et gardées en cache |
| Orbite (quelques rayons planétaires) | disque de la planète, vaisseaux et petits engins en orbite basse | positions courantes |

- **Échelle adaptée** : distances comprimées (racine ou logarithme selon le niveau) pour que tout tienne à l'écran ; une barre d'échelle donne toujours la distance réelle (pc, UA ou km).
- **Vaisseaux** : points avec étiquette (nom), le héros en ambre, les autres en cyan ; regroupés en pastille « 12 vaisseaux » au niveau secteur.
- **Commandes** : molette ou pincement pour zoomer, glisser pour déplacer, survol = fiche de l'objet, **double-clic = la caméra y va** :
  - étoile, planète, ceinture ou nébuleuse du système courant : travelling de découverte correspondant (existant) ;
  - vaisseau : il devient le sujet du plan (ou le héros en mode Suivre) ;
  - étoile lointaine : voir la décision D4.
- **Rendu** : canevas 2D superposé, redessiné à l'interaction et à 5 images/s pour les vaisseaux ; la démo continue derrière (voile sombre), la musique aussi.

### Radar (touche `R`)

- Zone circulaire en bas à droite (220 px), centrée sur le vaisseau filmé, nez vers le haut, cercles de portée automatiques (1, 10, 100 km…).
- Chaque vaisseau proche : point, nom, immatriculation (format du jeu, ex. `MIR-42`), distance en `u` ; le plus proche est mis en avant.
- Charte McGivrer (reprise du HUD du jeu) :
  - fond `#0b1220` à 90 %, filets `#25375c`, texte `#e8edf5`, données `#5eead4`, héros et sélection `#ffb454` ;
  - JetBrains Mono, coins en équerre ambre, aucun arrondi hors du cercle du radar ;
  - balayage animé désactivé si `prefers-reduced-motion`.
- Masqué pendant les travellings sans vaisseau ; mis à jour 10 fois par seconde.

### À adapter

- Garde d'entrées : clics, molette et double-clics autorisés sur la carte et le radar.
- `cine.js` expose les objets du système, l'itinéraire, les vaisseaux (nom, immatriculation, position) et des commandes : `focus(objet)`, `setNextStar(étoile)`.
- **Tests** : 200 ouvertures et fermetures, zoom maximal et minimal, double-clic sur chaque type d'objet, mémoire stable, coût du radar mesuré sous 0,3 ms par mise à jour.

## Lot 3 — profondeur de champ, tuyères, tremblements (v6.9)

Trois effets de « caméra réelle », actifs seulement quand ils se voient : gros plans, manœuvres de baie, allumages et sauts filmés de près.

### Profondeur de champ

- **Principe** : le rendu passe par une cible hors écran (déjà utilisée par la lentille du saut) avec sa texture de profondeur. Le rendu en tranches donne un avantage : après la dernière tranche, le tampon de profondeur ne contient que le premier plan (vaisseaux, engins). Tout le reste — planète, étoile, champ stellaire — est « au loin » et flouté au maximum.
- **Passes** : flou séparable à demi-résolution (2 passes), puis mélange net / flou selon le cercle de confusion calculé depuis la profondeur et la distance de mise au point (le point visé par le plan).
- **Réglage** : ouverture selon la focale du plan (46–58° : léger) ; mise au point qui suit le sujet ; entrée et sortie en fondu sur 0,4 s pour ne pas « pomper » aux changements de plan.
- **Coût estimé** : 1 à 2 ms GPU en 1080p ; désactivé automatiquement si la résolution dynamique descend sous 0,7.

### Tuyères orientables

- Chaque ensemble moteur de `shipdrive.js` pivote sur son cardan de ±2–4° : il suit le couple demandé (même calcul que les RCS) pendant les retournements et les corrections.
- Pendant la poussée, une vibration fine (bruit de 12–18 Hz, 0,2°) ; le jet de torche suit la tuyère.
- Coût négligeable (une rotation par tuyère et par image).

### Tremblement de caméra

- Déclencheurs : allumage (front montant de la poussée), charge et repli du saut quantique, éclair et onde, engagement de la distorsion.
- Amplitude proportionnelle à l'événement et décroissante avec la distance (nulle au-delà de 3 longueurs de vaisseau) : décalages et roulis par bruit lisse, retour au calme en 0,6–1,5 s.
- Plafonné pour rester lisible ; désactivé si `prefers-reduced-motion`.

**Tests** : captures avant / après sur les plans de gros plan et de saut, mesure du temps d'image avec et sans profondeur de champ, vérification qu'aucun effet ne s'applique aux travellings sans vaisseau.

## Lot 4 — cabines et géode (v7.0)

Deux finitions peu coûteuses, dont une corrige une limite connue de la v6.5.

### Une cabine, une pièce

- **Aujourd'hui** : chaque hublot a sa propre pièce ; une suite à 3 hublots montre 3 « cabines ». Les hublots seuls ne permettent pas de retrouver les cabines (espacements ambigus entre cabines voisines).
- **Solution exacte** : recalculer la répartition du générateur. Il distribue les cabines d'un modèle par module et par pont (liste `cabins`, indice modulo le nombre d'emplacements), chacune occupant une tranche égale du module ; standard = 1 hublot, confort = 2, suite = 3. Une table des paramètres par modèle (modules, ponts, longueur de module, liste des cabines) suffit pour rattacher chaque hublot à sa cabine.
- **Rendu** : les hublots d'une même cabine partagent la même pièce (même graine, même éclairage, même mobilier) ; les suites gagnent un coin salon ; le store est commun à la cabine.
- **Test** : pour chaque modèle habité, nombre de cabines reconstituées = nombre du catalogue du jeu (2, 6, 9, 20…).

### Cadre de la géode

- Au repos : le cadre blanc (icosaèdre fil de fer) tourne lentement sur l'axe vertical, un tour en ≈ 40 s.
- Pendant la charge du saut : chaque battement de la géode donne une impulsion ; la vitesse monte par paliers, jusqu'à ≈ 3 tours/s au repli, puis retombe après le saut. La rotation suit donc exactement le rythme des pulsations de la v6.4.
- Coût nul (une rotation par image) ; l'angle est calculé depuis le temps, donc correct aussi pour les plans qui anticipent.

## Architecture

Deux nouveaux modules d'interface et un module d'effets s'ajoutent ; `cine.js` gagne une petite API de pilotage pour qu'ils ne touchent jamais à ses données internes.

| Module | Lot | Rôle | Nouveau ou modifié |
| --- | --- | --- | --- |
| `cine.js` | bugs, 1–4 | retournement final, relais plus fréquents, API `setHero` / `focus` / `setNextStar` / `snapshot()` (objets, vaisseaux, itinéraire), tremblement de caméra, rotation du cadre de la géode | modifié |
| `head_guard2.js` | 1, 2 | laisse passer les entrées vers les éléments d'interface de la démo (classe `demo-ui`) et vers le sélecteur du jeu | modifié |
| `live2.js` | 1, 2 | écran d'accueil (bouton de choix), raccourcis `V` `M` `R`, pause pendant le sélecteur | modifié |
| `starmap.js` | 2 | carte 2D à zoom continu : données (cache LRU des systèmes), dessin, interactions, double-clic → API | nouveau |
| `radar.js` | 2 | radar circulaire, charte McGivrer, 10 mises à jour/s | nouveau |
| `postfx.js` | 3 | profondeur de champ (cible hors écran partagée avec la lentille du saut) | nouveau |
| `shipdrive.js` | 3 | cardans des tuyères, vibration, jet qui suit | modifié |
| `shipglass.js` | 4 | rattachement hublot → cabine, pièce commune | modifié |

**Flux** : `live2.js` reçoit les entrées et ouvre les interfaces ; carte et radar lisent `C.snapshot()` (lecture seule, 5 à 10 fois par seconde) et agissent par l'API (`focus`, `setHero`, `setNextStar`) ; le réalisateur applique au prochain plan. `postfx.js` s'insère dans `renderFrame`, après le rendu en tranches et avant la lentille.

**Ordre d'assemblage** : planets → asteroids → stars → shipdrive → shipglass → shipwear → smallcraft → postfx → cine → starmap → radar, puis `live2.js`.

## Risques, performances, optimisations

Le principal risque technique est la profondeur de champ (coût GPU et interaction avec la lentille du saut) ; le principal risque d'usage est l'interface (entrées bloquées par la garde, deux rendus WebGL).

| Risque | Lot | Impact | Parade |
| --- | --- | --- | --- |
| Le retournement final allonge ou décale l'arrivée | bugs | plans d'arrivée mal cadrés | erre calculée dans la durée du transfert existante ; tests de continuité d'attitude et d'arrivée sur 10 graines |
| Relais trop fréquents : on ne s'attache à aucun vaisseau | bugs | film décousu | 2 systèmes maximum par héros, mais au moins 1 système complet ; réglage par paramètre d'URL |
| Le sélecteur du jeu ouvre un second contexte WebGL | 1 | mémoire GPU, saccades | pause de la démo pendant l'ouverture ; contexte libéré à la fermeture (vérifié par test) |
| Entrées bloquées par la garde | 1, 2 | interface inerte | liste blanche explicite (`demo-ui`, sélecteur), test clavier et souris |
| Carte trop lourde au niveau secteur (milliers de cellules) | 2 | ouverture lente | cellules d'étoiles en cache (le jeu le fait déjà), systèmes calculés à la demande, dessin 2D sans WebGL |
| Profondeur de champ coûteuse | 3 | chute de fluidité | demi-résolution, gros plans seulement, coupure si la résolution dynamique baisse |
| Tremblement gênant | 3 | inconfort | amplitude plafonnée, `prefers-reduced-motion` respecté |
| Table des cabines désynchronisée d'une future version du jeu | 4 | hublots mal rattachés | repli automatique sur « une pièce par hublot » si les comptes ne correspondent pas |

**Budget de performances visé** : pas plus de +2 ms GPU par image en gros plan (profondeur de champ comprise), +0,3 ms CPU pour le radar, 0 quand carte et radar sont fermés. Chaque livraison mesure les appels de dessin par image (médiane v6.6 ≈ 280) et le temps de simulation (≈ 0,5 ms).

## Décisions à prendre

Six choix conditionnent la suite ; l'option recommandée est en premier et sera appliquée par défaut sans contre-indication.

| # | Question | Option recommandée | Alternative | Coût / effort | Valeur |
| --- | --- | --- | --- | --- | --- |
| D1 | Corriger la marche arrière (B1) | **Retournement final** avant l'orbite (physique respectée) | Nez en avant pendant tout le freinage (non physique) | moyen / faible | forte / moyenne |
| D2 | Effet du sélecteur (lot 1) | **Relais immédiat** dans le système courant + modes Auto / Suivre | Le vaisseau choisi prend le relais au prochain saut | faible / faible | forte / moyenne |
| D3 | Technique de la carte (lot 2) | **Canevas 2D, vue de dessus, zoom continu** (net, léger, charte McGivrer) | Carte 3D three.js comme dans le jeu | moyen / élevé | forte / forte mais plus lourde |
| D4 | Double-clic sur une étoile lointaine | **Devient le prochain saut** (le héros y va, sans rupture) | Téléportation immédiate de la caméra (1–2 s de chargement du système) | faible / moyen | forte / moyenne |
| D5 | Profondeur de champ (lot 3) | **Selon la profondeur** du premier plan (vrai flou d'optique) | Flou du seul arrière-plan, sans profondeur | moyen / faible | forte / moyenne |
| D6 | Unité `u` du radar (lot 2) | **1 u = 1 m** (échelle des coques du jeu), `ku` et `Mu` au-delà de 10 000 | Unité galactique du jeu (1 u ≈ 0,026 pc), inadaptée aux distances entre vaisseaux | nul | cohérence |

Dès validation, la v6.7 (bugs + sélecteur) peut démarrer : elle ne dépend que de D1 et D2.
