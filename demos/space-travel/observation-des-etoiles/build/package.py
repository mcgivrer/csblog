# Construit le zip du projet « Observation des étoiles » (sources, build, tests, docs, dernière version)
import os, shutil, json, sys, subprocess
VER = sys.argv[1] if len(sys.argv) > 1 else '6.6'
SRC = os.path.dirname(os.path.abspath(__file__)); OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(SRC, 'pkg')
D = os.path.join(OUT, 'observation-des-etoiles'); shutil.rmtree(OUT, ignore_errors=True)
for d in ['engine', 'src', 'build', 'tests', 'docs', 'dist']: os.makedirs(os.path.join(D, d), exist_ok=True)
cp = lambda a, b: shutil.copy(os.path.join(SRC, a), os.path.join(D, b))
MODS = ['planets.js', 'asteroids.js', 'stars.js', 'shipdrive.js', 'shipglass.js', 'warpring.js', 'shipwear.js', 'hitex.js', 'smallcraft.js', 'warships.js', 'postfx.js', 'cine.js', 'starmap.js', 'radar.js']
cp('README.md', 'README.md'); cp('observation-des-etoiles.html', f'observation-des-etoiles-v{VER}.html'); cp('observation-des-etoiles.min.html', f'observation-des-etoiles-v{VER}.min.html')
cp('game.html', 'engine/game.html')
for f in ['head_guard2.js', 'live2.js'] + MODS: cp(f, 'src/' + f)
for f in sys.argv[3:]: shutil.copy(f, os.path.join(D, 'docs', os.path.basename(f)))
open(os.path.join(D, 'dist', '.gitkeep'), 'w').write('')
open(os.path.join(D, '.gitignore'), 'w').write('node_modules/\ndist/*.html\n*.jpg\n!docs/*.jpg\n')
open(os.path.join(D, 'build', 'build.py'), 'w').write(f'''# Assemble la démo : moteur du jeu inchangé + garde + scripts de la démo -> dist/observation-des-etoiles.html
import os
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
P = lambda *a: os.path.join(R, *a)
rd = lambda *a: open(P(*a), encoding='utf8').read()
s = rd('engine', 'game.html')
s = s.replace('<title>Voyage spatial — Navigation quantique</title>', '<title>Space Travel & Transport — Observation des étoiles</title>')
guard = rd('src', 'head_guard2.js')
demo = '\\n'.join(rd('src', f) for f in {MODS!r})
live = rd('src', 'live2.js')
i = s.index('<script>'); s = s[:i] + '<script>\\n' + guard + '\\n</script>\\n' + s[i:]
j = s.rindex('</body>'); s = s[:j] + '<script>\\n' + demo + '\\n</script>\\n<script>\\n' + live + '\\n</script>\\n' + s[j:]
os.makedirs(P('dist'), exist_ok=True)
open(P('dist', 'observation-des-etoiles.html'), 'w', encoding='utf8').write(s)
print('dist/observation-des-etoiles.html', len(s))
''')
bm = open(os.path.join(SRC, 'build_min.js')).read()
bm = bm.replace("const { minify } = require('./tools/node_modules/terser');", "const { minify } = require('terser');").replace("const CleanCSS = require('./tools/node_modules/clean-css');", "const CleanCSS = require('clean-css');\nconst R = path.join(__dirname, '..'), P = (...a) => path.join(R, ...a);")
bm = bm.replace("fs.readFileSync('game.html', 'utf8')", "fs.readFileSync(P('engine', 'game.html'), 'utf8')").replace("fs.readFileSync('head_guard2.js','utf8')", "fs.readFileSync(P('src', 'head_guard2.js'),'utf8')")
bm = bm.replace(".map(f => fs.readFileSync(f,'utf8'))", ".map(f => fs.readFileSync(P('src', f),'utf8'))").replace("fs.readFileSync('live2.js','utf8')", "fs.readFileSync(P('src', 'live2.js'),'utf8')")
bm = bm.replace("fs.writeFileSync('observation-des-etoiles.min.html', s);", "fs.mkdirSync(P('dist'), { recursive: true }); fs.writeFileSync(P('dist', 'observation-des-etoiles.min.html'), s);")
assert "P('src', f)" in bm and "P('dist'" in bm and 'smallcraft.js' in bm
open(os.path.join(D, 'build', 'build_min.js'), 'w').write(bm)
shutil.copy(__file__, os.path.join(D, 'build', 'package.py'))
T = {'t11.js': 'smoke.js', 't19k.js': 'longrun.js', 't12.js': 'shots.js', 't31.js': 'hangar.js', 't30.js': 'geode.js', 't33.js': 'fleet.js', 't34.js': 'drawcalls.js', 't38.js': 'framecalls.js', 't39.js': 'orientation.js', 't41.js': 'heroes.js', 't40.js': 'selector.js', 't43.js': 'map-api.js', 't44.js': 'map.js', 't45.js': 'map-jumps.js', 't46.js': 'map-mobile.js', 't47.js': 'map-stress.js', 't49.js': 'loading-fx.js', 't50.js': 'dof.js', 't51.js': 'gimbal-shake.js', 't52.js': 'jump-dof.js', 't53.js': 'cabins.js', 't54.js': 'suite.js', 't55.js': 'textures-inventory.js', 't56.js': 'textures.js', 't57.js': 'liveries.js', 't58.js': 'warp-rings.js', 't59.js': 'cme.js', 't60.js': 'ftl-means.js', 't61.js': 'interiors.js', 't62.js': 'military.js', 't63.js': 'military-2.js'}
for a, b in T.items():
    s = open(os.path.join(SRC, a)).read()
    s = s.replace("require('/home/claude/.npm-global/lib/node_modules/playwright')", "require('playwright')")
    s = s.replace("'file:///home/claude/st/'+f+", "ROOT + (f || 'dist/observation-des-etoiles.min.html') + ")
    s = s.replace("'file:///home/claude/st/observation-des-etoiles.html", "ROOT + 'dist/observation-des-etoiles.html")
    s = s.replace("'file:///home/claude/st/observation-des-etoiles.min.html", "ROOT + 'dist/observation-des-etoiles.min.html")
    s = s.replace("'file:///home/claude/st/' + (process.argv[4] || 'observation-des-etoiles.html')", "ROOT + (process.argv[4] || 'dist/observation-des-etoiles.html')")
    s = s.replace("'file:///home/claude/st/' + (process.env.HTML || 'observation-des-etoiles.html')", "ROOT + (process.env.HTML || 'dist/observation-des-etoiles.html')")
    assert '/home/claude' not in s, a
    L = s.split('\n'); k = 1 if L[0].startswith('//') else 0
    L.insert(k + 1, "const ROOT = 'file://' + require('path').resolve(__dirname, '..') + '/';   // racine du projet ; lancer d'abord build/build.py")
    open(os.path.join(D, 'tests', b), 'w').write('\n'.join(L))
