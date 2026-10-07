# T1 · Contrat — Lanceur d'agents `stt-agents`

Lot d'outillage (hors jeu). Décisions 31 et 32 acquises. Branche `worktree-stt-L2a` (commits T1 séparés des commits L2a par cherry-pick).
Vérifié : `claude` 2.1.292 (`--help` lu), `pty`/`termios`/`fcntl` présents (Python 3.12, Linux), `.claude/*` ignoré par git, carte `a.id` = `session_id` du transcript (`stt_agents_server.py` l. 1000).

## 1. Choix structurants

| Sujet | Choix | Justification | Écarté |
|---|---|---|---|
| Lancement | `claude` **interactif sous pty** | seul mode qui permet terminal, réponse aux demandes de permission et reprise | `claude -p` : pas de saisie humaine ni de validation interactive ; `claude --bg`/`attach`/`stop` : pas de pause, sortie par sondage de `logs`, terminal exigerait quand même un pty autour d'`attach` |
| Commande | `RUNNER_COMMAND` (liste argv, jamais `shell=True`), surchargeable par `--runner-cmd JSON` | tests avec un faux agent, jamais le vrai `claude` | chaîne shell : injection |
| Worktree | créé par le serveur (`git worktree add`) | nom et branche maîtrisés | option `claude -w` : nom/branche non maîtrisés |
| Terminal | flux `fetch()` en format SSE + `POST` de saisie | réutilise le motif SSE existant ; `fetch` accepte l'en-tête `X-STT-Token` | `EventSource` : pas d'en-tête ; WebSocket RFC 6455 : ~200 lignes de trames et pas d'en-tête non plus |
| Code | nouveau module `stt_runner.py` (stdlib), importé par le serveur | serveur déjà à 1 700 lignes ; module testable seul | tout dans le serveur |
| Activation | `--runner` (opt-in) ; refusé si `--host` non bouclé ou `os.name == "nt"` | le serveur d'observation reste inchangé par défaut | actif par défaut |

Commande par défaut (options toutes lues dans `claude --help`) :
`["claude","--agent","stt-{agent}","--model","{model}","--session-id","{session}","--permission-mode","{perm}","-n","{task}","{prompt}"]`, `cwd` = worktree ; reprise : même liste avec `--resume {session}` à la place de `--session-id {session}` et sans `{prompt}`.
`{prompt}` = phrase courte « Exécute la tâche {task} : lis demos/space-travel/stt-agents/data/prompts/{task}.md » (pas de prompt long en argv). `{perm}` ∈ `acceptEdits` (défaut), `plan`, `manual` ; `bypassPermissions`, `auto`, `dontAsk` **refusés** par le serveur.
Non vérifié : l'alias `haiku` de `--model` (l'aide ne cite que `opus`, `sonnet`) — à essayer une fois à la main par le mainteneur.

## 2. Machine à états d'un lancement (`run`)

```
queued ─slot libre─> starting ─1re sortie pty ou transcript (≤ START_TIMEOUT_S=60)─> running
running <─> waiting        (waiting : fin de tour dans le transcript + pty muet ≥ 20 s ; ré-actif => running)
running|waiting ─pause: SIGSTOP(groupe)─> paused ─reprise: SIGCONT─> running
running|waiting|paused ─stop: [SIGCONT si paused] SIGTERM(groupe), STOP_GRACE_S=10 puis SIGKILL─> stopping ─> stopped
tout état vivant ─kill: SIGKILL(groupe)─> killed
running|waiting ─sortie non demandée : code 0─> done | code ≠ 0─> failed ; starting ─délai/erreur de spawn─> failed
queued ─annuler─> stopped ;  stopped|killed|failed ─relancer─> queued (puis --resume) ;  done : terminal
```
- Processus : `os.openpty()` + `subprocess.Popen(..., start_new_session=True)` ⇒ groupe propre ; signaux par `os.killpg`. `waitpid` dans un fil par run.
- Fin : la sortie du processus fait foi ; le transcript (`~/.claude/projects/<slug worktree>/{session}.jsonl`, déjà lu par `ClaudeCollector`) ne sert qu'à `waiting`, aux tokens et au budget.
- Budget : tokens du transcript > `budget × BUDGET_PAUSE_FACTOR` (2,0) ⇒ `paused` automatique + note (`--max-budget-usd` n'existe qu'avec `--print`).
- Persistance : `<checkout principal>/.claude/stt-runner/state.json` (ignoré par git, écriture atomique `.tmp` + `os.replace`), journal pty par run `…/stt-runner/<task>.log` (5 Mo max, tronqué par le début).
- Arrêt du serveur : `stop` de tous les runs vivants (le pty mourrait de toute façon) ⇒ `stopped`, reprenables.
- Redémarrage : run vivant dans `state.json` ⇒ si le PID existe **et** même heure de départ (`/proc/<pid>/stat`, sinon `ps -o lstart=`) ⇒ `orphan` (seul `kill` permis, pas de terminal) ; sinon `stopped`.

