"""
Lot U1.0 — test géométrique de l'interface : ascenseurs, remplissage des onglets, alignements, taille de la console.
Détecte les défauts D1 à D22 du contrat docs/specs/lots/U1-contrat.md (§ 1 et § 4) sur la console de bord (#sttConsole),
le Mode de jeu (#modeSelect) et la Pause (#pauseOverlay). Mesures seules (aucune capture) ; Chromium est lancé AVEC ses
ascenseurs (ignore_default_args=["--hide-scrollbars"]) : par défaut Playwright les masque et cache D1 à D4.

Décisions du mainteneur : D-A console fluide (largeur min(1400px, 100vw − 48px), hauteur = fenêtre − barre du haut − barre d'icônes) ;
D-B listes en pleine largeur de l'onglet ; D-C un seul style de titre interne (.con-h) ; D-D réglages en section pleine largeur.

MÉCANISME « EN ATTENTE » : PENDING rattache chaque défaut connu à la tâche U1.x qui le corrige. Une assertion en échec s'affiche
« PENDING (U1.x) » (sans faire échouer) si AU MOINS UN de ses défauts candidats est encore dans PENDING ; elle ne devient FAIL (exit 1) que
lorsque TOUS ses candidats sont retirés de PENDING (échec franc : défaut non attribuable, ou régression). Ainsi, quand U1.1 retire D2,
`b:missions@resize-1024x640-*` (candidats D2 et D6) reste PENDING (D6) jusqu'à U1.3. Un défaut de PENDING
dont toutes les assertions passent s'affiche « CORRIGÉ : retirer Dn de PENDING ». Chaque tâche U1.x retire ses défauts de PENDING.
Non couvert par ce test : D23 (hors lot) ; D25 est mesuré par `p:jrn-bar` (barre de filtres collée au bord du défileur, sans dépasser) ;
D26 par `q:ss-panel` (dialogue de sélection du vaisseau ouvert à 700x600, coins hors d'une boîte qui défile).
Variable d'environnement UI_LAYOUT_INJECT_CSS : CSS injecté dans la page après le chargement, pour vérifier le test lui-même (défaut volontaire).

Matrice : {1920x1080, 1366x768, 1024x768} x {fr, de}, plus 800x600 (barre d'onglets et cadre), plus 1366x768 -> 1024x640 -> retour.
Les deux langues tournent dans deux processus parallèles (--worker fr|de), le processus père agrège.
Usage : python3 src/test/ui_layout_test.py target/space-travel.html
"""
import os, re, sys, json, time, subprocess
if os.path.isdir("/opt/pw-browsers"): os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")   # bac à sable d'origine ; ailleurs, emplacement par défaut de Playwright

# défaut -> tâche qui le corrige (§ 3 du contrat). Retirer l'entrée quand la tâche est livrée.
PENDING = {
}
SIZES = [(1920, 1080), (1366, 768), (1024, 768)]
FS_SET = {10, 11, 12, 14, 16}                                   # --fs-xs .. --fs-xl
SCENES = ["nav", "missions", "contracts", "port", "yard", "journal", "help", "helpAudio"]
CONSOLE_TAB = {"nav": "nav", "missions": "missions", "contracts": "missions", "port": "port", "yard": "yard", "journal": "journal", "help": "help", "helpAudio": "help"}
HOST_DEFECT = {"missionBoardOverlay": "D5", "contractBoardOverlay": "D6", "shipyardOverlay": "D6", "helpOverlay": "D3", "audioOverlay": "D7", "portPanel": "D10", "stmMap": "D4"}

INIT = r"""(() => { let t = 1000; performance.now = () => t; Date.now = () => 1790000000000 + t;
  const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n, ms) => { for(let i = 0; i < n; i++){ t += (ms || 100); q.splice(0).forEach(cb => cb(t)); } }; })();"""

