"""
Lot P3 — direction photo « Cinéma ».
1. Temps virtuel, sans rendu (PH.update) : un look par système, jamais deux fois le même à la suite ; CRT seulement à
   l'ouverture d'un système (page en ?crt=1 : à chaque ouverture, jamais au premier) ; ouverture par type de plan
   dans les bornes.
2. Rendus : sans effet = image du jeu (même image que W.render à l'écran) ; noir complet pendant le noir entre deux
   systèmes ; bandes du look noires ; carte de flou non nulle sur un plan à premier plan ; luminance moyenne
   comparable avec et sans effets ; mise sous tension du CRT ; planche avant/après (dist/shots/photo-planche.jpg).
Usage : python3 tests/photo_test.py dist/photo-test.html
"""
import os, re, sys, base64, io
if os.path.isdir("/opt/pw-browsers"): os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont, ImageStat, ImageChops
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
page_path = os.path.abspath(sys.argv[1])
SEED, RZ, SYSTEMS, MS = "COSMOS-TEST", "RZ-TEST", 3, 1000/30
shots = os.path.join(ROOT, "dist", "shots"); os.makedirs(shots, exist_ok=True)
for f in os.listdir(shots):
    if f.startswith("photo-"): os.remove(os.path.join(shots, f))
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
INIT = r"""(() => { let t = 1000; performance.now = () => t; Date.now = () => 1790000000000 + t; window.__SKIP_RENDER = true;
  const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n, ms) => { for(let i = 0; i < n; i++){ t += (ms || 100); q.splice(0).forEach(cb => cb(t)); } }; })();"""

# 1) direction seule, 3 systèmes à 30 i/s
RUN = r"""(args) => { const [systems, ms] = args, T = __TEST, D = T.D, PH = T.PH, SHOT = __PHOTO.SHOT;
  const out = { frames: 0, looks: [], crtBad: [], crtSeen: [], apBad: [], shots: 0 };
  let lastSeq = -1, tSeq = 0, t = 0, lastKey = null;
  while(D.seq < systems && out.frames < 30*400){
    window.__step(1, ms); out.frames++; t += ms/1000;
    const m = D.meta, s = PH.state; if(!m.type) continue;
    if(m.seq !== lastSeq){ lastSeq = m.seq; tSeq = t; out.looks.push(s.lookName); }
    if(s.crt > 0){ if(m.seq === 0 || t - tSeq > 1.65) out.crtBad.push([m.seq, +(t - tSeq).toFixed(2)]); else if(!out.crtSeen.includes(m.seq)) out.crtSeen.push(m.seq); }
    const key = m.seq + ':' + m.shot;
    if(key !== lastKey){ lastKey = key; out.shots++; const b = SHOT[m.type].ap; if(s.aperture < b[0] - 1e-9 || s.aperture > b[1] + 1e-9) out.apBad.push([m.type, s.aperture]); }
  }
  out.seqs = D.seq; return out; }"""
# 2) rendus
MID = r"""(ms) => { const D = __TEST.D, key0 = D.meta.seq + ':' + D.meta.shot; let n = 0;
  const kAt = () => D.meta.type === 'lune' ? .22 : D.meta.type === 'ceinture' ? .7 : .5;    /* lune avant la bascule, ceinture après */
  while(n < 30*60 && (D.meta.seq + ':' + D.meta.shot === key0 || D.meta.k < kAt() || D.meta.fade > .02)){ window.__step(1, ms); n++; }
  return D.meta.seq; }"""
CAP = r"""() => { const T = __TEST, m = T.D.meta, PH = T.PH, cv = T.renderer.domElement;
  PH.enabled = false; PH.render(T.W, T.camera, m, 0); const a = cv.toDataURL('image/png');
  PH.enabled = true; PH.render(T.W, T.camera, m, 0); const b = cv.toDataURL('image/png'); const s = PH.state;
  return { a, b, type: m.type, label: m.label, subject: m.subject, focal: m.focal, look: s.look.label, bar: s.bar, dof: s.dof,
    flare: +(s.streak + s.ghost).toFixed(2), passes: PH.passes }; }"""
PARITY = r"""() => { const T = __TEST, cv = T.renderer.domElement; T.PH.enabled = false; T.PH.render(T.W, T.camera, T.D.meta, 0); const a = cv.toDataURL('image/png');
  T.renderer.setRenderTarget(null); T.W.render(T.renderer, T.camera); const b = cv.toDataURL('image/png'); T.PH.enabled = true; return [a, b]; }"""
BLACK = r"""(ms) => { const T = __TEST, D = T.D; D.nextSystem(); let n = 0; while(n < 30*5 && D.meta.fade < 1){ window.__step(1, ms); n++; }
  window.__SKIP_RENDER = false; window.__step(1, ms); window.__SKIP_RENDER = true;
  return { fade: D.meta.fade, url: T.renderer.domElement.toDataURL('image/png') }; }"""
PLAY = r"""(args) => { const [type, ms] = args, D = __TEST.D; if(!D.play(type)) return false; let n = 0;
  while(n < 30*20 && !(D.meta.type === type && D.meta.k >= .22)){ window.__step(1, ms); n++; } return D.meta.type === type; }"""
