# T0.1 — Inventaire réel des états du jeu

| | |
|---|---|
| **Tâche** | T0.1 du [plan Scene](./PLAN-scenes.md) (lot 0, filet de sécurité) |
| **Base** | jeu `stt_v2.17.0`, `demos/space-travel/sources/src/JS/game/` |
| **Date** | 2026-10-03 |
| **Statut** | Terminé : la table des scènes du plan est corrigée (§6) |
| **Critère d'acceptation** | « Table du §3 confirmée ou corrigée » : **corrigée**, voir §5 et §6 |

## 1. Méthode et fiabilité

Lecture du code, sans exécution du jeu. Trois relectures indépendantes (phases de vol et séquences ; drapeaux et états de partie ; entrées et fenêtres), puis recoupement. Les numéros `NN:ligne` désignent `game/NN-*.js` (`20c`, `23`, `24`, `28`, `36`, `41`, `42`…).

- **Lu** : constaté dans le code, avec sa ligne.
- **Déduit** : conclu par raisonnement sur l'ordre des tests, non exécuté. Marqué « (déduit) ».
- **Revérifié** pour ce document, par lecture directe des lignes : absence de `gameStarted` dans le gestionnaire clavier principal (`23:233-351`), traitement de `M` avant le retour de pause (`23:294-300`), `gamePaused` affectée seulement en `24:96` et `24:109`, `jumpState.phase` jamais réaffectée après `'charge'`, retour au transfert après un saut (`20c:633-640`, `187-190`), `IDLE` présent une seule fois (`20c:371`), absence de dialogue de panne de carburant.

Ce que cet inventaire ne couvre pas : le comportement à l'exécution (aucun test lancé), les corps des fonctions d'achat du port (`30`), et le CSS (numéros de ligne indicatifs).

## 2. Machines à états et drapeaux

### 2.1 `REAL.phase` (`20c`), la machine principale du vol

Dix valeurs, toutes affectées dans `20c` sauf `APPROACH`, aussi forcée par `20q:214`.

| Valeur | Affectée en | Quand |
|---|---|---|
| `IDLE` | `20c:371` | à l'initialisation seulement ; **jamais lue, jamais remise** |
| `TRANSFER` | `20c:415`, `630` | `R.plan` (appelé par `enterSystem`, un contrat local, une mission locale) ; fin de `WARPOUT` |
| `APPROACH` | `20c:508`, `20q:214` | fin du profil de transfert ; forcée au démarrage de la partie (missions) |
| `ORBIT` | `20c:468`, `649` | fin du couloir d'approche ; `649` = outil de test |
| `DEPART` | `20c:480` | après l'escale, via `afterEscale` |
| `COAST` | `20c:533` | fin du profil de départ |
| `JUMP` | `20c:582` | après `COAST`, si saut quantique et carburant suffisant |
| `WARP` | `20c:590` | après `COAST`, sinon si distorsion |
| `HOP` | `20c:576`, `593` | sans cible suivante, ou sans moyen de saut |
| `WARPOUT` | `20c:621` | fin de la distorsion, juste avant le transfert |

Cycle normal : `TRANSFER` → `APPROACH` → `ORBIT` → `DEPART` → `COAST` → (`JUMP` \| `WARP` → `WARPOUT` \| `HOP`) → `TRANSFER`. Le retour de `JUMP` et de `HOP` passe par `enterSystem` → `plan` (`20c:187-190`, `633-640`), qui repose `TRANSFER`.

Lecteurs hors `20c` : `20e` (libellés de la carte, report de cible pendant un passage), `20h` (coupe les gros plans en `WARP`, `WARPOUT`, `HOP`), `20g` (autorise, lance ou abrège le survol), `20f` (effets de coque), `20q` (ouvre le tableau de missions en `ORBIT`).

### 2.2 États de partie

