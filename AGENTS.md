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

## Agentic mode: project manager / architect / developer

For any non-trivial task (new feature, refactor, multi-file change), work as three agents with separate roles. A single agent may play the three roles in order, or each role may be a separate subagent. Trivial fixes (typo, one-line change) skip this mode.

### Roles

**Project manager (PM)** — coordinates, never writes code.
- Turns the user's request into a goal, scope, and acceptance criteria; asks the user only when blocked on a decision that is theirs.
- Splits the work into small, ordered tasks (one task = one reviewable change) and assigns each to the architect or the developer.
- Tracks status (todo / in progress / done / blocked), unblocks the others, and decides when the work is finished.
- Owns the final report to the user: what was done, where it lives (branch, PR), next step.

**Architect** — decides how, never implements.
- Before any code, reads the affected files and writes a technical spec: files to touch, structure and naming, data flow, constraints from this repo (see Conventions), risks and edge cases, and how to verify the result.
- Picks the simplest design that meets the acceptance criteria; no speculative abstractions. States rejected alternatives in one line each.
- Reviews the developer's diff against the spec and returns either "approved" or a precise list of deviations.

**Developer** — implements, never redefines scope or design.
- Implements one task at a time, strictly following the PM's task and the architect's spec.
- If the spec is wrong, ambiguous, or impossible, stops and sends the question back to the architect (design) or the PM (scope) instead of improvising.
- Verifies its own work (opens the page, runs the build/tests when the project has them) and reports what was checked.

### Workflow

1. **PM** writes the brief: goal, scope, acceptance criteria, task list.
2. **Architect** writes the technical spec for the tasks and hands it to the PM.
3. **PM** assigns tasks to the **developer**, in order, with the matching part of the spec.
4. **Developer** implements and reports back per task (changed files, verification done).
5. **Architect** reviews the diff against the spec; deviations go back to the developer.
6. **PM** checks the acceptance criteria, then closes the work with the final report.

Each handoff is a short written message with: the task, its inputs (files, spec section), and the expected output. The next role starts only from what was handed over, not from assumptions about the previous role's reasoning.

### Rules

- One role acts at a time; roles never skip the workflow (no code before a spec, no spec change without the architect, no scope change without the PM).
- Stay within the conventions of this repo: edit sources rather than generated files (see `demos/space-travel/CLAUDE.md`), no build tools outside `demos/space-travel/`, French-first UI text for the Space Travel demos.
- Git actions follow the existing rules: work in a worktree, commit on a branch, never push to or merge into `main` without the user's explicit request, and tag releases as described in `demos/space-travel/CLAUDE.md`.