# Mesure unique : tout ce dont les assertions ont besoin, en un aller-retour. Argument : [sélecteur de la racine]
MEASURE = r"""(rootSel) => {
  const root = document.querySelector(rootSel); if(!root) return { missing: true };
  const vis = e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const d = e => (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).join('.') : (e.id ? '' : e.tagName.toLowerCase()));
  const path = e => { const o = []; for(let x = e; x && x !== root.parentElement; x = x.parentElement) o.push(d(x)); return o.join(' < '); };
  const px = v => parseFloat(v) || 0;
  const all = [root, ...root.querySelectorAll('*')].filter(e => vis(e));
  const out = { vw: innerWidth, vh: innerHeight, scrollers: [], themed: [] };
  for(const e of all){
    if(!(e.clientWidth > 0 && e.clientHeight > 0)) continue;
    const cs = getComputedStyle(e), ox = /auto|scroll/.test(cs.overflowX), oy = /auto|scroll/.test(cs.overflowY);
    if(!ox && !oy) continue;
    const h = ox && e.scrollWidth > e.clientWidth, v = oy && e.scrollHeight > e.clientHeight;
    out.themed.push({ d: d(e), path: path(e), ok: cs.scrollbarWidth !== 'auto' || cs.scrollbarColor !== 'auto' });
    if(h || v) out.scrollers.push({ d: d(e), path: path(e), h, v, sw: e.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight });
  }
  // polices (hors carte de l'univers, issue de shared/ : non modifiable par le lot)
  const fs = {};
  for(const e of all){
    if(e.closest('#stmMap')) continue;
    if(![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const s = parseFloat(getComputedStyle(e).fontSize); const k = String(Math.round(s * 100) / 100);
    (fs[k] = fs[k] || { n: 0, ex: d(e) }).n++;
  }
  out.fonts = fs;
  const cl = [...root.querySelectorAll('.panel-close-btn')].filter(e => vis(e) && getComputedStyle(e).display !== 'none');
  out.closeBtns = cl.map(e => path(e).slice(0, 80));
  const roleOf = e => e.closest('#sttConsoleTabs') ? 'onglet' : e.classList.contains('con-close') ? 'croix' : e.classList.contains('jrn-chip') ? 'puce'
    : e.classList.contains('board-row-btn') ? 'bouton-liste' : e.classList.contains('port-buy-btn') ? 'bouton-port' : e.closest('.zm') ? 'zoom' : null;
  out.controls = [...root.querySelectorAll('button')].filter(vis).map(e => ({ role: roleOf(e), h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width, cls: d(e) })).filter(c => c.role);
  out.titles = [...root.querySelectorAll('.help-title, .board-title, .port-title, .audio-title, .con-h')].filter(vis).map(e => {
    const cs = getComputedStyle(e); return { d: d(e), sig: [cs.fontSize, cs.color, cs.textAlign, cs.textTransform, cs.fontWeight].join('|') }; });
  // console seule
  const frame = root.querySelector('.con-frame');
  if(frame && vis(frame)){
    const r = frame.getBoundingClientRect(), ib = document.getElementById('hudIconBar').getBoundingClientRect(), tb = document.querySelector('.hud-top').getBoundingClientRect();
    const rs = getComputedStyle(document.documentElement);
    out.frame = { l: r.left, t: r.top, w: r.width, h: r.height, b: r.bottom, iconTop: ib.top, topBottom: tb.bottom,
      hudTop: px(rs.getPropertyValue('--hud-top')) || 34, hudBottom: px(rs.getPropertyValue('--hud-bottom')) || 70 };
    const tabs = document.getElementById('sttConsoleTabs'); out.tabs = { sw: tabs.scrollWidth, cw: tabs.clientWidth };
    const body = root.querySelector('.con-body'), panel = root.querySelector('.con-panel:not([hidden])');
    if(body && panel){
      const pr = panel.getBoundingClientRect(), pcs = getComputedStyle(panel);
      out.fill = { pw: pr.width, ph: pr.height, bw: body.clientWidth, bh: body.clientHeight, tab: panel.getAttribute('data-tab') };
      const inner = panel.clientWidth - px(pcs.paddingLeft) - px(pcs.paddingRight);
      out.hosts = [...panel.querySelectorAll('.con-hosted')].filter(vis).map(h => {
        const hcs = getComputedStyle(h), hr = h.getBoundingClientRect();
        const kid = [...h.children].find(c => vis(c) && !c.classList.contains('panel-close-btn') && getComputedStyle(c).position !== 'absolute');
        const hin = h.clientWidth - px(hcs.paddingLeft) - px(hcs.paddingRight);
        const kr = kid ? kid.getBoundingClientRect() : null;
        const panelLike = [h, ...h.querySelectorAll('.board-panel, .audio-panel, .help-panel')].filter(vis);
        return { id: h.id, w: hr.width, inner, kid: kid ? d(kid) : null, kw: kr ? kr.width : null, hin, l: hr.left, kl: kr ? kr.left : null,
          borders: panelLike.map(x => ({ d: d(x), bw: px(getComputedStyle(x).borderTopWidth) })),
          corners: [h, ...h.querySelectorAll('.board-panel, .audio-panel, .panel')].filter(vis).flatMap(x => {
            let clip = false; for(let a = x; a && a !== root.parentElement; a = a.parentElement) if(/auto|scroll/.test(getComputedStyle(a).overflowY + getComputedStyle(a).overflowX)) clip = true;
            return ['::before', '::after'].map(ps => { const c = getComputedStyle(x, ps);
              if(c.content === 'none' || c.display === 'none' || c.position !== 'absolute') return null;
              const neg = ['top', 'left', 'right', 'bottom'].map(k => [k, px(c[k])]).filter(kv => /px$/.test(c[kv[0]]) && kv[1] < 0);
              return neg.length && clip ? { d: d(x) + ps, off: neg.map(kv => kv[0] + ':' + kv[1]).join(',') } : null; }).filter(Boolean); }) };
      });
    }
  }
  return out;
}"""


