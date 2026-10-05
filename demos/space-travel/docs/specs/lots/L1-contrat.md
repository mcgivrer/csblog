# L1 — Console de bord : contrat technique (ARCHI)

Branche `worktree-stt-L1-console`, cible `stt_v2.19`. Références : SPEC-010 § 1.8, § 2.3–2.4, § 4 décision 5 (F1–F8 → onglets, HUD en touches `1`…`8`, **validée** ; décision du mainteneur 06/10 : sans Alt). Chemins relatifs à `demos/space-travel/sources/`.
Invariants : contenus et logique des overlays **hébergés, pas réécrits** (ids DOM et états `visible` / `display:flex` / `on` conservés : les tests existants les lisent) ; la console ne met pas en pause ; aucune globale hors de `CONSOLE` ; 4 langues ; *Partie libre* inchangée hors ouverture des panneaux ; pas de modification de `index.template.html` ni de `main.css` (CSS injectée par JS, comme `shared/starmap.js`).

## 1. Inventaire réel des overlays (7 nœuds, 6 « overlays » de la fiche)

| Onglet L1 | Nœud DOM | Naît | Ouvert / fermé par | Touche actuelle |
|---|---|---|---|---|
| Navigation | `#stmMap` (classe `on`) | `shared/starmap.js:88` (créé en JS) | `openStarMap`/`closeStarMap` `28:41-43` → `__STARMAP.open/close` `starmap.js:537-547` ; clavier capté en capture `20e:87` (`__STARMAP.key` `starmap.js:555` : Échap/M ferment) | M / `Semicolon` (`23:288`), F-slot aucun |
| Missions | `#missionBoardOverlay` (`style.display='flex'`) | `20q:129` (`ensureDom`, JS) | `MISSIONS.openBoard` `20q:139`, `toggleBoard` `:158`, `closeBoard(byUser)` `:154` ; **auto** à l'escale (`MISSIONS.afterEscale`) | J (`23:295` → `26:122`) |
| Missions | `#contractBoardOverlay` (classe `visible`) | template `html:166` | `LOCAL.openContractBoard` `20d:101` ; `closeContractBoard` `20d:127` (non exportée) ; **auto** à chaque image par `REAL.afterEscale` `20c:512-517` (sans MISSIONS, sans saut) | aucune |
| Port | `#portPanel` (classe `visible`, `style.top` posé par `repositionPortPanel` `30:74`) | template `html:128` | `activateHudBarItem` kind `port` `26:109` (gardé par `isNearPortService` `26:89`) ; fermeture auto `refreshHudIconBar` `26:140` | F8 (slot 8 de `HUD_BAR_ITEMS`) |
| Chantier | `#shipyardOverlay` (classe `visible`) | template `html:155` | `openShipyard` `20d:151` / `closeShipyard` `20d:164` (non exportées), depuis `#shipyardOpenBtn` du Port | aucune |
| Aide · Réglages | `#helpOverlay` (classe `visible`) | template `html:87` | `26:115` (bascule) | H (`23:303`) |
| Aide · Réglages | `#audioOverlay` (classe `visible`) | template `html:243` | `toggleAudioPanel` `23:373` | V (`23:321`) |

Croix de fermeture : gestionnaire délégué `.panel-close-btn` `26:205-230` (inchangé). Journal : **aucun overlay n'existe** → pas d'onglet Journal en L1. `#pauseOverlay` (`html:261`) n'est pas migré.

## 2. Touches : existant et décision L1

