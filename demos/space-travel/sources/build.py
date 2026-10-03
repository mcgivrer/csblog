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
import base64, json, os, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC, TARGET = os.path.join(ROOT, 'src'), os.path.join(ROOT, 'target')

def read(*p):
    with open(os.path.join(SRC, *p), encoding='utf-8') as f:
        return f.read()

SHARED = os.path.join(ROOT, '..', 'shared')   # modules communs au jeu et à la démo « Observation des étoiles »
ASSETS = os.path.join(SRC, 'assets')           # pack des modules du chantier naval (scripts/build_game_pack.py du projet Blender)
COMPOSITIONS = os.path.join(SRC, 'data', 'compositions')   # vaisseaux et stations exportés par l'éditeur (stt-composition)
VENDOR = ['three.r128.min.js', 'GLTFLoader.r128.min.js', 'meshopt_decoder.r128.js']

def read_module(name):
    if name.startswith('shared/'):
        with open(os.path.join(SHARED, name[len('shared/'):]), encoding='utf-8') as f:
            return f.read()
    return read('JS', 'game', name)

def compositions():
    """Fichiers stt-composition de src/data/compositions/ (ordre alphabétique) ; les autres JSON sont refusés."""
    out = []
    if not os.path.isdir(COMPOSITIONS):
        return out
    for f in sorted(os.listdir(COMPOSITIONS)):
        if not f.endswith('.json'):
            continue
        with open(os.path.join(COMPOSITIONS, f), encoding='utf-8') as fh:
            c = json.load(fh)
        if c.get('format') != 'stt-composition' or not isinstance(c.get('parts'), list) or not isinstance(c.get('links'), list):
            sys.exit(f'  {f} : ce n\'est pas un fichier stt-composition (export « Pour le jeu » de l\'éditeur)')
        out.append(c)
    return out

def pack():
    """Pack embarqué (lu par 09c-vaisseaux-modulaires.js) : bibliothèque de modules en base64, sous-ensemble de
    fleet.json, images des livrées, compositions. Bloc <script type="application/json"> : ni terser ni minification."""
    glb = os.path.join(ASSETS, 'stt_modules.glb')
    if not os.path.exists(glb):
        return '', 'pas de pack de modules (src/assets/stt_modules.glb absent)'
    b64 = lambda p: base64.b64encode(open(p, 'rb').read()).decode('ascii')
    img_dir = os.path.join(ASSETS, 'img')
    img = {os.path.splitext(f)[0]: b64(os.path.join(img_dir, f)) for f in sorted(os.listdir(img_dir)) if f.endswith('.webp')} if os.path.isdir(img_dir) else {}
    with open(os.path.join(ASSETS, 'stt_fleet.json'), encoding='utf-8') as fh:
        fleet = json.load(fh)
    comps = compositions()
    data = json.dumps({'v': 1, 'glb': b64(glb), 'fleet': fleet, 'img': img, 'comps': comps}, ensure_ascii=False, separators=(',', ':'))
    ships = sum(1 for c in comps if c.get('type') != 'station')
    info = f'pack {len(data) // 1024} Ko : {ships} vaisseau(x), {len(comps) - ships} station(s) modulaires'
    return '<script type="application/json" id="sttPack">' + data.replace('</', '<\\/') + '</script>', info

def compile_page():
    order = [l.strip() for l in read('JS', 'game', 'ORDER.txt').splitlines() if l.strip()]
    game = '\n'.join(read_module(name) for name in order)
    vendor = '\n'.join(read('JS', 'vendor', v) for v in VENDOR)
    pack_html, pack_info = pack()
    page = (read('html', 'index.template.html')
            .replace('/*@CSS@*/', read('css', 'main.css'), 1)
            .replace('<!--@PACK@-->', pack_html, 1)
            .replace('/*@VENDOR@*/', vendor, 1)
            .replace('/*@JS@*/', game, 1))
    os.makedirs(TARGET, exist_ok=True)
    out = os.path.join(TARGET, 'space-travel.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(page)
    print(f'  {len(order)} modules -> {os.path.relpath(out, ROOT)} ({len(page.encode()) // 1024} Ko) · {pack_info}')
    return out

def package():
    subprocess.run(['node', os.path.join(ROOT, 'tools', 'minify.js'),
                    os.path.join(TARGET, 'space-travel.html'),
                    os.path.join(TARGET, 'space-travel.min.html')], check=True)

def test():
    try:
        import playwright.sync_api   # noqa: F401
    except ImportError:
        sys.exit('  Playwright pour Python est absent : pip install playwright && playwright install chromium')
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
