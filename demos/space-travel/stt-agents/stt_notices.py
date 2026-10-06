"""Détection des événements importants et tampon de notices (stt-agents, T2.1).

Module pur (stdlib), sans serveur ni E/S : le serveur y envoie ses instantanés
(`observe`), les changements du Kanban (`kanban_changes`) et le futur lanceur ses
propres notices (`emit`). Les notices sont lues par `recent()` et exposées dans
/api/state (`notices`, `notice_seq`).

Notice : {id, ts, kind, cat, severity, title, body, target:{type,id}, key}
  cat      : attention | agents | kanban | pr | runner
  severity : info | attention | error | success
"""
import threading
import time
from collections import deque

CATS = ("attention", "agents", "kanban", "pr", "runner")
SEVERITIES = ("info", "attention", "error", "success")
BODY_MAX = 140

# lifecycle d'un sous-agent -> (kind, severity, titre)
SUB_EVENTS = {
    "rapport rendu": ("agent_report", "success", "Rapport rendu"),
    "arrêté": ("agent_stopped", "info", "Agent arrêté"),
    "erreur": ("agent_error", "error", "Agent en erreur"),
    "silencieux": ("agent_silent", "attention", "Agent silencieux : à arrêter ?"),
}


def _clip(text, n=BODY_MAX):
    text = " ".join(str(text or "").split())
    return text if len(text) <= n else text[: n - 1] + "…"


def _iso(ts):
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(ts))


class NoticeEngine:
    def __init__(self, max_items=200, dedupe_s=30, clock=time.time):
        self.max_items = max_items
        self.dedupe_s = dedupe_s
        self.clock = clock
        self._buf = deque(maxlen=max_items)
        self._seq = 0
        self._last_key = {}   # key -> instant de la dernière publication
        self._lock = threading.RLock()
        self._agents = None   # base de référence : {session: (state, label)}
        self._subs = {}       # (session, sous-agent) -> lifecycle
        self._prs = None      # {numéro: (state, merged)}

    @property
    def seq(self):
        """Dernier id attribué (0 si aucune notice) ; les ids ne sont jamais réutilisés."""
        return self._seq

    def emit(self, kind, cat, severity, title, body="", target=None, key=None):
        """Publie une notice ; renvoie la notice, ou None si la même `key` l'a été il y a moins de dedupe_s."""
        if cat not in CATS:
            raise ValueError(f"catégorie inconnue : {cat!r}")
        if severity not in SEVERITIES:
            raise ValueError(f"sévérité inconnue : {severity!r}")
        target = target or {}
        key = key or f"{kind}:{target.get('type', '')}:{target.get('id', '')}"
        now = self.clock()
        with self._lock:
            last = self._last_key.get(key)
            if last is not None and now - last < self.dedupe_s:
                return None
            self._last_key[key] = now
            if len(self._last_key) > 4 * self.max_items:  # purge des clés périmées
                self._last_key = {k: t for k, t in self._last_key.items() if now - t < self.dedupe_s}
            self._seq += 1
            n = {"id": self._seq, "ts": _iso(now), "kind": kind, "cat": cat, "severity": severity,
                 "title": _clip(title, 60), "body": _clip(body),
                 "target": {"type": target.get("type"), "id": target.get("id")}, "key": key}
            self._buf.append(n)
            return n

    def recent(self, n=50):
        with self._lock:
            items = list(self._buf)
        return items[-n:] if n > 0 else []

    # -- diff d'instantanés ------------------------------------------------
    def observe(self, agents, prs=None):
        """Compare l'instantané à l'ancien. Le premier ne produit aucune notice (base de référence).
        `prs` : liste github.prs, ou None si GitHub est indisponible (la base PR se fait au premier appel non None)."""
        with self._lock:
            first = self._agents is None
            cur_agents, cur_subs = {}, {}
            for a in agents or []:
                aid = a.get("id")
                state, label = a.get("state"), a.get("state_label")
                cur_agents[aid] = (state, label)
                title = a.get("title") or a.get("branch") or "Session"
                tgt = {"type": "agent", "id": aid}
                prev = (self._agents or {}).get(aid, (None, None))
                if not first:
                    if state == "waiting" and prev[0] != "waiting":
                        self.emit("agent_waiting", "attention", "attention", "T'attend", title, tgt, f"agent_waiting:{aid}")
                    elif state == "permission" and prev[0] != "permission":
                        self.emit("agent_permission", "attention", "attention", "Validation ?", title, tgt, f"agent_permission:{aid}")
                    if label == "Livré" and prev[1] != "Livré":
                        self.emit("agent_delivered", "agents", "success", "Livré", title, tgt, f"agent_delivered:{aid}")
                for sp in a.get("subagents") or []:
                    sk = (aid, sp.get("id"))
                    life = sp.get("lifecycle")
                    cur_subs[sk] = life
                    if not first and life != self._subs.get(sk) and life in SUB_EVENTS:
                        kind, sev, ttl = SUB_EVENTS[life]
                        self.emit(kind, "agents", sev, ttl, f"{sp.get('description') or sp.get('type') or 'agent'} ({title})",
                                  tgt, f"{kind}:{aid}:{sp.get('id')}")
            self._agents, self._subs = cur_agents, cur_subs
            if prs is not None:
                cur = {}
                for p in prs:
                    num = p.get("number")
                    cur[num] = (p.get("state"), bool(p.get("merged")))
                    if self._prs is None:
                        continue
                    old = self._prs.get(num)
                    tgt = {"type": "pr", "id": num}
                    label = f"#{num} {p.get('title') or ''}"
                    if old is None and p.get("state") == "open":
                        self.emit("pr_opened", "pr", "info", "PR ouverte", label, tgt, f"pr_opened:{num}")
                    elif p.get("merged") and not (old and old[1]):
                        self.emit("pr_merged", "pr", "success", "PR mergée", label, tgt, f"pr_merged:{num}")
                    elif p.get("state") == "closed" and not p.get("merged") and not (old and old[0] == "closed"):
                        self.emit("pr_closed", "pr", "info", "PR fermée sans merge", label, tgt, f"pr_closed:{num}")
                self._prs = cur

    # -- Kanban --------------------------------------------------------------
    def kanban_changes(self, changes):
        """`changes` : champ du compte rendu de kanban_apply. Entrées utiles :
        {op:'task', id, status (nouveau), avant:{status?}} et {op:'task_add', id}."""
        for c in changes or []:
            if not isinstance(c, dict):
                continue
            tid = c.get("id")
            tgt = {"type": "task", "id": tid}
            if c.get("op") == "task_add":
                self.emit("task_created", "kanban", "info", "Nouvelle tâche", f"{tid} créée", tgt, f"task_created:{tid}")
            elif c.get("op") == "task":
                new = c.get("status")
                old = (c.get("avant") or {}).get("status")
                if not new or new == old:
                    continue
                if new == "review":
                    self.emit("task_review", "kanban", "attention", "À relire", f"{tid} attend ta relecture", tgt, f"task_review:{tid}")
                elif new == "done":
                    self.emit("task_done", "kanban", "success", "Tâche terminée", f"{tid} est faite", tgt, f"task_done:{tid}")
                elif new == "blocked":
                    self.emit("task_blocked", "kanban", "error", "Tâche bloquée", f"{tid} est bloquée", tgt, f"task_blocked:{tid}")