COC = r"""() => { const T = __TEST, PH = T.PH; PH.debug = 'coc'; PH.render(T.W, T.camera, T.D.meta, 0); const u = T.renderer.domElement.toDataURL('image/png');
  PH.debug = null; return { url: u, dof: PH.state.dof, focus: T.D.meta.focus, near: T.D.meta.near }; }"""
LOOKS = r"""() => { const T = __TEST, PH = T.PH, out = [];
  for(const k of Object.keys(__PHOTO.LOOKS)){ PH.setLook(k); PH.render(T.W, T.camera, T.D.meta, 0); out.push({ look: __PHOTO.LOOKS[k].label, url: T.renderer.domElement.toDataURL('image/png') }); }
  PH.setLook('auto'); return { type: T.D.meta.label, out }; }"""
CRT = r"""(ms) => { const T = __TEST, PH = T.PH, cv = T.renderer.domElement; PH.forceCRT(1.6);
  PH.render(T.W, T.camera, T.D.meta, 1/30); const a = cv.toDataURL('image/png');
  for(let i = 0; i < 22; i++) PH.update(T.D.meta, 1/30);
  PH.render(T.W, T.camera, T.D.meta, 1/30); const b = cv.toDataURL('image/png'); return { a, b, crt: PH.state.crt }; }"""

fails = []
def check(name, ok, info=""):
    print(("    PASS " if ok else "    FAIL ") + name + (f"  — {info}" if info != "" else ""))
    if not ok: fails.append(name)
def img(url): return Image.open(io.BytesIO(base64.b64decode(url.split(",")[1]))).convert("RGB")
def luma(im, bar=0.0):
    h = im.height; y0, y1 = int(round(bar*h)) + 1, h - int(round(bar*h)) - 1
    return ImageStat.Stat(im.crop((0, y0, im.width, y1)).convert("L")).mean[0]

def open_page(br, extra=""):
    pg = br.new_page(viewport={"width": 960, "height": 540}); errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
    pg.add_init_script(INIT)
    pg.goto("file://" + page_path + f"?seed={SEED}&rz={RZ}&quality=fixed{extra}", timeout=180000)
    pg.wait_for_function("() => window.__TEST && window.__TEST.ready === true", timeout=120000, polling=250)
    return pg, errors

with sync_playwright() as pw:
    br = pw.chromium.launch(args=ARGS)
    # --- 1) direction, sans rendu
    pg, errors = open_page(br, "&crt=1")
    r = pg.evaluate(RUN, [SYSTEMS, MS])
    print(f"    {r['frames']} images, {r['shots']} plans, looks : {r['looks']}")
    looks = r["looks"]
    check("un look par système, parmi les quatre", len(looks) >= SYSTEMS and all(l in ("denis", "imax", "kodak", "kubrick") for l in looks), looks)
    check("jamais deux fois le même look à la suite", all(a != b for a, b in zip(looks, looks[1:])), looks)
    check("CRT seulement à l'ouverture d'un système (1,6 s), jamais au premier", not r["crtBad"], r["crtBad"][:5])
    check("CRT à chaque ouverture quand ?crt=1", r["crtSeen"] == list(range(1, r["seqs"] + 1)) or r["crtSeen"] == list(range(1, r["seqs"])), r["crtSeen"])
    check("ouverture par type de plan dans les bornes", not r["apBad"], r["apBad"][:5])
    check("aucune erreur (direction)", not errors, "; ".join(errors[:3]))
    pg.close()

    # --- 2) rendus
    pg, errors = open_page(br, "&crt=0")
    tiles = []
    while True:
        seq = pg.evaluate(MID, MS)
        if seq >= 2: break
        if not tiles:     # parité avec le jeu sur le premier plan
            a, b = (img(u) for u in pg.evaluate(PARITY))
            diff = ImageStat.Stat(ImageChops.difference(a, b).convert("L")).mean[0]
            check("sans effet : même image que le jeu (W.render à l'écran)", diff < 2.0 and abs(luma(a) - luma(b)) < 1.0,
                  f"écart moyen {diff:.2f} niveaux, luminances {luma(a):.1f} / {luma(b):.1f}")
        tiles.append(pg.evaluate(CAP))
    have = {t["type"] for t in tiles}
    bk = pg.evaluate(BLACK, MS); im = img(bk["url"])
    check("noir complet pendant le noir entre deux systèmes", bk["fade"] >= 1 and max(im.convert("L").getextrema()) <= 2, f"fondu {bk['fade']}, max {im.convert('L').getextrema()}")
    pg.evaluate(MID, MS)
    coc = None
    for t in ("lune", "ceinture", "anneaux", "nebuleuse", "etoile", "croissant", "eclipse", "limbe", "terminateur", "survol"):
        if t in have and t not in ("lune", "ceinture"): continue
        if not pg.evaluate(PLAY, [t, MS]): continue
        if t in ("lune", "ceinture", "anneaux") and coc is None:
            c = pg.evaluate(COC); cim = img(c["url"]); px = list(cim.get_flattened_data()) if hasattr(cim, "get_flattened_data") else list(cim.getdata())
            k = [p[0] + p[1] for p in px]; n = len(k)
            coc = {"type": t, "dof": round(c["dof"], 2), "flou": round(sum(k)/n, 1), "net": round(sum(1 for v in k if v < 12)/n, 3), "fort": round(sum(1 for v in k if v > 100)/n, 3)}
            cim.save(os.path.join(shots, f"photo-carte-de-flou-{t}.png"))
        if t not in have: tiles.append(pg.evaluate(CAP)); have.add(t)
    check("carte de flou non nulle sur un plan à premier plan", coc is not None and coc["dof"] > .3 and coc["flou"] > 15 and coc["net"] > .01 and coc["fort"] > .03, coc)
    looks_strip = None
    for t in ("croissant", "limbe", "survol"):
        if pg.evaluate(PLAY, [t, MS]): looks_strip = pg.evaluate(LOOKS); break
    crt = pg.evaluate(CRT, MS); ca, cb = img(crt["a"]), img(crt["b"])
    top = ca.crop((0, 0, ca.width, int(ca.height*.4))).convert("L").getextrema()[1]
    check("CRT : mise sous tension (une ligne qui s'ouvre)", top <= 3, f"haut de l'image ≤ {top}")
    tiles.append({"a": crt["a"], "b": crt["b"], "type": "crt", "label": "Transition CRT, +0,8 s", "labelA": "Transition CRT : mise sous tension, +0,03 s", "subject": "", "focal": 0, "look": "", "bar": 0, "dof": 0, "flare": 0, "passes": 0})
    check("aucune erreur (rendus)", not errors, "; ".join(errors[:3]))
    br.close()

