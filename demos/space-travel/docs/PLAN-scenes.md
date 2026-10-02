# Plan — réorganiser le moteur autour du concept de Scene

| | |
|---|---|
| **Base** | jeu `stt_v2.17.0` (`sources/`) ; la démo `ode_v7.19.1` est traitée au lot 5 |
| **Date** | 2026-10-02 |
| **Statut** | Plan proposé, rien n'est implémenté |
| **Rôle** | Spécification d'architecte, découpée en tâches pour le chef de projet (voir `AGENTS.md`, mode agentique) |
| **Liens** | Prolonge les propositions **C** (décomposer `animate()`) et **E** (état unique) du [DAT](./DAT.md) |

## 1. Pourquoi une Scene

Aujourd'hui, « dans quel état est le jeu ? » n'a pas de réponse unique. Le code le déduit de plusieurs drapeaux qui se recoupent (comptages sur `sources/src/JS/game`) :

| Drapeau ou état | Utilisations | Rôle réel |
|---|---|---|
| `jumpState` | 27 | saut quantique en cours |
| `gamePaused` | 15 | pause, **réutilisée par la carte stellaire** |
| `REAL.phase` | 14 | `IDLE`, `TRANSFER`, `APPROACH`, `ORBIT`, `DEPART`, `COAST`, `WARP`, `WARPOUT`, `HOP`, `JUMP` |
| `flightPhase` | 13 | `CRUISE` ou `ARRIVAL_PAUSE` |
| `cameraMode` | 13 | mode de caméra |
| `gameStarted` | 8 | le jeu a démarré (sinon : écran-titre) |
| `SHIP_SELECT_OPEN`, `orbitState.active`, `SURVOL` | 4, 3, 5 | choix du vaisseau, mise en orbite, survol du système |

Conséquences observées dans le code :

- **Pause détournée.** La carte stellaire (§23.3) réutilise `gamePaused`. Les gestionnaires d'ÉCHAP, ESPACE et ENTRÉE doivent donc tester `isStarMapOpen()` avant `gamePaused`, sinon la reprise se fait « sans fermer proprement la carte » (commentaire de `23-planification-relance-d-itineraire.js`).
- **Clavier éclaté.** Au moins 6 enregistrements de `keydown` dans 5 fichiers (`20e`, `20g`, `23`, `24`, `42` ×2), plus un gestionnaire de la barre d'icônes (`26`) cité dans un commentaire mais non localisé. Le survol doit se placer en phase de capture et appeler `stopImmediatePropagation()` pour passer devant les autres. Chaque ajout d'un écran oblige à toucher les autres gestionnaires.
- **`animate()` branche sur des drapeaux** (`gameStarted`, puis `gamePaused`) avec des blocs dupliqués entre titre et vol (voir DAT §4.3).
- **Ordre de chargement fragile** : `startGame()` rafraîchit la barre d'icônes « différée jusqu'ici car elle dépend d'`orbitState` et `ROUTE`, déclarés après », et 38 gardes `typeof X !== 'undefined'` colmatent ce couplage.
- **La démo répète le schéma** : `live2.js` enchaîne `selOpen`, `yardOpen`, `helpOpen`, `fleetOpen` et la carte dans un seul `__onKey` à retours anticipés.

**Objectif** : une seule réponse à « quelle scène est active ? », avec pour chaque scène ses entrées, sa mise à jour, son rendu et son interface, et des transitions explicites.

## 2. Concept et vocabulaire

> **Nom dans le code.** `scene` (minuscule) est déjà l'objet `THREE.Scene` du moteur (`05-scene-three-js.js`) et `LAYERS.sysScene` son équivalent système. Pour éviter toute confusion, le concept s'appelle **`GameScene`** et son gestionnaire **`SCENES`**. Dans ce document, « scène » désigne `GameScene`.

Une **scène** est un *mode d'interaction et d'affichage* du jeu : ce que le joueur voit, ce que les touches font, ce qui avance dans le temps. Elle se distingue de deux notions voisines :

- une **phase de vol** (`REAL.phase`) est un *mouvement* à l'intérieur d'une scène, pas un mode d'interaction : elles deviennent des **sous-états** de la scène de vol ;
- un **panneau HUD** (radio, services portuaires, plan de vol) est un *élément d'interface* : une scène déclare quels panneaux elle affiche, elle ne les remplace pas.

