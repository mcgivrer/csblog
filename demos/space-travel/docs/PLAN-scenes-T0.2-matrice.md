# T0.2 — Matrice scène × touche (comportement actuel)

| | |
|---|---|
| **Tâche** | T0.2 du [plan Scene](./PLAN-scenes.md) (lot 0), rôle architecte |
| **Entrée** | [Inventaire T0.1](./PLAN-scenes-T0.1-inventaire.md) (§3.2 : données brutes) |
| **Base** | jeu `stt_v2.17.0` |
| **Date** | 2026-10-03 |
| **Statut** | Matrice écrite ; les cas « (D) » sont à tester en T0.3 avant d'être figés |

Cette matrice décrit ce que le jeu **fait aujourd'hui**, défauts compris. Elle sert de test de non-régression pour les lots suivants. Ce n'est pas le comportement cible : les défauts sont marqués ⚠ et renvoient aux pièges de l'inventaire (§5), dont la décision (corriger ou conserver) appartient au mainteneur.

## 1. Conventions

- Scènes et sous-états : ceux de la table corrigée du plan (§3). `flight` est scindée en deux colonnes, car seule la phase `APPROACH` lit le pilotage (`20c:508-512`) ; dans `TRANSFER`, `DEPART` et `COAST`, `REAL.flight` remet la vitesse angulaire à zéro et impose la position (`20c:500-504`).
- Cellule : ce qui se passe quand la touche est pressée dans cette scène. « — » : aucun effet visible. **(D)** : déduit du code, non exécuté, à tester en T0.3. Sans marque : lu dans le code.
- Ordre d'exécution des gestionnaires : K1 (carte, capture), K2 (survol, capture), K3 (choix du vaisseau, capture), puis K5 / K4 (voir inventaire §3.1). Un gestionnaire peut avaler l'événement.
- « Pilotage » = flèches, Z/Q/S/D, W/A, E, R, Maj, glisser de la souris.

## 2. Touches à effet global

| Touche | `boot` | `title` | `shipSelect` | `flight` hors `APPROACH` | `flight` `APPROACH` | `orbit` | `jump` | `flyover` | `starMap` | `pause` |
|---|---|---|---|---|---|---|---|---|---|---|
| **Échap** | — (pause refusée, `24:95`) | — idem | — idem (D) | **pause** | **pause** | **pause** | **pause** | abrège le survol | ferme la carte | ⚠ **recharge la page, sans confirmation** |
| **Espace** | — (D) | choisit la langue (K4) | avalé par K3, ne confirme pas | propulsion (`keys['Space']`) | idem | **abrège l'escale** (`arrivalSkip`) | — | abrège le survol | ferme la carte | **reprend** |
| **Entrée** | — (D) | choisit la langue (K4) | **confirme** le vaisseau (K3) | — | — | **abrège l'escale** | — | abrège le survol | **action sur la sélection** de la carte (K1) | **reprend** |
| **M** (ou `;`) | — (D) | — (`openStarMap` exige `gameStarted`) | — (D) | ouvre la carte | ouvre la carte | ouvre la carte | ouvre la carte | abrège le survol | ferme la carte | ⚠ **ouvre la carte au-dessus de la pause** (D) |
| **G** | — (`gameStarted`) | — | — | lance le survol | refusé (`20g:87`) | lance le survol | refusé | abrège le survol | refusé (carte ouverte) | ⚠ lance le survol sous la pause (D) |
| **P**, **Pause** | — | — | — (D) | pause | pause | pause | pause | abrège le survol | ferme la carte | — (aucun effet) |

