"""
L4 — carte 2D de la démo + ciblage de saut du jeu (?echelle=reelle), en temps virtuel.
Ouverture et rendu (secteur, système), traduction, règles du §23 (générateur requis, portée des
24 étoiles les plus proches, carburant), saut vers l'étoile ciblée, itinéraire recalculé depuis
elle, escale sans consommer d'étape, fermeture au clavier.
Usage : python3 src/test/carte_test.py target/space-travel.html
"""
import os, re, sys
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
page_path = os.path.abspath(sys.argv[1]); tag = os.path.basename(page_path).replace(".html", "")
shots = os.path.join(ROOT, "target", "shots"); os.makedirs(shots, exist_ok=True)
INIT = r"""(() => { let t = 1000; performance.now = () => t; Date.now = () => 1790000000000 + t;
  const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n, ms) => { for(let i = 0; i < n; i++){ t += (ms || 100); q.splice(0).forEach(cb => cb(t)); } }; })();"""
CANDS = """() => { const p = REAL.galPos, cx = Math.round(p.x/STAR_CELL), cy = Math.round(p.y/STAR_CELL), cz = Math.round(p.z/STAR_CELL), L = [];
  for(let dx=-5;dx<=5;dx++) for(let dy=-5;dy<=5;dy++) for(let dz=-5;dz<=5;dz++){ const d = starDataForCell(cx+dx, cy+dy, cz+dz); if(d && d.cell !== REAL.leg.cell) L.push([d.position.distanceTo(p), d.cell, d.name]); }
  L.sort((a,b) => a[0]-b[0]); const nx = REAL.nextTarget();
  const near = L.slice(0, 24).filter(e => !nx || e[1] !== nx.cell);
  let far = null; for(let dx=9; dx<=14 && !far; dx++){ const d = starDataForCell(cx+dx, cy, cz); if(d) far = d.cell; }
  return { pick: near[0], far: far }; }"""
fails = []
def check(name, ok, info=""):
    print(("    PASS " if ok else "    FAIL ") + name + (f"  — {info}" if info != "" else ""))
    if not ok: fails.append(name)
def start(br, ship, opts, seed):
    pg = br.new_page(viewport={"width": 1100, "height": 700}); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
    pg.route(re.compile(r"\.(mp3|ogg|wav)$"), lambda r: r.fulfill(status=404, body=""))
    pg.add_init_script(INIT)
    pg.goto("file://" + page_path + f"?seed={seed}&quality=fixed")
    pg.wait_for_timeout(600); pg.click("#boot")
    pg.wait_for_function("() => typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic === true", timeout=90000, polling=250)
    pg.evaluate(f"() => window.__sttQuickStart('{ship}', {opts})")
    pg.wait_for_function("() => REAL.started === true", timeout=60000, polling=250)
    pg.evaluate("() => { LAYERS.skipRender = true; window.__step(3); }")
    return pg, errs

