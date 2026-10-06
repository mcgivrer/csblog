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
import hmac
import secrets
import hashlib
import base64
import json
import os
import queue
import re
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from collections import deque
from datetime import datetime, timezone
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from stt_notices import NoticeEngine
import stt_runner

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
        self.agent_id = None      # identifiant de sous-agent (agentId)
        self.tool_count = 0
        self.ended_turn = False   # dernier message = texte final (rapport rendu)

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
        if e.get("isSidechain") and not self.is_sub and self.first_ts is None and not self.spawns:
            self.is_sub = True  # fichier entier de sous-agent (agent-<id>.jsonl)
        if e.get("agentId") and not self.agent_id:
            self.agent_id = str(e["agentId"])
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
                self._task_notification(e["content"], ts)
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
                    self._spawn_result(self.spawns[tid], b, e.get("toolUseResult"), ts)
                if tid in self.task_by_tool:
                    m = re.search(r"#(\d+)", block_text(b.get("content")))
                    if m:
                        self.task_by_tool[tid]["id"] = m.group(1)
            elif bt == "text":
                txt = b.get("text") or ""
                if "<task-notification>" in txt:
                    self._task_notification(txt, ts)
                    continue
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
                    if tid in self.spawns and self.spawns[tid]["status"] == "running" and not self.spawns[tid].get("bg"):
                        self.spawns[tid]["status"] = "done"
                    self.pending.pop(tid, None)
                self.first_prompt = self.first_prompt or txt
                self.last_prompt = txt
                self.last_kind = "prompt"
                if len(txt.strip()) >= 60:  # nouvelle demande => nouveau cycle PM→Livré
                    self.phase_start = len(self.roles)
                self.add_event(ts, "prompt", first_line(txt))

    def _spawn_result(self, sp, block, tur, ts):
        text = block_text(block.get("content"))
        tur = tur if isinstance(tur, dict) else {}
        aid = tur.get("agentId") or tur.get("agent_id")
        if not aid:
            m = re.search(r"agent[_ ]?id[\"']?\s*[:=]\s*[\"']?([A-Za-z0-9_-]{4,})", text, re.I)
            aid = m.group(1) if m else None
        if aid:
            sp["agent_id"] = str(aid)
        for k_src, k_dst in (("totalToolUseCount", "tool_count"), ("totalTokens", "total_tokens"), ("totalDurationMs", "duration_ms")):
            if isinstance(tur.get(k_src), (int, float)):
                sp[k_dst] = tur[k_src]
        status = str(tur.get("status") or "").lower()
        background = sp.get("bg") or status in ("async_launched", "running", "launched", "started") or (
            not status and len(text) < 600 and re.search(r"(async|background|arri[èe]re-plan).{0,40}(launch|start|lanc)|launched in the background", text, re.I))
        if block.get("is_error"):
            sp["status"], sp["ended"] = "error", ts
            self.add_event(ts, "spawn_end", f"Agent en erreur · {sp['description']}")
        elif background and status not in ("completed", "done", "failed"):
            sp["bg"] = True  # lancé en arrière-plan : il continue après ce résultat
            self.add_event(ts, "spawn", f"Agent en arrière-plan · {sp['description']}")
        else:
            sp["status"], sp["ended"] = "done", ts
            self.add_event(ts, "spawn_end", f"Agent terminé · {sp['description']}")

    def _spawn_by_agent_id(self, key):
        for sp in self.spawns.values():
            if key and key in (sp.get("agent_id"), sp["id"]):
                return sp
        return None

    def _end_agent(self, sp, status, ts, label):
        """Fin de vie d'un agent (done | error | stopped) ; sans effet s'il n'est plus actif."""
        if sp["status"] == "running":
            sp["status"], sp["ended"] = status, ts
            self.add_event(ts, "spawn_end", f"{label} · {sp['description']}")

    def _task_notification(self, txt, ts):
        """Fin réelle d'un agent d'arrière-plan : <task-notification> (completed | failed | killed)."""
        for blk in re.findall(r"<task-notification>(.*?)</task-notification>", txt, re.S) or [txt]:
            tid, st = re.search(r"<task-id>\s*([^<\s]+)", blk), re.search(r"<status>\s*([^<\s]+)", blk)
            sp = self._spawn_by_agent_id(tid.group(1) if tid else None)
            if not sp:
                continue
            status = st.group(1).lower() if st else "completed"
            if status in ("killed", "stopped"):
                self._end_agent(sp, "stopped", ts, "Agent arrêté")
            elif status in ("failed", "error"):
                self._end_agent(sp, "error", ts, "Agent en erreur")
            else:
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
                self.ended_turn = True
                role = role_from_text(txt)
                if role:
                    self.roles.append((ts, role, "marker"))
                self.add_event(ts, "text", first_line(txt))
            elif bt == "tool_use":
                tid, name, inp = b.get("id"), b.get("name") or "?", b.get("input") or {}
                summ = summarize_tool(name, inp)
                self.pending[tid] = {"name": name, "summary": summ, "ts": ts}
                self.tool_count += 1
                self.ended_turn = False
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
                        "bg": bool(inp.get("run_in_background")), "agent_id": None, "name": inp.get("name"),
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
        bg_live = [sp for sp in self.spawns.values() if sp["status"] == "running" and sp.get("bg")]
        if bg_live and sub_live and not any(p["name"] in SPAWN_TOOLS for p in pend):
            return "running", f"Agents en arrière-plan ({len(sub_live)})", max(s.activity() for s in sub_live)
        if any(p["name"] in SPAWN_TOOLS for p in pend):
            if sub_live:
                return "running", f"Agents au travail ({len(sub_live)})", last
            if age < ACTIVE_S:
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
    """Repère les sessions (agents principaux) et leurs sous-agents, quel que soit le format :
    - <projet>/<session>.jsonl                       session principale
    - <projet>/<session>/subagents/agent-<id>.jsonl  sous-agent (Claude Code 2.1+)
    - <projet>/agent-<id>.jsonl                      sous-agent (Claude Code 2.0, sessionId = parent)
    - lignes isSidechain dans le fichier principal   sous-agent (anciennes versions)
    """

    def __init__(self, claude_dir, repo, window_s, extra_filters, strict=False):
        self.projects = Path(claude_dir).expanduser() / "projects"
        self.repo = repo
        self.prefixes = {claude_slug(repo).lower()} if repo else set()
        self.base = Path(repo).name.lower() if repo and not strict else None
        self.filters = [f.lower() for f in extra_filters]
        self.window_s = window_s
        self.files = {}  # chemin -> Transcript
        self.status = {"ok": False, "dir": str(self.projects), "slug": claude_slug(repo) if repo else None, "dirs": [],
                       "sessions": 0, "subagents": 0, "error": None}

    def add_worktrees(self, paths):
        """Les worktrees peuvent vivre hors du dépôt (ex. app de bureau) : on suit aussi leurs slugs."""
        for p in paths:
            self.prefixes.add(claude_slug(p).lower())

    def _match(self, name):
        n = name.lower()
        return any(n.startswith(p) for p in self.prefixes) or any(f in n for f in self.filters) or bool(self.base and self.base in n)

    def _track(self, path, mtime, now, parent_sid=None):
        tr = self.files.get(path)
        if tr is None:
            if now - mtime > self.window_s:
                return None
            tr = self.files[path] = Transcript(path, is_sub=bool(parent_sid) or os.path.basename(path).startswith("agent-"))
        if parent_sid:
            tr.parent_sid = parent_sid
        tr.poll()
        if tr.is_sub and not getattr(tr, "parent_sid", None):
            tr.parent_sid = tr.session_id  # format 2.0 : sessionId = session parente
        if tr.is_sub and not tr.agent_id:
            stem = os.path.basename(path)[:-6]
            tr.agent_id = stem[6:] if stem.startswith("agent-") else stem
        return tr

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
                try:
                    if f.is_file() and f.name.endswith(".jsonl"):
                        if self._track(f.path, f.stat().st_mtime, now):
                            seen.add(f.path)
                    elif f.is_dir():
                        sub_dir = os.path.join(f.path, "subagents")
                        if os.path.isdir(sub_dir):
                            for sf in os.scandir(sub_dir):
                                if sf.is_file() and sf.name.endswith(".jsonl"):
                                    if self._track(sf.path, sf.stat().st_mtime, now, parent_sid=f.name):
                                        seen.add(sf.path)
                except OSError:
                    continue
        for p in list(self.files):  # oubli des transcripts sortis de la fenêtre
            if p not in seen and now - self.files[p].activity() > self.window_s:
                del self.files[p]
        mains = self.mains()
        hint = None
        if not dirs:
            hint = f"Aucun dossier de {self.projects} ne correspond au dépôt (préfixe « {self.status['slug']} ») : lancez les agents depuis ce clone, ou utilisez --repo / --match."
        elif not mains:
            hint = f"{len(dirs)} dossier(s) trouvé(s) mais aucune session active depuis {self.window_s / 3600:g} h (option --window)."
        self.status.update(ok=True, dirs=[d.name for d in dirs], sessions=len(mains),
                           subagents=sum(1 for t in self.files.values() if t.is_sub), error=hint)

    def mains(self):
        return [t for t in self.files.values() if not t.is_sub]

    def subagents_of(self, main):
        """Associe chaque appel Task/Agent à son transcript de sous-agent ; ajoute les orphelins."""
        sid = main.session_id or Path(main.path).stem
        files = [s for s in self.files.values() if s.is_sub and getattr(s, "parent_sid", None) == sid]
        norm = lambda x: re.sub(r"\s+", " ", x or "").strip()[:160]
        used, links = set(), {}
        spawns = [main.spawns[k] for k in main.spawn_order]
        for sp in spawns:  # 1. identifiant d'agent
            for s in files:
                if id(s) not in used and sp.get("agent_id") and s.agent_id and (s.agent_id == sp["agent_id"] or s.agent_id.endswith(sp["agent_id"])):
                    links[sp["id"]] = s
                    used.add(id(s))
                    break
        for sp in spawns:  # 2. consigne identique
            if sp["id"] in links:
                continue
            for s in files:
                if id(s) not in used and norm(s.first_prompt) and norm(s.first_prompt) == norm(sp["prompt"]):
                    links[sp["id"]] = s
                    used.add(id(s))
                    break
        for sp in spawns:  # 3. lignes isSidechain du fichier principal, 4. proximité temporelle
            if sp["id"] in links:
                continue
            if sp["id"] in main.side:
                links[sp["id"]] = main.side[sp["id"]]
                continue
            best = None
            for s in files:
                if id(s) in used or not s.first_ts or not sp["started"]:
                    continue
                gap = s.first_ts - sp["started"]
                if -5 <= gap <= 60 and (best is None or gap < best[0]):
                    best = (gap, s)
            if best:
                links[sp["id"]] = best[1]
                used.add(id(best[1]))
        out = []
        for sp in spawns:
            tr = links.get(sp["id"])
            if tr is not None:
                tr.status_hint = sp["status"]
            out.append((sp, tr))
        for s in sorted(files, key=lambda t: t.first_ts or 0):  # sous-agents sans appel retrouvé
            if id(s) not in used:
                desc = first_line(s.first_prompt or "", 60) or "Agent"
                age = time.time() - s.activity()
                live = age < ACTIVE_S or (not s.ended_turn and age < WAITING_MAX_S)
                out.append(({"id": s.path, "description": desc, "type": "?", "role": role_from_agent("", desc), "prompt": "",
                             "started": s.first_ts, "ended": None if live else s.last_ts, "status": "running" if live else "done",
                             "bg": False, "agent_id": s.agent_id, "name": None}, s))
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


