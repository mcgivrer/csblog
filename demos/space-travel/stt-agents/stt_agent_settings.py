"""
Liste d'autorisations des agents lances par le serveur (T3.8).

`claude --settings <fichier>` charge un fichier de reglages supplementaire. Le serveur ne passe JAMAIS le
fichier d'origine (`agent-permissions.json`) : il le valide strictement, y ajoute les regles `deny`
obligatoires, puis ecrit un fichier EFFECTIF prive (0600) que `claude` recoit. Stdlib seule, fonctions pures.
"""

import errno
import json
import os
import re
import stat

MAX_BYTES = 64 * 1024
MAX_RULES = 300
MAX_RULE_LEN = 300
EFFECTIVE_NAME = "agent-settings.json"

MANDATORY_DENY = (
    "Bash(git push*)", "Bash(git reset*)", "Bash(git checkout*)", "Bash(git restore*)",
    "Bash(git stash*)", "Bash(git clean*)", "Bash(git rebase*)", "Bash(git merge*)",
    "Bash(git switch*)", "Bash(git tag*)", "Bash(git remote*)", "Bash(git config*)",
    "Bash(gh *)", "Bash(curl *)", "Bash(wget *)", "Bash(ssh *)", "Bash(scp *)", "Bash(sudo *)",
    "Edit(**/stt-agents/data/**)", "Write(**/stt-agents/data/**)",
    "Edit(**/.claude/settings*.json)", "Write(**/.claude/settings*.json)",
    "Read(~/.ssh/**)", "Read(~/.gnupg/**)", "Read(~/.config/gh/**)",
)

# Regles `allow` trop larges (en plus des noms d'outil nus, de `Outil(*)`, `Outil()` et des deny obligatoires).
TOO_BROAD_ALLOW = frozenset((
    "*", "Bash(*)", "Bash(python3 *)", "Bash(python *)", "Bash(sh *)", "Bash(bash *)",
    "Bash(rm*)", "Bash(curl*)", "Bash(git push*)",
))

_BARE_TOOL_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_.:-]*$")
_ANY_ARG_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_.:-]*\(\s*\*?\s*\)$")


class SettingsError(ValueError):
    """Liste d'autorisations refusee (message clair, sans contenu de la liste)."""


def _rule_list(obj, key):
    rules = obj.get(key, [])
    if not isinstance(rules, list):
        raise SettingsError("permissions.%s doit être une liste" % key)
    if len(rules) > MAX_RULES:
        raise SettingsError("permissions.%s : %d entrées au plus" % (key, MAX_RULES))
    seen = set()
    for r in rules:
        if not isinstance(r, str):
            raise SettingsError("permissions.%s : chaînes attendues" % key)
        if not r.strip() or len(r) > MAX_RULE_LEN or any(ord(c) < 32 or ord(c) == 127 for c in r):
            raise SettingsError("permissions.%s : règle vide, trop longue (%d) ou avec caractère de contrôle"
                                % (key, MAX_RULE_LEN))
        if r in seen:
            raise SettingsError("permissions.%s : règle en double (%s)" % (key, r))
        seen.add(r)
    return list(rules)


def validate_settings_data(data):
    """Valide le contenu JSON deja decode ; retourne (allow, deny) ou leve SettingsError."""
    if not isinstance(data, dict) or set(data) != {"permissions"}:
        raise SettingsError("le fichier doit être un objet dont la seule clé est « permissions »")
    perms = data["permissions"]
    if not isinstance(perms, dict) or not set(perms) <= {"allow", "deny"}:
        raise SettingsError("« permissions » doit être un objet dont les seules clés sont « allow » et « deny »")
    allow = _rule_list(perms, "allow")
    deny = _rule_list(perms, "deny")
    for r in allow:
        s = r.strip()
        if s in TOO_BROAD_ALLOW or _BARE_TOOL_RE.match(s) or _ANY_ARG_RE.match(s):
            raise SettingsError("règle allow trop large : %s" % r)
        if s in MANDATORY_DENY:
            raise SettingsError("règle allow en conflit avec une règle deny obligatoire : %s" % r)
    return allow, deny


def validate_settings_file(path):
    """Valide le fichier d'origine (fichier regulier, proprietaire, droits, taille, contenu).
    Retourne (allow, deny) ; leve SettingsError sinon."""
    if not isinstance(path, str) or not path or "\x00" in path:
        raise SettingsError("chemin invalide")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    try:
        fd = os.open(path, flags)
    except OSError as exc:
        if exc.errno == errno.ELOOP:
            raise SettingsError("%s : lien symbolique refusé" % path)
        raise SettingsError("%s : illisible (%s)" % (path, exc.strerror or exc))
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode):
            raise SettingsError("%s : fichier régulier attendu" % path)
        if hasattr(os, "getuid") and st.st_uid != os.getuid():
            raise SettingsError("%s : doit appartenir à l'utilisateur courant" % path)
        if st.st_mode & 0o002:
            raise SettingsError("%s : inscriptible par les autres (mode %o)" % (path, st.st_mode & 0o777))
        if st.st_size > MAX_BYTES:
            raise SettingsError("%s : %d Kio au plus" % (path, MAX_BYTES // 1024))
        raw = b""
        while len(raw) <= MAX_BYTES:
            chunk = os.read(fd, MAX_BYTES + 1 - len(raw))
            if not chunk:
                break
            raw += chunk
    finally:
        os.close(fd)
    if len(raw) > MAX_BYTES:
        raise SettingsError("%s : %d Kio au plus" % (path, MAX_BYTES // 1024))
    try:
        data = json.loads(raw.decode("utf-8"))
    except ValueError:
        raise SettingsError("%s : JSON invalide" % path)
    try:
        return validate_settings_data(data)
    except SettingsError as exc:
        raise SettingsError("%s : %s" % (path, exc))


def merge_deny(deny):
    """Union (liste + deny obligatoires), sans doublon, ordre : liste puis obligatoires."""
    out = []
    for r in list(deny) + list(MANDATORY_DENY):
        if r not in out:
            out.append(r)
    return out


def write_effective(dir_path, allow, deny):
    """Ecrit <dir_path>/agent-settings.json (0600, atomique, sans suivre de lien symbolique).
    Le dossier doit deja etre prive. Retourne le chemin absolu."""
    dir_path = os.path.abspath(dir_path)
    final = os.path.join(dir_path, EFFECTIVE_NAME)
    tmp = os.path.join(dir_path, ".%s.%d.tmp" % (EFFECTIVE_NAME, os.getpid()))
    body = json.dumps({"permissions": {"allow": list(allow), "deny": merge_deny(deny)}},
                      ensure_ascii=False, indent=2) + "\n"
    try:
        os.unlink(tmp)
    except FileNotFoundError:
        pass
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(body)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, final)   # remplace le lien eventuel lui-meme, ne le suit pas
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    return final


def prepare(source, dir_path):
    """Valide `source` puis ecrit le fichier effectif dans `dir_path` ; retourne son chemin."""
    allow, deny = validate_settings_file(source)
    return write_effective(dir_path, allow, deny)
