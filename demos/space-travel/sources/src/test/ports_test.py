"""
Lot P1 — ports orbitaux : absorption des stations du commerce local (mêmes planètes et noms que la version
précédente), altitude de la spec, port garanti d'une géante gazeuse destination, au moins un poste L par port,
budget de rendu, et rendu en jeu. Usage : python3 src/test/ports_test.py target/space-travel.html [ancienne.html]
"""
import os, re, sys, json, base64
if os.path.isdir("/opt/pw-browsers"): os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")   # bac a sable d origine ; ailleurs, emplacement par defaut de Playwright
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
page_path = os.path.abspath(sys.argv[1]); old = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else None
INIT = r"""(() => { let t = 1000; performance.now = () => t; Date.now = () => 1790000000000 + t;
  const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n, ms) => { for(let i = 0; i < n; i++){ t += (ms || 100); q.splice(0).forEach(cb => cb(t)); } }; })();"""
PROBE = """() => { const leg = REAL.leg; return { cell: leg.cell, habGas: !!(leg.hab && leg.hab.kind && leg.hab.kind.gas),
  gasIdx: leg.planets.map((p, i) => p.kind && p.kind.gas ? i : -1).filter(i => i >= 0),
  st: (leg.stations || []).map(s => ({ name: s.name, pl: leg.planets.indexOf(s.orbits), gas: !!s.orbits.kind.gas,
    k: s.port ? +(s.position.distanceTo(s.orbits.position)/s.orbits.radius).toFixed(3) : null, arch: s.port ? s.port.archetype : null,
    L: s.port ? s.port.berths.filter(b => b.cls === 'L').length : null, R: Math.round(s.radius),
    calls: (() => { let n = 0; s.mesh.traverse(o => { if(o.isMesh || o.isSprite || o.isInstancedMesh) n++; }); return n; })(),
    inSys: (() => { let o = s.mesh; while(o){ if(o === LAYERS.sysWorld) return true; o = o.parent; } return false; })(),
    habPort: s.orbits === leg.hab })) }; }"""
fails = []
def check(name, ok, info=""):
    print(("    PASS " if ok else "    FAIL ") + name + (f"  — {info}" if info != "" else ""))
    if not ok: fails.append(name)
def run(path, seeds, shot=False):
    out = []
    with sync_playwright() as pw:
        br = pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        for sd in seeds:
            pg = br.new_page(viewport={"width": 960, "height": 540}); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
            pg.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
            pg.add_init_script(INIT)
            pg.goto("file://" + path + "?seed=" + sd + "&quality=fixed", timeout=90000); pg.wait_for_timeout(600); pg.click("#boot")
            pg.wait_for_function("() => typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic === true", timeout=90000, polling=250)
            pg.evaluate("() => window.__sttQuickStart('e140', { jump: true })")
            pg.wait_for_function("() => REAL.started === true", timeout=60000, polling=250)
            pg.evaluate("() => { LAYERS.skipRender = true; window.__step(3); }")
            r = [pg.evaluate("() => (" + PROBE + ")()")]
            pg.evaluate("() => { REAL.debugSkipToDeparture(); }")                      # étape suivante (autre système)
            for i in range(900):
                if pg.evaluate("() => { window.__step(1); return REAL.hops > 0 && REAL.phase === 'TRANSFER'; }"): break
            r.append(pg.evaluate("() => (" + PROBE + ")()"))
            if shot and any(x["st"] for x in r[-1:]):
                u = pg.evaluate("""() => { const s = REAL.leg.stations[0], P = s.position, up = P.clone().sub(s.orbits.position).normalize(), R = s.radius;
                  const side = new THREE.Vector3(0, 1, 0).cross(up).normalize();
                  camera.position.copy(P).addScaledVector(side, 1.7*R).addScaledVector(up, .55*R).addScaledVector(up.clone().cross(side), .9*R);
                  camera.up.copy(up); camera.lookAt(P); camera.updateMatrixWorld();
                  LAYERS.skipRender = false; renderMain(); const u = renderer.domElement.toDataURL('image/jpeg', .9); LAYERS.skipRender = true; return u; }""")
                open(os.path.join(ROOT, "src/docs/img/ports/jeu-port-orbital.jpg"), "wb").write(base64.b64decode(u.split(",")[1]))
            out.append({ "seed": sd, "legs": r, "errs": errs }); pg.close()
        br.close()
    return out
SEEDS = ["PORT-A", "PORT-B", "PORT-C"]
new = run(page_path, SEEDS, shot=True)
allst = [s for x in new for leg in x["legs"] for s in leg["st"]]
print("   ports :", [(s["name"], s["arch"], s["k"], s["R"]) for s in allst])
check("des ports dans les systèmes visités", len(allst) >= 2, len(allst))
check("chaque port a au moins un poste L (tous les vaisseaux accostent)", all(s["L"] and s["L"] >= 1 for s in allst))
check("altitude de la spec (tellurique 1,15–1,4 R ; géante 2,5–3 R)", all((2.49 <= s["k"] <= 3.01) if s["gas"] else (1.14 <= s["k"] <= 1.41) for s in allst), [s["k"] for s in allst])
check("tour d'amarrage autour des géantes, anneau, moyeu ou station modulaire sinon", all((s["arch"] == "tower") == s["gas"] for s in allst))
gas_legs = [leg for x in new for leg in x["legs"] if leg["gasIdx"]]
n_gas = sum(len(leg["gasIdx"]) for leg in gas_legs)
check("chaque géante gazeuse a son port (seul port possible, destination de contrats locaux)", n_gas > 0 and all(all(any(s["pl"] == gi for s in leg["st"]) for gi in leg["gasIdx"]) for leg in gas_legs), f"{n_gas} géante(s) dans {len(gas_legs)} système(s)")
proc = [s for s in allst if s["arch"] != "modular"]; mods = [s for s in allst if s["arch"] == "modular"]
check("budget de rendu : ≤ 14 appels de dessin par port procédural", all(s["calls"] <= 14 for s in proc), max([s["calls"] for s in proc] or [0]))
check("budget de rendu : ≤ 60 appels de dessin par station modulaire (une maille par matériau)", all(s["calls"] <= 60 for s in mods), [s["calls"] for s in mods])
check("ports dans la couche du système", all(s["inSys"] for s in allst))
if old:
    prev = run(old, SEEDS)
    def sig(o): return [(leg["cell"], [(s["name"], s["pl"]) for s in leg["st"] if "Ω" not in s["name"]]) for x in o for leg in x["legs"]]   # ports ajoutés aux géantes (Ω) exclus
    a, b = sig(new), sig(prev)
    check("stations du commerce local absorbées : mêmes planètes et mêmes noms", a == b, f"{sum(len(l[1]) for l in a)} ports comparés sur {len(a)} systèmes")
check("aucune erreur JavaScript", not any(x["errs"] for x in new), [x["errs"] for x in new if x["errs"]][:1])
sys.exit(1 if fails else 0)
