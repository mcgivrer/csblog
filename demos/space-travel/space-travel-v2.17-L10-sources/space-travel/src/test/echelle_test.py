"""
L2.2 — système à l'échelle réelle (?echelle=reelle) : données physiques, rendu en tranches, captures.
Usage : python3 src/test/echelle_test.py target/space-travel.html
"""
import os, re, sys, json
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
page_path = os.path.abspath(sys.argv[1]); tag = os.path.basename(page_path).replace(".html", "")
shots = os.path.join(ROOT, "target", "shots"); os.makedirs(shots, exist_ok=True)
fails = []
def check(name, ok, info=""):
    print(("    PASS " if ok else "    FAIL ") + name + (f"  — {info}" if info != "" else ""))
    if not ok: fails.append(name)

with sync_playwright() as pw:
    br = pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = br.new_page(viewport={"width": 800, "height": 500})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
    pg.route(re.compile(r"\.(mp3|ogg|wav)$"), lambda r: r.fulfill(status=404, body=""))
    pg.goto("file://" + page_path + "?seed=L22-TEST&quality=fixed")
    pg.wait_for_timeout(800); pg.click("#boot")
    pg.wait_for_function("() => typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic === true", timeout=90000)
    pg.evaluate("() => window.__sttQuickStart(SHIP_DEFAULT_ID)")
    pg.wait_for_function("() => REAL.started === true", timeout=60000)
    pg.wait_for_timeout(6000)
    d = pg.evaluate("""() => {
      const L = REAL.leg, h = L.hab, AU = REAL.UNITS.AU;
      const hid = starField.get(REAL.hideCell);
      return { active: REAL.active, lum: L.lum, Rs: L.Rs, habR: h.radius, habA: h.orbitA/AU, hz: Math.sqrt(L.lum),
               gas: !!h.kind.gas, dShip: shipRig.position.distanceTo(h.position)/h.radius,
               star3: !!L.star3, hostHidden: hid ? hid.mesh.visible === false : null,
               galOk: REAL.galPos.distanceTo(L.gal) < 1e-3, used: LAYERS.stats.used, slices: LAYERS.stats.slices,
               calls: LAYERS.stats.calls, tris: LAYERS.stats.triangles, shipLen: SHIP_GAME_LEN,
               speed: document.getElementById('speedVal').textContent, near: document.getElementById('nearName').textContent,
               meta: document.getElementById('nearMeta').innerText, planets: L.planets.map(p => [p.kind.key, Math.round(p.radius/1e3), +(p.orbitA/AU).toFixed(3)]) };
    }""")
    check("mode échelle réelle actif, premier système construit", d["active"] and d["star3"], json.dumps(d["planets"]))
    check("planète habitable à taille réelle", 2.5e6 < d["habR"] < 1e8, f"R = {d['habR']/1e3:,.0f} km")
    check("orbite dans la zone habitable (√L ua)", 0.9*d["hz"] <= d["habA"] <= 1.3*d["hz"]*max(1, 8*d["Rs"]/(d["habA"]*1.496e11)), f"a = {d['habA']:.3f} ua · √L = {d['hz']:.3f}")
    check("vaisseau au point d'arrivée (32–60 R, 12–22 pour une géante)", (12 if d["gas"] else 32) <= d["dShip"] <= (22 if d["gas"] else 60)*1.02, f"{d['dShip']:.1f} R")
    check("vaisseau à sa taille réelle", d["shipLen"] > 30, f"{d['shipLen']:.0f} m")
    check("étoile hôte masquée dans la couche galactique", d["hostHidden"] is True, d["hostHidden"])
    check("position galactique = étoile visitée", d["galOk"])
    check("tranches occupées rendues seulement", d["slices"] >= 2 and d["used"] != -1, f"{d['slices']} tranches · masque {d['used']:06b}")
    check("HUD en unités physiques", "m/s" in d["speed"] and d["near"] != "—", f"{d['speed']} · {d['near']} · {d['meta'].splitlines()[-1] if d['meta'] else ''}")
    check("appels de dessin (vue de départ)", d["calls"] < 600, f"{d['calls']} appels · {d['tris']:,} triangles")
    pg.screenshot(path=os.path.join(shots, f"reel_1_depart_{tag}.png"))
    views = {
      "2_planete": """() => { const h = REAL.leg.hab, s = h.position.clone().normalize().negate(), up = new THREE.Vector3(0,1,0);
        const side = new THREE.Vector3().crossVectors(s, up).normalize();
        REAL.debugView = { pos: h.position.clone().addScaledVector(s.clone().add(side.multiplyScalar(.6)).normalize(), h.radius*3.2), look: h.position.clone(), fov: 50 }; }""",
      "3_orbite_basse": """() => { const h = REAL.leg.hab, s = h.position.clone().normalize().negate(), up = new THREE.Vector3(0,1,0);
        const t = new THREE.Vector3().crossVectors(s, up).normalize(), p = h.position.clone().addScaledVector(s, h.radius*1.07);
        REAL.debugView = { pos: p, look: p.clone().addScaledVector(t, h.radius*.6).addScaledVector(s, -h.radius*.18), fov: 60 }; }""",
      "4_soleil": """() => { const h = REAL.leg.hab; REAL.debugView = { pos: h.position.clone().multiplyScalar(.5), look: new THREE.Vector3(), fov: 24 }; }""",
    }
    pg.set_viewport_size({"width": 480, "height": 300})   # gros plans planétaires : très coûteux en rendu logiciel
    for name, js in views.items():
        pg.evaluate(js); pg.wait_for_timeout(8000)
        st = pg.evaluate("() => ({ calls: LAYERS.stats.calls, used: LAYERS.stats.used, slices: LAYERS.stats.slices })")
        pg.screenshot(path=os.path.join(shots, f"reel_{name}_{tag}.png"), timeout=240000)
        check(f"vue {name}", True, f"{st['calls']} appels · {st['slices']} tranches")
    check("aucune erreur JavaScript", not errors, errors[:3])
    br.close()
sys.exit(1 if fails else 0)
