"""
L2.1 — rendu en deux couches : comparaison d'images avec la v2.16 de référence.
Les deux pages tournent en TEMPS VIRTUEL (performance.now, requestAnimationFrame pilotés par le
test, graine fixe, Math.random déterministe — flux séparé pour les identifiants de three.js, que
la version en couches consomme en plus) : chaque image est calculée dans le même état.
Écarts attendus : seulement les occultations entre couches (étoile hôte, nébuleuse devant une planète).
Usage : python3 src/test/couches_test.py target/space-travel.html   (référence : ref/space-travel-v2.16.html)
"""
import os, re, sys, base64, io
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
from playwright.sync_api import sync_playwright
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
page_path = os.path.abspath(sys.argv[1]); ref_path = os.path.join(ROOT, "ref", "space-travel-v2.16.html")
if not os.path.exists(ref_path) or "min" in os.path.basename(page_path):
    print("    SKIP comparaison (référence absente ou page obfusquée)"); sys.exit(0)
shots = os.path.join(ROOT, "target", "shots"); os.makedirs(shots, exist_ok=True)

INIT = r"""
(() => {
  let t = 1000;
  performance.now = () => t; Date.now = () => 1790000000000 + t;
  const mk = s => () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1000000007) / 1000000007; };
  const game = mk(88172645), lib = mk(2463534242);
  const rnd = Math.random;
  Math.random = function(){ const st = new Error().stack.split('\n')[2] || ''; return /:1191:/.test(st) ? lib() : game(); };
  const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n) => { for(let i = 0; i < n; i++){ t += 33.34; q.splice(0).forEach(cb => cb(t)); } };
})();
"""
CHECKPOINTS = [1, 12, 30]

def run(path):
    with sync_playwright() as pw:
        br = pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        pg = br.new_page(viewport={"width": 640, "height": 400})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
        pg.route(re.compile(r"\.(mp3|ogg|wav)$"), lambda r: r.fulfill(status=404, body=""))
        pg.add_init_script(INIT)
        pg.goto("file://" + path + "?seed=L21-TEST&quality=fixed")
        pg.wait_for_timeout(600); pg.click("#boot")
        pg.wait_for_function("() => typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic === true", timeout=90000, polling=250)
        pg.evaluate("() => window.__sttQuickStart(SHIP_DEFAULT_ID)")
        imgs, done = {}, 0
        for c in CHECKPOINTS:
            imgs[c] = pg.evaluate(f"() => {{ window.__step({c - done}); return renderer.domElement.toDataURL(); }}")
            done = c
        info = pg.evaluate("() => ({ legs: ROUTE.legs.length, p: shipRig.position.toArray().map(v => +v.toFixed(3)), "
                           "calls: (typeof LAYERS !== 'undefined') ? LAYERS.stats.calls : renderer.info.render.calls })")
        br.close()
        return imgs, info, errs

def arr(u): return np.asarray(Image.open(io.BytesIO(base64.b64decode(u.split(",")[1]))).convert("RGB")).astype(int)

ref, ri, re_ = run(ref_path)
new, ni, ne = run(page_path)
fails = []
def check(name, ok, info=""):
    print(("    PASS " if ok else "    FAIL ") + name + (f"  — {info}" if info != "" else ""))
    if not ok: fails.append(name)
check("même état de simulation (itinéraire, position du vaisseau)", ri["legs"] == ni["legs"] and ri["p"] == ni["p"], f"{ni['legs']} étapes · {ni['p']}")
for c in CHECKPOINTS:
    a, b = arr(ref[c]), arr(new[c])
    d = np.abs(a - b).sum(2); frac = (d > 48).mean()
    Image.fromarray(np.concatenate([a, b, np.dstack([(d > 48)*255]*3)], 1).astype("uint8")).save(os.path.join(shots, f"couches_{c:03d}.png"))
    check(f"image {c:3d} identique à la v2.16", frac < 0.01, f"{frac*100:.2f} % de pixels différents · écart moyen {d.mean()/3:.2f}")
check("appels de dessin par image", True, f"v2.16 {ri['calls']} → couches {ni['calls']}")
check("aucune erreur JavaScript", not (re_ or ne), (re_ + ne)[:3])
sys.exit(1 if fails else 0)