### 2.1 Contrat d'une scène

```js
GameScene = {
  name: 'orbit',
  modal: false,                // vrai : se superpose à la scène dessous
  freezesBelow: true,          // la scène dessous ne reçoit plus update()
  rendersBelow: true,          // la scène dessous reste dessinée (fond de la pause)
  ui: ['speed', 'radio', 'port'],   // panneaux affichés (remplace body.title-active, repositionAllPanels…)
  enter(params, from) {},      // initialise ; params passés par la transition
  exit(to) {},                 // libère ce qu'elle a créé (aussi : fuites mémoire)
  update(dt, elapsed) {},      // avance la simulation de la scène
  render() {},                 // facultatif ; sinon rendu par défaut (renderMain)
  onKey(e) { return false; },  // vrai = touche consommée
  onPointer(e) { return false; },
  onResize() {}
}
```

### 2.2 Gestionnaire `SCENES`

- **Pile** : une scène de base (titre, vol, orbite, saut…) plus des scènes modales empilées (pause, carte, aide, services). `push`, `pop`, `replace(name, params)`.
- **Une seule boucle** : `animate()` ne fait plus que `SCENES.update(dt)` puis `SCENES.render()`. Le gestionnaire met à jour la scène du haut, et celles du dessous seulement si la scène du haut ne les gèle pas (`freezesBelow`).
- **Un seul répartiteur d'entrées** : un seul `keydown`, un seul `keyup`, un seul jeu d'événements de pointeur, à la fenêtre, qui appellent `onKey`/`onPointer` de la scène du haut puis, si elle ne consomme pas, celles du dessous non gelées. Plus de phase de capture ni de `stopImmediatePropagation`.
- **Table des transitions** déclarée à un seul endroit : un changement de scène hors de cette table est refusé et journalisé.
- **Événements** `SCENES.on('enter'|'exit', fn)` pour l'audio, la musique, les tests.

### 2.3 Rendu et post-traitement

`renderMain()` (`28-propulsion-quantique-et-carte.js`) applique globalement la lentille de saut (`WARP`) et la profondeur de champ (`GP.dof`). Cela reste **hors des scènes** : c'est un étage du rendu par défaut, que `JumpScene` pilote en écrivant dans `WARP`/`GP`. Une scène ne remplace `render()` que si elle a un rendu vraiment différent (carte 2D, aperçu du vaisseau).

## 3. Inventaire des scènes

À valider au lot 0 : la liste vient de la lecture du code, pas d'exécution.

| Scène | Remplace aujourd'hui | Type | Sous-états / remarques |
|---|---|---|---|
| `boot` | générique, terminal (`42-…`, `finish()`) | base | |
| `title` | `!gameStarted`, `TITLE.tick`, `updateTitleCinematic` | base | choix de la langue |
| `shipSelect` | `SHIP_SELECT_OPEN` | modale sur `title` | |
| `flight` | `flightPhase === 'CRUISE'`, `REAL.phase` mouvement | base | sous-états `IDLE`, `TRANSFER`, `COAST`, `DEPART`, `APPROACH`, `HOP`, `WARP`, `WARPOUT` |
| `orbit` | `ARRIVAL_PAUSE`, `orbitState.active`, navettes, plans de coupe | base | sous-état `ORBIT`, tableau des missions, livraison, ports |
| `jump` | `jumpState`, lentille `WARP` | base | charge, pli, éclair, onde |
| `flyover` | `SURVOL` (touche `G`) | modale | annulée par toute touche ou clic |
| `starMap` | `isStarMapOpen()` + `gamePaused` détourné | modale | **fin du détournement de la pause** |
| `pause` | `gamePaused` | modale, gèle tout | ÉCHAP vers l'écran-titre |
| `dialog` | panne de carburant, aide (H), télémétrie | modale | un type de scène paramétré |
| `gameOver` | « arrêter la partie » après confirmation | base | à confirmer |

