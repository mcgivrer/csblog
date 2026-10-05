"""
Lot L1.9 — console de bord (#sttConsole) : anciennes touches, Tab, Échap sans pause, F2-F5, touches 1..8 (sans Alt), onglets Port/Chantier
masqués loin d'un port, ouverture automatique du tableau de missions, overlays hébergés, saisie de texte, écran tactile étroit.
Joué en Partie libre ET en campagne.
Usage : python3 src/test/console_test.py target/space-travel.html
"""
import os, re, sys
if os.path.isdir("/opt/pw-browsers"): os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")   # bac a sable d origine ; ailleurs, emplacement par defaut de Playwright
from playwright.sync_api import sync_playwright
page_path = os.path.abspath(sys.argv[1]); URL = "file://" + page_path + "?seed=CONSOLE-1&quality=fixed"
INIT = r"""(() => { let t = 1000; performance.now = () => t; Date.now = () => 1790000000000 + t;
  const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n, ms) => { for(let i = 0; i < n; i++){ t += (ms || 100); q.splice(0).forEach(cb => cb(t)); } }; })();"""
fails = []; errors = []
def check(name, ok, info=""):
    print(("    PASS " if ok else "    FAIL ") + name + (f"  — {info}" if info != "" else ""))
    if not ok: fails.append(name)

HOSTED = ["stmMap", "missionBoardOverlay", "contractBoardOverlay", "portPanel", "shipyardOverlay", "helpOverlay", "audioOverlay"]
CUR = "() => CONSOLE.current()"
# un nœud est « visible » s'il génère une boîte ; un overlay visible doit se trouver dans #sttConsole
VISIBLE_OUTSIDE = """(ids) => ids.filter(id => { const n = document.getElementById(id); if(!n) return false;
  const cs = getComputedStyle(n); const shown = cs.display !== 'none' && cs.visibility !== 'hidden' && n.getClientRects().length > 0;
  return shown && !n.closest('#sttConsole'); })"""
NOT_HOSTED = """(ids) => ids.filter(id => { const n = document.getElementById(id); return !n || !n.closest('#sttConsole'); })"""
SHOWN_INSIDE = """(ids) => ids.filter(id => { const n = document.getElementById(id); return n && n.closest('#sttConsole') && n.getClientRects().length > 0; })"""

def cur(pg): return pg.evaluate(CUR)
def settle(pg, ms=60): pg.wait_for_timeout(ms)      # les MutationObserver de la vue tournent en microtâche, hors du temps virtuel
def press(pg, key): pg.keyboard.press(key); settle(pg)
def reset(pg):
    """Console fermée, jeu hors pause, plus de champ de saisie, plus de proximité simulée."""
    pg.evaluate("() => { if(gamePaused) resumeGame(); CONSOLE.close('user'); orbitState.active = false; CONSOLE.refresh(); }"); settle(pg)

def digit(pg, n, alt=False):
    pg.evaluate("([n, alt]) => { document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit' + n, key: String(n), altKey: alt, bubbles: true, cancelable: true })); }", [n, alt]); settle(pg)

def boot(br, mobile=False):
    kw = dict(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True) if mobile else dict(viewport={"width": 1100, "height": 640})
    ctx = br.new_context(**kw)
    ctx.add_init_script(INIT)
    ctx.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
    ctx.route(re.compile(r"\.(mp3|ogg|wav)$"), lambda r: r.fulfill(status=404, body=""))
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)[:200]))
    pg.goto(URL, timeout=90000); pg.wait_for_timeout(600)
    if mobile: pg.tap("#boot")
    else: pg.click("#boot")
    pg.wait_for_function("() => typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic === true", timeout=90000, polling=250)
    return pg

def start_free(pg):
    pg.evaluate("() => window.__sttQuickStart('e18', { jump: true, missions: true })")
    pg.wait_for_function("() => REAL.started === true", timeout=60000, polling=250)
    pg.evaluate("() => { LAYERS.skipRender = true; window.__step(3); }")

def start_campaign(pg):
    pg.click('.lang-btn[data-lang="fr"]')
    pg.wait_for_function("() => document.getElementById('modeSelect') && document.getElementById('modeSelect').classList.contains('open')", timeout=30000, polling=100)
    pg.keyboard.press("Enter")
    pg.wait_for_function("() => gameStarted === true", timeout=60000, polling=250)
    pg.evaluate("() => { LAYERS.skipRender = true; window.__step(3); }")

