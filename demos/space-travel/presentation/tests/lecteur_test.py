"""
Lots P4 à P6 — lecteur de slides et présentation du jeu (dist/presentation.html).
1. Temps virtuel : chargement sans erreur ; look IMAX et bandes ; navigation (clavier, #n, Début/Fin) ; côté du texte
   transmis au réalisateur ; plan demandé (data-plan) ou coupe à l'arrivée, pas de coupe sous 2,5 s ; calque aligné sur
   le panneau et lisible (luminance de l'image derrière) ; texte visible après l'apparition ; écran étroit ; vue présentateur
   (fenêtre séparée, ou incrustée si le navigateur la refuse) ; images intégrées au fichier.
2. Qualité automatique en temps virtuel : baisse de résolution, paliers, puis remontée.
3. Temps réel : export d'un clip webm (durée et taille vérifiées par ffprobe s'il est présent), état rétabli.
4. Toutes les slides en 1280 × 720 : aucun texte ne déborde de l'image ; captures (dist/shots/lecteur-*.png, lecteur-planche.jpg).
5. Ambiances (lot P7) : celle de chaque slide après la coupe ; sans coupe possible (plan < 2,5 s), elle attend la coupe ;
   touche A : ambiance imposée tout de suite, en boucle, puis retour à celle de la slide.
Usage : python3 tests/lecteur_test.py dist/presentation.html
"""
import os, re, sys, io, json, base64, shutil, subprocess
if os.path.isdir("/opt/pw-browsers"): os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
page_path = os.path.abspath(sys.argv[1])
SEED, RZ, MS = "COSMOS-TEST", "RZ-TEST", 1000/30
shots = os.path.join(ROOT, "dist", "shots"); os.makedirs(shots, exist_ok=True)
PRE = "lecteur-min-" if page_path.endswith(".min.html") else "lecteur-"     # captures de la version compacte à part
for f in os.listdir(shots):
    if f.startswith(PRE) and (PRE == "lecteur-min-" or not f.startswith("lecteur-min-")): os.remove(os.path.join(shots, f))
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
INIT = r"""(() => { let t = 1000; performance.now = () => t; Date.now = () => 1790000000000 + t; window.__SKIP_RENDER = true;
  const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n, ms) => { for(let i = 0; i < n; i++){ t += (ms || 100); q.splice(0).forEach(cb => cb(t)); } }; })();"""
STATE = r"""() => { const T = __TEST, m = T.D.meta, s = T.L.slides[T.L.idx];
  return { idx: T.L.idx, hash: location.hash, type: m.type, key: m.seq + ':' + m.shot, t: m.t, framing: T.D.framing, look: T.PH.state.lookName,
    letter: T.PH.state.letter, bar: getComputedStyle(document.documentElement).getPropertyValue('--bar').trim(), cuts: T.L.cuts, veil: T.PH.state.veil || 0,
    visible: s.classList.contains('visible'), narrow: document.body.classList.contains('etroit') }; }"""
RENDER = r"""() => { window.__SKIP_RENDER = false; window.__step(1, 1000/30); window.__SKIP_RENDER = true; }"""
VEIL = r"""() => { const T = __TEST, PH = T.PH, s = T.L.slides[T.L.idx], el = s.querySelector('.calque'), r = el.getBoundingClientRect(), w = innerWidth, h = innerHeight;
  const v = (PH.state.veils || [])[0] || null;
  const cv = T.renderer.domElement, f = cv.width/w;
  PH.render(T.W, T.camera, T.D.meta, 0); const a = cv.toDataURL('image/png');
  const keep = PH.state.veils, kF = PH.state.veil; PH.setVeil(null); PH.render(T.W, T.camera, T.D.meta, 0); const b = cv.toDataURL('image/png'); PH.setVeil(keep, kF);
  return { dom: { x0: r.left/w, x1: r.right/w, y0: 1 - r.bottom/h, y1: 1 - r.top/h }, veil: v, k: el.dataset.calque, a, b,
    px: [Math.round(r.left*f), Math.round(r.top*f), Math.round(r.right*f), Math.round(r.bottom*f)] }; }"""
