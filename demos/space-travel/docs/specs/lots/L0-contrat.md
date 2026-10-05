# L0 — Fondations : contrat technique (ARCHI)

Branche `stt-C0-L0`. Référence : SPEC-010 § 2 (architecture), § 1.1 (modes), § 2.5 (état). Chemins relatifs à `demos/space-travel/sources/`.
Invariants : la couche `src/JS/sim/` n'utilise ni THREE ni le DOM (sauf `SAVE.exportFile`, gardé par `typeof document`) ; aucun `Math.random` dans la logique ; aucune globale hors espace de noms ; *Partie libre* inchangée ; textes dans `I18N` (fr, en, de, es).

## Tâches

| Tâche | Contenu | Dépend de | Modèle |
|---|---|---|---|
| L0.2 | `tools/codemap.py` → `../docs/specs/CODEMAP.md` | — | Sonnet |
| L0.4 | `build.py` (données, `sim/` `ui/`, `@requires`, parité i18n, tests Node), `ORDER.txt`, gabarit | — | Sonnet |
| L0.5 | `src/JS/sim/00..03` + `src/data/economy.json` + tests Node | — | Sonnet |
| L0.6 | Courlis, `BRIDGE` (choix du mode, synchro, sauvegarde), point d'accroche dans `42`, clés i18n, `campagne_test.py` | L0.4, L0.5 | Sonnet |
| L0.3 | `src/test/chrono_missions_bench.py` + lecture des mesures par `tools/eco_sim.py` | L0.6 | Sonnet |

## L0.2 — `tools/codemap.py`

- Parcourt, dans l'ordre de `ORDER.txt`, `src/JS/game/`, `src/JS/sim/`, `src/JS/ui/` et `../shared/`. Pour chaque fichier : lignes, en-tête (1ʳᵉ ligne utile du commentaire de tête), déclarations de niveau 0 (`function X`, `const|let|var X` en colonne 0) avec n° de ligne, espaces de noms `const X = (function` et clés de leur `return {` final (au mieux), affectations `window.__X =`, balises `@provides` / `@requires`.
- Sortie Markdown compacte (une section par fichier, noms séparés par des virgules, `nom:ligne`), en-tête « généré, ne pas éditer » + rappel de la liste noire (CLAUDE.md, fichiers de plus de 300 Ko). Cible : moins de 400 lignes. Python standard seulement.
- Vérification : `python3 tools/codemap.py && wc -l ../docs/specs/CODEMAP.md`.

## L0.4 — build

1. `ORDER.txt` : une ligne `sim/x.js` lit `src/JS/sim/x.js`, `ui/x.js` lit `src/JS/ui/x.js` (comme `shared/`). Insérer `sim/00-game-state.js`, `sim/01-rng-game.js`, `sim/02-data.js`, `sim/03-save.js` juste après `02-prng-seede-tout-l.js` ; `45-campaign-bridge.js` à la fin, après `42-…`.
2. Données : chaque `src/data/*.json` (hors `compositions/`) est validé (`json.load`) puis embarqué en un objet `{nom_sans_extension: contenu}` dans `<script type="application/json" id="sttData">` au marqueur `<!--@DATA@-->` (à ajouter au gabarit juste avant `<!--@PACK@-->`). Champs obligatoires : `economy.json` → `startCredits`, `starter`, `autosaveSeconds`. Erreur claire et arrêt sinon.
3. Contrôle d'ordre : pour les fichiers `sim/`, `ui/` et `45-campaign-bridge.js`, lire `/* @provides A, B @requires C, D */` dans les 15 premières lignes ; chaque `@requires` doit être fourni par un fichier placé plus haut, sinon arrêt avec le nom du fichier. Une `@requires-engine X` n'est pas vérifiée (globales historiques du moteur).
4. Parité i18n : `tools/i18n_parity.mjs` extrait le littéral `const I18N = { … }` de `01-…js` (appariement d'accolades), l'évalue dans `vm`, compare les clés de `fr`, `en`, `de`, `es` ; liste les manques et sort en erreur. `compile` l'appelle si `node` est présent (sinon avertissement).
5. `test` lance d'abord `node --test src/test/unit/` (s'il existe), puis les `*_test.py`. Les fichiers `*_bench.py` ne sont pas lancés.
- Vérification : `python3 build.py compile | tail -5` (données + contrôles affichés sur une ligne), page générée qui démarre (`smoke_test.py`).