| État | Valeurs | Affecté par | Remarque |
|---|---|---|---|
| `gameStarted` | `false` puis `true` | `startGame` (`42:157`) | jamais remis à `false` |
| `gamePaused` | `false`/`true` | `enterPause` (`24:96`), `resumeGame` (`24:109`) | **seul** mécanisme qui gèle la simulation (`41:102`) |
| `worldReadyForCinematic` | `false` puis `true` | `finish()` (`42:149`) | lu seulement par `41` |
| `flightPhase` | `'CRUISE'`, `'ARRIVAL_PAUSE'` | `20c:468` (ARRIVAL_PAUSE), `36:430` et `20c:649` (CRUISE) | **dédouble `ORBIT`** : `ARRIVAL_PAUSE` = escale en cours, `CRUISE` = escale finie, attente du départ |
| `orbitState.active` | `false`/`true` | `startOrbitDelivery` (`33:124`), fin d'escale (`36:432`) | suit `ARRIVAL_PAUSE` sauf `20c:649` ; seul lecteur : `26:84` |
| `pauseTimer`, `arrivalSkip`, `arrivalTimeScale` | durée, booléen, 1 ou 4,5 | `36`, `23:253`/`258` | pilotent la fin d'escale (36 s + radio + navettes, ou plafond de 90 s) |
| `jumpState` | objet ou `null` | créé en `20c:583`, détruit en `28:118` | **déclenché automatiquement** après `COAST`, jamais par le joueur ni par la carte |
| `cameraMode` | 0 à 3 (`tracking`, `sequence`, `distant`, `closeup`) | `nextCameraMode` (`23:362`) | un réglage de caméra, pas un mode d'interaction |
| `manual` | booléen | `36:53` à chaque image | pilotage manuel ou autopilote |
| `SHIP_SELECT_OPEN` | booléen | `42:201` (ouvre), `42:301` (ferme) | |
| `REAL.started`, `REAL.mission`, `REAL.titleActive` | | `20c:188`, `412`, `141`/`146`/`174` | `started` et `mission` ne sont jamais réinitialisés |

Cycle de l'escale (lu) : `arriveOrbit` (`20c:455-468`) → `startOrbitDelivery` (`33:99`) → `flightPhase = 'ARRIVAL_PAUSE'` et `REAL.phase = 'ORBIT'` → `updateOrbitDelivery` à chaque image (`36:112`) → fin d'escale (`36:426-445` : `flightPhase = 'CRUISE'`, `orbitState.active = false`) → `afterEscale` → `DEPART`.

Durées du saut (`WARP_T`) : charge 3,4 s, pli 1,25 s, éclair 0,32 s, onde 1,7 s, soit 6,67 s. La propriété `jumpState.phase` n'est jamais modifiée après `'charge'` : les tests sur `'fold'` (`20f:180`, `239`) sont du code mort ; la phase réelle se déduit de `jumpState.t`.

### 2.3 Autres séquences et sous-états

| Objet | Valeurs | Remarque |
|---|---|---|
| `TITLE` (`20i`) | actif tant que `S.on` ; segments `path`, `transit`, `turn` | ne se termine que par `startGame` (`42:158`) |
| `SURVOL` (`20g`) | `S.active` ; segments `transit`, `fly`, `back` | lancé par `G` ou automatiquement (`20g:117`) ; refusé en `APPROACH`, `WARP`, `WARPOUT`, `HOP`, pendant un saut |
| `GP.state.auto` (`20h`) | `shuttleLoad`, `shuttleFollow` | plans automatiques d'escale ; hors `ARRIVAL_PAUSE` ils n'existent pas |
| Plans du mode `closeup` | `engine`, `geode`, `rings`, `bow`, `dolly`, `dock` | réglage de caméra |
| Navettes | `outbound`, `returning`, `enter` | mouvements internes à l'escale |
| Chargement | `exit`, `toStack`, `approach`, `pick`, `clear` | idem |
| `MISSIONS` (`20q`) | `enabled`, `active`, `offers`, `pendingGo`, `delivering`, `done[]` | **aucun champ d'état de cycle** ; surcouche sur l'escale |
| `PORTS`, `CARGO`, `LOCAL` | | aucune machine à états ; `LOCAL` ne gère que deux overlays |