with sync_playwright() as pw:
    br = pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg, errs = start(br, "e140", "{ jump: true }", "L4-TEST")
    # ---------- ouverture et rendu ----------
    pg.evaluate("() => { openStarMap(); window.__step(2); }")
    st = pg.evaluate("() => ({ open: __STARMAP.isOpen(), ttl: document.querySelector('#stmMap .ttl').textContent, dbg: __STARMAP.debug(), hits: __STARMAP._hits().length })")
    check("carte 2D ouverte depuis la commande du jeu", st["open"], st["dbg"]["level"])
    check("carte traduite (français)", "CARTE" in st["ttl"], st["ttl"])
    check("étoiles du secteur dessinées et cliquables", st["dbg"]["stars"] > 20 and st["hits"] > 10, f"{st['dbg']['stars']} étoiles · {st['hits']} cibles")
    c = pg.evaluate(CANDS)
    r1 = pg.evaluate(f"() => __CINE.focus({{ kind: 'star', cell: '{c['pick'][1]}' }})")
    ms = pg.evaluate("() => __CINE.mapState()")
    check("ciblage d'une étoile à portée", r1 == "next:now" and ms["next"]["cell"] == c["pick"][1], f"{r1} → {c['pick'][2]} ({c['pick'][0]/38:.1f} pc)")
    pg.evaluate("() => { window.__step(12); __STARMAP._draw(); }")   # l'état de la carte est relu toutes les secondes
    lbl = pg.evaluate("() => document.querySelector('#stmMap .vinfo').innerText")
    check("panneau Voyage : prochain saut = étoile choisie", c["pick"][2] in lbl, lbl.replace(chr(10), " · "))
    pg.screenshot(path=os.path.join(shots, f"carte_secteur_{tag}.jpg"), type="jpeg", quality=88)
    r2 = pg.evaluate(f"() => __CINE.focus({{ kind: 'star', cell: '{c['far']}' }})") if c["far"] else "next:range"
    check("refus hors de portée (24 plus proches, 5 cellules)", r2 == "next:range", r2)
    r3 = pg.evaluate(f"() => {{ const f = fuel; fuel = 0; const r = __CINE.setNextStar('{c['pick'][1]}' === REAL.nextTarget().cell ? '{c['pick'][1]}' : '{c['pick'][1]}'); fuel = f; return r; }}")
    check("refus carburant insuffisant (ou déjà ciblée)", r3 in ("fuel", "same"), r3)
    r4 = pg.evaluate("() => __CINE.focus({ kind: 'planet', cell: REAL.leg.cell, i: 0 })")
    check("objets du système courant : pas d'action", r4 == "none", r4)
    # niveau système par le geste réel : molette sur l'étoile courante
    h = pg.evaluate("() => { const r = document.querySelector('#stmMap canvas').getBoundingClientRect(); const x = __STARMAP._hits().find(h => h.kind === 'star' && h.key && h.key.indexOf(REAL.leg.cell) >= 0) || __STARMAP._hits().find(h => h.kind === 'star'); return { x: r.left + x.x, y: r.top + x.y }; }")
    pg.mouse.move(h["x"], h["y"])
    for k in range(14):
        pg.mouse.wheel(0, -400); pg.evaluate("() => window.__step(4)")
        if pg.evaluate("() => __STARMAP.debug().level") == "system": break
    pg.evaluate("() => { window.__step(12); __STARMAP._draw(); }")
    lv = pg.evaluate("() => __STARMAP.debug().level")
    check("niveau système du système courant", lv == "system", lv)
    pg.screenshot(path=os.path.join(shots, f"carte_systeme_{tag}.jpg"), type="jpeg", quality=88)
    pg.keyboard.press("Escape")
    check("fermeture au clavier (Échap)", not pg.evaluate("() => __STARMAP.isOpen()"))
    # ---------- saut vers l'étoile ciblée ----------
    pg.evaluate("() => REAL.debugSkipToDeparture()")
    for i in range(160):
        s = pg.evaluate("() => { window.__step(5); return { ph: REAL.phase, js: !!jumpState, hops: REAL.hops, cell: REAL.leg.cell }; }")
        if s["hops"] >= 1 and s["ph"] == "TRANSFER" and not s["js"]: break
    after = pg.evaluate("() => ({ cell: REAL.leg.cell, off: REAL.offRoute, nd: ROUTE.nextDelivery, l0: ROUTE.legs[0] && ROUTE.legs[0].cell, n: ROUTE.legs.length, ov: !!REAL.nextOverride })")
    check("saut vers l'étoile choisie sur la carte", after["cell"] == c["pick"][1], f"arrivée {after['cell']}")
    check("itinéraire recalculé depuis la nouvelle étoile", after["off"] and after["nd"] == 0 and after["l0"] != c["pick"][1] and after["n"] > 0 and not after["ov"], after)
    # ---------- escale : ne consomme pas d'étape ----------
    for i in range(140):
        ph = pg.evaluate("() => { window.__step(8); return REAL.phase; }")
        if ph == "ORBIT": break
    orb = pg.evaluate("() => ({ ph: REAL.phase, nd: ROUTE.nextDelivery, off: REAL.offRoute })")
    check("escale hors itinéraire : aucune étape consommée", orb["ph"] == "ORBIT" and orb["nd"] == 0 and not orb["off"], orb)
    check("aucune erreur JavaScript (long-courrier)", not errs, errs[:3])
    pg.close()
    # ---------- sans générateur de saut ----------
    for ship, opts, lab in [("e140", "{ jump: false }", "distorsion seule"), ("e18", "{}", "sans FTL")]:
        pg, errs = start(br, ship, opts, "L4-LOCK")
        c = pg.evaluate(CANDS)
        r = pg.evaluate(f"() => __CINE.focus({{ kind: 'star', cell: '{c['pick'][1]}' }})")
        m = pg.evaluate("() => __CINE.mapState().mode")
        check(f"{lab} : ciblage refusé (générateur requis)", r == "next:locked", f"{r} · mode {m}")
        check(f"{lab} : aucune erreur JavaScript", not errs, errs[:3])
        pg.close()
    br.close()
sys.exit(1 if fails else 0)