# D25 : la barre de filtres du Journal reste collée au bord haut du défileur (défilé au maximum) et couvre toute sa largeur, sans le dépasser.
JRN_BAR = r"""() => {
  const bar = document.querySelector('#sttConsole .jrn-bar'); if(!bar || !bar.getClientRects().length) return null;
  let sc = bar.parentElement; while(sc && !/auto|scroll/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
  if(!sc) return { ok: false, info: 'aucun défileur' };
  const before = sc.scrollTop; sc.scrollTop = sc.scrollHeight; const sr = sc.getBoundingClientRect(), br = bar.getBoundingClientRect(), cs = getComputedStyle(sc);
  const bl = sr.left + parseFloat(cs.borderLeftWidth || 0), brt = sr.right - parseFloat(cs.borderRightWidth || 0) - (sc.offsetWidth - sc.clientWidth - parseFloat(cs.borderLeftWidth || 0) - parseFloat(cs.borderRightWidth || 0));
  const bt = sr.top + parseFloat(cs.borderTopWidth || 0);
  const r = { dt: br.top - bt, dl: br.left - bl, dr: br.right - brt, scrolled: sc.scrollTop > 0 }; sc.scrollTop = before;
  return { ok: Math.abs(r.dt) <= 1 && Math.abs(r.dl) <= 1 && Math.abs(r.dr) <= 1, info: 'écart haut ' + r.dt.toFixed(1) + ', gauche ' + r.dl.toFixed(1) + ', droite ' + r.dr.toFixed(1) + (r.scrolled ? '' : ' (sans défilement)') };
}"""
# D26 : dialogue de sélection du vaisseau ouvert en écran bas (≤ 760 px) ; coins positionnés hors de la boîte qui défile.
SS_PANEL = r"""() => {
  const el = document.getElementById('shipSelect'), p = el && el.querySelector('.ss-panel'); if(!p) return null;
  const was = el.classList.contains('open'); el.classList.add('open');
  const cs = getComputedStyle(p), scrolls = /auto|scroll/.test(cs.overflowY + cs.overflowX);
  const neg = [...p.querySelectorAll('.ss-c')].map(c => { const k = getComputedStyle(c); return ['top', 'left', 'right', 'bottom'].filter(s => /px$/.test(k[s]) && parseFloat(k[s]) < 0).map(s => c.className.replace('ss-c ', '') + ':' + s + ' ' + k[s]); }).flat();
  const r = { ok: !(scrolls && neg.length), info: 'overflow ' + cs.overflowY + ', coins hors boîte : ' + (neg.slice(0, 4).join('; ') || 'aucun') };
  if(!was) el.classList.remove('open'); return r;
}"""

