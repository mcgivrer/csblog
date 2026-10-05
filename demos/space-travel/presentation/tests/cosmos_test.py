"""
Lot P1 — moteur allégé shared/cosmos.js, sur la visionneuse de test :
démarrage sans erreur ; aucune géométrie de vaisseau, station, port ni navette ; déterminisme (même graine → mêmes
systèmes, d'un chargement à l'autre) ; parité avec le jeu (REAL.systemInfo) quand sa page est fournie ; changement de
système sans fuite de géométries ; captures de l'étoile, des planètes, d'une lune et d'un amas d'astéroïdes (non noires).
Usage : python3 tests/cosmos_test.py dist/cosmos-test.html [../sources/target/space-travel.html]
"""
import os, re, sys, json, base64, io
if os.path.isdir("/opt/pw-browsers"): os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
page_path = os.path.abspath(sys.argv[1])
game_path = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else None
SEED = "COSMOS-TEST"
shots = os.path.join(ROOT, "dist", "shots"); os.makedirs(shots, exist_ok=True)
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
fails = []
def check(name, ok, info=""):
    print(("    PASS " if ok else "    FAIL ") + name + (f"  — {info}" if info != "" else ""))
    if not ok: fails.append(name)

CELLS = "() => { const W = __TEST.W, out = []; for(let x = -2; x <= 2 && out.length < 8; x++) for(let y = -1; y <= 1 && out.length < 8; y++){ const sd = W.starData(x, y, 0); if(sd) out.push(sd.cell); } return out; }"
INFO = """(cells) => cells.map(c => { const e = __TEST.W.systemInfo(c); return { cell: c, name: e.name, des: e.designation, lum: +e.lum.toPrecision(10), belt: e.belt && e.belt.map(x => +x.toPrecision(10)),
  planets: e.planets.map(p => [p.name, p.kind, +p.R.toPrecision(10), +p.a.toPrecision(10), !!p.rings, p.moons, !!p.hab, +p.ang.toFixed(9)]) }; })"""
GAME_INFO = """(cells) => cells.map(c => { const e = REAL.systemInfo(c); return { cell: c, name: e.name, des: e.designation, lum: +e.lum.toPrecision(10), belt: e.belt && e.belt.map(x => +x.toPrecision(10)),
  planets: e.planets.map(p => [p.name, p.kind, +p.R.toPrecision(10), +p.a.toPrecision(10), !!p.rings, p.moons, !!p.hab, +p.ang.toFixed(9)]) }; })"""
NO_SHIP = """() => { const W = __TEST.W, bad = [], types = {};
  const SHIPNAME = /ship|vaiss|navette|shuttle|station|port|dock|bay|baie|hull|coque|container|conteneur/i;
  const OK = new Set(['Scene', 'Group', 'Object3D', 'Mesh', 'Points', 'Sprite', 'AmbientLight', 'DirectionalLight']);
  [W.galScene, W.sysScene].forEach(sc => sc.traverse(o => { types[o.type] = (types[o.type] || 0) + 1;
    if(o.name && SHIPNAME.test(o.name)) bad.push('nom ' + o.name); if(!OK.has(o.type)) bad.push('type ' + o.type); }));
  const globals = ['shipRig', 'SHIPGEN', 'MODSHIP', 'REAL', 'PORTS', 'NAVETTE', 'SHIPFX'].filter(g => typeof window[g] !== 'undefined');
  return { bad: bad.slice(0, 10), types, globals }; }"""
SHOT = "() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(__TEST.renderer.domElement.toDataURL('image/jpeg', .9)))))"

def stats(data_url):
    from PIL import Image, ImageStat
    im = Image.open(io.BytesIO(base64.b64decode(data_url.split(",")[1]))).convert("RGB")
    st = ImageStat.Stat(im.convert("L")); return st.mean[0], st.stddev[0], im

def open_page(br, path, query):
    pg = br.new_page(viewport={"width": 960, "height": 540}); errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
    pg.goto("file://" + path + query, timeout=180000)
    return pg, errors