## 3. Entrées

Aucun écouteur `touch*`, `wheel`, `mouse*` dans le jeu (seule la carte en a, dans son module). Le tactile passe par les événements de pointeur.

### 3.1 Clavier : huit enregistrements

| Id | Où | Capture | Touches | Gardes |
|---|---|---|---|---|
| K1 | `20e:87` | oui | celles de la carte (Échap, M, flèches, +/−, Entrée, Retour, C) | carte ouverte ; n'avale l'événement que si la carte le traite |
| K2 | `20g:158` | oui | **toute touche** pendant le survol ; `G` pour le lancer | `gameStarted` ; **pas de garde `gamePaused`** |
| K3 | `42:311` | oui | flèches, Entrée, Espace du choix de vaisseau | existe seulement pendant le dialogue |
| K4 | `42:78` | non | flèches, Entrée, Espace de l'écran-titre | écran-titre affiché |
| K5 | `23:233` | non | gestionnaire principal : Espace, Entrée, Échap, P, Pause, M, `;`, H, I, L, V, Tab, F1-F10, et tout le pilotage | **aucun test `gameStarted`** ; Espace, Entrée, Échap/P et M **avant** le retour de pause, le reste après |
| K6 | `23:351` | non | relâchement : remet `keys[code]` à faux | aucune |
| K7, K8 | `24:191`, `197` | non | Ctrl : recentrage du regard libre | aucune |

Pointeur : glisser sur le canevas (`24:211-213`, sans garde de pause), barre d'icônes (`26:225`), joystick tactile (`26`), boutons des panneaux ; le survol abrège sur clic (`20g:163`, capture).

### 3.2 Matrice brute pour T0.2

Ordre d'exécution : K1, puis K2 (capture), puis K3 si ouvert, puis K5 / K4.

| Touche | Comportement relevé |
|---|---|
| **Échap** | carte ouverte : la ferme (K1) ; survol : l'abrège (K2) ; sinon, en pause : **recharge la page sans confirmation** (`24:117`) ; hors pause : `enterPause` (sans effet avant `gameStarted`) |
| **Espace** | carte ouverte : la ferme ; survol : l'abrège ; en pause : reprend ; en `ARRIVAL_PAUSE` : `arrivalSkip = true` ; sinon : propulsion (`keys['Space']`) ; sur le titre : démarre (K4) |
| **Entrée** | carte : action sur la sélection (K1) ; en pause : reprend ; `ARRIVAL_PAUSE` : `arrivalSkip` ; choix de vaisseau : confirme (K3) |
| **M**, `;` | traité **avant** le retour de pause : ouvre ou ferme la carte, **même en pause** |
| **G** | K2 seulement : lance le survol si `gameStarted` et carte fermée ; pas de garde de pause |
| **P**, **Pause** | comme Échap sans quitter : ferme la carte, ou pause ; inertes en pause |
| **H, V, I, L, Tab, F1-F10** | K5, après le retour de pause, **sans garde `gameStarted`** : agissent aussi sur l'écran-titre et le choix de vaisseau |
| **J** | aucun gestionnaire |

## 4. Fenêtres, overlays et panneaux

Il n'existe aucun objet « scène » : chaque fenêtre porte son propre drapeau (classe CSS ou `display`).

