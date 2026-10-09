#!/usr/bin/env python3
"""
stt_runner.py - coeur du lanceur d'agents stt-agents (contrat T1, sections 1-3).

Module autonome (stdlib seule, Linux/macOS, sans HTTP, sans effet de bord a
l'import). Une classe `Runner` pilote des `Run` : processus lances sous pty dans
leur propre groupe, machine a etats, pool/file par profil, signaux, budget,
persistance atomique (state.json) et detection des orphelins au redemarrage.

Machine a etats (contrat § 2) :
  queued -> starting -> running <-> waiting ; running|waiting <-> paused
  running|waiting|paused -> stopping -> stopped ; vivant -> killed
  running|waiting -> done | failed ; starting -> failed
  queued -> stopped (cancel) ; stopped|killed|failed -> queued (relance, --resume)
  orphan (apres redemarrage) : seul `kill` permis.
"""

import base64  # noqa: F401  (utile aux appelants : flux SSE b64)
import fcntl
import json
import os
import re
import select
import shutil
import signal
import struct
import subprocess
import sys
import termios
import threading
import time
import uuid

# --------------------------------------------------------------------------
# Constantes (surchargeables par l'appelant via le constructeur)
# --------------------------------------------------------------------------

# `--add-dir {prompts_dir}` autorise l'agent a lire SON fichier de prompt (checkout principal, hors de son
# worktree) sans validation manuelle ; il vient AVANT --permission-mode car l'option est variadique et
# avalerait sinon le prompt positionnel, qui doit rester le DERNIER argument. Jamais le checkout entier.
RUNNER_COMMAND = [
    "claude", "--agent", "stt-{agent}", "--model", "{model}",
    "--session-id", "{session}", "--add-dir", "{prompts_dir}", "--permission-mode", "{perm}",
    "-n", "{task}", "{prompt}",
]


def default_command(with_settings=False):
    """Commande par defaut ; `--settings {settings}` (fichier effectif des autorisations, T3.8) s'insere
    avant `-n`, donc le prompt reste le dernier argument."""
    cmd = list(RUNNER_COMMAND)
    if with_settings:
        cmd[cmd.index("-n"):cmd.index("-n")] = ["--settings", "{settings}"]
    return cmd


PROFILE_CAP = {"dev": 3, "archi": 1, "revue": 2, "cp": 0}   # repli herite (T4.3/T4.5 le retirent)
GLOBAL_CAP = 4                                              # repli herite
PROFILES = ("cp", "archi", "dev", "revue")
DEFAULT_TEAM = {"cp": 1, "archi": 1, "dev": 3, "revue": 2}
TEAM_BOUNDS = {"cp": (0, 1), "archi": (0, 2), "dev": (0, 5), "revue": (0, 3)}
TEAM_MAX = 8                 # somme des emplacements lances (CP exclu)
QUEUE_MAX_PROFILE = 50
QUEUE_MAX_TOTAL = 150
STATE_VERSION = 2
START_TIMEOUT_S = 60
STOP_GRACE_S = 10
BUDGET_PAUSE_FACTOR = 2.0
WAITING_SILENCE_S = 20
AUTOEXIT_GRACE_S = 45        # waiting continu avant d'ecrire /exit (runs autoexit)
AUTOEXIT_KILL_AFTER_S = 20   # delai apres /exit avant stop() si le processus n'est pas sorti
OUT_BUFFER_MAX = 256 * 1024
LOG_MAX = 5 * 1024 * 1024
INPUT_MAX = 64 * 1024
DEV_INSTANCES = (1, 2, 3)
ALLOWED_PERMS = ("acceptEdits", "plan", "manual")
FORBIDDEN_PERMS = ("bypassPermissions", "auto", "dontAsk")
WORKTREE_PREFIX = ".claude/worktrees/"
DEFAULT_PROMPT = ("Exécute la tâche {task} : lis "
                  "demos/space-travel/stt-agents/data/prompts/{task}.md")

LIVE_STATES = ("starting", "running", "waiting", "paused", "stopping", "orphan")
SLOT_STATES = LIVE_STATES  # un orphelin ou un arret en cours tient aussi sa place
RELAUNCHABLE = ("stopped", "killed", "failed")

TRANSITIONS = {
    "queued": {"starting", "stopped"},
    "starting": {"running", "failed", "done", "killed", "stopping"},
    "running": {"waiting", "paused", "stopping", "killed", "done", "failed"},
    "waiting": {"running", "paused", "stopping", "killed", "done", "failed"},
    "paused": {"running", "stopping", "killed", "failed"},
    "stopping": {"stopped", "killed"},
    "orphan": {"killed", "stopped"},
    "stopped": {"queued"},
    "killed": {"queued"},
    "failed": {"queued"},
    "done": set(),
}

_TASK_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
_MODEL_RE = re.compile(r"^[a-z0-9][a-z0-9.-]{0,63}$")
_WT_RE = re.compile(r"^[A-Za-z0-9._/-]+$")


class RunnerError(Exception):
    """Erreur generique du lanceur."""


class TransitionError(RunnerError):
    """Transition ou action interdite dans l'etat courant."""


class QueueFullError(TransitionError):
    """File pleine (50 par profil, 150 au total) : 409 cote serveur."""


class ValidationError(RunnerError, ValueError):
    """Parametre refuse (profil, modele, permission, worktree, saisie...)."""


# --------------------------------------------------------------------------
# Utilitaires
# --------------------------------------------------------------------------

# Variables du `claude` parent qui ne doivent pas atteindre les agents (jeton de
# messagerie, identifiants de session...). CLAUDE_CONFIG_DIR et ANTHROPIC_* restent.
AGENT_ENV_DROP = {"CLAUDECODE", "CLAUDE_PID", "CLAUDE_JOB_DIR", "CLAUDE_EFFORT"}
AGENT_ENV_DROP_PREFIX = "CLAUDE_CODE_"

# Trampoline : donne a l'agent le pty comme terminal de controle (stdin = esclave,
# nouvelle session), puis exec (le pid ne change pas). Pas de preexec_fn (fils).
CTTY_TRAMPOLINE = [sys.executable, "-c",
                   "import os,sys,fcntl,termios;fcntl.ioctl(0,termios.TIOCSCTTY,0);"
                   "os.execvp(sys.argv[1],sys.argv[1:])"]