def scenario(pg, label):
    print(f"  [{label}]")
    reset(pg)
    check(f"{label} : console fermée au départ, 7 overlays hébergés dans #sttConsole",
          cur(pg) is None and pg.evaluate(NOT_HOSTED, HOSTED) == [], pg.evaluate(NOT_HOSTED, HOSTED))
    check(f"{label} : aucun overlay visible console fermée", pg.evaluate(VISIBLE_OUTSIDE, HOSTED) == [] and pg.evaluate(SHOWN_INSIDE, HOSTED) == [], pg.evaluate(SHOWN_INSIDE, HOSTED))

    # --- anciennes touches : bon onglet, second appui referme
    for key, tab in (("KeyM", "nav"), ("Semicolon", "nav"), ("KeyJ", "missions"), ("KeyH", "help"), ("KeyV", "help")):
        reset(pg); press(pg, key)
        c1 = cur(pg); shown = pg.evaluate("() => !document.getElementById('sttConsole').hidden")
        press(pg, key)
        check(f"{label} : {key} ouvre « {tab} » puis referme", c1 == tab and shown and cur(pg) is None, [c1, cur(pg)])
    # --- aucun overlay hors console, pour chaque onglet ouvert ; un seul panneau visible
    for key in ("KeyM", "KeyJ", "KeyH"):
        reset(pg); press(pg, key)
        out = pg.evaluate(VISIBLE_OUTSIDE, HOSTED); panels = pg.evaluate("() => [...document.querySelectorAll('#sttConsole .con-panel')].filter(p => !p.hidden).length")
        check(f"{label} : {key} — aucun overlay visible hors #sttConsole, un seul panneau", out == [] and panels == 1, [out, panels])
    reset(pg)

    # --- Tab : ouvre sur le dernier onglet, referme
    press(pg, "KeyJ"); press(pg, "KeyJ")
    press(pg, "Tab"); t1 = cur(pg)
    press(pg, "Tab"); t2 = cur(pg)
    check(f"{label} : Tab rouvre le dernier onglet (missions) puis referme", t1 == "missions" and t2 is None, [t1, t2])
    press(pg, "KeyH"); press(pg, "Tab"); press(pg, "Tab")
    check(f"{label} : Tab suit le dernier onglet (help)", cur(pg) == "help", cur(pg))
    reset(pg)

    # --- Échap : ferme sans pause, le second met en pause
    press(pg, "KeyH")
    press(pg, "Escape")
    st1 = pg.evaluate("() => ({ cur: CONSOLE.current(), paused: gamePaused })")
    check(f"{label} : Échap ferme la console SANS pause", st1["cur"] is None and st1["paused"] is False, st1)
    pg.keyboard.up("Escape")
    press(pg, "Escape")
    st2 = pg.evaluate("() => ({ cur: CONSOLE.current(), paused: gamePaused })")
    check(f"{label} : le second Échap met en pause", st2["paused"] is True and st2["cur"] is None, st2)
    reset(pg)

    # --- F2-F5 : F2 nav, F3 missions ; F4/F5 sans effet loin d'un port
    for key, tab in (("F2", "nav"), ("F3", "missions")):
        reset(pg); press(pg, key); c1 = cur(pg); press(pg, key)
        check(f"{label} : {key} ouvre « {tab} » puis referme", c1 == tab and cur(pg) is None, [c1, cur(pg)])
    reset(pg)
    near = pg.evaluate("() => isNearPortService()")
    press(pg, "F4"); a = cur(pg); press(pg, "F5"); b = cur(pg)
    check(f"{label} : F4/F5 sans effet hors port", not near and a is None and b is None, [near, a, b])
    tabs = pg.evaluate("() => ({ port: document.querySelector('#sttConsoleTabs [data-tab=port]').hidden, yard: document.querySelector('#sttConsoleTabs [data-tab=yard]').hidden })")
    check(f"{label} : boutons Port et Chantier hidden loin d'un port", tabs["port"] and tabs["yard"], tabs)
    # proximité simulée (comme l'escale : orbitState.active)
    pg.evaluate("() => { orbitState.active = true; CONSOLE.refresh(); }"); settle(pg)
    tabs = pg.evaluate("() => ({ port: document.querySelector('#sttConsoleTabs [data-tab=port]').hidden, yard: document.querySelector('#sttConsoleTabs [data-tab=yard]').hidden, vis: CONSOLE.visibleTabs().map(t => t.id) })")
    check(f"{label} : boutons Port et Chantier visibles à l'approche", not tabs["port"] and not tabs["yard"], tabs)
    press(pg, "F4"); a = cur(pg); press(pg, "F4"); a2 = cur(pg)
    press(pg, "F5"); b = cur(pg); press(pg, "F5"); b2 = cur(pg)
    check(f"{label} : F4 → port, F5 → chantier (aller-retour) près d'un port", a == "port" and a2 is None and b == "yard" and b2 is None, [a, a2, b, b2])
    press(pg, "F4")
    out = pg.evaluate(VISIBLE_OUTSIDE, HOSTED)
    check(f"{label} : onglet Port — aucun overlay hors console", out == [] and pg.evaluate("() => document.getElementById('portPanel').closest('#sttConsole') !== null"), out)
    pg.evaluate("() => { orbitState.active = false; }"); settle(pg, 400)    # le rafraîchissement périodique (250 ms) referme l'onglet masqué
    check(f"{label} : en quittant le port, la console sur Port se referme", cur(pg) is None, cur(pg))
    reset(pg)

    # --- F1, F6, F7, F8 : sans effet
    ok = True; info = []
    for key in ("F1", "F6", "F7", "F8"):
        press(pg, key); c = cur(pg); info.append([key, c, pg.evaluate("() => gamePaused")])
        if c is not None or info[-1][2]: ok = False
    check(f"{label} : F1/F6/F7/F8 sans effet (console fermée, pas de pause)", ok, info)
    press(pg, "KeyH"); press(pg, "F1"); press(pg, "F7")
    check(f"{label} : F1/F7 sans effet console ouverte", cur(pg) == "help", cur(pg))
    reset(pg)

    # --- 1 : .hud-left ; 7 : radio (sans Alt)
    h0 = pg.evaluate("() => document.querySelector('.hud-left').classList.contains('panel-hidden')")
    digit(pg, 1); h1 = pg.evaluate("() => document.querySelector('.hud-left').classList.contains('panel-hidden')")
    digit(pg, 1); h2 = pg.evaluate("() => document.querySelector('.hud-left').classList.contains('panel-hidden')")
    check(f"{label} : Digit1 bascule .hud-left (puis rebascule)", h1 != h0 and h2 == h0, [h0, h1, h2])
    r0 = pg.evaluate("() => document.getElementById('radioPanel').classList.contains('visible')")
    digit(pg, 7); r1 = pg.evaluate("() => document.getElementById('radioPanel').classList.contains('visible')")
    digit(pg, 7); r2 = pg.evaluate("() => document.getElementById('radioPanel').classList.contains('visible')")
    check(f"{label} : Digit7 bascule le radio (puis rebascule)", r1 != r0 and r2 == r0, [r0, r1, r2])
    check(f"{label} : chiffre n'ouvre pas la console", cur(pg) is None, cur(pg))
    digit(pg, 1, alt=True); h3 = pg.evaluate("() => document.querySelector('.hud-left').classList.contains('panel-hidden')")
    check(f"{label} : Alt+Digit1 ne bascule PAS .hud-left", h3 == h0, [h0, h3])

    # --- saisie dans un champ texte : aucun raccourci
    pg.evaluate("() => { const i = document.createElement('input'); i.type = 'text'; i.id = '__tin'; document.body.appendChild(i); i.focus(); }")
    for key in ("KeyM", "KeyJ", "KeyH", "KeyV", "Semicolon", "F2", "F3"):
        pg.keyboard.press(key)
    pg.wait_for_timeout(100)
    st = pg.evaluate("() => ({ cur: CONSOLE.current(), paused: gamePaused, focus: document.activeElement.id })")
    check(f"{label} : frappes dans un champ texte focalisé : aucun raccourci", st["cur"] is None and not st["paused"], st)
    hl0 = pg.evaluate("() => document.querySelector('.hud-left').classList.contains('panel-hidden')")
    rv0 = pg.evaluate("() => document.getElementById('radioPanel').classList.contains('visible')")
    pg.keyboard.press("Digit1"); pg.keyboard.press("Digit7"); pg.wait_for_timeout(100)
    hl1 = pg.evaluate("() => document.querySelector('.hud-left').classList.contains('panel-hidden')")
    rv = pg.evaluate("() => document.getElementById('radioPanel').classList.contains('visible')")
    check(f"{label} : Digit1/Digit7 dans un champ texte focalisé : aucun effet", hl1 == hl0 and rv == rv0, [hl0, hl1, rv0, rv])
    pg.evaluate("() => { document.getElementById('__tin').remove(); }")
    reset(pg)

    # --- touches retirées : la console ouverte avale les autres touches de jeu (P reste au jeu)
    out = pg.evaluate(VISIBLE_OUTSIDE, HOSTED)
    check(f"{label} : console fermée, aucun overlay visible hors console", out == [], out)