| Fenêtre | Ouverture | Fermeture | Gèle la simulation ? | z-index |
|---|---|---|---|---|
| Générique `#boot` | au chargement | `finish()` (`42`) | non (avant le monde) | 5 |
| Écran-titre | `finish()` | `selectLanguageAndStart`, ou `__sttQuickStart` | non (travelling seul) | 6 |
| Choix du vaisseau | `openShipSelect` (`42:200`) | `confirm()` (`42:299`) | non | 9000 |
| **Pause** | `enterPause` (`24:94`), Échap/P | `resumeGame`, ou `quitToTitle` = rechargement | **oui** (`gamePaused`, `41:102`) | 7 |
| **Carte stellaire** (M) | `openStarMap` (`28:42`) | `closeStarMap`, Échap, M, clic hors panneau | **non** : la simulation continue dessous | 12 |
| Survol (G) | `start()` (`20g:85`) | `skip()` sur toute touche ou clic | non (prend la caméra) | |
| Aide (H), audio (V) | bascule (`26`, `23`) | idem | non | 6 |
| Radio, services du port, télémétrie, panneaux HUD | F1-F10, I, L, ou automatique | idem | non | |
| Tableau des contrats, chantier naval (`20d`) | `openContractBoard`, rappelé par `afterEscale` | `closeContractBoard`, `closeShipyard` | non ; **pas de bouton de fermeture ni de clavier** | 6 |
| Tableau des missions (`20q`) | `openBoard`, automatique en `ORBIT` + `ARRIVAL_PAUSE` | `closeBoard` | non ; **pas de bouton de fermeture ni de clavier** | **9, au-dessus de la pause (7)** |

## 5. Écarts avec le plan et pièges relevés

Cinq affirmations du plan sont corrigées ; elles reposaient sur des commentaires du code qui ne sont plus vrais.

| # | Le plan disait | Réalité |
|---|---|---|
| 1 | La carte stellaire réutilise `gamePaused` | **Faux depuis la v2.17.** `gamePaused` n'est affectée qu'en `24:96` et `109`. Les commentaires de `23:247-273` sont périmés. La simulation **continue** sous la carte ouverte. |
| 2 | Scène `dialog` pour la panne de carburant | **Elle n'existe pas.** `fuel = 0` change seulement le style de la jauge (`36:205-206`) et refuse le saut (`20c:578`). `FUEL_EMPTY_SPEED_SCALE` (`27:27`) n'est jamais lue. Le dialogue décrit dans `TODO.md` (2026-09-20) n'est pas implémenté. |
| 3 | Scène `gameOver` | **Elle n'existe pas.** « Quitter » est un `location.reload()` (`24:117`). |
| 4 | Saut quantique déclenché par le joueur (`flight → jump`) | Le saut est **automatique** après `COAST` (`20c:538`, `582`) ; ni le joueur ni la carte ne le déclenchent. |
| 5 | `flight` regroupe toutes les phases de `REAL.phase` | `ORBIT` est **dédoublé** par `flightPhase` ; `IDLE` est mort ; `APPROACH` est la seule phase qui lit le pilotage. |