# ---------------------------------------------------------------- enregistrement des résultats (processus travailleur)
RESULTS = []
def check(cid, ok, info="", defects=(), hint=()):
    """defects : défauts auxquels on attribue l'échec (None = non attribuable -> échec franc) ; hint : défauts que cette assertion surveille."""
    flat = []
    for x in defects: flat += x if isinstance(x, list) else [x]
    RESULTS.append({"id": cid, "ok": bool(ok), "info": info if isinstance(info, str) else json.dumps(info, ensure_ascii=False),
                    "defects": flat, "hint": list(hint)})

def scroller_defect(path, scene):
    if ".ms-panel" in path: return "D1"
    if ".help-panel" in path or "#helpOverlay" in path: return "D3" if ".help-panel" in path else "D14"
    if "#audioOverlay" in path: return "D7"
    if ".board-panel" in path: return ["D2", "D6"]       # coins (U1.1) puis max-height/overflow de l'hôte (U1.3)
    if "#sttConsoleTabs" in path: return "D15"
    if "#portPanel" in path: return "D4p"
    if "#stmMap" in path: return "D4"
    if ".con-body" in path or ".con-panel" in path:
        return {"nav": "D4", "port": "D4p", "yard": "D2", "contracts": "D2", "journal": "D25", "missions": "D13", "help": "D14", "helpAudio": "D14"}.get(scene, "D13")
    return None

A_HINT = {"nav": ["D4"], "port": ["D4p"], "yard": ["D2"], "contracts": ["D2"], "missions": ["D2"], "help": ["D3"], "helpAudio": ["D3"]}

def eval_scene(m, scene, tag, console=True):
    """Assertions (a) à (j) sur une mesure `m` ; tag = « 1366x768-fr »."""
    sc = m["scrollers"]
    # (a) aucun défilement horizontal
    off = [s for s in sc if s["h"]]
    check(f"a:{scene}@{tag}", not off, [f"{s['d']} s{s['sw']}>c{s['cw']}" for s in off], [scroller_defect(s["path"], scene) for s in off], A_HINT.get(scene, []))
    if not console: return
    # (b) au plus un ascenseur vertical, et c'est .con-panel
    vs = [s for s in sc if s["v"] and "#sttConsoleTabs" not in s["path"]]
    okb = len(vs) == 1 and vs[0]["d"].startswith(".con-panel") or len(vs) == 0
    check(f"b:{scene}@{tag}", okb, [f"{s['d']} s{s['sh']}>c{s['ch']}" for s in vs], [scroller_defect(s["path"], scene) for s in vs], {"help": ["D14"], "helpAudio": ["D14"]}.get(scene, []))
    # (d) le panneau remplit .con-body à ± 1 px
    f = m.get("fill")
    if f:
        okd = abs(f["pw"] - f["bw"]) <= 1 and abs(f["ph"] - f["bh"]) <= 1
        check(f"d:{scene}@{tag}", okd, f"panneau {f['pw']:.0f}x{f['ph']:.0f} / corps {f['bw']}x{f['bh']}", [{"nav": "D4", "port": "D4p"}.get(scene, "D13")], ["D13"])
    # (e) hôte pleine largeur de l'onglet, premier enfant pleine largeur de l'hôte (D-B)
    for h in m.get("hosts") or []:
        dfe = HOST_DEFECT.get(h["id"])
        if h["kw"] is not None:
            check(f"e:{scene}:{h['id']}@{tag}", abs(h["w"] - h["inner"]) <= 1 and abs(h["kw"] - h["hin"]) <= 1,
                  f"hôte {h['w']:.0f}/{h['inner']:.0f}, {h['kid']} {h['kw']:.0f}/{h['hin']:.0f}", [dfe], [dfe])
        # (k) D9 : plus de cadre dans le cadre (bordure des panneaux hébergés)
        bd = [b for b in h["borders"] if b["bw"] > 0]
        pc = h.get("corners") or []
        check(f"k:{scene}:{h['id']}@{tag}", not bd and not pc, [f"{b['d']} bordure {b['bw']}px" for b in bd] + [f"{c['d']} coin {c['off']} dans une boîte qui défile" for c in pc], ["D9"], ["D9"])
        if h["id"] == "portPanel":
            wide = [c for c in m["controls"] if c["role"] == "bouton-port" and c["w"] > 420]
            check(f"n:{scene}@{tag}", not wide, [f"{c['cls']} {c['w']:.0f}px" for c in wide][:3], ["D10"], ["D10"])
    # (f) aucune croix de panneau visible
    check(f"f:{scene}@{tag}", not m["closeBtns"], m["closeBtns"][:3], ["D8"], ["D8"])
    # (g) barre d'onglets entière
    t = m["tabs"]; check(f"g:{scene}@{tag}", t["sw"] <= t["cw"], f"s{t['sw']} c{t['cw']}", ["D15"], ["D15"])
    # (i) contrôles de même rôle de même hauteur ; polices dans l'échelle --fs-*
    hs = {}
    for c in m["controls"]: hs.setdefault(c["role"], []).append(c["h"])
    badr = {r: sorted(set(round(x) for x in v)) for r, v in hs.items() if max(v) - min(v) > 1}   # écart de hauteur À L'INTÉRIEUR d'un même rôle
    check(f"i:ctl:{scene}@{tag}", not badr, badr or {r: sorted(set(round(x) for x in v)) for r, v in hs.items()}, ["D18"], ["D18"])
    bad = {k: v for k, v in m["fonts"].items() if round(float(k)) not in FS_SET or abs(float(k) - round(float(k))) > 0.01}
    check(f"i:fs:{scene}@{tag}", not bad, {k: f"{v['n']}x {v['ex']}" for k, v in sorted(bad.items(), key=lambda kv: float(kv[0]))}, ["D19"], ["D19"])
    # (o) ascenseurs thémés
    nt = [x["d"] for x in m["themed"] if not x["ok"]]
    check(f"o:{scene}@{tag}", not nt, nt[:4], ["D24"], ["D24"])

