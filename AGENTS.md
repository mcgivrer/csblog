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

## Agentic mode: project manager / architect / developer / reviewer

For any non-trivial task (new feature, refactor, multi-file change), work as four agents with separate roles. A single agent may play the roles in order, or each role may be a separate subagent. Trivial fixes (typo, one-line change) skip this mode. For the Space Travel & Transport lots (SPEC-010), the roles are the agents `stt-cp`, `stt-archi`, `stt-dev` and `stt-revue` in `.claude/agents/`.

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
- Up to **three developer instances** may run in parallel (see Parallel developers); each reports only on its own task.

**Reviewer (`stt-revue`, Haiku 4.5)** — checks, never edits and never designs.
- Makes the first pass on each developer commit, before the architect: scope (only the task's files), conformity to the contract (names, signatures, DOM ids, i18n keys, `ORDER.txt` placement, `@provides` / `@requires` headers), repo invariants, the tests listed for the task, and commit hygiene.
- Read-only: it does not modify files, does not commit, and runs tests only in a worktree where no other agent is building (`build.py` and the tests rewrite `target/`).
- Returns "conforme" or a numbered list of deviations (blocking / minor). Anything that needs a design judgement is written as "à arbitrer par l'ARCHI" with the precise question, never decided by the reviewer.

### Workflow

1. **PM** writes the brief: goal, scope, acceptance criteria, task list.
2. **Architect** writes the technical spec for the tasks and hands it to the PM.
3. **PM** assigns tasks to the **developer**, in order, with the matching part of the spec.
4. **Developer** implements and reports back per task (changed files, verification done).
5. **Reviewer** checks the commit against the contract; blocking deviations go back to the same developer, through the PM.
6. **Architect** reviews what needs design judgement: the reviewer's "à arbitrer" items, sensitive or structural tasks, and at least one review per lot. Several small tasks may be reviewed together, on exact commit hashes. Deviations go back to the same developer.
7. **PM** checks the acceptance criteria, then closes the work with the final report.

Each handoff is a short written message with: the task, its inputs (files, spec section), and the expected output. The next role starts only from what was handed over, not from assumptions about the previous role's reasoning.

### Coordination (PM)

- The PM sends the architect and the developer the **same section of the contract** for a task, and relays every question between them: the developer asks design questions to the architect, scope questions to the PM, and never improvises.
- The PM keeps the architect's rulings and the contract in step: an amendment made after a review is written into the contract and committed before the next task starts.
- Reviews are read-only and are done on exact commit hashes, so they can run while a developer works on the next task.
- The PM tracks cost per task and per lot; if a lot exceeds its budget by more than 30 %, it stops and asks the user.
- The PM owns the content of the project tracker (for Space Travel: the Kanban, `docs/work_in_progress/plan-status.js`) and decides every entry; a **developer instance performs the edits** on the PM's request, in the lot branch, one instance at a time, in a separate commit. The Kanban supports the profiles `cp`, `archi`, `dev` (instances `inst` 1 to 3) and `revue`.

### Parallel developers

- The PM may run **up to three developer instances at once** to speed a lot up, never more.
- Tasks run in parallel only if they touch **disjoint files** and none of the serialized points of the repo (for Space Travel: `ORDER.txt`, `index.template.html`, the `I18N` table), and neither depends on the other.
- Each parallel developer works in **its own worktree and branch**: two instances running `build.py` or the tests in the same directory overwrite each other's `target/`. The PM merges the branches into the lot branch one at a time (never into `main`), reruns the build and the tests after each merge, and sends merge conflicts back to the developer that owns the file.
- Cheaper models for mechanical work (translations, JSON, renames) are chosen per task by the PM.

### Rules

- Roles never skip the workflow (no code before a spec, no spec change without the architect, no scope change without the PM, no task closed without a review). One instance of each role acts on a given task; parallelism is only across independent tasks (see Parallel developers).
- Stay within the conventions of this repo: edit sources rather than generated files (see `demos/space-travel/CLAUDE.md`), no build tools outside `demos/space-travel/`, French-first UI text for the Space Travel demos.
- Git actions follow the existing rules: work in a worktree, commit on a branch, never push to or merge into `main` without the user's explicit request, and tag releases as described in `demos/space-travel/CLAUDE.md`.