def recent_events(tr, n):
    return [{"ts": iso(ts), "kind": k, "text": t} for ts, k, t in list(tr.events)[-n:]][::-1]


# ---------------------------------------------------------------------------
# Assemblage de l'état
# ---------------------------------------------------------------------------
class Hub:
    def __init__(self, args):
        self.args = args
        self.claude = ClaudeCollector(args.claude_dir, args.repo, args.window * 3600, args.match, args.strict)
        self.git = GitCollector(args.repo)
        self.gh = GitHubCollector(None if args.no_github else args.github, os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN"))
        self.cond = threading.Condition()
        self.version = 0
        self.payload = b"{}"
        self.digest = None
        self.notices = NoticeEngine()
        self.runner = None   # RunnerGlue si --runner
        self.tasks = None    # TaskService (création de tâches), RunnerGlue si --runner

    def build(self):
        now = time.time()
        prs = self.gh.data.get("prs", [])
        agents, feed = [], []
        tl_start = now - TIMELINE_S
        tl_n = TIMELINE_S // BUCKET_S
        sp_start = now - SPARK_MIN * 60
        lanes = []
        for tr in sorted(self.claude.mains(), key=lambda t: -t.activity()):
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
            subs = [self.sub_view(sp, st, now, sp_start) for sp, st in pairs]
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
                "tool_count": tr.tool_count, "recent": recent_events(tr, 8),
                "subagents_running": sum(1 for x in subs if x["status"] == "running"),
                "spark": tr.counts(now, sp_start, 60, SPARK_MIN),
                "git": {k: wt[k] for k in ("ahead", "behind", "dirty", "files", "head", "last_commit")} if wt else None,
                "pr": pr,
            }
            agents.append(agent)
            short = branch.replace("worktree-", "") if branch and branch != self.git.main else first_line(label_title, 28)
            main_buckets = tr.counts(now, tl_start, BUCKET_S, tl_n)
            sub_lanes = []
            for (sp, st), sv in zip(pairs, subs):
                if st is None:
                    continue
                bk = st.counts(now, tl_start, BUCKET_S, tl_n)
                if any(bk):
                    sub_lanes.append({"agent_id": aid, "sub_id": sp["id"], "sub": True, "label": shorten(sp["description"] or sp["type"], 26),
                                      "role": sv["role"], "state": sv["state"], "buckets": bk})
            if any(main_buckets) or sub_lanes:
                lanes.append({"agent_id": aid, "label": short, "state": code, "role": tr.current_role(), "buckets": main_buckets})
                lanes.extend(sub_lanes)
            for t, sp in [(tr, None)] + [(st, sp) for sp, st in pairs if st is not None]:
                for ts, kind, text in list(t.events)[-80:]:
                    if now - ts < TIMELINE_S:
                        feed.append({"ts": ts, "agent_id": aid, "agent": short, "sub": sp["description"] if sp else None,
                                     "sub_id": sp["id"] if sp else None,
                                     "role": (sp or {}).get("role") or tr.current_role(), "kind": kind, "text": text})
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
            "timeline": {"from": iso(tl_start), "to": iso(now), "bucket_s": BUCKET_S, "lanes": lanes[:32]},
            "thresholds": {"active_s": ACTIVE_S, "fast_tool_wait_s": FAST_TOOL_WAIT_S, "long_tool_wait_s": LONG_TOOL_WAIT_S,
                           "waiting_max_s": WAITING_MAX_S},
        }

    @staticmethod
    def sub_view(sp, s, now, sp_start):
        """Vue d'un sous-agent : statut propre, outil en cours, derniers messages, tokens."""
        status = sp["status"]
        if status == "running" and s is not None:
            code, label, since = s.state(now, [])
            if code == "waiting":  # un sous-agent ne s'adresse pas à l'utilisateur : texte final = rapport rendu
                code, label = "done", "Rapport rendu"
                status = "done" if sp.get("bg") else status
            elif code == "idle":
                code, label = "idle", "Silencieux"
        elif status == "running":
            code, label, since = "running", "Démarre…", sp["started"]
        elif status == "error":
            code, label, since = "error", "En erreur", sp["ended"]
        elif status == "stopped":
            code, label, since = "stopped", "Arrêté", sp["ended"]
        else:
            code, label, since = "done", "Terminé", sp["ended"] or (s.last_ts if s else None)
        cur = None
        if s is not None and s.pending and status == "running":
            p = sorted(s.pending.values(), key=lambda x: x["ts"] or 0)[-1]
            cur = {"tool": tool_label(p["name"]), "summary": p["summary"], "since": iso(p["ts"])}
        end = sp["ended"] or (now if status == "running" else (s.last_ts if s else None))
        tok = s.tokens() if s else None
        act = s.activity() if s else (sp["started"] or 0)
        silent = status == "running" and bool(act) and now - act > SILENT_S   # sans sortie depuis SILENT_S : à arrêter
        lifecycle = {"running": "silencieux" if silent else "actif", "done": "rapport rendu", "stopped": "arrêté", "error": "erreur"}.get(status, status)
        return {
            "lifecycle": lifecycle, "silent": silent, "messages": sp.get("messages", 0),
            "id": sp["id"], "agent_id": sp.get("agent_id") or (s.agent_id if s else None), "name": sp.get("name"),
            "description": sp["description"] or sp["type"], "type": sp["type"],
            "role": sp["role"] or (s.current_role() if s else None), "status": status, "bg": bool(sp.get("bg")),
            "state": code, "state_label": label, "since": iso(since), "started": iso(sp["started"]), "ended": iso(sp["ended"]),
            "duration_s": round(end - sp["started"]) if end and sp["started"] else None,
            "current": cur, "last_tool": dict(s.last_tool, ts=iso(s.last_tool["ts"])) if s and s.last_tool else None,
            "last_text": shorten(plain(s.last_text), 240) if s and s.last_text else None,
            "tool_count": s.tool_count if s else sp.get("tool_count"),
            "tokens": {"output": tok["output"], "context": tok["context"]} if tok else None, "total_tokens": sp.get("total_tokens"),
            "model": s.model if s else None, "spark": s.counts(now, sp_start, 60, SPARK_MIN) if s else None,
            "todos": s.todo_list()[:20] if s else [], "recent": recent_events(s, 6) if s else [],
            "has_transcript": s is not None, "last_activity": iso(s.activity()) if s else iso(sp["ended"] or sp["started"]),
        }

    def tick(self):
        self.claude.refresh()
        state = self.build()
        gh = state.get("github") or {}
        self.notices.observe(state["agents"], gh["prs"] if "prs" in gh else None)
        state["notices"], state["notice_seq"] = self.notices.recent(50), self.notices.seq
        state["runner"] = runner_payload(self.runner)
        body = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
        # l'horodatage seul ne justifie pas un envoi : on hache sans lui (ni la durée active des runs, qui change à chaque tick)
        hashed = {k: v for k, v in state.items() if k not in ("timeline", "generated_at")}
        hashed["runner"] = dict(state["runner"], runs=[{k: v for k, v in r.items() if k != "active_s"} for r in state["runner"].get("runs", [])])
        digest = hashlib.sha1(json.dumps(hashed, ensure_ascii=False, sort_keys=True, default=str).encode("utf-8")).hexdigest()
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
                        self.claude.add_worktrees(w["path"] for w in self.git.worktrees)
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
# Kanban : écriture de plan-status.js sur ordre du chef de projet (stt-cp)
# ---------------------------------------------------------------------------
# Le CP ne modifie plus le fichier à la main ni par un agent DEV : il envoie des opérations à cet outil
# (POST /api/kanban, ou --kanban-apply fichier.json). Le fichier est édité ligne à ligne (une tâche = une
# ligne), validé avec Node, puis remplacé atomiquement. Toujours dans le checkout PRINCIPAL, jamais un worktree.
# Chemin des données du Kanban, relatif au checkout PRINCIPAL (jamais un worktree).
KANBAN_REL = "demos/space-travel/stt-agents/data/plan-status.js"
# Documents affichés par le Kanban (aperçu, liens) : les chemins de plan-status.js sont relatifs à KANBAN_DOC_BASE
# (depuis la racine du dépôt) ; le serveur les cherche dans KANBAN_DOC_ROOTS, dans l'ordre. Chaque racine est relative
# au checkout principal : "" = le checkout principal lui-même ; un worktree permet d'afficher un document pas encore fusionné
# dans main (bandeau « version du worktree » dans l'aperçu). À retirer de la liste une fois la branche fusionnée.
KANBAN_DOC_BASE = "demos/space-travel/"
KANBAN_DOC_ROOTS = [
    ".claude/worktrees/adr-001-refactoring/",   # ADR-001 amendé (PR #26)
    ".claude/worktrees/stt-L2a/",               # contrat L2a (branche worktree-stt-L2a)
    "",                                          # checkout principal
]
KANBAN_DOC_MAX = 25 * 1024 * 1024
KANBAN_DOC_DENY = {".git", "node_modules", "__pycache__"}
KANBAN_LOCK = threading.Lock()
KANBAN_SECTIONS = ("lots", "tasks", "decisions", "journal")
KANBAN_TOP = ("updated", "spec", "currentLot")


