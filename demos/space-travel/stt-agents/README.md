# STT · agents (orchestrateur d'agents Claude Code)

Outil local qui sert à conduire le travail des agents Claude Code sur *Space Travel & Transport* : un tableau de bord temps réel, un Kanban des lots, un lanceur d'agents (facultatif) et un client en ligne de commande.

Ce document décrit le code tel qu'il est dans le dépôt. Un test (`tests/test_readme.py`) vérifie que les options, les routes et les fichiers cités ici existent.

## Sommaire

1. À quoi ça sert, et ce que ça n'est pas
2. Démarrage rapide
3. Options de la ligne de commande
4. Les onglets et les écrans
5. Le lanceur d'agents
6. L'équipe d'agents permanente (lot T4)
7. Le Kanban
8. Notifications
9. Référence de l'API HTTP
10. Client en ligne de commande
11. Sécurité
12. Tests
13. Dépannage
14. Organisation des fichiers et des branches

## 1. À quoi ça sert, et ce que ça n'est pas

**À quoi ça sert.** Le serveur `stt_agents_server.py` :

- lit en continu les transcripts Claude Code (`~/.claude/projects`), l'état git et GitHub, et en déduit qui travaille, qui attend une réponse ou une validation, et ce qui a été livré ;
- sert le tableau de bord (`index.html`) et le Kanban (`kanban.html`) sur une page locale, avec mises à jour poussées en direct (SSE, collecte toutes les 2 s) ;
- tient le fichier de données du Kanban (`data/plan-status.js`) : il est le seul à l'écrire ;
- avec `--runner`, lance des agents `claude` dans leur propre terminal (pty), les suit, les met en pause, les arrête et fait passer leurs tâches de statut au Kanban.

**Ce que ça n'est pas.**

- Pas un service : un processus Python (stdlib seule) lancé à la main, sur le PC où tournent les agents, à l'écoute de la boucle locale.
- Pas un serveur multi-utilisateur : le jeton de pilotage est lisible par tout compte local qui peut joindre le port (voir § 11).
- Pas de Windows pour le lanceur (`--runner` y est refusé) ; l'observation seule fonctionne ailleurs.
- Pas un agent : il ne commite, ne fusionne et ne pousse rien. Le chef de projet (CP) décide, les agents travaillent dans leur worktree.
- Le format des transcripts Claude Code n'est pas une API publique : s'il change, la lecture se dégrade (champs vides) sans bloquer le tableau de bord.

Le Kanban s'appuie sur Node (`node`) pour lire et valider `data/plan-status.js`.

## 2. Démarrage rapide

Depuis la racine du dépôt :

```bash
python3 demos/space-travel/stt-agents/stt_agents_server.py --open
```

- Le port par défaut est 8765 : `http://127.0.0.1:8765/` (tableau de bord), `http://127.0.0.1:8765/kanban/` (Kanban seul). `--port 8800` pour en changer.
- Sans `--runner`, le serveur observe seulement (sessions, GitHub, Kanban en lecture, écriture du Kanban par le CP).
- Avec le lanceur :

```bash
python3 demos/space-travel/stt-agents/stt_agents_server.py --runner --open
```

- Au démarrage, la console affiche l'adresse, le dépôt observé, les sources de sessions, GitHub, le Kanban et, avec `--runner`, l'état du lanceur. La ligne `jeton :` donne le jeton de pilotage. Il est aussi injecté dans les pages servies (`<meta name="stt-token">`) : ouvrir la page suffit, il n'y a rien à copier. Il n'apparaît jamais dans une URL.
- **Après un redémarrage du serveur, recharger la page** (F5) : le jeton change à chaque démarrage, une page déjà ouverte garde l'ancien et ses actions reçoivent un 403.
- `Ctrl+C` (ou SIGTERM, SIGHUP avec `--runner`) arrête le serveur ; les agents en cours sont arrêtés (état `stopped`, relançables par `--resume`, voir § 5).
- Le dépôt observé est celui qui contient le script ; `--repo` en désigne un autre. Le dépôt GitHub est lu depuis le remote `origin` (`--github` pour le forcer, `--no-github` pour le couper). La variable d'environnement `GITHUB_TOKEN` (ou `GH_TOKEN`) est facultative : elle fait passer la collecte GitHub de 75 s à 30 s d'intervalle et relève le quota ; sans elle, les requêtes sont conditionnelles (ETag).
- Diagnostic sans serveur : `python3 demos/space-travel/stt-agents/stt_agents_server.py --once` imprime un instantané JSON et quitte.

## 3. Options de la ligne de commande

Serveur (`stt_agents_server.py`) :