Pièges réels, qui justifient la refonte mieux que la pause « détournée ». **Corrigés ensuite par la tâche T0.4** (sauf les n°s 7, 8 et 10 conservés volontairement : voir les décisions au [§6 de la matrice](./PLAN-scenes-T0.2-matrice.md#6-défauts--décisions-et-comportement-corrigé)) ; la liste ci-dessous décrit le comportement d'origine de `stt_v2.17.0` :

1. **Aucune garde `gameStarted` dans le clavier principal** : H, V, I, L, Tab et F1-F10 agissent sur l'écran-titre et le choix du vaisseau (déduit pour l'affichage ; lu pour l'absence de garde).
2. **Le choix du vaisseau n'isole pas le clavier** : seules ses propres touches sont arrêtées, Échap, P, M, H… passent à K5.
3. **`M` est traité avant le retour de pause** (contrairement à H, I, L, V) : la carte s'ouvre au-dessus de la pause, et Échap ne ferme alors que la carte.
4. **Le survol avale toute touche**, y compris Échap, P et Espace, et n'a pas de garde de pause : la pause est inaccessible pendant un survol.
5. **Échap quitte la partie sans confirmation**, et sert aussi à fermer la carte et à abréger le survol.
6. **Tableaux de contrats et de missions sans fermeture ni clavier** ; le tableau des missions (z 9) recouvre la pause (z 7).
7. **Pause possible pendant un saut et pendant l'orbite** : `enterPause` ne teste que `gameStarted` (`24:95`).
8. **`M` détecté par `e.code` dans K5 et par `e.key` dans K1** : deux chemins pour la même action.
9. **Touches de pilotage non avalées sous la carte** : le vaisseau peut être dirigé pendant que la carte est ouverte (déduit).
10. **Espace dans le choix du vaisseau** (trouvé par T0.3) : `K3` n'appelle que `stopPropagation()` pour Espace (`42:295`), sans `preventDefault()`. Le focus passe sur « Confirmer » 60 ms après l'ouverture (`42:316`) : Espace déclenche alors l'activation native du bouton et **démarre la partie**. Avant ces 60 ms, le focus est sur la page et Espace ne fait rien (sondé en exécution).
11. **Commentaires périmés** : `23:247-273` (carte et pause), `26:5` (caméra = F3).

### Combinaisons possibles (lu, sauf mention)

| Combinaison | Possible ? |
|---|---|
| pause + saut | oui |
| pause + orbite | oui (gel total, synthèse vocale suspendue) |
| pause + carte | `M` ouvre la carte en pause (déduit de l'ordre des tests) |
| carte + saut, carte + orbite | oui ; la simulation avance dessous |
| carte + survol | `G` refusé carte ouverte ; l'inverse non vérifié |
| saut + survol | exclu |
| saut + `ARRIVAL_PAUSE` | impossible (`20c:480-538`, `582`) |
| `orbitState.active` ≠ `ARRIVAL_PAUSE` | seulement via `20c:649` (outil de test) |
| pause ou carte avant `gameStarted` | impossible |

## 6. Table des scènes corrigée

Remplace la table du §3 du plan. Légende : **base** = scène principale ; **modale** = se superpose.

| Scène | Remplace | Type | Gèle dessous ? | Remarques vérifiées |
|---|---|---|---|---|
| `boot` | générique | base | n/a | `42` |
| `title` | `!gameStarted`, `TITLE`, `updateTitleCinematic` | base | n/a | ne se termine que par `startGame` ; reçoit aujourd'hui les touches H, V, I, L, F… (piège 1) |
| `shipSelect` | `SHIP_SELECT_OPEN` | modale sur `title` | non | ne doit pas laisser passer les touches (piège 2) |
| `flight` | `REAL.phase` ∈ `TRANSFER`, `APPROACH`, `DEPART`, `COAST`, `HOP` ; `flightPhase = 'CRUISE'` hors escale | base | n/a | `APPROACH` seule à lire le pilotage ; `IDLE` à supprimer |
| `orbit` | `REAL.phase = 'ORBIT'`, `flightPhase`, `orbitState.active`, plans automatiques, navettes | base | n/a | inclut l'attente `CRUISE` + `ORBIT` avant `afterEscale` ; le tableau des missions est un panneau, pas une scène |
| `jump` | `jumpState`, lentille `WARP` | base | n/a | **automatique** après `COAST` ; 6,67 s ; couvre aussi `WARP` et `WARPOUT` (séquences d'affichage) |
| `flyover` | `SURVOL` | modale | non | avale toute touche ; lancé par `G` ou automatiquement |
| `starMap` | `isStarMapOpen()` | modale | **non** : la simulation continue | **ne touche pas `gamePaused`** ; les commandes de pilotage restent actives dessous (déduit) |
| `pause` | `gamePaused` | modale | **oui** | Échap quitte par rechargement, sans confirmation |

**Supprimées** : `dialog` (aucune panne de carburant) et `gameOver` (aucun écran de fin). **Panneaux HUD, pas des scènes** : aide (H), audio (V), télémétrie, radio, services du port, tableaux de contrats, de missions et chantier naval.

## 7. Entrées pour T0.2 (matrice scène × touche)

- La matrice du §3.2 est la base ; chaque cas « déduit » doit être **testé** au lot 0 (T0.3) avant d'être figé : `M` en pause, survol en pause, H et V sur le titre, pilotage sous la carte.
- Cas à trancher avec le mainteneur avant de figer le comportement cible : conserver ou corriger les pièges 1 à 6 (ce sont des défauts, pas des comportements voulus).
- Incertitudes restantes : listeners clavier propres aux overlays `20d` et `20q` non lus ; CSS de la carte (masque-t-elle la scène 3D ?) non lu.