| Touche | Aujourd'hui (`23:233-351`) | L1 |
|---|---|---|
| `Tab` | bascule le canal radio (`23:329`) | **console** sur le dernier onglet (bascule) ; radio → `7` + icône de la barre |
| `Échap` | pause (`23:263`), en pause → écran-titre ; ferme la carte en priorité | console ouverte : la ferme (pas de pause) ; fermée : pause **inchangée** |
| F1–F8 | `HUD_BAR_ITEMS[0..7]` (`23:337`) : nav, route, proche, temp., moteurs, télémétrie, radio, port | F2 Navigation, F3 Missions, F4 Port, F5 Chantier ; F1, F6, F7, F8 réservés (`preventDefault`, sans effet en L1) |
| `1`…`8` (sans Alt, Ctrl, Méta ni Maj) | libres | `activateHudBarItem(HUD_BAR_ITEMS[n-1])` (par `e.code` `Digit1`…`Digit8`, AZERTY compris ; décision du mainteneur 06/10 : sans Alt, le navigateur captant Alt+n) ; avec un modificateur : non traité |
| F9 / F10 | caméra / voix | inchangés |
| M, `;` · J · H · V | carte · missions · aide · audio | bascule de l'onglet Navigation · Missions · Aide · Aide (section audio) |
| L · I · T · G · P | Lagrange · itinéraire · pilote · survol · pause | inchangés (L : onglet Journal (décision du mainteneur 06/10) ; Lagrange abandonné) |
| Espace / Entrée | ferment la carte, reprise, abrégé | sur Navigation : ferment la console (parité carte) ; sinon avalés tant que la console est ouverte |

Console ouverte : tout `keydown` non traité est avalé (pas de pilotage sous la console, comme sous la carte), sauf P, Pause, F9, F10, touches `1`…`8` ; `keyup` passe toujours. Aucune action si `!gameStarted` ou `gamePaused`. La carte garde sa priorité (écouteur de capture `20e:87` chargé avant) : sa fermeture par Échap/M ferme la console (§ 3, observateur).

## 3. Fichiers et interfaces

`ORDER.txt` : lignes ajoutées **à la fin, après `45-campaign-bridge.js`**, dans cet ordre : `ui/50-console.js`, `ui/51-console-view.js`, `ui/52-tab-aide.js`, `ui/53-tab-navigation.js`, `ui/54-tab-missions.js`, `ui/55-tab-port.js`, `ui/56-tab-chantier.js` (numérotation propre au lot ; SPEC § 2.4 « `51-tab-*` » lu comme « un fichier par onglet »).

`ui/50-console.js` — `/* @provides CONSOLE */` — **pur : ni DOM ni THREE, testable sous Node**.
- `CONSOLE.register({ id, order, labelKey, fkey, keys, visible, onShow, onHide })` : `fkey` ex. `'F2'`, `keys` ex. `['KeyM','Semicolon']`, `visible() → bool` (exception = `false`), `onShow(panelEl)`/`onHide(reason)` optionnels. Doublon → `Error('onglet_double')`.
- `CONSOLE.tabs()` (triés par `order`), `CONSOLE.visibleTabs()`, `CONSOLE.current()` (id ou `null`), `CONSOLE.last()`, `CONSOLE.isOpen(id?)`.
- `CONSOLE.open(id?)` → `bool` : sans id = dernier onglet visible, sinon premier visible ; refuse un onglet invisible. Change d'onglet : `onHide('switch')` puis `onShow`. `CONSOLE.close(reason='user')`, `CONSOLE.toggle(id)` (ouvert sur `id` → ferme, sinon ouvre `id`).
- `CONSOLE.refresh()` → `bool` changé : réévalue les `visible()` ; onglet courant devenu invisible → `close('hidden')`.
- `CONSOLE.badge(id, n|null)`, `CONSOLE.badges()` → `{id:n}` (API seule, alimentée en L2+).
- `CONSOLE.on(evt, fn)` → désabonnement ; événements `open {id}`, `close {id, reason}`, `tab {from, to}`, `tabs {ids}`, `badge {id, n}` ; erreur d'écouteur journalisée, jamais propagée (même contrat que `GAME.on`).
- `CONSOLE.keyAction(k, ctx)` pur : `k = {code, altKey, ctrlKey, metaKey, shiftKey, repeat}`, `ctx = {started, paused, typing}` → `{act:'toggle', tab}` | `{act:'last'}` | `{act:'close'}` | `{act:'hud', index}` | `{act:'swallow'}` | `{act:'reserved'}` | `null`.
- `CONSOLE._reset()` (tests).

