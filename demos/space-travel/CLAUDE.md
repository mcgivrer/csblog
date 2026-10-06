# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

This directory holds **two related but independently-built projects**, both shipping as single self-contained HTML files (Three.js/WebGL, no runtime dependencies once built) — consistent with the rest of the repo (see the root `AGENTS.md`). Unlike most demos in this repo, though, **these are not hand-edited HTML files**: they have real build pipelines that assemble the shipped HTML from modular sources. Always edit the sources, never the generated `.html`/`.min.html` output directly.

1. **`sources/`** — the main game, *Space Travel & Transport* (current spec: v2.17). Player-piloted/autopiloted cargo ship, procedural universe.
2. **`observation-des-etoiles/`** — a standalone cinematic demo ("infinite" auto-directed camera, no player input) built on top of a **frozen snapshot of an older engine build (v2.15)**. It does not consume `sources/`; it embeds its own copy of the engine and layers demo-only JS on top.
3. **`presentation/`** (in progress, lot P1 done) — an HTML slide player whose background is a real-time cinematic of the universe only (no ship, station, port or shuttle), built on `shared/cosmos.js`. `python3 build/build.py` (compile then test) → `dist/*.html`; see `presentation/README.md` and `presentation/docs/`.

The root-level `README.md` in this directory describes an older layout (`space-travel.html`, `selftest.sh`, `screenshots.sh`, `spec-pack.py` at the top level) that no longer exists — that logic now lives under `sources/`. Don't trust that README for current file paths.

## `sources/` — main game build

```bash
cd sources
python3 build.py            # compile + package + test, in that order
python3 build.py compile    # assemble src/ -> target/space-travel.html (readable)
python3 build.py package    # needs `npm ci` first (node_modules is not tracked) -> target/space-travel.min.html (terser + html-minifier-terser)
python3 build.py test       # run src/test/*_test.py (Playwright) against target/*.html
```

- `compile` concatenates `src/JS/game/*.js` in the exact order listed in `src/JS/game/ORDER.txt`, with the shared modules (`shared/x.js` lines, read from `../shared/`, see "Shared modules" below) at the points `ORDER.txt` specifies. These are classic scripts sharing one global scope — **concatenation order is part of the program**; don't reorder `ORDER.txt` casually.
- The result is spliced into `src/html/index.template.html` at the `/*@CSS@*/`, `/*@VENDOR@*/`, `/*@JS@*/` markers (CSS from `src/css/main.css`, vendored Three.js r128 from `src/JS/vendor/`).
- `compile` also embeds the **modular ships pack** at the `<!--@PACK@-->` marker: `src/assets/stt_modules.glb` (module library compressed by `scripts/build_game_pack.py` of the Blender project `~/Documents/Blender/space-travel/`), `src/assets/stt_fleet.json`, `src/assets/img/*.webp`, and every `stt-composition` file of `src/data/compositions/` (exported by the « Chantier naval STT » editor, button « Pour le jeu »). The vendor block also carries three r128's non-module `GLTFLoader` and `meshopt_decoder`. `09c-vaisseaux-modulaires.js` (`MODSHIP`) decodes the pack and registers each composition as a `SHIPGEN.MODELS` entry (`mod_…`) or a `modular` orbital port archetype; see `src/docs/spec-vaisseaux-modulaires.md`.
- Tests (`src/test/*_test.py`) drive headless Chromium via Playwright directly against the built HTML file (passed as argv), asserting on page globals (e.g. `ROUTE.legs`, `shipRig.position`, `gameStarted`) — not a conventional test runner, no test IDs, just scripts that exit non-zero on failure.
- `docs/spec217/` contains the tooling that assembles the versioned spec doc/PDF (`build_spec.py`, `spec_pdf.py`) — separate from the game build.
- Numbered filenames under `src/JS/game/` (`00-`, `01-`, `05b-`, `20c-`…) are historical/thematic, not strictly chronological; always check `ORDER.txt` rather than assuming filename order.

## `observation-des-etoiles/` — cinematic demo build

```bash
cd observation-des-etoiles
python3 build/build.py      # no dependencies -> dist/observation-des-etoiles.html (readable)
npm ci && node build/build_min.js        # -> dist/ minified version (node_modules is not tracked)
node tests/smoke.js         # boot + 200s simulated run on the minified build
node tests/longrun.js LONG-10   # 20 simulated minutes: errors, memory, shot-type stats
```

