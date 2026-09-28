Observation des étoiles — plan des corrections et améliorations (v6.7 → v7)
26 sept. 2026 · @Frédéric Delorme
Synthèse
Quatre livraisons, dans l'ordre : les deux bugs et le sélecteur d'abord (v6.7), puis la carte et le radar (v6.8), les effets de caméra et de tuyères (v6.9), les finitions (v7.0). Chaque livraison garde le rythme habituel : version normale + minifiée, README, zip du projet, tests de non-régression.
Livraison
Contenu
Effort
Valeur
Risque
v6.7
Bugs (sens de marche, héros plus variés) + lot 1 (sélecteur de vaisseaux)
moyen
forte : corrige ce qui se voit à chaque orbite
faible
v6.8
Lot 2 : carte de l'univers détaillée + radar McGivrer
élevé
forte : la démo devient explorable
moyen (interface, performances de la carte)
v6.9
Lot 3 : profondeur de champ, tuyères orientables, tremblement caméra
moyen
forte en gros plan
moyen (coût GPU du flou)
v7.0
Lot 4 : cabines multi-hublots, cadre de la géode en rotation
faible
moyenne
faible
v7.1
Textures haute résolution (×4) + détail procédural sous le texel
moyen
forte en gros plan : plus de pixels visibles
faible (≈ 22 Mo GPU, aucun coût par image)
v6.9
Lot 5 : barre de progression sur l'écran de génération de l'univers
faible
moyenne : l'attente devient lisible
faible
Le principe ne change pas : le moteur du jeu (v2.15) reste intact, tout passe par les modules de la démo.
Bugs — v6.7
Les deux bugs sont confirmés par mesure (orientation du nez comparée à la vitesse, graines OBS-2 et OBS-5) et se corrigent dans cine.js sans toucher au moteur.
B1 — marche arrière au-dessus des planètes
• Cause : le transfert flip-and-burn freine jusqu'au point d'insertion en orbite. Le vaisseau descend donc de 20 rayons planétaires à 1,09 rayon tuyères en avant, puis reste à l'envers pendant les 3 premières secondes de l'orbite en temps réel (fondu d'attitude de 6 s). C'est physiquement juste, mais c'est exactement ce qui se voit au ras de la planète.
• Correctif recommandé — retournement final : le freinage s'achève plus tôt, à la vitesse orbitale, vers 3 rayons ; suit une courte erre (≈ 2,5 s à l'écran) pendant laquelle le vaisseau pivote de 180° aux RCS. Il arrive nez en avant, l'orbite démarre sans fondu à l'envers.
• Mise en œuvre : un segment d'erre final dans flipProfile, un second retournement dans pathState (même axe de tangage, donc RCS déjà animés), fondu d'orbite réduit à 2 s.
• Trafic : les cargos en navette freinent aussi à l'envers près de leurs points d'arrêt ; même traitement proposé en option (ils s'arrêtent, le gain est moindre).
• Test : aucune mesure « nez opposé à la vitesse » sous 3 rayons planétaires, sur 10 graines ; continuité d'attitude (test existant).
B2 — toujours le même vaisseau
• Cause : le relais vers un autre vaisseau n'a lieu que 3 fois sur 10 par système ; on suit donc le même héros environ 3 systèmes de suite (≈ 3 min).
• Correctif :
    ◦ relais 6 fois sur 10, et obligatoire après 2 systèmes avec le même héros ;
    ◦ le relais part de préférence d'un vaisseau déjà vu en plan de coupe (continuité pour le spectateur), jamais du même modèle que les 2 héros précédents ;
    ◦ plans de coupe sur le trafic un peu plus fréquents (25 % → 35 % en temps réel), petits engins compris.
• Test : sur 20 min simulées, au moins 6 héros différents et aucun héros suivi plus de 2 systèmes.
Lot 1 — sélecteur de vaisseaux (v6.7)
Le jeu contient déjà le sélecteur voulu (openShipSelect, carrousel des 10 modèles avec aperçu 3D et fiche technique) : la démo le réutilise tel quel, ce qui garantit l'aspect « comme dans le jeu » pour un effort faible.
• Accès : sur l'écran d'accueil (bouton « Choisir un vaisseau » à côté de « Lancer », avec une entrée « Aléatoire ») et pendant la démo (touche V, petit bouton discret en haut à droite qui n'apparaît qu'au survol).
• Effet du choix :
    ◦ le vaisseau choisi entre en scène dans le système courant, en orbite, et devient le héros au plan suivant (relais immédiat) ;
    ◦ un mode Suivre le garde comme héros ; le mode Auto (par défaut) reprend ensuite les relais du bug B2.
• Pendant l'ouverture : la démo se met en pause (musique comprise) pour éviter deux rendus WebGL simultanés.
• À adapter :
    ◦ la garde d'entrées (head_guard2.js) laisse passer les événements vers le sélecteur et, tant qu'il est ouvert, ses images d'animation ;
    ◦ cine.js expose C.setHero(modèle, { follow }) ;
    ◦ les options du jeu (distorsion, saut) sont reprises si le modèle les permet.
• Hors périmètre (option) : les petits engins de la v6.6 ne sont pas dans le catalogue du jeu ; les ajouter demanderait un onglet dédié.
• Tests : ouverture et fermeture à chaque phase (arrivée, transfert, orbite, saut), choix de chaque modèle, clavier seul, aucune erreur et aucun contexte WebGL qui s'accumule.
Lot 2 — carte de l'univers et radar (v6.8)
La carte du jeu (openStarMap) montre les 24 étoiles les plus proches en 3D, pour choisir un saut ; celle de la démo sera une vue de dessus à zoom continu, de l'échelle des nuages jusqu'à l'orbite basse, dessinée en 2D dans la charte McGivrer. Le radar est nouveau : le jeu n'a qu'un panneau « objet le plus proche ».
Carte (touche M)
Niveau de zoom
Ce qui s'affiche
Source des données
Secteur (≈ 80 pc de large)
étoiles (couleur spectrale, taille selon la luminosité), nébuleuses (nappes par type), itinéraire parcouru et prochain saut, position du héros
starDataForCell (cellules de 190 u, 1 sur 2 occupée), données des nébuleuses recalculées sans construire leurs maillages
Système (0,1–100 UA)
étoile, orbites, planètes nommées, lunes, ceinture d'astéroïdes, zone habitable, vaisseaux
données réelles de la démo (ensureSystemData), calculées à la demande et gardées en cache
Orbite (quelques rayons planétaires)
disque de la planète, vaisseaux et petits engins en orbite basse
positions courantes
• Échelle adaptée : distances comprimées (racine ou logarithme selon le niveau) pour que tout tienne à l'écran ; une barre d'échelle donne toujours la distance réelle (pc, UA ou km).
• Vaisseaux : points avec étiquette (nom), le héros en ambre, les autres en cyan ; regroupés en pastille « 12 vaisseaux » au niveau secteur.
• Commandes : molette ou pincement pour zoomer, glisser pour déplacer, survol = fiche de l'objet, double-clic = la caméra y va :
    ◦ étoile, planète, ceinture ou nébuleuse du système courant : travelling de découverte correspondant (existant) ;
    ◦ vaisseau : il devient le sujet du plan (ou le héros en mode Suivre) ;
    ◦ étoile lointaine : voir la décision D4.
• Rendu : canevas 2D superposé, redessiné à l'interaction et à 5 images/s pour les vaisseaux ; la démo continue derrière (voile sombre), la musique aussi.
Radar (touche R)
• Zone circulaire en bas à droite (220 px), centrée sur le vaisseau filmé, nez vers le haut, cercles de portée automatiques (1, 10, 100 km…).
• Chaque vaisseau proche : point, nom, immatriculation (format du jeu, ex. MIR-42), distance en u ; le plus proche est mis en avant.
• Charte McGivrer (reprise du HUD du jeu) :
    ◦ fond #0b1220 à 90 %, filets #25375c, texte #e8edf5, données #5eead4, héros et sélection #ffb454 ;
    ◦ JetBrains Mono, coins en équerre ambre, aucun arrondi hors du cercle du radar ;
    ◦ balayage animé désactivé si prefers-reduced-motion.
• Masqué pendant les travellings sans vaisseau ; mis à jour 10 fois par seconde.
À adapter
• Garde d'entrées : clics, molette et double-clics autorisés sur la carte et le radar.
• cine.js expose les objets du système, l'itinéraire, les vaisseaux (nom, immatriculation, position) et des commandes : focus(objet), setNextStar(étoile).
• Tests : 200 ouvertures et fermetures, zoom maximal et minimal, double-clic sur chaque type d'objet, mémoire stable, coût du radar mesuré sous 0,3 ms par mise à jour.
Lot 3 — profondeur de champ, tuyères, tremblements (v6.9)
Trois effets de « caméra réelle », actifs seulement quand ils se voient : gros plans, manœuvres de baie, allumages et sauts filmés de près.
Profondeur de champ
• Principe : le rendu passe par une cible hors écran (déjà utilisée par la lentille du saut) avec sa texture de profondeur. Le rendu en tranches donne un avantage : après la dernière tranche, le tampon de profondeur ne contient que le premier plan (vaisseaux, engins). Tout le reste — planète, étoile, champ stellaire — est « au loin » et flouté au maximum.
• Passes : flou séparable à demi-résolution (2 passes), puis mélange net / flou selon le cercle de confusion calculé depuis la profondeur et la distance de mise au point (le point visé par le plan).
• Réglage : ouverture selon la focale du plan (46–58° : léger) ; mise au point qui suit le sujet ; entrée et sortie en fondu sur 0,4 s pour ne pas « pomper » aux changements de plan.
• Coût estimé : 1 à 2 ms GPU en 1080p ; désactivé automatiquement si la résolution dynamique descend sous 0,7.
Tuyères orientables
• Chaque ensemble moteur de shipdrive.js pivote sur son cardan de ±2–4° : il suit le couple demandé (même calcul que les RCS) pendant les retournements et les corrections.
• Pendant la poussée, une vibration fine (bruit de 12–18 Hz, 0,2°) ; le jet de torche suit la tuyère.
• Coût négligeable (une rotation par tuyère et par image).
Tremblement de caméra
• Déclencheurs : allumage (front montant de la poussée), charge et repli du saut quantique, éclair et onde, engagement de la distorsion.
• Amplitude proportionnelle à l'événement et décroissante avec la distance (nulle au-delà de 3 longueurs de vaisseau) : décalages et roulis par bruit lisse, retour au calme en 0,6–1,5 s.
• Plafonné pour rester lisible ; désactivé si prefers-reduced-motion.
Tests : captures avant / après sur les plans de gros plan et de saut, mesure du temps d'image avec et sans profondeur de champ, vérification qu'aucun effet ne s'applique aux travellings sans vaisseau.
Lot 4 — cabines et géode (v7.0)
Deux finitions peu coûteuses, dont une corrige une limite connue de la v6.5.
Une cabine, une pièce
• Aujourd'hui : chaque hublot a sa propre pièce ; une suite à 3 hublots montre 3 « cabines ». Les hublots seuls ne permettent pas de retrouver les cabines (espacements ambigus entre cabines voisines).
• Solution exacte : recalculer la répartition du générateur. Il distribue les cabines d'un modèle par module et par pont (liste cabins, indice modulo le nombre d'emplacements), chacune occupant une tranche égale du module ; standard = 1 hublot, confort = 2, suite = 3. Une table des paramètres par modèle (modules, ponts, longueur de module, liste des cabines) suffit pour rattacher chaque hublot à sa cabine.
• Rendu : les hublots d'une même cabine partagent la même pièce (même graine, même éclairage, même mobilier) ; les suites gagnent un coin salon ; le store est commun à la cabine.
• Test : pour chaque modèle habité, nombre de cabines reconstituées = nombre du catalogue du jeu (2, 6, 9, 20…).
Cadre de la géode
• Au repos : le cadre blanc (icosaèdre fil de fer) tourne lentement sur l'axe vertical, un tour en ≈ 40 s.
• Pendant la charge du saut : chaque battement de la géode donne une impulsion ; la vitesse monte par paliers, jusqu'à ≈ 3 tours/s au repli, puis retombe après le saut. La rotation suit donc exactement le rythme des pulsations de la v6.4.
• Coût nul (une rotation par image) ; l'angle est calculé depuis le temps, donc correct aussi pour les plans qui anticipent.
Lot 5 — progression du chargement (à planifier)
Ajouté le 26 septembre 2026. Aujourd'hui, l'écran d'accueil affiche « GENERATING UNIVERSE… » sans aucune indication d'avancement pendant que le moteur génère le monde, puis que la démo prépare le premier système. Une barre de progression rendrait l'attente lisible.
• Étapes suivies : moteur prêt, champ d'étoiles et nébuleuses, premier système (planètes, étoile, lunes), vaisseaux et trafic, compilation des shaders et premier rendu.
• Option recommandée — barre par jalons : chaque étape a un poids mesuré une fois (temps moyen) ; la barre avance par jalons et progresse doucement pendant l'étape en cours, avec son libellé. Effort faible, valeur forte, aucun changement du moteur.
• Alternative — progression mesurée : compter les cellules et objets réellement générés (caches du moteur observés de l'extérieur). Plus exacte, mais effort moyen et risque d'à-coups, car le moteur ne publie pas son avancement.
• Minimum — barre indéterminée : animation sans pourcentage. Effort nul, valeur faible.
• Charte McGivrer : filet #25375c, barre ambre de 2 px, pourcentage en JetBrains Mono, libellé d'étape en #8ea0c4, coins en équerre ; animation réduite si prefers-reduced-motion.
• Test : la barre atteint 100 % au moment où « CLICK TO LAUNCH » apparaît, sans recul, sur 5 graines et en version minifiée.
Lots 6 à 9 — modernisation et flotte militaire (v7.2 → v7.5)
Décisions du 26 septembre : D8 à D11 (options recommandées retenues).
Version
Lot
Contenu
Effort
Valeur
v7.2
6 — hublots, livrées, anneaux
Hublots hexagonaux par famille, verrières en nid d'abeille, portes de hangar à pans coupés ; ≈ 30 % de livrées sombres, usure inversée, projecteurs de coque ; anneaux en rotation, charge visible
moyen
forte
v7.3
7 — intérieurs
3 ambiances (hospitalité, industriel, rétro-futur), hangars animés, passerelles avec équipage
élevé
forte
v7.4
8 — flotte militaire I
warships.js : chasseur, corvette, destroyer ; patrouille, escorte, station ; plans dédiés ; carte et radar
élevé
forte
v7.5
9 — flotte militaire II
Catapultage, exercices de tir sans destruction, panneau FLEET (touche G)
moyen
moyenne
Architecture de la v7.2
• Hublots (shipglass.js) : la forme est une fonction de distance ; ajout d'un hexagone allongé en trois variantes choisies par famille de modèle. Cadre en relief et embrasure suivent la même distance ; le quadrilatère est agrandi pour contenir la forme. Au-delà de 0,68 d'âge, le hublot reste rond (ancienne génération).
• Livrées (shipwear.js) : le module copie déjà les matériaux de chaque vaisseau ; la palette change les 3 teintes du moteur (coque, intermédiaire, livrée). Tirage par graine et par famille ; paramètre d'URL pour les tests. La poussière éclaircit une peinture sombre. Projecteurs : 2 à 4 cônes analytiques dans le shader d'usure, allumés côté ombre.
• Anneaux (cine.js) : pré-charge visuelle de 3 s avant la charge actuelle (trajectoires inchangées), halo additif, arcs entre anneaux, lueur sur la coque ; rotation de l'anneau et d'émetteurs ajoutés, supports fixes.
• Risques : cadre hexagonal plus large que le hublot d'origine (espacement à vérifier sur les 10 modèles) ; vaisseaux sombres illisibles côté ombre ; halo additif sous profondeur de champ.
Architecture
Deux nouveaux modules d'interface et un module d'effets s'ajoutent ; cine.js gagne une petite API de pilotage pour qu'ils ne touchent jamais à ses données internes.
Module
Lot
Rôle
Nouveau ou modifié
cine.js
bugs, 1–4
retournement final, relais plus fréquents, API setHero / focus / setNextStar / snapshot() (objets, vaisseaux, itinéraire), tremblement de caméra, rotation du cadre de la géode
modifié
head_guard2.js
1, 2
laisse passer les entrées vers les éléments d'interface de la démo (classe demo-ui) et vers le sélecteur du jeu
modifié
live2.js
1, 2
écran d'accueil (bouton de choix), raccourcis V M R, pause pendant le sélecteur
modifié
starmap.js
2
carte 2D à zoom continu : données (cache LRU des systèmes), dessin, interactions, double-clic → API
nouveau
radar.js
2
radar circulaire, charte McGivrer, 10 mises à jour/s
nouveau
postfx.js
3
profondeur de champ (cible hors écran partagée avec la lentille du saut)
nouveau
shipdrive.js
3
cardans des tuyères, vibration, jet qui suit
modifié
shipglass.js
4
rattachement hublot → cabine, pièce commune
modifié
Flux : live2.js reçoit les entrées et ouvre les interfaces ; carte et radar lisent C.snapshot() (lecture seule, 5 à 10 fois par seconde) et agissent par l'API (focus, setHero, setNextStar) ; le réalisateur applique au prochain plan. postfx.js s'insère dans renderFrame, après le rendu en tranches et avant la lentille.
Ordre d'assemblage : planets → asteroids → stars → shipdrive → shipglass → shipwear → smallcraft → postfx → cine → starmap → radar, puis live2.js.
Risques, performances, optimisations
Le principal risque technique est la profondeur de champ (coût GPU et interaction avec la lentille du saut) ; le principal risque d'usage est l'interface (entrées bloquées par la garde, deux rendus WebGL).
Risque
Lot
Impact
Parade
Le retournement final allonge ou décale l'arrivée
bugs
plans d'arrivée mal cadrés
erre calculée dans la durée du transfert existante ; tests de continuité d'attitude et d'arrivée sur 10 graines
Relais trop fréquents : on ne s'attache à aucun vaisseau
bugs
film décousu
2 systèmes maximum par héros, mais au moins 1 système complet ; réglage par paramètre d'URL
Le sélecteur du jeu ouvre un second contexte WebGL
1
mémoire GPU, saccades
pause de la démo pendant l'ouverture ; contexte libéré à la fermeture (vérifié par test)
Entrées bloquées par la garde
1, 2
interface inerte
liste blanche explicite (demo-ui, sélecteur), test clavier et souris
Carte trop lourde au niveau secteur (milliers de cellules)
2
ouverture lente
cellules d'étoiles en cache (le jeu le fait déjà), systèmes calculés à la demande, dessin 2D sans WebGL
Profondeur de champ coûteuse
3
chute de fluidité
demi-résolution, gros plans seulement, coupure si la résolution dynamique baisse
Tremblement gênant
3
inconfort
amplitude plafonnée, prefers-reduced-motion respecté
Table des cabines désynchronisée d'une future version du jeu
4
hublots mal rattachés
repli automatique sur « une pièce par hublot » si les comptes ne correspondent pas
Budget de performances visé : pas plus de +2 ms GPU par image en gros plan (profondeur de champ comprise), +0,3 ms CPU pour le radar, 0 quand carte et radar sont fermés. Chaque livraison mesure les appels de dessin par image (médiane v6.6 ≈ 280) et le temps de simulation (≈ 0,5 ms).
Décisions à prendre
Les six options recommandées sont validées le 26 septembre 2026 ; pour D6, l'unité `u` s'adapte à la distance (u, ku, Mu) ; D7 (barre par jalons, livrée avec la v6.9) est validée le même jour.
#
Question
Option recommandée
Alternative
Coût / effort
Valeur
D1
Corriger la marche arrière (B1)
Retournement final avant l'orbite (physique respectée)
Nez en avant pendant tout le freinage (non physique)
moyen / faible
forte / moyenne
D2
Effet du sélecteur (lot 1)
Relais immédiat dans le système courant + modes Auto / Suivre
Le vaisseau choisi prend le relais au prochain saut
faible / faible
forte / moyenne
D3
Technique de la carte (lot 2)
Canevas 2D, vue de dessus, zoom continu (net, léger, charte McGivrer)
Carte 3D three.js comme dans le jeu
moyen / élevé
forte / forte mais plus lourde
D4
Double-clic sur une étoile lointaine
Devient le prochain saut (le héros y va, sans rupture)
Téléportation immédiate de la caméra (1–2 s de chargement du système)
faible / moyen
forte / moyenne
D5
Profondeur de champ (lot 3)
Selon la profondeur du premier plan (vrai flou d'optique)
Flou du seul arrière-plan, sans profondeur
moyen / faible
forte / moyenne
D6
Unité u du radar (lot 2)
1 u = 1 m (échelle des coques du jeu), ku et Mu au-delà de 10 000
Unité galactique du jeu (1 u ≈ 0,026 pc), inadaptée aux distances entre vaisseaux
nul
cohérence
D7
Barre de chargement (lot 5) : quand et comment
Barre par jalons, livrée avec la v6.9
Progression mesurée sur les caches du moteur, ou livraison séparée
faible / moyen
moyenne / moyenne
D8
Forme des hublots
Retenue : hexagones par famille (horizontal, fente blindée, petit), rond pour les très vieux vaisseaux
Hexagone horizontal partout ; hexagone vertical
faible
forte
D9
Intérieurs
Retenue : 3 ambiances (hospitalité, industriel, rétro-futur) + hangars et passerelles
Style unique ; version maximale avec salon et pont-jardin
élevé
forte en gros plan
D10
Livrées sombres
Retenue : palettes (≈ 30 % sombres) + usure inversée + projecteurs de coque
Palettes seules ; + immatriculations peintes
moyen
forte
D11
Flotte militaire
Retenue : générateur warships.js en 2 phases (v7.4 : 3 classes et comportements ; v7.5 : catapultage, exercices, sélecteur)
Variantes militarisées ; flotte complète d'emblée
élevé puis moyen
forte
La v6.7 (bugs + sélecteur) est livrée le 26 septembre 2026 : plus de marche arrière sous 3,3 rayons planétaires, 13 à 15 héros différents sur 20 min, sélecteur sur l'accueil et en démo.
La v6.8 (lot 2) est livrée le 26 septembre 2026 : carte en trois niveaux (secteur, système, orbite) enchaînés par le zoom, double-clic vers la caméra ou le prochain saut (départ replanifié sans rupture, mise en attente si trop tard), radar McGivrer avec immatriculations et distances en u adaptées, usage tactile. Mesures : radar 0,05 à 0,35 ms, carte 0,1 à 2,8 ms par dessin, rien quand ils sont fermés.
La v6.9 (lots 3 et 5) est livrée le 26 septembre 2026 : profondeur de champ dans les gros plans (profondeur réelle du premier plan, flou pondéré, FXAA), tuyères orientables qui suivent le couple et vibrent en poussée, tremblement de caméra sur allumage, saut et distorsion, barre de chargement par jalons avec shaders compilés avant le lancement.
La v7.0 (lot 4) est livrée le 26 septembre 2026 : une pièce par cabine (répartition du générateur rejouée, vérifiée sur les 10 modèles, coin salon des suites, repli automatique) et cadre de la géode en rotation, jusqu'à 3 tours/s au repli. Le plan est terminé ; prochaine étape : la résolution des textures demandée le 26 septembre.
La v7.1 est livrée le 26 septembre 2026 : les 4 textures partagées du générateur (tôles 512 px pour ~7 m de coque, soit 25 à 75 px par mètre) sont redessinées en 4× à partir des recettes du moteur (même graine, rivets ronds, filtrage anisotrope), les petits engins aussi ; le shader d'usure ajoute martelage, grain et rayures sous le texel, effacés au-delà du pixel, et ses seuils sont anticrénelés (plus de points isolés). Coût : ≈ 22 Mo de mémoire GPU (5,5 Mo avec quality=low), rien par image ; non-régression passée (démarrage, 20 min simulées, cabines). Demande suivante : publication sur GitHub Pages.
Demandes du 26 septembre à planifier (v7.2 → v7.5) :
• Hublots et baies : hexagones allongés au lieu de ronds ; verrières en nid d'abeille pour les baies, portes de hangar à pans coupés.
• Intérieurs modernisés (cabines, baies, passerelles, hangars), inspirés de 2010, Star Trek et The Expanse, avec des silhouettes originales.
• Livrées plus sombres pour une partie de la flotte (lisibilité : projecteurs de coque, feux, usure inversée).
• Flotte militaire : chasseurs, corvettes, destroyers, avec patrouilles, escortes et catapultage.
• Anneaux de distorsion : faire tourner les anneaux et rendre l'effet de charge visible. Diagnostic : l'effet s'active bien (champ 0,15 → 1,35, liaison des uniformes vérifiée), mais il ne dure que 2,6 s, avec une montée quadratique et sans halo.
• GitHub Pages : en attente (pas de dépôt rattaché à la session ; licence de la musique à vérifier avant diffusion publique).
La v7.2 (lot 6) est livrée le 26 septembre 2026 :
• Hublots : hexagonaux par famille (ronds pour les très vieux vaisseaux) ; verrières en nid d'abeille ; hangars et passerelles à pans coupés.
• Livrées : ≈ 30 % de vaisseaux sombres (anthracite, bleu nuit, bouteille, bordeaux, noir, acier), avec usure inversée et projecteurs de coque côté ombre.
• Anneaux de distorsion : rotation dans leurs colliers, 12 émetteurs, halo, voile et lueur sur la coque. Une pré-charge visuelle de 3 s précède le départ, et un plan rapproché warpRings est tourné 7 fois sur 10.
• Non-régression passée (démarrage, 20 min simulées, cabines).
La v7.2.1 est livrée le 26 septembre 2026. Le départ en distorsion a été repris :
• Engagement : 2,2 s au lieu de 0,75 s ; le vaisseau démarre lentement, puis s'arrache en laissant une traîne violette.
• Disparition : éclair, secousse et repli du vaisseau dans le plan de départ.
• Particules : une gerbe de 1 500 particules violettes se disperse là où il était, et la traîne s'égrène en 900 particules.
• Montage : le plan de départ est prolongé et la croisière allongée.
• Non-régression passée (démarrage, 20 min, changements de cible en distorsion).
La v7.2.2 (corrections) est livrée le 26 septembre 2026 :
• Moyens de saut : un vaisseau n'emploie que ce dont il est équipé, géode et/ou anneaux, selon le modèle et le sélecteur.
    ◦ Seuls les 4 modèles supraluminiques quittent un système.
    ◦ Un vaisseau sans moyen de saut devient la vedette de l'orbite ; le départ se fait avec le partant prévu.
• Retournements : ils se font autour du centre de gravité.
• Baies : les engins sortent dans l'axe (écart nul mesuré sur 35 manœuvres).
• Éjection coronale : le bord est adouci et déchiqueté.
La v7.3 (lot 7) est livrée le 26 septembre 2026 :
• Ambiances intérieures : hospitalité pour les paquebots et les coureurs, industriel pour les cargos et les pousseurs, rétro-futur pour les très vieux vaisseaux.
• Pièces : arêtes du plafond à pans coupés.
• Passerelles : opérateurs assis et table tactique holographique.
• Hangars : plot hexagonal, feux chenillards, portique roulant et salle de contrôle vitrée.
• Coût : +20 % en gros plan plein écran d'un hangar (rendu logiciel).
Prochaine étape : v7.4, flotte militaire (phase 1).
La v7.4 (lot 8) est livrée le 26 septembre 2026 :
• Générateur warships.js : chasseur (≈ 15 m), corvette (≈ 80 m) et destroyer (≈ 250 m), à tourelles animées.
• Scénarios (un par système, dans 6 systèmes sur 10) : station (destroyer et ronde de chasseurs), patrouille en formation, escorte de cargo.
• Plans : formation et gros plan de tourelle.
• Carte et radar : contacts militaires en rouge.
• Coût : 25 à 60 appels de dessin par groupe à l'écran.
La v7.5 (lot 9) est livrée le 26 septembre 2026 :
• Hangars du destroyer : deux baies latérales à champ de force ; les chasseurs sont catapultés (2,6 s), font une ronde autour du destroyer puis rentrent.
• Exercices de tir sur un drone-cible, en temps réel seulement : traçantes et obus, ≈ 70 % de coups au but, bouclier d'entraînement qui s'illumine, aucune destruction. Anticipation calculée dans le repère du destroyer.
• Plan gunnery à deux cadrages : large de profil, ou téléobjectif depuis la cible.
• Panneau FLEET (touche G) : patrouille, station ou escorte, suivie par la caméra. Remplace l'onglet du sélecteur prévu (le sélecteur du jeu reste inchangé).
• Coût : 2 appels de dessin pour les tirs, groupe caché hors exercice ; mémoire stable sur 20 min simulées.
En attente : publication (GitHub Pages ou Vercel, licence musicale à vérifier) et voyage des vaisseaux sans moyen supraluminique.
Porte-vaisseaux — cadrage (27 septembre 2026)
But : faire voyager d'un système à l'autre les vaisseaux sans moyen supraluminique (e18, p10, x1, remorqueurs), à bord d'un nouveau type de vaisseau.
Décisions :
• Concept : dock semi-ouvert, hangar en vraie géométrie (plans filmés dans le hangar).
• Ouverture : latérale ; le vaisseau se range à couple, puis glisse de côté dans son poste.
• Capacité : 2 places (le vaisseau suivi et un second vaisseau garé).
• Usage : toujours en mode Suivre ; une fois sur deux en mode Auto (sinon, relais actuel vers un vaisseau supraluminique).
Conséquences :
• Dimensions visées : soute d'environ 290 × 75 × 55 m (deux postes de 135 m ; passager le plus long : tL, 120 m ; le plus large : x1, 63 m ; le plus haut : e18, 38 m) ; porteur d'environ 650 à 700 m.
• Effort : élevé (au lieu de moyen+ pour la soute fermée).
• Risque principal : le moteur n'a pas d'ombres portées, donc le hangar et les vaisseaux garés seraient éclairés par le soleil à travers la coque. Parade : ombre calculée pour la soute (éclairé seulement si le rayon vers le soleil sort par l'ouverture).
• Coût estimé : 80 à 110 appels de dessin pour le porteur et ses passagers à l'écran.
Découpage retenu (3 lots) :
• v7.6 : le porteur, son dock, les deux postes et l'ombre de soute ; un vaisseau garé en décor ; entrée « SHIP CARRIER » dans le panneau FLEET pour aller le voir.
• v7.7 : rangement et sortie à couple, pinces et bras d'avitaillement, plans de caméra dédiés.
• v7.8 : voyage complet (départ en distorsion avec le passager, arrivée, débarquement, carte, radar, mode Suivre).
Porte-vaisseaux — architecture (étape 2)
Dimensions
Élément
Taille
Justification
Poste
135 × 75 × 55 m
tL 120 m de long, x1 63 m de large, e18 38 m de haut, marges de 6 à 8 m
Soute (2 postes en ligne)
≈ 290 × 75 × 55 m
ouverture sur tout le flanc, sans montant vertical (le vaisseau entre de côté)
Porteur
≈ 650 × 120 × 95 m
proue ≈ 110 m, soute ≈ 290 m, arrière (anneaux et moteurs) ≈ 250 m
Modules
• carrier.js (nouveau, après warships.js) : générateur du porteur sur les outils des petits engins (formes, tôles, fusion par matériau, usure, projecteurs, hublots simulés). Rendu : coque, dock en vraie géométrie (sol, fond, plafond, cloisons de bout, nervures, passerelles, portique roulant, deux salles de contrôle vitrées), deux berceaux à pinces, 2 anneaux de distorsion à l'arrière (même structure que warpring.js, pour que l'effet de départ fonctionne tel quel), balisage (feux d'approche chenillards, numéros de poste peints).
• Ombre de soute (injection dans le shader d'usure) : pour chaque fragment dans le volume de la soute, rayon vers le soleil ; éclairé seulement s'il sort par l'ouverture, bord adouci. S'applique au dock et aux vaisseaux garés ou en manœuvre. Matrice vue → soute mise à jour juste avant le dessin (rendu en tranches). Éclairage propre du hangar : projecteurs analytiques déjà utilisés pour les coques.
• Champ de force (option) : voile translucide sur l'ouverture, même aspect que les baies actuelles, onde au passage d'un vaisseau.
• cine.js : scénario « porteur » (orbite haute, un vaisseau sans moyen de saut garé au poste 2), trajectoire « à quai » dans le repère du porteur ; v7.7 : manœuvres à couple ; v7.8 : branchement sur le relais existant (le porteur part, le passager redevient héros à l'arrivée).
• live2.js : entrée SHIP CARRIER dans le panneau FLEET. radar.js / starmap.js : contact et fiche (v7.8 : « à bord de … »).
Performances
• Budget : porteur ≈ 45 à 60 appels de dessin (coque et dock fusionnés par matériau), vaisseau garé 20 à 40, soit 80 à 110 à l'écran (médiane actuelle ≈ 280 par image).
• Optimisations : fusion par matériau ; détails du dock (portique, pinces, passerelles) cachés au-delà de ≈ 3 km ; ombre de soute compilée seulement dans les matériaux concernés ; feux de balisage en un seul nuage de points ; shaders compilés pendant le chargement ; en distorsion (v7.8), passager masqué quand l'ouverture n'est pas visible.
Risques
Risque
Impact
Parade
Soleil à travers la coque (pas d'ombres)
fort
ombre de soute calculée
Échelle illisible (650 m)
moyen
repères humains : passerelles, rangées de hublots, drones de service dans le dock, numéros peints
Intégration au calendrier (v7.8)
fort
relais existant réutilisé, tests moyens de saut, héros, carte
Ombres portées hors soute (coque sur un vaisseau à couple)
faible
non traitées (limite documentée)
À-coup à la première apparition
faible
compilation au chargement
Choix de conception (28 septembre 2026)
• Silhouette catamaran : une coque dorsale et une coque ventrale, réunies à la proue et à la poupe. Le dock traverse le vaisseau de bord à bord (on voit les étoiles à travers) : entrée d'un côté, sortie de l'autre. L'ombre de soute gère deux ouvertures.
• Fermeture : deux champs de force, allumés en transit et en distorsion, éteints pendant les manœuvres.
• Identité : civile ou militaire, tirée au hasard par système (paramètre ?carrier=civil ou mil pour l'imposer).
• Fréquence en v7.6 : environ 1 système sur 3, plus l'entrée SHIP CARRIER du panneau FLEET et ?carrier=1.
La v7.6 (lot 10) est livrée le 28 septembre 2026 :
• Porteur d'environ 640 m, en silhouette catamaran. Le dock traverse le vaisseau de bord à bord et contient deux postes, un pylone en treillis, un portique roulant, deux salles de contrôle vitrées, des feux chenillards et deux champs de force. Deux anneaux de distorsion à l'arrière.
• Ombre de soute calculée dans le shader d'usure, plus la lumière du plafond. Elle vaut pour le dock, le vaisseau garé et les drones.
• Identité civile (SC nnn) ou militaire (FC nnn, tourelles), tirée par système.
• Présence dans environ 1 système sur 3 : un vaisseau sans moyen de saut garé au poste 2 et deux drones dans le poste libre.
• Plans dockPass, dockInterior et dockBerth ; entrée SHIP CARRIER dans le panneau FLEET.
• Coût : le porteur fait 34 à 45 appels de dessin. Le vaisseau garé coûte comme un cargo du trafic. Porteur et flotte militaire sont compilés au chargement, donc sans à-coup à leur apparition.
Correctif v7.6.1 (28 septembre 2026), à la demande de Frédéric : le porteur a implicitement le saut quantique, sa raison d'être. Il porte la géode du jeu sur un mât, entre les anneaux, et possède donc les deux moyens supraluminiques. En v7.8, il partira par saut quantique par défaut.
Correctif v7.6.2 (28 septembre 2026), à la demande de Frédéric : le porteur reçoit les moteurs de la dernière version, les mêmes ensembles que les vaisseaux du jeu (cloches Rao, col incandescent, bobines, cardans, jets de torche de fusion). Coût : environ 7 appels de dessin par moteur, soit environ 64 pour le porteur civil.
Plan d'implémentation par lots (28 septembre 2026)
Nouvelles demandes :
• propulsion « hard SF » du porteur, un design original dans l'esprit de The Expanse (sans copier le Canterbury) ;
• des éclipses rares ;
• des travellings planétaires lents ;
• des plans-séquences cinéma ;
• des trajets de planète en planète.
Elles s'ajoutent aux deux lots prévus du porte-vaisseaux (rangement à couple, voyage complet), qui sont renumérotés.
Ordre retenu :
1. d'abord ce qui se voit tout de suite et risque peu, la réalisation ;
2. puis la propulsion, avant les plans de manœuvre du porteur, pour ne recadrer ces plans qu'une fois ;
3. et le calendrier des visites (voyage, escales) en dernier.
Lot
Version
Contenu
Effort
Valeur
Risque
11
v7.7
Réalisation I : éclipses rares, travellings planétaires lents, lever de planète, terminateur, contre-champ d'arrivée
faible à moyen
forte
faible
12
v7.8
Propulsion hard-SF du porteur (option A+)
moyen+
forte
moyen
13
v7.9
Réalisation II : révélation, parallaxe d'anneaux, tour du système
moyen
forte
moyen
14
v7.10
Porte-vaisseaux II : rangement et sortie à couple
moyen+
forte
moyen
15
v7.11
Porte-vaisseaux III : voyage complet par saut quantique
élevé
très forte
élevé
16
v7.12
Escale interplanétaire
élevé
forte
élevé
Lot 11 — v7.7 · Réalisation I
• Éclipses : au plus une tous les 3 à 4 systèmes (probabilité d'environ 0,15), jamais deux systèmes de suite ; paramètre ?eclipse= pour forcer ou couper.
• Travelling planétaire : 15 à 25 s au lieu de 7 à 11, un mouvement 2 à 3 fois plus lent, choisi deux fois plus souvent parmi les plans de découverte ; raccourci si le départ approche.
• Lever de planète (nouveau) : caméra derrière une lune ou au ras du limbe ; la planète monte lentement, le vaisseau en silhouette s'il est proche.
• Terminateur (nouveau) : panoramique lent du jour vers la nuit, lumières des villes, arc de l'atmosphère.
• Contre-champ d'arrivée (nouveau) : la caméra attend déjà près de la planète ; le vaisseau arrive du fond de l'image, par saut ou par distorsion.
• Tests : statistiques de plans sur 20 minutes (éclipses par système, durées), capture de chaque nouveau plan, non-régression.
• Performances : pas de coût nouveau, mais les plans lourds (planète plein écran) durent plus longtemps.
• À décider : la fréquence exacte des éclipses ; la présence du vaisseau dans les travellings (absent, ou de temps en temps).
Lot 12 — v7.8 · Propulsion hard-SF du porteur (A+)
• Section de propulsion derrière le bloc moteur (porteur d'environ 700 à 720 m) :
    ◦ une torche de fusion unique (tuyère d'environ 75 m, profil Rao, col incandescent, tubes de refroidissement) ;
    ◦ une pile de 6 bobines magnétiques, un bâti de poussée en treillis et 6 vérins de cardan géants ;
    ◦ un bouclier anti-radiations en disque, des conduites d'ergols et des réservoirs ;
    ◦ deux grandes ailes de radiateurs à canaux rougeoyants, plus vifs en poussée.
• Réutilisation de shipdrive.js à grande échelle (profil, chauffe, cardan, jet de torche), en exposant une fonction de construction paramétrable.
• Jet : cœur blanc très collimaté, longueur et éclat dosés pour les gros plans.
• Plans : recadrage des plans du dock ; nouveaux plans en gros plan sur le moteur et en travelling le long des radiateurs.
• Option : les mêmes principes à petite échelle pour le destroyer et la corvette, pour un effort faible.
• Budget : 20 à 25 appels de dessin de plus pour le porteur ; shaders compilés au chargement.
• Risques : éblouissement du jet en gros plan ; lisibilité de l'échelle (repères : passerelles, hublots, drones).
• À décider : validation d'une première planche de rendus (3 vues, au repos et en pleine poussée) avant l'intégration.
Lot 13 — v7.9 · Réalisation II : plans-séquences
• Révélation : 20 à 30 s d'un seul tenant ; caméra collée à la coque, puis recul et grue, et la planète apparaît derrière le vaisseau. La trajectoire est une courbe continue, sans coupe.
• Parallaxe d'anneaux : travelling latéral au ras du plan des anneaux, particules au premier plan, planète derrière (planètes à anneaux seulement).
• Tour du système (caméra seule) : vol documentaire accéléré de planète en planète, 20 à 30 s, avec la légende des planètes survolées. Choisi rarement, plutôt en début de visite.
• Risques : caméra qui traverse un corps (contrôle de distance) ; cohérence du temps accéléré.
• Tests : planches de captures en séquence, statistiques de fréquence.
Lot 14 — v7.10 · Porte-vaisseaux II : rangement et sortie à couple
• Manœuvre :
    ◦ approche parallèle et mise à couple ;
    ◦ glissement latéral dans le poste aux propulseurs d'attitude ;
    ◦ fermeture des pinces, bras d'avitaillement ;
    ◦ champ de force coupé pendant la manœuvre, avec une onde au passage ;
    ◦ sortie par l'autre bord (dock traversant).
• Plans : approche à couple, passage du champ, vue depuis la salle de contrôle, vue au ras du pont.
• Risques : collisions (marges du poste) ; précision de la trajectoire dans le repère du porteur.
Lot 15 — v7.11 · Porte-vaisseaux III : voyage complet
• Départ par saut quantique (géode du porteur, charge, onde) avec le passager à bord ; distorsion possible avec ?ftl=warp.
• Arrivée : débarquement, et le passager redevient le vaisseau suivi.
• Modes : Suivre fonctionne pour tous les vaisseaux ; en mode Auto, le porteur intervient une fois sur deux (sinon, relais actuel).
• Carte et radar : mention « à bord de … ».
• Risques : on touche au calendrier des visites. Parade : réutiliser le relais existant, et tester les moyens de saut, les héros, la carte et 20 minutes simulées.
Lot 16 — v7.12 · Escale interplanétaire
• Escale : de temps en temps (environ 1 visite sur 4), le vaisseau suivi s'arrête à une deuxième planète du système avant de partir.
• Trajet : transfert (poussée, retournement, freinage), puis mise en orbite, avec de nouveaux plans ; la carte montre le trajet dans le système.
• Risques : calendrier et temps accéléré (des dizaines de millions de km) ; cohérence de la carte et du radar. À faire en dernier, sur un calendrier stabilisé.
Rituel de livraison (chaque lot)
• versions lisible et minifiée, zip du projet, README, planche d'images ;
• tests de non-régression ;
• mise à jour de ce plan ;
• pause pour validation avant le lot suivant.
Choix par défaut maintenus : le porteur garde ses anneaux en plus du saut quantique.
Prochaine étape : v7.3, intérieurs.