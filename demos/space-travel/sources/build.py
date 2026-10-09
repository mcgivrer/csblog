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
aussi utilisée par la démo « Observation des étoiles »). Une ligne « sim/x.js » ou « ui/x.js »
lit src/JS/sim/x.js ou src/JS/ui/x.js (couche de simulation sans THREE ni DOM, couche d'interface).
Les données src/data/*.json sont validées puis embarquées dans la page (<script id="sttData">).
"""
import base64, json, os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC, TARGET = os.path.join(ROOT, 'src'), os.path.join(ROOT, 'target')

def read(*p):
    with open(os.path.join(SRC, *p), encoding='utf-8') as f:
        return f.read()

SHARED = os.path.join(ROOT, '..', 'shared')   # modules communs au jeu et à la démo « Observation des étoiles »
ASSETS = os.path.join(SRC, 'assets')           # pack des modules du chantier naval (scripts/build_game_pack.py du projet Blender)
COMPOSITIONS = os.path.join(SRC, 'data', 'compositions')   # vaisseaux et stations exportés par l'éditeur (stt-composition)
DATA = os.path.join(SRC, 'data')               # données de jeu (*.json) embarquées dans <script id="sttData">
VENDOR = ['three.r128.min.js', 'GLTFLoader.r128.min.js', 'meshopt_decoder.r128.js']
# Champs obligatoires par fichier de src/data/ : la page ne démarre pas une campagne sans eux.
DATA_REQUIS = {'economy.json': ('startCredits', 'starter', 'autosaveSeconds')}
# Modules dont l'en-tête « /* @provides A, B @requires C, D */ » est contrôlé (les modules historiques n'en ont pas).
CONTROLES = ('sim/', 'ui/', '45-campaign-bridge.js')
I18N_PARITE = os.path.join(ROOT, 'tools', 'i18n_parity.mjs')   # parité fr/en/de/es du littéral I18N (Node)

def module_path(name):
    """Chemin d'une ligne d'ORDER.txt : shared/ -> ../shared/, sim/ et ui/ -> src/JS/, sinon src/JS/game/."""
    if name.startswith('shared/'):
        return os.path.join(SHARED, name[len('shared/'):])
    if name.startswith(('sim/', 'ui/')):
        return os.path.join(SRC, 'JS', *name.split('/'))
    return os.path.join(SRC, 'JS', 'game', name)

def read_module(name):
    path = module_path(name)
    if not os.path.isfile(path):
        sys.exit(f'  ORDER.txt : module introuvable : {name} ({os.path.relpath(path, ROOT)})')
    with open(path, encoding='utf-8') as f:
        return f.read()

def header_tags(text):
    """Balises @provides / @requires / @requires-engine des 15 premières lignes (une balise par ligne,
    noms séparés par des virgules ; le texte libre après le premier mot d'un nom est ignoré)."""
    tags = {'provides': [], 'requires': [], 'requires-engine': []}
    for line in text.splitlines()[:15]:
        for tag, value in re.findall(r'@(provides|requires-engine|requires)\b([^@]*)', line.split('*/')[0]):
            for item in value.split(','):
                m = re.match(r'\s*([A-Za-z_$][\w$]*)', item)
                if m:
                    tags[tag].append(m.group(1))
    return tags

def check_order(order):
    """Chaque @requires d'un module contrôlé doit être fourni (@provides) par un module placé plus haut dans
    ORDER.txt. Les @requires-engine (globales historiques du moteur) ne sont pas vérifiés. Arrêt sinon."""
    provided, errors, nb = set(), [], 0
    for name in order:
        if not name.startswith(CONTROLES):
            continue
        tags = header_tags(read_module(name))
        for r in tags['requires']:
            nb += 1
            if r not in provided:
                errors.append(f'  {name} : @requires {r} n\'est fourni par aucun module placé plus haut dans ORDER.txt')
        provided.update(tags['provides'])
    if errors:
        sys.exit('\n'.join(errors))
    return f'ordre : {nb} @requires'

def data_files():
    """Fichiers src/data/*.json (hors sous-dossier compositions/) validés par json.load, en {nom_sans_extension: contenu}.
    Les champs de DATA_REQUIS sont obligatoires : erreur claire et arrêt sinon."""
    out = {}
    for f in sorted(os.listdir(DATA)) if os.path.isdir(DATA) else []:
        if not f.endswith('.json') or not os.path.isfile(os.path.join(DATA, f)):
            continue
        try:
            with open(os.path.join(DATA, f), encoding='utf-8') as fh:
                out[f[:-len('.json')]] = json.load(fh)
        except ValueError as e:
            sys.exit(f'  data/{f} : JSON invalide ({e})')
    for f, champs in DATA_REQUIS.items():
        obj = out.get(f[:-len('.json')])
        if obj is None:
            sys.exit(f'  data/{f} : fichier obligatoire absent ou vide')
        manque = [c for c in champs if not isinstance(obj, dict) or obj.get(c) is None]
        if manque:
            sys.exit(f'  data/{f} : champ(s) obligatoire(s) manquant(s) : {", ".join(manque)}')
    return out

def data_block():
    """Bloc <script type="application/json" id="sttData"> lu par DATA.get() (sim/02-data.js) : {nom: contenu}."""
    data = data_files()
    raw = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    return '<script type="application/json" id="sttData">' + raw.replace('</', '<\\/') + '</script>', \
           f'données : {", ".join(data) or "aucune"} ({len(raw) // 1024 + 1} Ko)'

def i18n_parity():
    """Parité des clés fr/en/de/es de I18N (tools/i18n_parity.mjs, Node). Erreur : arrêt ; node absent : avertissement."""
    if not shutil.which('node'):
        print('  avertissement : node absent, parité i18n non vérifiée')
        return 'i18n non vérifiée'
    r = subprocess.run(['node', I18N_PARITE], capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        sys.exit((r.stdout + r.stderr).rstrip())
    lines = r.stdout.rstrip().splitlines()
    for l in lines[:-1]:       # avertissements éventuels (clés exemptées), puis une ligne de synthèse
        print(l)
    return lines[-1].strip()

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
    ordre_info = check_order(order)
    game = '\n'.join(read_module(name) for name in order)
    data_html, data_info = data_block()
    i18n_info = i18n_parity()
    vendor = '\n'.join(read('JS', 'vendor', v) for v in VENDOR)
    pack_html, pack_info = pack()
    template = read('html', 'index.template.html')
    if '<!--@DATA@-->' not in template:
        sys.exit('  index.template.html : marqueur <!--@DATA@--> absent')
    page = (template
            .replace('/*@CSS@*/', read('css', 'main.css'), 1)
            .replace('<!--@DATA@-->', data_html, 1)
            .replace('<!--@PACK@-->', pack_html, 1)
            .replace('/*@VENDOR@*/', vendor, 1)
            .replace('/*@JS@*/', game, 1))
    os.makedirs(TARGET, exist_ok=True)
    out = os.path.join(TARGET, 'space-travel.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(page)
    print(f'  {len(order)} modules -> {os.path.relpath(out, ROOT)} ({len(page.encode()) // 1024} Ko) · {pack_info} · {data_info} · {ordre_info} · {i18n_info}')
    return out

def package():
    subprocess.run(['node', os.path.join(ROOT, 'tools', 'minify.js'),
                    os.path.join(TARGET, 'space-travel.html'),
                    os.path.join(TARGET, 'space-travel.min.html')], check=True)

def test():
    ok = True
    unit = os.path.join(SRC, 'test', 'unit')
    if os.path.isdir(unit):    # tests Node de la couche sim/ (node:test), avant les tests Playwright
        fichiers = sorted(os.path.join(unit, f) for f in os.listdir(unit) if f.endswith('.test.mjs'))
        if not shutil.which('node'):
            print('  avertissement : node absent, tests unitaires non lancés')
        elif fichiers:     # fichiers listés un à un : « node --test <dossier> » échoue depuis Node 22
            print('  node --test src/test/unit/')
            ok &= subprocess.run(['node', '--test'] + fichiers, cwd=ROOT).returncode == 0
    try:
        import playwright.sync_api   # noqa: F401
    except ImportError:
        sys.exit('  Playwright pour Python est absent : pip install playwright && playwright install chromium')
    tests = sorted(t for t in os.listdir(os.path.join(SRC, 'test')) if t.endswith('_test.py'))   # les *_bench.py ne sont pas lancés
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