`ui/51-console-view.js` — `/* @provides CONSOLE.view @requires CONSOLE @requires-engine t, LANG, gameStarted, gamePaused, activateHudBarItem, HUD_BAR_ITEMS, refreshHudIconBar */`
- Crée `#sttConsole` (`role=dialog`, barre `#sttConsoleTabs` de `<button role=tab data-tab>`, un `.con-panel[data-tab]` par onglet, badge `.con-badge`), CSS injectée (`<style id="sttConsoleCss">`), charte McGivrer des overlays existants, `z-index` au-dessus du HUD, sous `#pauseOverlay`.
- `CONSOLE.view.host(id, node, shown)` : déplace `node` dans le panneau `id` ; CSS de neutralisation (`position:static`, pas de voile, `top:auto !important` pour `#portPanel`) ; `MutationObserver` (attributs `class`, `style`) : `shown(node)` devient vrai alors que la console n'est pas sur `id` → `CONSOLE.open(id)` (couvre les ouvertures automatiques `20c:517`, `MISSIONS.afterEscale`) ; devient faux alors que `id` est courant → `CONSOLE.close('legacy')`.
- Onglets invisibles : bouton et panneau `hidden` ; `CONSOLE.refresh()` toutes les 250 ms tant que `gameStarted`, et dans `refreshHudIconBar`.
- Écouteur `keydown` en capture sur `window` → `keyAction` → exécution, `preventDefault` + `stopImmediatePropagation` si traité.

Onglets (`ui/52…56`, `@requires CONSOLE, CONSOLE.view` + `@requires-engine` des globales lues) : chaque `onShow` appelle l'ouverture historique, chaque `onHide` la fermeture historique.

| Onglet (`id`) | order / fkey / keys | `visible()` | Hôte et appels |
|---|---|---|---|
| `nav` | 20 / F2 / M, `;` | `gameStarted && !!window.__STARMAP` | `#stmMap` ; `openStarMap()` puis redimensionnement (`resize` via `window.dispatchEvent(new Event('resize'))`) ; `closeStarMap()` |
| `missions` | 30 / F3 / J | toujours | `#missionBoardOverlay` (`MISSIONS.toggleBoard`/`closeBoard(true)`) et `#contractBoardOverlay` ; rien d'ouvrable → texte `conEmptyMissions` |
| `port` | 40 / F4 / — | `isNearPortService()` | `#portPanel` (classe `visible` + `refreshPortPanel()`) |
| `yard` | 50 / F5 / — | `isNearPortService()` | `#shipyardOverlay` ; `LOCAL.openShipyard/closeShipyard` |
| `help` | 90 / — / H, V | toujours | `#helpOverlay` puis `#audioOverlay` dans le même panneau ; V ouvre et fait défiler jusqu'à l'audio |

Modifications du moteur (minimes) : `20d` exporte `openShipyard`, `closeShipyard`, `closeContractBoard` dans le `return` de `LOCAL` ; `26` `activateHudBarItem` : branches `port`, `help`, `starmap`, `audio`, `missions` → `CONSOLE.toggle(id)` si `CONSOLE` existe (repli historique sinon), `refreshHudIconBar` lit `CONSOLE.isOpen(id)` ; `23` : retire `Tab`→radio, restreint le bloc F à F9, ajoute `Digit1..8` (sans Alt) ; `26:178` `buildHelpGrid` : `n` (touches 1 à 8) pour les slots, lignes Tab / F2–F5.

