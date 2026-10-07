# STT · agents en direct

Tableau de bord temps réel des agents Claude Code qui travaillent sur *Space Travel & Transport* (dépôt `csblog`) : qui est en action, qui **t'attend** (réponse ou validation), à quelle étape du flux PM → Architecte → Développeur il en est, ce qu'il fait à la seconde près, et ce qui a été livré sur GitHub.

Deux fichiers, aucune dépendance (Python 3.8+ standard, page HTML autonome) :

| Fichier | Rôle |
|---|---|
| `stt_agents_server.py` | Collecte (sessions Claude Code + git + GitHub) et sert la page sur `http://127.0.0.1:8765`, avec mises à jour poussées en direct (SSE, ~2 s). |
| `kanban.html` | Le Kanban des lots (page fixe), servi sur `http://127.0.0.1:8765/kanban/` et intégré au tableau de bord dans l'onglet **Kanban** (iframe ; `?embed=1` masque son titre). Lit `data/plan-status.js` et affiche les documents liés par le serveur (aperçu Markdown, Mermaid, images). |
| `data/plan-status.js`, `data/prompts/` | Données du Kanban et prompts exécutés par les agents. **Écrits uniquement par le serveur** (voir « Kanban »), toujours dans le checkout principal. |
| `index.html` | Le tableau de bord. Servi par le serveur : vue complète. Ouvert seul (fichier local ou GitHub Pages) : vue GitHub publique. |

## Démarrer

Sur **le PC où tournent les agents** (les transcripts Claude Code y sont stockés) :

```bash
cd demos/space-travel/tools/agents-dashboard
python stt_agents_server.py --open        # Windows : py stt_agents_server.py --open
```

Le dépôt observé est celui qui contient le script, le dépôt GitHub est lu depuis le remote `origin`. Laisser tourner dans un terminal ; `Ctrl+C` pour arrêter.

Options utiles :

| Option | Effet |
|---|---|
| `--repo CHEMIN` | Observer un autre clone (celui où les agents travaillent réellement). |
| `--match MOTIF` | Ajouter des dossiers de `~/.claude/projects` dont le nom contient `MOTIF`. Par défaut, tout dossier contenant le nom du dépôt (`csblog`) et ceux des worktrees git (même hors du dépôt) sont déjà suivis. |
| `--strict` | Ne suivre que le chemin exact du dépôt et de ses worktrees. |
| `--claude-dir CHEMIN` | Dossier de configuration Claude Code (défaut `~/.claude`, ou `CLAUDE_CONFIG_DIR`). |
| `--window 24` | Sessions prises en compte : actives dans les N dernières heures. |
| `--port 8765` / `--host` | Port et interface d'écoute (127.0.0.1 par défaut). |
| `--no-github` | Couper la source GitHub. |
| `--once` | Imprimer un instantané JSON et quitter (diagnostic). |

`GITHUB_TOKEN` (facultatif) dans l'environnement relève le quota GitHub de 60 à 5 000 requêtes/heure. Sans jeton, le serveur interroge GitHub toutes les 75 s avec des requêtes conditionnelles (ETag) : les réponses inchangées ne consomment pas de quota.

## L'en-tête

L'en-tête tient sur une rangée : la marque, les **indicateurs du Kanban** (tokens consommés, temps estimé / consommé, tâches faites, lot en cours, lots · surface = estimation, chargés depuis `kanban/?embed=kpis` et visibles quel que soit l'onglet), puis le **thème clair / sombre** et les alertes. Le thème est unique pour toute la page : l'interrupteur de l'en-tête pilote aussi les deux cadres du Kanban (message `stt-theme`) et se mémorise sous la clé `kanbanTheme`, la même que celle du Kanban autonome. Sous l'en-tête, une rangée porte les onglets, les liens de la page Agents et l'état de la connexion. Sans le serveur local, les indicateurs sont masqués.

## Les onglets