def agent_environment(environ):
    """Copie de l'environnement sans les variables de session du claude parent."""
    return {k: v for k, v in environ.items()
            if k not in AGENT_ENV_DROP and not k.startswith(AGENT_ENV_DROP_PREFIX)}


def ensure_private_dir(path):
    """Cree le dossier en 0o700 (et resserre ses droits s'il existe deja)."""
    os.makedirs(path, mode=0o700, exist_ok=True)
    os.chmod(path, 0o700)


def private_fd(path, flags):
    """Ouvre `path` en 0o600 (droits resserres si le fichier existait)."""
    fd = os.open(path, flags, 0o600)
    try:
        os.fchmod(fd, 0o600)
    except OSError:
        pass
    return fd


def process_start_tag(pid):
    """Identifiant de l'heure de depart d'un processus, ou None s'il n'existe
    plus (ou est zombie). /proc/<pid>/stat (champ 22), sinon `ps -o lstart=`."""
    try:
        with open("/proc/%d/stat" % pid, "r") as f:
            s = f.read()
        rest = s[s.rindex(")") + 2:].split()
        if rest[0] == "Z":
            return None
        return "proc:" + rest[19]
    except (OSError, ValueError, IndexError):
        pass
    try:
        out = subprocess.run(["ps", "-o", "lstart=", "-p", str(int(pid))],
                             capture_output=True, text=True, timeout=5)
        tag = out.stdout.strip()
        return ("ps:" + tag) if out.returncode == 0 and tag else None
    except (OSError, subprocess.SubprocessError, ValueError):
        return None


_BASE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]*$")


def validate_base(base):
    """Nom de branche locale servant de point de depart (format seulement)."""
    if not isinstance(base, str) or not _BASE_RE.match(base) or ".." in base or len(base) > 200 \
            or base.endswith(("/", ".lock")) or "//" in base:
        raise ValidationError("base invalide: %r" % (base,))
    return base


