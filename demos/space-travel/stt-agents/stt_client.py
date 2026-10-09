#!/usr/bin/env python3
"""stt_client.py : client en ligne de commande du serveur stt-agents (stdlib Python seule).

Le CP lance et suit les agents par l'API du serveur (décision 41), sans l'outil Agent.

Usage général :
    python3 stt_client.py [--url URL] [--pretty] <commande> [options]

Option globale `--url` (défaut : variable d'environnement STT_AGENTS_URL, sinon http://127.0.0.1:8765).
Seuls les hôtes bouclés sont acceptés (127.0.0.1, localhost, [::1]). Le jeton est lu dans la page d'accueil
(`<meta name="stt-token" content="…">`) ; il n'est jamais affiché ni journalisé. En-têtes envoyés :
X-STT-Token et Origin (= URL de base). Sortie : JSON sur la sortie standard (`--pretty` pour l'indenter),
erreurs sur la sortie d'erreur.

Codes de sortie : 0 succès · 1 échec de l'opération (erreur HTTP, état final ≠ done pour `wait`) ·
2 erreur d'usage · 3 serveur injoignable ou jeton introuvable · 4 délai dépassé (`wait`).

Commandes :
  submit --lot L --title T --agent dev|archi|revue --model opus|sonnet|haiku --cx XS|S|M|L|XL
         (--prompt TEXTE | --prompt-file F) [--prio 1|2|3] [--worktree W] [--base BRANCHE]
         [--perm acceptEdits|plan|manual] [--docs F:lu|modifié|créé ...] [--no-autostart] [--no-autoexit]
         POST /api/tasks ; autostart et autoexit actifs par défaut ; affiche {id, budget, prompt, state}.
         Le fichier de prompt est lu en UTF-8 (200 Ki caractères max, comme le serveur).
  list                         GET /api/runner : liste compacte des runs
  status <task>                une ligne détaillée du run
  report <task> [--kanban]     GET /api/runner/<task>/report ; --kanban ajoute le bloc
                               kanban_add {"used": total_tokens, "ms": duration_ms}
  wait <task> [--timeout S=3600] [--interval S=5] [--until done,failed,stopped,killed]
                               attend l'un des états ; code 0 si done, 1 sinon, 4 si le délai est dépassé ;
                               survit à un redémarrage du serveur pendant l'attente
  pause|resume|stop|kill|cancel|enqueue <task>   POST /api/runner/<task>/<action>
  input <task> --text T        envoie du texte au terminal (échappements \\n \\r \\t interprétés)
  exit <task>                  envoie « /exit » + Entrée
  kanban-ops FICHIER.json [--dry-run]
                               POST /api/kanban (corps {"ops": [...]} ou liste, 1 Mio max ; en-tête X-STT-Kanban: 1)
"""

import argparse
import http.client
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_URL = "http://127.0.0.1:8765"
LOOPBACK = ("127.0.0.1", "localhost", "::1")
PROMPT_MAX = 200 * 1024          # caractères : limite du serveur (len(prompt) > 200 * 1024 refusé)
KANBAN_MAX = 1024 * 1024         # octets : taille maximale du corps de kanban-ops
TOKEN_RE = re.compile(r'<meta\s+name="stt-token"\s+content="([^"]*)"')
ACTIONS = ("pause", "resume", "stop", "kill", "cancel", "enqueue")
LIST_KEYS = ("task", "agent", "model", "state", "exit", "worktree", "inst", "tokens", "started", "ended")
DEFAULT_UNTIL = "done,failed,stopped,killed"
TIMEOUT = 15


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Aucune redirection suivie : le jeton ne doit jamais partir vers un autre hôte."""

    def redirect_request(self, *a, **k):
        return None


# Sans proxy (http_proxy ignoré : le trafic bouclé et le jeton ne sortent pas de la machine), sans redirection.
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())


class UsageError(Exception):
    """Erreur d'usage (code 2)."""


class Unreachable(Exception):
    """Serveur injoignable ou jeton introuvable (code 3)."""


