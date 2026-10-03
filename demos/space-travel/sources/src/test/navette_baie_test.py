"""
Lot N2 — navette de baie d'un porte-conteneurs (Carrelet), en temps virtuel à CADENCE IRRÉGULIÈRE (10 à 45 ms) :
sortie de la baie ventrale, trajet le long de la coque, prise directe sur la pile, livraison, retour et entrée en baie.
Usage : python3 src/test/navette_baie_test.py target/space-travel.html [modèle]
"""
import os, re, sys, json, math
if os.path.isdir("/opt/pw-browsers"): os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")   # bac a sable d origine ; ailleurs, emplacement par defaut de Playwright
from playwright.sync_api import sync_playwright
page_path = os.path.abspath(sys.argv[1]); model = sys.argv[2] if len(sys.argv) > 2 else 'e18'
INIT = r"""(() => { let t = 1000, s = 4242; const rnd = () => { s = (s*16807) % 2147483647; return s/2147483647; };
  performance.now = () => t; Date.now = () => 1790000000000 + t;
  const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n, ms) => { for(let i = 0; i < n; i++){ t += (ms || 100); q.splice(0).forEach(cb => cb(t)); } };
  /* n images de 10 à 45 ms ; relevé après chaque image (ce que voit le joueur) */
  window.__rec = [];
  window.__run = (n) => { for(let i = 0; i < n; i++){ const dt = 10 + 35*rnd(); t += dt; q.splice(0).forEach(cb => cb(t));
      const L = orbitState.loading, sh = L ? L.shuttle : null, fl = orbitState.shuttles[0] || null, g = sh ? sh.group : (fl ? fl.group : null);
      if(!g){ window.__rec.push({ t, none: true, fp: flightPhase, paid: !!orbitState.creditsPaid }); continue; }
      shipRig.updateMatrixWorld(true);   /* sans rendu, la matrice du vaisseau n'est jamais mise à jour : repère périmé (il file à ~8 km/s) */
      const loc = shipRig.worldToLocal(g.getWorldPosition(new THREE.Vector3()));
      const c = L && L.container ? shipRig.worldToLocal(L.container.getWorldPosition(new THREE.Vector3())) : null;
      window.__rec.push({ t, dt, ph: L ? 'L:' + L.phase : 'S:' + fl.phase, p: loc.toArray(), c: c ? c.toArray() : null, fp: flightPhase, paid: !!orbitState.creditsPaid, pickT: L && L.phase === 'pick' });
  } };
})();"""
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
    pg.goto("file://" + page_path + "?seed=BAIE-TEST&quality=fixed")
    pg.wait_for_timeout(600); pg.click("#boot")
    pg.wait_for_function("() => typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic === true", timeout=90000, polling=250)
    pg.evaluate(f"() => window.__sttQuickStart('{model}', {{}})")
    pg.wait_for_function("() => REAL.started === true", timeout=60000, polling=250)
    info = pg.evaluate("""() => { LAYERS.skipRender = true; for(let i = 0; i < 1400 && REAL.phase !== 'ORBIT'; i++) window.__step(1);
      const B = (function(){ const b = SHIP_BUILD, d = (b.docks || []).find(x => x.ventral); if(!d) return null;
        const C = shipRig.worldToLocal(b.group.localToWorld(d.C.clone())); return { C: C.toArray(), hx: d.hx, hy: d.hy, D: d.D }; })();
      const box = new THREE.Box3(); SHIP_BUILD.group.traverse(o => { if(o.isMesh && !o.isSprite && o.geometry && !(o.userData && o.userData.glass)){ o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); [bb.min, bb.max].forEach(p => box.expandByPoint(shipRig.worldToLocal(p.clone()))); } });
      return { bay: B, box: [box.min.toArray(), box.max.toArray()], dock: !!window.shipDockAnchor, arm: !!window.shipArm, fr: orbitState.spawnFractions, L: SHIP_GAME_LEN }; }""")
    check("porte-conteneurs : plus de module d'amarrage ni de bras, une baie ventrale", not info["dock"] and not info["arm"] and info["bay"] is not None, info["bay"])
    check("une seule navette par escale", info["fr"] == [0.04], info["fr"])
    ended = False
    for chunk in range(60):
        r = pg.evaluate("() => { window.__run(150); const n = window.__rec.length, last = window.__rec[n - 1]; return { n, fp: last.fp, none: !!last.none, paid: last.paid, busy: !!orbitState.loading || orbitState.shuttles.length > 0 }; }")
        if r["fp"] == "CRUISE" and not r["busy"] and chunk > 2: ended = True; break
    rec = pg.evaluate("() => window.__rec")
    br.close()