class KanbanError(Exception):
    pass


def main_checkout(repo):
    """Racine du checkout principal (premier worktree de git) ; à défaut, le dépôt donné."""
    out = git(["worktree", "list", "--porcelain"], repo) if repo else None
    m = re.search(r"^worktree (.+)$", out or "", re.M)
    return m.group(1).strip() if m else repo


def find_kanban(repo, explicit=None):
    """Chemin de plan-status.js : --kanban, sinon le checkout principal."""
    if explicit:
        return os.path.abspath(os.path.expanduser(explicit))
    root = main_checkout(repo)
    return os.path.join(root, *KANBAN_REL.split("/")) if root else None


def find_doc(main_root, rel):
    """(fichier, racine) d'un document du Kanban : première racine de KANBAN_DOC_ROOTS qui le contient, sinon (None, None)."""
    parts = [x for x in rel.split("/") if x]
    if not parts or any(x in ("..", ".") or "\\" in x or "\0" in x or x in KANBAN_DOC_DENY for x in parts):
        return None, None
    for root in KANBAN_DOC_ROOTS:
        base = Path(main_root, *[x for x in root.split("/") if x]).resolve()
        cand = base.joinpath(*parts).resolve()
        try:
            cand.relative_to(base)
        except ValueError:
            continue
        if cand.is_file():
            return cand, root
    return None, None


def _js(v):
    return json.dumps(v, ensure_ascii=False)


def _scan_obj(line):
    """Champs de premier niveau d'un objet JS sur une ligne : [(clé, début clé, début valeur, fin valeur)], indice de '}'."""
    start = line.index("{")
    close = line.rindex("}")
    i, out = start + 1, []
    while i < close:
        while i < close and line[i] in " ,\t":
            i += 1
        if i >= close:
            break
        ks = i
        if line[i] in "\"'":
            q = line[i]
            i += 1
            while line[i] != q:
                i += 2 if line[i] == "\\" else 1
            key = line[ks + 1:i]
            i += 1
        else:
            while line[i] != ":":
                i += 1
            key = line[ks:i].strip()
        while line[i] != ":":
            i += 1
        i += 1
        while line[i] == " ":
            i += 1
        vs, depth = i, 0
        while i < close:
            c = line[i]
            if c in "\"'":
                q = c
                i += 1
                while line[i] != q:
                    i += 2 if line[i] == "\\" else 1
            elif c in "[{(":
                depth += 1
            elif c in "]})":
                depth -= 1
            elif c == "," and depth == 0:
                break
            i += 1
        out.append((key, ks, vs, len(line[:i].rstrip())))
    return out, close


def _row_get(line, key):
    fields, _ = _scan_obj(line)
    for k, _ks, vs, ve in fields:
        if k == key:
            raw = line[vs:ve]
            try:
                return json.loads(raw)
            except ValueError:
                return raw
    return None


def _row_set(line, key, value):
    fields, close = _scan_obj(line)
    lit = _js(value)
    for k, _ks, vs, ve in fields:
        if k == key:
            return line[:vs] + lit + line[ve:]
    return line[:close].rstrip() + f", {key}: {lit} " + line[close:]


def _row_unset(line, key):
    fields, _ = _scan_obj(line)
    for n, (k, ks, _vs, ve) in enumerate(fields):
        if k == key:
            if n < len(fields) - 1:
                return line[:ks] + line[fields[n + 1][1]:]
            prev_end = fields[n - 1][3] if n else ks
            return line[:prev_end] + line[ve:]
    return line


def _section(lines, name):
    """(première ligne de données, ligne de fermeture) d'une section `name: [ … ]` du fichier."""
    for i, ln in enumerate(lines):
        if re.match(rf"^  {name}: \[\s*$", ln):
            for j in range(i + 1, len(lines)):
                if re.match(r"^  \],?\s*$", lines[j]):
                    return i + 1, j
    raise KanbanError(f"section « {name} » introuvable dans plan-status.js")


def _find_row(lines, section, ident):
    a, b = _section(lines, section)
    key = "n" if section == "decisions" else "id"
    for i in range(a, b):
        if lines[i].lstrip().startswith("{") and _row_get(lines[i], key) == ident:
            return i
    raise KanbanError(f"{section} : « {ident} » introuvable")


def _render_row(d):
    return "    { " + ", ".join(f"{k}: {_js(v)}" for k, v in d.items()) + " }"


def _with_comma(lines, idx):
    """Assure la virgule finale de la ligne idx (avant l'ajout d'une ligne suivante)."""
    if not lines[idx].rstrip().endswith(","):
        lines[idx] = lines[idx].rstrip() + ","