def board_opens(pg, label):
    """Escale : le tableau de missions s'ouvre tout seul et la console passe sur « missions »."""
    pg.evaluate("() => { let n = 0; while(n++ < 600 && !(missionBoardOverlay.style.display === 'flex')) window.__step(1); }")
    pg.wait_for_function("() => CONSOLE.current() === 'missions'", timeout=3000, polling=50)
    st = pg.evaluate("() => ({ cur: CONSOLE.current(), board: missionBoardOverlay.style.display, inside: !!missionBoardOverlay.closest('#sttConsole') })")
    check(f"{label} : ouverture auto du tableau à l'escale ⇒ console sur « missions »", st["cur"] == "missions" and st["board"] == "flex" and st["inside"], st)
    check(f"{label} : la croix #missionClose est masquée (display:none) dans la console", pg.evaluate("() => { const x = document.getElementById('missionClose'); return !x || getComputedStyle(x).display === 'none'; }"))
    check(f"{label} : tableau ouvert, aucun overlay hors console", pg.evaluate(VISIBLE_OUTSIDE, HOSTED) == [], pg.evaluate(VISIBLE_OUTSIDE, HOSTED))

with sync_playwright() as pw:
    br = pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])

    # ---------- Partie libre ----------
    pg = boot(br); start_free(pg)
    check("Partie libre : GAME.mode() = free, CONSOLE définie", pg.evaluate("() => GAME.mode() === 'free' && typeof CONSOLE === 'object' && !!CONSOLE.view"))
    board_opens(pg, "Partie libre")
    scenario(pg, "Partie libre")
    pg.context.close()

    # ---------- Campagne ----------
    pg = boot(br); start_campaign(pg)
    check("Campagne : GAME.mode() = campaign", pg.evaluate("() => GAME.mode() === 'campaign'"))
    try: board_opens(pg, "Campagne")
    except Exception as e: check("Campagne : ouverture auto du tableau à l'escale ⇒ console sur « missions »", False, str(e)[:160])
    scenario(pg, "Campagne")
    pg.context.close()

    # ---------- tactile 390x844 ----------
    print("  [tactile 390x844]")
    pg = boot(br, mobile=True); start_free(pg)
    pg.keyboard.press("KeyH"); settle(pg)
    for tab in ("help", "nav", "missions"):
        pg.evaluate("(t) => CONSOLE.open(t)", tab); settle(pg, 100)
        m = pg.evaluate("""() => { const r = document.getElementById('sttConsole').getBoundingClientRect(), f = document.querySelector('#sttConsole .con-frame').getBoundingClientRect();
          return { sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, iw: innerWidth, ih: innerHeight, rw: r.width, rh: r.height, fw: f.width, fh: f.height,
            panels: [...document.querySelectorAll('#sttConsole .con-panel')].filter(p => !p.hidden && p.getClientRects().length).length, cur: CONSOLE.current() }; }""")
        check(f"tactile : « {tab} » — pas de défilement horizontal de la page", m["sw"] <= m["iw"] and m["bw"] <= m["iw"], m)
        check(f"tactile : « {tab} » — console plein écran, un seul panneau", m["cur"] == tab and m["fw"] >= m["iw"] - 1 and m["fh"] >= m["ih"] - 1 and m["panels"] == 1, m)
    pg.evaluate("() => CONSOLE.close('user')")
    pg.context.close()

    br.close()

check("aucune erreur JavaScript (pageerror)", not errors, errors[:3])
sys.exit(1 if fails else 0)