Les services portuaires et le canal radio restent des **panneaux HUD** déclarés dans `ui` (ils s'affichent *pendant* `orbit`), pas des scènes.

### 3.1 Transitions proposées

```mermaid
stateDiagram-v2
  [*] --> boot
  boot --> title
  title --> shipSelect: Embarquer
  shipSelect --> title: Annuler
  shipSelect --> flight: Choix validé
  title --> flight: Démarrage rapide (tests)
  flight --> orbit: Arrivée à l'escale
  orbit --> flight: Départ
  flight --> jump: Saut quantique
  jump --> flight: Fin du saut
  flight --> flyover: Touche G
  flyover --> flight: Toute touche
  flight --> starMap: Touche M
  starMap --> flight: Fermeture
  flight --> pause: Échap
  orbit --> pause: Échap
  pause --> flight: Espace / Entrée
  pause --> title: Échap, confirmation
  flight --> dialog: Plus de carburant
  dialog --> flight: Aide reçue
  dialog --> title: Arrêter
```

La matrice « scène × touche → résultat » (ÉCHAP, ESPACE, ENTRÉE, M, G, H, F1 à F9, I, L) sera écrite au lot 0 à partir du comportement **actuel** et sert de test d'acceptation de chaque lot suivant.

## 4. Organisation du code cible

```
sources/src/JS/
├── game/                      moteur : monde, vol, rendu (inchangé pour l'essentiel)
├── demo/                      modules repris de la démo
└── scenes/                    NOUVEAU, ajouté à ORDER.txt après le moteur, avant la boucle
    ├── scene.js               contrat + gestionnaire SCENES + répartiteur d'entrées
    ├── boot.js  title.js  ship-select.js
    ├── flight.js  orbit.js  jump.js
    └── flyover.js  star-map.js  pause.js  dialog.js  game-over.js
```

Règles :
- le fichier d'une scène **porte le nom de la scène** (aujourd'hui la boucle est dans `41-animation-des-systemes-planetaires.js`, le vol dans `36-inertie-de-rotation.js`) ;
- une scène s'**enregistre elle-même** (`SCENES.register(...)`) : disparition progressive des gardes `typeof` ;
- une scène ne touche pas directement aux drapeaux des autres : elle demande une transition ;
- on garde le build par concaténation et le livrable HTML unique ; pas de nouvelle dépendance.

## 5. Stratégie : étranglement progressif

On ne réécrit pas. Chaque lot est livrable, testé, et laisse le jeu jouable. Les anciens drapeaux restent en **accesseurs dérivés** (`gamePaused`, `gameStarted`…) tant qu'un consommateur existe, puis sont supprimés au lot 4.

| Lot | Contenu | Critère de sortie |
|---|---|---|
| **0 — Filet de sécurité** | Inventaire des états (vérifier la table du §3) ; matrice scène × touche ; test Playwright de caractérisation qui rejoue la matrice sur le jeu **actuel** ; documenter `PLAYWRIGHT_BROWSERS_PATH` | Matrice verte sur `stt_v2.17.0`, sans modifier le jeu |
| **1 — Squelette** | `scenes/scene.js` : contrat, pile, transitions, événements ; scènes **adaptateurs** qui enveloppent les drapeaux existants ; `animate()` appelle `SCENES.update/render` mais la logique reste en place ; `gameStarted`/`gamePaused` deviennent des accesseurs | Aucun changement de comportement ; matrice verte ; test de fumée vert |
| **2 — Entrées** | Répartiteur unique ; migration des 6 gestionnaires `keydown`, des `keyup` et des pointeurs vers `onKey`/`onPointer` ; suppression de la capture et de `stopImmediatePropagation` | Matrice verte ; plus qu'un seul `addEventListener('keydown')` dans `sources/` |
| **3 — Extraction** | Une scène par PR, du plus simple au plus risqué : `pause`, `starMap` (fin du détournement), `flyover`, `shipSelect`, `title`, `boot`, `dialog`, puis `orbit`, `jump`, enfin `flight` avec sa machine à sous-états | Chaque PR : matrice + test de fumée + test propre à la scène ; `orbit` : tests largage, ports, missions inchangés |
| **4 — Nettoyage** | Supprimer les anciens drapeaux et gardes `typeof` devenus inutiles ; panneaux HUD pilotés par `ui` (retirer `body.title-active`, `repositionAllPanels` ad hoc) ; renommer les fichiers selon leur contenu ; mettre à jour `ORDER.txt` | Plus de lecture directe d'un ancien drapeau ; `grep` de contrôle vide |
| **5 — Démo** | Appliquer le même schéma à `live2.js` (`boot`, `title`, `run` avec modes Auto/Suivre, `map`, `selector`, `yard`, `fleet`, `help`, `paused`), idéalement avec le module `scenes/scene.js` **partagé** (proposition B du DAT) | Les scripts de test de la démo qui touchent au clavier (`selector`, `map`, `map-api`, `military-2`…) passent ; tag `ode_v7.x` |

