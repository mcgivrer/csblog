#!/usr/bin/env python3
"""
codemap.py — carte compacte du code JS de Space Travel & Transport (lot L0.2).

  cd demos/space-travel/sources && python3 tools/codemap.py   ->   ../docs/specs/CODEMAP.md

Parcourt, dans l'ordre de ORDER.txt (src/JS/game/ORDER.txt), les modules de src/JS/game/, src/JS/sim/,
src/JS/ui/ et ../shared/ (lignes « shared/x.js », « sim/x.js », « ui/x.js » ; sans préfixe = game/).
Pour chaque fichier : nombre de lignes, en-tête (1re ligne utile du commentaire de tête), déclarations de
niveau 0 (function / const / let / var / class en colonne 0) avec leur n° de ligne, espaces de noms
`const X = (function(){…})()` avec les clés de leur `return {…}` final (au mieux), affectations
`window.__X =` et balises @provides / @requires.

Un module entièrement enveloppé dans une IIFE (cas de shared/) est marqué [IIFE] : ses déclarations sont
alors celles du corps de l'IIFE (locales ; seules les affectations window.__X sont globales).

Analyse par un petit lexeur JS (chaînes, gabarits, commentaires, expressions régulières) : pas de
dépendance, Python standard seulement. Les fichiers de plus de 300 Ko ne sont jamais lus.
Sortie déterministe (aucune date) : relancer ne produit un diff que si le code a changé.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))          # sources/
JS = os.path.join(ROOT, 'src', 'JS')
DIRS = {'game': os.path.join(JS, 'game'), 'sim': os.path.join(JS, 'sim'),
        'ui': os.path.join(JS, 'ui'), 'shared': os.path.normpath(os.path.join(ROOT, '..', 'shared'))}
ORDER_CANDIDATES = [os.path.join(JS, 'game', 'ORDER.txt'), os.path.join(JS, 'ORDER.txt'), os.path.join(ROOT, 'ORDER.txt')]
OUT = os.path.normpath(os.path.join(ROOT, '..', 'docs', 'specs', 'CODEMAP.md'))
MAX_BYTES = 300 * 1024      # liste noire : jamais de lecture au-delà
WIDTH = 190                 # largeur de repli des listes
HEADER_MAX = 110

# ----------------------------------------------------------------------------------------------- lexeur
K_ID, K_NUM, K_STR, K_TPL, K_RE, K_P = range(6)
_STR = {"'": re.compile(r"'(?:[^'\\\n]|\\.|\\\n)*'", re.S), '"': re.compile(r'"(?:[^"\\\n]|\\.|\\\n)*"', re.S)}
_ID = re.compile(r'(?:[^\W\d]|\$)[\w$]*')
_NUM = re.compile(r'(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)n?')
_FLAGS = re.compile(r'[a-z]*')
REGEX_AFTER_KW = {'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await'}


def regex_ok(prev):
    """Un « / » ouvre-t-il une expression régulière après le jeton prev ?"""
    if prev is None:
        return True
    k, t = prev
    if k in (K_NUM, K_STR, K_TPL, K_RE):
        return False
    if k == K_ID:
        return t in REGEX_AFTER_KW
    return t not in (')', ']', '}', '++', '--')


def lex(src):
    """Jetons (kind, text, line, col, depth). depth = profondeur de ([{ autour du jeton ; un fermant a la
    profondeur de son ouvrant ; les `${` de gabarits comptent comme des accolades."""
    toks, app = [], None
    toks = []
    app = toks.append
    i, n, line, ls = 0, len(src), 1, 0
    stack, prev = [], None
    while i < n:
        c = src[i]
        if c == '\n':
            line += 1
            i += 1
            ls = i
            continue
        if c in ' \t\r\f\v﻿ ':
            i += 1
            continue
        if c == '/':
            nx = src[i + 1] if i + 1 < n else ''
            if nx == '/':
                j = src.find('\n', i)
                i = n if j < 0 else j
                continue
            if nx == '*':
                j = src.find('*/', i + 2)
                j = n if j < 0 else j + 2
                nl = src.count('\n', i, j)
                if nl:
                    line += nl
                    ls = src.rfind('\n', i, j) + 1
                i = j
                continue
            if regex_ok(prev):
                j, incls = i + 1, False
                while j < n:
                    ch = src[j]
                    if ch == '\\':
                        j += 2
                        continue
                    if ch == '\n':
                        j = -1
                        break
                    if incls:
                        if ch == ']':
                            incls = False
                    elif ch == '[':
                        incls = True
                    elif ch == '/':
                        break
                    j += 1
                if 0 < j < n:
                    j = _FLAGS.match(src, j + 1).end()
                    app((K_RE, '/re/', line, i - ls, len(stack)))
                    prev = (K_RE, '/re/')
                    i = j
                    continue
        if c == '`' or (c == '}' and stack and stack[-1] == 't'):
            if c == '}':
                stack.pop()
            col, d0 = i - ls, len(stack)
            j, closed = i + 1, False
            while j < n:
                ch = src[j]
                if ch == '\\':
                    j += 2
                    continue
                if ch == '`':
                    j += 1
                    closed = True
                    break
                if ch == '$' and src[j + 1:j + 2] == '{':
                    j += 2
                    stack.append('t')
                    break
                j += 1
            nl = src.count('\n', i, j)
            app((K_TPL, '`', line, col, d0))
            if nl:
                line += nl
                ls = src.rfind('\n', i, j) + 1
            prev = (K_TPL, '`') if closed else (K_P, '{')
            i = j
            continue
        if c in '\'"':
            m = _STR[c].match(src, i)
            if m:
                t = m.group()
                app((K_STR, t, line, i - ls, len(stack)))
                nl = t.count('\n')
                if nl:
                    line += nl
                    ls = i + t.rfind('\n') + 1
                prev = (K_STR, t)
                i = m.end()
                continue
        if c.isdigit() or (c == '.' and src[i + 1:i + 2].isdigit()):
            m = _NUM.match(src, i)
            if m:
                app((K_NUM, m.group(), line, i - ls, len(stack)))
                prev = (K_NUM, m.group())
                i = m.end()
                continue
        m = _ID.match(src, i)
        if m:
            app((K_ID, m.group(), line, i - ls, len(stack)))
            prev = (K_ID, m.group())
            i = m.end()
            continue
        if c in '([{':
            app((K_P, c, line, i - ls, len(stack)))
            stack.append('b' if c == '{' else c)
            prev = (K_P, c)
            i += 1
            continue
        if c in ')]}':
            if stack:
                stack.pop()
            app((K_P, c, line, i - ls, len(stack)))
            prev = (K_P, c)
            i += 1
            continue
        two = src[i:i + 2]
        if two in ('=>', '++', '--'):
            t = two
        elif src[i:i + 3] == '...':
            t = '...'
        else:
            t = c
        app((K_P, t, line, i - ls, len(stack)))
        prev = (K_P, t)
        i += len(t)
    return toks, len(stack)


# ------------------------------------------------------------------------------------------- analyse
CONT_PREV = {',', '=', '+', '-', '*', '/', '%', '&', '|', '^', '<', '>', '!', '?', ':', '.', '(', '[', '{', '=>', '...',
             'typeof', 'new', 'in', 'instanceof', 'void', 'delete', 'await', 'return'}
NOT_STMT_START = {'in', 'instanceof', 'of'}
CLOSERS = (')', ']', '}')
WRAP_TRAIL = {'(', ')', ';', '.', 'call', 'apply', 'this', 'window', 'globalThis', ','}


def match_close(T, i):
    """Index du fermant qui correspond à l'ouvrant T[i] (même profondeur)."""
    d, j = T[i][4], i + 1
    while j < len(T):
        if T[j][4] == d and T[j][1] in CLOSERS and T[j][0] == K_P:
            return j
        j += 1
    return len(T) - 1


def stmt_end(T, j, level):
    """Fin (exclue) du fragment d'instruction commençant en T[j] au niveau `level` : « ; », « , » ou ASI."""
    k = j
    while k < len(T):
        kind, text, ln, col, d = T[k]
        if d == level and kind == K_P and text in (',', ';'):
            return k
        if (k > j and d == level and ln > T[k - 1][2] and kind in (K_ID, K_STR, K_NUM) and text not in NOT_STMT_START
                and T[k - 1][1] not in CONT_PREV):
            return k
        k += 1
    return k


def parse_declarators(T, i, level):
    """T[i] = const|let|var. Renvoie ([(nom, ligne, indice_du_jeton_initialisateur)], indice_suivant)."""
    out, j = [], i + 1
    while j < len(T):
        t = T[j]
        if t[0] == K_ID:
            name, name_i = t[1], j
            j += 1
        elif t[0] == K_P and t[1] in '{[':          # déstructuration : ignorée
            name, name_i = None, j
            j = match_close(T, j) + 1
        else:
            break
        k = stmt_end(T, j, level)
        if name:
            init = j + 1 if j < len(T) and T[j][1] == '=' else None
            out.append((name, T[name_i][2], init, k))
        if k < len(T) and T[k][1] == ',' and T[k][4] == level:
            j = k + 1
            continue
        j = k
        break
    return out, j


def is_stmt_start(T, i):
    return i == 0 or T[i - 1][1] in (';', '}', '{') and T[i - 1][0] == K_P


def level_decls(T, lo, hi, level, need_col0):
    """Déclarations au niveau `level` pour les jetons [lo, hi). Renvoie (fns, vars, namespaces_candidates)."""
    fns, vars_, decls = [], [], []
    i = lo
    while i < hi:
        kind, text, ln, col, d = T[i]
        if d != level or kind != K_ID or (need_col0 and col != 0):
            i += 1
            continue
        if text == 'async' and i + 2 < hi and T[i + 1][1] == 'function' and T[i + 2][0] == K_ID and is_stmt_start_fn(T, i + 1):
            fns.append((T[i + 2][1], T[i + 2][2]))
            i += 3
            continue
        if text == 'function' and is_stmt_start_fn(T, i):
            j = i + 1
            if j < hi and T[j][1] == '*':
                j += 1
            if j < hi and T[j][0] == K_ID:
                fns.append((T[j][1], T[j][2]))
        elif text == 'class' and i + 1 < hi and T[i + 1][0] == K_ID and is_stmt_start_fn(T, i):
            fns.append((T[i + 1][1], T[i + 1][2]))
        elif text in ('const', 'let', 'var'):
            ds, j = parse_declarators(T, i, level)
            for name, nline, init, end in ds:
                decls.append((name, nline, init, end, text))
                vars_.append((name, nline))
            i = max(j, i + 1)
            continue
        i += 1
    return fns, vars_, decls


def is_stmt_start_fn(T, i):
    """`function`/`class`/`async function` en début d'instruction (pas une expression)."""
    p = i - 1
    if p >= 0 and T[p][1] == 'async' and T[p][0] == K_ID:
        p -= 1
    if p < 0:
        return True
    return T[p][0] == K_P and T[p][1] in (';', '}', '{') or T[p][0] == K_STR


def find_wrapper(T):
    """Module entièrement enveloppé dans une IIFE anonyme : renvoie (indice_ouvrant, profondeur_du_corps) ou None."""
    i = 0
    while i < len(T) and T[i][4] == 0 and (T[i][0] == K_STR or T[i][1] == ';'):
        i += 1
    if i >= len(T) or T[i][1] != '(' or T[i][4] != 0:
        return None
    j = match_close(T, i)
    for k in range(j + 1, len(T)):
        if T[k][4] != 0 or T[k][1] not in WRAP_TRAIL:
            return None
    for k in range(i + 1, j):
        if T[k][1] == '{':
            return i, T[k][4] + 1
    return None


def object_keys(T, o, inner):
    """Clés de premier niveau de l'objet littéral ouvert en T[o]. inner : nom -> ligne (déclarations du corps)."""
    c = match_close(T, o)
    d = T[o][4] + 1
    keys = []
    j = o + 1
    start = True
    while j < c:
        kind, text, ln, col, dd = T[j]
        if dd != d:
            j += 1
            continue
        if kind == K_P and text == ',':
            start = True
            j += 1
            continue
        if not start:
            j += 1
            continue
        start = False
        if kind == K_P and text == '...':                    # {...spread}
            j += 1
            continue
        if kind == K_ID and text in ('get', 'set', 'async', 'static') and j + 1 < c and T[j + 1][4] == d \
                and (T[j + 1][0] in (K_ID, K_STR) or T[j + 1][1] == '*') and T[j + 1][1] not in (',', ':'):
            j += 1
            kind, text, ln, col, dd = T[j]
        if kind == K_P and text == '*':
            j += 1
            kind, text, ln, col, dd = T[j]
        if kind in (K_ID, K_STR, K_NUM):
            name = text.strip('\'"')
            nxt = T[j + 1] if j + 1 < len(T) else None
            line = ln
            if nxt is not None and nxt[4] == d and nxt[1] in (',',) or (nxt is not None and j + 1 == c):
                line = inner.get(name, ln)                    # raccourci {a, b}
            elif nxt is not None and nxt[1] == ':' and j + 2 < len(T):
                v = T[j + 2]
                after = T[j + 3] if j + 3 < len(T) else None
                if v[0] == K_ID and after is not None and (after[1] == ',' and after[4] == d or j + 3 == c) and v[1] in inner:
                    line = inner[v[1]]                        # {cle: nomLocal}
            keys.append((name, line))
        j += 1
    return keys


def namespace_info(T, name, nline, init, end, level):
    """Si `const name = (function(){…})()` : (ligne, [(clé, ligne)]) ; sinon None."""
    if init is None or init + 2 >= len(T) or T[init][1] != '(' or T[init][4] != level:
        return None
    first = T[init + 1][1]
    head = [T[k][1] for k in range(init + 1, min(end, init + 40))]
    if not (first in ('function', 'async') or (first == '(' and '=>' in head[:head.index('{')] if '{' in head else False)):
        return None
    body = None
    for k in range(init + 1, end):
        if T[k][1] == '{' and T[k][0] == K_P and T[k][4] == level + 1:
            body = k
            break
    if body is None:
        return None
    bclose = match_close(T, body)
    bd = T[body][4] + 1
    _, _, inner_decls = level_decls(T, body + 1, bclose, bd, False)
    inner = {}
    fns_inner, _, _ = level_decls(T, body + 1, bclose, bd, False)
    for nm, ln in fns_inner:
        inner[nm] = ln
    for nm, ln, _, _, _ in inner_decls:
        inner.setdefault(nm, ln)
    keys, note = [], ''
    last = None
    for k in range(body + 1, bclose):
        if T[k][1] == 'return' and T[k][0] == K_ID and T[k][4] == bd:
            last = k
    if last is not None:
        o = last + 1
        if o < bclose and T[o][1] == 'Object' and o + 4 < bclose and T[o + 1][1] == '.' and T[o + 3][1] == '(':   # Object.freeze({…})
            o += 4
        if o < bclose and T[o][1] == '{':
            keys = object_keys(T, o, inner)
        elif o < bclose and T[o][0] == K_ID and o + 1 <= bclose:     # return api;  avec const api = {…}
            for nm, ln, ini, e2, _ in inner_decls:
                if nm == T[o][1] and ini is not None and ini < len(T) and T[ini][1] == '{':
                    keys = object_keys(T, ini, inner)
        if not keys:
            note = "retourne une valeur, pas un objet littéral"
    else:
        note = "pas de return d'objet"
    return nline, keys, note


def window_assigns(T):
    """`window.__X =` (hors `==`) : liste ordonnée de (nom, première ligne, nombre)."""
    seen, order = {}, []
    for i in range(len(T) - 4):
        if T[i][1] == 'window' and T[i][0] == K_ID and T[i + 1][1] == '.' and T[i + 2][0] == K_ID \
                and T[i + 2][1].startswith('__') and T[i + 3][1] == '=':
            nx = T[i + 4]
            if nx[1] == '=' and nx[2] == T[i + 3][2] and nx[3] == T[i + 3][3] + 1:
                continue
            nm = T[i + 2][1]
            if nm not in seen:
                seen[nm] = [T[i + 2][2], 0]
                order.append(nm)
            seen[nm][1] += 1
    return [(nm, seen[nm][0], seen[nm][1]) for nm in order]


_DECOR = re.compile(r'^[\s/*=\-_#~]+|[\s/*=\-_#~]+$')


def clean_comment_line(raw):
    s = raw.strip()
    s = re.sub(r'^(/\*+|//+|\*+)', '', s)
    s = re.sub(r'\*+/\s*$', '', s)
    s = _DECOR.sub('', s)
    return s if re.search(r'\w', s) and not s.startswith('@') else ''


def header_of(src):
    """1re ligne utile du commentaire de tête (après d'éventuels « use strict »)."""
    lines = src.split('\n')
    i = 0
    while i < len(lines) and (not lines[i].strip() or lines[i].strip().strip(';').strip('\'"') == 'use strict'):
        i += 1
    if i >= len(lines):
        return ''
    s = lines[i].strip()
    if s.startswith('/*'):
        while i < len(lines):
            t = clean_comment_line(lines[i])
            if t:
                return t
            if '*/' in lines[i] and i > 0 or ('*/' in lines[i][2:] and i == 0):
                break
            i += 1
    elif s.startswith('//'):
        while i < len(lines) and lines[i].strip().startswith('//'):
            t = clean_comment_line(lines[i])
            if t:
                return t
            i += 1
    return ''


_TAG = re.compile(r'@(requires-engine|requires|provides)\b')
TAG_LINES = 15      # comme build.py : balises cherchées dans les 15 premières lignes


def tags_of(src):
    """{'provides': [...], 'requires': [...], 'requires-engine': [...]} — plusieurs balises possibles par ligne."""
    out = {'provides': [], 'requires': [], 'requires-engine': []}
    for raw in src.split('\n')[:TAG_LINES]:
        text = re.sub(r'^\s*(/\*+|//+|\*+)', '', raw)
        text = re.sub(r'\*+/.*$', '', text)
        marks = list(_TAG.finditer(text))
        for i, m in enumerate(marks):
            end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
            for nm in re.split(r'[,\s]+', text[m.end():end].strip()):
                if nm and nm not in out[m.group(1)]:
                    out[m.group(1)].append(nm)
    return out


def analyse(path):
    size = os.path.getsize(path)
    if size > MAX_BYTES:
        return {'skipped': 'plus de 300 Ko, non lu'}
    with open(path, encoding='utf-8', errors='replace') as f:
        src = f.read()
    T, unbalanced = lex(src)
    info = {'lines': len(src.splitlines()), 'header': header_of(src), 'tags': tags_of(src), 'wrapper': False,
            'warn': 'accolades non équilibrées (analyse approximative)' if unbalanced else ''}
    w = find_wrapper(T)
    if w:
        info['wrapper'] = True
        level, lo, hi, col0 = w[1], w[0] + 1, match_close(T, w[0]), False
    else:
        level, lo, hi, col0 = 0, 0, len(T), True
    fns, vars_, decls = level_decls(T, lo, hi, level, col0)
    ns, ns_names = [], set()
    for name, nline, init, end, _kw in decls:
        r = namespace_info(T, name, nline, init, end, level)
        if r:
            ns.append((name, r[0], r[1], r[2]))
            ns_names.add(name)
    info['fns'] = fns
    info['vars'] = [(nm, ln) for nm, ln in vars_ if nm not in ns_names]
    info['ns'] = ns
    info['win'] = window_assigns(T)
    return info


# --------------------------------------------------------------------------------------------- sortie
def wrap(prefix, items, width=WIDTH):
    out, cur = [], prefix + items[0]
    for it in items[1:]:
        if len(cur) + 2 + len(it) > width:
            out.append(cur + ',')
            cur = '  ' + it
        else:
            cur += ', ' + it
    out.append(cur)
    return out


def resolve(entry):
    """Ligne d'ORDER.txt -> (nom affiché, chemin)."""
    if '/' in entry:
        top, rest = entry.split('/', 1)
        if top in DIRS:
            return entry, os.path.join(DIRS[top], rest)
    return entry, os.path.join(DIRS['game'], entry)


def read_order():
    for p in ORDER_CANDIDATES:
        if os.path.isfile(p):
            with open(p, encoding='utf-8') as f:
                rows = [l.split('#')[0].strip() for l in f.read().splitlines()]
            return os.path.relpath(p, ROOT), [r for r in rows if r]
    return None, []


def section(label, path):
    L = []
    if not os.path.isfile(path):
        return ['### %s (absent)' % label], None
    info = analyse(path)
    if 'skipped' in info:
        return ['### %s (%s)' % (label, info['skipped'])], None
    head = '### %s · %d l%s' % (label, info['lines'], ' [IIFE]' if info['wrapper'] else '')
    h = info['header']
    if len(h) > HEADER_MAX:
        h = h[:HEADER_MAX - 1].rstrip() + '…'
    L.append(head + (' — ' + h if h else ''))
    if info['warn']:
        L.append('- ⚠ ' + info['warn'])
    if info['fns']:
        L += wrap('- fn: ', ['%s:%d' % x for x in info['fns']])
    if info['vars']:
        L += wrap('- var: ', ['%s:%d' % x for x in info['vars']])
    for name, nline, keys, note in info['ns']:
        L += wrap('- ns %s:%d: ' % (name, nline), ['%s:%d' % k for k in keys] or ['(%s)' % (note or 'clés non détectées')])
    if info['win']:
        L += wrap('- win: ', ['%s:%d%s' % (nm, ln, '×%d' % c if c > 1 else '') for nm, ln, c in info['win']])
    tg = info['tags']
    parts = ['@%s %s' % (k, ', '.join(tg[k])) for k in ('provides', 'requires', 'requires-engine') if tg[k]]
    if parts:
        L.append('- ' + ' · '.join(parts))
    return L, info


PREAMBLE = """<!-- GÉNÉRÉ par sources/tools/codemap.py — NE PAS ÉDITER : cd demos/space-travel/sources && python3 tools/codemap.py -->
# CODEMAP — carte du code (Space Travel & Transport)

**Généré, ne pas éditer.** Régénérer : `cd demos/space-travel/sources && python3 tools/codemap.py`. Les sections suivent l'ordre de `ORDER.txt` = ordre de chargement (scripts classiques, portée globale partagée).
Usage : repérer `nom:ligne`, puis lire par plage (`sed -n 'a,bp' fichier`) plutôt que le fichier entier.
**Liste noire** (ne jamais lire en entier) : fichiers de plus de 300 Ko (dont `src/JS/vendor/*.min.js`), `*.min.html`, `sources/target/*`, `docs/spec-*-P1.md`, `docs/specs/*-autonome.md`, `STT_ModuleLibrary.json`, `*.glb`, `archives/` ; voir aussi `CLAUDE.md`.
Chemins : sans préfixe = `sources/src/JS/game/` ; `sim/`, `ui/` = `sources/src/JS/sim/`, `ui/` ; `shared/` = `demos/space-travel/shared/` (source unique, aussi utilisée par la démo « Observation des étoiles »).
Légende : `fn` = function de niveau 0 · `var` = const/let/var de niveau 0 · `ns X` = `const X = (function(){…})()` et clés de son `return {…}` final (ligne de la déclaration locale, sinon de la clé) · `win` = `window.__X =` (×n = nombre d'affectations) · `[IIFE]` = module entièrement enveloppé : les déclarations listées sont locales, seuls les `win` sont globaux · `@provides` / `@requires` = balises de dépendances."""


def main():
    order_name, order = read_order()
    listed, body, infos = set(), [], []
    for entry in order:
        label, path = resolve(entry)
        listed.add(os.path.normpath(path))
        lines, info = section(label, path)
        body += lines
        infos.append(info)
    extra = []
    for top, d in DIRS.items():
        if os.path.isdir(d):
            for fn in sorted(os.listdir(d)):
                p = os.path.normpath(os.path.join(d, fn))
                if fn.endswith('.js') and p not in listed:
                    extra.append(('%s/%s' % (top, fn) if top != 'game' else fn, p))
    if extra:
        body.append('## Hors ORDER.txt (non assemblés)')
        for label, p in extra:
            lines, info = section(label, p)
            body += lines
            infos.append(info)
    ok = [i for i in infos if i]
    stats = '%d fichiers lus (%d absents ou ignorés) · %d lignes · %d fn · %d var · %d ns · %d window.__' % (
        len(ok), len(infos) - len(ok), sum(i['lines'] for i in ok), sum(len(i['fns']) for i in ok),
        sum(len(i['vars']) for i in ok), sum(len(i['ns']) for i in ok), sum(len(i['win']) for i in ok))
    src_line = 'Source de l\'ordre : `%s` (%d entrées).' % (order_name, len(order)) if order_name \
        else 'ORDER.txt introuvable : fichiers non classés ci-dessous.'
    text = PREAMBLE + '\n' + src_line + ' ' + stats + '.\n\n## Modules\n' + '\n'.join(body) + '\n'
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print('CODEMAP.md : %d lignes, %s' % (text.count('\n'), stats))
    warn = [i['warn'] for i in ok if i['warn']]
    if warn:
        print('avertissements : %d fichier(s) à accolades non équilibrées' % len(warn), file=sys.stderr)


if __name__ == '__main__':
    main()