- `build/build.py` takes `engine/game.html` (a fixed v2.15 build of the main game — **never modify this file**; it's the frozen foundation) and string-splices in: `src/head_guard2.js` (input/loop guard) right after the first `<script>`, then the demo modules (`planets.js`, `asteroids.js`, `stars.js`, `shipdrive.js`, `shipglass.js`, `warpring.js`, `shipwear.js`, `hitex.js`, `smallcraft.js`, `warships.js`, `carrier.js`, `postfx.js`, `cine.js`, `starmap.js`, `radar.js`, in that literal order; the eleven listed under "Shared modules" below come from `../../shared/`) plus `src/live2.js` (boot screen / main loop) before `</body>`.
- `tests/` is a large suite of standalone Node/Playwright scripts (not a single runner) — each targets one subsystem and takes its own positional args (seed, ship id, shot list, etc.). Run `node tests/<name>.js` directly; see the "Reconstruire" section of `observation-des-etoiles/README.md` for the full list and argument meaning of each script (carrier views, map, textures, liveries, FTL, military encounters, director stats, etc.).
- Versioned deliverables (`observation-des-etoiles-vX.Y.html` / `.min.html`) are committed snapshots, one per notable feature increment — check `README.md`'s file table before assuming the latest `vX.Y` is what to edit; always edit `src/` + `build/`, then rebuild.
- `package.json` `name`/`version` describes this specific demo release, unrelated to the main game's version number.

## Shared modules (`shared/`)

Twelve modules are **single-source** in `demos/space-travel/shared/` and consumed by both the game and demo: `asteroids`, `hitex`, `planets`, `postfx`, `shipdrive`, `shipglass`, `shipwear`, `smallcraft`, `starmap`, `stars`, `sttcomp`, `warpring`. Never copy one into `sources/` or `observation-des-etoiles/src/`: edit it in `shared/` (it affects both products).

- The game reads them through `shared/x.js` lines in `ORDER.txt`; the demo through `../../shared/x.js` in `build/build.py` and `build/build_min.js`.
- Exception: `sttcomp` is consumed by the game (via `ORDER.txt`) and by the editor `STT_modules/sources/index.html`, but **not** by the demo `observation-des-etoiles/` (no rebuild, no version `ode_`). Documentation is clarified in `CODEMAP.md`.
- The noyau (`sttcomp`) renders **codes, not text**; it has **no dependency** on THREE or DOM, and takes all randomness and identifiers as injected parameters (`env.rand`, `env.uid`).
- Game-specific behaviour does **not** go into a shared module. The game extends it from its own files loaded around it: `09b-baies-ventrales.js` extends `__SHIPGLASS.BELLY`; `20e2-carte-hote.js` sets `window.__STARMAP_HOST` (translation, no camera buttons, jump refusal messages) before `shared/starmap.js`. A new shared module that needs per-product behaviour should take a host object the same way, with the demo's behaviour as default.
- A change in `shared/` (except `sttcomp`) changes the demo's output: rebuild it, and release it (version bump, tag `ode_`) when its behaviour changes. Until then the committed demo HTML lags the source.
- `shared/cosmos.js` (`window.__COSMOS.create(opts)`) is a thirteenth module, consumed only by `presentation/` for now: the universe without any ship (galactic layer, systems at real scale, depth-sliced rendering), needing only THREE and `planets.js`, `stars.js`, `asteroids.js`. It **reproduces the game's draws** (modules 02–04, 07, 11, 12, 14, 16 and the system part of 20c): if you change how the game generates stars, systems, rings or moons, change `cosmos.js` the same way — `presentation/tests/cosmos_test.py` checks parity with `REAL.systemInfo` on the built game.

## Dependencies and tracked build output

- `node_modules/` and `__pycache__/` are git-ignored (root `.gitignore`). Install with `npm ci` in `sources/` or `observation-des-etoiles/` (both have a real `package-lock.json`); never commit `node_modules`.
- The two other `package-lock.json` files (repo root and `demos/space-travel/`) are empty stubs, not real projects.
- `sources/target/*.html` and the versioned demo HTML stay **tracked on purpose**: GitHub Pages serves `main` from the repo root, so removing them would remove the game and the demo from the published site.

## Release tagging

Every release of either project must be tagged on `main` (annotated tag, `git tag -a`), once the release commit is on `main`:

- `stt_vX.Y.Z` for *Space Travel & Transport* (e.g. `stt_v2.17.0`).
- `ode_vX.Y.Z` for *Observation des étoiles* (e.g. `ode_v7.19.0`; `X.Y.Z` matches `VERSION` in `src/live2.js` and `package.json`; patch is `0` unless a hotfix, e.g. `ode_v7.19.1`).

Push the tags to **both** remotes: `git push origin <tag>` and `git push nex <tag>`.

## Conventions specific to this directory

- Both engines are **French-first**; UI strings and TTS/radio dialogue originate in French with in-file translation tables (see root `AGENTS.md`).
- `docs/` holds versioned Markdown specs (`SPEC-NNN-titre-Vx.y.md`) plus matching `.pdf` exports and `illustrations/`/`etude-*` subfolders of reference images — when a spec changes, the versioned `.md`/`.pdf` pair and relevant illustration usually change together.
- `archives/` holds zipped source snapshots and retired `.min.html` builds — treat as historical, not live code.
- `TODO.md` is a running, dated log of feature requests/bug reports written by the maintainer in French, organized by date/version heading; treat it as an input backlog, not documentation of current behavior.
