"""
Lot M1 — missions (plus d'itinéraire) : départ en orbite, tableau des missions, offres adaptées au vaisseau,
acceptation, pile colorée (nature), vol, livraison payée à la prime exacte, nouveau tableau au port d'arrivée.
Usage : python3 src/test/missions_test.py target/space-travel.html [modele]
"""
import os, re, sys, json, base64
if os.path.isdir("/opt/pw-browsers"): os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")   # bac a sable d origine ; ailleurs, emplacement par defaut de Playwright
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
page_path = os.path.abspath(sys.argv[1]); ship = sys.argv[2] if len(sys.argv) > 2 else 'e18'; want_inter = len(sys.argv) > 3 and sys.argv[3] == 'saut'
INIT = r"""(() => { let t = 1000; performance.now = () => t; Date.now = () => 1790000000000 + t;
  const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n, ms) => { for(let i = 0; i < n; i++){ t += (ms || 100); q.splice(0).forEach(cb => cb(t)); } }; })();"""
fails = []
def check(name, ok, info=""):
    print(("    PASS " if ok else "    FAIL ") + name + (f"  — {info}" if info != "" else ""))
    if not ok: fails.append(name)
with sync_playwright() as pw:
    br = pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = br.new_page(viewport={"width": 1100, "height": 640}); errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)[:200]))
    pg.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
    pg.add_init_script(INIT)
    pg.goto("file://" + page_path + "?seed=MISSIONS-1&quality=fixed", timeout=90000); pg.wait_for_timeout(600); pg.click("#boot")
    pg.wait_for_function("() => typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic === true", timeout=90000, polling=250)
    pg.evaluate(f"() => window.__sttQuickStart('{ship}', {{ jump: true, missions: true }})")
    pg.wait_for_function("() => REAL.started === true", timeout=60000, polling=250)
    st = pg.evaluate("""() => { LAYERS.skipRender = true; let n = 0; while(n++ < 400 && !(document.getElementById('missionBoardOverlay') && missionBoardOverlay.style.display === 'flex')) window.__step(1);
      return { n, phase: REAL.phase, fp: flightPhase, enabled: MISSIONS.enabled() }; }""")
    check("départ en orbite, tableau des missions ouvert (plus d'itinéraire)", st["enabled"] and st["phase"] == "ORBIT" and st["n"] < 100, st)
    offers = pg.evaluate("""() => MISSIONS.state.offers.map(o => ({ kind: o.kind, qty: o.qty, nature: o.nature || null, inter: o.inter, reward: o.reward, risk: o.risk, dest: o.dest.name }))""")
    spec = pg.evaluate("() => MISSIONS.cargoSpec()")
    print("   offres :", [(o["dest"], o["nature"], o["qty"], o["reward"], o["risk"], "saut" if o["inter"] else "local") for o in offers])
    check("au moins 3 offres", len(offers) >= 3, len(offers))
    check("offres conformes au vaisseau (type et quantités)", all(o["kind"] == spec["kind"] and spec["range"][0] <= o["qty"] <= spec["range"][1] for o in offers), spec)
    pg.evaluate("() => { LAYERS.skipRender = false; window.__step(1); }")
    pg.screenshot(path=os.path.join(ROOT, "src/docs/img/missions/jeu-tableau-missions.jpg"), type="jpeg", quality=88)
    pg.evaluate("() => { LAYERS.skipRender = true; }")
    i = next((k for k, o in enumerate(offers) if o["inter"] == want_inter), None)
    check("offre du type voulu (" + ("saut" if want_inter else "locale") + ")", i is not None, [o["inter"] for o in offers])
    i = i or 0
    c0 = pg.evaluate("() => credits")
    acc = pg.evaluate(f"""() => {{ MISSIONS.accept({i}); const m = MISSIONS.state.active; let n = 0, col = null;
      SHIP_HULL.traverse(o => {{ if(o.userData && o.userData.mission){{ n++; o.traverse(x => {{ if(x.isMesh && !col) col = x.material.color.getHex(); }}); }} }});
      return {{ qty: m.qty, kind: m.kind, nature: m.nature, n, col, expect: m.nature ? MISSIONS.NATURES[m.nature] : null, reward: m.reward }}; }}""")
    if acc["kind"] == "containers":
        check("pile : conteneurs de la mission à la couleur de leur nature", acc["n"] == acc["qty"] and acc["col"] == acc["expect"], acc)
    reward = acc["reward"]
    res = pg.evaluate("""() => { let n = 0, seenDest = false; const t0 = performance.now();
      const ph = []; let last = null;
      while(n++ < 16000){ window.__step(1, 100); if(MISSIONS.state.delivering) seenDest = true;
        const k = REAL.phase + '/' + flightPhase; if(k !== last){ ph.push([k, Math.round((performance.now() - t0)/1000)]); last = k; }
        if(seenDest && !MISSIONS.state.active) break; }
      return { n, seenDest, active: !!MISSIONS.state.active, done: MISSIONS.state.done.length, s: (performance.now() - t0)/1000, ph }; }""")
    c1 = pg.evaluate("() => credits")
    print("   phases (s depuis l'acceptation) :", res["ph"])
    hid = pg.evaluate("() => { const e = document.getElementById('itineraryPanel'); return !e || getComputedStyle(e).display === 'none'; }")
    check("interface de l'itinéraire masquée en mode missions", hid)
    if want_inter: check("arrivée dans le système de destination (saut)", pg.evaluate("() => REAL.hops") >= 1, pg.evaluate("() => REAL.hops"))
    check("mission livrée à destination", res["seenDest"] and not res["active"] and res["done"] == 1, {k: res[k] for k in ("n", "seenDest", "active", "done", "s")})
    check("paiement égal à la prime de la mission", c1 - c0 == reward, f"{c1 - c0} pour {reward}")
    nb = pg.evaluate("""() => { let n = 0; while(n++ < 900 && !(missionBoardOverlay.style.display === 'flex')) window.__step(1); return { n, open: missionBoardOverlay.style.display === 'flex', offers: MISSIONS.state.offers.length }; }""")
    check("nouveau tableau au port d'arrivée", nb["open"] and nb["offers"] >= 3, nb)
    check("aucune erreur JavaScript", not errors, errors[:3])
    br.close()
sys.exit(1 if fails else 0)