with sync_playwright() as pw:
    br = pw.chromium.launch(args=ARGS)
    # 1) premier chargement : cellules d'essai et leurs systèmes (page fermée ensuite : swiftshader est lent à deux pages)
    pa, err_a = open_page(br, page_path, f"?seed={SEED}&quality=fixed")
    pa.wait_for_function("() => window.__TEST && window.__TEST.ready === true", timeout=120000, polling=250)
    cells = pa.evaluate(CELLS); info1 = pa.evaluate(INFO, cells); pa.close()
    check("cellules d'essai", len(cells) >= 4, cells)

    # 2) parité avec le jeu (même graine) quand sa page est fournie
    if game_path and os.path.isfile(game_path):
        gp, gerr = open_page(br, game_path, f"?seed={SEED}&quality=fixed")
        gp.wait_for_timeout(600)
        try:
            if gp.query_selector("#boot"): gp.click("#boot")
            gp.wait_for_function("() => typeof REAL !== 'undefined' && typeof REAL.systemInfo === 'function' && typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic === true", timeout=120000, polling=250)
            ginfo = gp.evaluate(GAME_INFO, cells)
            diffs = [f"{a['cell']}: {a['name']} / {b['name']}" for a, b in zip(info1, ginfo) if a != b]
            check("parité avec le jeu (REAL.systemInfo, même graine)", not diffs, "; ".join(diffs[:3]) or f"{len(cells)} systèmes identiques")
        except Exception as e:
            check("parité avec le jeu (REAL.systemInfo, même graine)", False, str(e)[:200])
        gp.close()
    else:
        print("    (parité avec le jeu non vérifiée : page du jeu non fournie)")

    # 3) second chargement : déterminisme, puis tous les autres contrôles sur cette page
    pg, errors = open_page(br, page_path, f"?seed={SEED}&quality=fixed")
    pg.wait_for_function("() => window.__TEST && window.__TEST.ready === true", timeout=120000, polling=250)
    pg.wait_for_timeout(1500)
    check("démarrage sans erreur", not errors and not err_a, "; ".join((err_a + errors)[:3]))
    check("déterminisme d'un chargement à l'autre", pg.evaluate(INFO, cells) == info1)
    leg = pg.evaluate("() => { const L = __TEST.W.leg; return { name: L.name, n: L.planets.length, star3: !!L.star3, fx: L.planets.every(p => !!p.fx) }; }")
    check("système construit (étoile, planètes détaillées)", leg["star3"] and leg["fx"] and 2 <= leg["n"] <= 3, leg)
    ns = pg.evaluate(NO_SHIP)
    check("aucun vaisseau, station, port ni navette", not ns["bad"], ns["bad"])
    check("aucun module du jeu chargé", not ns["globals"], ns["globals"])

    # captures : étoile, chaque planète, une lune, un amas d'astéroïdes
    targets = pg.evaluate("""() => { const L = __TEST.W.leg, out = ['star']; L.planets.forEach((p, i) => out.push('planet:' + i));
      const pi = L.planets.findIndex(p => p.moonPivots.length); if(pi >= 0) out.push('moon:' + pi + ':0'); return out; }""")
    for key in targets:
        pg.evaluate("(k) => __TEST.focus(k, true)", key); pg.wait_for_timeout(900)
        u = pg.evaluate(SHOT); m, sd, im = stats(u)
        name = key.replace(":", "-"); im.save(os.path.join(shots, f"cosmos-{name}.jpg"))
        check(f"capture {key} non noire", m > 6 and sd > 8, f"moyenne {m:.1f}, écart {sd:.1f}")
    has = pg.evaluate("() => { const c = __TEST.W.beltCluster(.7); __TEST.state.cluster = c; return !!c && c.rocks.length > 10; }")
    check("amas d'astéroïdes", has)
    pg.evaluate("() => __TEST.focus('belt', true)"); pg.wait_for_timeout(900)
    m, sd, im = stats(pg.evaluate(SHOT)); im.save(os.path.join(shots, "cosmos-belt.jpg"))
    check("capture amas non noire", m > 3 and sd > 6, f"moyenne {m:.1f}, écart {sd:.1f}")

    # changement de système : pas de fuite de géométries ni de textures
    mem0 = pg.evaluate("() => { const i = __TEST.renderer.info.memory; return [i.geometries, i.textures]; }")
    for k in range(4):
        pg.evaluate("(k) => __TEST.enter(__TEST.state.sys + 1)", k); pg.wait_for_timeout(700)
    pg.evaluate("() => __TEST.enter(0)"); pg.wait_for_timeout(1200)
    mem1 = pg.evaluate("() => { const i = __TEST.renderer.info.memory; return [i.geometries, i.textures]; }")
    check("changement de système sans fuite", mem1[0] <= mem0[0] + 12 and mem1[1] <= mem0[1] + 6, f"géométries {mem0[0]} → {mem1[0]}, textures {mem0[1]} → {mem1[1]}")
    check("aucune erreur au total", not errors, "; ".join(errors[:3]))
    br.close()

print(f"  {'ÉCHEC' if fails else 'OK'} — cosmos_test ({len(fails)} échec(s))")
sys.exit(1 if fails else 0)
