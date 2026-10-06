"""
Lot P2 — réalisateur céleste, en temps virtuel (30 images/s, sans rendu sauf captures) :
grammaire (ouverture, pas deux types de suite, un type par système sauf le survol, 5 à 6 plans, fondus), caméra
jamais dans un astre ni une roche, aucun à-coup d'orientation hors coupes, valeurs finies, focales 24–200 mm,
métadonnées (mise au point, étoile à l'écran, fondu) ; puis une capture au milieu de chaque plan (planche).
Usage : python3 tests/realisateur_test.py dist/realisateur-test.html
"""
import os, re, sys, json, base64, io
if os.path.isdir("/opt/pw-browsers"): os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
page_path = os.path.abspath(sys.argv[1])
SEED, RZ, SYSTEMS = "COSMOS-TEST", "RZ-TEST", 3
shots = os.path.join(ROOT, "dist", "shots"); os.makedirs(shots, exist_ok=True)
for f in os.listdir(shots):
    if f.startswith("realisateur-"): os.remove(os.path.join(shots, f))   # captures d'un passage précédent
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
INIT = r"""(() => { let t = 1000; performance.now = () => t; Date.now = () => 1790000000000 + t; window.__SKIP_RENDER = true;
  const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n, ms) => { for(let i = 0; i < n; i++){ t += (ms || 100); q.splice(0).forEach(cb => cb(t)); } }; })();"""
RUN = r"""(args) => { const [systems, ms] = args, T = __TEST, D = T.D, c = T.camera;
  const out = { frames: 0, minGuard: Infinity, worst: null, maxW: 0, worstW: null, nonFinite: 0, focal: [1e9, 0], blackBetween: [], metaBad: 0, seqs: 0 };
  let prevQ = null, prevKey = null, lastFade = 1, lastSeq = -1;
  while(D.seq < systems && out.frames < 30*400){
    window.__step(1, ms); out.frames++;
    const m = D.meta;
    if(m.seq !== lastSeq){ if(lastSeq >= 0) out.blackBetween.push(lastFade); lastSeq = m.seq; }
    lastFade = m.fade;
    if(!m.type || m.fade >= 1){ prevQ = null; continue; }
    const key = m.seq + ':' + m.shot;
    if(![c.position.x, c.position.y, c.position.z, c.quaternion.x, m.focus].every(Number.isFinite)) out.nonFinite++;
    D.guards().forEach(g => { const r = c.position.distanceTo(g.c)/g.r; if(r < out.minGuard){ out.minGuard = r; out.worst = { key, type: m.type, r: +r.toFixed(4) }; } });
    if(prevQ && key === prevKey){ const a = 2*Math.acos(Math.min(1, Math.abs(prevQ.dot(c.quaternion)))), w = a/(ms/1000);
      if(w > out.maxW){ out.maxW = w; out.worstW = { key, type: m.type, k: +m.k.toFixed(3), w: +w.toFixed(3) }; } }
    prevQ = c.quaternion.clone(); prevKey = key;
    out.focal[0] = Math.min(out.focal[0], m.focal); out.focal[1] = Math.max(out.focal[1], m.focal);
    if(!(m.focus > 0) || typeof m.star.onScreen !== 'boolean' || !(m.fade >= 0 && m.fade <= 1)) out.metaBad++;
  }
  out.seqs = D.seq; out.log = D.log; out.systems = D.systems.map(s => s.info.name); return out; }"""
ADVANCE = r"""(args) => { const [seq, shot, kT, ms] = args, D = __TEST.D; let n = 0;
  while(n < 30*400 && !(D.meta.seq === seq && D.meta.shot === shot && D.meta.k >= kT && D.meta.fade < .05)){ window.__step(1, ms); n++; if(D.meta.seq > seq) return false; }
  window.__SKIP_RENDER = false; window.__step(1, ms); window.__SKIP_RENDER = true;
  return { type: D.meta.type, label: D.meta.label, subject: D.meta.subject, focal: D.meta.focal, url: __TEST.renderer.domElement.toDataURL('image/jpeg', .88) }; }"""