OVER = r"""() => { const c = document.getElementById('cadre').getBoundingClientRect(), s = __TEST.L.slides[__TEST.L.idx]; let worst = 0, what = '';
  s.querySelectorAll(':scope > :not(.notes), .calque *, .bloc *').forEach(el => { const r = el.getBoundingClientRect(); if(!r.width || !r.height) return;
    const o = Math.max(c.top - r.top, r.bottom - c.bottom, c.left - r.left, r.right - c.right); if(o > worst){ worst = o; what = (s.dataset.titreCourt || '') + ' : ' + el.tagName.toLowerCase() + '.' + el.className; } });
  return { over: Math.round(worst), what }; }"""
DOMSLIDE = r"""(i) => { const s = document.querySelectorAll('#deck > section.slide')[i]; return { plan: s.dataset.plan || null, cote: s.dataset.cote, titre: s.dataset.titreCourt }; }"""
SIDE = {"gauche": "left", "droite": "right", "centre": "center"}
OPACITY = r"""() => Array.from(__TEST.L.slides[__TEST.L.idx].querySelectorAll('.anim')).map(e => +getComputedStyle(e).opacity)"""
QRUN = r"""(args) => { const [n, ms] = args, Q = __TEST.Q; let lo = Q.scale; for(let i = 0; i < n; i++){ window.__step(1, ms); lo = Math.min(lo, Q.scale); }
  const b = new THREE.Vector2(); __TEST.renderer.getDrawingBufferSize(b);
  return { scale: Q.scale, lo, tier: Q.tier, msaa: __TEST.PH.quality.msaa, dof: __TEST.PH.quality.dof, w: b.x, h: b.y }; }"""
CLIP = r"""async (mode) => { const T = __TEST; const r = await T.L.recordClip({ plan: 'survol', max: 2.5, height: 360, download: false, mode });
  const u = new Uint8Array(await r.blob.arrayBuffer()); let s = ''; for(let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return { name: r.name, bytes: r.bytes, frames: r.frames, seconds: r.seconds, mime: r.mime, mode: r.mode, b64: btoa(s),
    after: { locked: !!T.Q.locked, rec: document.body.classList.contains('rec'), grain: T.PH.grainScale, crt: T.PH.crtChance } }; }"""
CANCEL = r"""async () => { const T = __TEST; const p = T.L.recordClip({ plan: 'survol', max: 20, height: 360, download: false });
  await new Promise(r => setTimeout(r, 600)); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  const r = await p; return { r: r === null ? null : 'clip', locked: !!T.Q.locked, rec: document.body.classList.contains('rec'), idx: T.L.idx }; }"""

fails = []
def check(name, ok, info=""):
    print(("    PASS " if ok else "    FAIL ") + name + (f"  — {info}" if info != "" else ""))
    if not ok: fails.append(name)
def img(url): return Image.open(io.BytesIO(base64.b64decode(url.split(",")[1]))).convert("RGB")
def p95(im, box):
    g = im.crop(box).convert("L"); px = sorted(g.get_flattened_data() if hasattr(g, "get_flattened_data") else g.getdata()); return px[int(len(px)*.95)] if px else 0

NOGL = r"""(() => { const g = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(t, ...a){ return /webgl/.test(t) ? null : g.call(this, t, ...a); }; })();"""

def open_page(br, query="", hash_="", vp=(960, 540), virtual=True, extra_init=None, url=None):
    pg = br.new_page(viewport={"width": vp[0], "height": vp[1]}); errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
    if virtual: pg.add_init_script(INIT)
    if extra_init: pg.add_init_script(extra_init)
    pg.goto("file://" + (url or page_path) + f"?seed={SEED}&rz={RZ}{query}{hash_}", timeout=180000)
    pg.wait_for_function("() => window.__TEST && window.__TEST.ready === true", timeout=120000, polling=250)
    return pg, errors