## 3. Pool et file

- `PROFILE_CAP = {"dev": 3, "archi": 1, "revue": 1, "cp": 0}`, `GLOBAL_CAP = 4` ; `paused` et `waiting` occupent leur place.
- File par profil, ordre `(prio, enqueued)` ; `prio` 1 haute, 2 normale (défaut), 3 basse. Ordonnanceur : boucle 1 s dans un fil du serveur.
- DEV : `inst` = premier numéro libre 1…3, écrit dans la tâche.
- Worktree : champ `worktree` de la tâche (relatif au checkout principal, doit commencer par `.claude/worktrees/`), sinon `.claude/worktrees/stt-<lot>` ; créé depuis `main` avec la branche `worktree-stt-<lot>` s'il manque. Plusieurs agents peuvent partager le worktree du lot (fichiers disjoints, le CP commite).
- **Seule source de lancement : `state.json`.** Un `runner:"auto"` écrit dans `plan-status.js` par un autre moyen (agent, `--kanban-apply`) ne lance rien.

## 4. Sécurité (décision 32)

- Jeton : `secrets.token_urlsafe(32)` au démarrage, en mémoire seulement, affiché dans la console.
- Transmission : le serveur remplace `<meta name="stt-token" content="">` dans `index.html` et `kanban.html` servis ; jamais dans une URL ni un fichier. La page l'envoie en `X-STT-Token`.
- Contrôle : `hmac.compare_digest` ; `Host` ∈ boucle locale (existant) ; `Origin` **obligatoire** et égal à `http://{127.0.0.1|localhost|[::1]}:{port}` ; `Sec-Fetch-Site` ≠ `cross-site` s'il est présent. Échec ⇒ 403 sans détail.
- Pages HTML : ajouter `Content-Security-Policy: frame-ancestors 'self'` et `Referrer-Policy: no-referrer` (anti-clickjacking des boutons kill).
- Lisible sans jeton : pages, `/api/state`, `/api/stream`, `/kanban/*`, `GET /api/runner` (états, sans sortie pty). Avec jeton : toute écriture du lanceur, le flux et la saisie du terminal.
- `POST /api/kanban` (inchangé, `X-STT-Kanban`) refuse désormais les clés réservées au lanceur : `runner`, `session`, `runState`, `started`, `ended`, `inst` si `runner` présent.

## 5. Interfaces HTTP (préfixe `/api/runner`)

| Route | Jeton | Corps / réponse |
|---|---|---|
| `GET /api/runner` | non | `{enabled, reason?, caps, runs:[{task, agent, model, state, session, pid?, worktree, inst?, enqueued, started?, ended?, exit?, tokens?, controllable:true}]}` |
| `POST /api/tasks` | oui | `{lot, title, agent, model, cx, prio?, worktree?, perm?, prompt, docs?, autostart}` ⇒ `{ok, id}` |
| `POST /api/runner/<task>/<action>` | oui | action ∈ `enqueue pause resume stop kill cancel` ⇒ `{ok, state}` ; 409 si transition interdite |
| `POST /api/runner/<task>/input` | oui | `{data}` (texte UTF-8, ≤ 64 Kio) |
| `POST /api/runner/<task>/resize` | oui | `{cols, rows}` ⇒ `TIOCSWINSZ` |
| `GET /api/runner/<task>/tty?since=N` | oui | flux : `event: out` `{seq, b64}`, `event: state` `{state}` ; tampon circulaire 256 Kio rejoué depuis `seq` |