Le tableau de bord (`http://127.0.0.1:8765/`) a deux onglets : **Agents** (sessions, agents créés, chronologie, flux, livraisons) et **Kanban**. L'onglet choisi est mémorisé ; `#kanban` dans l'URL ouvre directement le Kanban, et les liens de la barre de navigation (`#feed`…) ramènent à l'onglet Agents. Le Kanban n'est chargé qu'à la première ouverture et demande le serveur local : sans lui (GitHub Pages, fichier local), l'onglet affiche un message. La barre « Agents créés » filtre par état (actif et silencieux cochés par défaut ; terminé, arrêté, erreur décochés).

## Les trois modes de la page

| Mode | Quand | Ce qu'on voit |
|---|---|---|
| **LIVE** | page servie par `stt_agents_server.py` | Tout : sessions, agents (identifiant, état, arrêt), outil en cours, todo, rôle, attente, worktrees, GitHub. |
| **GITHUB** | `index.html` ouvert seul, ou publié sur GitHub Pages (`…/demos/space-travel/tools/agents-dashboard/`) | Branches, PR, push, déploiement Pages. Un agent n'apparaît qu'à ses push : pas d'activité entre deux push. |
| **DÉMO** | aucune source joignable, ou `?demo` dans l'URL | Données **fictives**, signalées par un bandeau rouge. Sert d'aperçu. |

Paramètres d'URL : `?repo=owner/nom` (autre dépôt GitHub), `?github=0` (pas d'appel GitHub), `?demo`.

## Agents et sous-agents

La section **01 · Agents & sous-agents** affiche par défaut un **arbre** : chaque session Claude Code (agent principal) suivie de **tous** ses sous-agents (PM, Architecte, Développeur, Explore…), en cours comme terminés, avec pour chacun son statut, son rôle, l'outil en cours ou son dernier message, sa durée, ses outils et tokens. Un clic sur une ligne déplie ses dernières actions, son dernier message, ses tâches et son identité (type, `agentId`, arrière-plan, modèle). Le bouton **Cartes** donne la vue détaillée par session. La chronologie a une piste par sous-agent.

Formats de transcripts reconnus pour les sous-agents :

| Format | Emplacement |
|---|---|
| Claude Code 2.1+ | `<projet>/<session>/subagents/agent-<id>.jsonl` |
| Claude Code 2.0 | `<projet>/agent-<id>.jsonl` (rattaché à sa session par `sessionId`) |
| Versions plus anciennes | lignes `isSidechain` dans le fichier de la session |

Chaque appel `Task` / `Agent` est relié à son transcript par l'`agentId` renvoyé, puis par la consigne, puis par l'heure de lancement. Les sous-agents lancés **en arrière-plan** restent « en action » jusqu'à leur notification de fin ou leur rapport final.

## Comment les statuts sont déduits

Le serveur lit en continu `~/.claude/projects/<chemin du dépôt>*/*.jsonl` (et `…/<session>/subagents/*.jsonl`), en ne lisant que les lignes ajoutées depuis le passage précédent.

| Statut affiché | Règle |
|---|---|
| **En action** / outil en cours / réfléchit | Dernière entrée < 90 s, ou outil lancé sans résultat depuis peu. |
| **T'attend** | Le dernier message de l'agent est du texte (fin de tour), ou il pose une question (`AskUserQuestion`, validation de plan), ou il a été interrompu. Devient *inactif* après 45 min. |
| **Validation ?** | Un outil rapide (Edit, Write…) reste sans résultat plus de 30 s, ou un Bash plus de 120 s : Claude Code attend très probablement ton accord (ou la commande est longue). |
| **Inactif** / **Livré** | Rien depuis longtemps ; *Livré* si la PR de sa branche est mergée. |

**Rôle et étape** (mode agentique de `AGENTS.md`) : marqueurs en tête de ligne dans les messages (`**PM**`, `## Architecte`, `Développeur :`…), type ou description des sous-agents, et à défaut les outils utilisés (édition de code → Dév, écriture de spec `.md` dans `docs/` → Archi, `gh pr create` → PM). L'étape PR / Livré vient de GitHub. Ces déductions sont des **heuristiques** : un agent qui n'annonce pas son rôle peut être mal classé.

Les seuils sont des constantes en tête de `stt_agents_server.py` (`ACTIVE_S`, `FAST_TOOL_WAIT_S`, `LONG_TOOL_WAIT_S`, `WAITING_MAX_S`).