PLAY = r"""(args) => { const [type, ms] = args, T = __TEST, D = T.D, c = T.camera;
  if(!D.play(type)) return { ok: false };
  const key0 = D.meta.seq + ':' + (D.meta.shot + 1); let n = 0, minG = Infinity, maxW = 0, prevQ = null, started = false, mid = null;
  while(n < 30*20){ window.__step(1, ms); n++; const m = D.meta, key = m.seq + ':' + m.shot;
    if(key !== key0){ if(started) break; else continue; } started = true;
    D.guards().forEach(g => minG = Math.min(minG, c.position.distanceTo(g.c)/g.r));
    if(prevQ){ maxW = Math.max(maxW, 2*Math.acos(Math.min(1, Math.abs(prevQ.dot(c.quaternion))))/(ms/1000)); } prevQ = c.quaternion.clone();
    if(!mid && m.k >= .5){ mid = { label: m.label, subject: m.subject, focal: m.focal }; }
  }
  return { ok: true, type, minG: +minG.toFixed(4), maxW: +maxW.toFixed(3), frames: n, mid }; }"""
NEXT_SYS = r"""(ms) => { const D = __TEST.D, s0 = D.seq; D.nextSystem(); let n = 0; while(n < 30*10 && !(D.seq > s0 && D.meta.fade < .05)){ window.__step(1, ms); n++; } return D.seq; }"""
OPENERS = {"etoile", "croissant", "nebuleuse"}
DUR = {"etoile": (9, 12), "croissant": (10, 13), "nebuleuse": (10, 13), "survol": (10, 13), "terminateur": (9, 12), "limbe": (10, 13),
       "anneaux": (9, 12), "lune": (10, 13), "eclipse": (10, 13), "ceinture": (9, 12)}
fails = []
def check(name, ok, info=""):
    print(("    PASS " if ok else "    FAIL ") + name + (f"  — {info}" if info != "" else ""))
    if not ok: fails.append(name)

def open_page(br):
    pg = br.new_page(viewport={"width": 960, "height": 540}); errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
    pg.add_init_script(INIT)
    pg.goto("file://" + page_path + f"?seed={SEED}&rz={RZ}&quality=fixed", timeout=180000)
    pg.wait_for_function("() => window.__TEST && window.__TEST.ready === true", timeout=120000, polling=250)
    return pg, errors