def _num(v):
    return v if isinstance(v, (int, float)) else 0


RUNNER_RESERVED = ("runner", "session", "runState", "started", "ended")


def _check_reserved(op):
    """Refuse les clés réservées au lanceur dans une opération venue de l'extérieur."""
    kind = op.get("op")
    keys = set()
    if kind in ("task", "lot", "decision_set"):
        for part in ("set", "add"):
            keys |= set((op.get(part) or {}).keys())
        keys |= set(op.get("unset") or [])
    elif kind == "task_add":
        keys |= set((op.get("task") or {}).keys())
    bad = keys & set(RUNNER_RESERVED)
    if "inst" in keys and ("runner" in keys or (kind == "task_add" and (op.get("task") or {}).get("runner"))):
        bad.add("inst")
    if bad:
        raise KanbanError("clés réservées au lanceur : " + ", ".join(sorted(bad)))


def _apply_op(lines, op, now, log):
    kind = op.get("op")
    if kind in ("task", "lot", "decision_set"):
        section = {"task": "tasks", "lot": "lots", "decision_set": "decisions"}[kind]
        idx = _find_row(lines, section, op.get("n") if kind == "decision_set" else op.get("id"))
        ln, before = lines[idx], {}
        sets = dict(op.get("set") or {})
        if kind == "task" and "updated" not in sets:
            sets["updated"] = now
        for k, v in sets.items():
            before[k] = _row_get(ln, k)
            ln = _row_set(ln, k, v)
        for k, v in (op.get("add") or {}).items():  # cumul : used, ms (None compté 0)
            before[k] = _row_get(ln, k)
            ln = _row_set(ln, k, _num(before[k]) + _num(v))
        for k in op.get("unset") or []:
            before[k] = _row_get(ln, k)
            ln = _row_unset(ln, k)
        lines[idx] = ln
        entry = {"op": kind, "id": op.get("id", op.get("n")), "avant": before}
        if kind == "task":
            entry["status"] = _row_get(ln, "status")  # nouveau statut (notices du Kanban)
        log.append(entry)
    elif kind == "task_add":
        task = op.get("task") or {}
        if not task.get("id") or not task.get("lot"):
            raise KanbanError("task_add : id et lot obligatoires")
        a, b = _section(lines, "tasks")
        if any(lines[i].lstrip().startswith("{") and _row_get(lines[i], "id") == task["id"] for i in range(a, b)):
            raise KanbanError(f"task_add : « {task['id']} » existe déjà")
        task.setdefault("updated", now)
        last = max([i for i in range(a, b) if lines[i].lstrip().startswith("{") and _row_get(lines[i], "lot") == task["lot"]] or [b - 1])
        _with_comma(lines, last)
        lines.insert(last + 1, _render_row(task) + ("," if last + 1 < b else ""))
        log.append({"op": "task_add", "id": task["id"]})
    elif kind == "lot_add":
        lot = op.get("lot") or {}
        if not lot.get("id") or not lot.get("title"):
            raise KanbanError("lot_add : id et title obligatoires")
        a, b = _section(lines, "lots")
        if any(lines[i].lstrip().startswith("{") and _row_get(lines[i], "id") == lot["id"] for i in range(a, b)):
            raise KanbanError(f"lot_add : « {lot['id']} » existe déjà")
        _with_comma(lines, b - 1)
        lines.insert(b, _render_row(lot))
        log.append({"op": "lot_add", "id": lot["id"]})
    elif kind == "decision":
        a, b = _section(lines, "decisions")
        n = op.get("n")
        if not isinstance(n, int) or not op.get("subject"):
            raise KanbanError("decision : n (entier) et subject obligatoires")
        row = {"n": n, "subject": op["subject"], "status": op.get("status", "à valider")}
        for k in ("ref", "reft"):   # ref : « chemin#ancre » relatif à demos/space-travel/ ; reft : libellé court du lien
            if op.get(k):
                row[k] = op[k]
        _with_comma(lines, b - 1)
        lines.insert(b, _render_row(row))
        log.append({"op": "decision", "n": n})
    elif kind == "journal":
        if not op.get("text"):
            raise KanbanError("journal : text obligatoire")
        a, b = _section(lines, "journal")
        _with_comma(lines, b - 1)
        lines.insert(b, _render_row({"at": op.get("at") or now[:10], "text": op["text"]}))
        log.append({"op": "journal"})
    elif kind == "top":
        for k, v in (op.get("set") or {}).items():
            if k not in KANBAN_TOP:
                raise KanbanError(f"top : clé « {k} » non modifiable ({', '.join(KANBAN_TOP)})")
            for i, ln in enumerate(lines):
                if re.match(rf"^  {k}:", ln):
                    lines[i] = f"  {k}: {_js(v)}," if ln.rstrip().endswith(",") else f"  {k}: {_js(v)}"
                    break
            else:
                raise KanbanError(f"top : « {k} » introuvable")
        log.append({"op": "top", "set": list((op.get('set') or {}).keys())})
    elif kind == "history_snapshot":
        la, lb = _section(lines, "lots")
        ta, tb = _section(lines, "tasks")
        est = sum(_num(_row_get(lines[i], "budget")) for i in range(la, lb) if lines[i].lstrip().startswith("{"))
        used = sum(_num(_row_get(lines[i], "used")) for i in range(ta, tb) if lines[i].lstrip().startswith("{"))
        snap = "{ " + f'at:"{op.get("at") or now}", est:{op.get("est", est)}, used:{op.get("used", used)}' + " }"
        for i, ln in enumerate(lines):
            if re.match(r"^  history: \[", ln):
                m = re.match(r"^(  history: \[.*?)\s*\](,?)\s*$", ln)
                if not m:
                    raise KanbanError("history : format inattendu")
                lines[i] = f"{m.group(1)}, {snap} ]{m.group(2)}"
                break
        else:
            raise KanbanError("history introuvable")
        log.append({"op": "history_snapshot", "est": est, "used": used})
    else:
        raise KanbanError(f"opération inconnue : {kind!r}")


def _validate_node(path):
    """Charge le fichier avec Node (même contrôle que la règle du CP) ; renvoie (tâches, lots, journal)."""
    code = "global.window={};require(process.argv[1]);const p=window.PLAN;console.log([p.tasks.length,p.lots.length,p.journal.length].join(','))"
    try:
        r = subprocess.run(["node", "-e", code, path], capture_output=True, text=True, timeout=20, creationflags=NO_WINDOW)
    except (OSError, subprocess.SubprocessError) as exc:
        raise KanbanError(f"validation Node impossible : {exc}")
    if r.returncode != 0:
        raise KanbanError("plan-status.js invalide après modification : " + (r.stderr.strip().splitlines() or ["?"])[-1][:200])
    return [int(x) for x in r.stdout.strip().split(",")]


def kanban_apply(path, ops, dry_run=False, allow_reserved=False):
    """Applique une liste d'opérations ; tout ou rien. Renvoie le compte rendu."""
    if not path or not os.path.isfile(path):
        raise KanbanError(f"plan-status.js introuvable : {path}")
    if not isinstance(ops, list) or not ops:
        raise KanbanError("ops : liste non vide attendue")
    with KANBAN_LOCK:
        text = Path(path).read_text(encoding="utf-8")
        eol = "\r\n" if "\r\n" in text else "\n"
        lines = text.replace("\r\n", "\n").split("\n")
        now = time.strftime("%Y-%m-%d %H:%M")
        m = re.search(r'^  updated: "(\d{4}-\d\d-\d\d \d\d:\d\d)"', text, re.M)
        if m and m.group(1) > now:  # le fichier peut déjà porter une date plus tardive : l'horodatage ne recule jamais
            now = m.group(1)
        log = []
        for op in ops:
            if not isinstance(op, dict):
                raise KanbanError("chaque opération est un objet JSON")
            if not allow_reserved:
                _check_reserved(op)
            _apply_op(lines, op, now, log)
        if not any(o.get("op") == "top" and "updated" in (o.get("set") or {}) for o in ops):
            _apply_op(lines, {"op": "top", "set": {"updated": now}}, now, [])
        tmp = path + ".tmp"
        Path(tmp).write_text(eol.join(lines), encoding="utf-8", newline="")
        try:
            counts = _validate_node(tmp)
            if dry_run:
                os.remove(tmp)
            else:
                os.replace(tmp, path)
        except Exception:
            if os.path.exists(tmp):
                os.remove(tmp)
            raise
        return {"ok": True, "path": path, "dry_run": dry_run, "tasks": counts[0], "lots": counts[1],
                "journal": counts[2], "changes": log}


