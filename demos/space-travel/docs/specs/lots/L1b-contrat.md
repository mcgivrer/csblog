# L1b — Onglet Journal (touche L) et abandon du panneau Lagrange : contrat technique (ARCHI)

Décision du mainteneur 06/10/2026. Branche `worktree-stt-L1-console`, **après L1.10** (mêmes fichiers `23`, `26`, `ui/50`, `ui/51`, I18N). Réf. : SPEC-010 § 1.8 (Journal : radio, grand livre, événements ; L ; toujours visible), § 2.5 (état, sauvegarde < 50 Ko), `lots/L1-contrat.md`. Chemins relatifs à `demos/space-travel/sources/src/`. NB : `CODEMAP.md` n'a pas de section `ui/` → le CP le régénère avant L1.11.

## 1. Inventaire Lagrange (grep `agrange` sur `JS/game`, `JS/ui`, `JS/sim`, `css`, `html`, `../shared`, `test`)

| Élément | Où | Classe |
|---|---|---|
| Touche L → `activateHudBarItem(hud-lagrange)` | `JS/game/23:312-322` (commentaire « I / L » + bloc `KeyL` 319-322) | interface → **retirer** (garder le bloc `KeyI`) |
| Item de barre `{cls:'hud-lagrange', icon:'lagrange', labelKey:'lblLagrange', hotkey:'L'}` | `26:64` (commentaire 57-63 à reformuler pour l'itinéraire seul) | interface → retirer |
| Icône `HUD_ICONS.lagrange` | `26:29-32` | interface → retirer |
| Pré-masquage portrait `'hud-lagrange'` | `26:385` | interface → retirer de la liste |
| `LAGRANGE_FRACTION`, `computeLagrangePoint`, `_lagTmp`, `updateLagrangePanel` | `17:50-88` | interface → retirer : **aucun autre appelant** (grep : seul `39:45` appelle le panneau ; ni autopilote, ni `REAL`, ni carte, ni route n'utilisent `computeLagrangePoint`) |
| Appel par image `updateLagrangePanel()` + commentaire | `39:39-45` | retirer l'appel, garder `updateItineraryShip()` |
| Évitement de chevauchement `lag` | `30:114-115` (commentaire), `30:140-149` | retirer le bloc `lag` ; la boucle `itin` (150+) reste |
| Masquage en mode missions `#lagrangePanel` | `20q:210` (sélecteur CSS) | retirer le sélecteur |
| Panneau `#lagrangePanel` (`lblLagrange`, `lagrangeNeedle`, `lagrangeDist`, `lagrangeName`) | `html/index.template.html:187-206` | interface → retirer (point sérialisé) |
| CSS `.hud-lagrange`, `.lagrange-*`, `#lagrangeNeedle` | `css/main.css:441-456` | retirer |
| I18N `lblLagrange` (fr/en/de/es) + table id→clé | `01:13, 48, 83, 118` et `01:305` | retirer (parité conservée : 4 retraits) |
| Tests | aucun `*_test.py` ne lit Lagrange ; `unit/console.test.mjs:204` attend `KeyL → null` | test à **adapter** (§ 4) |

**À conserver** : rien de Lagrange. Restent intacts dans les mêmes fichiers : itinéraire (`17:1-48`, touche I, `hud-itinerary`), clé `noRoute` (aussi utilisée par `16`), nom du fichier `17-itineraire-point-de-lagrange.js` (le renommer toucherait `ORDER.txt` et `build.py` : en-tête seul corrigé).
**Impacts** : `HUD_BAR_ITEMS` — Lagrange est l'index 10, **hors des 8 slots** (index 0-7 : nav, route, proche, temp., moteurs, télémétrie, radio, port) → touches 1-8 inchangées ; `buildHelpGrid` (`26:178`) liste les items à `hotkey` → la ligne « L Lagrange » disparaît d'elle-même, ajouter `['L','conTabJournal']` à la suite de F2-F5 ; panneaux masqués par l'utilisateur : pas de persistance `localStorage` des `panel-hidden` (aucune trace à migrer). Retrait **total** jugé sûr ; repli minimal si régression de mise en page : retirer touche + item + appel `39:45`, laisser HTML/CSS (panneau jamais affiché faute d'item).

## 2. Journal — modèle et collecte

**`JS/sim/04-journal.js`** — `/* @provides JOURNAL @requires GAME */` — pur (ni DOM ni THREE), `ORDER.txt` : après `sim/03-save.js`.
- Entrée : `{ seq, t, kind, ... }`, `t` = secondes de jeu actif ; `kind ∈ 'radio' | 'fin' | 'evt'`.
  - radio `{ from:'ship'|'tower', who, text }` ; fin `{ reason, delta, bal }` ; evt `{ code, a, b, imp }`.
- `JOURNAL.add(e)` → entrée (anneau **300** toutes rubriques ; les plus anciennes écartées) ; `JOURNAL.list({ kinds, limit })` → plus récent d'abord, fusionné avec `JOURNAL.ledgerRows(GAME.state)` en campagne ; `JOURNAL.ledgerRows(st)` → `[{t, kind:'fin', reason, delta, bal}]` avec `bal` recalculé à rebours depuis `st.credits` ; `JOURNAL.unread()`, `JOURNAL.markRead()` ; `JOURNAL.on('add', fn)` (même contrat que `GAME.on`) ; `JOURNAL.now()` = `GAME.state ? GAME.state.clock : freeClock` ; `JOURNAL.tickFree(dt)` ; `JOURNAL.detect(prev, snap)` → `[evt]` **pur** (comparaison de deux instantanés, § sources) ; `JOURNAL.restore(arr)`, `JOURNAL._reset()`.
- Campagne : les `evt` sont aussi poussés par `GAME.cmd('journal.push', { e:[t, code, a, b] })` (nouvelle commande `sim/00:74-86`, plafond `JOURNAL_SAVED_MAX = 100`, `state.journal = []` dans `newCampaign`). Les `fin` ne sont **pas** dupliquées : la source est `state.ledger` (200, déjà sauvegardé). La radio reste **en mémoire** (texte long, éventuellement IA).
- Sauvegarde : **champ additif en `v:1`**, aucun changement de `SAVE.VERSION` ni de `MIGRATIONS` : une sauvegarde `v:1` sans `journal` se charge (`restore(st.journal || [])` sur `GAME.on('new'|'loaded')`), un ancien jeu ignore le champ. Poids : ~45 o × 100 ≈ 4,5 Ko + ledger ≈ 5 Ko → < 15 Ko au total.
- *Partie libre* : pas de `GAME.state` ; `fin` enregistrées dans l'anneau (mémoire) avec `bal = credits` ; horloge `freeClock` avancée par la collecte ; rien n'est sauvegardé.

**`JS/game/46-journal-sources.js`** — `/* @provides JOURNAL.sources @requires JOURNAL, GAME @requires-engine addCredits, credits, appendRadioLine, REAL, MISSIONS, fuel, FUEL_CAPACITY, FUEL_WARN_RATIO, FUEL_CRIT_RATIO, jumpState, isNearPortService, gameStarted, gamePaused */` — `ORDER.txt` : après `45-campaign-bridge.js`, avant `ui/50`. Adaptateur sans modification du moteur hors finances :

| Rubrique | Source réelle | Branchement |
|---|---|---|
| Radio | `appendRadioLine(entry)` `30:299` (`{from, label, text}`) | ré-affectation de la globale comme `45:228-234` le fait pour `addCredits` ; texte stocké brut, **affiché en `textContent`** (la radio l'injecte en `innerHTML`) |
| Finances | `addCredits` `29:26` ; appelants `20d:168` (chantier), `35:318` et `20p:194` (livraison), `30:264` (vitesse), `30:272` (carburant), `30:279` (saut quantique) | **seul hook moteur** : 2e argument `reason` (`'yard'`, `'delivery'`, `'speed'`, `'fuel'`, `'jump'`) aux 6 sites ; `45:229-233` le relaie (`reason || 'jeu'`) à `credits.set` → le grand livre a enfin des motifs (aujourd'hui toujours `'jeu'`). Libre : l'adaptateur enveloppe `addCredits` et note le delta réel (borné à 0) |
| Événements | instantané toutes les 250 ms si `gameStarted && !gamePaused` : `REAL.phase` (`'JUMP'`/`'WARP'` posés `20c:737,745` ; `'WARPOUT'` à l'entrée de système `20c:776` ; `'ORBIT'` à la mise en orbite `20c:495`), `REAL.leg.name`, `REAL.mission.target.name`, `MISSIONS.state.active` (`id`, `dest.name`, `reward` ; acceptée `20q:166`), `MISSIONS.state.done.length` (livrée `20q:199`), `jumpState` (saut quantique classique `28`), `isNearPortService()` (`26:89`), `fuel / FUEL_CAPACITY` | `JOURNAL.detect` → codes `msn.accept`, `msn.done` (imp), `jump`, `arrive`, `orbit`, `dock`, `fuel.low` (imp), `fuel.crit` (imp). **Incidents** : aucun système n'existe (SPEC-009 M3 « à venir », `20q:11`) → seules les alertes carburant en tiennent lieu ; code `incident` réservé |

## 3. Interface — `JS/ui/57-tab-journal.js`

`/* @provides CONSOLE.journal @requires CONSOLE, CONSOLE.view, JOURNAL @requires-engine t, LANG, formatCredits */` — `ORDER.txt` : en fin, après `ui/56`. `CONSOLE.register({ id:'journal', order:80, labelKey:'conTabJournal', fkey:null, keys:['KeyL'], visible: () => true, onShow(panel), onHide })` ; pas de nœud hôte : rendu dans `t.panel`.
- Pastilles `<button aria-pressed>` : Tout · Radio · Finances · Événements (filtre retenu en mémoire de session) ; liste `<ol>` plus récent en haut, 300 lignes au plus, re-rendue sur `JOURNAL.on('add')` si l'onglet est courant (sinon au prochain `onShow`).
- Ligne : horodatage `T+hh:mm:ss` (temps de jeu), icône de rubrique, texte tronqué (`text-overflow:ellipsis`), `title` = texte complet ; tactile : un appui déplie la ligne (`.open`) ; finances : motif, montant signé (vert/rouge), solde. Libre : mention `jrnFreeNote` en tête des finances.
- Badge : `CONSOLE.badge('journal', n)` = entrées `imp` non lues ; `onShow` → `JOURNAL.markRead()` + `badge(null)`.
- Clavier dans l'onglet : la console avale aujourd'hui flèches et Page* → ajout à `ui/50` : `register` accepte `onKey(code)` ; `keyAction`, console ouverte, renvoie `{act:'tabkey', tab, code}` pour `ArrowUp/Down/Left/Right`, `PageUp/Down`, `Home`, `End` si l'onglet courant a `onKey` (sinon `swallow` comme avant). Journal : ←/→ change de filtre, ↑/↓ déplace une ligne-curseur dépliée (= détail au clavier), Page*/Home/End font défiler. Plein écran ≤ 760 px déjà fourni par `ui/51` (CSS `.jrn-*` injectée par `57`, cibles ≥ 36 px).
- I18N (4 langues, table `01`) : `conTabJournal`, `jrnAll`, `jrnRadio`, `jrnFin`, `jrnEvt`, `jrnEmpty`, `jrnBalance`, `jrnFreeNote`, `jrnR_jeu`, `jrnR_delivery`, `jrnR_yard`, `jrnR_speed`, `jrnR_fuel`, `jrnR_jump`, `jrnE_msnAccept`, `jrnE_msnDone`, `jrnE_jump`, `jrnE_arrive`, `jrnE_orbit`, `jrnE_dock`, `jrnE_fuelLow`, `jrnE_fuelCrit`, `jrnE_incident`, `hlp_journal` (gabarits `{a}`/`{b}` remplacés par la vue : `t()` n'interpole pas, `01:147`).

## 4. Clavier

- `L` : aucune ligne spécifique dans `keyAction` — la règle générique `keys` (`ui/50:184-185`) donne `{act:'toggle', tab:'journal'}` ; console ouverte sur un autre onglet → bascule sur Journal ; sur Journal → ferme. `Alt+L` : `null` fermée, `swallow` ouverte (inchangé) ; `L` répétée : `null`/`swallow` (contrôle `repeat` avant les `keys`) ; `typing`, pause ou `!started` → `null`.
- `23:312-322` : supprimer le bloc `KeyL` (sinon code mort : la vue capture L avant `23`).
- Touches 1-8 : traitées avant tout (HUD), Journal ouvert compris ; `Tab` : ferme, puis rouvre le dernier onglet (Journal possible) ; `Échap` : ferme sans pause.
- `unit/console.test.mjs` : retirer `KeyL` de la liste `null` (`:204`) quand le Journal est inscrit dans le banc ; ajouter `KeyL → toggle journal`, `tabkey`.

## 5. Tâches (toutes après L1.10)

| Tâche | Contenu | Cplx | Modèle | Dépend | Vérification | Sérialisé |
|---|---|---|---|---|---|---|
| L1.11 | Retrait Lagrange (§ 1) | S 40 k | haiku | L1.10 | `build.py compile` + parité i18n ; `grep -ri agrange src/` vide hors en-tête de `17` ; `smoke_test.py`, `scenes_matrice_test.py`, `pilote_test.py`, `console_test.py` | template, I18N |
| L1.12 | `sim/04-journal.js` + `GAME.cmd('journal.push')` + `state.journal` ; `unit/journal.test.mjs`, `game-state`, `save` (v1 sans `journal` se charge, ≤ 50 Ko avec 100 evt + 200 ledger), `sim-invariants` | M 80 k | sonnet | L1.10 | `node --test src/test/unit/` | ORDER |
| L1.13 | `game/46-journal-sources.js` ; `reason` aux 6 `addCredits` + `45:229-233` | M 80 k | sonnet | L1.12, L1.11 (`30`) | unit : `detect` (table des transitions) ; `commerce_test.py`, `missions_test.py`, `campagne_test.py` ; `page.evaluate` : ledger avec motifs | ORDER |
| L1.14 | `ui/57-tab-journal.js` + `onKey`/`tabkey` dans `ui/50` + ligne d'aide `26:178` + clés I18N ; adaptation `console.test.mjs` | M 80 k | sonnet | L1.13 | `node --test` ; compile + parité | ORDER, I18N |
| L1.15 | `test/journal_test.py` (L ouvre/ferme, filtres, ordre, badge après livraison, finances libre et campagne, reprise de sauvegarde v1 sans `journal`, 390 px tactile sans défilement horizontal) ; `build.py test` complet | S 40 k | sonnet | L1.14 | suite lisible et obfusquée verte, captures `target/` | — |

Ordre : **L1.11 ∥ L1.12** (fichiers disjoints : L1.12 ne touche que `sim/`, `ORDER`, `unit/`), puis L1.13 → L1.14 → L1.15. `ORDER.txt` : L1.12 et L1.13/L1.14 l'éditent → séquentiel ; I18N : L1.11 puis L1.14.

## 6. Risques, alternatives, acceptation, estimation, arbitrages

Risques : (a) ré-affectation des globales `addCredits`/`appendRadioLine` dans l'obfusqué — précédent `45:229` fonctionne, à couvrir par L1.15 en obfusqué ; (b) instantané à 250 ms : une phase de moins de 250 ms serait manquée (sauts et orbites durent plusieurs secondes) ; mise en orbite détectée sur front `→ 'ORBIT'`, pas sur l'état ; (c) chargement en cours de partie : `restore` puis instantané neuf (pas d'événements fantômes) ; (d) `appendRadioLine` appelé à chaque ligne d'escale, ~20 lignes/escale → l'anneau de 300 chasse vite les événements en mémoire (ceux de campagne restent dans `state.journal`) ; (e) texte radio en `innerHTML` côté radio : jamais en `innerHTML` côté journal.
Écartées : hooks `JOURNAL.add` dans `20c`/`20q` (fichiers lourds, IIFE non exportées) ; journal unique sauvegardé avec la radio (≈ 30 Ko) ; `SAVE.VERSION = 2` (casse `save.test.mjs:15,20`, rend les sauvegardes neuves illisibles par l'ancien jeu sans gain) ; dupliquer le ledger dans le journal ; garder Lagrange sur une autre touche (« ne sert plus »).
Acceptation : 1. `L` ouvre/ferme le Journal, toujours visible, order 80 avant Aide ; 2. trois rubriques filtrables, plus récent en haut, temps de jeu, détail au survol/appui/↑↓ ; 3. finances avec motif et solde en campagne et en libre ; 4. événements réels (missions, saut, arrivée, orbite, port, carburant) ; 5. badge des entrées importantes non lues ; 6. sauvegarde `v:1` additive, anciennes sauvegardes chargées, < 50 Ko ; 7. plus aucune trace visible de Lagrange, touches 1-8 inchangées ; 8. 4 langues, parité, `node --test` et `build.py test` verts, aucune erreur JS.
Estimation : 320 k tokens (+10 % revues ARCHI ≈ 350 k).

À trancher (avec recommandation) :
1. Sauvegarde : champ `journal` additif en `v:1` (**recommandé**) ou `v:2` + migration.
2. Motifs de finances : 2e argument `reason` aux 6 `addCredits` du moteur (**recommandé**, seul moyen d'avoir un « motif ») ou motif générique « Opération ».
3. Radio : mémoire seule (**recommandé**) ou sauvegarder les 20 dernières lignes (~3 Ko).
4. Navigation clavier interne (`onKey`/`tabkey` dans `ui/50`) : **recommandé** maintenant (sinon le Journal n'est pas utilisable au clavier au-delà de L) ; alternative : différer à L2.