## Alertes

Le bouton **Alertes** active une notification du navigateur quand un agent passe en « T'attend » ou « Validation ? ». L'onglet affiche aussi le nombre d'agents en attente : `(2) STT · Agents en direct`.

## Sécurité

Le serveur n'écoute que sur `127.0.0.1` et refuse les requêtes dont l'en-tête `Host` n'est pas local (protection DNS rebinding) ; il n'envoie pas d'en-têtes CORS, donc un site tiers ne peut pas lire `/api/state`. La page affiche des extraits de transcripts (consignes, fichiers modifiés) : `--host 0.0.0.0` les rend lisibles par tout le réseau local.

## Kanban

Le Kanban fait partie de l'outil : page `kanban.html` à `http://127.0.0.1:8765/kanban/`, données dans `data/` (checkout principal uniquement, jamais un worktree).

**Écriture, pilotée par le CP.** Le chef de projet (`stt-cp`) envoie des opérations ; le serveur édite `data/plan-status.js` ligne à ligne, le valide avec Node, puis le remplace atomiquement (tout ou rien). Aucun agent DEV n'écrit le Kanban.

```bash
python3 stt_agents_server.py --kanban-apply ops.json            # sans serveur ; --dry-run pour contrôler seulement
curl -s -X POST http://127.0.0.1:8765/api/kanban -H 'X-STT-Kanban: 1' -H 'Content-Type: application/json' -d @ops.json
curl -s http://127.0.0.1:8765/api/kanban                          # résumé : tâches, lots, journal
```

Opérations (`{"ops": [...]}`) : `task` (`set`, `add` cumulant `used`/`ms`, `unset`), `task_add`, `lot`, `decision`, `decision_set`, `journal`, `top` (`currentLot`, `updated`), `history_snapshot` (estimation et consommation calculées). `updated` est posé automatiquement et ne recule jamais. L'en-tête `X-STT-Kanban: 1` est obligatoire : il bloque l'écriture depuis une page web tierce. `--kanban CHEMIN` remplace le chemin par défaut des données.

**Documents affichés.** Les chemins des données (`docs`, `prompt`, `spec`) sont relatifs à `KANBAN_DOC_BASE` (`demos/space-travel/`). Le serveur les sert sous `/kanban/doc/…` en cherchant, dans l'ordre, dans les racines de la variable **`KANBAN_DOC_ROOTS`** de `stt_agents_server.py` (relatives au checkout principal ; `""` = le checkout principal). Une racine de worktree permet d'afficher un document pas encore fusionné, avec un bandeau « version du worktree » ; **l'ordre compte** (le premier fichier trouvé gagne) et une racine se retire de la liste une fois sa branche fusionnée. Les fichiers HTML, JS ou JSON sont servis en texte, les SVG en bac à sable ; `..`, `.git` et `node_modules` sont refusés.

## Dépannage

- **« Aucun dossier ne commence par … »** : les agents ont été lancés depuis un autre chemin que `--repo`. Le message liste les dossiers proches ; relancer avec `--repo` sur le bon clone ou `--match csblog`.
- **Rien côté GitHub** : vérifier le remote `origin` ou passer `--github mcgivrer/csblog` ; en cas de quota épuisé, le serveur attend la réinitialisation.
- Le format des transcripts Claude Code n'est pas une API publique : s'il évolue, la lecture se dégrade (champs vides) sans bloquer le tableau de bord. Diagnostic : `python stt_agents_server.py --once`.

## Lanceur d'agents

### Activation

Le serveur peut lancer et piloter des agents Claude Code à la demande (opt-in ; refusé hors 127.0.0.1, localhost, ::1 et sous Windows) :

```bash
python3 stt_agents_server.py --runner [--runner-cmd '["commande"]']
```

Par défaut, la commande est `["claude","--agent","stt-{agent}","--model","{model}",…]` (`{agent}`, `{model}`, `{session}`, `{perm}`, `{task}`, `{prompt}` substitués). Le jeton de sécurité est affiché **une seule fois** à la console, puis injecté dans les pages (jamais dans une URL). L'état des agents et les logs des terminaux sont stockés dans `.claude/stt-runner/` du checkout principal.