`/api/state` gagne `runner` (= `GET /api/runner`) pour que l'onglet Agents n'ait qu'une source.

## 6. Kanban

- Création (`POST /api/tasks`) : id = `<lot>.<max suffixe numérique + 1>` ; `budget = est0 = PLAN.scale[cx].tokens` calculé par le serveur ; prompt écrit dans `data/prompts/<id>.md` (à côté de `plan-status.js`) ; `prompt:"stt-agents/data/prompts/<id>.md"` ; `task_add` via `kanban_apply` ; `autostart` ⇒ `runner:"auto"` + `enqueue`.
- Transitions écrites par le serveur : `todo→doing` à `starting` (+ `started`, `inst`, `session`, `runState`) ; `runState` à chaque changement ; `doing→review` + `reviewer:"revue"` à `done` ; `doing→blocked` + `note` à `failed`/`killed`/pause budget ; `ended` et `ms` (temps hors pause) à la fin.
- Réservé au CP : `review→done`, `blocked→todo`, `used` mesuré, `docs`, lots, décisions, journal.
- Formulaire (`kanban.html`, dialogue « Nouvelle tâche ») : lot (liste `PLAN.lots`), titre, profil (`dev|archi|revue`), modèle (défaut du profil : `model:` de `.claude/agents/stt-*.md`), cx, prio, worktree (facultatif), mode de permission, prompt (Markdown), « lancer dès que possible ». Masqué si `GET /api/runner` ⇒ `enabled:false` ou page sans jeton.

## 7. Onglet Agents

- Carte dont `a.id` = `session` d'un run : badge « lancé par le serveur », boutons Terminal, Pause, Reprendre, Stopper, Killer, activés selon l'état (Kill avec confirmation).
- Runs `queued`/`starting` sans transcript : section « File du lanceur » (tâche, profil, rang, Annuler).
- Sessions et sous-agents non lancés par le serveur : mention « observé · non pilotable ».
- Terminal : `<dialog>` avec xterm.js 5 + addon fit depuis cdnjs (SRI) ; sans CDN : `<pre>` en lecture seule + champ de saisie.

## 8. Tâches

| Id | Titre | Profil · modèle | cx | Fichiers | Tests | Dépend | //
|---|---|---|---|---|---|---|---|
| T1.1 | Faux agent et socle de tests | dev · haiku | S | `stt-agents/tests/fake_agent.py`, `tests/helpers.py`, `tests/test_server_baseline.py` | baseline : `--once`, `GET /`, `/kanban/`, `/api/kanban`, `POST /api/kanban` (dry_run) sur copie temporaire | — | non |
| T1.2 | Cœur du lanceur : états, pty, signaux, pool, persistance | dev · sonnet | L | `stt-agents/stt_runner.py` | `tests/test_runner.py` : chaque transition, caps, prio, budget, orphelin (PID réel / PID réutilisé), arrêt global | T1.1 | oui (∥ T1.3) |
| T1.3 | Jeton, Origin, en-têtes, injection meta, clés réservées | dev · sonnet | M | `stt_agents_server.py` (handler, `main`), meta vide dans `index.html`/`kanban.html` | `tests/test_security.py` : sans jeton / mauvais jeton / mauvaise Origin / Origin absente / Host étranger ⇒ 403 ; jeton absent des URL ; clé réservée refusée | T1.1 | oui (∥ T1.2) |
| T1.4 | Routes `/api/runner`, `/api/tasks`, ordonnanceur, écriture Kanban | dev · sonnet | L | `stt_agents_server.py`, `stt_runner.py` (crochets) | `tests/test_api.py` : création ⇒ id, budget, prompt.md ; cycle complet avec faux agent ⇒ `doing`, `review` ; flux tty rejoué depuis `seq` | T1.2, T1.3 | non |
| T1.5 | Formulaire « Nouvelle tâche » | dev · sonnet | M | `kanban.html` | Playwright `tests/ui-kanban.spec.mjs` : création ⇒ carte `todo` puis `doing` (faux agent) | T1.4 | oui (∥ T1.6) |
| T1.6 | Contrôles et terminal de l'onglet Agents | dev · sonnet | L | `index.html` | Playwright `tests/ui-agents.spec.mjs` : pause/reprise/stop/kill, saisie renvoyée en écho, mention non pilotable | T1.4 | oui (∥ T1.5) |
| T1.7 | Documentation | dev · haiku | S | `stt-agents/README.md`, `AGENTS.md` (§ lanceur), `.claude/agents/stt-cp.md` (créer les tâches par le formulaire) | relecture | T1.4 | oui |
| T1.R | Revue + essai réel unique avec `claude` (tâche XS) | revue · haiku puis mainteneur | M | — | checklist § 9 | T1.5–T1.7 | non |

