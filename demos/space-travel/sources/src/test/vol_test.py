"""
L2.3 — vol par étape à l'échelle réelle (?echelle=reelle), en TEMPS VIRTUEL et sans rendu (sauf captures) :
transfert → approche (couloir) → orbite (escale : navettes, radio, paiement) → départ → erre → passage.
Usage : python3 src/test/vol_test.py target/space-travel.html
"""
import os, re, sys, json, base64
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
page_path = os.path.abspath(sys.argv[1]); tag = os.path.basename(page_path).replace(".html", "")
shots = os.path.join(ROOT, "target", "shots"); os.makedirs(shots, exist_ok=True)
INIT = r"""
(() => {
  let t = 1000; performance.now = () => t; Date.now = () => 1790000000000 + t;
  const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n) => { for(let i = 0; i < n; i++){ t += 100; q.splice(0).forEach(cb => cb(t)); } };
})();
"""
SAMPLE = """(n) => { window.__step(n); const L = REAL.leg, M = REAL.mission, p = shipRig.position;
  let alt = Infinity; L.planets.forEach(q => { alt = Math.min(alt, (p.distanceTo(q.position) - q.radius)/q.radius); });
  const os = orbitState;
  return { ph: REAL.phase, fp: flightPhase, tau: REAL.tau, v: currentSpeed, alt: alt, fuel: fuel, cell: L.cell, hops: REAL.hops,
           ox: M ? Math.hypot(M.ox, M.oy)/(M.half || 1) : 0, orbR: os.active ? p.distanceTo(os.center)/os.radius : null,
           vo: M ? M.vo : 0, paid: !!os.creditsPaid, spawned: (os.spawned || []).filter(Boolean).length,
           gal: REAL.galPos.toArray(), nan: ![p.x, p.y, p.z, camera.position.x].every(Number.isFinite),
           camShip: camera.position.distanceTo(p)/SHIP_GAME_LEN }; }"""
SHOT = """() => { LAYERS.skipRender = false; window.__step(1); const u = renderer.domElement.toDataURL('image/jpeg', .85); LAYERS.skipRender = true; return u; }"""

fails = []
def check(name, ok, info=""):
    print(("    PASS " if ok else "    FAIL ") + name + (f"  — {info}" if info != "" else ""))
    if not ok: fails.append(name)

with sync_playwright() as pw:
    br = pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = br.new_page(viewport={"width": 640, "height": 400})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
    pg.route(re.compile(r"\.(mp3|ogg|wav)$"), lambda r: r.fulfill(status=404, body=""))
    pg.add_init_script(INIT)
    pg.goto("file://" + page_path + "?echelle=reelle&seed=L23-TEST&quality=fixed")
    pg.wait_for_timeout(600); pg.click("#boot")
    pg.wait_for_function("() => typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic === true", timeout=90000, polling=250)
    pg.evaluate("() => window.__sttQuickStart(SHIP_DEFAULT_ID)")
    pg.wait_for_function("() => REAL.started === true", timeout=60000, polling=250)
    pg.evaluate("() => { LAYERS.skipRender = true; }")
    fuel0 = pg.evaluate("() => fuel"); cell0 = pg.evaluate("() => REAL.leg.cell")
    seq, samples, since, shot_at = [], [], {}, {"TRANSFER": 16, "APPROACH": 12, "ORBIT": 14, "DEPART": 6}
    shots_done = set()
    for sec in range(320):
        s = pg.evaluate(SAMPLE, 10); s["t"] = sec + 1; samples.append(s)
        if not seq or seq[-1] != s["ph"]: seq.append(s["ph"]); since[s["ph"] + str(len(seq))] = sec
        k = s["ph"]
        start = max(v for kk, v in since.items() if kk.startswith(k)) if any(kk.startswith(k) for kk in since) else sec
        if k in shot_at and k not in shots_done and sec - start >= shot_at[k] and s["hops"] == 0:
            u = pg.evaluate(SHOT); open(os.path.join(shots, f"vol_{k.lower()}_{tag}.jpg"), "wb").write(base64.b64decode(u.split(",")[1])); shots_done.add(k)
        if s["hops"] >= 1 and s["ph"] == "TRANSFER" and seq.count("TRANSFER") >= 2 and sec - since.get("TRANSFER" + str(len(seq)), sec) >= 4: break
    br.close()

def dur(ph):
    idx = [i for i, s in enumerate(samples) if s["ph"] == ph and samples[0]["hops"] == s["hops"]]
    return len(idx)
order = ["TRANSFER", "APPROACH", "ORBIT", "DEPART", "COAST", "HOP", "TRANSFER"]
core = [p for p in seq if p != "HOP"]   # le passage (fondu de 0,7 s) peut tomber entre deux relevés d'une seconde
check("enchaînement des phases", core[:6] == [p for p in order if p != "HOP"], " → ".join(seq))
tr = [s for s in samples if s["ph"] == "TRANSFER" and s["hops"] == 0]
check("transfert accéléré d'environ 22 s", 15 <= len(tr) <= 30, f"{len(tr)} s · τ ×{tr[0]['tau']:.0f} · vitesse max {max(s['v'] for s in tr)/1e3:.1f} km/s" if tr else "")
ap = [s for s in samples if s["ph"] == "APPROACH" and s["hops"] == 0]
check("approche en temps réel dans le couloir", ap and all(s["tau"] == 1 and s["ox"] <= 0.86 for s in ap), f"{len(ap)} s · écart max {max(s['ox'] for s in ap)*100:.0f} % du demi-portique · {ap[0]['v']/1e3:.2f} km/s" if ap else "")
ob = [s for s in samples if s["ph"] == "ORBIT" and s["orbR"] is not None]
check("orbite basse képlérienne (rayon constant)", ob and max(abs(s["orbR"] - 1) for s in ob) < 0.01, f"{len(ob)} s · écart {max(abs(s['orbR'] - 1) for s in ob)*100:.2f} % · {ob[0]['v']/1e3:.2f} km/s (v orbitale {ob[0]['vo']/1e3:.2f})" if ob else "")
check("escale : navettes lancées et livraison payée", any(s["paid"] for s in samples), f"{max(s['spawned'] for s in samples)} navettes")
check("jamais sous la surface", min(s["alt"] for s in samples) > 0.02, f"altitude minimale {min(s['alt'] for s in samples)*100:.1f} % du rayon")
check("caméra toujours près du vaisseau (co-mobile)", max(s["camShip"] for s in samples) < 12, f"distance max {max(s['camShip'] for s in samples):.1f} longueurs de vaisseau")
check("carburant consommé en Δv", samples[-1]["fuel"] < fuel0, f"{fuel0:.0f} → {samples[-1]['fuel']:.0f}")
check("passage à l'étoile suivante", samples[-1]["hops"] >= 1 and samples[-1]["cell"] != cell0, f"{cell0} → {samples[-1]['cell']}")
check("aucune valeur non finie", not any(s["nan"] for s in samples))
check("aucune erreur JavaScript", not errors, errors[:3])
json.dump(samples, open(os.path.join(shots, f"vol_{tag}.json"), "w"))
sys.exit(1 if fails else 0)
