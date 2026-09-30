"""
Largage d'une navette (bugs signalés) — mesures à 30 images/s en temps virtuel, Basalte (e140) :
taille du conteneur (échelle monde attendue = échelle du vaisseau, pas son carré) et rapport à la navette,
vitesse de rotation de la navette et de la caméra de suivi (plus de bascules), longueur de la traînée.
Usage : python3 src/test/largage_test.py target/space-travel.html
"""
import os, re, sys, json, math, base64
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
page_path = os.path.abspath(sys.argv[1]); tag = os.path.basename(page_path).replace(".html", "")
shots = os.path.join(ROOT, "target", "shots"); os.makedirs(shots, exist_ok=True)
INIT = r"""(() => { let t = 1000; performance.now = () => t; Date.now = () => 1790000000000 + t;
  const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n, ms) => { for(let i = 0; i < n; i++){ t += (ms || 100); q.splice(0).forEach(cb => cb(t)); } }; })();"""
PROBE = """() => {
  const L = orbitState.loading, sh = (L && L.shuttle) || null, out = orbitState.shuttles.find(x => x.phase === 'outbound');
  const S = out || (sh ? { group: sh.group } : null); if(!S) return null;
  LAYERS.shipWorld.updateMatrixWorld(true);   /* sans rendu (simulation accélérée), les matrices monde ne sont pas mises à jour */
  const hull = new THREE.Box3(); S.group.traverse(o => { if(o.isMesh && !o.isSprite && o.geometry && !(L && L.container && (o === L.container || L.container.children.includes(o)))){ o.geometry.computeBoundingBox(); hull.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
  const cont = L && L.container ? L.container : null;
  const cs = cont ? cont.getWorldScale(new THREE.Vector3()).x : null;
  const cb = cont ? new THREE.Box3().setFromObject(cont).getSize(new THREE.Vector3()) : null;
  const tr = out && out.trailHistory && out.trailHistory.length > 1 ? out.trailHistory[0].distanceTo(out.trailHistory[out.trailHistory.length - 1]) : 0;
  const rel = cont ? shipRig.worldToLocal(cont.getWorldPosition(new THREE.Vector3())).toArray() : null;
  /* longueur dans le repère PROPRE du conteneur (une boîte alignée sur le monde grandit quand il est incliné) */
  const clen = cont ? (() => { let L = 0; cont.traverse(o => { if(o.isMesh){ o.geometry.computeBoundingBox(); const sz = o.geometry.boundingBox.getSize(new THREE.Vector3()), ws = o.getWorldScale(new THREE.Vector3()); L = Math.max(L, sz.x*ws.x, sz.y*ws.y, sz.z*ws.z); } }); return L; })() : null;
  const cd = cont && cont.userData && cont.userData.cdims ? Math.max(...cont.userData.cdims) : null;
  return { rel, clen, cd, pick: !!(L && L.pick), q: S.group.quaternion.toArray(), cq: camera.quaternion.toArray(), ph: out ? 'vol' : 'chargement',
           f: SHIP_GAME_LEN/40, cs, cmax: cb ? Math.max(cb.x, cb.y, cb.z) : null, hmax: hull.isEmpty() ? null : Math.max(...hull.getSize(new THREE.Vector3()).toArray()),
           load: GP.state.auto && GP.state.auto.type === 'shuttleLoad' ? (() => { const P = (L && L.pick && L.container) ? L.container.getWorldPosition(new THREE.Vector3()) : (window.shipDockAnchor ? window.shipDockAnchor.getWorldPosition(new THREE.Vector3()) : shipRig.position.clone()); const n = P.project(camera); return Math.max(Math.abs(n.x), Math.abs(n.y)); })() : null,   /* position RÉELLE du sujet (conteneur en prise directe, sinon dock) */   /* position RÉELLE du dock dans l'image rendue, pas le point visé */
           trail: tr, gp: GP.state.auto ? GP.state.auto.type : null, gt: GP.state.auto ? GP.state.auto.t : -1, sid: GP.state.auto ? (GP.state.auto.__id || (GP.state.auto.__id = Math.random())) : 0 };
}"""
def qang(a, b):
    d = abs(sum(x*y for x, y in zip(a, b))); return 2*math.acos(min(1, d))