pk = {"name": "observation-des-etoiles", "version": VER + ".0", "private": True,
      "description": "Démo cinématique infinie sur le moteur Space Travel & Transport v2.15 — (c) 2026 Frédéric Delorme & claude.ai",
      "scripts": {"build": "python3 build/build.py", "build:min": "node build/build_min.js", "test:smoke": "node tests/smoke.js", "test:long": "node tests/longrun.js LONG-10"},
      "devDependencies": {"clean-css": "^5.3.3", "terser": "^5.51.2", "playwright": "^1.56.0"}}
open(os.path.join(D, 'package.json'), 'w').write(json.dumps(pk, ensure_ascii=False, indent=2) + '\n')
# vérification : le build du package redonne exactement la version livrée
subprocess.run([sys.executable, os.path.join(D, 'build', 'build.py')], check=True)
same = open(os.path.join(D, 'dist', 'observation-des-etoiles.html'), 'rb').read() == open(os.path.join(D, f'observation-des-etoiles-v{VER}.html'), 'rb').read()
print('build identique :', same); os.remove(os.path.join(D, 'dist', 'observation-des-etoiles.html'))
z = os.path.join(OUT, f'observation-des-etoiles-v{VER}-projet.zip')
subprocess.run(['zip', '-r', '-9', '-q', z, 'observation-des-etoiles'], cwd=OUT, check=True)
print(z, os.path.getsize(z))