def branch_exists(root, name):
    """Vrai si la branche LOCALE `name` existe (git, sans shell)."""
    try:
        return subprocess.run(["git", "-C", root, "rev-parse", "--verify", "--quiet",
                               "refs/heads/" + name], capture_output=True, timeout=10).returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def ensure_worktree(root, rel, lot, base=None):
    """Cree le worktree `rel` (relatif a `root`) s'il manque, avec la branche
    `worktree-stt-<lot>` creee depuis `base` (branche locale, defaut `main`).
    Si le worktree ou la branche existe deja, `base` est ignoree.
    Retourne le chemin absolu."""
    rel = validate_worktree(rel)
    if base:
        base = validate_base(base)
    path = os.path.join(root, rel)
    if os.path.isdir(path):
        return path
    if not re.match(r"^[A-Za-z0-9][A-Za-z0-9._-]*$", str(lot or "")):
        raise ValidationError("lot invalide: %r" % (lot,))
    branch = "worktree-stt-%s" % lot
    os.makedirs(os.path.dirname(path), exist_ok=True)
    exists = subprocess.run(
        ["git", "-C", root, "show-ref", "--verify", "--quiet",
         "refs/heads/" + branch]).returncode == 0
    if exists:
        cmd = ["git", "-C", root, "worktree", "add", path, branch]
    else:
        cmd = ["git", "-C", root, "worktree", "add", "-b", branch, path, base or "main"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RunnerError("git worktree add a echoue: %s" % r.stderr.strip())
    return path


def validate_worktree(rel):
    if not isinstance(rel, str) or not rel.startswith(WORKTREE_PREFIX):
        raise ValidationError("worktree doit commencer par %s" % WORKTREE_PREFIX)
    parts = rel.split("/")
    if ".." in parts or "" in parts[:-1] or not _WT_RE.match(rel):
        raise ValidationError("worktree invalide: %r" % rel)
    rel = rel.rstrip("/")
    if len(rel) <= len(WORKTREE_PREFIX):
        raise ValidationError("worktree invalide: %r" % rel)
    return rel


def validate_prompts_dir(path):
    """Dossier des prompts autorise a l'agent (--add-dir) : absolu, existant, sans caractere de
    controle, ne commence pas par « - ». Retourne le chemin ou leve ValidationError."""
    if (not isinstance(path, str) or not path or not os.path.isabs(path) or path.startswith("-")
            or any(ord(c) < 32 or ord(c) == 127 for c in path)):
        raise ValidationError("prompts_dir invalide: %r" % (path,))
    if not os.path.isdir(path):
        raise ValidationError("prompts_dir inexistant: %s" % path)
    return path


def substitute_command(template, values, resume=False):
    """Substitue {agent} {model} {session} {perm} {task} {prompt} {prompts_dir} {settings} dans argv.
    Reprise : `--session-id` devient `--resume` et {prompt} est retire."""
    out = []
    for el in template:
        if resume and el == "--session-id":
            out.append("--resume")
            continue
        if resume and "{prompt}" in el:
            continue
        for k, v in values.items():
            el = el.replace("{" + k + "}", v)
        out.append(el)
    return out


# --------------------------------------------------------------------------
# Run
# --------------------------------------------------------------------------

class Run:
    PERSISTED = ("task", "agent", "model", "perm", "prio", "session", "worktree",
                 "lot", "state", "pid", "pgid", "proc_start", "inst", "enqueued",
                 "started", "ended", "exit", "note", "budget", "prompt",
                 "resumed", "paused_s", "paused_at", "budget_ack", "order", "base", "autoexit",
                 "slot", "attempts", "t_assign", "sessions", "interrupted", "keep")

    def __init__(self, task, agent, model, perm, prio, session, worktree, lot):
        self.task = task
        self.agent = agent
        self.model = model
        self.perm = perm
        self.prio = prio
        self.session = session
        self.worktree = worktree
        self.lot = lot
        self.state = "queued"
        self.pid = None
        self.pgid = None
        self.proc_start = None
        self.inst = None
        self.enqueued = None
        self.started = None
        self.ended = None
        self.exit = None
        self.note = None
        self.budget = None
        self.prompt = None
        self.resumed = False       # deja lance une fois => reprise par --resume
        self.paused_s = 0.0
        self.paused_at = None
        self.budget_ack = False
        self.order = 0
        self.base = None           # branche de depart du worktree (si a creer)
        self.autoexit = False      # /exit automatique apres le rapport (fin de tour)
        self.slot = None           # emplacement d'equipe porteur (ex. "dev-2")
        self.attempts = 0
        self.t_assign = None       # instant de la derniere attribution a un emplacement
        self.sessions = []         # reserve T4.3/T4.4
        self.interrupted = False   # reserve T4.3
        self.keep = False          # reserve T4.3
        self.tokens = None
        # non persistes
        self.exit_sent = None      # instant d'ecriture de /exit (une fois par fin de tour)
        self.master = None
        self.proc = None
        self.reader = None
        self.waiter = None
        self.reader_stop = False
        self.buf = bytearray()
        self.buf_start = 0
        self.last_output = None
        self.waiting_since = None
        self.stop_deadline = None
        self.log_fh = None
        self.log_path = None
        self.log_size = 0

    @property
    def total(self):
        return self.buf_start + len(self.buf)

    def to_dict(self):
        return {k: getattr(self, k) for k in self.PERSISTED}

    @classmethod
    def from_dict(cls, d):
        r = cls(d["task"], d["agent"], d["model"], d.get("perm", "acceptEdits"),
                d.get("prio", 2), d["session"], d["worktree"], d.get("lot"))
        for k in cls.PERSISTED:
            if k in d:
                setattr(r, k, d[k])
        return r

    def active_seconds(self, now):
        """Duree depuis le demarrage hors pauses."""
        if self.started is None:
            return 0.0
        end = self.ended if self.ended is not None else now
        paused = self.paused_s
        if self.paused_at is not None:
            paused += end - self.paused_at
        return max(0.0, end - self.started - paused)


# --------------------------------------------------------------------------
# Equipe : configuration et emplacements
# --------------------------------------------------------------------------

def validate_team(cfg, base=None):
    """Retourne une equipe complete {cp, archi, dev, revue} validee (entiers
    seulement, bornes par profil, somme hors CP <= TEAM_MAX). Les cles absentes
    viennent de `base` (ou du defaut). ValidationError sinon."""
    if not isinstance(cfg, dict):
        raise ValidationError("equipe invalide")
    out = dict(base or DEFAULT_TEAM)
    for k, v in cfg.items():
        if k not in TEAM_BOUNDS:
            raise ValidationError("profil inconnu: %r" % (k,))
        if isinstance(v, bool) or not isinstance(v, int):
            raise ValidationError("%s: entier attendu" % k)
        lo, hi = TEAM_BOUNDS[k]
        if not lo <= v <= hi:
            raise ValidationError("%s: %d hors bornes %d-%d" % (k, v, lo, hi))
        out[k] = v
    if sum(v for k, v in out.items() if k != "cp") > TEAM_MAX:
        raise ValidationError("plus de %d agents lances" % TEAM_MAX)
    return out


def parse_team(text):
    """`cp=1,archi=1,dev=3,revue=2` -> equipe validee (option --team)."""
    cfg = {}
    for part in str(text).split(","):
        k, sep, v = part.strip().partition("=")
        if not sep:
            raise ValidationError("equipe: %r attendu sous la forme profil=n" % part)
        try:
            cfg[k.strip()] = int(v)
        except ValueError:
            raise ValidationError("equipe: entier attendu pour %s" % k)
    return validate_team(cfg)


class Slot:
    """Emplacement d'equipe persistant. L'etat `draining` (retire de la
    configuration, finit sa tache) masque l'etat derive de la tache."""
    def __init__(self, profile, n, now):
        self.profile = profile
        self.n = n
        self.id = "%s-%d" % (profile, n)
        self.state = "idle"
        self.task = None
        self.since = now
        self.errors = 0
        self.done_count = 0
        self.draining = False

    def to_dict(self, run=None):
        d = {"id": self.id, "profile": self.profile, "n": self.n, "state": self.state,
             "task": self.task, "since": self.since, "errors": self.errors,
             "done_count": self.done_count}
        if run is not None:
            d["pid"], d["pgid"], d["proc_start"] = run.pid, run.pgid, run.proc_start
        return d


_SLOT_OF_RUN = {"starting": "starting", "running": "busy", "waiting": "busy",
                "stopping": "busy", "paused": "paused", "orphan": "orphan",
                "queued": "starting"}


# --------------------------------------------------------------------------
# Runner
# --------------------------------------------------------------------------

class Runner:
    def __init__(self, state_dir, root, command=None, profile_cap=None,
                 global_cap=None, start_timeout_s=None, stop_grace_s=None,
                 budget_pause_factor=None, on_change=None, tokens_of=None,
                 turn_ended_of=None, now=None, env=None,
                 worktree_factory=None, waiting_silence_s=None, prompts_dir=None,
                 autoexit_grace_s=None, autoexit_kill_after_s=None,
                 tool_pending_of=None, on_autoexit=None, settings_path=None,
                 team=None):
        self.settings_path = settings_path   # fichier effectif des autorisations ({settings}), jamais expose
        self.state_dir = state_dir
        self.root = root
        self.command = list(command or RUNNER_COMMAND)
        # `profile_cap`/`global_cap` : repli herite ; `team` (ou team.json) fait foi
        self.global_cap = TEAM_MAX if global_cap is None else min(global_cap, TEAM_MAX)
        self.start_timeout_s = (START_TIMEOUT_S if start_timeout_s is None
                                else start_timeout_s)
        self.stop_grace_s = STOP_GRACE_S if stop_grace_s is None else stop_grace_s
        self.budget_pause_factor = (BUDGET_PAUSE_FACTOR if budget_pause_factor is None
                                    else budget_pause_factor)
        self.waiting_silence_s = (WAITING_SILENCE_S if waiting_silence_s is None
                                  else waiting_silence_s)
        self.autoexit_grace_s = (AUTOEXIT_GRACE_S if autoexit_grace_s is None
                                 else autoexit_grace_s)
        self.autoexit_kill_after_s = (AUTOEXIT_KILL_AFTER_S if autoexit_kill_after_s is None
                                      else autoexit_kill_after_s)
        self.prompts_dir = prompts_dir
        self.tool_pending_of = tool_pending_of   # run -> bool : un tool_use attend son tool_result
        self.on_autoexit = on_autoexit
        self.on_change = on_change
        self.tokens_of = tokens_of
        self.turn_ended_of = turn_ended_of
        self.now = now or time.time
        self.env = dict(env or {})
        self.worktree_factory = worktree_factory or ensure_worktree
        self.runs = {}
        self._order = 0
        self._lock = threading.RLock()
        self.slots = []
        self.team_error = None
        if team is not None:
            self.team = validate_team(team, base={p: 0 for p in PROFILES})
        elif profile_cap is not None:
            self.team = validate_team(profile_cap, base={p: 0 for p in PROFILES})
        else:
            self.team = self._read_team_file()
        self._apply_team(self.team)
        self._thread = None
        self._thread_stop = threading.Event()

    # ---- persistance -----------------------------------------------------

    @property
    def state_path(self):
        return os.path.join(self.state_dir, "state.json")

    def _save(self):
        with self._lock:
            ensure_private_dir(self.state_dir)
            self._sync_slots()
            data = {"v": STATE_VERSION,
                    "runs": [r.to_dict() for r in self.runs.values()],
                    "slots": [s.to_dict(self.runs.get(s.task)) for s in self.slots]}
            tmp = self.state_path + ".tmp"
            with os.fdopen(private_fd(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC), "w") as f:
                json.dump(data, f, indent=1)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, self.state_path)

    def load_state(self):
        """Recharge state.json (a appeler une fois au demarrage). Un run vivant
        devient `orphan` si son PID existe avec la meme heure de depart, sinon
        `stopped`. Les `queued` restent en file."""
        with self._lock:
            try:
                with open(self.state_path) as f:
                    data = json.load(f)
            except (OSError, ValueError):
                return
            for d in data.get("runs", []):
                try:
                    r = Run.from_dict(d)
                except KeyError:
                    continue
                self.runs[r.task] = r
                self._order = max(self._order, r.order)
                if r.slot is None and r.agent == "dev" and r.inst:   # migration v1 : inst => slot
                    r.slot = "dev-%d" % r.inst
                if r.state in LIVE_STATES:
                    if r.pid and r.proc_start and process_start_tag(r.pid) == r.proc_start:
                        r.state = "orphan"
                        r.note = "orphelin apres redemarrage"
                        self._hold_slot(r)
                    else:
                        r.state = "stopped"
                        r.ended = r.ended or self.now()
                        if r.paused_at is not None:
                            r.paused_s += r.ended - r.paused_at
                            r.paused_at = None
                        r.note = "arrete (processus disparu au redemarrage)"
                        r.pid = None
            self._save()
            for r in self.runs.values():
                self._notify(r)

    # ---- equipe : configuration ------------------------------------------

    @property
    def team_path(self):
        return os.path.join(self.state_dir, "team.json")

    def _read_team_file(self):
        """team.json -> equipe ; absent ou invalide => defaut (sans exception,
        motif dans `team_error`)."""
        try:
            with open(self.team_path) as f:
                data = json.load(f)
            cfg = data["team"]
            if not isinstance(cfg, dict) or set(cfg) != set(PROFILES):
                raise ValidationError("team.json: les 4 profils sont requis")
            return validate_team(cfg, base={p: 0 for p in PROFILES})
        except FileNotFoundError:
            return dict(DEFAULT_TEAM)
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as e:
            self.team_error = "team.json invalide (%s) : equipe par defaut" % (e,)
            return dict(DEFAULT_TEAM)

    def _apply_team(self, team):
        """Aligne les emplacements sur `team`. Retourne les ids en `draining`."""
        with self._lock:
            now = self.now()
            have = {s.id: s for s in self.slots}
            for prof in PROFILES:
                for n in range(1, team[prof] + 1):
                    sid = "%s-%d" % (prof, n)
                    if sid not in have:
                        have[sid] = Slot(prof, n, now)
                    have[sid].draining = False
            draining = []
            for s in list(have.values()):
                if s.n > team[s.profile]:
                    if s.task is None:
                        del have[s.id]
                    else:
                        s.draining = True
                        s.state = "draining"
                        draining.append(s.id)
            order = {p: i for i, p in enumerate(PROFILES)}
            self.slots = sorted(have.values(), key=lambda s: (order[s.profile], s.n))
            return draining

    def set_team(self, cfg, by=None):
        """Valide (bornes, entiers) puis applique, ecrit team.json (0600,
        atomique) et journalise team.log. Aucune tache n'est tuee."""
        with self._lock:
            new = validate_team(cfg, base=self.team)
            old = dict(self.team)
            self.team = new
            draining = self._apply_team(new)
            self.team_error = None
            ensure_private_dir(self.state_dir)
            tmp = self.team_path + ".tmp"
            with os.fdopen(private_fd(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC), "w") as f:
                json.dump({"v": 1, "team": new, "warm": False,
                           "updated": self.now(), "by": by}, f, indent=1)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, self.team_path)
            line = json.dumps({"at": self.now(), "avant": old, "après": new, "by": by},
                              ensure_ascii=False)
            with os.fdopen(private_fd(os.path.join(self.state_dir, "team.log"),
                                      os.O_WRONLY | os.O_CREAT | os.O_APPEND), "a",
                           encoding="utf-8") as f:
                f.write(line + "\n")
            self._save()
            return {"config": dict(new), "draining": draining}

    # ---- equipe : emplacements -------------------------------------------

    def _hold_slot(self, run):
        """Un orphelin recharge reprend son emplacement (cree en draining s'il
        n'existe plus dans la configuration)."""
        sid = run.slot
        if sid is None:
            for s in self.slots:
                if s.profile == run.agent and s.task is None:
                    sid = s.id
                    break
        if sid is None:
            return
        slot = next((s for s in self.slots if s.id == sid), None)
        if slot is None:
            prof, _, n = sid.rpartition("-")
            if prof not in PROFILES or not n.isdigit():
                return
            slot = Slot(prof, int(n), self.now())
            slot.draining = True
            self.slots.append(slot)
        if slot.task is None or slot.task == run.task:
            slot.task = run.task
            run.slot = slot.id

    def _sync_slots(self):
        """Etat des emplacements derive de leur tache ; libere ceux dont la
        tache n'est plus vivante ; retire les `draining` vides."""
        now = self.now()
        keep = []
        for s in self.slots:
            run = self.runs.get(s.task) if s.task else None
            if run is not None and (run.state in SLOT_STATES or
                                    (run.state == "queued" and run.slot == s.id)):
                new = "draining" if s.draining else _SLOT_OF_RUN[run.state]
            else:
                if run is not None and run.state == "done":
                    s.done_count += 1
                s.task = None
                if s.draining:
                    continue                    # retire apres sa tache
                new = "idle"
            if new != s.state:
                s.state = new
                s.since = now
            keep.append(s)
        self.slots = keep

    def team_snapshot(self):
        """Emplacements et files par profil (sans sortie pty)."""
        with self._lock:
            self._sync_slots()
            queues = {}
            for prof in PROFILES:
                q = self._queue(prof)
                queues[prof] = [{"task": r.task, "prio": r.prio, "rank": i + 1,
                                 "attempts": r.attempts, "enqueued": r.enqueued}
                                for i, r in enumerate(q)]
            return {"config": dict(self.team),
                    "bounds": {k: list(v) for k, v in TEAM_BOUNDS.items()},
                    "max": TEAM_MAX,
                    "slots": [s.to_dict() for s in self.slots],
                    "queues": queues}

    def _queue(self, agent):
        """File d'un profil : (prio, order), prio 1 > 2 > 3, FIFO dans la classe."""
        return sorted((r for r in self.runs.values()
                       if r.state == "queued" and r.agent == agent),
                      key=lambda r: (r.prio, r.order))

    # ---- notification / transitions -------------------------------------

    def _notify(self, run):
        if self.on_change:
            try:
                self.on_change(run)
            except Exception as e:  # le crochet ne doit pas casser le lanceur
                print("stt_runner: on_change a echoue: %r" % (e,), file=sys.stderr)

    def _set_state(self, run, new, note=None):
        with self._lock:
            if new not in TRANSITIONS.get(run.state, ()):
                raise TransitionError("%s: %s -> %s interdit" % (run.task, run.state, new))
            old = run.state
            run.state = new
            if note is not None:
                run.note = note
            t = self.now()
            if new != "waiting":
                run.waiting_since = None
            if new == "paused":
                run.paused_at = t
            elif old == "paused" and run.paused_at is not None:
                run.paused_s += t - run.paused_at
                run.paused_at = None
            if new in ("done", "failed", "stopped", "killed"):
                if run.ended is None:
                    run.ended = t
                if run.paused_at is not None:
                    run.paused_s += t - run.paused_at
                    run.paused_at = None
            self._save()
            self._notify(run)

    def _get(self, task):
        r = self.runs.get(task)
        if r is None:
            raise KeyError(task)
        return r

    # ---- validation ------------------------------------------------------

    def _validate(self, task, agent, model, perm, prio, worktree, lot, prompt, base=None):
        if not isinstance(task, str) or not _TASK_RE.match(task) or ".." in task:
            raise ValidationError("tache invalide: %r" % (task,))
        if agent not in PROFILES:
            raise ValidationError("profil inconnu: %r" % (agent,))
        if not isinstance(model, str) or not _MODEL_RE.match(model):
            raise ValidationError("modele invalide: %r" % (model,))
        if perm in FORBIDDEN_PERMS:
            raise ValidationError("permission refusee: %s" % perm)
        if perm not in ALLOWED_PERMS:
            raise ValidationError("permission inconnue: %r" % (perm,))
        if prio not in (1, 2, 3) or isinstance(prio, bool):
            raise ValidationError("prio invalide: %r" % (prio,))
        if lot is not None and not re.match(r"^[A-Za-z0-9][A-Za-z0-9._-]*$", str(lot)):
            raise ValidationError("lot invalide: %r" % (lot,))
        if prompt is not None and (not isinstance(prompt, str) or prompt.startswith("-")
                                   or "\x00" in prompt or len(prompt) > 4000):
            raise ValidationError("prompt invalide")
        if base:
            validate_base(base)
        wt = validate_worktree(worktree)
        base = os.path.realpath(os.path.join(self.root, WORKTREE_PREFIX))
        real = os.path.realpath(os.path.join(self.root, wt))
        if os.path.commonpath([base, real]) != base or real == base:
            raise ValidationError("worktree hors de %s" % WORKTREE_PREFIX)
        return wt

    # ---- API : file ------------------------------------------------------

    def enqueue(self, task, agent="dev", model="sonnet", perm="acceptEdits",
                prio=None, worktree=None, lot=None, prompt=None, budget=None, base=None,
                autoexit=None):
        """Met en file un nouveau run, ou relance un run stopped|killed|failed
        (reprise par --resume, parametres d'origine conserves)."""
        with self._lock:
            old = self.runs.get(task)
            if old is not None:
                if old.state not in RELAUNCHABLE:
                    raise TransitionError("%s: enqueue interdit depuis %s"
                                          % (task, old.state))
                self._check_queue_room(old.agent)
                if prio is not None:
                    self._validate(task, old.agent, old.model, old.perm,
                                   prio, old.worktree, old.lot, None)
                    old.prio = prio
                self._order += 1
                old.order = self._order
                old.enqueued = self.now()
                old.ended = None
                old.exit = None
                old.pid = old.pgid = old.proc_start = None
                old.slot = None
                old.note = None
                if autoexit is not None:
                    old.autoexit = bool(autoexit)
                old.exit_sent = None
                old.budget_ack = False
                old.paused_s = 0.0      # le temps actif (ms Kanban) se mesure par lancement
                old.paused_at = None
                self._set_state(old, "queued")
                return old
            prio = 2 if prio is None else prio
            self._check_queue_room(agent)
            lot = lot or str(task).split(".")[0]
            wt = worktree or (WORKTREE_PREFIX + "stt-%s" % lot)
            wt = self._validate(task, agent, model, perm, prio, wt, lot, prompt, base)
            self._order += 1
            r = Run(task, agent, model, perm, prio, str(uuid.uuid4()), wt, lot)
            r.enqueued = self.now()
            r.order = self._order
            r.budget = budget
            r.prompt = prompt
            r.base = base or None
            r.autoexit = bool(autoexit)
            self.runs[task] = r
            self._save()
            self._notify(r)
            return r

    def _check_queue_room(self, agent):
        queued = [r for r in self.runs.values() if r.state == "queued"]
        if len(queued) >= QUEUE_MAX_TOTAL:
            raise QueueFullError("file pleine: %d taches en file" % QUEUE_MAX_TOTAL)
        if sum(1 for r in queued if r.agent == agent) >= QUEUE_MAX_PROFILE:
            raise QueueFullError("file %s pleine: %d taches" % (agent, QUEUE_MAX_PROFILE))

    def cancel(self, task):
        with self._lock:
            r = self._get(task)
            if r.state != "queued":
                raise TransitionError("%s: cancel interdit depuis %s" % (task, r.state))
            self._set_state(r, "stopped", note="annule")
            return r

    # ---- API : signaux ---------------------------------------------------

    def _killpg(self, run, sig):
        pg = run.pgid
        if not pg:
            return False
        try:
            os.killpg(pg, sig)
            return True
        except (ProcessLookupError, PermissionError):
            return False

    def pause(self, task):
        with self._lock:
            r = self._get(task)
            if r.state not in ("running", "waiting"):
                raise TransitionError("%s: pause interdite depuis %s" % (task, r.state))
            self._killpg(r, signal.SIGSTOP)
            self._set_state(r, "paused")
            return r

    def resume(self, task):
        with self._lock:
            r = self._get(task)
            if r.state != "paused":
                raise TransitionError("%s: resume interdit depuis %s" % (task, r.state))
            if r.note and "budget" in r.note:
                r.budget_ack = True
            self._killpg(r, signal.SIGCONT)
            r.last_output = self.now()
            self._set_state(r, "running")
            return r

    def stop(self, task):
        with self._lock:
            r = self._get(task)
            if r.state not in ("running", "waiting", "paused"):
                raise TransitionError("%s: stop interdit depuis %s" % (task, r.state))
            self._terminate(r)
            return r

    def _terminate(self, run):
        """SIGTERM sur le groupe (apres SIGCONT si pause), SIGKILL apres grace."""
        was_paused = run.state == "paused"
        if was_paused:
            self._killpg(run, signal.SIGCONT)
        self._killpg(run, signal.SIGTERM)
        run.stop_deadline = self.now() + self.stop_grace_s
        self._set_state(run, "stopping")

    def kill(self, task):
        with self._lock:
            r = self._get(task)
            if r.state not in LIVE_STATES:
                raise TransitionError("%s: kill interdit depuis %s" % (task, r.state))
            if r.state == "orphan":
                if r.pid and process_start_tag(r.pid) == r.proc_start:
                    self._killpg(r, signal.SIGKILL)
                    self._set_state(r, "killed")
                else:  # deja disparu (ou PID reutilise) : ne rien signaler
                    r.pid = None
                    self._set_state(r, "stopped", note="orphelin deja disparu")
                return r
            self._killpg(r, signal.SIGKILL)
            self._set_state(r, "killed")
            return r

    # ---- API : terminal --------------------------------------------------

    def input(self, task, data):
        if isinstance(data, str):
            data = data.encode("utf-8")
        if not isinstance(data, (bytes, bytearray)) or len(data) > INPUT_MAX:
            raise ValidationError("saisie invalide ou > %d octets" % INPUT_MAX)
        with self._lock:
            r = self._get(task)
            if r.state not in ("starting", "running", "waiting") or r.master is None:
                raise TransitionError("%s: saisie interdite depuis %s" % (task, r.state))
            fd = r.master
        view = memoryview(bytes(data))
        deadline = time.monotonic() + 5
        while view:
            try:
                n = os.write(fd, view)
                view = view[n:]
            except BlockingIOError:
                if time.monotonic() > deadline:
                    raise RunnerError("pty sature")
                select.select([], [fd], [], 0.1)
            except OSError as e:
                raise RunnerError("ecriture pty: %s" % e)

    def resize(self, task, cols, rows):
        try:
            cols, rows = int(cols), int(rows)
        except (TypeError, ValueError):
            raise ValidationError("cols/rows invalides")
        if not (1 <= cols <= 1000 and 1 <= rows <= 1000):
            raise ValidationError("cols/rows hors limites")
        with self._lock:
            r = self._get(task)
            if r.state not in ("starting", "running", "waiting", "paused") or r.master is None:
                raise TransitionError("%s: resize interdit depuis %s" % (task, r.state))
            fcntl.ioctl(r.master, termios.TIOCSWINSZ,
                        struct.pack("HHHH", rows, cols, 0, 0))
            self._killpg(r, signal.SIGWINCH)

    def read_output(self, task, since=0):
        """Rejoue le tampon circulaire depuis la sequence `since` (decalage en
        octets depuis le debut de la sortie). Retourne (seq, data) ou `seq` est
        la sequence du premier octet rendu (>= since si le tampon a tourne) ;
        la prochaine lecture commence a seq + len(data)."""
        with self._lock:
            r = self._get(task)
            since = max(int(since or 0), r.buf_start)
            return since, bytes(r.buf[since - r.buf_start:])

    # ---- API : lecture ---------------------------------------------------

    def snapshot(self):
        with self._lock:
            self._sync_slots()
            rank = {}
            for prof in PROFILES:
                for i, r in enumerate(self._queue(prof)):
                    rank[r.task] = i + 1
            runs = []
            for r in self.runs.values():
                runs.append({
                    "task": r.task, "agent": r.agent, "model": r.model,
                    "state": r.state, "session": r.session, "pid": r.pid,
                    "worktree": r.worktree, "inst": r.inst, "slot": r.slot, "prio": r.prio,
                    "perm": r.perm, "enqueued": r.enqueued, "started": r.started,
                    "ended": r.ended, "exit": r.exit, "tokens": r.tokens,
                    "note": r.note, "rank": rank.get(r.task), "autoexit": bool(r.autoexit),
                    "active_s": r.active_seconds(self.now()),
                    "controllable": r.state != "orphan",
                })
            return {"caps": {"profile": dict(self.team),
                             "global": self.global_cap,
                             "settings": bool(self.settings_path)},
                    "runs": runs}

    def get(self, task):
        with self._lock:
            return self._get(task)

    # ---- lancement -------------------------------------------------------

    def _dispatch(self):
        """Alimentation : pour chaque profil, tant qu'un emplacement est `idle`
        et qu'une tache est `queued`, la TETE de file (jamais de saut) part dans
        un nouveau processus. Entre profils, la tete (prio, order) la plus
        ancienne passe d'abord quand le plafond global est atteint. Le CP n'est
        jamais alimente (session humaine)."""
        self._sync_slots()
        while True:
            if sum(1 for s in self.slots if s.profile != "cp" and s.task) >= self.global_cap:
                return
            best = None
            for prof in PROFILES:
                if prof == "cp":
                    continue
                slot = next((s for s in self.slots if s.profile == prof
                             and s.task is None and not s.draining), None)
                q = self._queue(prof) if slot else None
                if q and (best is None or (q[0].prio, q[0].order) < (best[1].prio, best[1].order)):
                    best = (slot, q[0])
            if best is None:
                return
            slot, run = best
            slot.task = run.task
            run.slot = slot.id
            run.inst = slot.n if run.agent == "dev" else None
            run.t_assign = self.now()
            self._launch(run)
            self._sync_slots()

    def _launch(self, run):
        try:
            if getattr(run, "base", None):
                cwd = self.worktree_factory(self.root, run.worktree, run.lot, run.base)
            else:
                cwd = self.worktree_factory(self.root, run.worktree, run.lot)
            prompt = run.prompt or DEFAULT_PROMPT.format(task=run.task)
            values = {"agent": run.agent, "model": run.model, "session": run.session,
                      "perm": run.perm, "task": run.task, "prompt": prompt}
            if any("{prompts_dir}" in el for el in self.command):
                values["prompts_dir"] = validate_prompts_dir(self.prompts_dir)
            if any("{settings}" in el for el in self.command):
                if not self.settings_path or not os.path.isfile(self.settings_path):
                    raise ValidationError("{settings} sans fichier d'autorisations effectif")
                values["settings"] = self.settings_path
            argv = substitute_command(self.command, values,
                resume=run.resumed)
            env = agent_environment(os.environ)
            env.update(self.env)
            env.setdefault("TERM", "xterm-256color")
            exe = argv[0]
            if not shutil.which(exe, path=env.get("PATH")) if os.sep not in exe else not os.access(exe, os.X_OK):
                # le trampoline masquerait l'echec d'exec : on le detecte avant
                raise FileNotFoundError("commande introuvable: %s" % exe)
            master, slave = os.openpty()
            try:
                fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 24, 80, 0, 0))
                proc = subprocess.Popen(CTTY_TRAMPOLINE + argv, stdin=slave, stdout=slave, stderr=slave,
                                        cwd=cwd, env=env, start_new_session=True,
                                        close_fds=True)
            except BaseException:
                os.close(master)
                raise
            finally:
                os.close(slave)
        except Exception as e:
            run.started = self.now()
            run.exit = None
            run.ended = None
            run.note = "lancement impossible: %s" % e
            self._set_state(run, "starting")
            self._set_state(run, "failed")
            return
        fl = fcntl.fcntl(master, fcntl.F_GETFL)
        fcntl.fcntl(master, fcntl.F_SETFL, fl | os.O_NONBLOCK)
        run.master = master
        run.proc = proc
        run.pid = proc.pid
        run.pgid = proc.pid  # start_new_session => chef de son groupe
        run.proc_start = process_start_tag(proc.pid)
        run.started = self.now()
        run.ended = None
        run.exit = None
        run.note = None
        run.paused_at = None
        run.last_output = self.now()
        run.waiting_since = None
        run.exit_sent = None
        run.stop_deadline = None
        run.reader_stop = False
        run.budget_ack = False
        run.resumed = True
        ensure_private_dir(self.state_dir)
        run.log_path = os.path.join(self.state_dir, run.task + ".log")
        run.log_fh = os.fdopen(private_fd(run.log_path, os.O_WRONLY | os.O_CREAT | os.O_APPEND), "ab")
        run.log_size = run.log_fh.tell()
        self._set_state(run, "starting")
        run.reader = threading.Thread(target=self._read_loop, args=(run,),
                                      name="stt-pty-" + run.task, daemon=True)
        run.waiter = threading.Thread(target=self._wait_loop, args=(run,),
                                      name="stt-wait-" + run.task, daemon=True)
        run.reader.start()
        run.waiter.start()

    # ---- fils par run ----------------------------------------------------

    def _read_loop(self, run):
        fd = run.master
        while not run.reader_stop:
            try:
                ready, _, _ = select.select([fd], [], [], 0.2)
                if not ready:
                    continue
                data = os.read(fd, 65536)
            except BlockingIOError:
                continue
            except OSError:
                break
            if not data:
                break
            self._on_output(run, data)

    def _on_output(self, run, data):
        with self._lock:
            run.buf += data
            excess = len(run.buf) - OUT_BUFFER_MAX
            if excess > 0:
                del run.buf[:excess]
                run.buf_start += excess
            run.last_output = self.now()
            self._log(run, data)
            if run.state == "starting":
                self._set_state(run, "running")
            elif run.state == "waiting":
                self._set_state(run, "running")

    def _log(self, run, data):
        fh = run.log_fh
        if fh is None:
            return
        try:
            fh.write(data)
            fh.flush()
            run.log_size += len(data)
            if run.log_size > LOG_MAX:  # tronque par le debut (garde les 4/5 recents)
                keep = LOG_MAX * 4 // 5
                fh.close()
                with open(run.log_path, "rb") as f:
                    f.seek(-keep, os.SEEK_END)
                    tail = f.read()
                tmp = run.log_path + ".tmp"
                with os.fdopen(private_fd(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC), "wb") as f:
                    f.write(tail)
                os.replace(tmp, run.log_path)
                run.log_fh = os.fdopen(private_fd(run.log_path, os.O_WRONLY | os.O_CREAT | os.O_APPEND), "ab")
                run.log_size = len(tail)
        except OSError:
            pass

    def _wait_loop(self, run):
        code = run.proc.wait()
        if run.reader is not None:
            run.reader.join(2.0)  # laisse le lecteur vider le pty
        run.reader_stop = True
        if run.reader is not None:
            run.reader.join(1.0)
        # le groupe peut garder des enfants (node...) : on les elimine
        self._killpg(run, signal.SIGKILL)
        with self._lock:
            for attr in ("master",):
                fd = getattr(run, attr)
                if fd is not None:
                    try:
                        os.close(fd)
                    except OSError:
                        pass
                    setattr(run, attr, None)
            if run.log_fh is not None:
                try:
                    run.log_fh.close()
                except OSError:
                    pass
                run.log_fh = None
            run.exit = code
            run.ended = self.now()
            st = run.state
            if st == "stopping":
                self._set_state(run, "stopped")
            elif st == "killed":
                run.ended = run.ended or self.now()
                self._save()
                self._notify(run)
            elif st in ("starting", "running", "waiting"):
                self._set_state(run, "done" if code == 0 else "failed",
                                note=None if code == 0 else "code de sortie %s" % code)
            elif st == "paused":
                self._set_state(run, "failed", note="processus disparu en pause")
            else:
                self._save()

    # ---- ordonnanceur ----------------------------------------------------

    def tick(self):
        """Un passage d'ordonnanceur : delais, arret force, waiting, budget,
        orphelins, puis lancement des runs en file."""
        with self._lock:
            t = self.now()
            for r in list(self.runs.values()):
                st = r.state
                if st in ("starting",) and t - (r.started or t) > self.start_timeout_s:
                    self._killpg(r, signal.SIGKILL)
                    self._set_state(r, "failed", note="delai de demarrage depasse")
                elif st == "stopping" and r.stop_deadline is not None and t >= r.stop_deadline:
                    self._killpg(r, signal.SIGKILL)
                    r.stop_deadline = None
                elif st == "orphan":
                    if not (r.pid and process_start_tag(r.pid) == r.proc_start):
                        r.pid = None
                        self._set_state(r, "stopped", note="orphelin disparu")
                elif st in ("running", "waiting", "paused"):
                    if self.tokens_of:
                        try:
                            r.tokens = self.tokens_of(r)
                        except Exception:
                            pass
                    if (st in ("running", "waiting") and r.budget and r.tokens
                            and not r.budget_ack
                            and r.tokens > r.budget * self.budget_pause_factor):
                        self._killpg(r, signal.SIGSTOP)
                        self._set_state(r, "paused",
                                        note="pause budget: %s tokens > %s x %s" % (
                                            r.tokens, r.budget, self.budget_pause_factor))
                        continue
                    if self.turn_ended_of and st in ("running", "waiting"):
                        try:
                            ended = bool(self.turn_ended_of(r))
                        except Exception:
                            ended = False
                        silent = t - (r.last_output or t) >= self.waiting_silence_s
                        if st == "running" and ended and silent:
                            self._set_state(r, "waiting")
                            r.waiting_since = t
                        elif st == "waiting" and not ended:
                            self._set_state(r, "running")
                        # exit_sent n'est JAMAIS remis a None ici : si claude ecrit au transcript en traitant
                        # /exit sans sortir, l'arret dur (SIGTERM puis SIGKILL) doit rester arme.
                    if r.autoexit and r.state in ("running", "waiting"):
                        self._autoexit(r, t)
            self._dispatch()

    def _autoexit(self, r, t):
        """Fin de tour d'un run autoexit : /exit apres AUTOEXIT_GRACE_S de waiting continu (sans outil
        en attente de resultat), puis stop() si le processus ne sort pas dans AUTOEXIT_KILL_AFTER_S."""
        if r.exit_sent is not None:
            if t - r.exit_sent >= self.autoexit_kill_after_s:
                self._terminate(r)
            return
        if r.state != "waiting" or r.waiting_since is None:
            return
        if t - r.waiting_since < self.autoexit_grace_s or r.master is None:
            return
        if self.tool_pending_of:
            try:
                if self.tool_pending_of(r):
                    return          # question, permission ou outil en cours : on ne touche a rien
            except Exception:
                return
        try:
            os.write(r.master, b"/exit\r")
        except OSError:
            return
        r.exit_sent = t
        if self.on_autoexit:
            try:
                self.on_autoexit(r)
            except Exception as e:
                print("stt_runner: on_autoexit a echoue: %r" % (e,), file=sys.stderr)

    def start_thread(self):
        with self._lock:
            if self._thread and self._thread.is_alive():
                return
            self._thread_stop.clear()
            self._thread = threading.Thread(target=self._loop, name="stt-runner",
                                            daemon=True)
            self._thread.start()

    def _loop(self):
        while not self._thread_stop.wait(1.0):
            try:
                self.tick()
            except Exception as e:
                print("stt_runner: tick a echoue: %r" % (e,), file=sys.stderr)

    def stop_thread(self):
        self._thread_stop.set()
        th = self._thread
        if th and th is not threading.current_thread():
            th.join(5)
        self._thread = None

    # ---- arret global ----------------------------------------------------

    def shutdown(self):
        """Stop de tous les runs vivants lances par ce processus (reprenables).
        Les orphelins (non lances par nous) sont laisses tels quels."""
        self.stop_thread()
        with self._lock:
            mine = [r for r in self.runs.values()
                    if r.state in ("starting", "running", "waiting", "paused", "stopping")
                    and r.proc is not None]
            for r in mine:
                if r.state != "stopping":
                    if r.state == "starting":
                        self._killpg(r, signal.SIGTERM)
                        r.stop_deadline = self.now() + self.stop_grace_s
                        self._set_state(r, "stopping")
                    else:
                        self._terminate(r)
        deadline = time.monotonic() + self.stop_grace_s
        killed = False
        hard = deadline + 3
        while time.monotonic() < hard:
            if all(r.state not in ("stopping",) and (r.proc is None or r.proc.poll() is not None)
                   and r.master is None for r in mine):
                break
            if not killed and time.monotonic() >= deadline:
                with self._lock:
                    for r in mine:
                        if r.proc is not None and r.proc.poll() is None:
                            self._killpg(r, signal.SIGKILL)
                killed = True
            time.sleep(0.02)
        with self._lock:
            self._save()


if __name__ == "__main__":
    print("stt_runner est un module (importe par stt_agents_server.py).")