class HttpFail(Exception):
    """Réponse HTTP d'erreur (code 1)."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code, self.message = code, message


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        raise UsageError(message)


class Client:
    def __init__(self, url):
        p = urllib.parse.urlparse(url)
        if p.scheme != "http" or not p.hostname or p.hostname.lower() not in LOOPBACK:
            raise UsageError("hôte refusé : seul un hôte bouclé en http est accepté (127.0.0.1, localhost, [::1])")
        try:
            port = p.port
        except ValueError:
            raise UsageError("URL invalide : port incorrect")
        host = "[::1]" if ":" in p.hostname else p.hostname
        self.base = "http://%s%s" % (host, ":%d" % port if port else "")
        self.token = None

    # -- bas niveau ---------------------------------------------------------------
    def _scrub(self, text):
        text = str(text)
        return text.replace(self.token, "***") if self.token else text

    def _open(self, method, path, body=None, headers=None):
        data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
        h = {"Origin": self.base}
        if body is not None:
            h["Content-Type"] = "application/json"
        h.update(headers or {})
        req = urllib.request.Request(self.base + path, data=data, headers=h, method=method)
        try:
            with OPENER.open(req, timeout=TIMEOUT) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as exc:
            if 300 <= exc.code < 400:
                raise Unreachable("redirection refusée (HTTP %d) : le client ne suit aucune redirection" % exc.code)
            return exc.code, exc.read()
        except http.client.HTTPException as exc:  # IncompleteRead, BadStatusLine, RemoteDisconnected…
            raise Unreachable("réponse interrompue par le serveur (%s) : %s" % (self.base, self._scrub(
                exc.__class__.__name__)))
        except (urllib.error.URLError, OSError) as exc:
            raise Unreachable("serveur injoignable (%s) : %s" % (self.base, self._scrub(getattr(exc, "reason", exc))))

    def discover_token(self):
        code, body = self._open("GET", "/")
        m = TOKEN_RE.search(body.decode("utf-8", "replace")) if code == 200 else None
        if not m or not m.group(1):
            raise Unreachable("jeton introuvable dans la page d'accueil de %s" % self.base)
        self.token = m.group(1)
        return self.token

    def request(self, method, path, body=None, headers=None):
        """Renvoie le JSON de la réponse ; HttpFail sur code ≥ 400. Une 403 provoque une redétection du jeton."""
        for attempt in (0, 1):
            if self.token is None:
                self.discover_token()
            h = {"X-STT-Token": self.token}
            h.update(headers or {})
            code, raw = self._open(method, path, body, h)
            if code == 403 and attempt == 0:
                self.token = None  # jeton périmé (serveur relancé) : une seule nouvelle tentative
                continue
            break
        text = raw.decode("utf-8", "replace")
        try:
            obj = json.loads(text)
        except ValueError:
            obj = None
        if code >= 400:
            msg = obj.get("error") if isinstance(obj, dict) and obj.get("error") else text.strip()
            raise HttpFail(code, self._scrub(msg) or "(sans message)")
        if obj is None:
            raise HttpFail(code, "réponse non JSON")
        return obj


# -- utilitaires ---------------------------------------------------------------------
def emit(obj, args, out, client=None):
    text = json.dumps(obj, ensure_ascii=False, indent=2 if args.pretty else None)
    out.write((client._scrub(text) if client is not None else text) + "\n")


def parse_docs(items):
    docs = []
    for it in items or []:
        f, sep, r = it.rpartition(":")
        if not sep or not f or r not in ("lu", "modifié", "créé"):
            raise UsageError("--docs : « fichier:lu|modifié|créé » attendu, reçu %r" % it)
        docs.append({"f": f, "r": r})
    return docs


def unescape(text):
    return text.replace("\\n", "\n").replace("\\r", "\r").replace("\\t", "\t")


def find_run(client, task):
    for r in client.request("GET", "/api/runner").get("runs", []):
        if r.get("task") == task:
            return r
    return None


def task_arg(value):
    if not re.match(r"^[A-Za-z0-9][A-Za-z0-9._-]*$", value):
        raise UsageError("identifiant de tâche invalide : %r" % value)
    return value


# -- commandes -----------------------------------------------------------------------
def cmd_submit(c, a, out):
    if (a.prompt is None) == (a.prompt_file is None):
        raise UsageError("submit : exactement un de --prompt ou --prompt-file")
    if a.prompt_file is not None:
        try:
            with open(a.prompt_file, "rb") as f:
                raw = f.read(4 * PROMPT_MAX + 1)
            if len(raw) > 4 * PROMPT_MAX:
                raise UsageError("--prompt-file : plus de 200 Ki caractères")
            prompt = raw.decode("utf-8")
            if len(prompt) > PROMPT_MAX:
                raise UsageError("--prompt-file : plus de 200 Ki caractères")
        except OSError as exc:
            raise UsageError("--prompt-file illisible : %s" % exc.strerror)
        except UnicodeDecodeError:
            raise UsageError("--prompt-file : UTF-8 attendu")
    else:
        prompt = a.prompt
        if len(prompt) > PROMPT_MAX:
            raise UsageError("--prompt : plus de 200 Ki caractères")
    body = {"lot": a.lot, "title": a.title, "agent": a.agent, "model": a.model, "cx": a.cx, "prompt": prompt,
            "prio": a.prio, "perm": a.perm, "autostart": not a.no_autostart, "autoexit": not a.no_autoexit}
    if a.worktree:
        body["worktree"] = a.worktree
    if a.base:
        body["base"] = a.base
    docs = parse_docs(a.docs)
    if docs:
        body["docs"] = docs
    res = c.request("POST", "/api/tasks", body)
    emit({"id": res.get("id"), "budget": res.get("budget"), "prompt": res.get("prompt"),
          "state": res.get("state") or ("queued" if body["autostart"] else "todo")}, a, out, c)
    return 0


def cmd_list(c, a, out):
    runs = c.request("GET", "/api/runner").get("runs", [])
    emit([{k: r.get(k) for k in LIST_KEYS} for r in runs], a, out, c)
    return 0


def cmd_status(c, a, out):
    r = find_run(c, a.task)
    if r is None:
        raise HttpFail(404, "tâche inconnue du lanceur : %s" % a.task)
    emit(r, a, out, c)
    return 0


def cmd_report(c, a, out):
    rep = c.request("GET", "/api/runner/%s/report" % urllib.parse.quote(a.task, safe=""))
    if a.kanban:
        usage = rep.get("usage") or {}
        rep = dict(rep, kanban_add={"used": usage.get("total_tokens"), "ms": rep.get("duration_ms")})
    emit(rep, a, out, c)
    return 0


def cmd_wait(c, a, out, err):
    until = {s.strip() for s in a.until.split(",") if s.strip()}
    if not until:
        raise UsageError("--until : au moins un état")
    if a.interval <= 0 or a.timeout < 0:
        raise UsageError("--interval doit être > 0 et --timeout ≥ 0")
    end = time.monotonic() + a.timeout
    last = None
    while True:
        try:
            r = find_run(c, a.task)
            last = r["state"] if r else last
            if r and r["state"] in until:
                emit({"task": a.task, "state": r["state"]}, a, out, c)
                return 0 if r["state"] == "done" else 1
        except (Unreachable, HttpFail):
            c.token = None  # serveur absent ou relancé : on réessaiera jusqu'au délai
        left = end - time.monotonic()
        if left <= 0:
            emit({"task": a.task, "state": last, "timeout": True}, a, out, c)
            err.write("délai dépassé en attendant %s (dernier état : %s)\n" % (a.task, last))
            return 4
        time.sleep(min(a.interval, left))


def cmd_action(c, a, out):
    emit(c.request("POST", "/api/runner/%s/%s" % (urllib.parse.quote(a.task, safe=""), a.command), {}), a, out, c)
    return 0


def cmd_input(c, a, out):
    emit(c.request("POST", "/api/runner/%s/input" % urllib.parse.quote(a.task, safe=""),
                   {"data": unescape(a.text)}), a, out, c)
    return 0


def cmd_exit(c, a, out):
    emit(c.request("POST", "/api/runner/%s/input" % urllib.parse.quote(a.task, safe=""), {"data": "/exit\r"}), a, out, c)
    return 0


def cmd_kanban_ops(c, a, out):
    try:
        with open(a.file, "rb") as f:
            raw = f.read(KANBAN_MAX + 1)
        if len(raw) > KANBAN_MAX:
            raise UsageError("kanban-ops : fichier de plus de 1 Mio")
        data = json.loads(raw.decode("utf-8"))
    except OSError as exc:
        raise UsageError("fichier illisible : %s" % exc.strerror)
    except (ValueError, UnicodeDecodeError) as exc:
        raise UsageError("JSON invalide : %s" % exc)
    body = dict(data) if isinstance(data, dict) else {"ops": data}
    if not isinstance(body.get("ops"), list):
        raise UsageError("kanban-ops : liste d'opérations ou {\"ops\": [...]} attendu")
    if a.dry_run:
        body["dry_run"] = True
    if len(json.dumps(body, ensure_ascii=False).encode("utf-8")) > KANBAN_MAX:
        raise UsageError("kanban-ops : corps de plus de 1 Mio")
    emit(c.request("POST", "/api/kanban", body, {"X-STT-Kanban": "1"}), a, out, c)
    return 0


# -- analyse des arguments -----------------------------------------------------------
def build_parser():
    p = _Parser(prog="stt_client.py", description="Client du serveur stt-agents (voir l'en-tête du fichier).")
    p.add_argument("--url", default=os.environ.get("STT_AGENTS_URL") or DEFAULT_URL)
    p.add_argument("--pretty", action="store_true")
    sub = p.add_subparsers(dest="command", required=True, parser_class=_Parser)
    s = sub.add_parser("submit")
    s.add_argument("--lot", required=True)
    s.add_argument("--title", required=True)
    s.add_argument("--agent", required=True, choices=("dev", "archi", "revue"))
    s.add_argument("--model", required=True, choices=("opus", "sonnet", "haiku"))
    s.add_argument("--cx", required=True, choices=("XS", "S", "M", "L", "XL"))
    s.add_argument("--prompt")
    s.add_argument("--prompt-file")
    s.add_argument("--prio", type=int, choices=(1, 2, 3), default=2)
    s.add_argument("--worktree")
    s.add_argument("--base")
    s.add_argument("--perm", choices=("acceptEdits", "plan", "manual"), default="acceptEdits")
    s.add_argument("--docs", nargs="+")
    s.add_argument("--no-autostart", action="store_true")
    s.add_argument("--no-autoexit", action="store_true")
    sub.add_parser("list")
    sub.add_parser("status").add_argument("task", type=task_arg)
    r = sub.add_parser("report")
    r.add_argument("task", type=task_arg)
    r.add_argument("--kanban", action="store_true")
    w = sub.add_parser("wait")
    w.add_argument("task", type=task_arg)
    w.add_argument("--timeout", type=float, default=3600)
    w.add_argument("--interval", type=float, default=5)
    w.add_argument("--until", default=DEFAULT_UNTIL)
    for name in ACTIONS:
        sub.add_parser(name).add_argument("task", type=task_arg)
    i = sub.add_parser("input")
    i.add_argument("task", type=task_arg)
    i.add_argument("--text", required=True)
    sub.add_parser("exit").add_argument("task", type=task_arg)
    k = sub.add_parser("kanban-ops")
    k.add_argument("file")
    k.add_argument("--dry-run", action="store_true")
    return p


def main(argv=None, out=None, err=None):
    out = out or sys.stdout
    err = err or sys.stderr
    try:
        a = build_parser().parse_args(argv)
        c = Client(a.url)
        cmd = a.command
        if cmd == "submit":
            return cmd_submit(c, a, out)
        if cmd == "list":
            return cmd_list(c, a, out)
        if cmd == "status":
            return cmd_status(c, a, out)
        if cmd == "report":
            return cmd_report(c, a, out)
        if cmd == "wait":
            return cmd_wait(c, a, out, err)
        if cmd in ACTIONS:
            return cmd_action(c, a, out)
        if cmd == "input":
            return cmd_input(c, a, out)
        if cmd == "exit":
            return cmd_exit(c, a, out)
        return cmd_kanban_ops(c, a, out)
    except UsageError as exc:
        err.write("erreur d'usage : %s\n" % exc)
        return 2
    except Unreachable as exc:
        err.write("erreur : %s\n" % exc)
        return 3
    except HttpFail as exc:
        err.write("erreur HTTP %d : %s\n" % (exc.code, exc.message))
        return 1
    except SystemExit as exc:  # --help
        return exc.code if isinstance(exc.code, int) else 0


if __name__ == "__main__":
    sys.exit(main())