### Créer une tâche

Bouton « **＋ Nouvelle tâche** » du Kanban (formulaire livré par T1.5) : lot, titre, profil (dev/archi/revue), modèle, complexité, priorité, worktree optionnel, mode de permission, prompt Markdown, « lancer dès que possible ». Les tâches créées sans lanceur restent « à faire » et peuvent être lancées ultérieurement.

### Worktree, base et consigne de l'agent (T1.11)

- **Base du worktree.** Champ facultatif `base` (formulaire de création et d'édition, corps de `POST /api/tasks` et `POST /api/tasks/<id>/edit`) : nom d'une branche **locale existante** (`^[A-Za-z0-9][A-Za-z0-9._/-]*$`, ni `..` ni tiret initial ; sinon 400). Elle n'est utilisée **que si le worktree de la tâche n'existe pas encore** : le lanceur crée alors la branche `worktree-stt-<lot>` à partir de `base` (défaut `main`). Si le worktree (ou la branche `worktree-stt-<lot>`) existe déjà, `base` est **ignorée**. Elle est stockée dans la ligne du plan (clé `base`, supprimée si vide ou « main ») et relue quand on met en file une tâche connue du plan. Pour travailler sur du code non fusionné, choisir le worktree existant ou la branche qui le porte.
- **`GET /api/worktrees`** (sans jeton) : `{"worktrees": [{"path": ".claude/worktrees/…", "branch": "…"}], "branches": ["main", …]}` ; alimente la liste de suggestions et la liste déroulante « Base du worktree » du formulaire.
- **Règles à jour pour les agents.** Un agent lancé lit `.claude/agents/` **de son worktree**, pas celui du checkout principal : pour qu'il applique les règles à jour (par exemple « le serveur écrit le Kanban, pas le DEV »), son worktree doit porter une branche qui les contient (d'où le champ `base`). La phrase donnée à l'agent lui rappelle en plus : ne jamais modifier `data/plan-status.js` ni `kanban.html`, ne pas changer le statut de sa tâche (le serveur le fait), rester dans son worktree, rendre un rapport court.
- **Écriture du plan.** Toute modification de `plan-status.js` (serveur ou `--kanban-apply`) prend un verrou de fichier exclusif (`flock` sur `<checkout principal>/.claude/stt-runner/plan.lock`, dossier privé du lanceur en 0700 ignoré par le dépôt ; sans ce dossier, `<dossier du plan>/.plan.lock` ; 10 s au plus). Le dossier est refusé, avec une erreur explicite et jamais de passage sans verrou, s'il est un lien symbolique, appartient à un autre utilisateur ou a des droits plus larges que 0700 ; le fichier est ouvert en `O_NOFOLLOW` puis vérifié (fichier ordinaire, bon propriétaire) en plus du verrou du processus : deux processus ne perdent plus de mise à jour. Édition d'une tâche et mise en file d'une tâche connue du plan sont sérialisées.

### Cycle de vie d'un agent lancé

| État | Sens |
|---|---|
| **queued** | En file d'attente (attendant un slot libre) |
| **starting** | Démarrage du processus (< 60 s) |
| **running** | En cours, pty actif |
| **waiting** | Actif mais pty muet ≥ 20 s (fin de tour dans le transcript) ; redevient *running* si nouvel output |
| **paused** | Suspendu (SIGSTOP du groupe) |
| **stopping** | Arrêt en cours (SIGTERM, puis SIGKILL après 10 s) |
| **stopped** | Arrêté (reprend via `--resume`) |
| **killed** | Processus tué (SIGKILL) |
| **done** | Terminé avec code 0 |
| **failed** | Erreur (code non-zéro ou démarrage impossible) |
| **orphan** | Processus détaché au redémarrage (seul `kill` permis, pas de terminal) |

