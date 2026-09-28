"""
Séquence de titre — plans-séquences dans des systèmes réels, en temps virtuel (30 images/s, sans rendu sauf captures) :
choix des systèmes, étoile / planètes / lune approchées, jamais à travers un astre, plan continu (pas d'à-coup
d'orientation hors traversée), fondu au noir et changement de système, démarrage propre du jeu.
Usage : python3 src/test/titre_test.py target/space-travel.html
"""
import os, re, sys, math, base64
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
page_path = os.path.abspath(sys.argv[1]); tag = os.path.basename(page_path).replace(".html", "")
shots = os.path.join(ROOT, "target", "shots"); os.makedirs(shots, exist_ok=True)
INIT = r"""(() => { let t = 1000; performance.now = () => t; Date.now = () => 1790000000000 + t;
  const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n, ms) => { for(let i = 0; i < n; i++){ t += (ms || 100); q.splice(0).forEach(cb => cb(t)); } }; })();"""
PROBE = """() => { window.__step(1, 33.3); const L = REAL.leg, c = camera.position, S = TITLE.state;
  let pmin = 1e9, mmin = 1e9;
  L.planets.forEach(p => { pmin = Math.min(pmin, (c.distanceTo(p.position))/p.radius);
    (p.moonPivots || []).forEach(pv => { const m = pv.children[0]; if(m) mmin = Math.min(mmin, c.distanceTo(m.getWorldPosition(new THREE.Vector3()))/m.scale.x); }); });
  return { cell: L.cell, q: camera.quaternion.toArray(), star: c.length()/L.Rs, pmin, mmin, fade: !!S.fade, vo: S.veil ? +S.veil.style.opacity : 0, vis: LAYERS.sysWorld.visible,
           seg: S.segs[S.i] ? (S.segs[S.i].moon ? 'lune' : S.segs[S.i].kind) : null, k: S.segs[S.i] ? S.t/S.segs[S.i].dur : 0, i: S.i,
           fin: [c.x, c.y, c.z].every(Number.isFinite) }; }"""
SHOT = """() => { LAYERS.skipRender = false; window.__step(1, 33.3); const u = renderer.domElement.toDataURL('image/jpeg', .9); LAYERS.skipRender = true; return u; }"""
fails = []
def check(name, ok, info=""):
    print(("    PASS " if ok else "    FAIL ") + name + (f"  — {info}" if info != "" else ""))
    if not ok: fails.append(name)
def qang(a, b): return 2*math.acos(min(1, abs(sum(x*y for x, y in zip(a, b)))))
with sync_playwright() as pw:
    br = pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = br.new_page(viewport={"width": 640, "height": 400}); errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
    pg.add_init_script(INIT)
    pg.goto("file://" + page_path + "?seed=TITRE-TEST&quality=fixed")
    pg.wait_for_timeout(600); pg.click("#boot")
    pg.wait_for_function("() => typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic === true", timeout=90000, polling=250)
    pg.evaluate("() => { LAYERS.skipRender = true; window.__step(2, 33.3); }")
    sel = pg.evaluate("""() => { const all = []; for(let x = -2; x <= 2; x++) for(let y = -2; y <= 2; y++) for(let z = -2; z <= 2; z++){ const sd = starDataForCell(x, y, z); if(sd){ const s = TITLE.scoreSystem(REAL.systemInfo(sd.cell)); if(s >= 0) all.push(s); } }
      all.sort((a, b) => a - b); return { on: TITLE.state.on, chosen: TITLE.state.list.map(x => x.score), median: all[Math.floor(all.length/2)], n: all.length }; }""")
    check("séquence de titre active, systèmes choisis parmi les plus spectaculaires", sel["on"] and len(sel["chosen"]) >= 2 and min(sel["chosen"]) > sel["median"],
          f"notes {', '.join(f'{s:.1f}' for s in sel['chosen'])} · médiane du voisinage {sel['median']:.1f} sur {sel['n']} systèmes")
    S, shot_done = [], set()
    for i in range(2400):                                  # 80 s : deux systèmes et une traversée
        p = pg.evaluate(PROBE); S.append(p)
        key = None
        if p["seg"] == "path" and p["i"] == 0 and .5 < p["k"] < .56 and not p["fade"] and len(cells) == 1: key = "1_etoile"
        if p["seg"] == "lune" and .62 < p["k"] < .68: key = "2_planete_lune"
        if p["fade"] and p["vo"] > .4 and p["vo"] < .8: key = "3_fondu"
        cells = []; [cells.append(x["cell"]) for x in S if not cells or cells[-1] != x["cell"]]
        if len(cells) > 1 and p["seg"] == "path" and p["i"] == 0 and .5 < p["k"] < .56 and not p["fade"]: key = "4_etoile_suivante"
        if key and key not in shot_done:
            u = pg.evaluate(SHOT); open(os.path.join(shots, f"titre_{key}_{tag}.jpg"), "wb").write(base64.b64decode(u.split(",")[1])); shot_done.add(key)
        if len(cells) > 2: break
    cells = []; [cells.append(x["cell"]) for x in S if not cells or cells[-1] != x["cell"]]
    sw = [b for a, b in zip(S, S[1:]) if a["cell"] != b["cell"]]
    check("fondu au noir vers un autre système (changement dans le noir)", len(cells) >= 2 and sw and all(b["vo"] > .97 for b in sw), f"{len(cells)} systèmes · opacité au changement {[round(b['vo'], 2) for b in sw]}")
    vis = [x for x in S if x["vis"]]
    check("étoile approchée (< 20 rayons stellaires)", min(x["star"] for x in vis) < 20, f"{min(x['star'] for x in vis):.1f} Rs")
    check("planètes approchées (< 5 rayons)", min(x["pmin"] for x in vis) < 5, f"{min(x['pmin'] for x in vis):.2f} R")
    check("une lune approchée (< 15 rayons de lune)", min(x["mmin"] for x in vis) < 15, f"{min(x['mmin'] for x in vis):.1f} rayons")
    check("jamais à travers un astre", min(x["pmin"] for x in vis) >= 1.29 and min(x["star"] for x in vis) >= 2.99, f"planète {min(x['pmin'] for x in vis):.2f} R · étoile {min(x['star'] for x in vis):.2f} Rs")
    rot = [(qang(a["q"], b["q"])*30, b["seg"], round(b["k"], 2), b["i"]) for a, b in zip(S, S[1:]) if a["cell"] == b["cell"] and a["vis"] and b["vis"]]
    worst = max(rot)
    check("plan continu : pas d'à-coup d'orientation dans un système", worst[0] < 4, f"rotation max {worst[0]:.2f} rad/s (segment {worst[1]} n°{worst[3]}, k = {worst[2]})")
    check("aucune valeur non finie", all(x["fin"] for x in S))
    g = pg.evaluate("""() => { window.__sttQuickStart('e140', { jump: true }); window.__step(3, 33.3);
      return { started: REAL.started, title: REAL.titleActive, on: TITLE.state.on, vo: TITLE.state.veil ? +TITLE.state.veil.style.opacity : 0, ov: !!REAL.galOverride, cell: REAL.leg.cell, route: ROUTE.legs[0].cell, vis: shipRig.visible && LAYERS.sysWorld.visible }; }""")
    check("démarrage du jeu : séquence arrêtée, premier système de l'itinéraire", g["started"] and not g["title"] and not g["on"] and g["vo"] == 0 and not g["ov"] and g["cell"] == g["route"] and g["vis"], g)
    check("aucune erreur JavaScript", not errors, errors[:3])
    print("    captures :", sorted(shot_done))
    br.close()
sys.exit(1 if fails else 0)