def kanban_summary(path):
    if not path or not os.path.isfile(path):
        return {"ok": False, "path": path, "error": "plan-status.js introuvable"}
    counts = _validate_node(path)
    return {"ok": True, "path": path, "tasks": counts[0], "lots": counts[1], "journal": counts[2]}


# ---------------------------------------------------------------------------
# Lanceur d'agents : colle entre stt_runner.Runner, le Kanban, les notices et HTTP (T1.4)
# ---------------------------------------------------------------------------
RUNNER_OFF_REASON = "lanceur désactivé : démarrer le serveur avec --runner"
BODY_MAX = 512 * 1024
INPUT_BODY_MAX = 64 * 1024
RUN_ACTIONS = ("enqueue", "pause", "resume", "stop", "kill", "cancel")
LIVE_KANBAN = ("running", "waiting")
ENDED_STATES = ("done", "failed", "stopped", "killed")


class HttpError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code, self.message = code, message


def runner_payload(glue):
    """Contenu de GET /api/runner (et de state.runner)."""
    if glue is None or glue.runner is None:
        return {"enabled": False, "reason": RUNNER_OFF_REASON}
    out = glue.runner.snapshot()
    out["enabled"] = True
    return out


def local_iso(ts):
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(ts)) if ts else None


def read_plan(path):
    """Lit plan-status.js avec Node : échelle, ids des lots, lignes des tâches."""
    code = ("global.window={};require(process.argv[1]);const p=window.PLAN;"
            "console.log(JSON.stringify({scale:p.scale||{},lots:p.lots.map(l=>l.id),tasks:p.tasks}))")
    try:
        r = subprocess.run(["node", "-e", code, path], capture_output=True, text=True, timeout=20, creationflags=NO_WINDOW)
        if r.returncode != 0:
            raise KanbanError("lecture de plan-status.js impossible : " + (r.stderr.strip().splitlines() or ["?"])[-1][:200])
        return json.loads(r.stdout)
    except (OSError, subprocess.SubprocessError, ValueError) as exc:
        raise KanbanError(f"lecture de plan-status.js impossible : {exc}")


def kanban_row_value(path, ident, key):
    try:
        lines = Path(path).read_text(encoding="utf-8").replace("\r\n", "\n").split("\n")
        return _row_get(lines[_find_row(lines, "tasks", ident)], key)
    except (OSError, KanbanError):
        return None