S = [x for x in rec if not x.get("none")]
bay = info["bay"]; C = bay["C"]; bmin, bmax = info["box"]
def inside_hull(p):
    return all(bmin[i] + 1 < p[i] < bmax[i] - 1 for i in range(3))
def in_bay_column(p):
    return abs(p[0] - C[0]) < bay["hy"] + 1.5 and abs(p[2] - C[2]) < bay["hx"] + 1.5
def dist_hull(p):
    d = [max(bmin[i] - p[i], 0, p[i] - bmax[i]) for i in range(3)]; return math.sqrt(sum(v*v for v in d))
phases = []
for x in S:
    if not phases or phases[-1] != x["ph"]: phases.append(x["ph"])
check("enchaînement : baie → pile → prise → écartement → vol → retour → entrée en baie",
      [p for p in ["L:exit", "L:toStack", "L:approach", "L:pick", "L:clear", "S:outbound", "S:returning", "S:enter"] if p in phases] == ["L:exit", "L:toStack", "L:approach", "L:pick", "L:clear", "S:outbound", "S:returning", "S:enter"], " → ".join(phases))
first = S[0]["p"]; last = S[-1]["p"]
check("départ dans la baie", in_bay_column(first) and first[1] > C[1], [round(v, 1) for v in first])
check("rangée dans la baie à la fin", in_bay_column(last) and last[1] > C[1], [round(v, 1) for v in last])
near = []
for a, b in zip(S, S[1:]):
    if a["ph"] == b["ph"] and (b["ph"].startswith("L:") or b["ph"] in ("S:enter", "S:returning", "S:outbound")) and dist_hull(b["p"]) < 40:   # zone de manœuvre : 40 m autour de la coque (≈ 0,4 longueur de vaisseau), tout ce qui y passe
        near.append(math.dist(a["p"], b["p"])/max(b["dt"]/1000, 1e-3))
worst = sorted([(math.dist(a["p"], b["p"])/max(b["dt"]/1000, 1e-3), a["ph"], b["ph"], round(b["dt"], 1), [round(v, 1) for v in a["p"]], [round(v, 1) for v in b["p"]]) for a, b in zip(S, S[1:]) if dist_hull(b["p"]) < 40], reverse=True)[:3]
print("   pires relevés :", worst)
cw = sorted([(math.dist(a["c"], b["c"]), a["ph"], b["ph"]) for a, b in zip(S, S[1:]) if a.get("c") and b.get("c")], reverse=True)[:3]
print("   pires sauts du conteneur :", [(round(x[0], 1), x[1], x[2]) for x in cw])
check("vitesse de manœuvre dans la zone de 40 m autour de la coque (≤ 8 m/s depuis le 29/09)", near and max(near) < 8.5, f"max {max(near):.2f} m/s sur {len(near)} relevés" if near else "")
ap = [x for x in S if x["ph"] == "L:approach"]; vend = 0
if len(ap) > 3: vend = math.dist(ap[-2]["p"], ap[-1]["p"])/max(ap[-1]["dt"]/1000, 1e-3)
check("contact avec la pile à l'arrêt (≤ 0,35 m/s)", vend <= .35, f"{vend:.3f} m/s")
bad = [x for x in S if x["ph"] in ("L:toStack", "S:outbound", "S:returning") and inside_hull(x["p"]) and not in_bay_column(x["p"])]   # trajets (hors contact avec la pile)
check("trajets hors de l'encombrement du vaisseau (sauf colonne de la baie)", not bad, f"{len(bad)} relevés" + (f" ex. {[round(v,1) for v in bad[0]['p']]} ({bad[0]['ph']})" if bad else ""))
cj = [math.dist(a["c"], b["c"]) for a, b in zip(S, S[1:]) if a.get("c") and b.get("c") and a["ph"].startswith("L:") and b["ph"].startswith("L:")]
check("conteneur sans saut (repère du vaisseau)", cj and max(cj) < 1.5, f"{max(cj):.2f} m par image au plus" if cj else "")
check("livraison payée", any(x["paid"] for x in rec))
tS = [x["t"] for x in S]
check("escale terminée normalement (retour en croisière)", ended, f"trajet de la navette {(tS[-1] - tS[0])/1000:.0f} s")
check("aucune erreur JavaScript", not errors, errors[:3])
sys.exit(1 if fails else 0)