Clés `I18N` (fr, en, de, es — fichier `01-…js`, 328 l : lire par plages `8-41`, `42-75`, `76-109`, `110-143`) : `conTitle`, `conClose`, `conTabNav`, `conTabMissions`, `conTabPort`, `conTabYard`, `conTabHelp`, `conEmptyMissions`, `hk_console`, `hlp_console`, `hlp_hudAlt`.

## 4. Tâches (exécution **séquentielle** : chaque tâche L1.1–L1.6 ajoute une ligne à `ORDER.txt`)

| Tâche | Contenu | Dépend de | Modèle | Points sérialisés |
|---|---|---|---|---|
| L1.1 | `ui/50-console.js` + `src/test/unit/console.test.mjs` ; `_load.mjs` : option `ui: ['50-console.js']` (lit `src/JS/ui/`) | — | Sonnet | ORDER |
| L1.2 | `ui/51-console-view.js` (cadre, CSS, `host`, observateur, clavier minimal Tab/Échap) + toutes les clés `I18N` du § 3 | L1.1 | Sonnet | ORDER, I18N |
| L1.3 | Onglet Aide · Réglages (`52`) : `#helpOverlay`, `#audioOverlay` ; branches `help`/`audio` de `26` | L1.2 | Sonnet | ORDER |
| L1.4 | Onglet Navigation (`53`) : `#stmMap`, redimensionnement, fermeture par Échap/M de la carte | L1.3 | Sonnet | ORDER |
| L1.5 | Onglet Missions (`54`) : deux tableaux, ouvertures automatiques, J ; export `closeContractBoard` | L1.4 | Sonnet | ORDER |
| L1.6 | Onglets Port (`55`) et Chantier (`56`) ; exports `LOCAL` ; disparition hors zone portuaire | L1.5 | Sonnet | ORDER |
| L1.7 | Raccourcis : `23` (Tab, F1–F8, touches `1..8`, avalement), `buildHelpGrid`, titres `[n]` de la barre | L1.6 | Sonnet | I18N (si libellés) |
| L1.8 | Tactile et étroit : plein écran ≤ 760 px, barre d'onglets défilante (`overflow-x:auto`), un panneau, aucun débordement à 390 et 960 px | L1.7 | Haiku | — |
| L1.9 | `src/test/console_test.py` (Playwright) + adaptation des tests existants si un sélecteur casse ; suite complète | L1.8 | Sonnet | — |

Vérifications :
- L1.1 : `node --test src/test/unit/` (inscription, doublon, `visible()` qui lève, ouverture refusée si invisible, dernier onglet, `toggle`, `refresh` qui ferme, badges, événements et désabonnement, `keyAction` : table du § 2 complète, `Digit3` → `hud 2`, F1/F6–F8 → `reserved`, rien si `paused`/`!started`/`typing`) ; `python3 build.py compile` (contrôle `@requires` vert).
- L1.2 : `compile` + parité i18n ; `smoke_test.py` ; `Tab` sans onglet visible : console fermée, touche avalée, sans erreur JS (amendé après revue L1.2 : `CONSOLE.open()` refuse sans onglet visible) ; avec un onglet inscrit, `Tab` ouvre et Échap ferme. Transitoire L1.2→L1.7 : `Tab` n'ouvre plus la radio (retour par `Alt+7` et l'icône en L1.7).
- L1.3–L1.6 : un commit par onglet ; test ciblé existant vert sur la page lisible : L1.3 `scenes_matrice_test.py`, L1.4 `carte_test.py`, L1.5 `missions_test.py`, `pilote_test.py`, `commerce_test.py`, L1.6 `commerce_test.py`, `ports_test.py` ; plus un `page.evaluate` : l'overlay est descendant de `#sttConsole` et `CONSOLE.current()` est l'onglet attendu.
- L1.7 : `pilote_test.py` (J), `campagne_test.py` (Échap = pause), contrôle manuel des 8 touches `1`…`8`.
- L1.8 : captures 960×600 et 390×844 (`hasTouch`) dans `target/` ; `document.documentElement.scrollWidth <= innerWidth`.
- L1.9 : `python3 build.py test` vert (lisible et obfusquée), `campagne_test.py` compris.

