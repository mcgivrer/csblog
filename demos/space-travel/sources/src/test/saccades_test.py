"""
Saccades des plans rapprochés de navettes — en temps virtuel mais à CADENCE IRRÉGULIÈRE (images de 10 à 45 ms,
tirées par une graine), comme dans un vrai navigateur : à pas constant, une caméra en retard d'une image peut
être compensée par extrapolation et le défaut disparaît des mesures ; à pas variable, il réapparaît.
Mesures pendant les plans de suivi de navette (même plan) :
  - tremblement de la navette à l'écran : dérivée seconde de sa position projetée (NDC), après tout le calcul
    de l'image (= ce que voit le joueur) ;
  - écart de la distance caméra–navette d'une image à l'autre, rapporté à la longueur de la navette ;
  - vitesse de rotation de la caméra.
Usage : python3 src/test/saccades_test.py target/space-travel.html
"""
import os, re, sys, json, math
if os.path.isdir("/opt/pw-browsers"): os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")   # bac a sable d origine ; ailleurs, emplacement par defaut de Playwright
from playwright.sync_api import sync_playwright
page_path = os.path.abspath(sys.argv[1])
INIT = r"""(() => { let t = 1000, s = 12345; const rnd = () => { s = (s*16807) % 2147483647; return s/2147483647; };
  performance.now = () => t; Date.now = () => 1790000000000 + t;
  const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n, ms) => { for(let i = 0; i < n; i++){ t += (ms || 100); q.splice(0).forEach(cb => cb(t)); } };
  window.__stepJ = (n) => { for(let i = 0; i < n; i++){ t += 10 + 35*rnd(); q.splice(0).forEach(cb => cb(t)); } }; })();"""
PROBE = """() => { const a = GP.state.auto; if(!a || a.type !== 'shuttleFollow') return null;
  /* la navette FILMÉE : la plus proche du point visé par le plan (plusieurs navettes peuvent être en route à la fois) */
  const L0 = a.lastLook; if(!L0) return null;
  let sh = null, bd = Infinity; orbitState.shuttles.forEach(x => { if(!x.group) return; const d = x.group.getWorldPosition(new THREE.Vector3()).distanceTo(L0); if(d < bd){ bd = d; sh = x; } });
  if(!sh) return null; if(!a.__sh) a.__sh = sh; if(a.__sh !== sh) a.__id = null; a.__sh = sh;
  LAYERS.shipWorld.updateMatrixWorld(true); camera.updateMatrixWorld();
  const P = sh.group.getWorldPosition(new THREE.Vector3()), n = P.clone().project(camera);
  if(!a.__id) a.__id = Math.random();
  const bx = new THREE.Box3(); sh.group.traverse(o => { if(o.isMesh && !o.isSprite && o.geometry){ o.geometry.computeBoundingBox(); bx.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
  /* direction de la planète dans le repère de la caméra (indépendante des plans de coupe : son centre est bien au-delà
     du plan lointain de la caméra logique, une projection l'aurait rejeté) */
  const v = (orbitState.center || new THREE.Vector3()).clone().sub(camera.position).applyQuaternion(camera.quaternion.clone().invert());
  return { id: a.__id, x: n.x, y: n.y, px: Math.atan2(v.x, -v.z), py: Math.atan2(v.y, Math.hypot(v.x, v.z)), front: v.z < 0, d: camera.position.distanceTo(P), len: bx.getSize(new THREE.Vector3()).length(), q: camera.quaternion.toArray(), t: performance.now() }; }"""
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
    pg.goto("file://" + page_path + "?seed=GP-TEST&quality=fixed")
    pg.wait_for_timeout(600); pg.click("#boot")
    pg.wait_for_function("() => typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic === true", timeout=90000, polling=250)
    pg.evaluate("() => window.__sttQuickStart('e140', { jump: true })")
    pg.wait_for_function("() => REAL.started === true", timeout=60000, polling=250)
    pg.evaluate("() => { LAYERS.skipRender = true; window.__step(3); for(let i = 0; i < 900 && REAL.phase !== 'ORBIT'; i++) window.__step(1); }")
    S = []
    for i in range(6000):   # navette de baie : le suivi commence après sortie, prise et écartement
        p = pg.evaluate("() => { window.__stepJ(1); return (" + PROBE + ")(); }")
        if p: S.append(p)
        if len(S) > 300 or pg.evaluate("() => !!orbitState.creditsPaid && !GP.state.auto"): break
    br.close()
jit, dd, rot, bg = [], [], [], []
for a, b, c in zip(S, S[1:], S[2:]):
    if a["id"] == b["id"] == c["id"]:
        jit.append(math.hypot(c["x"] - 2*b["x"] + a["x"], c["y"] - 2*b["y"] + a["y"]))
        if a["front"] and b["front"] and c["front"]:   # planète devant la caméra (angles en radians)
            bg.append(math.hypot(c["px"] - 2*b["px"] + a["px"], c["py"] - 2*b["py"] + a["py"]))
for a, b in zip(S, S[1:]):
    if a["id"] == b["id"]:
        dd.append(abs(b["d"] - a["d"])/max(a["len"], 1)); rot.append(qang(a["q"], b["q"])/max((b["t"] - a["t"])/1000, 1e-3))
res = { "relevés": len(S), "tremblement_ecran_max": round(max(jit or [0]), 4), "tremblement_ecran_moyen": round(sum(jit)/max(1, len(jit)), 5),
        "saut_distance_max_longueurs": round(max(dd or [0]), 3), "rotation_camera_max_rad_s": round(max(rot or [0]), 2), "tremblement_decor_max": round(max(bg or [0]), 4) }
print(json.dumps(res, ensure_ascii=False))
check("plans de suivi observés (cadence irrégulière)", len(S) > 40, len(S))
check("navette stable à l'écran (pas de tremblement image par image)", res["tremblement_ecran_max"] < .02, f"max {res['tremblement_ecran_max']} · moyen {res['tremblement_ecran_moyen']} (unités d'écran, 2 = largeur)")
check("distance caméra–navette sans à-coup", res["saut_distance_max_longueurs"] < .15, f"{res['saut_distance_max_longueurs']} longueur de navette par image au plus")
nbg = len(bg)
check("décor (planète) stable : la navette ne saccade pas dans l'espace", nbg > 20 and res["tremblement_decor_max"] < .01, f"{res['tremblement_decor_max']} rad max · {nbg} relevés")
check("rotation de la caméra sans à-coup", res["rotation_camera_max_rad_s"] < 3, res["rotation_camera_max_rad_s"])
check("aucune erreur JavaScript", not errors, errors[:2])
sys.exit(1 if fails else 0)