## L0.5 — simulation de campagne (`src/JS/sim/`)

`00-game-state.js` — `/* @provides GAME */`
- `GAME.newCampaign({ seed, startCredits, starter, name })` → état SPEC-010 § 2.5 : `v:1, mode:'campaign', seed, clock:0, company:{name:'STT', mark:'STT', livery_hex:'#2d6cdf', emblem:'star4', reputation:0}, credits, rp:0, ledger:[], flagship:'s1', ships:[{id:'s1', name, comp:starter, wear:0, fuel:1, at:null, order:null, crew:[]}], blueprints:{}, crew:[], tech:{done:[], queue:[]}, stations:[], missions:{active:null, serial:0}, flags:{}`. Émet `new`.
- `GAME.load(state)` (émet `loaded`), `GAME.reset()` (état `null`), `GAME.mode()` → `'campaign'` si état, sinon `'free'`, `GAME.state` (lecture).
- `GAME.on(evt, fn)` → fonction de désabonnement ; `GAME.emit(evt, data)` ; une erreur d'écouteur est journalisée, jamais propagée.
- `GAME.cmd('credits.set', { credits, reason })` : écrit le delta dans `ledger` (`[clock, reason, delta]`, 200 entrées au plus), émet `credits {credits, delta, reason}`. Commande inconnue → `Error('cmd_inconnue')`.
- `GAME.tick(dt)` : avance `clock` (secondes de jeu actif), émet `tick {clock}` à chaque seconde entière franchie.

`01-rng-game.js` — `/* @provides RNG @requires GAME @requires-engine xmur3, mulberry32, SEED */`
- `RNG.game(tag)` → `mulberry32(xmur3((GAME.state ? GAME.state.seed : SEED) + ':game:' + tag)())`. Même graine + même tag = même suite.

`02-data.js` — `/* @provides DATA */` : `DATA.get(nom)` (objet de `#sttData`, mis en cache, `{}` si absent), `DATA.all()`, `DATA._set(obj)` (tests).

