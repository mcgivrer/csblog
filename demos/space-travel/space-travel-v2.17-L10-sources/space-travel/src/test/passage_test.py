"""
L2.4 — passage entre étoiles à l'échelle réelle, en temps virtuel : SAUT (séquence du jeu) puis DISTORSION
(traversée de l'espace interstellaire), sur un long-courrier (Basalte, e140). Approche et escale sautées.
Usage : python3 src/test/passage_test.py target/space-travel.html
"""
import os, re, sys, base64
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
page_path = os.path.abspath(sys.argv[1]); tag = os.path.basename(page_path).replace(".html", "")
shots = os.path.join(ROOT, "target", "shots"); os.makedirs(shots, exist_ok=True)
INIT = r"""(() => { let t = 1000; performance.now = () => t; Date.now = () => 1790000000000 + t;
  const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n, ms) => { for(let i = 0; i < n; i++){ t += (ms || 100); q.splice(0).forEach(cb => cb(t)); } }; })();"""
SAMPLE = """() => { window.__step(5); return { ph: REAL.phase, js: !!jumpState, lens: WARP.active, wl: WARP_LEVEL, gal: REAL.galPos.toArray(),
  sys: LAYERS.sysWorld.visible, fuel: fuel, cell: REAL.leg.cell, hops: REAL.hops, spd: document.getElementById('speedVal').textContent,
  nan: ![shipRig.position.x, camera.position.x, REAL.galPos.x].every(Number.isFinite), mode: REAL.lastPassage || null }; }"""
SHOT = """() => { LAYERS.skipRender = false; window.__step(1); const u = renderer.domElement.toDataURL('image/jpeg', .85); LAYERS.skipRender = true; return u; }"""
fails = []
def check(name, ok, info=""):
    print(("    PASS " if ok else "    FAIL ") + name + (f"  — {info}" if info != "" else ""))
    if not ok: fails.append(name)

def run(jump):
    with sync_playwright() as pw:
        br = pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        pg = br.new_page(viewport={"width": 640, "height": 400}); errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
        pg.route(re.compile(r"\.(mp3|ogg|wav)$"), lambda r: r.fulfill(status=404, body=""))
        pg.add_init_script(INIT)
        pg.goto("file://" + page_path + "?seed=L24-TEST&quality=fixed")
        pg.wait_for_timeout(600); pg.click("#boot")
        pg.wait_for_function("() => typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic === true", timeout=90000, polling=250)
        pg.evaluate(f"() => window.__sttQuickStart('e140', {{ jump: {'true' if jump else 'false'} }})")
        pg.wait_for_function("() => REAL.started === true", timeout=60000, polling=250)
        pg.evaluate("() => { LAYERS.skipRender = true; window.__step(3); REAL.debugSkipToDeparture(); }")
        f0, c0 = pg.evaluate("() => [fuel, REAL.leg.cell]")
        S, shot = [], None
        for i in range(160):
            s = pg.evaluate(SAMPLE); S.append(s)
            if shot is None and ((jump and s["js"] and s["lens"]) or (not jump and s["ph"] == "WARP" and s["wl"] > .8)):
                pg.evaluate("() => window.__step(" + ("8" if jump else "20") + ")")
                u = pg.evaluate(SHOT); shot = True
                open(os.path.join(shots, f"passage_{'saut' if jump else 'distorsion'}_{tag}.jpg"), "wb").write(base64.b64decode(u.split(",")[1]))
            if s["hops"] >= 1 and s["ph"] == "TRANSFER" and not s["js"]: break
        br.close()
        return S, f0, c0, errors

S, f0, c0, err = run(True)
check("saut : mode choisi", any(s["mode"] == "JUMP" for s in S))
check("saut : séquence du jeu (lentille, puits)", any(s["js"] and s["lens"] for s in S))
check("saut : arrivée dans le système suivant", S[-1]["hops"] >= 1 and S[-1]["cell"] != c0, f"{c0} → {S[-1]['cell']}")
check("saut : carburant = distance (coût du jeu)", 500 < f0 - S[-1]["fuel"] < 4000, f"{f0 - S[-1]['fuel']:.0f} unités (dont le départ)")
check("saut : transfert repris après l'onde", S[-1]["ph"] == "TRANSFER")
check("saut : aucune erreur, aucune valeur non finie", not err and not any(s["nan"] for s in S), err[:2])
S, f0, c0, err = run(False)
W = [s for s in S if s["ph"] == "WARP"]
check("distorsion : mode choisi", any(s["mode"] == "WARP" for s in S))
check("distorsion : anneaux et traînées à plein régime", max(s["wl"] for s in S) > .9, f"niveau max {max(s['wl'] for s in S):.2f}")
import math
d = [math.dist(W[0]["gal"], s["gal"]) for s in W]
check("distorsion : traversée galactique continue (parallaxe)", len(d) > 5 and all(b >= a - 1e-6 for a, b in zip(d, d[1:])) and d[-1] > 300, f"{d[-1]/38:.1f} pc parcourus en {len(W)*0.5:.1f} s")
check("distorsion : système quitté masqué pendant la traversée", any(not s["sys"] for s in W))
check("distorsion : HUD en multiples de c", any(" c" in s["spd"] for s in W), next((s["spd"] for s in W if " c" in s["spd"]), ""))
check("distorsion : arrivée dans le système suivant", S[-1]["hops"] >= 1 and S[-1]["cell"] != c0 and S[-1]["sys"], f"{c0} → {S[-1]['cell']}")
check("distorsion : aucune erreur, aucune valeur non finie", not err and not any(s["nan"] for s in S), err[:2])
sys.exit(1 if fails else 0)
