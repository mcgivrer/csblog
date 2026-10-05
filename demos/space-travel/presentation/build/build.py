#!/usr/bin/env python3
"""
Voyage Spatial — présentation à fond cinématique : assemblage des pages.

  python3 build/build.py            compile puis test
  python3 build/build.py compile    src/ + modules partagés + three r128 -> dist/*.html (lisibles)
  python3 build/build.py test       tests de tests/ sur les pages de dist/ (Playwright + Chromium)

Chaque page est un gabarit de src/html/ où « /*@VENDOR@*/ » reçoit three r128 (lu dans le jeu,
sources/src/JS/vendor/) et « /*@JS@*/ » la concaténation des modules listés ci-dessous, dans cet ordre :
ce sont des scripts classiques qui partagent la portée globale. Une entrée « shared/x.js » est lue
dans ../shared/ (source unique, commune au jeu et à la démo « Observation des étoiles »).
"""
import os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, DIST = os.path.join(ROOT, 'src'), os.path.join(ROOT, 'dist')
SHARED = os.path.join(ROOT, '..', 'shared')
VENDOR = os.path.join(ROOT, '..', 'sources', 'src', 'JS', 'vendor', 'three.r128.min.js')

# page produite -> (gabarit, modules)
PAGES = {
    'cosmos-test.html': ('cosmos-test.template.html', [
        'shared/planets.js', 'shared/asteroids.js', 'shared/stars.js', 'shared/cosmos.js',
        'cosmos-test.js',
    ]),
}
TESTS = [('cosmos_test.py', 'cosmos-test.html')]


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def module(name):
    path = os.path.join(SHARED, name[len('shared/'):]) if name.startswith('shared/') else os.path.join(SRC, name)
    if not os.path.isfile(path):
        sys.exit(f'  module introuvable : {name} ({os.path.relpath(path, ROOT)})')
    return f'/* ===== {name} ===== */\n' + read(path)


def compile_pages():
    os.makedirs(DIST, exist_ok=True)
    vendor = read(VENDOR)
    for out, (tpl, mods) in PAGES.items():
        html = read(os.path.join(SRC, 'html', tpl))
        for marker in ('/*@VENDOR@*/', '/*@JS@*/'):
            if html.count(marker) != 1:
                sys.exit(f'  {tpl} : marqueur {marker} absent ou répété')
        js = '\n'.join(module(m) for m in mods)
        html = html.replace('/*@VENDOR@*/', escape_script(vendor)).replace('/*@JS@*/', escape_script(js))
        with open(os.path.join(DIST, out), 'w', encoding='utf-8') as f:
            f.write(html)
        print(f'  dist/{out}  {len(html)/1024:.0f} Ko  ({len(mods)} modules)')


def escape_script(s):
    """Un </script> littéral dans un module fermerait la balise : on le neutralise."""
    return s.replace('</script>', '<\\/script>')


def run_tests():
    game = os.path.join(ROOT, '..', 'sources', 'target', 'space-travel.html')
    failed = []
    for test, page in TESTS:
        args = [sys.executable, os.path.join(ROOT, 'tests', test), os.path.join(DIST, page)]
        if os.path.isfile(game):
            args.append(game)
        print(f'  {test}')
        if subprocess.call(args) != 0:
            failed.append(test)
    if failed:
        sys.exit('  échecs : ' + ', '.join(failed))


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if cmd in ('compile', 'all'):
        compile_pages()
    if cmd in ('test', 'all'):
        run_tests()
