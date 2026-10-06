#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
STT · tableau de bord temps réel des agents Claude Code
========================================================

Petit serveur local (bibliothèque standard Python 3.8+, aucune dépendance) qui
observe en continu les agents Claude Code travaillant sur le dépôt csblog /
Space Travel & Transport, et sert un tableau de bord qui se met à jour en
direct (Server-Sent Events).

Trois sources, fusionnées :

1. Sessions Claude Code   ~/.claude/projects/<slug du dépôt>*/*.jsonl
   (+ <session>/subagents/*.jsonl) : outil en cours, rôle PM / Architecte /
   Développeur, todo, agents créés (identifiant, état, arrêt), tokens, attente d'une réponse ou d'une
   validation. Lecture incrémentale (seules les nouvelles lignes sont lues).
2. Git local              git worktree list + status + avance/retard sur main.
3. GitHub (public)        PR, événements, déploiements (ETag : les réponses 304
   ne consomment pas le quota ; GITHUB_TOKEN facultatif).

Usage :
    python stt_agents_server.py                 # http://127.0.0.1:8765
    python stt_agents_server.py --open          # ouvre le navigateur
    python stt_agents_server.py --once          # imprime un instantané JSON

Le serveur n'écoute que sur 127.0.0.1 par défaut : les transcripts des agents
restent sur la machine. --host 0.0.0.0 l'expose au réseau local (à vos risques).
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from collections import deque
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VERSION = "1.0.0"
HERE = Path(__file__).resolve().parent

# --- Seuils de statut (secondes) -------------------------------------------
ACTIVE_S = 90            # activité récente = agent en action
FAST_TOOL_WAIT_S = 30    # outil rapide sans résultat au-delà => validation demandée
LONG_TOOL_WAIT_S = 120   # Bash / web : au-delà, « long ou en attente de validation »
WAITING_MAX_S = 45 * 60  # au-delà, une session qui attend est considérée inactive
TIMELINE_S = 6 * 3600    # profondeur de la chronologie
BUCKET_S = 300           # granularité de la chronologie (5 min)
SPARK_MIN = 30           # sparkline des cartes : 30 dernières minutes

LONG_TOOLS = {"Bash", "BashOutput", "WebFetch", "WebSearch", "Monitor"}
ASK_TOOLS = {"AskUserQuestion": "Te pose une question", "ExitPlanMode": "Attend la validation du plan"}
SPAWN_TOOLS = {"Task", "Agent"}
SILENT_S = 5 * 60        # agent lancé sans aucune sortie depuis ce délai => « silencieux » (à arrêter)
AGENT_ENDED = ("done", "error", "stopped")  # cycle de vie d'un agent : running -> done | error | stopped

NO_WINDOW = 0x08000000 if os.name == "nt" else 0  # pas de console qui clignote sous Windows


# ---------------------------------------------------------------------------
# Utilitaires
# ---------------------------------------------------------------------------
def parse_ts(s):
    if not s or not isinstance(s, str):
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def iso(ts):
    if not ts:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def shorten(text, n=140):
    text = re.sub(r"\s+", " ", (text or "")).strip()
    return text if len(text) <= n else text[: n - 1] + "…"


def plain(text):
    """Retire l'emphase Markdown (**, __, `) pour l'affichage."""
    return re.sub(r"\*\*|__|`", "", text or "")


def first_line(text, n=140):
    for line in (text or "").splitlines():
        line = re.sub(r"\*\*|__|`", "", line).strip().strip("#*>_ -").strip()
        if line:
            return shorten(line, n)
    return ""


def claude_slug(path):
    """Nom de dossier utilisé par Claude Code dans ~/.claude/projects."""
    return re.sub(r"[^A-Za-z0-9]", "-", str(path))


def norm_path(p):
    return os.path.normcase(os.path.normpath(str(p))) if p else ""


def rel_tail(p, keep=3):
    p = (p or "").replace("\\", "/")
    parts = [x for x in p.split("/") if x]
    return "/".join(parts[-keep:]) if len(parts) > keep else p


def block_text(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")
    return ""


def tool_label(name):
    if name and name.startswith("mcp__"):
        parts = name.split("__")
        return "·".join(parts[1:]) if len(parts) > 2 else name
    return name or "?"


def summarize_tool(name, inp):
    if not isinstance(inp, dict):
        return ""
    if name in ("Read", "Edit", "Write", "MultiEdit", "NotebookEdit"):
        return rel_tail(inp.get("file_path") or inp.get("notebook_path") or "")
    if name == "Bash":
        return shorten(inp.get("command") or inp.get("description") or "", 90)
    if name in ("Grep", "Glob"):
        return shorten(inp.get("pattern", ""), 70)
    if name in SPAWN_TOOLS:
        return shorten(inp.get("description", ""), 70)
    if name == "TodoWrite":
        todos = inp.get("todos") or []
        done = sum(1 for t in todos if isinstance(t, dict) and t.get("status") == "completed")
        return f"todo {done}/{len(todos)}"
    if name in ("TaskCreate", "TaskUpdate"):
        return shorten(inp.get("subject") or f"#{inp.get('taskId', '?')} → {inp.get('status', '')}", 70)
    if name == "WebFetch":
        m = re.match(r"https?://([^/]+)", inp.get("url", ""))
        return m.group(1) if m else ""
    if name == "WebSearch":
        return shorten(inp.get("query", ""), 70)
    if name == "Skill":
        return inp.get("skill") or inp.get("command") or ""
    for v in inp.values():
        if isinstance(v, str) and v:
            return shorten(v, 70)
    return ""


# --- Rôles (mode agentique d'AGENTS.md : PM / Architecte / Développeur) ------
ROLE_MARKERS = [
    ("PM", r"(?:pm|chef(?:fe)? de projet|project manager|product manager)"),
    ("ARCH", r"(?:architecte|architect)"),
    ("DEV", r"(?:d[ée]veloppeu(?:r|se)|developer|dev)"),
]
ROLE_TAIL = r"(?:\s*\([^)]{0,40}\))?\s*(?:[:\]\)—–\-*|]|$)"


def role_from_text(text):
    """Dernier marqueur de rôle en tête de ligne (« **Architecte** — … », « PM : … »)."""
    found = None
    for line in (text or "").splitlines()[:200]:
        s = line.strip().lstrip("#>*-_[(`| ").lower()
        s = re.sub(r"^(?:r[ôo]le|role)\s*[:：\-]\s*", "", s)
        s = s.lstrip("*_` ")
        for role, pat in ROLE_MARKERS:
            if re.match(pat + ROLE_TAIL, s):
                found = role
                break
    return found


def role_from_tool(name, inp):
    if not isinstance(inp, dict):
        return None
    if name in ("Edit", "MultiEdit", "Write", "NotebookEdit"):
        p = (inp.get("file_path") or inp.get("notebook_path") or "").replace("\\", "/").lower()
        if p.endswith(".md"):
            return "ARCH" if ("/docs/" in p or "spec" in p or "plan" in p) else None
        return "DEV"
    if name == "Bash":
        c = (inp.get("command") or "").lower()
        if "gh pr create" in c:
            return "PM"
        if re.search(r"build\.py|_test\.py|npm (ci|run|test)|node tests/", c):
            return "DEV"
    return None


def role_from_agent(kind, desc):
    s = f"{kind or ''} {desc or ''}".lower()
    if re.search(r"\b(pm|chef|project|manager|product)\b", s):
        return "PM"
    if re.search(r"archi|review|revue|spec", s):
        return "ARCH"
    if re.search(r"\bdev|d[ée]velopp|implement|impl[ée]ment|coder|\bfix", s):
        return "DEV"
    if re.search(r"explore|search|recherch", s):
        return "EXPLORE"
    return None


def is_noise_prompt(txt):
    t = txt.lstrip()
    return (
        not t
        or t.startswith("<command-")
        or t.startswith("<local-command")
        or t.startswith("<system-reminder>")
        or t.startswith("Caveat:")
        or t.startswith("<bash-")
        or t.startswith("<task-notification>")
    )


# ---------------------------------------------------------------------------
# Transcript Claude Code (lecture incrémentale d'un .jsonl)
# ---------------------------------------------------------------------------
class Transcript:
    def __init__(self, path, is_sub=False):
        self.path = path
        self.is_sub = is_sub
        self.reset()

    def reset(self):
        self.offset = 0
        self.buf = b""
        self.mtime = 0
        self.session_id = self.cwd = self.branch = self.version = self.model = None
        self.title = self.first_prompt = self.last_prompt = None
        self.first_ts = self.last_ts = None
        self.last_kind = None
        self.last_text = None
        self.pending = {}
        self.tool_names = {}
        self.last_tool = None
        self.todos, self.todos_ts = [], 0
        self.tasks, self.tasks_ts, self.task_by_tool = [], 0, {}
        self.spawns, self.spawn_order = {}, []
        self.side = {}  # anciens formats : sous-agents inline (isSidechain)
        self.usage, self.last_usage = {}, None
        self.events = deque(maxlen=3000)  # (ts, kind, text)
        self.roles = []  # (ts, role, source)
        self.phase_start = 0
        self.errors = 0

    # -- lecture -----------------------------------------------------------
    def poll(self):
        if self.path is None:
            return False
        try:
            st = os.stat(self.path)
        except OSError:
            return False
        if st.st_size < self.offset:
            self.reset()
        self.mtime = st.st_mtime
        if st.st_size == self.offset:
            return False
        with open(self.path, "rb") as f:
            f.seek(self.offset)
            data = f.read()
        self.offset += len(data)
        data = self.buf + data
        lines = data.split(b"\n")
        self.buf = lines.pop()  # ligne incomplète éventuelle
        for raw in lines:
            raw = raw.strip()
            if not raw:
                continue
            try:
                entry = json.loads(raw.decode("utf-8", errors="replace"))
            except ValueError:
                continue
            if isinstance(entry, dict):
                self.handle(entry)
        return True

    def add_event(self, ts, kind, text):
        if ts:
            self.events.append((ts, kind, text))

    # -- interprétation ----------------------------------------------------
    def handle(self, e):
        if e.get("isSidechain") and not self.is_sub:
            running = [sid for sid in reversed(self.spawn_order) if self.spawns[sid]["status"] == "running"]
            key = running[0] if running else "_side"
            self.side.setdefault(key, Transcript(None, is_sub=True)).handle(e)
            return
        t = e.get("type")
        ts = parse_ts(e.get("timestamp"))
        if ts:
            self.first_ts = self.first_ts or ts
            self.last_ts = max(self.last_ts or 0, ts)
        for key, attr in (("sessionId", "session_id"), ("cwd", "cwd"), ("gitBranch", "branch"), ("version", "version")):
            if e.get(key):
                setattr(self, attr, e[key])
        if t == "summary" and e.get("summary"):
            self.title = e["summary"]
            return
        if t in ("custom-title", "ai-title") and (e.get("customTitle") or e.get("title")):
            self.title = e.get("customTitle") or e.get("title")
            return
        msg = e.get("message") or {}
        if t == "queue-operation" and e.get("operation") == "enqueue" and isinstance(e.get("content"), str):
            if "<task-notification>" in e["content"]:  # fin d'un agent (completed / failed / killed)
                self._agent_notification(e["content"], ts)
            return
        if t == "user":
            self._user(e, msg, ts)
        elif t == "assistant":
            self._assistant(msg, ts)

    def _user(self, e, msg, ts):
        content = msg.get("content")
        blocks = [{"type": "text", "text": content}] if isinstance(content, str) else (content or [])
        for b in blocks:
            if not isinstance(b, dict):
                continue
            bt = b.get("type")
            if bt == "tool_result":
                tid = b.get("tool_use_id")
                self.pending.pop(tid, None)
                self.last_kind = "tool_result"
                if b.get("is_error"):
                    self.errors += 1
                if tid in self.spawns:
                    sp = self.spawns[tid]
                    txt = block_text(b.get("content"))
                    m = re.search(r"agentId:\s*([0-9a-zA-Z]+)", txt)
                    if m:
                        sp["agent_id"] = m.group(1)
                    if b.get("is_error"):
                        sp["status"], sp["ended"] = "error", ts
                        self.add_event(ts, "spawn_end", f"Agent en erreur · {sp['description']}")
                    elif m and re.search(r"launched|background", txt, re.I):
                        sp["background"] = True  # arrière-plan : reste actif jusqu'à sa notification de fin ou son arrêt
                    else:
                        sp["status"], sp["ended"] = "done", ts
                        self.add_event(ts, "spawn_end", f"Agent terminé · {sp['description']}")
                if tid in self.task_by_tool:
                    m = re.search(r"#(\d+)", block_text(b.get("content")))
                    if m:
                        self.task_by_tool[tid]["id"] = m.group(1)
            elif bt == "text":
                txt = b.get("text") or ""
                if "<task-notification>" in txt:
                    self._agent_notification(txt, ts)
                if e.get("isMeta") or is_noise_prompt(txt):
                    continue
                if "[Request interrupted" in txt:
                    self.last_kind = "interrupt"
                    self.add_event(ts, "interrupt", "Interrompu par l'utilisateur")
                    continue
                if txt.startswith("This session is being continued"):
                    self.last_kind = "prompt"
                    self.add_event(ts, "compact", "Contexte compacté")
                    continue
                for tid in list(self.pending):  # une nouvelle consigne clôt les outils restés sans réponse
                    if tid in self.spawns and self.spawns[tid]["status"] == "running" and not self.spawns[tid].get("background"):
                        self.spawns[tid]["status"] = "done"
                    self.pending.pop(tid, None)
                self.first_prompt = self.first_prompt or txt
                self.last_prompt = txt
                self.last_kind = "prompt"
                if len(txt.strip()) >= 60:  # nouvelle demande => nouveau cycle PM→Livré
                    self.phase_start = len(self.roles)
                self.add_event(ts, "prompt", first_line(txt))

    def _spawn_by_agent_id(self, agent_id):
        for sp in self.spawns.values():
            if agent_id and sp.get("agent_id") == agent_id:
                return sp
        return None

    def _end_agent(self, sp, status, ts, label):
        if sp["status"] == "running":
            sp["status"], sp["ended"] = status, ts
            self.add_event(ts, "spawn_end", f"{label} · {sp['description']}")

    def _agent_notification(self, txt, ts):
        """<task-notification> : fin réelle d'un agent (completed / failed / killed)."""
        for blk in re.findall(r"<task-notification>(.*?)</task-notification>", txt, re.S):
            m_id = re.search(r"<task-id>\s*([^<\s]+)", blk)
            m_st = re.search(r"<status>\s*([^<\s]+)", blk)
            sp = self._spawn_by_agent_id(m_id.group(1)) if m_id else None
            if not sp or not m_st:
                continue
            st = m_st.group(1).lower()
            if st in ("killed", "stopped"):
                self._end_agent(sp, "stopped", ts, "Agent arrêté")
            elif st in ("failed", "error"):
                self._end_agent(sp, "error", ts, "Agent en erreur")
            elif st == "completed":
                self._end_agent(sp, "done", ts, "Agent terminé")

    def _assistant(self, msg, ts):
        model = msg.get("model")
        if model and not model.startswith("<"):
            self.model = model
        usage, mid = msg.get("usage"), msg.get("id")
        if isinstance(usage, dict):
            self.usage[mid or len(self.usage)] = usage
            self.last_usage = usage
        for b in msg.get("content") or []:
            if not isinstance(b, dict):
                continue
            bt = b.get("type")
            if bt == "text":
                txt = (b.get("text") or "").strip()
                if not txt:
                    continue
                self.last_text = txt
                self.last_kind = "text"
                role = role_from_text(txt)
                if role:
                    self.roles.append((ts, role, "marker"))
                self.add_event(ts, "text", first_line(txt))
            elif bt == "tool_use":
                tid, name, inp = b.get("id"), b.get("name") or "?", b.get("input") or {}
                summ = summarize_tool(name, inp)
                self.pending[tid] = {"name": name, "summary": summ, "ts": ts}
                self.tool_names[tid] = name
                self.last_tool = {"name": name, "summary": summ, "ts": ts}
                self.last_kind = "tool_use"
                self.add_event(ts, "tool", f"{tool_label(name)} · {summ}" if summ else tool_label(name))
                role = role_from_tool(name, inp)
                if role:
                    self.roles.append((ts, role, "tool"))
                if name == "TodoWrite" and isinstance(inp.get("todos"), list):
                    self.todos = [
                        {"content": t.get("content", ""), "activeForm": t.get("activeForm", ""), "status": t.get("status", "pending")}
                        for t in inp["todos"] if isinstance(t, dict)
                    ]
                    self.todos_ts = ts or time.time()
                elif name == "TaskCreate":
                    task = {"id": None, "content": inp.get("subject", ""), "activeForm": inp.get("activeForm", ""), "status": "pending"}
                    self.tasks.append(task)
                    self.task_by_tool[tid] = task
                    self.tasks_ts = ts or time.time()
                elif name == "TaskUpdate":
                    key = str(inp.get("taskId", ""))
                    for task in self.tasks:
                        if task["id"] == key:
                            if inp.get("status") == "deleted":
                                self.tasks.remove(task)
                            else:
                                task["status"] = inp.get("status", task["status"])
                                task["content"] = inp.get("subject", task["content"])
                                task["activeForm"] = inp.get("activeForm", task["activeForm"])
                            break
                    self.tasks_ts = ts or time.time()
                elif name == "TaskStop":
                    sp = self._spawn_by_agent_id(str(inp.get("task_id") or inp.get("shell_id") or ""))
                    if sp:
                        self._end_agent(sp, "stopped", ts, "Agent arrêté")
                elif name == "SendMessage":
                    sp = self._spawn_by_agent_id(str(inp.get("to") or ""))
                    if sp:
                        sp["messages"] = sp.get("messages", 0) + 1
                        self.add_event(ts, "tool", f"Message à l'agent · {sp['description']}")
                elif name in SPAWN_TOOLS:
                    kind = inp.get("subagent_type") or "general-purpose"
                    desc = inp.get("description") or ""
                    sp = {
                        "id": tid, "description": desc, "type": kind, "role": role_from_agent(kind, desc),
                        "prompt": inp.get("prompt") or "", "started": ts, "ended": None, "status": "running",
                        "agent_id": None, "name": inp.get("name") or "", "background": False, "messages": 0,
                    }
                    self.spawns[tid] = sp
                    self.spawn_order.append(tid)
                    if sp["role"] in ("PM", "ARCH", "DEV"):
                        self.roles.append((ts, sp["role"], "subagent"))
                    self.add_event(ts, "spawn", f"Crée un agent · {desc or kind}")

    # -- dérivés -----------------------------------------------------------
    def activity(self):
        # horodatage de la dernière entrée ; mtime seulement à défaut (un résumé peut être réécrit plus tard)
        return self.last_ts or self.mtime or 0

    def tokens(self):
        tot = {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0}
        for u in self.usage.values():
            tot["input"] += int(u.get("input_tokens") or 0)
            tot["output"] += int(u.get("output_tokens") or 0)
            tot["cache_read"] += int(u.get("cache_read_input_tokens") or 0)
            tot["cache_write"] += int(u.get("cache_creation_input_tokens") or 0)
        lu = self.last_usage or {}
        tot["context"] = int(lu.get("input_tokens") or 0) + int(lu.get("cache_read_input_tokens") or 0) + int(lu.get("cache_creation_input_tokens") or 0)
        return tot

    def current_role(self):
        return self.roles[-1][1] if self.roles else None

    def phase(self):
        """0 Brief(PM) 1 Spec(Archi) 2 Dév 3 Revue(Archi) 4 Clôture(PM) — 5 PR / 6 livré ajoutés via GitHub."""
        phase, seen_dev = -1, False
        for _, role, _ in self.roles[self.phase_start:]:
            if role == "DEV":
                seen_dev, phase = True, max(phase, 2)
            elif role == "ARCH":
                phase = max(phase, 3 if seen_dev else 1)
            elif role == "PM":
                phase = max(phase, 4 if seen_dev else 0)
        return phase

    def roles_seen(self):
        out = []
        for _, role, _ in self.roles[self.phase_start:]:
            if role in ("PM", "ARCH", "DEV") and (not out or out[-1] != role):
                out.append(role)
        return out[-8:]

    def todo_list(self):
        return self.tasks if self.tasks_ts >= self.todos_ts and self.tasks else self.todos

    def counts(self, now, start, step, n):
        buckets = [0] * n
        for ts, kind, _ in self.events:
            if kind in ("tool", "text", "spawn", "prompt") and ts >= start:
                i = int((ts - start) // step)
                if 0 <= i < n:
                    buckets[i] += 1
        return buckets

    def state(self, now, subs):
        """Retourne (code, libellé, depuis)."""
        last = self.activity()
        age = now - last
        sub_live = [s for s in subs if now - s.activity() < ACTIVE_S and s.status_hint not in AGENT_ENDED]
        pend = sorted(self.pending.values(), key=lambda p: p["ts"] or 0)
        asks = [p for p in pend if p["name"] in ASK_TOOLS]
        if asks:
            return "waiting", ASK_TOOLS[asks[-1]["name"]], asks[-1]["ts"]
        for s in subs:  # un agent bloqué sur une validation bloque la session
            code, label, since = s.state(now, [])
            if code == "permission" and s.status_hint not in AGENT_ENDED:
                return "permission", "Agent : " + label[0].lower() + label[1:], since
        tools = [p for p in pend if p["name"] not in SPAWN_TOOLS]
        if tools:
            p = tools[-1]
            wait = now - (p["ts"] or last)
            label = f"{tool_label(p['name'])} en cours"
            if wait > 2 * 3600:
                return "idle", "Inactif (outil sans réponse)", p["ts"]
            if p["name"] in LONG_TOOLS:
                if wait < LONG_TOOL_WAIT_S:
                    return "tool", label, p["ts"]
                return "permission", "Commande longue… ou validation en attente", p["ts"]
            if wait < FAST_TOOL_WAIT_S:
                return "tool", label, p["ts"]
            return "permission", "Attend ta validation", p["ts"]
        if any(p["name"] in SPAWN_TOOLS for p in pend):
            if sub_live or age < ACTIVE_S:
                return "running", "Agents au travail", last
            if age < WAITING_MAX_S:
                return "running", "Agent silencieux (à arrêter ?)", last
            return "idle", "Inactif", last
        if self.last_kind in ("prompt", "tool_result"):
            if age < 300:
                return "thinking", "Réfléchit…", last
            return "idle", "Inactif", last
        if self.last_kind == "interrupt":
            if age < WAITING_MAX_S:
                return "waiting", "Interrompu — attend ta consigne", last
            return "idle", "Inactif", last
        if self.last_kind == "text":
            if age < 12:
                return "thinking", "Rédige…", last
            if age < WAITING_MAX_S:
                return "waiting", "Attend ta réponse", last
        return "idle", "Inactif", last

    status_hint = None  # cycle de vie (running / done / error / stopped) de l'agent lié à un appel Agent


# ---------------------------------------------------------------------------
# Collecte des sessions Claude Code
# ---------------------------------------------------------------------------
class ClaudeCollector:
    def __init__(self, claude_dir, repo, window_s, extra_filters):
        self.projects = Path(claude_dir).expanduser() / "projects"
        self.repo = repo
        self.prefix = claude_slug(repo).lower() if repo else None
        self.filters = [f.lower() for f in extra_filters]
        self.window_s = window_s
        self.mains = {}  # path -> Transcript
        self.subs = {}   # path -> Transcript
        self.status = {"ok": False, "dir": str(self.projects), "slug": self.prefix, "dirs": [], "sessions": 0, "error": None}

    def _match(self, name):
        n = name.lower()
        return (self.prefix and n.startswith(self.prefix)) or any(f in n for f in self.filters)

    def refresh(self):
        now = time.time()
        if not self.projects.is_dir():
            self.status.update(ok=False, error=f"Dossier introuvable : {self.projects}")
            return
        try:
            dirs = [d for d in os.scandir(self.projects) if d.is_dir() and self._match(d.name)]
        except OSError as exc:
            self.status.update(ok=False, error=str(exc))
            return
        seen = set()
        for d in dirs:
            try:
                entries = list(os.scandir(d.path))
            except OSError:
                continue
            for f in entries:
                if f.is_file() and f.name.endswith(".jsonl"):
                    try:
                        mt = f.stat().st_mtime
                    except OSError:
                        continue
                    if now - mt > self.window_s and f.path not in self.mains:
                        continue
                    seen.add(f.path)
                    tr = self.mains.get(f.path) or self.mains.setdefault(f.path, Transcript(f.path))
                    tr.poll()
                    sub_dir = os.path.join(d.path, f.name[:-6], "subagents")
                    if os.path.isdir(sub_dir):
                        for sf in os.scandir(sub_dir):
                            if sf.name.endswith(".jsonl"):
                                st = self.subs.get(sf.path) or self.subs.setdefault(sf.path, Transcript(sf.path, is_sub=True))
                                st.parent = f.path
                                st.poll()
        for p in list(self.mains):  # oubli des sessions sorties de la fenêtre
            if p not in seen and now - self.mains[p].activity() > self.window_s:
                del self.mains[p]
        for p in list(self.subs):
            if getattr(self.subs[p], "parent", None) not in self.mains:
                del self.subs[p]
        hint = None
        if not dirs and self.projects.is_dir():
            base = Path(self.repo).name.lower() if self.repo else ""
            near = [d.name for d in os.scandir(self.projects) if d.is_dir() and base and base in d.name.lower()]
            hint = f"Aucun dossier ne commence par « {self.prefix} »" + (f" ; proches : {', '.join(near[:4])} (utilisez --match)" if near else "")
        self.status.update(ok=True, dirs=[d.name for d in dirs], sessions=len(self.mains), error=hint)

    def subagents_of(self, main):
        """Associe chaque agent créé (appel Task/Agent) à son transcript."""
        files = [s for s in self.subs.values() if getattr(s, "parent", None) == main.path]
        by_prompt = {}
        for s in files:
            key = re.sub(r"\s+", " ", (s.first_prompt or "")).strip()[:160]
            by_prompt.setdefault(key, []).append(s)
        out, used = [], set()
        for sid in main.spawn_order:
            sp = main.spawns[sid]
            key = re.sub(r"\s+", " ", sp["prompt"]).strip()[:160]
            tr = None
            for cand in by_prompt.get(key, []):
                if id(cand) not in used:
                    tr = cand
                    break
            if tr is None and sid in main.side:
                tr = main.side[sid]
            if tr is not None:
                used.add(id(tr))
                tr.status_hint = sp["status"]
            out.append((sp, tr))
        for s in files:  # transcripts orphelins (format inconnu)
            if id(s) not in used:
                desc = first_line(s.first_prompt or "", 60)
                out.append(({"id": s.path, "description": desc, "type": "?", "role": role_from_agent("", desc),
                             "prompt": "", "started": s.first_ts, "ended": None,
                             "status": "running" if time.time() - s.activity() < ACTIVE_S else "done"}, s))
        return out


# ---------------------------------------------------------------------------
# Git local
# ---------------------------------------------------------------------------
def git(args, cwd, timeout=8):
    try:
        r = subprocess.run(["git"] + args, cwd=cwd, capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=timeout, creationflags=NO_WINDOW)
        return r.stdout if r.returncode == 0 else None
    except (OSError, subprocess.SubprocessError):
        return None


class GitCollector:
    def __init__(self, repo):
        self.repo = repo
        self.main = "main"
        self.worktrees = []
        self.branches = []
        self.status = {"ok": False, "repo": repo, "main": "main", "error": None}

    def refresh(self):
        if not self.repo:
            self.status.update(ok=False, error="Dépôt git introuvable (--repo)")
            return
        head = git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], self.repo)
        if head and "/" in head.strip():
            self.main = head.strip().split("/", 1)[1]
        out = git(["worktree", "list", "--porcelain"], self.repo)
        if out is None:
            self.status.update(ok=False, error="git worktree list a échoué")
            return
        wts, cur = [], {}
        for line in out.splitlines() + [""]:
            if not line.strip():
                if cur:
                    wts.append(cur)
                cur = {}
            elif line.startswith("worktree "):
                cur["path"] = line[9:].strip()
            elif line.startswith("HEAD "):
                cur["head"] = line[5:12]
            elif line.startswith("branch "):
                cur["branch"] = line[7:].replace("refs/heads/", "").strip()
            elif line.strip() == "detached":
                cur["branch"] = None
        result = []
        for w in wts:
            path = w.get("path")
            if not path or not os.path.isdir(path):
                continue
            st = git(["status", "--porcelain=v1"], path) or ""
            files = [l[3:] for l in st.splitlines() if len(l) > 3]
            last = (git(["log", "-1", "--format=%ct%x1f%s"], path) or "").strip().split("\x1f")
            ahead = behind = None
            br = w.get("branch")
            if br and br != self.main:
                cnt = git(["rev-list", "--left-right", "--count", f"{self.main}...{br}"], self.repo)
                if cnt and len(cnt.split()) == 2:
                    behind, ahead = (int(x) for x in cnt.split())
            result.append({
                "path": path, "name": Path(path).name, "branch": br, "head": w.get("head"),
                "ahead": ahead, "behind": behind, "dirty": len(files), "files": files[:12],
                "last_commit": {"ts": iso(int(last[0])) if last and last[0].isdigit() else None,
                                "subject": last[1] if len(last) > 1 else ""},
                "is_main": norm_path(path) == norm_path(self.repo),
            })
        self.worktrees = result
        refs = git(["for-each-ref", "--sort=-committerdate", "--count=40",
                    "--format=%(refname:short)%x1f%(committerdate:unix)%x1f%(subject)", "refs/heads"], self.repo) or ""
        self.branches = []
        for line in refs.splitlines():
            parts = line.split("\x1f")
            if len(parts) == 3:
                self.branches.append({"name": parts[0], "ts": iso(int(parts[1])) if parts[1].isdigit() else None, "subject": parts[2]})
        self.status.update(ok=True, main=self.main, error=None)

    def worktree_for(self, cwd):
        c = norm_path(cwd)
        best = None
        for w in self.worktrees:
            p = norm_path(w["path"])
            if c == p or c.startswith(p + os.sep):
                if best is None or len(p) > len(norm_path(best["path"])):
                    best = w
        return best


# ---------------------------------------------------------------------------
# GitHub (API publique, requêtes conditionnelles)
# ---------------------------------------------------------------------------
def slim_github(prs, events, runs):
    """Même forme que slimGithub() côté page (mode GitHub direct)."""
    out_prs = [{
        "number": p.get("number"), "title": p.get("title"), "state": p.get("state"),
        "merged": bool(p.get("merged_at")), "draft": bool(p.get("draft")),
        "head": (p.get("head") or {}).get("ref"), "base": (p.get("base") or {}).get("ref"),
        "user": (p.get("user") or {}).get("login"), "created_at": p.get("created_at"),
        "updated_at": p.get("updated_at"), "merged_at": p.get("merged_at"), "closed_at": p.get("closed_at"),
        "url": p.get("html_url"),
    } for p in (prs or []) if isinstance(p, dict)]
    out_ev = []
    for e in events or []:
        if not isinstance(e, dict):
            continue
        pl = e.get("payload") or {}
        pr = pl.get("pull_request") or {}
        ref = pl.get("ref") or ""
        out_ev.append({
            "type": e.get("type"), "created_at": e.get("created_at"), "actor": (e.get("actor") or {}).get("login"),
            "ref": ref.replace("refs/heads/", "") if isinstance(ref, str) else "", "ref_type": pl.get("ref_type"),
            "action": pl.get("action"), "pr": pr.get("number"), "pr_title": pr.get("title"),
            "merged": bool(pr.get("merged")), "head": (pl.get("head") or "")[:7] if isinstance(pl.get("head"), str) else "",
            "pr_head": (pr.get("head") or {}).get("ref") if isinstance(pr.get("head"), dict) else None,
        })
    out_runs = [{
        "id": r.get("id"), "name": r.get("name"), "title": r.get("display_title"), "status": r.get("status"),
        "conclusion": r.get("conclusion"), "branch": r.get("head_branch"), "event": r.get("event"),
        "created_at": r.get("created_at"), "updated_at": r.get("updated_at"), "url": r.get("html_url"),
    } for r in ((runs or {}).get("workflow_runs") or []) if isinstance(r, dict)]
    return {"prs": out_prs, "events": out_ev, "runs": out_runs}


class GitHubCollector:
    def __init__(self, slug, token):
        self.slug = slug
        self.token = token
        self.cache = {}
        self.data = {"prs": [], "events": [], "runs": []}
        self.status = {"ok": False, "slug": slug, "rate": None, "fetched_at": None, "error": None, "auth": bool(token)}
        self.next_at = 0

    def _get(self, path):
        url = f"https://api.github.com/repos/{self.slug}{path}"
        headers = {"Accept": "application/vnd.github+json", "User-Agent": f"stt-agents-dashboard/{VERSION}",
                   "X-GitHub-Api-Version": "2022-11-28"}
        cached = self.cache.get(url)
        if cached:
            headers["If-None-Match"] = cached[0]
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=15) as r:
                self._rate(r.headers)
                data = json.loads(r.read().decode("utf-8"))
                if r.headers.get("ETag"):
                    self.cache[url] = (r.headers["ETag"], data)
                return data
        except urllib.error.HTTPError as exc:
            self._rate(exc.headers)
            if exc.code == 304 and cached:
                return cached[1]
            raise

    def _rate(self, h):
        if h and h.get("X-RateLimit-Remaining") is not None:
            self.status["rate"] = {"remaining": int(h.get("X-RateLimit-Remaining")), "limit": int(h.get("X-RateLimit-Limit") or 0),
                                   "reset": iso(int(h.get("X-RateLimit-Reset") or 0))}

    def refresh(self):
        now = time.time()
        if not self.slug or now < self.next_at:
            return False
        interval = 30 if self.token else 75
        try:
            prs = self._get("/pulls?state=all&per_page=30&sort=updated&direction=desc")
            events = self._get("/events?per_page=60")
            runs = self._get("/actions/runs?per_page=10")
            self.data = slim_github(prs, events, runs)
            self.status.update(ok=True, fetched_at=iso(now), error=None)
        except Exception as exc:  # réseau, quota, 404…
            self.status.update(ok=False, error=shorten(str(exc), 160))
            interval = 120
        rate = self.status.get("rate") or {}
        if rate.get("remaining") is not None and rate["remaining"] < 6 and rate.get("reset"):
            interval = max(interval, (parse_ts(rate["reset"]) or now) - now + 5)
        self.next_at = now + interval
        return True


# ---------------------------------------------------------------------------
# Assemblage de l'état
# ---------------------------------------------------------------------------
class Hub:
    def __init__(self, args):
        self.args = args
        self.claude = ClaudeCollector(args.claude_dir, args.repo, args.window * 3600, args.match)
        self.git = GitCollector(args.repo)
        self.gh = GitHubCollector(None if args.no_github else args.github, os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN"))
        self.cond = threading.Condition()
        self.version = 0
        self.payload = b"{}"
        self.digest = None

    def build(self):
        now = time.time()
        prs = self.gh.data.get("prs", [])
        agents, feed = [], []
        tl_start = now - TIMELINE_S
        tl_n = TIMELINE_S // BUCKET_S
        sp_start = now - SPARK_MIN * 60
        lanes = []
        for tr in sorted(self.claude.mains.values(), key=lambda t: -t.activity()):
            pairs = self.claude.subagents_of(tr)
            sub_trs = [s for _, s in pairs if s is not None]
            code, label, since = tr.state(now, sub_trs)
            wt = self.git.worktree_for(tr.cwd) if tr.cwd else None
            branch = (wt or {}).get("branch") or tr.branch
            pr = next((p for p in prs if p["head"] == branch and branch and branch != self.git.main), None)
            phase = tr.phase()
            if pr:
                phase = 6 if pr["merged"] else max(phase, 5) if pr["state"] == "open" else phase
            if code == "idle" and pr and pr["merged"]:
                label = "Livré"
            subs = []
            for sp, s in pairs:
                st_code, st_label = (sp["status"] if sp["status"] in ("error", "stopped") else "done"), ""
                if sp["status"] == "running":
                    if s is not None:
                        st_code, st_label, _ = s.state(now, [])
                    else:
                        st_code, st_label = "running", "En cours"
                tok = s.tokens() if s else None
                act = s.activity() if s else (sp["started"] or 0)
                silent = sp["status"] == "running" and bool(act) and now - act > SILENT_S
                lifecycle = {"running": "silencieux" if silent else "actif", "done": "rapport rendu",
                             "stopped": "arrêté", "error": "erreur"}[sp["status"]]
                subs.append({
                    "agent_id": sp.get("agent_id"), "name": sp.get("name") or None, "lifecycle": lifecycle, "silent": silent,
                    "background": bool(sp.get("background")), "messages": sp.get("messages", 0),
                    "id": sp["id"], "description": sp["description"], "type": sp["type"],
                    "role": sp["role"] or (s.current_role() if s else None), "status": sp["status"],
                    "state": st_code, "state_label": st_label, "started": iso(sp["started"]), "ended": iso(sp["ended"]),
                    "last_tool": dict(s.last_tool, ts=iso(s.last_tool["ts"])) if s and s.last_tool else None,
                    "last_text": shorten(plain(s.last_text), 200) if s and s.last_text else None,
                    "tokens_out": tok["output"] if tok else None, "last_activity": iso(s.activity()) if s else None,
                })
            registry = {k: sum(1 for x in subs if x["lifecycle"] == v) for k, v in
                        (("actifs", "actif"), ("silencieux", "silencieux"), ("termines", "rapport rendu"),
                         ("arretes", "arrêté"), ("erreurs", "erreur"))}
            cur = None
            if tr.pending:
                p = sorted(tr.pending.values(), key=lambda x: x["ts"] or 0)[-1]
                cur = {"tool": tool_label(p["name"]), "summary": p["summary"], "since": iso(p["ts"])}
                if p["name"] in SPAWN_TOOLS:  # on montre plutôt ce que fait l'agent
                    live = [(sp, s) for sp, s in pairs if s is not None and sp["status"] == "running" and s.last_tool]
                    if live:
                        sp, s = max(live, key=lambda x: x[1].activity())
                        cur = {"tool": tool_label(s.last_tool["name"]), "summary": f"[{sp['description'] or sp['type']}] {s.last_tool['summary']}",
                               "since": iso(s.last_tool["ts"])}
            label_title = tr.title or first_line(tr.first_prompt or "", 90) or (branch or "Session")
            aid = tr.session_id or Path(tr.path).stem
            agent = {
                "id": aid, "kind": "session", "title": label_title, "branch": branch, "cwd": tr.cwd,
                "worktree": (wt or {}).get("name") if wt and not wt.get("is_main") else None,
                "state": code, "state_label": label, "since": iso(since),
                "last_activity": iso(tr.activity()), "started": iso(tr.first_ts), "model": tr.model, "version": tr.version,
                "role": tr.current_role(), "roles_seen": tr.roles_seen(), "phase": phase,
                "current": cur, "last_text": shorten(plain(tr.last_text), 320) if tr.last_text else None,
                "last_prompt": shorten(tr.last_prompt, 200) if tr.last_prompt else None,
                "todos": tr.todo_list()[:30], "subagents": subs, "registry": registry, "tokens": tr.tokens(), "errors": tr.errors,
                "spark": tr.counts(now, sp_start, 60, SPARK_MIN),
                "git": {k: wt[k] for k in ("ahead", "behind", "dirty", "files", "head", "last_commit")} if wt else None,
                "pr": pr,
            }
            agents.append(agent)
            short = branch.replace("worktree-", "") if branch and branch != self.git.main else first_line(label_title, 28)
            trs = [(tr, None)] + [(s, sp) for sp, s in pairs if s is not None]
            buckets = [0] * tl_n
            for t, sp in trs:
                for i, v in enumerate(t.counts(now, tl_start, BUCKET_S, tl_n)):
                    buckets[i] += v
                for ts, kind, text in list(t.events)[-80:]:
                    if now - ts < TIMELINE_S:
                        feed.append({"ts": ts, "agent_id": aid, "agent": short, "sub": sp["description"] if sp else None,
                                     "role": (sp or {}).get("role") or tr.current_role(), "kind": kind, "text": text})
            if any(buckets):
                lanes.append({"agent_id": aid, "label": short, "state": code, "buckets": buckets})
        feed.sort(key=lambda x: x["ts"], reverse=True)
        for f in feed:
            f["ts"] = iso(f["ts"])
        sess_by_wt = {}
        for a in agents:
            sess_by_wt.setdefault(a["branch"], []).append(a["id"])
        worktrees = [dict(w, session_ids=sess_by_wt.get(w["branch"], [])) for w in self.git.worktrees]
        return {
            "mode": "live", "version": VERSION, "generated_at": iso(now),
            "repo": {"path": self.args.repo, "name": Path(self.args.repo).name if self.args.repo else None, "main": self.git.main,
                     "github": self.args.github},
            "sources": {"claude": self.claude.status, "git": self.git.status, "github": self.gh.status},
            "agents": agents, "worktrees": worktrees, "branches": self.git.branches[:20],
            "feed": feed[:120], "github": self.gh.data,
            "timeline": {"from": iso(tl_start), "to": iso(now), "bucket_s": BUCKET_S, "lanes": lanes[:14]},
            "thresholds": {"active_s": ACTIVE_S, "fast_tool_wait_s": FAST_TOOL_WAIT_S, "long_tool_wait_s": LONG_TOOL_WAIT_S,
                           "waiting_max_s": WAITING_MAX_S},
        }

    def tick(self):
        self.claude.refresh()
        state = self.build()
        body = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
        # l'horodatage seul ne justifie pas un envoi : on hache sans lui
        digest = hashlib.sha1(json.dumps({k: v for k, v in state.items() if k not in ("timeline", "generated_at")}, ensure_ascii=False,
                                         sort_keys=True, default=str).encode("utf-8")).hexdigest()
        with self.cond:
            self.payload = body.encode("utf-8")
            if digest != self.digest:
                self.digest = digest
                self.version += 1
                self.cond.notify_all()

    def run_loops(self):
        def collector():
            last_git = 0
            while True:
                t0 = time.time()
                try:
                    if t0 - last_git >= 5:
                        self.git.refresh()
                        last_git = t0
                    self.tick()
                except Exception as exc:  # ne jamais tuer la boucle
                    print(f"[collecte] {exc!r}", file=sys.stderr)
                time.sleep(max(0.2, 2.0 - (time.time() - t0)))

        def github():
            while True:
                try:
                    self.gh.refresh()
                except Exception as exc:
                    print(f"[github] {exc!r}", file=sys.stderr)
                time.sleep(3)

        threading.Thread(target=collector, daemon=True).start()
        threading.Thread(target=github, daemon=True).start()


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------
def make_handler(hub, allowed_hosts):
    class Handler(BaseHTTPRequestHandler):
        server_version = f"STTAgents/{VERSION}"

        def log_message(self, fmt, *a):
            if hub.args.verbose:
                sys.stderr.write("[http] " + fmt % a + "\n")

        def _host_ok(self):
            if allowed_hosts is None:
                return True
            host = (self.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]").lower()
            return host in allowed_hosts

        def _send(self, code, body, ctype):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if not self._host_ok():  # protection contre le DNS rebinding
                return self._send(403, b"Host refuse", "text/plain; charset=utf-8")
            path = self.path.split("?", 1)[0]
            if path in ("/", "/index.html"):
                try:
                    body = (HERE / "index.html").read_bytes()
                except OSError:
                    return self._send(500, "index.html introuvable à côté du serveur".encode("utf-8"), "text/plain; charset=utf-8")
                return self._send(200, body, "text/html; charset=utf-8")
            if path == "/api/state":
                with hub.cond:
                    body = hub.payload
                return self._send(200, body, "application/json; charset=utf-8")
            if path == "/api/stream":
                return self._stream()
            if path == "/favicon.ico":
                return self._send(204, b"", "image/x-icon")
            return self._send(404, b"404", "text/plain")

        def _stream(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            seen = -1
            try:
                self.wfile.write(b"retry: 3000\n\n")
                while True:
                    with hub.cond:
                        if hub.version == seen:
                            hub.cond.wait(timeout=15)
                        changed = hub.version != seen
                        seen, body = hub.version, hub.payload
                    if changed:
                        self.wfile.write(b"event: state\ndata: " + body + b"\n\n")
                    else:
                        self.wfile.write(b"event: ping\ndata: {}\n\n")
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                return

    return Handler


def detect_repo(start):
    out = git(["rev-parse", "--show-toplevel"], str(start))
    return os.path.normpath(out.strip()) if out else None


def detect_github(repo):
    url = (git(["remote", "get-url", "origin"], repo) or "").strip() if repo else ""
    m = re.search(r"github\.com[:/]+([^/]+/[^/]+?)(?:\.git)?/?$", url)
    return m.group(1) if m else None


def main():
    ap = argparse.ArgumentParser(description="Tableau de bord temps réel des agents Claude Code (STT).")
    ap.add_argument("--repo", help="racine du dépôt observé (défaut : dépôt contenant ce script)")
    ap.add_argument("--claude-dir", default=os.environ.get("CLAUDE_CONFIG_DIR") or "~/.claude", help="dossier de config Claude Code (défaut ~/.claude)")
    ap.add_argument("--match", action="append", default=[], help="motif supplémentaire de dossier ~/.claude/projects (répétable)")
    ap.add_argument("--github", help="owner/dépôt GitHub (défaut : remote origin)")
    ap.add_argument("--no-github", action="store_true", help="désactive la source GitHub")
    ap.add_argument("--window", type=float, default=24, help="sessions actives dans les N dernières heures (défaut 24)")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--open", action="store_true", help="ouvre le tableau de bord dans le navigateur")
    ap.add_argument("--once", action="store_true", help="imprime un instantané JSON puis quitte")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    args.repo = os.path.abspath(os.path.expanduser(args.repo)) if args.repo else detect_repo(HERE)
    if args.repo:  # racine réelle du dépôt (et non un sous-dossier)
        args.repo = detect_repo(args.repo) or args.repo
    if not args.github and not args.no_github:
        args.github = detect_github(args.repo)
    hub = Hub(args)

    if args.once:
        hub.git.refresh()
        hub.gh.refresh()
        hub.claude.refresh()
        sys.stdout.reconfigure(encoding="utf-8") if hasattr(sys.stdout, "reconfigure") else None
        print(json.dumps(hub.build(), ensure_ascii=False, indent=2))
        return

    hub.run_loops()
    local = args.host in ("127.0.0.1", "localhost", "::1")
    allowed = {"127.0.0.1", "localhost", "::1"} if local else None
    srv = ThreadingHTTPServer((args.host, args.port), make_handler(hub, allowed))
    srv.daemon_threads = True
    url = f"http://{'127.0.0.1' if local else args.host}:{args.port}/"
    print(f"STT · agents — {url}")
    print(f"  dépôt   : {args.repo or '?'}")
    print(f"  sessions: {hub.claude.projects}  (préfixe {hub.claude.prefix})")
    print(f"  GitHub  : {args.github or 'désactivé'}{' (jeton)' if hub.gh.token else ''}")
    if not local:
        print("  ATTENTION : serveur exposé au réseau, les extraits de transcripts sont lisibles par tout le LAN.")
    if args.open:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt.")


if __name__ == "__main__":
    main()