`03-save.js` — `/* @provides SAVE @requires GAME */`
- `SAVE.VERSION = 1`, `SAVE.KEYS = { auto:'stt.campaign.v1.auto', slots:['stt.campaign.v1.slot1','stt.campaign.v1.slot2','stt.campaign.v1.slot3'] }`.
- `serialize(state)` → chaîne ; `parse(str)` → état, migrations par `v` (table `MIGRATIONS[v] = s => s'`, vide pour l'instant), `v > VERSION` → `Error('save_newer')`, JSON invalide ou `mode !== 'campaign'` → `Error('save_invalide')`.
- `write(key = auto)` sérialise `GAME.state` ; `read(key = auto)` → état ou `null` ; `has(key = auto)` ; `setStorage(obj)` (tests) ; tout accès au stockage dans `try/catch`.
- `exportFile()` télécharge `stt-campagne-<seed>.stt-save.json` ; `importText(str)` → `parse` puis `GAME.load`.

`src/data/economy.json` : `{ "startCredits": 4000, "starter": "stt-courlis", "autosaveSeconds": 120, "tickSeconds": 1 }`.

Tests Node (`src/test/unit/*.test.mjs`, `node:test`) : `_load.mjs` crée un contexte `vm` avec bouchons (`location.search=''`, `document.getElementById → {textContent:''}`, stockage en mémoire), évalue `02-prng…js` puis `sim/*.js`. Couvrir : forme de `newCampaign`, événements et désabonnement, ledger plafonné, `tick` (3 × 0,4 s → 1 événement), déterminisme `RNG.game`, aller-retour `SAVE`, refus `save_newer`, `save_invalide`, `DATA.get`.

## L0.6 — campagne jouable

- `src/data/compositions/stt-courlis.json` : `stt-composition` v1, `id:'stt-courlis'`, `name:'STT Courlis'`, `type:'ship'`, `company:'STT'`, `registry:'STT-0001'`, `root:'cmd1'`, chaîne CMD → CARGO → PWR → PROP (`links` `a.AFT`→`b.FWD`, roulis 0), 4 marques de conteneurs sur `cargo1`, `docking_ports:[]`, bloc `game:{version:1, class:'ship', family:'fret', tier:'I', ftl:false, crew:2, arch:'Cargo modulaire léger', description:'…'}`. Identifiant de modèle obtenu : `mod_stt-courlis`.
- `src/JS/game/45-campaign-bridge.js` — `/* @provides BRIDGE @requires GAME, SAVE, DATA @requires-engine addCredits, credits, refreshCreditsDisplay, MODSHIP, MISSIONS */`
    - `BRIDGE.chooseMode(onFree)` : fenêtre (styles des overlays existants, charte McGivrer) avec **Nouvelle campagne**, **Continuer** (désactivé si `!SAVE.has()`), **Partie libre** (appelle `onFree`). Clavier : flèches + Entrée, Échap = Partie libre.
    - Nouvelle campagne : `GAME.newCampaign(...)` avec `SEED` et `DATA.get('economy')`, puis `MODSHIP.whenReady` → `credits` = `startCredits`, `window.__sttQuickStart('mod_' + starter, { missions: true })`. Continuer : `SAVE.read()` → `GAME.load` → même démarrage avec le `comp` de l'amiral et ses crédits.
    - Synchro : enveloppe `addCredits` (en campagne seulement) → `GAME.cmd('credits.set', { credits, reason:'jeu' })`. Horloge : `setInterval` 1 s, `GAME.tick(1)` si `gameStarted && !gamePaused`.
    - Sauvegarde automatique : toutes les `autosaveSeconds` de `clock`, et quand `MISSIONS.state.done.length` augmente ; jamais si `jumpState` est actif.
    - Menu pause (`#pauseOverlay`) : boutons **Exporter la sauvegarde** et **Importer…** (fichier `.stt-save.json`), visibles en campagne seulement.
- `42-…js` : dans `selectLanguageAndStart`, remplacer l'appel direct `openShipSelect(cb)` par `(typeof BRIDGE !== 'undefined' ? BRIDGE.chooseMode(() => openShipSelect(cb)) : openShipSelect(cb))`. Rien d'autre.
- Clés `I18N` (4 langues) : `modeTitle`, `modeNew`, `modeNewSub`, `modeContinue`, `modeContinueSub`, `modeFree`, `modeFreeSub`, `saveExport`, `saveImport`, `saveDone`, `saveError`.
- `src/test/campagne_test.py` (Playwright, modèle de `missions_test.py`) : boot → langue → fenêtre de mode → Nouvelle campagne → `gameStarted`, `SHIP_ID === 'mod_stt-courlis'`, `credits === 4000`, `GAME.mode() === 'campaign'`, `MISSIONS.enabled()` ; `SAVE.write()` ; rechargement → Continuer actif → crédits et vaisseau restaurés ; nouvelle page → Partie libre → `#shipSelect` (ou l'élément du dialogue existant) visible ; aucune erreur JS.

## L0.3 — chronométrage

- `src/test/chrono_missions_bench.py page [modele=e18] [n=3]` : même amorce que `missions_test.py` (temps simulé, `__step`), démarrage `__sttQuickStart(modele, {missions:true})`, puis n fois : attendre le tableau, accepter la 1ʳᵉ offre **locale**, avancer jusqu'au paiement ; mesurer les secondes simulées (acceptation → paiement) et les phases. Écrit `target/mesures/missions-<modele>.json` (`runs`, `mean_s`) et affiche la moyenne.
- `tools/eco_sim.py` : option `--mesures <json>` qui remplace `MIN_LOCAL` par `mean_s/60`.
- À lancer pour `e18` et `mod_stt-courlis` ; résultats reportés dans le Kanban (note de L0.3).

## Critères d'acceptation du lot

1. `python3 build.py compile` passe, avec données, contrôle `@requires` et parité i18n affichés ; `node --test src/test/unit/` vert.
2. `smoke_test.py`, `missions_test.py`, `modulaire_test.py`, `campagne_test.py` verts sur la page lisible.
3. Partie libre identique à avant (sélecteur du hangar inchangé).
4. Mesure de durée de mission disponible pour l'équilibrage.
