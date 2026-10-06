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

RUNNER_COMMAND = [
    "claude", "--agent", "stt-{agent}", "--model", "{model}",
    "--session-id", "{session}", "--permission-mode", "{perm}",
    "-n", "{task}", "{prompt}",
]
PROFILE_CAP = {"dev": 3, "archi": 1, "revue": 1, "cp": 0}
GLOBAL_CAP = 4
START_TIMEOUT_S = 60
STOP_GRACE_S = 10
BUDGET_PAUSE_FACTOR = 2.0
WAITING_SILENCE_S = 20
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


class ValidationError(RunnerError, ValueError):
    """Parametre refuse (profil, modele, permission, worktree, saisie...)."""


# --------------------------------------------------------------------------
# Utilitaires
# --------------------------------------------------------------------------

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


def ensure_worktree(root, rel, lot):
    """Cree le worktree `rel` (relatif a `root`) s'il manque, depuis `main`,
    avec la branche `worktree-stt-<lot>` (reutilisee si elle existe deja).
    Retourne le chemin absolu."""
    rel = validate_worktree(rel)
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
        cmd = ["git", "-C", root, "worktree", "add", "-b", branch, path, "main"]
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


def substitute_command(template, values, resume=False):
    """Substitue {agent} {model} {session} {perm} {task} {prompt} dans argv.
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
                 "resumed", "paused_s", "paused_at", "budget_ack", "order")

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
        self.tokens = None
        # non persistes
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
# Runner
# --------------------------------------------------------------------------

class Runner:
    def __init__(self, state_dir, root, command=None, profile_cap=None,
                 global_cap=None, start_timeout_s=None, stop_grace_s=None,
                 budget_pause_factor=None, on_change=None, tokens_of=None,
                 turn_ended_of=None, now=None, env=None,
                 worktree_factory=None, waiting_silence_s=None):
        self.state_dir = state_dir
        self.root = root
        self.command = list(command or RUNNER_COMMAND)
        self.profile_cap = dict(profile_cap or PROFILE_CAP)
        self.global_cap = GLOBAL_CAP if global_cap is None else global_cap
        self.start_timeout_s = (START_TIMEOUT_S if start_timeout_s is None
                                else start_timeout_s)
        self.stop_grace_s = STOP_GRACE_S if stop_grace_s is None else stop_grace_s
        self.budget_pause_factor = (BUDGET_PAUSE_FACTOR if budget_pause_factor is None
                                    else budget_pause_factor)
        self.waiting_silence_s = (WAITING_SILENCE_S if waiting_silence_s is None
                                  else waiting_silence_s)
        self.on_change = on_change
        self.tokens_of = tokens_of
        self.turn_ended_of = turn_ended_of
        self.now = now or time.time
        self.env = dict(env or {})
        self.worktree_factory = worktree_factory or ensure_worktree
        self.runs = {}
        self._order = 0
        self._lock = threading.RLock()
        self._thread = None
        self._thread_stop = threading.Event()

    # ---- persistance -----------------------------------------------------

    @property
    def state_path(self):
        return os.path.join(self.state_dir, "state.json")

    def _save(self):
        with self._lock:
            os.makedirs(self.state_dir, exist_ok=True)
            data = {"version": 1,
                    "runs": [r.to_dict() for r in self.runs.values()]}
            tmp = self.state_path + ".tmp"
            with open(tmp, "w") as f:
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
                if r.state in LIVE_STATES:
                    if r.pid and r.proc_start and process_start_tag(r.pid) == r.proc_start:
                        r.state = "orphan"
                        r.note = "orphelin apres redemarrage"
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

    def _validate(self, task, agent, model, perm, prio, worktree, lot, prompt):
        if not isinstance(task, str) or not _TASK_RE.match(task) or ".." in task:
            raise ValidationError("tache invalide: %r" % (task,))
        if agent not in self.profile_cap:
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
        wt = validate_worktree(worktree)
        base = os.path.realpath(os.path.join(self.root, WORKTREE_PREFIX))
        real = os.path.realpath(os.path.join(self.root, wt))
        if os.path.commonpath([base, real]) != base or real == base:
            raise ValidationError("worktree hors de %s" % WORKTREE_PREFIX)
        return wt

    # ---- API : file ------------------------------------------------------

    def enqueue(self, task, agent="dev", model="sonnet", perm="acceptEdits",
                prio=None, worktree=None, lot=None, prompt=None, budget=None):
        """Met en file un nouveau run, ou relance un run stopped|killed|failed
        (reprise par --resume, parametres d'origine conserves)."""
        with self._lock:
            old = self.runs.get(task)
            if old is not None:
                if old.state not in RELAUNCHABLE:
                    raise TransitionError("%s: enqueue interdit depuis %s"
                                          % (task, old.state))
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
                old.note = None
                old.budget_ack = False
                old.paused_s = 0.0      # le temps actif (ms Kanban) se mesure par lancement
                old.paused_at = None
                self._set_state(old, "queued")
                return old
            prio = 2 if prio is None else prio
            lot = lot or str(task).split(".")[0]
            wt = worktree or (WORKTREE_PREFIX + "stt-%s" % lot)
            wt = self._validate(task, agent, model, perm, prio, wt, lot, prompt)
            self._order += 1
            r = Run(task, agent, model, perm, prio, str(uuid.uuid4()), wt, lot)
            r.enqueued = self.now()
            r.order = self._order
            r.budget = budget
            r.prompt = prompt
            self.runs[task] = r
            self._save()
            self._notify(r)
            return r

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
            queued = sorted((r for r in self.runs.values() if r.state == "queued"),
                            key=lambda r: (r.prio, r.enqueued, r.order))
            rank = {r.task: i + 1 for i, r in enumerate(queued)}
            runs = []
            for r in self.runs.values():
                runs.append({
                    "task": r.task, "agent": r.agent, "model": r.model,
                    "state": r.state, "session": r.session, "pid": r.pid,
                    "worktree": r.worktree, "inst": r.inst, "prio": r.prio,
                    "perm": r.perm, "enqueued": r.enqueued, "started": r.started,
                    "ended": r.ended, "exit": r.exit, "tokens": r.tokens,
                    "note": r.note, "rank": rank.get(r.task),
                    "active_s": r.active_seconds(self.now()),
                    "controllable": r.state != "orphan",
                })
            return {"caps": {"profile": dict(self.profile_cap),
                             "global": self.global_cap},
                    "runs": runs}

    def get(self, task):
        with self._lock:
            return self._get(task)

    # ---- lancement -------------------------------------------------------

    def _count(self, agent=None):
        return sum(1 for r in self.runs.values()
                   if r.state in SLOT_STATES and (agent is None or r.agent == agent))

    def _free_inst(self):
        used = {r.inst for r in self.runs.values()
                if r.agent == "dev" and r.state in SLOT_STATES}
        for i in DEV_INSTANCES:
            if i not in used:
                return i
        return None

    def _schedule(self):
        queued = sorted((r for r in self.runs.values() if r.state == "queued"),
                        key=lambda r: (r.prio, r.enqueued, r.order))
        for r in queued:
            if self._count() >= self.global_cap:
                break
            if self._count(r.agent) >= self.profile_cap.get(r.agent, 0):
                continue
            if r.agent == "dev":
                inst = self._free_inst()
                if inst is None:
                    continue
                r.inst = inst
            self._launch(r)

    def _launch(self, run):
        try:
            cwd = self.worktree_factory(self.root, run.worktree, run.lot)
            prompt = run.prompt or DEFAULT_PROMPT.format(task=run.task)
            argv = substitute_command(self.command, {
                "agent": run.agent, "model": run.model, "session": run.session,
                "perm": run.perm, "task": run.task, "prompt": prompt},
                resume=run.resumed)
            env = dict(os.environ)
            env.update(self.env)
            env.setdefault("TERM", "xterm-256color")
            master, slave = os.openpty()
            try:
                fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 24, 80, 0, 0))
                proc = subprocess.Popen(argv, stdin=slave, stdout=slave, stderr=slave,
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
        run.stop_deadline = None
        run.reader_stop = False
        run.budget_ack = False
        run.resumed = True
        os.makedirs(self.state_dir, exist_ok=True)
        run.log_path = os.path.join(self.state_dir, run.task + ".log")
        run.log_fh = open(run.log_path, "ab")
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
                with open(tmp, "wb") as f:
                    f.write(tail)
                os.replace(tmp, run.log_path)
                run.log_fh = open(run.log_path, "ab")
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
                            r.waiting_since = t
                            self._set_state(r, "waiting")
                        elif st == "waiting" and not ended:
                            self._set_state(r, "running")
            self._schedule()

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
