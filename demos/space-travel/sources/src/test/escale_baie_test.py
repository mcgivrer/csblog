"""
Escale d'un vaisseau à baie (lot N2) — ce que le test de la navette de baie ne vérifiait pas :
  - l'escale ne se termine JAMAIS tant qu'une navette est dehors (le plafond de 90 s la coupait navette encore aux abords) ;
  - le plan automatique de suivi de la navette est bien filmé ;
  - aucune rotation brusque de la navette sur tout son cycle (baie → pile → vol → retour → baie) ;
  - la navette reste à une distance plausible du vaisseau (elle ne poursuit pas un vaisseau reparti).
Usage : python3 src/test/escale_baie_test.py target/space-travel.html [modèle]
"""
import os, re, sys, math, json
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
from playwright.sync_api import sync_playwright
page_path = os.path.abspath(sys.argv[1]); ship = sys.argv[2] if len(sys.argv) > 2 else "e140"
INIT = r"""(() => { let t = 1000; performance.now = () => t; Date.now = () => 1790000000000 + t;
  const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n, ms) => { for(let i = 0; i < n; i++){ t += (ms || 100); q.splice(0).forEach(cb => cb(t)); } }; })();"""
P = """() => { const L = orbitState.loading, s = orbitState.shuttles[0], a = GP.state.auto;
  const g = L ? L.shuttle.group : s ? s.group : null;
  return { out: !!g, ph: L ? 'L:' + L.phase : s ? 'S:' + s.phase + (s.enterPlan ? '/entrée' : '') : null, fp: flightPhase,
    d: g ? g.getWorldPosition(new THREE.Vector3()).distanceTo(shipRig.position) : 0, q: g ? g.quaternion.toArray() : null, auto: a ? a.type : null }; }"""
def qang(a, b): return 2*math.acos(min(1, abs(sum(x*y for x, y in zip(a, b)))))
fails = []
def check(name, ok, info=""):
    print(("    PASS " if ok else "    FAIL ") + name + (f"  — {info}" if info != "" else ""))
    if not ok: fails.append(name)
with sync_playwright() as pw:
    br = pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = br.new_page(viewport={"width": 640, "height": 400}); errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
    pg.add_init_script(INIT)
    pg.goto("file://" + page_path + "?seed=GP-TEST&quality=fixed"); pg.wait_for_timeout(600); pg.click("#boot")
    pg.wait_for_function("() => typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic === true", timeout=90000, polling=250)
    pg.evaluate(f"() => window.__sttQuickStart('{ship}', {{ jump: true }})")
    pg.wait_for_function("() => REAL.started === true", timeout=60000, polling=250)
    pg.evaluate("() => { LAYERS.skipRender = true; window.__step(3); for(let i = 0; i < 900 && REAL.phase !== 'ORBIT'; i++) window.__step(1); }")
    S = []
    for i in range(12000):
        p = pg.evaluate("() => { window.__step(1, 33.3); return (" + P + ")(); }")
        S.append(p)
        if p["fp"] != "ARRIVAL_PAUSE" and not p["out"]: break
    br.close()
cruise_out = [p for p in S if p["fp"] != "ARRIVAL_PAUSE" and p["out"]]
check("escale terminée seulement navette rentrée", not cruise_out and S[-1]["fp"] != "ARRIVAL_PAUSE",
      f"{len(cruise_out)} images en croisière navette dehors" if cruise_out else f"escale de {len(S)*.0333:.0f} s")
autos = {p["auto"] for p in S if p["auto"]}
check("plan de suivi de la navette filmé", "shuttleFollow" in autos, sorted(autos))
w = [(qang(a["q"], b["q"])*30, b["ph"]) for a, b in zip(S, S[1:]) if a["q"] and b["q"] and a["ph"] and b["ph"]]
wm = max(w) if w else (0, None)
check("navette sans rotation brusque sur tout le cycle (< 3 rad/s)", wm[0] < 3, f"max {wm[0]:.2f} rad/s ({wm[1]})")
dmax = max(p["d"] for p in S)
check("navette jamais à plus de 5 000 km du vaisseau", dmax < 5e6, f"{dmax/1e3:.0f} km au plus")
check("aucune erreur JavaScript", not errors, errors[:2])
sys.exit(1 if fails else 0)