def eval_frame(m, tag, vw, vh):
    """(h) cadre de la console : fluide, sans chevaucher la barre du haut ni la barre d'icônes (D-A)."""
    f = m.get("frame")
    if not f: check(f"h:frame@{tag}", False, "cadre invisible", [None]); return
    check(f"h:overlap@{tag}", f["b"] <= f["iconTop"] + 1 and f["t"] >= f["topBottom"] - 1, f"bas {f['b']:.0f} / barre d'icônes {f['iconTop']:.0f} ; haut {f['t']:.0f} / barre du haut {f['topBottom']:.0f}", ["D16"], ["D16"])
    eh = vh - f["hudTop"] - f["hudBottom"]
    check(f"h:height@{tag}", abs(f["h"] - eh) <= 1, f"hauteur {f['h']:.0f}, attendu {eh:.0f}", ["D16"], ["D16"])
    ew = min(1400, vw - 48)
    check(f"h:width@{tag}", abs(f["w"] - ew) <= 1, f"largeur {f['w']:.0f}, attendu {ew:.0f}", ["D12"], ["D12"])


def worker(lang, page_path):
    from playwright.sync_api import sync_playwright
    URL = "file://" + page_path + "?seed=UILAYOUT-1&quality=fixed"
    errors = []
    with sync_playwright() as pw:
        br = pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"], ignore_default_args=["--hide-scrollbars"])
        ctx = br.new_context(viewport={"width": 1366, "height": 768})
        ctx.add_init_script(INIT)
        ctx.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
        ctx.route(re.compile(r"\.(mp3|ogg|wav)$"), lambda r: r.fulfill(status=404, body=""))
        pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)[:200]))
        pg.goto(URL, timeout=90000); pg.wait_for_selector("#boot", state="visible", timeout=30000); pg.click("#boot")
        pg.wait_for_function("() => typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic === true", timeout=90000, polling=250)
        if os.environ.get("UI_LAYOUT_INJECT_CSS"): pg.add_style_tag(content=os.environ["UI_LAYOUT_INJECT_CSS"])   # vérification du test lui-même : défaut injecté
        pg.click(f'.lang-btn[data-lang="{lang}"]')
        pg.wait_for_function("() => document.getElementById('modeSelect') && document.getElementById('modeSelect').classList.contains('open')", timeout=30000, polling=100)
        def size(w, h):
            pg.set_viewport_size({"width": w, "height": h})
            pg.wait_for_function("([w, h]) => innerWidth === w && innerHeight === h && document.body.offsetHeight >= 0", arg=[w, h], timeout=10000, polling=20)
        def measure(sel): return pg.evaluate(MEASURE, sel)
        # ---- Mode de jeu (avant le démarrage : il est ouvert)
        for (w, h) in SIZES:
            size(w, h); tag = f"{w}x{h}-{lang}"; m = measure("#modeSelect")
            off = [s for s in m["scrollers"]]
            check(f"a:modeSelect@{tag}", not [s for s in off if s["h"]], [f"{s['d']} s{s['sw']}>c{s['cw']}" for s in off if s["h"]], [scroller_defect(s["path"], "modeSelect") for s in off if s["h"]], ["D1"])
            check(f"c:modeSelect@{tag}", not off, [f"{s['d']} {s['sw']}x{s['sh']}>{s['cw']}x{s['ch']}" for s in off], [scroller_defect(s["path"], "modeSelect") for s in off], ["D1"])
            nt = [x["d"] for x in m["themed"] if not x["ok"]]
            check(f"o:modeSelect@{tag}", not nt, nt[:4], ["D24"], ["D24"])
            fo = pg.evaluate("() => { const o = document.querySelector('#modeSelect .ms-opt'), l = document.querySelector('#modeSelect .ms-list'); return [parseFloat(getComputedStyle(o).fontSize), parseFloat(getComputedStyle(l).fontSize)]; }")
            check(f"i:ms-opt-font@{tag}", abs(fo[0] - fo[1]) < 0.01, f"option {fo[0]}px, liste {fo[1]}px", ["D21"], ["D21"])
        # ---- démarrage rapide (le tableau des missions s'ouvre seul), escale simulée pour Port et Chantier
        pg.evaluate("() => window.__sttQuickStart('e18', { jump: true, missions: true })")
        pg.wait_for_function("() => REAL.started === true", timeout=60000, polling=250)
        pg.evaluate("() => { LAYERS.skipRender = true; window.__step(3); document.getElementById('modeSelect').classList.remove('open'); }")
        pg.wait_for_function("() => { if(CONSOLE.current() !== 'missions') window.__step(20); return CONSOLE.current() === 'missions'; }", timeout=90000, polling=100)
        pg.evaluate("() => { orbitState.active = true; CONSOLE.refresh(); }")
        def open_scene(sc):
            pg.evaluate("""(sc) => { const a = document.getElementById('audioOverlay'); if(a) a.classList.remove('visible');
              if(sc === 'missions'){ LOCAL.closeContractBoard(); }
              if(sc === 'contracts'){ LOCAL.openContractBoard(); }
              if(sc === 'helpAudio'){ CONSOLE.open('help'); CONSOLE.help.toggleAudio(); }
              else CONSOLE.open({ nav: 'nav', missions: 'missions', contracts: 'missions', port: 'port', yard: 'yard', journal: 'journal', help: 'help' }[sc]); }""", sc)
            pg.wait_for_function("(t) => { const p = document.querySelector('#sttConsole .con-panel:not([hidden])'); return !!p && p.getAttribute('data-tab') === t && p.getClientRects().length > 0; }", arg=CONSOLE_TAB[sc], timeout=10000, polling=20)
        rects = {}
        for (w, h) in SIZES:
            size(w, h); tag = f"{w}x{h}-{lang}"
            for sc in SCENES:
                open_scene(sc); m = measure("#sttConsole")
                if m.get("missing") or m.get("fill") is None or m["fill"]["tab"] != CONSOLE_TAB[sc]:
                    check(f"scene:{sc}@{tag}", False, f"onglet attendu {CONSOLE_TAB[sc]}, mesuré {(m.get('fill') or {}).get('tab')}", [None]); continue
                eval_scene(m, sc, tag)
                if (w, h) == (1366, 768): rects[sc] = (m["fill"]["pw"], m["fill"]["ph"])
                if sc == "missions": eval_frame(m, tag, w, h)
                if sc == "journal":
                    jb = pg.evaluate(JRN_BAR)
                    if jb: check(f"p:jrn-bar@{tag}", jb["ok"], jb["info"], ["D25"], ["D25"])
                if sc == "helpAudio":
                    hp = pg.evaluate("() => { const a = document.querySelector('#audioOverlay .audio-panel'), p = document.querySelector('#helpOverlay .help-panel'); if(!a || !p) return null;"
                                     " const ar = a.getBoundingClientRect(), pr = p.getBoundingClientRect(); return [ar.left, ar.width, pr.left, pr.width]; }")
                    check(f"m:audio-aligne@{tag}", bool(hp) and abs(hp[0] - hp[2]) <= 1 and abs(hp[1] - hp[3]) <= 1, hp, ["D7"], ["D7"])
                if sc == "help" or sc == "helpAudio":
                    hg = pg.evaluate("() => [...document.querySelectorAll('#helpGrid .hk, #helpGrid .hv')].map(e => e.textContent.trim())")
                    rawl = [x for x in hg if re.match(r"^lbl\w*$", x)]; rawh = [x for x in hg if re.match(r"^hk_\w*$", x)]
                    if sc == "help":
                        check(f"j:lbl@{tag}", not rawl, rawl, ["D11"], ["D11"])
                        check(f"j:hk@{tag}", not rawh, rawh, ["D20"], ["D20"])
                        if lang != "fr":
                            fr = [x for x in hg if re.search(r"ENTR[ÉE]E|ÉCHAP|ECHAP|ESPACE", x)]
                            check(f"j:hk-francais@{tag}", not fr, fr, ["D20"], ["D20"])
            # (D17) un seul style de titre interne, toutes onglets confondus
            sigs = {}
            for sc in ("missions", "yard", "port", "help", "helpAudio"):
                open_scene(sc); m = measure("#sttConsole")
                for t in m["titles"]: sigs.setdefault(t["sig"], []).append(f"{sc}:{t['d']}")
            check(f"l:titres@{tag}", len(sigs) <= 1, {k: v[:2] for k, v in sigs.items()}, ["D17"], ["D17"])
            # ---- Pause
            pg.evaluate("() => { CONSOLE.close('user'); enterPause(); }")
            pg.wait_for_function("() => { const o = document.getElementById('pauseOverlay'); return !!o && o.getClientRects().length > 0 && !!o.querySelector('.pause-btn'); }", timeout=10000, polling=20)
            m = measure("#pauseOverlay"); off = m["scrollers"]
            check(f"a:pause@{tag}", not [s for s in off if s["h"]], [f"{s['d']} s{s['sw']}>c{s['cw']}" for s in off], [scroller_defect(s["path"], "pause") for s in off], [])
            check(f"c:pause@{tag}", not off, [f"{s['d']}" for s in off], [scroller_defect(s["path"], "pause") for s in off], [])
            ph = pg.evaluate("() => [...document.querySelectorAll('#pauseOverlay .pause-btn')].map(b => b.getBoundingClientRect().height)")
            check(f"i:pause-btn@{tag}", bool(ph) and max(ph) - min(ph) <= 0.5, [round(x, 1) for x in ph], ["D22"], ["D22"])
            pg.evaluate("() => resumeGame()")
        # ---- 800x600 : barre d'onglets et cadre
        size(800, 600); tag = f"800x600-{lang}"
        for sc in ("missions", "help"):
            open_scene(sc); m = measure("#sttConsole")
            if m.get("tabs"):
                check(f"g:{sc}@{tag}", m["tabs"]["sw"] <= m["tabs"]["cw"], f"s{m['tabs']['sw']} c{m['tabs']['cw']}", ["D15"], ["D15"])
            if sc == "missions": eval_frame(m, tag, 800, 600)
        # ---- D26 : sélection du vaisseau en écran bas (@media max-width:760px)
        size(700, 600); sp = pg.evaluate(SS_PANEL)
        if sp: check(f"q:ss-panel@700x600-{lang}", sp["ok"], sp["info"], ["D26"], ["D26"])
        # ---- redimensionnement 1366x768 -> 1024x640 -> retour : (a), (b), (d) aux deux tailles
        for sc in ("nav", "missions", "journal"):
            ref = None
            for (w, h, nm) in ((1366, 768, "1366x768"), (1024, 640, "1024x640"), (1366, 768, "retour")):
                size(w, h); open_scene(sc); m = measure("#sttConsole"); tg = f"resize-{nm}-{lang}"
                if not m.get("fill"): check(f"scene:{sc}@{tg}", False, "pas de panneau", [None]); continue
                tmp = RESULTS[:]; eval_scene(m, sc, tg)
                RESULTS[:] = tmp + [r for r in RESULTS[len(tmp):] if r["id"][0] in "abd"]
                if nm == "1366x768": ref = (m["fill"]["pw"], m["fill"]["ph"])
                if nm == "retour":
                    check(f"r:retour-identique:{sc}@{lang}", ref and abs(ref[0] - m["fill"]["pw"]) <= 1 and abs(ref[1] - m["fill"]["ph"]) <= 1, f"{ref} -> {(m['fill']['pw'], m['fill']['ph'])}", [None])
        check(f"js:erreurs@{lang}", not errors, errors[:3], [None])
        br.close()
    for r in RESULTS: print("@@" + json.dumps(r, ensure_ascii=False), flush=True)


