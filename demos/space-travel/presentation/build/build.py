#!/usr/bin/env python3
"""
Voyage Spatial — présentation à fond cinématique : assemblage des pages.

  python3 build/build.py            compile, version compacte, puis test
  python3 build/build.py compile    src/ + modules partagés + three r128 -> dist/*.html (lisibles)
  python3 build/build.py package    dist/presentation.min.html (minifieur du jeu : node + terser, npm install dans sources/)
  python3 build/build.py test       tests de tests/ sur les pages de dist/ (Playwright + Chromium)
  python3 build/build.py apercu     media/apercu.jpg : aperçu de partage 1200 × 630 (slide de titre)

Chaque page est un gabarit de src/html/ où « /*@VENDOR@*/ » reçoit three r128 (lu dans le jeu,
sources/src/JS/vendor/) et « /*@JS@*/ » la concaténation des modules listés ci-dessous, dans cet ordre :
ce sont des scripts classiques qui partagent la portée globale. Une entrée « shared/x.js » est lue
dans ../shared/ (source unique, commune au jeu et à la démo « Observation des étoiles »).
"""
import base64, os, re, shutil, subprocess, sys

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
    'realisateur-test.html': ('realisateur-test.template.html', [
        'shared/planets.js', 'shared/asteroids.js', 'shared/stars.js', 'shared/cosmos.js',
        'realisateur.js', 'realisateur-test.js',
    ]),
    'photo-test.html': ('photo-test.template.html', [
        'shared/planets.js', 'shared/asteroids.js', 'shared/stars.js', 'shared/cosmos.js',
        'realisateur.js', 'photo.js', 'photo-test.js',
    ]),
    'presentation.html': ('presentation.template.html', [
        'shared/planets.js', 'shared/asteroids.js', 'shared/stars.js', 'shared/cosmos.js',
        'realisateur.js', 'photo.js', 'qualite.js', 'clip.js', 'lecteur.js',
    ]),
}
TESTS = [('cosmos_test.py', 'cosmos-test.html'), ('realisateur_test.py', 'realisateur-test.html'), ('photo_test.py', 'photo-test.html'),
         ('lecteur_test.py', 'presentation.html'), ('lecteur_test.py', 'presentation.min.html')]
MINIFY = os.path.join(ROOT, '..', 'sources', 'tools', 'minify.js')
APERCU = {'seed': 'COSMOS', 'rz': 'APERCU-1', 'steps': 75}     # univers par défaut, montage figé pour l'aperçu


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
        html = inline_images(html, tpl)
        js = '\n'.join(module(m) for m in mods)
        html = html.replace('/*@VENDOR@*/', escape_script(vendor)).replace('/*@JS@*/', escape_script(js))
        with open(os.path.join(DIST, out), 'w', encoding='utf-8') as f:
            f.write(html)
        print(f'  dist/{out}  {len(html)/1024:.0f} Ko  ({len(mods)} modules)')


MIME = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml'}


def inline_images(html, tpl):
    """Les images des slides (src="media/…" ou src="../docs/…", relatifs à presentation/) sont intégrées en data URI :
    la page publiée reste un fichier unique, sur GitHub Pages comme en page Claude."""
    def one(m):
        rel = m.group(1); path = os.path.normpath(os.path.join(ROOT, rel)); ext = os.path.splitext(rel)[1].lower()
        if ext not in MIME or not os.path.isfile(path):
            sys.exit(f'  {tpl} : image introuvable ou de type inconnu : {rel}')
        with open(path, 'rb') as f:
            return 'src="data:' + MIME[ext] + ';base64,' + base64.b64encode(f.read()).decode('ascii') + '"'
    return re.sub(r'src="((?:media/|\.\./docs/)[\w./-]+\.(?:jpe?g|png|webp|svg))"', one, html)


def escape_script(s):
    """Un </script> littéral dans un module fermerait la balise : on le neutralise."""
    return s.replace('</script>', '<\\/script>')


def package():
    """Version compacte de la présentation : le minifieur du jeu ne repasse que le dernier <script> (les modules)."""
    if not shutil.which('node') or not os.path.isdir(os.path.join(ROOT, '..', 'sources', 'node_modules')):
        print('  avertissement : node ou sources/node_modules absent (npm install dans sources/) : version compacte non produite')
        return
    subprocess.run(['node', MINIFY, os.path.join(DIST, 'presentation.html'), os.path.join(DIST, 'presentation.min.html')], check=True)


def apercu():
    """Aperçu de partage (Open Graph) : la slide de titre en 1200 × 630, sans interface, rendue par Chromium."""
    if os.path.isdir('/opt/pw-browsers'):
        os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
    from playwright.sync_api import sync_playwright
    from PIL import Image
    init = ("(() => { let t = 1000; performance.now = () => t; window.__SKIP_RENDER = true; const q = [];"
            " window.requestAnimationFrame = cb => { q.push(cb); return q.length; };"
            " window.__step = (n, ms) => { for(let i = 0; i < n; i++){ t += ms; q.splice(0).forEach(cb => cb(t)); } }; })();")
    out = os.path.join(ROOT, 'media', 'apercu.jpg'); os.makedirs(os.path.dirname(out), exist_ok=True)
    with sync_playwright() as pw:
        br = pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = br.new_page(viewport={'width': 1200, 'height': 630})
        pg.add_init_script(init)
        pg.goto('file://' + os.path.join(DIST, 'presentation.html') + f"?seed={APERCU['seed']}&rz={APERCU['rz']}&quality=fixed", timeout=180000)
        pg.wait_for_function('() => window.__TEST && window.__TEST.ready === true', timeout=120000)
        pg.add_style_tag(content='.curseur{ animation:none !important; }')
        pg.evaluate(f"() => {{ document.body.classList.add('sans-ui'); __step({APERCU['steps']}, 1000/30); }}")
        pg.evaluate("() => { window.__SKIP_RENDER = false; __step(2, 1000/30); window.__SKIP_RENDER = true; }")
        pg.wait_for_timeout(1500)
        png = out[:-4] + '.png'; pg.screenshot(path=png); br.close()
    Image.open(png).convert('RGB').save(out, quality=86, optimize=True, progressive=True); os.remove(png)
    print(f'  media/apercu.jpg  {os.path.getsize(out)/1024:.0f} Ko')


def run_tests():
    game = os.path.join(ROOT, '..', 'sources', 'target', 'space-travel.html')
    failed = []
    for test, page in TESTS:
        if not os.path.isfile(os.path.join(DIST, page)):
            print(f'  {test} {page} : page absente, ignoré')
            continue
        args = [sys.executable, os.path.join(ROOT, 'tests', test), os.path.join(DIST, page)]
        if os.path.isfile(game):
            args.append(game)
        print(f'  {test} {page}')
        if subprocess.call(args) != 0:
            failed.append(test)
    if failed:
        sys.exit('  échecs : ' + ', '.join(failed))


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if cmd in ('compile', 'all'):
        compile_pages()
    if cmd in ('package', 'all'):
        package()
    if cmd == 'apercu':
        apercu()
    if cmd in ('test', 'all'):
        run_tests()
