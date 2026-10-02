#!/usr/bin/env python3
"""
Space Travel & Transport — build à la racine du projet.

  python3 build.py compile   assemble src/ -> target/space-travel.html (lisible)
  python3 build.py test      tests de src/test/ sur les pages de target/
  python3 build.py package   target/space-travel.min.html (obfusquée : node + terser)
  python3 build.py           les trois, dans cet ordre

Prérequis : Python 3 (compile), Node + `npm install` (package), Playwright + Chromium (test).
L'ordre des modules de jeu est celui de src/JS/game/ORDER.txt : ce sont des scripts
classiques qui partagent la portée globale, l'ordre de concaténation fait partie du code.
Une ligne « shared/x.js » désigne un module commun, lu dans ../shared/ (source unique,
aussi utilisée par la démo « Observation des étoiles »).
"""
import os, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC, TARGET = os.path.join(ROOT, 'src'), os.path.join(ROOT, 'target')

def read(*p):
    with open(os.path.join(SRC, *p), encoding='utf-8') as f:
        return f.read()

SHARED = os.path.join(ROOT, '..', 'shared')   # modules communs au jeu et à la démo « Observation des étoiles »

def read_module(name):
    if name.startswith('shared/'):
        with open(os.path.join(SHARED, name[len('shared/'):]), encoding='utf-8') as f:
            return f.read()
    return read('JS', 'game', name)

def compile_page():
    order = [l.strip() for l in read('JS', 'game', 'ORDER.txt').splitlines() if l.strip()]
    game = '\n'.join(read_module(name) for name in order)
    page = (read('html', 'index.template.html')
            .replace('/*@CSS@*/', read('css', 'main.css'), 1)
            .replace('/*@VENDOR@*/', read('JS', 'vendor', 'three.r128.min.js'), 1)
            .replace('/*@JS@*/', game, 1))
    os.makedirs(TARGET, exist_ok=True)
    out = os.path.join(TARGET, 'space-travel.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(page)
    print(f'  {len(order)} modules -> {os.path.relpath(out, ROOT)} ({len(page.encode()) // 1024} Ko)')
    return out

def package():
    subprocess.run(['node', os.path.join(ROOT, 'tools', 'minify.js'),
                    os.path.join(TARGET, 'space-travel.html'),
                    os.path.join(TARGET, 'space-travel.min.html')], check=True)

def test():
    tests = sorted(t for t in os.listdir(os.path.join(SRC, 'test')) if t.endswith('_test.py'))
    ok = True
    for page in ('space-travel.html', 'space-travel.min.html'):
        path = os.path.join(TARGET, page)
        if not os.path.exists(path):
            continue
        for t in tests:
            print(f'  {t} sur {page}')
            ok &= subprocess.run([sys.executable, os.path.join(SRC, 'test', t), path]).returncode == 0
    if not ok:
        sys.exit(1)

if __name__ == '__main__':
    steps = sys.argv[1:] or ['compile', 'package', 'test']
    for s in steps:
        print(f'[{s}]')
        {'compile': compile_page, 'package': package, 'test': test}[s]()