res = {}
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
    pg.evaluate("() => { LAYERS.skipRender = true; window.__step(3); for(let i = 0; i < 900 && REAL.phase !== 'ORBIT'; i++) window.__step(1); for(let i = 0; i < 400 && !orbitState.loading; i++) window.__step(1, 33.3); }")
    S = []; shot = None
    for i in range(7000):   # navette de baie : sortie, trajet, prise, écartement, vol — jusqu'au retour (≈ 3 min simulées)   # 14 s à 30 images/s : chargement + départ + trajet
        p = pg.evaluate("() => { window.__step(1, 33.3); return (" + PROBE + ")(); }")
        if p: S.append(p)
        elif S and pg.evaluate("() => !orbitState.loading && !orbitState.shuttles.length"): break
        if p and p["ph"] == "vol" and p["gp"] == "shuttleFollow" and shot is None and len([x for x in S if x["gp"] == "shuttleFollow"]) > 40:
            u = pg.evaluate("() => { LAYERS.skipRender = false; window.__step(1, 33.3); const u = renderer.domElement.toDataURL('image/jpeg', .9); LAYERS.skipRender = true; return u; }")
            open(os.path.join(shots, f"largage_{tag}.jpg"), "wb").write(base64.b64decode(u.split(",")[1])); shot = True
    pg_dock = pg.evaluate("() => !!window.shipDockAnchor || !!window.shipArm")
    br.close()
f = S[0]["f"]
cs = [x["cs"] for x in S if x["cs"]]; ratio = [x["cmax"]/x["hmax"] for x in S if x["cmax"] and x["hmax"]]
wS = [qang(a["q"], b["q"])*30 for a, b in zip(S, S[1:])]
# rotation de la caméra mesurée DANS un même plan de suivi (les coupes franches d'un plan à l'autre ne comptent pas)
wC = [qang(a["cq"], b["cq"])*30 for a, b in zip(S, S[1:]) if a["gp"] == b["gp"] == "shuttleFollow" and a["sid"] == b["sid"] and b["gt"] > a["gt"]]
trail = max([x["trail"] for x in S if x["ph"] == "vol"] or [0])
shots_ok = True
jumps = [math.dist(a["rel"], b["rel"]) for a, b in zip(S, S[1:]) if a.get("rel") and b.get("rel")]
res0 = { "saut_conteneur_max_m": round(max(jumps or [0]), 2), "conteneur_long_m": round(max([x["clen"] for x in S if x.get("clen")] or [0]), 2), "conteneur_pile_m": round(max([x["cd"] for x in S if x.get("cd")] or [0]), 2), "prise_directe": any(x.get("pick") for x in S) }
res = { **res0, "echelle_vaisseau": round(f, 2), "echelle_conteneur_max": round(max(cs), 2), "conteneur/navette_max": round(max(ratio), 2),
        "rotation_navette_max_rad_s": round(max(wS), 2), "rotation_camera_suivi_max_rad_s": round(max(wC or [0]), 2), "trainee_max_m": round(trail, 1),
        "erreurs": errors[:2] }
ld = [x["load"] for x in S if x.get("load") is not None]
res["plan_chargement_ecart_max"] = round(max(ld or [0]), 2)
print(json.dumps(res, ensure_ascii=False))
fails = []
def check(name, ok, info=""):
    print(("    PASS " if ok else "    FAIL ") + name + (f"  — {info}" if info != "" else ""))
    if not ok: fails.append(name)
check("porte-conteneurs : prise directe, conteneur de la pile à l'échelle 1 (ses dimensions d'origine)", res["prise_directe"] and abs(res["echelle_conteneur_max"] - 1) < .05 and abs(res["conteneur_long_m"] - res["conteneur_pile_m"]) < max(.05, .08*res["conteneur_pile_m"]), f"échelle {res['echelle_conteneur_max']} · {res['conteneur_long_m']} m pour {res['conteneur_pile_m']} m dans la pile")
check("aucun module d'amarrage sur un porte-conteneurs", not pg_dock, pg_dock)
check("conteneur plus petit que la navette", res["conteneur/navette_max"] < .8, res["conteneur/navette_max"])
check("navette sans bascule (rotation < 3 rad/s)", res["rotation_navette_max_rad_s"] < 3, res["rotation_navette_max_rad_s"])
check("caméra de suivi sans à-coups (rotation < 3 rad/s)", 0 < res["rotation_camera_suivi_max_rad_s"] < 3, res["rotation_camera_suivi_max_rad_s"])
check("traînée courte (panache, pas trajectoire)", res["trainee_max_m"] < 150, f"{res['trainee_max_m']} m")
check("plan de prise : le conteneur reste dans l'image", ld and max(ld) < .9, res["plan_chargement_ecart_max"])
check("chargement sans saut du conteneur (repère du vaisseau, par image)", res["saut_conteneur_max_m"] < 1.5, f"{res['saut_conteneur_max_m']} m au plus")
check("aucune erreur JavaScript", not errors, errors[:2])
sys.exit(1 if fails else 0)
json.dump(res, open(os.path.join(shots, f"largage_{tag}.json"), "w"))