Ordre : T1.1 → (T1.2 ∥ T1.3) → T1.4 → (T1.5 ∥ T1.6 ∥ T1.7) → T1.R.
Faux agent (`fake_agent.py`) : lit `--session-id`/`--resume`, écrit un JSONL minimal dans un `CLAUDE_CONFIG_DIR` temporaire, écrit sur le pty, renvoie la saisie en écho ; comportement dicté par le prompt : `EXIT n`, `SLEEP s`, `IGNORE_TERM` (teste le SIGKILL après délai), `SPAM` (tampon circulaire), `TOKENS n` (budget).
Tests Python : `python3 -m unittest discover demos/space-travel/stt-agents/tests` ; aucun test n'exécute `claude` (garde : `RUNNER_COMMAND[0] != "claude"` vérifié par `helpers.py`).

## 9. Risques et cas limites

- Exécution de commandes via HTTP : surface réduite à argv fixe + paramètres validés (profil ∈ liste, modèle ∈ `[a-z0-9.-]+`, worktree sous `.claude/worktrees/`, sans `..`) ; CSRF bloqué par jeton + Origin ; DNS rebinding par Host ; clickjacking par `frame-ancestors`.
- Coûts : jusqu'à 5 agents simultanés ; plafonds et pause budget ; aucune relance automatique d'un `failed`.
- Orphelins : groupe de processus + arrêt global + contrôle PID/heure de départ ; `node` enfant de `claude` couvert par `killpg`.
- SIGSTOP pendant un appel API : le flux peut expirer, Claude Code réessaie ou affiche une erreur à la reprise (à observer en T1.R).
- `waiting` ambigu (question posée en texte libre ou fin réelle) : aucune transition Kanban sur `waiting`, seulement un badge.
- Deux agents dans le même worktree : conflits d'index git possibles si un agent commite ; les profils DEV ne commitent pas.
- Flux terminal : la sortie peut contenir des secrets ⇒ jeton exigé ; pas de journal pty hors `.claude/`.

## 10. Hors périmètre

Windows (pty) ; lancement de la session CP ; pilotage des sous-agents de l'outil Agent ; accès réseau distant ; relance automatique ; fusion/commit par le serveur ; mesure de `used` au format `<usage>` (le CP reste maître de `used`).

## 11. Critères d'acceptation

1. Sans `--runner`, comportement et tests baseline identiques. 2. Une tâche créée au formulaire est lancée par le serveur dans son worktree, passe `todo→doing→review` sans action du CP (faux agent). 3. Pause, reprise, stop, kill et terminal fonctionnent depuis l'onglet Agents ; reprise après stop par `--resume`. 4. Toute route de contrôle sans jeton ou Origin valide ⇒ 403 ; le jeton n'apparaît dans aucune URL. 5. Plafonds et file respectés ; redémarrage du serveur sans processus perdu ni relancé à tort. 6. Stdlib seule ; Linux et macOS.