**Pool et priorités** : 3 DEV, 1 ARCHI, 1 REVUE (4 slots globaux) ; priorité 1–3 (haute–basse). Les états *paused* et *waiting* occupent leur slot. **Pause automatique** si tokens du transcript > 2 × le budget. **Transitions Kanban** écrites automatiquement par le serveur : `todo`→`doing` à *starting* (`+inst`/`+session`/`+runState`), `doing`→`review` à *done*, `doing`→`blocked` à *failed*/*killed*. Le CP seul peut passer `review`→`done`.

### Onglet Agents

Les agents lancés par le serveur affichent un badge « lancé par le serveur », un état en couleur et cinq boutons :

- **Terminal** : dialogue xterm.js (CDN SRI) ou repli `<pre>` sans CDN ; fermeture Ctrl+Alt+W
- **Pause** / **Reprendre** : SIGSTOP / SIGCONT du groupe
- **Stopper** : SIGTERM, puis SIGKILL après 10 s
- **Killer** : SIGKILL immédiat (confirmation requise)
- **Relancer** : re-queue depuis *stopped*, *killed* ou *failed*

La section « **File du lanceur** » affiche les runs en attente (*queued*) ou en démarrage (*starting*), et les runs vivants qui n'ont pas (encore) de carte, avec leurs contrôles. Les sessions et agents créés par l'outil Agent de la session CP sont marqués « observé · non pilotable ».

### Permissions

Modes **acceptés** (`ALLOWED_PERMS` dans `stt_runner.py`) : `acceptEdits` (**défaut**, décision 33), `plan` et `manual`. Modes **refusés** par le serveur (`FORBIDDEN_PERMS`) : `bypassPermissions`, `auto` et `dontAsk`. Avec `acceptEdits`, les commandes shell demandent ta validation dans le terminal de l'onglet Agents.

### Sécurité et limites

- **Jeton** : généré à chaque démarrage du serveur, mémoire seule, affichage console unique.
- **Machine partagée** : tout compte local pouvant joindre `127.0.0.1:<port>` lit le jeton (`GET /`) et pilote les agents : ne pas utiliser sur une machine partagée.
- **Environnement des agents** : `CLAUDECODE`, `CLAUDE_CODE_*`, `CLAUDE_PID`, `CLAUDE_JOB_DIR` et `CLAUDE_EFFORT` ne sont pas transmis (le reste, dont `CLAUDE_CONFIG_DIR`, `PATH`, `HOME`, `ANTHROPIC_*`, l'est). Chaque agent a le pty pour terminal de contrôle (fermeture du pty ⇒ SIGHUP). SIGHUP et SIGTERM arrêtent le serveur proprement.
- **Fichiers** : `.claude/stt-runner/` en 0700, `state.json` et journaux en 0600 ; `/kanban/doc/` refuse tout chemin contenant `.claude` sauf `.claude/agents/*.md`.
- **Enqueue** : une tâche inconnue du lanceur n'est lancée que si `data/prompts/<id>.md` existe (écrit par le formulaire `POST /api/tasks`), sinon 409.
- **Terminal** : 4 flux `tty` simultanés au plus par tâche (429 au-delà).
- **Budget** : `tokens_of` compte input + output + cache_write (cache de lecture exclu).
- **Authentification** : `X-STT-Token` en en-tête HTTP, `Origin` (obligatoire, boucle locale), `Host` local, CSP `frame-ancestors 'self'`.
- **Clés réservées** : POST `/api/kanban` refuse les clés `runner`, `session`, `runState`, `started`, `ended`, `inst` du lanceur.
- **Orphelins** : groupe de processus + détection PID/heure de départ ; seul `kill` permis, pas d'accès terminal.
- **Hors périmètre** : Windows (pty), lancement de la session CP elle-même, pilotage des sous-agents de l'outil Agent, accès distant, relance automatique, fusion/commit par le serveur.
- **Non vérifié à ce jour** : comportement du vrai `claude` sous SIGSTOP/SIGCONT/SIGTERM ; alias `--model haiku` (test prévu en T1.R).

### Notifications (T2)

Toasts en bas à droite, notifications du navigateur (sur accord) et réglages par catégorie (Kanban, lanceur, erreurs) — voir `stt_notices.py` et l'onglet Paramètres.