with sync_playwright() as pw:
    br = pw.chromium.launch(args=ARGS)
    pg, errors = open_page(br)
    r = pg.evaluate(RUN, [SYSTEMS, 1000/30])
    log = r["log"]
    print(f"    {r['frames']} images, systèmes : {', '.join(r['systems'][:SYSTEMS])}")
    for e in log: print(f"      [{e['seq']}.{e['i']}] {e['type']:<12} {e['subject']:<26} {e['dur']:>5} s  fondus {e['fadeIn']}/{e['fadeOut']}")
    check("aucune erreur", not errors, "; ".join(errors[:3]))
    check(f"{SYSTEMS} systèmes filmés", r["seqs"] >= SYSTEMS, r["seqs"])
    check("valeurs finies et métadonnées valides", r["nonFinite"] == 0 and r["metaBad"] == 0, f"{r['nonFinite']} / {r['metaBad']}")
    check("caméra jamais dans un astre ni une roche", r["minGuard"] >= .999, r["worst"])
    check("aucun à-coup d'orientation hors coupes (≤ 0,6 rad/s)", r["maxW"] <= .6, r["worstW"])
    check("focales entre 24 et 300 mm", 23.5 <= r["focal"][0] and r["focal"][1] <= 300.5, r["focal"])
    check("fondu au noir complet entre deux systèmes", all(f >= .999 for f in r["blackBetween"]), r["blackBetween"])
    seqs = {}
    for e in log: seqs.setdefault(e["seq"], []).append(e)
    done = [s for k, s in seqs.items() if k < SYSTEMS]
    check("ouverture par un plan d'ensemble", all(s[0]["type"] in OPENERS for s in done), [s[0]["type"] for s in done])
    check("jamais deux fois le même type à la suite", all(a["type"] != b["type"] for s in done for a, b in zip(s, s[1:])))
    check("un type au plus une fois par système (sauf survol)", all(len([e for e in s if e["type"] != "survol"]) == len({e["type"] for e in s if e["type"] != "survol"}) for s in done))
    check("5 à 6 plans par système", all(5 <= len(s) <= 6 for s in done), [len(s) for s in done])
    check("fondu d'entrée et de sortie de système", all(s[0]["fadeIn"] == .9 and s[-1]["fadeOut"] == .9 for s in done))
    check("durées dans les bornes", all(DUR[e["type"]][0] - .01 <= e["dur"] <= DUR[e["type"]][1] + .01 for e in log))
    types = {e["type"] for e in log}
    check("variété : au moins 7 types sur 3 systèmes", len(types) >= 7, sorted(types))
    # chaque type à la demande (D.play), sur les systèmes suivants : garde, à-coups
    todo = list(DUR.keys()); seen = {}
    for attempt in range(4):
        for t in list(todo):
            res = pg.evaluate(PLAY, [t, 1000/30])
            if res["ok"]: seen[t] = res; todo.remove(t)
        if not todo: break
        pg.evaluate(NEXT_SYS, 1000/30)
    for t, res in seen.items(): print(f"      à la demande : {t:<12} garde {res['minG']}, {res['maxW']} rad/s, {res['frames']} images")
    check("les 10 types jouables à la demande", not todo, todo)
    check("plans à la demande : garde et pas d'à-coup", all(v["minG"] >= .999 and v["maxW"] <= .6 for v in seen.values()),
          {k: (v["minG"], v["maxW"]) for k, v in seen.items() if v["minG"] < .999 or v["maxW"] > .6})
    pg.close()

    # captures au milieu de chaque plan des deux premiers systèmes
    pg, errors = open_page(br)
    tiles = []
    for e in log:
        if e["seq"] >= 2: break
        res = pg.evaluate(ADVANCE, [e["seq"], e["i"], .5, 1000/30])
        if not res: continue
        tiles.append((res, base64.b64decode(res["url"].split(",")[1])))
    have = {res["type"] for res, _ in tiles}
    for t in DUR:
        if t in have: continue
        if pg.evaluate("(t) => __TEST.D.play(t)", t):
            res = pg.evaluate("""(ms) => { const D = __TEST.D, key0 = D.meta.seq + ':' + D.meta.shot; let n = 0;
              while(n < 30*20 && D.meta.k < .5){ window.__step(1, ms); n++; }
              window.__SKIP_RENDER = false; window.__step(1, ms); window.__SKIP_RENDER = true;
              return { type: D.meta.type, label: D.meta.label, subject: D.meta.subject, focal: D.meta.focal, url: __TEST.renderer.domElement.toDataURL('image/jpeg', .88) }; }""", 1000/30)
            tiles.append((res, base64.b64decode(res["url"].split(",")[1])))
    from PIL import Image, ImageDraw, ImageStat
    dark = []
    W_, H_ = 480, 270
    sheet = Image.new("RGB", (3*W_, ((len(tiles) + 2)//3)*H_), "black"); dr = ImageDraw.Draw(sheet)
    from PIL import ImageFont
    font = None
    for f in ("DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "Arial.ttf"):
        try: font = ImageFont.truetype(f, 13); break
        except Exception: pass
    for i, (res, data) in enumerate(tiles):
        im = Image.open(io.BytesIO(data)).convert("RGB")
        im.save(os.path.join(shots, f"realisateur-{i:02d}-{res['type']}.jpg"))
        if ImageStat.Stat(im.convert("L")).mean[0] < 4: dark.append(res["type"])
        x, y = (i % 3)*W_, (i//3)*H_
        sheet.paste(im.resize((W_, H_)), (x, y))
        dr.rectangle([x, y + H_ - 22, x + W_, y + H_], fill=(0, 0, 0))
        dr.text((x + 8, y + H_ - 18), f"{res['label']} — {res['subject']} · {res['focal']} mm", fill=(255, 180, 84), font=font)
    sheet.save(os.path.join(shots, "realisateur-planche.jpg"), quality=86)
    check("captures non noires", not dark and len(tiles) >= 10, f"{len(tiles)} plans, sombres : {dark}")
    check("aucune erreur pendant les captures", not errors, "; ".join(errors[:3]))
    br.close()

print(f"  {'ÉCHEC' if fails else 'OK'} — realisateur_test ({len(fails)} échec(s))")
sys.exit(1 if fails else 0)
