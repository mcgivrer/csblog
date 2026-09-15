# AGENTS.md

## What this is

Static personal blog / portfolio site. No build tools, no package manager, no tests, no linting, no TypeScript. Every demo is a **single self-contained HTML file** — just open in a browser or serve with `python3 -m http.server`.

## Key files

- `index.html` — main landing page (current version)
- `index_2.html` — alternate landing page variant
- `index-1998.html` — retro 1998-style page
- `index-cyberspace.html` — cyberspace-themed page
- `demos/` — standalone HTML demos (3D City, ASCII City, Cyberdeck, Oceans Data, Space Travel)
- `demos/skill-charte-graphique-mcgivrer/` — brand style guide (HTML + PDF + Markdown)
- `demos/space-travel/docs/` — spec docs for the Space Travel demo

## How to preview

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Conventions

- Demos load external libs (Three.js) from CDN on first load — no npm install needed.
- The space-travel demo is French-first; translations are in the HTML file.
- All CSS and JS are inline within HTML files — no separate `.css` or `.js` files at the repo root.
- Image assets live in `img/` (root) and `demos/img/` (demos).
