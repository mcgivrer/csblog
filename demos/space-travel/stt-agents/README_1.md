# STT · agents en direct

Tableau de bord temps réel des agents Claude Code qui travaillent sur *Space Travel & Transport* (dépôt `csblog`) : qui est en action, qui **t'attend** (réponse ou validation), à quelle étape du flux PM → Architecte → Développeur il en est, ce qu'il fait à la seconde près, et ce qui a été livré sur GitHub.

Deux fichiers, aucune dépendance (Python 3.8+ standard, page HTML autonome) :

| Fichier | Rôle |
|---|---|
| `stt_agents_server.py` | Collecte (sessions Claude Code + git + GitHub) et sert la page sur `http://127.0.0.1:8765`, avec mises à jour poussées en direct (SSE, ~2 s). |
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
| `--match MOTIF` | Ajouter des dossiers de `~/.claude/projects` dont le nom contient `MOTIF` (si les agents ont été lancés depuis un autre chemin). |
| `--claude-dir CHEMIN` | Dossier de configuration Claude Code (défaut `~/.claude`, ou `CLAUDE_CONFIG_DIR`). |
| `--window 24` | Sessions prises en compte : actives dans les N dernières heures. |
| `--port 8765` / `--host` | Port et interface d'écoute (127.0.0.1 par défaut). |
| `--no-github` | Couper la source GitHub. |
| `--once` | Imprimer un instantané JSON et quitter (diagnostic). |

`GITHUB_TOKEN` (facultatif) dans l'environnement relève le quota GitHub de 60 à 5 000 requêtes/heure. Sans jeton, le serveur interroge GitHub toutes les 75 s avec des requêtes conditionnelles (ETag) : les réponses inchangées ne consomment pas de quota.

## Les trois modes de la page

| Mode | Quand | Ce qu'on voit |
|---|---|---|
| **LIVE** | page servie par `stt_agents_server.py` | Tout : sessions, agents (identifiant, état, arrêt), outil en cours, todo, rôle, attente, worktrees, GitHub. |
| **GITHUB** | `index.html` ouvert seul, ou publié sur GitHub Pages (`…/demos/space-travel/tools/agents-dashboard/`) | Branches, PR, push, déploiement Pages. Un agent n'apparaît qu'à ses push : pas d'activité entre deux push. |
| **DÉMO** | aucune source joignable, ou `?demo` dans l'URL | Données **fictives**, signalées par un bandeau rouge. Sert d'aperçu. |

Paramètres d'URL : `?repo=owner/nom` (autre dépôt GitHub), `?github=0` (pas d'appel GitHub), `?demo`.

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

## Dépannage

- **« Aucun dossier ne commence par … »** : les agents ont été lancés depuis un autre chemin que `--repo`. Le message liste les dossiers proches ; relancer avec `--repo` sur le bon clone ou `--match csblog`.
- **Rien côté GitHub** : vérifier le remote `origin` ou passer `--github mcgivrer/csblog` ; en cas de quota épuisé, le serveur attend la réinitialisation.
- Le format des transcripts Claude Code n'est pas une API publique : s'il évolue, la lecture se dégrade (champs vides) sans bloquer le tableau de bord. Diagnostic : `python stt_agents_server.py --once`.