Notes :
- `G` : `start()` refuse seulement pendant un saut, en `APPROACH`, `WARP`, `WARPOUT`, `HOP`, avec la caméra de distorsion tenue, ou sans planète (`20g:86-87`). Il est donc aussi refusé dans la phase `HOP` rangée sous `flight`, et il est **accepté en `orbit`**.
- `title`, `Échap` : `preventDefault` est appelé mais `enterPause` refuse tant que `gameStarted` est faux (`24:95`).
- `jump` : `enterPause` ne teste que `gameStarted`, la pause est donc possible pendant un saut (T0.1 §5, piège 7) ; `jumpState.t` est alors gelé (D).
- `starMap`, `Espace` : K1 ne traite pas l'espace, c'est K5 qui ferme la carte (`23:251`).
- `starMap`, `Entrée` : K1 avale l'événement quand une cible est sélectionnée ; la branche « fermer » de K5 (`23:255`) n'est donc atteignable que sans sélection (D).
- `orbit` : `arrivalSkip` n'agit que si `flightPhase === 'ARRIVAL_PAUSE'` ; pendant l'attente du départ (`CRUISE` + `ORBIT`) ces touches n'ont plus d'effet.

## 3. Panneaux et bascules

Ces touches sont traitées par K5 **après** le retour de pause et **sans garde `gameStarted`** (T0.1 §5, piège 1).

| Touche | Effet | `boot` | `title` | `shipSelect` | `flight`, `orbit`, `jump` | `flyover` | `starMap` | `pause` |
|---|---|---|---|---|---|---|---|---|
| **H** | aide (overlay) | ⚠ agit (D) | ⚠ agit (D) | ⚠ agit (D) | agit | abrège le survol | agit, sous la carte (z 6 < 12) | — (retour de pause) |
| **V** | réglage du son (overlay) | ⚠ agit (D) | ⚠ agit (D) | ⚠ agit (D) | agit | abrège le survol | agit | — |
| **I**, **L** | panneaux itinéraire, Lagrange | ⚠ agissent (D), HUD masqué | ⚠ idem | ⚠ idem | agissent | abrège | agissent | — |
| **Tab**, **F7** | canal radio | ⚠ agit (D) | ⚠ agit (D) | ⚠ agit (D) | agit | abrège | agit | — |
| **F1** à **F6** | panneaux du HUD | ⚠ (D) | ⚠ (D) | ⚠ (D) | agissent | abrègent | agissent | — |
| **F8** | services du port | — | — | — | **inerte hors de portée d'un port** (`26`) | abrège | idem | — |
| **F9** | mode de caméra suivant | ⚠ (D) | ⚠ (D) | ⚠ (D) | agit | abrège | agit | — |
| **F10** | coupe la voix | ⚠ (D) | ⚠ (D) | ⚠ (D) | agit | abrège | agit | — |

Notes :
- Sur `title` et `shipSelect`, le HUD est masqué (`body.title-active`) : les bascules agissent sur des panneaux invisibles, sauf l'aide et le son, qui sont hors de `#hud` (D).
- J : aucun gestionnaire dans le jeu.

## 4. Pilotage et souris

| Scène | Flèches, Z/Q/S/D, E/R, glisser | Effet |
|---|---|---|
| `boot`, `title`, `shipSelect` | flèches : choix de langue (`title`, K4) ou de vaisseau (`shipSelect`, K3) ; le reste est mémorisé dans `keys[]` sans effet | — |
| `flight` hors `APPROACH` | mémorisé ; `updateFlight` applique un couple (`36:63`), mais `REAL.flight` remet la vitesse angulaire à zéro et la position suit la trajectoire | effet visuel (RCS) au plus, trajectoire inchangée (D) |
| `flight` `APPROACH` | **pilote le couloir** : décalage latéral (`20c:511-513`) | réel, recentrage automatique au repos |
| `orbit` | ignoré (`paused` dans `updateFlight`, `36:42`) | — |
| `jump` | ignoré (`updateFlight` retourne tout de suite, `36:41`) | — |
| `flyover` | toute touche abrège ; clic sur le canevas aussi (`20g:163`) | abrège |
| `starMap` | flèches : déplacent la carte (K1) ; Z/Q/S/D, E/R, Maj non avalés | ⚠ le vaisseau reste pilotable sous la carte (D) |
| `pause` | non mémorisé (`23:300`) ; une touche tenue au moment de la reprise n'agit qu'après nouvel appui (D) | — |

La souris : glisser sur le canevas règle `dragYaw`/`dragPitch` (`24:213`, sans garde de pause ni de carte) ; avec Ctrl, ou en tactile avec le bouton de regard, il oriente la caméra libre.