`console_test.py` couvre : chaque ancienne touche ouvre le bon onglet ; Tab rouvre le dernier ; Échap ferme sans pause ; F2–F5 ; `1` bascule `.hud-left` ; Port masqué loin d'un port puis affiché à l'approche (`hidden` sur le bouton) ; ouverture automatique du tableau de missions à l'escale ⇒ console sur `missions` ; aucun overlay visible hors de `#sttConsole` ; Partie libre et campagne ; aucune `pageerror`.

## 5. Risques et cas limites

- `Alt+1`…`Alt+8` : Chrome et Firefox sous Linux/Windows changent d'onglet de navigateur et ignorent souvent `preventDefault` → le raccourci peut ne jamais atteindre la page. Repli : la barre d'icônes (inchangée) ; voir points à trancher.
- Carte : canvas dimensionné à l'ouverture (`resize` `starmap.js:149`) sur la fenêtre ; dans un panneau, mesurer le panneau, sinon carte déformée. `starmap.js` est partagé avec « Observation des étoiles » : **ne pas le modifier**, ajuster par CSS et `resize`.
- Boucle observateur ↔ `onShow` : `open(id)` sur l'onglet déjà courant est sans effet ; `onHide('legacy')` n'appelle pas la fermeture historique (déjà faite).
- Tableau de contrats rappelé à chaque image par `20c:517` tant qu'aucun des deux tableaux n'est visible : fermer le Chantier peut rouvrir aussitôt la console sur Missions (comportement historique conservé).
- `MISSIONS.closeBoard(true)` marque `dismissed` : fermer la console par Échap sur Missions doit garder ce sens (pas de réouverture avant l'escale suivante, cf. `pilote_test.py:88-90`).
- `#portPanel` reçoit `style.top` de `repositionPortPanel` ; neutraliser par CSS, ne pas toucher `30`.
- Focus : un champ (curseurs audio, import de sauvegarde) ne doit pas déclencher les raccourcis (`ctx.typing`).
- Budget : < 25 Ko ajoutés (SPEC § 2.9 : 150 Ko).

## 6. Alternatives écartées

- Réécrire le contenu des overlays dans les onglets : hors périmètre, régressions et tests à refaire.
- Remplacer chaque site d'ouverture automatique (`20c:517`, `MISSIONS.afterEscale`) au lieu d'un observateur : plus de fichiers moteur touchés.
- Superposer les overlays sous une barre commune sans déplacer le DOM : pas de panneau unique, tactile impossible.
- `iframe` / shadow DOM : styles et sélecteurs existants perdus.
- Modifier `index.template.html` pour la console : point de conflit inutile, le cadre se crée en JS.
- Console qui met le jeu en pause : exclu par la fiche.

## 7. Critères d'acceptation (fiche L1)

1. Une seule console héberge les 7 nœuds ; aucun ne s'affiche hors de `#sttConsole` ; chaque ancien raccourci (M, J, H, V, F8→F4) ouvre le bon onglet.
2. `Tab`, `Échap`, F1–F8, M, J, H (L inchangé) fonctionnent ; aucun conflit avec le vol ni la radio (`7` + icône).
3. Onglets masqués `hidden` ; Port et Chantier apparaissent et disparaissent avec la zone portuaire.
4. 960 px et 390 px tactile : plein écran, un panneau, onglets défilants, pas de défilement horizontal de la page.
5. *Partie libre* inchangée hors panneaux ; `campagne_test.py` vert.
6. Aucune erreur JS ; `build.py test` vert (lisible et obfusquée) ; `node --test src/test/unit/` vert.
7. Clés `I18N` en 4 langues ; parité i18n verte.