| Option | Valeur | Effet |
|---|---|---|
| `--repo` | chemin | Racine du dépôt observé (défaut : le dépôt qui contient le script). |
| `--claude-dir` | chemin | Dossier de configuration Claude Code (défaut : `CLAUDE_CONFIG_DIR`, sinon `~/.claude`). |
| `--match` | motif | Ajoute les dossiers de `~/.claude/projects` dont le nom contient le motif (répétable). Par défaut, tout dossier contenant le nom du dépôt et ceux des worktrees git sont déjà suivis. |
| `--strict` | | Ne suit que le chemin exact du dépôt et de ses worktrees. |
| `--github` | `owner/dépôt` | Dépôt GitHub (défaut : remote `origin`). |
| `--no-github` | | Désactive la source GitHub. |
| `--window` | heures | Sessions actives dans les N dernières heures (défaut 24). |
| `--host` | adresse | Interface d'écoute (défaut `127.0.0.1`). Hors boucle locale, le contrôle de `Host` est levé et les extraits de transcripts sont lisibles par tout le réseau ; `--runner` l'interdit. |
| `--port` | entier | Port d'écoute (défaut 8765). |
| `--open` | | Ouvre le tableau de bord dans le navigateur. |
| `--once` | | Imprime un instantané JSON puis quitte. |
| `--verbose` | | Journalise les requêtes HTTP sur la sortie d'erreur. |
| `--kanban` | chemin | Autre fichier `plan-status.js` (défaut : `data/plan-status.js` du checkout principal). |
| `--kanban-apply` | `OPS.json` ou `-` | Applique des opérations au Kanban (fichier, ou `-` pour l'entrée standard) puis quitte ; sans serveur. |
| `--dry-run` | | Avec `--kanban-apply` : valide sans écrire. |
| `--runner` | | Active le lanceur d'agents (opt-in ; boucle locale uniquement, hors Windows). |
| `--runner-cmd` | liste JSON | Avec `--runner` : commande du lanceur, liste argv JSON non vide (défaut : `claude` interactif, voir § 5). |
| `--agent-settings` | chemin ou `none` | Avec `--runner` : liste d'autorisations des agents (voir § 5). |

Options cachées de l'aide, réservées aux tests (délais en secondes) : `--autoexit-grace`, `--autoexit-kill-after`, `--waiting-silence`, `--stop-grace`.

Refus à l'ouverture, code de sortie 2 : `--runner` hors boucle locale ou sous Windows ; `--runner-cmd` ou `--agent-settings` sans `--runner` ; `--runner-cmd` qui n'est pas une liste JSON de chaînes ; `--agent-settings` invalide.

Client (`stt_client.py`) : voir § 10.

## 4. Les onglets et les écrans

La page `http://127.0.0.1:8765/` a cinq onglets, dans cet ordre : **Kanban** (onglet par défaut la première fois), **Agents**, **Chronologie**, **Flux**, **Livraisons**. L'onglet choisi est mémorisé ; `#kanban`, `#timeline`, `#feed` ou `#delivery` dans l'URL ouvre directement un onglet. L'en-tête porte les indicateurs du Kanban (jetons, temps, tâches faites, lot en cours), le thème clair / sombre (partagé avec le Kanban) et le bouton **Alertes**.

### Trois modes de la page

| Mode | Quand | Contenu |
|---|---|---|
| LIVE | page servie par `stt_agents_server.py` | tout : sessions, agents, terminal, worktrees, GitHub, Kanban |
| GITHUB | `index.html` ouvert seul (fichier local, GitHub Pages) | branches, PR, déploiement ; pas d'activité entre deux push ; Kanban absent |
| DÉMO | aucune source joignable, ou `?demo` dans l'URL | données fictives, bandeau rouge |

Paramètres d'URL : `?repo=owner/nom` (autre dépôt GitHub), `?github=0` (pas d'appel GitHub), `?demo`.

### Kanban

Page `kanban.html`, affichée dans un cadre de l'onglet (chargée à la première ouverture, serveur local requis) et seule sur `/kanban/`. Vue **Tableau** (colonnes de statut, tokens par agent, décisions, journal) et vue **Indicateurs** (burndown, tokens par profil, calibrage). Filtres : agent (Tous, CP, ARCHI, DEV, REVUE), lot, bouton Docs (documents liés), « Tout replier », actualisation toutes les 30 s ou à la demande. Quand la page est servie par le serveur, **＋ Nouvelle tâche** crée une tâche (lot, titre, profil, modèle, taille, priorité, worktree, base, mode de permission, prompt Markdown, documents, « lancer dès que possible ») et une tâche « à faire » se modifie par son crayon. Une tâche liée à un agent a un lien vers lui dans l'onglet Agents. Les dépendances (`deps`) sont des données de la tâche, exposées par l'API (§ 9) ; le Kanban ne les dessine pas.

### Agents