def parent(page_path):
    t0 = time.time(); procs = []
    for lang in ("fr", "de"):
        procs.append((lang, subprocess.Popen([sys.executable, os.path.abspath(__file__), page_path, "--worker", lang], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)))
    results = []; crashed = []
    for lang, p in procs:
        out, _ = p.communicate()
        got = [json.loads(l[2:]) for l in out.splitlines() if l.startswith("@@")]
        if p.returncode != 0 or not got:
            crashed.append(lang); print(f"  TRAVAILLEUR {lang} en échec (code {p.returncode}) :\n" + "\n".join(out.splitlines()[-12:]))
        results += got
    npass = npend = nfail = 0; pend_by_task = {}; defect_state = {}
    for r in results:
        for d in r["hint"]:
            defect_state.setdefault(d, {"pass": 0, "fail": 0})
        if r["ok"]:
            npass += 1
            for d in r["hint"]: defect_state[d]["pass"] += 1
            continue
        known = sorted(set(d for d in r["defects"] if d in PENDING))
        unknown = [d for d in r["defects"] if d is None or d not in PENDING]   # candidats hors PENDING
        for d in r["defects"]:
            if d: defect_state.setdefault(d, {"pass": 0, "fail": 0})["fail"] += 1
        if not known:   # PENDING dès qu'un candidat l'est encore ; FAIL seulement si tous les candidats sont retirés (ou aucun attribuable)
            nfail += 1; print(f"    FAIL    {r['id']}  — {r['info'][:230]}" + (f"  [hors PENDING : {sorted(set(d for d in unknown if d)) or 'non attribuable'}]"))
        else:
            npend += 1; tasks = sorted(set(PENDING[d] for d in known))
            print(f"    PENDING ({', '.join(tasks)}) {r['id']} [{','.join(known)}]  — {r['info'][:200]}")
            for d in known: pend_by_task.setdefault(PENDING[d], set()).add(d)
    for d in sorted(PENDING, key=lambda x: int(x[1:].rstrip("p"))):
        st = defect_state.get(d, {"pass": 0, "fail": 0})
        if st["fail"] == 0 and st["pass"] > 0: print(f"    CORRIGÉ : retirer {d} de PENDING ({PENDING[d]})")
        if st["fail"] == 0 and st["pass"] == 0: print(f"    (défaut {d} : aucune assertion ne l'a mesuré)")
    nfail += len(crashed)
    print(f"\n  Récapitulatif : PASS {npass} / PENDING {npend} / FAIL {nfail}   ({time.time() - t0:.0f} s)")
    dkey = lambda x: int(x[1:].rstrip('p'))
    for t in sorted(pend_by_task): print(f"    en attente de {t} : {', '.join(sorted(pend_by_task[t], key=dkey))}")
    sys.exit(1 if nfail else 0)


if __name__ == "__main__":
    pp = os.path.abspath(sys.argv[1])
    if "--worker" in sys.argv: worker(sys.argv[sys.argv.index("--worker") + 1], pp)
    else: parent(pp)
