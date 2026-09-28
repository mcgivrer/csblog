"""
L10 — gros plans et profondeur de champ, en temps virtuel : mode « GROS PLANS » (cycle des modes de caméra),
plans du vaisseau hors de la coque et cadrés sur leur sujet, profondeur de champ active et mise au point,
plans automatiques des navettes à l'escale (chargement puis suivi de la navette), retour à la poursuite.
Usage : python3 src/test/gros_plans_test.py target/space-travel.html
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
SHOT = """() => { LAYERS.skipRender = false; window.__step(1); const u = renderer.domElement.toDataURL('image/jpeg', .88); LAYERS.skipRender = true; return u; }"""
PROBE = """() => { const S = GP.state, sh = S.auto || S.shot; if(!sh || !sh.lastLook) return null;
  const inside = SHIP_HULL ? SHIP_BUILD.hullBox.containsPoint(SHIP_HULL.worldToLocal(camera.position.clone())) : false;
  const n = sh.lastLook.clone().project(camera);
  return { type: sh.type, inside, onScreen: Math.abs(n.x) < 1 && Math.abs(n.y) < 1 && n.z < 1, k: GP.dof.k, focus: GP.dof.focus,
           dist: camera.position.distanceTo(sh.lastLook), fin: [camera.position.x, camera.position.y].every(Number.isFinite) }; }"""
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
    pg.goto("file://" + page_path + "?seed=GP-TEST&quality=fixed")
    pg.wait_for_timeout(600); pg.click("#boot")
    pg.wait_for_function("() => typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic === true", timeout=90000, polling=250)
    pg.evaluate("() => window.__sttQuickStart('e140', { jump: true })")
    pg.wait_for_function("() => REAL.started === true", timeout=60000, polling=250)
    pg.evaluate("() => { LAYERS.skipRender = true; window.__step(3); }")
    m = pg.evaluate("() => { const i0 = cameraMode; while(CAMERA_MODES[cameraMode] !== 'closeup'){ cameraMode = (cameraMode + 1) % CAMERA_MODES.length; } return { modes: CAMERA_MODES.slice(), label: t('cam_closeup') }; }")
    check("mode « gros plans » dans le cycle des caméras", "closeup" in m["modes"] and m["label"] == "GROS PLANS", m)
    types, bad, offscreen, dofk, n = set(), 0, 0, [], 0
    for i in range(240):
        p = pg.evaluate("() => { window.__step(2); return (" + PROBE + ")(); }")
        if not p: continue
        n += 1; types.add(p["type"])
        if p["inside"] or not p["fin"]: bad += 1
        if not p["onScreen"]: offscreen += 1
        dofk.append((p["k"], p["focus"], p["dist"]))
        if len(types) in (2, 4) and not os.path.exists(os.path.join(shots, f"gp_{p['type']}_{tag}.jpg")):
            u = pg.evaluate(SHOT); open(os.path.join(shots, f"gp_{p['type']}_{tag}.jpg"), "wb").write(base64.b64decode(u.split(",")[1]))
    check("plusieurs plans du vaisseau enchaînés", len(types) >= 4, sorted(types))
    check("caméra jamais dans la coque", bad == 0, f"{bad}/{n} relevés")
    check("sujet toujours à l'écran", offscreen == 0, f"{offscreen}/{n} relevés hors champ")
    ks = [k for k, f, d in dofk if k > .9]
    foc = [abs(f/d - 1) for k, f, d in dofk if k > .9 and f]
    check("profondeur de champ active, mise au point sur le sujet", len(ks) > n*.6 and max(foc) < .25, f"k > 0,9 sur {len(ks)}/{n} · écart de mise au point max {max(foc)*100:.0f} %" if foc else "")
    u = pg.evaluate(SHOT); open(os.path.join(shots, f"gp_dof_{tag}.jpg"), "wb").write(base64.b64decode(u.split(",")[1]))
    # escale : plans automatiques des navettes, en mode poursuite
    pg.evaluate("() => { cameraMode = 0; window.__step(2); REAL.debugSkipToDeparture(); flightPhase = 'CRUISE'; }")
    back = pg.evaluate("() => ({ fov: camera.fov, shot: !!GP.state.shot, k: GP.dof.k })")
    check("retour à la poursuite : plan relâché, focale rétablie, flou coupé", not back["shot"] and back["k"] == 0, back)
    pg.evaluate("() => { REAL.plan(REAL.leg); for(let i = 0; i < 900 && REAL.phase !== 'ORBIT'; i++) window.__step(1); }")
    seen, follow_ok, fshot = set(), 0, 0
    for i in range(400):
        p = pg.evaluate("() => { window.__step(1); return (" + PROBE + ")(); }")
        if p and p["type"].startswith("shuttle"):
            seen.add(p["type"])
            if p["type"] == "shuttleFollow":
                fshot += 1; follow_ok += 1 if p["onScreen"] and p["dist"] < 12*8*(1 + 0) * 10 else 0
                if fshot == 12: u = pg.evaluate(SHOT); open(os.path.join(shots, f"gp_navette_{tag}.jpg"), "wb").write(base64.b64decode(u.split(",")[1]))
        if pg.evaluate("() => !!orbitState.creditsPaid"): break
    check("escale : plan du chargement puis suivi de la navette", {"shuttleLoad", "shuttleFollow"} <= seen, sorted(seen))
    check("la navette reste cadrée pendant son suivi", fshot > 0 and follow_ok == fshot, f"{follow_ok}/{fshot}")
    check("aucune erreur JavaScript", not errors, errors[:3])
    br.close()
sys.exit(1 if fails else 0)
