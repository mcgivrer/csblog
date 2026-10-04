# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Static personal blog / portfolio site (French-language author). No package manager, tests or linting at the repo root: pages and demos are **single self-contained HTML files** with inline CSS and JS, opened directly or served with:

```bash
python3 -m http.server 8000   # then http://localhost:8000
```

`AGENTS.md` at the root holds the same baseline conventions; this file adds what it leaves out.

## Layout

- `index.html` is the current landing page; `index_2.html`, `index-1998.html` and `index-cyberspace.html` are independent stylistic variants, not shared-template pages. Changes to one don't propagate to the others.
- `demos/*.html` — standalone demos (3D city, ASCII city, cyberdeck, oceans data). `oceans-data_2.html` / `_3.html` are alternate iterations of the same demo.
- `demos/skill-charte-graphique-mcgivrer/` — the McGivrer brand guide (HTML, Markdown, PDF, DOCX, templates). Follow it when producing branded pages or documents.
- `images/` (landing-page images) and `demos/img/` (demo screenshots) are the only shared asset folders.
- `spec-space_travel_and_transport-2.6.md` at the root is an obsolete spec; current docs live in `demos/space-travel/docs/`.

## Exception: `demos/space-travel/`

This is the one place where the "no build tools" rule does not hold. It contains two projects with real Python/Node build pipelines that generate the shipped HTML from modular sources. **Never edit the generated `.html`/`.min.html` there.** Read `demos/space-travel/CLAUDE.md` before touching anything under it.

## Known issues

- `index.html` links to `demos/voyage-spatial.html`, which does not exist in the repo (the simulator now lives in `demos/space-travel/`). Check before adding or fixing links to it.

## Conventions

- Keep CSS and JS inline in the HTML files; no separate `.css`/`.js` at the repo root.
- Demos load Three.js and fonts from CDNs, so offline previews degrade (system font fallback, no 3D).
- Prose, UI strings and commit-adjacent docs are French-first; the Space Travel demo also ships fr/en/de/es translations.
- `.claude/` is git-ignored, except `.claude/agents/` (shared agent definitions for the CP / ARCHI / DEV mode of `AGENTS.md`).