# --- bandes, luminance, planche
font = None
for f in ("DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "Arial.ttf"):
    try: font = ImageFont.truetype(f, 13); break
    except Exception: pass
TW, TH = 480, 270
rows = (len(tiles) + 1)//2
sheet = Image.new("RGB", (4*TW, rows*TH), "black"); dr = ImageDraw.Draw(sheet)
barBad, ratios, passes = [], [], []
for i, t in enumerate(tiles):
    a, b = img(t["a"]), img(t["b"])
    if t["type"] != "crt":
        passes.append(t["passes"])
        hb = int(t["bar"]*b.height) - 1
        if hb > 2 and max(b.crop((0, 0, b.width, hb)).convert("L").getextrema()[1], b.crop((0, b.height - hb, b.width, b.height)).convert("L").getextrema()[1]) > 2: barBad.append(t["type"])
        la, lb = luma(a, t["bar"]), luma(b, t["bar"])
        if la > 6: ratios.append((t["type"], t["look"], round(lb/la, 2)))
    b.save(os.path.join(shots, f"photo-{i:02d}-{t['type']}.jpg"), quality=90)
    x, y = (i % 2)*2*TW, (i//2)*TH
    sheet.paste(a.resize((TW, TH)), (x, y)); sheet.paste(b.resize((TW, TH)), (x + TW, y))
    dr.rectangle([x, y + TH - 22, x + 2*TW, y + TH], fill=(0, 0, 0))
    dr.text((x + 8, y + TH - 18), t.get("labelA", "jeu (sans effet)"), fill=(142, 160, 196), font=font)
    extra = f" · {t['focal']} mm · ouv. {t['dof']:.2f} · flare {t['flare']}" if t["type"] != "crt" else ""
    dr.text((x + TW + 8, y + TH - 18), f"{t['label']}{' — ' + t['look'] if t['look'] else ''}{extra}", fill=(255, 180, 84), font=font)
    dr.line([x + TW, y, x + TW, y + TH], fill=(0, 0, 0), width=2)
sheet.save(os.path.join(shots, "photo-planche.jpg"), quality=86)
if looks_strip:      # les quatre looks sur un même plan
    ls = Image.new("RGB", (2*TW*2, 2*TH*2), "black"); dl = ImageDraw.Draw(ls)
    for i, o in enumerate(looks_strip["out"]):
        x, y = (i % 2)*2*TW, (i//2)*2*TH; ls.paste(img(o["url"]).resize((2*TW, 2*TH)), (x, y))
        dl.text((x + 10, y + 2*TH - 24), f"{looks_strip['type']} — {o['look']}", fill=(255, 180, 84), font=font)
    ls.save(os.path.join(shots, "photo-looks.jpg"), quality=86)
print("    rapports de luminance (avec/sans) : " + ", ".join(f"{t}/{l} {v}" for t, l, v in ratios))
check("bandes du look noires", not barBad, barBad)
check("luminance moyenne comparable avec et sans effets (0,65 à 1,4)", ratios and all(.65 <= v <= 1.4 for _, _, v in ratios), [r_ for r_ in ratios if not .65 <= r_[2] <= 1.4])
check("coût : au plus 30 passes par image", passes and max(passes) <= 30, f"{min(passes)} à {max(passes)}")
check("planche : au moins 10 plans", len(tiles) >= 11, len(tiles))
print(f"  {'ÉCHEC' if fails else 'OK'} — photo_test ({len(fails)} échec(s))")
sys.exit(1 if fails else 0)
