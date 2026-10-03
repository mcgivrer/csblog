"""
Test de fumée — space-travel.html (source ou obfusquée).
Démarrage complet (terminal, langue, hangar), 12 s de jeu, puis contrôles :
aucune erreur JS, route calculée, vaisseau en mouvement, cadence mesurée, capture.
Usage : python3 src/test/smoke_test.py target/space-travel.html
Chromium headless (SwiftShader) : la cadence n'est qu'un ordre de grandeur.
"""
import os, re, sys, json
if os.path.isdir("/opt/pw-browsers"): os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")   # bac a sable d origine ; ailleurs, emplacement par defaut de Playwright
from playwright.sync_api import sync_playwright

page_path = os.path.abspath(sys.argv[1])
shots = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "target", "shots")
os.makedirs(shots, exist_ok=True)
tag = os.path.basename(page_path).replace(".html", "")
fails = []
def check(name, ok, info=""):
    print(("    PASS " if ok else "    FAIL ") + name + (f"  — {info}" if info != "" else ""))
    if not ok: fails.append(name)

with sync_playwright() as pw:
    br = pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = br.new_page(viewport={"width": 960, "height": 600})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
    pg.route(re.compile(r"\.(mp3|ogg|wav)$"), lambda r: r.fulfill(status=404, body=""))
    pg.goto("file://" + page_path)
    pg.wait_for_timeout(800)
    pg.click("#boot")
    # le jeu fournit un démarrage rapide pour les tests (__sttQuickStart) : même chemin
    # que « Embarquer », sans l'aperçu 3D du hangar, très lent en rendu logiciel
    pg.wait_for_function("() => typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic === true", timeout=90000)
    pg.evaluate("() => window.__sttQuickStart(SHIP_DEFAULT_ID)")
    pg.wait_for_function("() => gameStarted === true", timeout=30000)
    p0 = pg.evaluate("() => shipRig.position.toArray()")
    pg.wait_for_timeout(12000)
    st = pg.evaluate("""() => ({
      legs: ROUTE.legs.length, p: shipRig.position.toArray(), phase: flightPhase,
      calls: (typeof LAYERS !== 'undefined') ? LAYERS.stats.calls : renderer.info.render.calls,
      tris: (typeof LAYERS !== 'undefined') ? LAYERS.stats.triangles : renderer.info.render.triangles,
      ship: (typeof SHIP_DEFAULT_ID !== 'undefined') ? SHIP_DEFAULT_ID : null })""")
    fps = pg.evaluate("""() => new Promise(res => { let n = 0; const t0 = performance.now();
      function f(){ if(++n < 10) requestAnimationFrame(f); else res(1000*n/(performance.now()-t0)); } requestAnimationFrame(f); })""")
    # chemins de rendu secondaires : passe de lentille (saut/supraluminique) et navette + conteneur
    paths = pg.evaluate("""() => { const o = {};
      try { WARP.active = true; renderMain(); WARP.active = false; o.lens = 'ok'; } catch(e){ o.lens = String(e); }
      try { startShuttleLoading(false); const L = orbitState.loading;
            o.shuttle = (L && L.shuttle.group.parent) ? L.shuttle.group.parent.name || 'scene' : 'absente'; renderMain(); } catch(e){ o.shuttle = String(e); }
      return o; }""")
    pg.screenshot(path=os.path.join(shots, f"smoke_{tag}.png"))
    moved = sum((a - b) ** 2 for a, b in zip(st["p"], p0)) ** 0.5
    check("démarrage complet (terminal, langue, hangar)", True)
    check("itinéraire calculé", st["legs"] > 0, f"{st['legs']} étapes")
    check("le vaisseau se déplace", moved > 1, f"{moved:.0f} u en 12 s · phase {st['phase']}")
    check("appels de dessin mesurés", st["calls"] > 0, f"{st['calls']} appels · {st['tris']} triangles")
    check("cadence (SwiftShader, indicatif)", True, f"{fps:.1f} img/s")
    check("passe de lentille (saut, supraluminique)", paths["lens"] == "ok", paths["lens"])
    check("navette et conteneur dans la bonne couche", paths["shuttle"] in ("shipWorld", "scene"), paths["shuttle"])
    check("aucune erreur JavaScript", not errors, errors[:3])
    br.close()
sys.exit(1 if fails else 0)