- **Deux affichages** : *Arbre* (chaque session suivie de tous ses sous-agents, avec l'outil en cours, la durée, les jetons ; un clic déplie ses dernières actions) et *Cartes* (vue détaillée par session).
- **Filtres des sessions** : *Actifs* (défaut : T'attendent, En action, En revue), *T'attendent*, *En action*, *En revue*, *Terminés*, *Inactifs*, *Tous*, avec leurs effectifs. Un agent piloté par le serveur dont le processus vit compte comme « en action » même si son transcript est silencieux.
- **Filtre des agents créés** (sous les sessions) : Actif et Silencieux cochés par défaut ; Terminé, Arrêté et Erreur décochés.
- **Cartes et nœuds d'agents lancés par le serveur** : pastille « lancé par le serveur », état en couleur et boutons Terminal, Pause / Reprendre, Stopper, Killer (confirmation), Relancer, Annuler (tâche en file). Les agents créés par l'outil Agent d'une session sont marqués « observé · non pilotable ».
- **Terminal** : bouton Terminal, ou **double-clic** n'importe où sur la carte ou le nœud d'un agent piloté. Fenêtre xterm.js 5 (chargée depuis cdnjs et jsDelivr avec empreintes SRI ; repli `<pre>` sans réseau). Fermeture : bouton Fermer ou `Ctrl+Alt+W` ; `Échap` va au programme. Fermer ne stoppe pas le run.
- **Lien vers la tâche** : le numéro de tâche (`· T3.10`) d'une carte ouvre l'onglet Kanban sur cette tâche ; les toasts de notification font de même.
- **File du lanceur** : runs en file (*queued*) ou en démarrage, et runs vivants sans carte, avec leurs contrôles.
- **Worktrees** (en bas de l'onglet) : pour chaque worktree, branche, avance / retard, modifications, dernier commit, **dernière tâche** (voir § 5) et session. La dernière tâche s'affiche au survol, au focus clavier ou au clic (épinglé ; `Échap` ferme).

### Chronologie, Flux, Livraisons

- **Chronologie** : une piste par agent et sous-agent sur 6 heures (intensité par tranche de 5 min, PR ouvertes et mergées).
- **Flux** : événements en direct (aria-live).
- **Livraisons** : pull requests GitHub et état de Pages.

### Comment les statuts sont déduits

| Statut | Règle |
|---|---|
| En action | dernière entrée de transcript < 90 s, ou outil lancé sans résultat depuis peu |
| T'attend | dernier message = texte (fin de tour), question (`AskUserQuestion`, plan à valider) ou interruption ; *inactif* après 45 min |
| Validation ? | outil rapide (Edit, Write…) sans résultat depuis plus de 30 s, ou Bash / web depuis plus de 120 s |
| Inactif / Livré | rien depuis longtemps ; *Livré* si la PR de sa branche est mergée |

Les seuils sont des constantes en tête de `stt_agents_server.py` (`ACTIVE_S`, `FAST_TOOL_WAIT_S`, `LONG_TOOL_WAIT_S`, `WAITING_MAX_S`). Le rôle (PM, ARCH, DEV, REVUE…) vient des marqueurs de tête de ligne dans les messages, du type des sous-agents ou des outils utilisés : ce sont des heuristiques, un agent qui n'annonce pas son rôle peut être mal classé.

Formats de transcripts de sous-agents reconnus : `<projet>/<session>/subagents/agent-<id>.jsonl` (Claude Code 2.1+), `<projet>/agent-<id>.jsonl` (2.0, rattaché par `sessionId`), lignes `isSidechain` dans la session (plus ancien).

## 5. Le lanceur d'agents

Activé par `--runner`. Le cœur est `stt_runner.py` (stdlib, sans HTTP) ; `stt_agents_server.py` y colle le Kanban, les notifications et HTTP.

### Cycle de vie d'un run

Un *run* est une exécution d'une tâche du Kanban. Il est créé en file par `POST /api/tasks` avec `autostart`, par « Lancer » sur une tâche connue du plan, ou par `stt_client.py enqueue` / `submit` ; une tâche inconnue du lanceur n'est lancée que si son prompt `data/prompts/<id>.md` existe, sinon 409.

| État | Sens |
|---|---|
| `queued` | en file, attend un emplacement libre de son profil |
| `starting` | processus lancé, pas encore de sortie (60 s au plus, sinon `failed`) |
| `running` | en cours, pty actif |
| `waiting` | fin de tour dans le transcript et pty muet depuis 20 s ; redevient `running` à la reprise |
| `paused` | suspendu (SIGSTOP du groupe) |
| `stopping` | arrêt demandé (SIGTERM, SIGKILL après 10 s) |
| `stopped` | arrêté ; relançable (reprise par `--resume`) |
| `killed` | tué (SIGKILL) ; relançable |
| `done` | terminé avec le code 0 |
| `failed` | code non nul ou lancement impossible ; relançable |
| `orphan` | processus resté vivant d'un lancement précédent du serveur : seul `kill` est permis, ni terminal ni rapport |

Chaque agent tourne dans son propre groupe de processus, sous un pty (terminal de contrôle, 24×80 au départ). Journaux : `.claude/stt-runner/<tâche>.log` (5 Mio au plus, tronqués par le début). Le tampon de sortie rejouable est de 256 Kio.

**Lancement.** La commande par défaut est (voir `RUNNER_COMMAND` dans `stt_runner.py`) :

```
claude --agent stt-{agent} --model {model} --session-id {session} --add-dir {prompts_dir} --permission-mode {perm} -n {task} {prompt}
```

avec, quand la liste d'autorisations est active, `--settings {settings}` avant `-n`. Les jokers `{agent}`, `{model}`, `{session}`, `{perm}`, `{task}`, `{prompt}`, `{prompts_dir}`, `{settings}` sont substitués dans une liste argv (aucun shell). `--add-dir` ne donne accès qu'au dossier des prompts, jamais au dépôt entier. Le prompt est une phrase construite par le serveur : *Exécute la tâche `<id>` : lis `<chemin absolu du prompt>`*, suivie des règles (ne pas modifier `data/plan-status.js` ni `kanban.html`, ne pas changer le statut de la tâche, rester dans son worktree, rapport court). Un run relancé après arrêt reprend la session avec `--resume`. `--runner-cmd` remplace la commande (c'est ainsi que les tests utilisent un faux agent).

**Worktree et base.** Chaque tâche travaille dans `.claude/worktrees/stt-<lot>` (ou le worktree indiqué sur la tâche), créé au besoin sur la branche `worktree-stt-<lot>`. Le champ `base` (nom d'une branche locale existante ; refus 400 sinon) est la branche de départ **seulement si le worktree n'existe pas encore** ; sinon elle est ignorée. Par défaut : `main`. Un agent lit `.claude/agents/` de **son** worktree : pour qu'il applique des règles récentes, son worktree doit partir d'une base qui les contient.

**Dernière tâche d'un worktree** (`last_task`, dans `/api/state`) : identifiant de la tâche la plus récente, dans l'ordre : run du lanceur le plus récent dans ce dossier ; sinon ligne du plan portant ce worktree, la plus récemment mise à jour ; sinon identifiant lu au début du sujet du dernier commit s'il existe au plan ; sinon `null`.

**Modes de permission.** Acceptés : `acceptEdits` (défaut), `plan`, `manual`. Refusés par le serveur : `bypassPermissions`, `auto`, `dontAsk`. Avec `acceptEdits`, une commande shell qui n'est pas dans la liste d'autorisations demande la validation d'un humain dans le terminal de l'agent.

**Liste d'autorisations (`--agent-settings`).** But : moins de demandes de permission, sans nouveau risque.

- Source : `--agent-settings <fichier>` ; sans option, `agent-permissions.json` à côté du script s'il existe ; `none` désactive. Un chemin explicite invalide fait refuser le démarrage (code 2) ; le fichier par défaut absent ne fait rien.
- Format : objet JSON dont la seule clé est `permissions`, avec `allow` et `deny` (règles au format des réglages de Claude Code).
- Validation (`stt_agent_settings.py`) : fichier ordinaire (pas de lien symbolique), propriétaire = utilisateur courant, non inscriptible par d'autres, 64 Kio au plus ; 300 règles par liste, 300 caractères chacune, sans doublon. Une règle `allow` trop large est refusée : nom d'outil nu, `*`, `Outil(*)`, `Bash(python3 *)`, `Bash(python *)`, `Bash(sh *)`, `Bash(bash *)`, `Bash(rm*)`, `Bash(curl*)`, `Bash(git push*)`, ou toute règle qui reproduit un `deny` obligatoire.
- `deny` obligatoires, ajoutés quelle que soit la liste : `git push|reset|checkout|restore|stash|clean|rebase|merge|switch|tag|remote|config`, `gh`, `curl`, `wget`, `ssh`, `scp`, `sudo`, écriture dans `**/stt-agents/data/**` et `**/.claude/settings*.json`, lecture de `~/.ssh`, `~/.gnupg`, `~/.config/gh`.
- À chaque démarrage, le serveur écrit le fichier effectif `.claude/stt-runner/agent-settings.json` (droits 0600, écriture atomique) et le passe à `claude --settings`. Le fichier d'origine n'est jamais transmis ; modifier la liste exige de redémarrer le serveur. `GET /api/runner` n'expose que `caps.settings` (booléen).
- Limite : une commande composée (`cd … && …`, `;`, `|`) reste soumise à la validation de Claude Code (voir § 13).

### Pause, arrêt, budget

- **Pause / Reprendre** : SIGSTOP / SIGCONT du groupe (états `running` ou `waiting` vers `paused`).
- **Stopper** : SIGTERM (après SIGCONT si en pause), puis SIGKILL si le processus n'est pas sorti après 10 s. **Killer** : SIGKILL immédiat.
- **Annuler** : une tâche en file passe à `stopped`. **Relancer** (`enqueue`) : remet en file un run `stopped`, `killed` ou `failed`.
- **Budget** : la consommation d'un run est `input + output + cache_write` de ses jetons depuis son attribution à un emplacement (le cache de lecture est exclu). Au-delà de **2 × le budget** de la tâche, le run passe en `paused` (note « pause budget ») et la tâche passe `blocked` au Kanban. **Reprendre** lève la pause et ne la redéclenche pas pour ce lancement.
- **Arrêt automatique (`autoexit`)** : option d'une tâche (champ `autoexit` du plan et du corps de `POST /api/tasks` ; `submit` du client l'active par défaut). Après 45 s consécutives en `waiting`, sans outil en attente de résultat, le serveur écrit `/exit` dans le terminal ; si le processus n'est pas sorti 20 s plus tard, il l'arrête (SIGTERM, puis SIGKILL). Une sortie avec le code 0 donne `done`. Une question ou une demande de permission en attente empêche l'envoi de `/exit`. L'arrêt dur reste armé même si le transcript continue de bouger.
- **Arrêt du serveur** : les runs vivants lancés par ce serveur sont arrêtés (SIGTERM puis SIGKILL après 10 s) et deviennent `stopped` ; ils se relancent à la main. Un run encore vivant au démarrage suivant (PID et heure de départ identiques) est marqué `orphan`.

### Transitions écrites au Kanban

Le serveur met à jour la ligne de la tâche (`runState`, `runner`, `session`, `started`, `ended`, `ms`), et son statut quand la transition est permise : `todo` ou `blocked` vers `doing` au démarrage ; `doing` vers `review` à la fin (`done`) ; `doing` ou `todo` vers `blocked` si `failed`, `killed` ou pause budget (note datée). Le passage de `review` à `done` est fait par le CP.

## 6. L'équipe d'agents permanente (lot T4)

Contrat : `../docs/specs/lots/T4-contrat.md` (essai de `/clear` : `../docs/specs/lots/T4-spike.md`).

### Livré dans le code (commits du lot T4)

- **Emplacements par profil** (T4.2, `stt_runner.py`). Le lanceur ne compte plus des instances mais des emplacements nommés `<profil>-<n>` (`dev-1`, `archi-1`, `revue-2`…). Équipe par défaut : 1 CP, 1 ARCHI, 3 DEV, 2 REVUE. Bornes par profil : CP 0 à 1, ARCHI 0 à 2, DEV 0 à 5, REVUE 0 à 3 ; au plus 8 agents lancés en tout (le CP ne compte pas). Les valeurs sont des entiers, validées.
- **Le CP n'est jamais lancé** : son emplacement représente la session humaine. Le lanceur n'alimente que ARCHI, DEV et REVUE.
- **Files FIFO par profil**. Une tâche en file attend l'emplacement libre de son profil. Ordre : priorité (1 haute, 2 normale, 3 basse), puis ancienneté dans la classe ; la tête de file n'est jamais sautée. Limites : 50 tâches en file par profil, 150 au total (409 au-delà). Quand le plafond global est atteint, la tête la plus ancienne passe d'abord.
- **Alimentation automatique** : à chaque passage de l'ordonnanceur (toutes les secondes), `_dispatch` lance la tête de chaque file dans un emplacement libre, avec un processus neuf et une session neuve. Un emplacement se libère à la fin de son run.
- **États d'emplacement** : `idle`, `starting`, `busy`, `paused`, `orphan`, `draining`, `error`. `draining` : emplacement retiré de la configuration mais qui finit sa tâche (jamais tuée). Un emplacement `error` est ré-armé avec un délai (30 s puis 2 min) ; au-delà, un clic humain (« Réarmer ») est requis.
- **Configuration** : `.claude/stt-runner/team.json` (0600, écriture atomique), relu au démarrage (absent : défaut ; invalide : défaut et raison conservée). Chaque changement est journalisé dans `.claude/stt-runner/team.log`.
- **État persistant** : `.claude/stt-runner/state.json`, version 2 (runs et emplacements). Un fichier de version 1 est migré (l'instance DEV devient l'emplacement).
- **Comptabilité par tâche** (T4.4). Jetons et durée d'un run se comptent depuis son attribution à un emplacement (`t_assign`) ; les sessions d'une tâche reprise sont cumulées ; `GET /api/runner/<tâche>/report` agrège toutes les sessions ; la pause budget compare ce delta au budget.

Visible aujourd'hui côté HTTP : `GET /api/runner` donne les runs (champs `slot`, `attempts`, `rank`…) et `caps.profile` (l'équipe configurée). Il n'y a pas encore de route pour lire ni modifier l'équipe, ni de section « Équipe » dans la page.

### En cours : prévu et pas encore livré

> - **T4.3** — fin de tâche validée par le marqueur `FIN DE TÂCHE <id>` en dernière ligne du rapport, état `attention` (permission ou question en attente d'un humain), plantage suivi d'une reprise automatique puis `failed`, réarmement des emplacements en erreur, reprise en tête de file des tâches interrompues par un arrêt du serveur, mode `keep`. Le code est en cours d'écriture dans `stt_runner.py` et n'est pas commité ; l'arrêt par `autoexit` décrit au § 5 reste le comportement livré, et son sens change avec T4.3.
> - **T4.5** — routes de lecture et de configuration de l'équipe, déplacement dans les files, actions sur un emplacement, notifications d'équipe, clés Kanban `slot` et `attempts`, CP observé.
> - **T4.6** — section « Équipe » de l'onglet Agents et dialogue de configuration.
> - **T4.7** — client, rôles des agents et documentation (dont ce README).
> - **T4.8** — veille chaude (`/clear` puis injection de la tâche suivante dans un processus gardé), seulement si le mainteneur la retient ; l'essai T4.1 a montré qu'elle est faisable.
> - **T4.R** — revue et essai réel.

## 7. Le Kanban

- **Données** : `data/plan-status.js` et les prompts `data/prompts/<id>.md`, dans le **checkout principal** (jamais dans un worktree). Ni l'un ni l'autre n'est à éditer à la main : le serveur est le seul écrivain. Les agents ont l'écriture de `**/stt-agents/data/**` refusée.
- **Écriture** : une liste d'opérations, appliquée ligne à ligne, validée avec Node, puis remplacée atomiquement (tout ou rien) :

```bash
python3 demos/space-travel/stt-agents/stt_agents_server.py --kanban-apply ops.json --dry-run
python3 demos/space-travel/stt-agents/stt_agents_server.py --kanban-apply ops.json
python3 demos/space-travel/stt-agents/stt_client.py kanban-ops ops.json
curl -s http://127.0.0.1:8765/api/kanban
```

- **Opérations** (`{"ops": [...]}`) : `task` (`set`, `add` qui cumule `used` et `ms`, `unset`), `task_add`, `lot`, `decision`, `decision_set`, `journal`, `top` (`currentLot`, `updated`, `spec`), `history_snapshot`. `updated` est posé automatiquement et ne recule jamais.
- **Clés réservées au lanceur** : une opération venue de l'extérieur ne peut pas poser `runner`, `session`, `runState`, `started`, `ended` (ni `inst` avec `runner`).
- **Verrou** : toute modification de `plan-status.js` (serveur ou `--kanban-apply`) prend un verrou de fichier exclusif (`flock`, 10 s au plus) sur `.claude/stt-runner/plan.lock`, dossier privé du lanceur (0700) ; sans ce dossier, sur `.plan.lock` à côté du plan. Le dossier est refusé s'il est un lien symbolique, appartient à un autre utilisateur ou a des droits plus larges que 0700. Deux processus ne perdent donc pas de mise à jour. La création et l'édition d'une tâche et la mise en file sont sérialisées.
- **Création et édition de tâche** : `POST /api/tasks` écrit le prompt (`data/prompts/<id>.md`, 200 Kio au plus) puis la ligne `todo` ; l'identifiant est `<lot>.<n+1>` ; le budget vient de la taille (`cx`) et de l'échelle du plan. `POST /api/tasks/<id>/edit` ne modifie qu'une tâche « à faire » inconnue du lanceur.
- **Documents liés** : les chemins `docs`, `prompt`, `spec` des données sont relatifs à `demos/space-travel/` (constante `KANBAN_DOC_BASE`). Le serveur les sert sous `/kanban/doc/…` en cherchant dans l'ordre les racines de la constante `KANBAN_DOC_ROOTS` (relatives au checkout principal ; `""` = le checkout principal). Une racine de worktree permet d'afficher un document pas encore fusionné, avec un bandeau « version du worktree » ; **l'ordre compte** (le premier fichier trouvé gagne) et une racine se retire de la liste une fois sa branche fusionnée. Les fichiers HTML, JS et JSON sont servis en texte (jamais exécutés), les SVG en bac à sable ; `..`, `.git`, `node_modules`, `__pycache__` sont refusés, ainsi que tout chemin sous `.claude` sauf `.claude/agents/*.md` ; 25 Mio au plus.
- **Prompts** : une tâche créée par le formulaire a son prompt dans `data/prompts/`. Une tâche ajoutée à la main par le CP doit aussi y avoir son fichier pour pouvoir être lancée.

## 8. Notifications

Le serveur détecte les événements (`stt_notices.py`) et les expose dans `GET /api/state` (`notices`, `notice_seq`) ; la page les présente de trois façons : **toasts** en bas à droite (8 s), **notification du navigateur** (sur accord, par défaut seulement quand l'onglet n'est pas visible) et compteur dans le titre de l'onglet (`(2) STT · Agents en direct`).

Cinq catégories, réglables une à une dans la fenêtre **Alertes** : *Attend / validation* (un agent passe en « T'attend » ou « Validation ? »), *Agents* (rapport rendu, arrêté, erreur, silencieux, livré), *Kanban* (nouvelle tâche, à relire, terminée, bloquée), *Livraisons* (PR ouverte, mergée, fermée sans merge), *Lanceur* (agent lancé, en attente, terminé, en échec, arrêté, tué, orphelin, pause budget, arrêt automatique).

Gravités : `info`, `attention`, `error`, `success`. Chaque notice peut porter `agent` (`{id, role, model, label}`) et `task` (`{id, title, status}`, titre borné à 120 caractères), absents quand inconnus. Le toast affiche « rôle + modèle + libellé · Tâche T3.4 — titre », cliquable vers l'agent ou la tâche. Les réglages sont mémorisés dans le navigateur.

## 9. Référence de l'API HTTP

« Jeton » = en-tête `X-STT-Token` valide, plus `Host` local, plus `Origin` de la boucle locale (obligatoire, sauf `GET` de même origine avec `Sec-Fetch-Site: same-origin`, accepté pour les routes marquées *GET*), plus rejet de `Sec-Fetch-Site: cross-site`. Sans cela : 403. Les autres routes n'exigent que le contrôle de `Host`.

| Méthode | Route | Jeton | Corps | Réponse |
|---|---|---|---|---|
| GET | `/` | non | | `index.html` avec le jeton injecté |
| GET | `/api/state` | non | | instantané (sessions, agents, worktrees, GitHub, `runner`, `notices`) |
| GET | `/api/stream` | non | | flux SSE : événements `state` et `ping` (15 s) |
| GET | `/api/runner` | non | | `{enabled, caps: {profile, global, settings}, runs: [...]}` ; sans `--runner` : `{enabled: false, reason}` |
| GET | `/api/worktrees` | non | | `{worktrees: [{path, branch}], branches: [...]}` |
| GET | `/api/kanban` | non | | résumé : tâches, lots, journal |
| POST | `/api/kanban` | en-tête `X-STT-Kanban: 1` | `{ops: [...]}` ou liste, `dry_run` facultatif, 512 Kio au plus | résultat des opérations ; 400 si refusées |
| GET | `/kanban/` | non | | `kanban.html` (`/kanban` redirige) |
| GET | `/kanban/plan-status.js`, `/kanban/config.js` | non | | données du plan ; configuration des documents |
| GET | `/kanban/doc/<chemin>` | non | | document lié (voir § 7) |
| GET | `/api/tasks/<id>` | oui (GET) | | carte de la tâche : `id`, `lot`, `title`, `agent`, `model`, `status`, `cx`, `budget`, `used`, `ms`, `note`, `prompt`, `prompt_excerpt` (800 premiers caractères), `docs`, `worktree`, `base`, `deps` ; 404 si inconnue |
| POST | `/api/tasks` | oui | `{lot, title, agent, model, cx, prompt, prio?, perm?, worktree?, base?, docs?, autostart?, autoexit?}` | `{ok, id, budget, prompt}` ; 400, 409 |
| POST | `/api/tasks/<id>/edit` | oui | mêmes champs (sans `lot`, `autostart`) | `{ok, id, budget, prompt}` ; 409 si non modifiable |
| POST | `/api/runner/check` | oui | | `{ok: true}` (test du jeton) |
| POST | `/api/runner/<tâche>/enqueue` | oui | `{prio?}` | `{ok, state}` ; crée ou relance le run |
| POST | `/api/runner/<tâche>/pause`, `resume`, `stop`, `kill`, `cancel` | oui | | `{ok, state}` ; 409 si la transition est interdite |
| POST | `/api/runner/<tâche>/input` | oui | `{data: texte}`, 64 Kio au plus | `{ok}` ; envoie au terminal |
| POST | `/api/runner/<tâche>/resize` | oui | `{cols, rows}` | `{ok}` |
| GET | `/api/runner/<tâche>/tty?since=N` | oui (GET) | | flux SSE du terminal : `out` (`{seq, b64}`), `state`, `ping` ; 4 flux simultanés au plus par tâche (429) |
| GET | `/api/runner/<tâche>/report` | oui | | rapport : `state`, `exit`, `session`, `final_text`, `usage`, `duration_ms`, `tool_calls`, `files_modified` (≤ 100), `sessions` |

Codes d'erreur du lanceur : 409 si le lanceur est inactif ou la transition interdite, 404 si la tâche est inconnue, 400 si une valeur est invalide, 413 si le corps est trop gros.

## 10. Client en ligne de commande

`stt_client.py` (stdlib) pilote le serveur comme le fait le CP. Il lit le jeton dans la page d'accueil et l'envoie avec `Origin`. Sortie : JSON sur la sortie standard (`--pretty` pour l'indenter), erreurs sur la sortie d'erreur. `--url` (défaut : variable `STT_AGENTS_URL`, sinon `http://127.0.0.1:8765`) n'accepte que la boucle locale.

| Commande | Effet |
|---|---|
| `submit --lot L --title T --agent dev --model sonnet --cx S --prompt-file p.md` | crée la tâche (`POST /api/tasks`) et la met en file |
| `list` | liste compacte des runs |
| `status <tâche>` | une ligne détaillée du run |
| `report <tâche> [--kanban]` | rapport du run ; `--kanban` ajoute `kanban_add` (`used`, `ms`) à reporter au Kanban |
| `wait <tâche> [--timeout S] [--interval S] [--until ÉTATS]` | attend un état final (défaut `done,failed,stopped,killed`, 3600 s) ; survit à un redémarrage du serveur |
| `pause`, `resume`, `stop`, `kill`, `cancel`, `enqueue` `<tâche>` | action sur le run |
| `input <tâche> --text T` | envoie du texte au terminal (`\n`, `\r`, `\t` interprétés) |
| `exit <tâche>` | envoie `/exit` |
| `kanban-ops FICHIER.json [--dry-run]` | applique des opérations au Kanban (1 Mio au plus) |

Options de `submit` : `--lot`, `--title`, `--agent` (`dev`, `archi`, `revue`), `--model` (`opus`, `sonnet`, `haiku`) et `--cx` (`XS` à `XL`) obligatoires ; `--prompt` ou `--prompt-file` (exactement un, 200 Ki caractères au plus) ; `--prio` (1 à 3, défaut 2), `--worktree`, `--base`, `--perm` (défaut `acceptEdits`), `--docs fichier:lu|modifié|créé …`, `--no-autostart` (crée sans lancer), `--no-autoexit` (n'envoie pas `/exit` en fin de tâche).

Codes de sortie : 0 succès ; 1 échec de l'opération (erreur HTTP, état final différent de `done` pour `wait`) ; 2 erreur d'usage ; 3 serveur injoignable, jeton introuvable, redirection ou réponse coupée ; 4 délai dépassé (`wait`).

Exemple complet :

```bash
python3 demos/space-travel/stt-agents/stt_client.py submit --lot T9 --title "Exemple" --agent dev --model sonnet --cx XS --prompt "Faire X"
python3 demos/space-travel/stt-agents/stt_client.py wait T9.1 --timeout 1800
python3 demos/space-travel/stt-agents/stt_client.py report T9.1 --kanban
```

## 11. Sécurité

- **Jeton** : généré à chaque démarrage, gardé en mémoire, affiché une fois à la console, injecté dans les pages HTML servies ; comparé en temps constant. Jamais dans une URL, ni dans la sortie du client.
- **Contrôles des routes de pilotage** (`check_control`) : jeton, `Host` local, `Origin` de la boucle locale obligatoire (pour un `GET` de même origine sans `Origin`, `Sec-Fetch-Site: same-origin`), `Sec-Fetch-Site: cross-site` refusé.
- **`Host`** : toute requête dont l'en-tête `Host` n'est pas local est refusée (protection contre le DNS rebinding), sauf si `--host` sort de la boucle locale.
- **Pas de CORS** : un site tiers ne peut pas lire `/api/state`. L'écriture du Kanban exige `X-STT-Kanban: 1`, ce qui force une requête préalable que le serveur ne satisfait pas.
- **CSP** des pages HTML : `frame-ancestors 'self'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`, `connect-src 'self' https://api.github.com` ; `Referrer-Policy: no-referrer`.
- **Documents** : voir § 7 ; aucun chemin absolu dans les réponses du rapport hors worktree.
- **Agents** : modes `bypassPermissions`, `auto`, `dontAsk` refusés ; liste d'autorisations validée et `deny` obligatoires (§ 5) ; l'environnement transmis aux agents omet `CLAUDECODE`, `CLAUDE_CODE_*`, `CLAUDE_PID`, `CLAUDE_JOB_DIR`, `CLAUDE_EFFORT` ; dossier `.claude/stt-runner/` en 0700, fichiers d'état et journaux en 0600.
- **Client** : sans proxy, sans redirection suivie, hôtes bouclés seulement.
- **Ce que l'outil ne fait pas** : il ne protège pas d'un autre compte local sur la même machine (il lit le jeton dans `GET /`) ; il ne chiffre rien (HTTP clair) ; il ne vérifie pas ce que fait un agent dans son worktree au-delà de la liste d'autorisations et des modes refusés ; il ne commite, ne fusionne ni ne pousse ; il ne lance pas la session du CP ; il ne pilote pas les sous-agents de l'outil Agent ; il n'a pas d'accès distant.

## 12. Tests

Stdlib `unittest`, sans `claude` réel (garde dans `tests/helpers.py` : la commande ne peut pas être `claude`) ; un faux agent (`tests/fake_agent.py`) imite la commande, écrit un transcript minimal et obéit à des consignes dans son prompt (`EXIT`, `SLEEP`, `TOKENS`, `QUESTION`, `PERM`…, voir l'en-tête du fichier).

```bash
python3 -m unittest discover -s demos/space-travel/stt-agents/tests -t demos/space-travel/stt-agents
python3 -m unittest discover -s demos/space-travel/stt-agents/tests -p test_readme.py -t demos/space-travel/stt-agents
```

- Les tests `tests/test_ui_*.py`, `tests/test_last_task.py` et `tests/test_phase_states.py` pilotent un navigateur avec Playwright ; sans Playwright, ils sont ignorés.
- Les tests qui lancent un serveur, un pty et des processus (runner, équipe, rapport, sécurité) sont sensibles à la charge de la machine : les relancer seuls avant de conclure à une régression. La durée totale n'a pas été mesurée pour ce document.
- Les modules `tests/test_client.py`, `tests/test_security.py`, `tests/test_agent_settings.py` et `tests/test_team.py` couvrent respectivement le client, la sécurité, la liste d'autorisations et l'équipe.
- Le test du README (`tests/test_readme.py`) vérifie que les options, les routes de l'API et les fichiers cités en code ou en tableau existent, et que toute option du serveur ou du client est documentée.

## 13. Dépannage

- **403 après un redémarrage du serveur** : le jeton a changé. Recharger la page (F5) ; le client en ligne de commande le relit tout seul.
- **Le terminal ne se connecte pas** : le lanceur est-il actif (bandeau « lanceur désactivé : démarrer le serveur avec --runner ») ? la tâche est-elle `orphan` (pas de terminal, seul `kill` est permis) ? déjà 4 terminaux ouverts sur la tâche (429) ? Hors réseau, xterm.js ne se charge pas et le terminal passe en repli `<pre>`.
- **Un agent est bloqué sur une demande de permission** : ouvrir son terminal (double-clic sur sa carte) et répondre. La commande demandée n'est pas dans la liste d'autorisations. Pour la rendre automatique, l'ajouter à `allow` dans `agent-permissions.json` puis redémarrer le serveur (une règle trop large est refusée).
- **Commandes avec `cd`, `&&`, `;` ou `|`** : Claude Code valide chaque sous-commande ; une commande composée n'est pas couverte par les règles d'une commande simple et demande une validation humaine. Faire lancer aux agents des commandes simples avec des chemins relatifs.
- **Session reprise à l'invite** : après un arrêt, une relance (`enqueue`) reprend la session avec `--resume` ; `claude` attend alors à l'invite sans refaire la tâche. Écrire la consigne dans le terminal, ou refaire la tâche par une nouvelle tâche.
- **Port occupé** : le serveur ne démarre pas ; relancer avec `--port` et un autre numéro (ou arrêter l'autre instance).
- **« Aucun dossier ne commence par … »** : les agents ont été lancés depuis un autre chemin que `--repo` ; relancer avec `--repo` sur le bon clone ou `--match`.
- **Rien côté GitHub** : vérifier le remote `origin`, ou `--github owner/dépôt` ; un quota épuisé fait attendre le serveur.
- **Kanban illisible** : `node` doit être installé (lecture et validation du plan) ; `GET /api/kanban` renvoie l'erreur.
- **Page vide hors serveur** : en fichier local ou sur GitHub Pages, seule la vue GitHub existe (§ 4).

## 14. Organisation des fichiers et des branches

Dans `demos/space-travel/stt-agents/` :

| Fichier | Rôle |
|---|---|
| `stt_agents_server.py` | serveur : collecte, API, Kanban, lanceur (colle), notifications |
| `stt_runner.py` | cœur du lanceur : états, emplacements, files, pty, signaux, persistance |
| `stt_agent_settings.py` | validation de la liste d'autorisations et fichier effectif |
| `stt_notices.py` | détection des événements et tampon de notifications |
| `stt_client.py` | client en ligne de commande |
| `index.html` | tableau de bord (vue complète servie ; vue GitHub ouverte seule) |
| `kanban.html` | Kanban (page fixe, aussi intégrée au tableau de bord) |
| `agent-permissions.json` | liste d'autorisations des agents (défaut de `--agent-settings`) |
| `tests/` | tests `unittest`, faux agent, aides |
| `data/` | `plan-status.js` et `prompts/` : checkout principal seulement, écrits par le serveur |

État d'exécution (hors dépôt, ignoré par git), dans le checkout principal : `.claude/stt-runner/` : `.claude/stt-runner/state.json`, `.claude/stt-runner/team.json`, `team.log`, `plan.lock`, `.claude/stt-runner/agent-settings.json` et un `.log` par tâche.

**Branches et worktrees.** Chaque lot a son worktree `.claude/worktrees/stt-<lot>` sur la branche `worktree-stt-<lot>` ; le travail de l'outil lui-même se fait dans le worktree `stt-agents` (branche `worktree-stt-agents`). Les agents DEV ne touchent ni `data/` ni `kanban.html` : ils commitent dans leur worktree et le CP intègre. Le checkout principal (branche `main`) porte `data/` et c'est lui que le serveur lit et écrit pour le Kanban ; une copie de l'outil dans un worktree sert à le développer, pas à tenir le plan. Ne jamais éditer à la main les fichiers de `data/` ni `.claude/stt-runner/`.