with sync_playwright() as pw:
    br = pw.chromium.launch(args=ARGS)
    # --- 1) lecteur, temps virtuel
    pg, errors = open_page(br, "&quality=fixed")
    pg.evaluate("() => __step(75, 1000/30)")
    s0 = pg.evaluate(STATE)
    N_SL = pg.evaluate("() => document.querySelectorAll('#deck > section.slide').length")
    check(f"{N_SL} slides, la première active (#1)", pg.evaluate("() => __TEST.L.n") == N_SL >= 3 and s0["idx"] == 0 and s0["hash"] == "#1", s0)
    im = pg.evaluate("""() => Array.from(document.querySelectorAll('#deck img')).map(i => ({ data: i.src.startsWith('data:'), ok: i.complete && i.naturalWidth > 0 }))""")
    check("images des slides intégrées au fichier et chargées", all(x["data"] and x["ok"] for x in im), f"{sum(x['data'] and x['ok'] for x in im)}/{len(im)}")
    check("look Nolan IMAX et bandes 1.90", s0["look"] == "imax" and abs((s0["letter"] or 0) - 1.9) < 1e-6 and s0["bar"] not in ("", "0px"), f"{s0['look']}, {s0['letter']}, --bar {s0['bar']}")
    check("côté du texte transmis au réalisateur (gauche)", s0["framing"] == "left", s0["framing"])
    check("texte de la première slide affiché", s0["visible"], s0)
    pg.keyboard.press("ArrowRight"); pg.evaluate("() => __step(2, 1000/30)")
    s1 = pg.evaluate(STATE)
    check("→ : slide 2, #2", s1["idx"] == 1 and s1["hash"] == "#2", s1)
    plan1 = pg.evaluate(DOMSLIDE, 1)["plan"]
    check(f"data-plan : plan demandé ({plan1}) ou coupe", s1["type"] == plan1 or (s1["key"] != s0["key"] and s1["cuts"] > s0["cuts"]), f"{s1['type']}, {s0['key']} → {s1['key']}")
    pg.evaluate("() => __step(45, 1000/30)")
    pg.evaluate(RENDER); pg.wait_for_timeout(1400)
    op = pg.evaluate(OPACITY)
    check("texte visible après l'apparition (opacité 1)", op and min(op) > .99, op)
    v = pg.evaluate(VEIL)
    d, vv = v["dom"], v["veil"]
    aligned = vv is not None and all(abs(d[k] - vv[k]) < 2/540 for k in ("x0", "x1", "y0", "y1"))
    check("calque aligné sur le panneau", aligned and pg.evaluate(STATE)["veil"] > .99, {"dom": d, "veil": vv})
    a, b = img(v["a"]), img(v["b"]); box = tuple(v["px"])
    la, lb = p95(a, box), p95(b, box)
    check("lisibilité : 95 % de l'image derrière le calque sous 0,35 de luminance", la <= 89 and la < lb, f"p95 {la/255:.2f} (sans calque {lb/255:.2f})")
    # slide 3 sans plan ni système imposé : seule la règle des 2,5 s décide
    pg.evaluate("() => { const s = document.querySelectorAll('#deck > section.slide')[2]; s.removeAttribute('data-plan'); s.removeAttribute('data-systeme'); }")
    k1 = s1["cuts"]; pg.keyboard.press("ArrowRight"); pg.evaluate("() => __step(2, 1000/30)")
    s2 = pg.evaluate(STATE); side2 = SIDE.get(pg.evaluate(DOMSLIDE, 2)["cote"], "auto")
    check("pas de coupe si le plan a moins de 2,5 s", s2["idx"] == 2 and s2["cuts"] == k1 and s2["framing"] == side2, f"coupes {k1} → {s2['cuts']}, plan à {s1['t']:.1f} s")
    pg.evaluate("() => __step(100, 1000/30)")
    s3 = pg.evaluate(STATE); want3 = pg.evaluate("() => __TEST.L.ambOf(2)")
    check("ambiance : elle attend la coupe, faite dès que le plan a 2,5 s", want3 == s1["look"] or (s2["look"] == s1["look"] and s3["look"] == want3 and s3["cuts"] > k1),
          f"{s1['look']} → {s2['look']} (sans coupe) → {s3['look']} (coupes {k1} → {s3['cuts']}), voulue {want3}")
    pg.keyboard.press("Home"); pg.evaluate("() => __step(2, 1000/30)"); h0 = pg.evaluate(STATE)
    pg.keyboard.press("End"); pg.evaluate("() => __step(2, 1000/30)"); h1 = pg.evaluate(STATE)
    check("Début / Fin", h0["idx"] == 0 and h1["idx"] == N_SL - 1, (h0["idx"], h1["idx"]))
    pg.keyboard.press("b"); pg.evaluate("() => __step(30, 1000/30)"); t0 = pg.evaluate("() => __TEST.D.meta.t")
    pg.evaluate("() => __step(60, 1000/30)"); t1 = pg.evaluate("() => __TEST.D.meta.t"); nb = pg.evaluate("() => document.body.classList.contains('noir')")
    pg.keyboard.press("b"); pg.evaluate("() => __step(30, 1000/30)"); t2 = pg.evaluate("() => __TEST.D.meta.t")
    check("écran noir (B) : fond en pause, puis reprise", nb and abs(t1 - t0) < 1e-9 and t2 > t1 + .5, (round(t0, 2), round(t1, 2), round(t2, 2)))
    # vue présentateur : fenêtre séparée, suit la slide
    pg.keyboard.press("Home"); pg.evaluate("() => __step(2, 1000/30)")
    with pg.expect_popup() as pop: pg.keyboard.press("s")
    w = pop.value; w.wait_for_load_state()
    p0 = {"mode": pg.evaluate("() => __TEST.L.presenter() && __TEST.L.presenter().mode"), "titre": w.inner_text(".p-titre"), "notes": w.inner_text(".p-notes"), "suiv": w.inner_text(".p-suivante")}
    pg.keyboard.press("ArrowRight"); pg.evaluate("() => __step(2, 1000/30)")
    p1 = {"titre": w.inner_text(".p-titre"), "num": w.inner_text(".p-num")}
    w.keyboard.press("ArrowRight"); pg.evaluate("() => __step(2, 1000/30)"); i2 = pg.evaluate("() => __TEST.L.idx")
    t1_, t2_ = pg.evaluate(DOMSLIDE, 0)["titre"], pg.evaluate(DOMSLIDE, 1)["titre"]
    check("vue présentateur : fenêtre séparée, notes, slide suivante, suit la navigation", p0["mode"] == "fenetre" and p0["titre"] == t1_ and len(p0["notes"]) > 20
          and t2_ in p0["suiv"] and p1["titre"] == t2_ and p1["num"].startswith("02") and i2 == 2, {"p0": p0, "p1": p1, "i2": i2})
    pg.keyboard.press("s"); pg.wait_for_timeout(300)
    check("vue présentateur : S la referme", pg.evaluate("() => __TEST.L.presenter()") in (None, False) and w.is_closed(), w.is_closed())
    check("aucune erreur (lecteur)", not errors, "; ".join(errors[:3]))
    pg.close()
    pg, errors = open_page(br, "&quality=fixed", "#3")
    pg.evaluate("() => __step(5, 1000/30)"); s = pg.evaluate(STATE)
    check("lien direct #3", s["idx"] == 2 and s["framing"] == SIDE.get(pg.evaluate(DOMSLIDE, 2)["cote"], "auto"), s)
    pg.close()
    pg, errors = open_page(br, "&quality=fixed", extra_init="window.open = () => null;")
    pg.evaluate("() => __step(5, 1000/30)"); pg.keyboard.press("s"); pg.evaluate("() => __step(2, 1000/30)")
    r = pg.evaluate("() => ({ mode: __TEST.L.presenter() && __TEST.L.presenter().mode, vu: !document.getElementById('presentateur').hidden, notes: document.querySelector('#presentateur .p-notes').textContent.length })")
    check("vue présentateur incrustée si la fenêtre est refusée", r["mode"] == "incruste" and r["vu"] and r["notes"] > 20, r)
    check("aucune erreur (présentateur incrusté)", not errors, "; ".join(errors[:3]))
    pg.close()
    pg, errors = open_page(br, "&quality=fixed", vp=(540, 960))
    pg.evaluate("() => __step(30, 1000/30)"); s = pg.evaluate(STATE)
    check("écran haut : sans bandes, texte empilé", s["narrow"] and not s["letter"] and s["bar"] in ("0px", ""), s)
    check("aucune erreur (écran haut)", not errors, "; ".join(errors[:3]))
    pg.close()

    pg, errors = open_page(br, "&quality=fixed", extra_init=NOGL)
    pg.evaluate("() => __step(30, 1000/30)"); pg.keyboard.press("ArrowRight"); pg.evaluate("() => __step(30, 1000/30)")
    ng = pg.evaluate("""() => ({ gl: __TEST.GL, cls: document.body.className, idx: __TEST.L.idx, clip: document.getElementById('b-clip').hidden,
      bg: getComputedStyle(document.querySelector('.slide.active .calque')).backgroundColor, hud: document.getElementById('hud-systeme').textContent })""")
    check("sans WebGL : slides lisibles et navigables sur fond fixe, calque en CSS", ng["gl"] is False and "sans-webgl" in ng["cls"] and "voile-gl" not in ng["cls"]
          and ng["idx"] == 1 and ng["clip"] and ng["bg"] not in ("", "rgba(0, 0, 0, 0)"), ng)
    errors = [e for e in errors if "Error creating WebGL context" not in e]     # journal attendu de three r128, avant le repli
    check("aucune erreur (sans WebGL)", not errors, "; ".join(errors[:3]))
    pg.close()
    if page_path.endswith(".min.html"):
        pg, errors = open_page(br, "&quality=fixed", "#2", url=os.path.join(ROOT, "index.html"))
        pg.evaluate("() => __step(5, 1000/30)")
        r = pg.evaluate("() => ({ path: location.pathname, hash: location.hash, idx: __TEST.L.idx, q: location.search })")
        check("page d'entrée : redirection vers la version compacte, paramètres et slide gardés", r["path"].endswith("/dist/presentation.min.html") and r["idx"] == 1 and "seed=" in r["q"], r)
        pg.close()

    # --- 2) qualité automatique
    pg, errors = open_page(br, "")
    q0 = pg.evaluate("() => __TEST.Q.scale")
    slow = pg.evaluate(QRUN, [90, 50])
    check("qualité : baisse de résolution à 20 i/s", slow["scale"] < q0 - .1, f"{q0} → {slow['scale']:.2f} ({slow['w']}×{slow['h']})")
    slow2 = pg.evaluate(QRUN, [400, 50])
    check("qualité : paliers après 50 % (sans MSAA, sans profondeur de champ)", slow2["tier"] == 2 and not slow2["msaa"] and not slow2["dof"] and abs(slow2["scale"] - .5) < 1e-6, slow2)
    fast = pg.evaluate(QRUN, [3600, 1000/60])        # hausses appliquées sur les coupes (au plus 3 s d'attente)
    check("qualité : paliers rétablis puis résolution remontée à 60 i/s", fast["tier"] == 0 and fast["msaa"] and fast["scale"] > slow2["scale"] + .1, fast)
    f60 = pg.evaluate("() => document.getElementById('fps').textContent")
    pg.click("#b-qualite"); fx = pg.evaluate(QRUN, [200, 50])
    fx.update(pg.evaluate("() => ({ hold: __TEST.Q.hold, pressed: document.getElementById('b-qualite').getAttribute('aria-pressed'), fps: document.getElementById('fps').textContent, idx: __TEST.L.idx })"))
    check("FPS en haut à gauche (60 puis 20 i/s)", re.fullmatch(r"(59|60|61) FPS", f60 or "") is not None and re.fullmatch(r"(19|20|21) FPS", fx["fps"] or "") is not None, (f60, fx["fps"]))
    check("bouton qualité fixe : pleine qualité gardée à 20 i/s, sans changer de slide", fx["hold"] and fx["pressed"] == "true" and fx["lo"] == 1 and fx["scale"] == 1 and fx["tier"] == 0 and fx["msaa"] and fx["idx"] == 0, fx)
    pg.keyboard.press("q"); pg.evaluate("() => __step(30, 50)")
    qa = pg.evaluate("() => ({ hold: __TEST.Q.hold, pressed: document.getElementById('b-qualite').getAttribute('aria-pressed'), mem: localStorage.getItem('voyage-spatial.qualite') })")
    check("touche Q : retour à la qualité automatique (choix retenu)", not qa["hold"] and qa["pressed"] == "false" and qa["mem"] == "auto", qa)
    check("aucune erreur (qualité)", not errors, "; ".join(errors[:3]))
    pg.close()

    # --- 3) export de clip, temps réel
    pg, errors = open_page(br, "&quality=fixed&crt=0", vp=(640, 360), virtual=False)
    pg.wait_for_timeout(1500)
    pg.evaluate("() => __TEST.CL.ready")
    sup = pg.evaluate("() => ({ offline: __TEST.CL.offline, live: __TEST.CL.live.supported })")
    check("export pris en charge (image par image et temps réel)", sup["offline"] and sup["live"], sup)
    for mode in ("auto", "reel"):
        if not (sup["offline"] if mode == "auto" else sup["live"]): continue
        c = pg.evaluate(CLIP, mode)
        path = os.path.join(shots, f"{PRE}clip-{mode}.webm"); open(path, "wb").write(base64.b64decode(c["b64"]))
        info = {}
        if shutil.which("ffprobe"):
            out = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-show_entries", "format=duration:stream=width,height,codec_name,nb_read_frames", "-of", "json", path], capture_output=True, text=True)
            j_ = json.loads(out.stdout or "{}"); st = (j_.get("streams") or [{}])[0]
            info = {"codec": st.get("codec_name"), "w": st.get("width"), "h": st.get("height"), "frames": int(st.get("nb_read_frames") or 0),
                    "duration": float((j_.get("format") or {}).get("duration") or 0)}
        print(f"    clip {c['mode']} : {c['name']}, {c['bytes']} octets, {c['frames']} images, {c['seconds']} s, {c['mime']}, ffprobe {info}")
        check(f"clip {c['mode']} : webm du plan demandé", c["bytes"] > 2000 and c["frames"] >= 3 and c["name"].endswith("_survol.webm") and "webm" in c["mime"], c["name"])
        if mode == "auto":
            check("clip image par image : 75 images, 2,5 s exactes, 640×360", c["frames"] == 75 and (not info or (info["w"] == 640 and info["h"] == 360 and info["frames"] == 75 and abs(info["duration"] - 2.5) < .05)), info)
        else:
            # repli pour les navigateurs sans WebCodecs ; swiftshader rend ~2 images/s : on vérifie un webm lisible, pas sa cadence
            check("clip temps réel : webm lisible 640×360", not info or (info["w"] == 640 and info["h"] == 360 and info["frames"] >= 1 and 0 < info["duration"] <= c["seconds"] + .8), info)
        check(f"état rétabli après l'export ({c['mode']})", c["after"] == {"locked": False, "rec": False, "grain": 1, "crt": 0}, c["after"])
    if sup["offline"]:
        c = pg.evaluate(CANCEL)
        check("Échap annule l'export, état rétabli", c == {"r": None, "locked": False, "rec": False, "idx": 0}, c)
    check("aucune erreur (export)", not errors, "; ".join(errors[:3]))
    pg.close()

    # --- 4) toutes les slides : débordement et captures
    pg, errors = open_page(br, "&quality=fixed", vp=(1280, 720))
    caps, over, ambs = [], [], []
    for i in range(N_SL):
        if i: pg.keyboard.press("ArrowRight")
        pg.evaluate("() => __step(80, 1000/30)"); pg.evaluate(RENDER); pg.evaluate(RENDER); pg.wait_for_timeout(1300)
        o = pg.evaluate(OVER)
        if o["over"] > 1: over.append(o)
        ambs.append(pg.evaluate("() => ({ i: __TEST.L.idx + 1, look: __TEST.PH.state.lookName, want: __TEST.L.ambOf(__TEST.L.idx) })"))
        p = os.path.join(shots, f"{PRE}{i + 1:02d}.png"); pg.screenshot(path=p); caps.append(p)
    check(f"1280 × 720 : aucun texte ne déborde de l'image ({N_SL} slides)", not over, over[:3])
    bad = [a for a in ambs if a["look"] != a["want"]]
    check(f"ambiance de chaque slide appliquée ({len(set(a['want'] for a in ambs))} ambiances)", not bad, bad[:3])
    pg.keyboard.press("a"); pg.evaluate("() => __step(1, 1000/30)"); pg.keyboard.press("a"); pg.evaluate("() => __step(1, 1000/30)")
    ka = pg.evaluate("() => ({ look: __TEST.PH.state.lookName, force: __TEST.L.ambForce, toast: document.getElementById('toast').textContent })")
    for _ in range(11): pg.keyboard.press("a")
    pg.evaluate("() => __step(1, 1000/30)")
    kb = pg.evaluate("() => ({ look: __TEST.PH.state.lookName, force: __TEST.L.ambForce, want: __TEST.L.ambOf(__TEST.L.idx) })")
    check("touche A : ambiance imposée tout de suite, puis retour à celle de la slide", ka["look"] == "nolan35" == ka["force"] and "Nolan 35" in ka["toast"] and kb["force"] is None and kb["look"] == kb["want"], (ka, kb))
    check("aucune erreur (tour des slides)", not errors, "; ".join(errors[:3]))
    pg.close()
    pg, errors = open_page(br, "&quality=fixed", "#2", vp=(540, 960))
    pg.evaluate("() => __step(75, 1000/30)"); pg.evaluate(RENDER); pg.evaluate(RENDER); pg.wait_for_timeout(1400)
    pn = os.path.join(shots, PRE + "etroit.png"); pg.screenshot(path=pn)
    pg.close()
    br.close()

TW, TH, COLS = 640, 360, 3
rows = (len(caps) + 1 + COLS - 1)//COLS
sheet = Image.new("RGB", (COLS*TW, rows*TH), "black")
for i, p in enumerate(caps): sheet.paste(Image.open(p).convert("RGB").resize((TW, TH)), ((i % COLS)*TW, (i//COLS)*TH))
k = len(caps); nar = Image.open(pn).convert("RGB").resize((int(TH*540/960), TH)); sheet.paste(nar, ((k % COLS)*TW + (TW - nar.width)//2, (k//COLS)*TH))
sheet.save(os.path.join(shots, PRE + "planche.jpg"), quality=84)
print(f"  {'ÉCHEC' if fails else 'OK'} — lecteur_test {os.path.basename(page_path)} ({len(fails)} échec(s))")
sys.exit(1 if fails else 0)