## 5. Cas à tester en T0.3

Chaque cas « (D) » ci-dessus devient un cas de test ; les identifiants servent aux noms de tests. Procédures d'accès aux états, d'après les tests existants (`src/test/*_test.py`) : démarrage rapide `window.__sttQuickStart(id, opts)` ; avance du temps `window.__step(n, ms)` après avoir détourné `requestAnimationFrame` (voir `largage_test.py`) ; saut forcé par `opts.jump` ; événements clavier envoyés avec `page.keyboard.press`.

| Id | Cas | État à atteindre | Attendu aujourd'hui |
|---|---|---|---|
| K-ESC-PAUSE | Échap en vol | `__sttQuickStart` | `gamePaused === true` |
| K-ESC-QUIT | Échap en pause | après K-ESC-PAUSE | rechargement de la page |
| K-SPACE-RESUME | Espace en pause | après K-ESC-PAUSE | `gamePaused === false` |
| K-P-PAUSED | P en pause | après K-ESC-PAUSE | aucun changement |
| K-M-OPEN | M en vol | vol | carte ouverte, `gamePaused === false` |
| K-M-PAUSE | M en pause (D) | pause | carte ouverte au-dessus de la pause |
| K-ESC-MAP-PAUSE | Échap, carte ouverte en pause (D) | après K-M-PAUSE | carte fermée, jeu toujours en pause |
| K-MAP-SIM | la simulation avance sous la carte (D) | carte ouverte | position du vaisseau change |
| K-G-OK | G en `TRANSFER` ou `COAST` | vol | survol actif |
| K-G-APPROACH | G en `APPROACH` | forcer `REAL.phase` | refusé |
| K-G-PAUSE | G en pause (D) | pause | survol actif sous la pause |
| K-FLYOVER-ESC | Échap pendant un survol | survol | survol abrégé, pas de pause |
| K-SKIP-ORBIT | Espace en `ARRIVAL_PAUSE` | atteindre `ORBIT` (voir `largage_test.py`) | `arrivalSkip === true` |
| K-SKIP-CRUISE | Espace en `ORBIT` après l'escale | idem | aucun effet |
| K-PAUSE-JUMP | Échap pendant un saut (D) | `opts.jump`, attendre `jumpState` | pause, `jumpState.t` gelé |
| K-PAUSE-ORBIT | Échap pendant l'orbite | orbite | pause, voix suspendue |
| K-H-TITLE | H sur l'écran-titre (D) | titre | aide visible ou non |
| K-H-SELECT | H dans le choix du vaisseau (D) | `openShipSelect` | idem |
| K-SELECT-ESC | Échap, P, M dans le choix du vaisseau (D) | `openShipSelect` | sans effet sur la partie |
| K-SELECT-SPACE | Espace avalé par K3 | `openShipSelect` | pas de démarrage |
| K-H-PAUSE | H en pause | pause | aucun effet |
| K-F8-NOPORT | F8 hors de portée d'un port | vol | aucun effet |
| K-STEER-APPROACH | flèche en `APPROACH` | forcer `APPROACH` | décalage latéral change |
| K-STEER-TRANSFER | flèche en `TRANSFER` (D) | `TRANSFER` | trajectoire inchangée |
| K-STEER-MAP | Z sous la carte (D) | carte ouverte | vaisseau pilotable |
| K-STEER-PAUSE | touche tenue pendant la pause (D) | pause | sans effet à la reprise |

## 6. Ce que cette matrice ne couvre pas

- Les cas de la barre d'icônes à la souris ou au doigt (boutons de `26`) : même logique que F1-F9 ; à couvrir en T0.3 si le temps le permet.
- Le joystick tactile et les boutons de roulis (`26`) : ils injectent des `keys[]` virtuels.
- Les écouteurs clavier propres aux tableaux de contrats et de missions : non lus (T0.1 §7). Ces tableaux n'ont pas de gestionnaire clavier connu.
- La démo « Observation des étoiles » : elle a sa propre chaîne (`live2.js`, `__onKey`), traitée au lot 5.
