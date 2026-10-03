"""
Survol du système (plan cinématique, suite de L5), en temps virtuel : arrivée par saut → survol automatique de
chaque planète pendant le transfert → retour au vaisseau avant l'approche ; puis survol à la demande (G) en orbite,
interrompu par une touche. Usage : python3 src/test/survol_test.py target/space-travel.html
"""
import os, re, sys, base64, json
if os.path.isdir("/opt/pw-browsers"): os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")   # bac a sable d origine ; ailleurs, emplacement par defaut de Playwright
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
page_path = os.path.abspath(sys.argv[1]); tag = os.path.basename(page_path).replace(".html", "")
shots = os.path.join(ROOT, "target", "shots"); os.makedirs(shots, exist_ok=True)
INIT = r"""(() => { let t = 1000; performance.now = () => t; Date.now = () => 1790000000000 + t;
  const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n, ms) => { for(let i = 0; i < n; i++){ t += (ms || 100); q.splice(0).forEach(cb => cb(t)); } }; })();"""
SHOT = """() => { LAYERS.skipRender = false; window.__step(1); const u = renderer.domElement.toDataURL('image/jpeg', .88); LAYERS.skipRender = true; return u; }"""
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
    pg.goto("file://" + page_path + "?seed=SURVOL-TEST&quality=fixed")
    pg.wait_for_timeout(600); pg.click("#boot")
    pg.wait_for_function("() => typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic === true", timeout=90000, polling=250)
    pg.evaluate("() => window.__sttQuickStart('e140', { jump: true })")
    pg.wait_for_function("() => REAL.started === true", timeout=60000, polling=250)
    auto0 = pg.evaluate("() => { LAYERS.skipRender = true; window.__step(5); return SURVOL.isActive(); }")
    check("pas de survol au démarrage (seulement après un passage)", not auto0)
    pg.evaluate("() => REAL.debugSkipToDeparture()")
    st = None
    for i in range(900):
        st = pg.evaluate("() => { window.__step(1); return { a: SURVOL.isActive(), hops: REAL.hops, ph: REAL.phase }; }")
        if st["a"]: break
    check("survol automatique à l'arrivée par saut", st and st["a"] and st["hops"] >= 1 and st["ph"] == "TRANSFER", st)
    info = pg.evaluate("() => ({ n: REAL.leg.planets.length, dur: SURVOL.total(), tau: REAL.tau, names: REAL.leg.planets.map(p => p.properName) })")
    mins = {}; caps = set(); shot_i = 0; end = None; dshipMax = 0
    for i in range(int(info["dur"]*10) + 60):
        s = pg.evaluate("""() => { window.__step(1); const c = camera.position;
          const d = REAL.leg.planets.map(p => (c.distanceTo(p.position) - p.radius)/p.radius);
          const cap = document.getElementById('survolCap'); const S = SURVOL.state, seg = S.segs[S.i];
          return { a: SURVOL.isActive(), d, cap: cap && cap.style.opacity === '1' ? cap.querySelector('.n').textContent : null, ph: REAL.phase,
                   kind: seg ? seg.kind : null, k: seg ? S.t/seg.dur : 0, fin: [c.x, c.y, c.z].every(Number.isFinite),
                   dship: c.distanceTo(shipRig.position)/SHIP_GAME_LEN }; }""")
        for j, v in enumerate(s["d"]): mins[j] = min(mins.get(j, 1e99), v)
        if s["cap"]: caps.add(s["cap"])
        if s["kind"] == "fly" and .45 < s["k"] < .6 and shot_i < 2:
            u = pg.evaluate(SHOT); open(os.path.join(shots, f"survol_{shot_i}_{tag}.jpg"), "wb").write(base64.b64decode(u.split(",")[1])); shot_i += 1; pg.evaluate("() => window.__step(8)")
        if not s["fin"]: break
        if not s["a"]: end = s; break
    check("chaque planète approchée de près", len(mins) == info["n"] and all(v < 6 for v in mins.values()),
          " · ".join(f"{info['names'][j]} {v:.1f} R" for j, v in sorted(mins.items())))
    check("légende affichée pour chaque planète", len(caps) == info["n"], sorted(caps))
    check("survol terminé avant l'approche manuelle", end is not None and end["ph"] == "TRANSFER", end and end["ph"])
    check("retour derrière le vaisseau", end is not None and end["dship"] < 4, f"{end['dship']:.1f} longueurs" if end else "")
    appr = pg.evaluate("() => { for(let i = 0; i < 120 && REAL.phase === 'TRANSFER'; i++) window.__step(1); return REAL.phase; }")
    check("approche atteinte juste après le survol (temps du transfert recalé)", appr == "APPROACH", f"durée du survol {info['dur']:.1f} s · τ ×{info['tau']:.0f} · {appr}")
    g1 = pg.evaluate("() => { window.__step(2); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG', key: 'g' })); return SURVOL.isActive(); }")
    check("G refusé pendant l'approche (pilotage manuel)", not g1)
    pg.evaluate("() => { for(let i = 0; i < 900 && REAL.phase !== 'ORBIT'; i++) window.__step(1); window.__step(40); }")
    g2 = pg.evaluate("() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG', key: 'g' })); return { a: SURVOL.isActive(), ph: REAL.phase }; }")
    check("G lance le survol en orbite", g2["a"] and g2["ph"] == "ORBIT", g2)
    sk = pg.evaluate("""() => { window.__step(25); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
      let n = 0; while(SURVOL.isActive() && n < 40){ window.__step(1); n++; }
      return { a: SURVOL.isActive(), n, dship: camera.position.distanceTo(shipRig.position)/SHIP_GAME_LEN, gp: !!(typeof GP !== 'undefined' && GP.state.auto) }; }""")
    # en escale, les plans automatiques des navettes (L10) peuvent reprendre la main juste après : caméra alors près de la navette
    check("une touche interrompt le survol et ramène au vaisseau (ou aux plans des navettes)", not sk["a"] and sk["n"] <= 12 and (sk["dship"] < 4 or sk["gp"]), sk)
    check("aucune erreur JavaScript", not errors, errors[:3])
    br.close()
sys.exit(1 if fails else 0)
