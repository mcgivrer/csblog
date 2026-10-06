"""
Pilote automatique débrayable, vol manuel (phase FREE), cadres de guidage d'origine, tableau des missions fermable (J).
Usage : python3 src/test/pilote_test.py target/space-travel.html [modele]
"""
import os, re, sys
if os.path.isdir("/opt/pw-browsers"): os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
page_path = os.path.abspath(sys.argv[1]); ship = sys.argv[2] if len(sys.argv) > 2 else 'e18'
shots = os.environ.get("PILOTE_SHOTS")
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
    pg.evaluate("() => { LAYERS.skipRender = true; let n = 0; while(n++ < 400 && !(missionBoardOverlay.style.display === 'flex')) window.__step(1); }")

    # --- tableau des missions : fermeture (×, J), pas de réouverture forcée, rappel (J) avec les mêmes offres
    st = pg.evaluate("() => ({ open: missionBoardOverlay.style.display === 'flex', x: !!document.querySelector('#sttConsole .con-close') })")
    check("tableau ouvert à l'arrivée, avec la croix de la console", st["open"] and st["x"], st)
    offers0 = pg.evaluate("() => MISSIONS.state.offers.map(o => o.dest.name + o.reward)")
    pg.click("#sttConsole .con-close")
    pg.evaluate("() => window.__step(30)")
    st = pg.evaluate("() => ({ open: missionBoardOverlay.style.display === 'flex', phase: REAL.phase, fp: flightPhase })")
    check("croix : le tableau se ferme et ne se rouvre pas tout seul", not st["open"], st)
    pg.keyboard.press("KeyJ"); pg.evaluate("() => window.__step(2)")
    st = pg.evaluate("() => ({ open: missionBoardOverlay.style.display === 'flex', offers: MISSIONS.state.offers.map(o => o.dest.name + o.reward) })")
    check("J rappelle le tableau, mêmes offres", st["open"] and st["offers"] == offers0, st)
    pg.keyboard.press("KeyJ"); pg.evaluate("() => window.__step(2)")
    check("J referme le tableau", pg.evaluate("() => missionBoardOverlay.style.display !== 'flex'"))
    pg.keyboard.press("KeyJ"); pg.evaluate("() => window.__step(2)")

    # --- mission locale, pilote automatique par défaut
    i = pg.evaluate("() => MISSIONS.state.offers.findIndex(o => !o.inter)")
    pg.evaluate(f"() => MISSIONS.accept({i})")
    pg.evaluate("() => window.__step(40)")
    st = pg.evaluate("() => ({ phase: REAL.phase, ap: REAL.ap.on, badge: modeBadge.textContent, hud: document.getElementById('apHud').textContent })")
    check("transfert sous pilote automatique, indicateur affiché", st["phase"] == "TRANSFER" and st["ap"] and "T" in st["hud"], st)

    # --- débrayage au milieu du transfert
    p0 = pg.evaluate("() => shipRig.position.toArray()")
    pg.keyboard.press("KeyT"); pg.evaluate("() => window.__step(1)")
    st = pg.evaluate("() => ({ phase: REAL.phase, ap: REAL.ap.on, v: currentSpeed, badge: modeBadge.textContent, tau: REAL.tau })")
    check("T débraye : phase FREE, commandes manuelles, vitesse conservée", st["phase"] == "FREE" and not st["ap"] and st["v"] > 100, st)
    pg.evaluate("() => window.__step(20)")
    p1 = pg.evaluate("() => shipRig.position.toArray()")
    moved = sum((a - b)**2 for a, b in zip(p1, p0))**.5
    check("le vaisseau continue sur son erre", moved > 1000, f"{moved:.0f} m")
    # changement de cap puis poussée
    pg.evaluate("() => { shipRig.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.2); }")
    v0 = pg.evaluate("() => currentSpeed")
    pg.keyboard.down("ShiftLeft"); pg.evaluate("() => window.__step(30)"); pg.keyboard.up("ShiftLeft")
    v1 = pg.evaluate("() => currentSpeed")
    check("MAJ : la poussée modifie la vitesse", abs(v1 - v0) > 1, f"{v0:.0f} -> {v1:.0f}")
    pg.keyboard.down("KeyX"); pg.evaluate("() => window.__step(600)"); pg.keyboard.up("KeyX")
    v2 = pg.evaluate("() => currentSpeed")
    check("X : le freinage arrête le vaisseau", v2 < 1, f"{v2:.2f}")

    # --- le joueur rejoint la destination à la main, réengage près du port : l'arrimage est automatique
    pg.evaluate("""() => { const M = REAL.mission, C = M.target.position, d = REAL.apInfo();
      const dir = shipRig.position.clone().sub(C).normalize();
      shipRig.position.copy(C).addScaledVector(dir, M.Rp + M.Lc*2); M.fv.set(0, 0, 0); }""")
    pg.evaluate("() => window.__step(5)")
    info = pg.evaluate("() => REAL.apInfo()")
    check("à l'approche : proximité détectée, texte d'arrimage", info and info["near"] and 'ARRIMAGE' in pg.evaluate("() => document.getElementById('apHud').textContent"), info)
    pg.keyboard.press("KeyT"); pg.evaluate("() => window.__step(1)")
    st = pg.evaluate("() => ({ phase: REAL.phase, ap: REAL.ap.on })")
    check("T réengage : le pilote automatique reprend", st["phase"] == "TRANSFER" and st["ap"], st)
    res = pg.evaluate("""() => { let n = 0, seen = false; while(n++ < 16000){ window.__step(1, 100); if(MISSIONS.state.delivering) seen = true; if(seen && !MISSIONS.state.active) break; }
      return { n, seen, active: !!MISSIONS.state.active, done: MISSIONS.state.done.length }; }""")
    check("arrimage et livraison menés par le pilote automatique", res["seen"] and not res["active"] and res["done"] == 1, res)

    # --- pendant l'escale, G ne débraye pas
    pg.evaluate("() => { let n = 0; while(n++ < 900 && !(missionBoardOverlay.style.display === 'flex')) window.__step(1); }")
    pg.keyboard.press("KeyJ"); pg.evaluate("() => window.__step(2)")
    check("tableau fermé au port d'arrivée", pg.evaluate("() => missionBoardOverlay.style.display !== 'flex'"))
    pg.evaluate("() => window.__step(40)")
    check("tableau fermé : il ne se rouvre pas pendant l'escale", pg.evaluate("() => missionBoardOverlay.style.display !== 'flex'"))

    # --- sans mission, MAJ achève l'escale et quitte l'orbite en vol manuel ; accepter une mission en vol change la route
    pg.keyboard.down("ShiftLeft")
    st = pg.evaluate("() => { let n = 0; while(n++ < 3000 && REAL.phase !== 'FREE') window.__step(1, 100); return { n, phase: REAL.phase, v: currentSpeed }; }")
    pg.keyboard.up("ShiftLeft")
    check("sans mission, MAJ quitte l'orbite en vol manuel", st["phase"] == "FREE", st)
    pg.evaluate("() => window.__step(20)")
    check("indicateur de commandes manuelles", 'MANUELLES' in pg.evaluate("() => document.getElementById('apHud').textContent"))
    pg.keyboard.press("KeyJ"); pg.evaluate("() => window.__step(2)")
    ok = pg.evaluate("() => { const i = MISSIONS.state.offers.findIndex(o => !o.inter); if(i < 0) return false; MISSIONS.accept(i); window.__step(2); return REAL.phase === 'TRANSFER' && REAL.ap.on; }")
    check("mission acceptée en vol : le pilote automatique reprend la route", ok)

    # --- cadres de guidage : vert pointillé + angles ambre, visibles en approche
    pg.evaluate("() => { LAYERS.skipRender = true; }")
    pg.evaluate("() => { let n = 0; while(n++ < 6000 && REAL.phase !== 'APPROACH') window.__step(1, 100); window.__step(60, 100); }")
    g = pg.evaluate("""() => { const M = REAL.mission; if(!M || !M.gates) return null; const m = M.gates[0].material;
      const col = M.gates[0].geometry.getAttribute('aCol'), n = col.count; const set = new Set(); for(let k = 0; k < n; k++) set.add([col.getX(k), col.getY(k), col.getZ(k)].map(x => x.toFixed(2)).join());
      return { shader: m.isShaderMaterial, colors: [...set], op: M.gates.map(x => +x.material.uniforms.uOpacity.value.toFixed(2)), phase: REAL.phase }; }""")
    check("portiques en shader (pointillés) avec vert et ambre", g and g["shader"] and len(g["colors"]) == 2, g)
    check("au moins un portique visible en approche", g and max(g["op"]) > .3, g and g["op"])
    if shots:
        pg.evaluate("() => { LAYERS.skipRender = false; window.__step(2); }")
        pg.screenshot(path=os.path.join(shots, "guidage-approche.jpg"), type="jpeg", quality=88)
    check("aucune erreur JavaScript", not errors, errors[:3])
    br.close()
sys.exit(1 if fails else 0)