def write_atomic(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


class TaskService:
    """Création de tâches (POST /api/tasks) ; fonctionne aussi sans lanceur (autostart refusé)."""
    runner = None

    def __init__(self, hub, args):
        self.hub, self.args = hub, args
        self.root = args.main_root or args.repo
        self.state_dir = os.path.join(self.root, ".claude", "stt-runner")
        self.prompts_dir = os.path.join(os.path.dirname(args.kanban), "prompts")
        self._validator = stt_runner.Runner(self.state_dir, self.root)  # simple jeu de règles, aucun effet de bord
        self._create_lock = threading.Lock()

    def create_task(self, body):
        if not isinstance(body, dict):
            raise HttpError(400, "objet JSON attendu")
        lot, agent = body.get("lot"), body.get("agent")
        model, cx = body.get("model"), body.get("cx")
        title, prompt = body.get("title"), body.get("prompt")
        perm = body.get("perm", "acceptEdits")
        prio = body.get("prio", 2)
        worktree = body.get("worktree") or None
        autostart = body.get("autostart", False)
        if not isinstance(autostart, bool):
            raise HttpError(400, "autostart : booléen attendu")
        if not isinstance(title, str) or not title.strip() or len(title) > 200:
            raise HttpError(400, "title : texte de 1 à 200 caractères")
        if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 200 * 1024:
            raise HttpError(400, "prompt : texte Markdown de 1 à 200 Kio")
        if agent not in ("dev", "archi", "revue"):
            raise HttpError(400, "agent : dev, archi ou revue")
        docs = body.get("docs")
        if docs is not None:
            ok = (isinstance(docs, list) and len(docs) <= 30 and all(
                isinstance(d, dict) and isinstance(d.get("f"), str) and d.get("r") in ("lu", "modifié", "créé")
                and ".." not in d["f"].split("/") and not d["f"].startswith("/") and "\\" not in d["f"] and "\0" not in d["f"]
                for d in docs))
            if not ok:
                raise HttpError(400, "docs : liste de {f, r} (r : lu, modifié ou créé)")
            docs = [{"f": d["f"], "r": d["r"]} for d in docs]
        if not isinstance(lot, str) or not re.match(r"^[A-Za-z0-9][A-Za-z0-9._-]*$", lot):
            raise HttpError(400, "lot invalide")
        if not isinstance(cx, str):
            raise HttpError(400, "cx invalide")
        if autostart and self.runner is None:
            raise HttpError(409, RUNNER_OFF_REASON)
        wt = None
        try:
            if worktree is not None:
                if not isinstance(worktree, str):
                    raise HttpError(400, "worktree invalide")
                wt = stt_runner.validate_worktree(worktree)
            # mêmes contrôles que l'enqueue, avant d'écrire quoi que ce soit
            self._validator._validate("x.0", agent, model, perm, prio,
                                      wt or stt_runner.WORKTREE_PREFIX + "stt-" + lot, lot, None)
        except (stt_runner.ValidationError, TypeError) as exc:
            raise HttpError(400, str(exc))
        with self._create_lock:
            try:
                plan = read_plan(self.args.kanban)
                if lot not in plan["lots"]:
                    raise HttpError(400, f"lot inconnu : {lot}")
                if cx not in plan["scale"]:
                    raise HttpError(400, "cx : " + ", ".join(plan["scale"]))
                budget = int(plan["scale"][cx]["tokens"])
                suffixes = [int(m.group(1)) for t in plan["tasks"]
                            for m in [re.match(rf"^{re.escape(lot)}\.(\d+)$", str(t.get("id")))] if m]
                tid = f"{lot}.{max(suffixes or [0]) + 1}"
                rel = f"stt-agents/data/prompts/{tid}.md"
                row = {"id": tid, "lot": lot, "title": title.strip(), "agent": agent, "model": model, "status": "todo",
                       "progress": 0, "budget": budget, "est0": budget, "cx": cx, "prompt": rel}
                if prio != 2:
                    row["prio"] = prio
                if wt:
                    row["worktree"] = wt
                if perm != "acceptEdits":
                    row["perm"] = perm
                if docs:
                    row["docs"] = docs
                if autostart:
                    row["runner"] = "auto"
                ppath = os.path.join(self.prompts_dir, tid + ".md")
                write_atomic(ppath, prompt if prompt.endswith("\n") else prompt + "\n")
                try:
                    out = kanban_apply(self.args.kanban, [{"op": "task_add", "task": row}], allow_reserved=True)
                except Exception:
                    os.remove(ppath)
                    raise
            except KanbanError as exc:
                raise HttpError(400, str(exc))
        self.hub.notices.kanban_changes(out.get("changes"))
        if autostart:
            try:
                self.runner.enqueue(tid, agent, model, perm, prio, wt, lot, None, budget)
            except stt_runner.RunnerError as exc:
                raise HttpError(409, f"tâche {tid} créée mais non mise en file : {exc}")
        return {"ok": True, "id": tid, "budget": budget, "prompt": rel}


class RunnerGlue(TaskService):
    """Un Runner + écriture Kanban (file sérialisée, hors du verrou du lanceur) + notices."""

    def __init__(self, hub, args, command=None, **runner_kw):
        super().__init__(hub, args)
        self.runner = stt_runner.Runner(self.state_dir, self.root, command=command, on_change=self.on_change,
                                        tokens_of=self.tokens_of, turn_ended_of=self.turn_ended_of, **runner_kw)
        self._validator = self.runner
        self._last = {}            # tâche -> dernier état vu (détecte les vrais changements)
        self._priming = False
        self._q = queue.Queue()
        self._writer = None

    # -- cycle de vie ---------------------------------------------------------
    def start(self):
        self._priming = True
        try:
            self.runner.load_state()
        finally:
            self._priming = False
        for r in list(self.runner.runs.values()):
            if r.state == "orphan":
                self._notices(r)
            elif r.state == "stopped" and r.note and "disparu" in r.note:
                self._q.put(self._job(r))
        self._writer = threading.Thread(target=self._writer_loop, name="stt-kanban-writer", daemon=True)
        self._writer.start()
        self.runner.start_thread()

    def shutdown(self):
        self.runner.shutdown()
        self._q.put(None)
        if self._writer:
            self._writer.join(10)

    # -- transcripts ------------------------------------------------------------
    def _transcript(self, run):
        for tr in list(self.hub.claude.files.values()):
            if tr.is_sub:
                continue
            if tr.session_id == run.session or Path(tr.path).stem == run.session:
                return tr
        return None

    def tokens_of(self, run):
        tr = self._transcript(run)
        if tr is None:
            return 0
        t = tr.tokens()
        return int(t["input"] + t["output"] + t["cache_write"])

    def turn_ended_of(self, run):
        tr = self._transcript(run)
        return bool(tr is not None and tr.ended_turn and tr.last_kind == "text")

    # -- crochet on_change : appelé sous le verrou du Runner, donc rapide et sans E/S ------------
    def on_change(self, run):
        prev = self._last.get(run.task)
        self._last[run.task] = run.state
        if self._priming or prev == run.state:
            return
        self._notices(run)
        self._q.put(self._job(run))

    def _notices(self, run):
        task, st = run.task, run.state
        tgt = {"type": "task", "id": task}
        who = f"{task} ({run.agent} {run.model})"
        emit = self.hub.notices.emit
        kr = int(run.started or 0)
        if st == "starting":
            emit("runner_started", "runner", "info", "Agent lancé", who, tgt, f"runner_started:{task}:{kr}")
        elif st == "waiting":
            emit("runner_waiting", "runner", "attention", "Agent en attente", who, tgt, f"runner_waiting:{task}")
        elif st == "done":
            emit("runner_done", "runner", "success", "Agent terminé", who, tgt, f"runner_done:{task}:{kr}")
        elif st == "failed":
            emit("runner_failed", "runner", "error", "Agent en échec", f"{who} : {run.note or ''}", tgt, f"runner_failed:{task}:{kr}")
        elif st in ("stopped", "killed"):
            emit("runner_" + st, "runner", "info", "Agent arrêté" if st == "stopped" else "Agent tué", who, tgt,
                 f"runner_{st}:{task}:{kr}:{int(run.ended or 0)}")
        elif st == "paused" and "budget" in (run.note or ""):
            emit("runner_budget", "runner", "attention", "Pause budget", f"{who} : {run.note}", tgt, f"runner_budget:{task}:{kr}")
        elif st == "orphan":
            emit("runner_orphan", "runner", "attention", "Agent orphelin détecté", f"{who} : seul kill est permis", tgt,
                 f"runner_orphan:{task}")

    def _job(self, run):
        st = run.state
        job = {"task": run.task, "set": {"runState": st}, "add": {}, "unset": [], "status": None, "note": None}
        s = job["set"]
        if st == "queued":
            s["runner"] = "auto"
        elif st == "starting":
            s.update(runner="auto", started=local_iso(run.started), session=run.session)
            if run.agent == "dev" and run.inst:
                s["inst"] = run.inst
            job["unset"].append("ended")
            job["status"] = "doing"
        elif st in LIVE_KANBAN:
            job["status"] = "doing"
        elif st == "paused" and "budget" in (run.note or ""):
            job["status"], job["note"] = "blocked", run.note
        elif st == "done":
            job["status"] = "review"
            s["reviewer"] = "revue"
        elif st in ("failed", "killed"):
            job["status"] = "blocked"
            job["note"] = run.note or ("tué par l'utilisateur" if st == "killed" else "échec")
        if st in ENDED_STATES:
            s["ended"] = local_iso(run.ended or time.time())
            ms = int(run.active_seconds(self.runner.now()) * 1000)
            if ms > 0:
                job["add"]["ms"] = ms
        return job

    # -- écriture Kanban (un seul fil : les écritures sont ordonnées) -----------------------------
    ALLOWED_STATUS = {"doing": ("todo", "blocked"), "review": ("doing",), "blocked": ("doing", "todo")}

    def _writer_loop(self):
        while True:
            job = self._q.get()
            if job is None:
                return
            batch, stop = [job], False
            while True:
                try:
                    j = self._q.get_nowait()
                except queue.Empty:
                    break
                if j is None:
                    stop = True
                    break
                batch.append(j)
            by_task = {}
            for j in batch:
                by_task.setdefault(j["task"], []).append(j)
            for task, jobs in by_task.items():
                try:
                    self._write(task, jobs)
                except Exception as exc:  # une écriture ratée ne doit pas tuer le fil
                    print(f"[runner/kanban] {task} : {exc!r}", file=sys.stderr)
            if stop:
                return

    def _write(self, task, jobs):
        path = self.args.kanban
        cur = kanban_row_value(path, task, "status")
        if cur is None:
            return  # tâche absente du Kanban (lancement direct) : rien à écrire
        sets, adds, unsets, note, start = {}, {}, [], None, cur
        for j in jobs:
            sets.update(j["set"])
            for k, v in j["add"].items():
                adds[k] = adds.get(k, 0) + v
            unsets += j["unset"]
            if j["status"] and start in self.ALLOWED_STATUS[j["status"]]:
                start = j["status"]
            if j["note"]:
                note = j["note"]
        if start != cur:
            sets["status"] = start
        if start == "blocked" and note:
            old = kanban_row_value(path, task, "note")
            old = re.sub(r"^Lanceur \([^)]*\) : [^|]*\| ?", "", old) if isinstance(old, str) else ""
            sets["note"] = f"Lanceur ({time.strftime('%Y-%m-%d %H:%M')}) : {note}" + (f" | {old}" if old else "")
        unsets = [k for k in dict.fromkeys(unsets) if k not in sets]
        op = {"op": "task", "id": task, "set": sets}
        if adds:
            op["add"] = adds
        if unsets:
            op["unset"] = unsets
        out = kanban_apply(path, [op], allow_reserved=True)
        self.hub.notices.kanban_changes(out.get("changes"))

    # -- actions ------------------------------------------------------------------------------------
    def action(self, task, action, body):
        r = self.runner
        run = r.runs.get(task)
        if run is not None and run.state == "orphan" and action != "kill":
            raise HttpError(409, f"{task} : processus orphelin (lancé avant un redémarrage du serveur) : seul kill est permis")
        if action == "enqueue":
            prio = body.get("prio") if isinstance(body, dict) else None
            try:
                if run is not None:
                    r.enqueue(task, prio=prio)
                else:
                    plan = read_plan(self.args.kanban)
                    row = next((t for t in plan["tasks"] if t.get("id") == task), None)
                    if row is None:
                        raise KeyError(task)
                    if row.get("agent") not in ("dev", "archi", "revue"):
                        raise HttpError(400, "agent non lançable : " + str(row.get("agent")))
                    r.enqueue(task, row.get("agent"), row.get("model") or "sonnet", row.get("perm") or "acceptEdits",
                              prio if prio is not None else row.get("prio", 2), row.get("worktree") or None, row.get("lot"),
                              None, row.get("budget") or row.get("est0"))
            except KanbanError as exc:
                raise HttpError(400, str(exc))
        else:
            getattr(r, action)(task)
        return {"ok": True, "state": r.get(task).state}

    def input(self, task, data):
        run = self.runner.runs.get(task)
        if run is not None and run.state == "orphan":
            raise HttpError(409, f"{task} : processus orphelin : pas de terminal, seul kill est permis")
        self.runner.input(task, data)
        return {"ok": True}


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------
TOKEN_META = '<meta name="stt-token" content="">'


def check_control(handler, same_origin_get=False):
    """Contrôle des routes de pilotage : jeton, Host, Origin obligatoire, Sec-Fetch-Site. Renvoie True si autorisé.
    `same_origin_get` : pour un GET `fetch` (le navigateur n'envoie pas Origin en même origine), l'absence d'Origin
    est acceptée si Sec-Fetch-Site vaut same-origin ; une Origin présente doit toujours être valide."""
    hub_token = getattr(handler, "stt_token", "") or ""
    got = handler.headers.get("X-STT-Token") or ""
    if not hub_token or not hmac.compare_digest(got.encode("utf-8"), hub_token.encode("utf-8")):
        return False
    if not handler._host_ok():
        return False
    port = handler.server.server_address[1]
    origin = handler.headers.get("Origin")
    site = (handler.headers.get("Sec-Fetch-Site") or "").lower()
    if origin:
        if origin not in {f"http://{h}:{port}" for h in ("127.0.0.1", "localhost", "[::1]")}:
            return False
    elif not (same_origin_get and site == "same-origin"):
        return False
    if site == "cross-site":
        return False
    return True


def make_handler(hub, allowed_hosts):
    class Handler(BaseHTTPRequestHandler):
        server_version = f"STTAgents/{VERSION}"
        stt_token = getattr(hub, "token", "")

        def log_message(self, fmt, *a):
            if hub.args.verbose:
                sys.stderr.write("[http] " + fmt % a + "\n")

        def _check_control(self):
            return check_control(self)

        def _host_ok(self):
            if allowed_hosts is None:
                return True
            host = (self.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]").lower()
            return host in allowed_hosts

        def _send(self, code, body, ctype, head=False, extra=None):
            if ctype.startswith("text/html"):
                body = body.replace(TOKEN_META.encode(), ('<meta name="stt-token" content="%s">' % getattr(hub, "token", "")).encode())
                extra = dict(extra or {}, **{"Content-Security-Policy": "frame-ancestors 'self'", "Referrer-Policy": "no-referrer"})
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            if not head:
                self.wfile.write(body)

        def _kanban_get(self, path, head=False):
            """Page du Kanban, config, données et documents : True si la route est traitée."""
            if path == "/kanban":
                self.send_response(301)
                self.send_header("Location", "/kanban/")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return True
            if not path.startswith("/kanban/"):
                return False
            sub = path[len("/kanban/"):]
            if sub in ("", "index.html"):
                try:
                    self._send(200, (HERE / "kanban.html").read_bytes(), "text/html; charset=utf-8", head)
                except OSError:
                    self._send(500, "kanban.html introuvable à côté du serveur".encode("utf-8"), "text/plain; charset=utf-8", head)
            elif sub == "config.js":
                cfg = {"docBase": KANBAN_DOC_BASE, "docRoots": KANBAN_DOC_ROOTS}
                self._send(200, ("window.KANBAN_CFG = " + json.dumps(cfg, ensure_ascii=False) + ";").encode("utf-8"),
                           "application/javascript; charset=utf-8", head)
            elif sub == "plan-status.js":
                try:
                    self._send(200, Path(hub.args.kanban).read_bytes(), "application/javascript; charset=utf-8", head)
                except (OSError, TypeError):
                    self._send(404, b"plan-status.js introuvable", "text/plain; charset=utf-8", head)
            elif sub.startswith("doc/"):
                rel = urllib.parse.unquote(sub[4:].split("?", 1)[0])
                f, root = find_doc(hub.args.main_root, rel)
                if not f:
                    return self._send(404, b"document introuvable", "text/plain; charset=utf-8", head) or True
                if f.stat().st_size > KANBAN_DOC_MAX:
                    return self._send(413, b"document trop gros", "text/plain; charset=utf-8", head) or True
                ext = f.suffix.lower()
                ctype = {".md": "text/markdown; charset=utf-8", ".svg": "image/svg+xml", ".pdf": "application/pdf",
                         ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
                         ".gif": "image/gif"}.get(ext, "text/plain; charset=utf-8")  # html, js, json… : texte, jamais exécuté
                extra = {"X-Doc-Root": root}
                if ext == ".svg":
                    extra["Content-Security-Policy"] = "sandbox"
                self._send(200, f.read_bytes(), ctype, head, extra)
            else:
                self._send(404, b"404", "text/plain", head)
            return True

        def do_HEAD(self):
            if not self._host_ok():
                return self._send(403, b"Host refuse", "text/plain; charset=utf-8", True)
            if not self._kanban_get(self.path.split("?", 1)[0], head=True):
                self._send(404, b"404", "text/plain", True)

        def do_GET(self):
            if not self._host_ok():  # protection contre le DNS rebinding
                return self._send(403, b"Host refuse", "text/plain; charset=utf-8")
            path = self.path.split("?", 1)[0]
            if self._kanban_get(path):
                return
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
            if path == "/api/runner":
                return self._json(200, runner_payload(hub.runner))
            if path.startswith("/api/runner/") and path.endswith("/tty"):
                return self._tty(path)
            if path == "/api/kanban":
                try:
                    out = kanban_summary(hub.args.kanban)
                except KanbanError as exc:
                    out = {"ok": False, "path": hub.args.kanban, "error": str(exc)}
                return self._send(200, json.dumps(out, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")
            if path == "/favicon.ico":
                return self._send(204, b"", "image/x-icon")
            return self._send(404, b"404", "text/plain")

        def do_POST(self):
            if not self._host_ok():
                return self._send(403, b"Host refuse", "text/plain; charset=utf-8")
            path = self.path.split("?", 1)[0]
            if path == "/api/runner/check":
                if not check_control(self):
                    return self._send(403, b"403", "text/plain; charset=utf-8")
                return self._send(200, b'{"ok": true}', "application/json; charset=utf-8")
            if path == "/api/tasks" or path.startswith("/api/runner/"):
                return self._runner_post(path)
            if path != "/api/kanban":
                return self._send(404, b"404", "text/plain")
            # l'en-tete personnalise force un preflight CORS : une page web tierce ne peut pas ecrire le Kanban
            if self.headers.get("X-STT-Kanban") != "1":
                return self._send(403, "en-tete X-STT-Kanban: 1 requis".encode("utf-8"), "text/plain; charset=utf-8")
            try:
                n = int(self.headers.get("Content-Length") or 0)
                if not 0 < n <= 512 * 1024:
                    raise KanbanError("corps JSON absent ou trop gros (512 Ko max)")
                data = json.loads(self.rfile.read(n).decode("utf-8"))
                ops = data.get("ops") if isinstance(data, dict) else data
                out = kanban_apply(hub.args.kanban, ops, dry_run=bool(isinstance(data, dict) and data.get("dry_run")))
                code = 200
                if not out.get("dry_run"):
                    hub.notices.kanban_changes(out.get("changes"))
            except (KanbanError, ValueError, KeyError, IndexError) as exc:
                out, code = {"ok": False, "error": str(exc)}, 400
            self._send(code, json.dumps(out, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

        def _json(self, code, obj):
            self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

        def _read_json(self, limit, required=True):
            try:
                n = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                raise HttpError(400, "Content-Length invalide")
            if n > limit:
                raise HttpError(413, f"corps trop gros ({limit // 1024} Kio max)")
            if n <= 0:
                if required:
                    raise HttpError(400, "corps JSON attendu")
                return {}
            try:
                return json.loads(self.rfile.read(n).decode("utf-8"))
            except ValueError:
                raise HttpError(400, "JSON invalide")

        def _runner_post(self, path):
            """POST /api/tasks et /api/runner/<tâche>/<action|input|resize> (jeton + Origin)."""
            if not check_control(self):
                return self._send(403, b"403", "text/plain; charset=utf-8")
            try:
                if path == "/api/tasks":
                    return self._json(200, hub.tasks.create_task(self._read_json(BODY_MAX)))
                if hub.runner is None:
                    raise HttpError(409, RUNNER_OFF_REASON)
                parts = [urllib.parse.unquote(x) for x in path.split("/")]
                if len(parts) != 5 or not stt_runner._TASK_RE.match(parts[3]):
                    raise HttpError(404, "route inconnue")
                task, act = parts[3], parts[4]
                rn = hub.runner.runner
                if task not in rn.runs and act != "enqueue":
                    raise HttpError(404, f"tâche inconnue du lanceur : {task}")
                if act in RUN_ACTIONS:
                    return self._json(200, hub.runner.action(task, act, self._read_json(BODY_MAX, required=False)))
                if act == "input":
                    data = self._read_json(INPUT_BODY_MAX + 1024)
                    if not isinstance(data, dict) or not isinstance(data.get("data"), str):
                        raise HttpError(400, "{data: texte} attendu")
                    return self._json(200, hub.runner.input(task, data["data"]))
                if act == "resize":
                    data = self._read_json(BODY_MAX)
                    if not isinstance(data, dict):
                        raise HttpError(400, "{cols, rows} attendu")
                    if rn.runs[task].state == "orphan":
                        raise HttpError(409, f"{task} : processus orphelin : pas de terminal, seul kill est permis")
                    rn.resize(task, data.get("cols"), data.get("rows"))
                    return self._json(200, {"ok": True})
                raise HttpError(404, "action inconnue")
            except HttpError as exc:
                self._json(exc.code, {"ok": False, "error": exc.message})
            except stt_runner.TransitionError as exc:
                self._json(409, {"ok": False, "error": str(exc)})
            except stt_runner.ValidationError as exc:
                self._json(400, {"ok": False, "error": str(exc)})
            except KeyError as exc:
                self._json(404, {"ok": False, "error": f"tâche inconnue : {exc.args[0] if exc.args else ''}"})
            except stt_runner.RunnerError as exc:
                self._json(500, {"ok": False, "error": str(exc)})

        def _tty(self, path):
            """GET /api/runner/<tâche>/tty?since=N : flux SSE du terminal (event: out {seq,b64}, event: state {state})."""
            if not check_control(self, same_origin_get=True):
                return self._send(403, b"403", "text/plain; charset=utf-8")
            parts = [urllib.parse.unquote(x) for x in path.split("/")]
            if hub.runner is None:
                return self._json(409, {"ok": False, "error": RUNNER_OFF_REASON})
            if len(parts) != 5 or parts[3] not in hub.runner.runner.runs:
                return self._json(404, {"ok": False, "error": "tâche inconnue du lanceur"})
            task = parts[3]
            q = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            try:
                since = int((q.get("since") or ["0"])[0])
                if since < 0:
                    raise ValueError
            except ValueError:
                return self._json(400, {"ok": False, "error": "since : entier >= 0"})
            rn = hub.runner.runner
            if rn.get(task).state == "orphan":
                return self._json(409, {"ok": False, "error": f"{task} : processus orphelin : pas de terminal, seul kill est permis"})
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Connection", "close")
            self.end_headers()
            self.close_connection = True
            last_state, last_ping, ended = None, time.monotonic(), 0
            try:
                self.wfile.write(b"retry: 3000\n\n")
                while True:
                    state = rn.get(task).state
                    seq, data = rn.read_output(task, since)
                    sent = False
                    if state != last_state:
                        last_state = state
                        self.wfile.write(b"event: state\ndata: " + json.dumps({"state": state}).encode("utf-8") + b"\n\n")
                        sent = True
                    for i in range(0, len(data), 16384):
                        msg = json.dumps({"seq": seq + i, "b64": base64.b64encode(data[i:i + 16384]).decode("ascii")},
                                         separators=(",", ":"))
                        self.wfile.write(b"event: out\ndata: " + msg.encode("ascii") + b"\n\n")
                        sent = True
                    if data:
                        since = seq + len(data)
                    if sent:
                        self.wfile.flush()
                        last_ping = time.monotonic()
                    elif time.monotonic() - last_ping >= 15:
                        self.wfile.write(b"event: ping\ndata: {}\n\n")
                        self.wfile.flush()
                        last_ping = time.monotonic()
                    if state in ("done", "failed", "stopped", "killed") and not data:
                        ended += 1
                        if ended >= 2:  # relecture finale : le lecteur a vidé le pty avant le changement d'état
                            return
                    else:
                        ended = 0
                    time.sleep(0.05)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                return

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
    ap.add_argument("--strict", action="store_true", help="ne suivre que les dossiers de sessions du chemin exact du dépôt et de ses worktrees")
    ap.add_argument("--github", help="owner/dépôt GitHub (défaut : remote origin)")
    ap.add_argument("--no-github", action="store_true", help="désactive la source GitHub")
    ap.add_argument("--window", type=float, default=24, help="sessions actives dans les N dernières heures (défaut 24)")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--open", action="store_true", help="ouvre le tableau de bord dans le navigateur")
    ap.add_argument("--once", action="store_true", help="imprime un instantané JSON puis quitte")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--kanban", help="plan-status.js du Kanban (défaut : %s dans le checkout principal)" % KANBAN_REL)
    ap.add_argument("--kanban-apply", metavar="OPS.json", help="applique des opérations au Kanban (fichier JSON ou - pour stdin) puis quitte ; --dry-run pour contrôler seulement")
    ap.add_argument("--runner", action="store_true", help="active le lanceur d'agents (opt-in ; boucle locale uniquement, hors Windows)")
    ap.add_argument("--runner-cmd", metavar="JSON", help="avec --runner : commande du lanceur, liste argv JSON (défaut : claude interactif) ; {agent} {model} {session} {perm} {task} {prompt} substitués")
    ap.add_argument("--dry-run", action="store_true", help="avec --kanban-apply : valide sans écrire")
    args = ap.parse_args()
    if args.runner:
        if args.host not in ("127.0.0.1", "localhost", "::1"):
            ap.exit(2, "--runner refusé : --host doit être la boucle locale (127.0.0.1, localhost ou ::1).\n")
        if os.name == "nt":
            ap.exit(2, "--runner refusé : non pris en charge sous Windows.\n")
    runner_cmd = None
    if args.runner_cmd:
        if not args.runner:
            ap.exit(2, "--runner-cmd exige --runner.\n")
        try:
            runner_cmd = json.loads(args.runner_cmd)
        except ValueError:
            runner_cmd = None
        if not (isinstance(runner_cmd, list) and runner_cmd and all(isinstance(x, str) for x in runner_cmd)):
            ap.exit(2, "--runner-cmd : liste JSON non vide de chaînes attendue.\n")

    args.repo = os.path.abspath(os.path.expanduser(args.repo)) if args.repo else detect_repo(HERE)
    if args.repo:  # racine réelle du dépôt (et non un sous-dossier)
        args.repo = detect_repo(args.repo) or args.repo
    args.kanban = find_kanban(args.repo, args.kanban)
    args.main_root = main_checkout(args.repo)
    if args.kanban_apply:
        sys.stdout.reconfigure(encoding="utf-8") if hasattr(sys.stdout, "reconfigure") else None
        try:
            raw = sys.stdin.read() if args.kanban_apply == "-" else Path(args.kanban_apply).read_text(encoding="utf-8")
            data = json.loads(raw)
            out = kanban_apply(args.kanban, data.get("ops") if isinstance(data, dict) else data,
                               dry_run=args.dry_run or bool(isinstance(data, dict) and data.get("dry_run")))
        except (KanbanError, ValueError, OSError) as exc:
            print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
            sys.exit(1)
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return
    if not args.github and not args.no_github:
        args.github = detect_github(args.repo)
    hub = Hub(args)
    hub.token = secrets.token_urlsafe(32)  # en mémoire seulement

    if args.once:
        hub.git.refresh()
        hub.claude.add_worktrees(w["path"] for w in hub.git.worktrees)
        hub.gh.refresh()
        hub.claude.refresh()
        sys.stdout.reconfigure(encoding="utf-8") if hasattr(sys.stdout, "reconfigure") else None
        print(json.dumps(hub.build(), ensure_ascii=False, indent=2))
        return

    hub.tasks = TaskService(hub, args)
    if args.runner:
        hub.runner = RunnerGlue(hub, args, command=runner_cmd)
        hub.tasks = hub.runner
        hub.runner.start()
    hub.run_loops()
    local = args.host in ("127.0.0.1", "localhost", "::1")
    allowed = {"127.0.0.1", "localhost", "::1"} if local else None
    srv = ThreadingHTTPServer((args.host, args.port), make_handler(hub, allowed))
    srv.daemon_threads = True
    url = f"http://{'127.0.0.1' if local else args.host}:{args.port}/"
    print(f"STT · agents — {url}")
    print(f"  jeton   : {hub.token}  (en mémoire, injecté dans les pages servies)", flush=True)
    print(f"  dépôt   : {args.repo or '?'}")
    print(f"  sessions: {hub.claude.projects}  (préfixe {hub.claude.status['slug']}{'' if args.strict else ', et tout dossier contenant « ' + str(hub.claude.base) + ' »'})")
    print(f"  GitHub  : {args.github or 'désactivé'}{' (jeton)' if hub.gh.token else ''}")
    print(f"  Kanban  : {url}kanban/  ·  données {args.kanban or '?'}  (POST /api/kanban, X-STT-Kanban: 1)")
    print(f"  Documents du Kanban : {', '.join(repr(r) for r in KANBAN_DOC_ROOTS)} (KANBAN_DOC_ROOTS)")
    if args.runner:
        print(f"  Lanceur : actif · état {hub.runner.state_dir} · commande {(runner_cmd or stt_runner.RUNNER_COMMAND)[0]}")
        signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    if not local:
        print("  ATTENTION : serveur exposé au réseau, les extraits de transcripts sont lisibles par tout le LAN.")
    if args.open:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt.")
    finally:
        if hub.runner is not None:
            hub.runner.shutdown()


if __name__ == "__main__":
    main()