Chaque lot se termine par une version taguée (`stt_vX.Y.Z`, voir `CLAUDE.md`) quand il change le comportement observable ; les lots 0, 1 et 2 n'en changent aucun et peuvent être regroupés dans une même version.

## 6. Découpage en tâches (pour le chef de projet)

| Id | Tâche | Rôle | Dépend de | Critère d'acceptation |
|---|---|---|---|---|
| T0.1 | Inventaire des états et valeurs réelles de `REAL.phase`, `flightPhase`, `orbitState` | Développeur | — | Table du §3 confirmée ou corrigée |
| T0.2 | Matrice scène × touche (comportement actuel) | Architecte | T0.1 | Document relu, cas ambigus listés |
| T0.3 | Test de caractérisation Playwright de la matrice | Développeur | T0.2 | Vert sur `stt_v2.17.0` |
| T1.1 | `scenes/scene.js` : pile, transitions, événements | Développeur | T0.3 | Tests unitaires de la pile et des transitions refusées |
| T1.2 | Scènes adaptateurs + accesseurs dérivés | Développeur | T1.1 | Matrice et fumée vertes |
| T2.1 | Répartiteur d'entrées unique | Développeur | T1.2 | Un seul `keydown` ; matrice verte |
| T3.x | Extraction d'une scène (x = pause, starMap, flyover, …) | Développeur, revue Architecte | T2.1 | Voir lot 3 |
| T4.1 | Nettoyage des drapeaux et gardes, renommage | Développeur | T3.* | `grep` vide, matrice verte |
| T5.1 | Application à la démo | Développeur | T4.1 | Voir lot 5 |

Revue de l'architecte à chaque PR : respect du contrat (§2.1), aucune lecture d'un drapeau d'une autre scène, aucune allocation ajoutée dans `update()` (voir DAT §4.3).

## 7. Risques

| Risque | Gravité | Parade |
|---|---|---|
| Régression de comportement subtile (pause, carte, arrivée) | Élevée | Matrice de caractérisation dès le lot 0 ; un lot = un comportement inchangé |
| `flight`/`orbit` : sous-états très entremêlés (`REAL.phase` lu à 14 endroits, `orbitState` sur une vingtaine de champs) | Élevée | Faire `flight` et `orbit` en dernier ; commencer par des sous-états qui se contentent d'envelopper l'existant |
| Temps : `orbit` utilise `arrivalTimeScale` et des chronos propres, tandis que la pause gèle tout via un `dt` à zéro | Moyenne | Tests de pause pendant l'orbite ; la proposition D du DAT (pas de temps fixe) vient **après** ce plan |
| Confusion `scene` / `GameScene` | Faible | Nommage du §2 ; revue de code |
| Audio et radio (synthèse vocale, musique) non couverts par les tests | Moyenne | Événements `enter`/`exit` pour couper ou reprendre ; test manuel listé en lot 3 |
| Surcoût de la couche scènes | Faible | Une seule indirection par image ; mesure avant/après au lot 1 |

## 8. Hors périmètre

- Pas de pas de temps fixe ni de refonte du temps (DAT, proposition D).
- Pas de modules ES ni de nouveau bundler (DAT, proposition H).
- Pas de changement d'interface visible : les panneaux, touches et séquences restent identiques.
- Pas de réécriture de la logique de vol, d'orbite ou de saut : seules leurs entrées, sorties et frontières changent.

## 9. Questions ouvertes

1. **Granularité** : `orbit` doit-elle rester une scène unique (arrivée, livraison, missions, ports) ou se scinder en `arrival`, `delivery` et `missionBoard` ?
2. **Pause** : la pause doit-elle aussi couper la musique et la synthèse vocale ? Le comportement actuel est à relever au lot 0.
3. **`gameOver`** : existe-t-il aujourd'hui un vrai écran de fin, ou seulement le retour à l'écran-titre après confirmation ?
4. **Ordre avec le DAT** : faire ce plan (C + E) avant la proposition A (hygiène du dépôt), ou l'inverse ? Je recommande A en premier : le dépôt allégé facilite les revues de ce plan.
