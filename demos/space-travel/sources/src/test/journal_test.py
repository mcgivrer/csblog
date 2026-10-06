"""
Lot L1.15 — onglet Journal de la console de bord (JOURNAL, touche L) : ouverture/fermeture, onglet toujours visible, filtres,
ordre (récent en haut), badge des entrées importantes (livraison) remis à zéro à l'ouverture, finances en Partie libre
(entrée « fin ») et en campagne (motif « delivery » dans GAME.state.ledger, state.journal rempli), reprise d'une sauvegarde
v:1 SANS champ « journal », sauvegarde puis rechargement d'une campagne, texte radio affiché brut (jamais en HTML),
saut puis arrivée RÉELS (REAL.debugSkipToDeparture : evt « jump » puis « arrive »), écran tactile 390x844.
Doit passer sur la page lisible ET sur la page obfusquée (réaffectation des globales addCredits / appendRadioLine sous terser).
Usage : python3 src/test/journal_test.py target/space-travel.html   (ou target/space-travel.min.html)
"""
import os, re, sys
if os.path.isdir("/opt/pw-browsers"): os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")   # bac a sable d origine ; ailleurs, emplacement par defaut de Playwright
from playwright.sync_api import sync_playwright
page_path = os.path.abspath(sys.argv[1]); URL = "file://" + page_path + "?seed=JOURNAL-1&quality=fixed"
INIT = r"""(() => { let t = 1000; performance.now = () => t; Date.now = () => 1790000000000 + t;
  const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n, ms) => { for(let i = 0; i < n; i++){ t += (ms || 100); q.splice(0).forEach(cb => cb(t)); } }; })();"""
fails = []; errors = []
def check(name, ok, info=""):
    print(("    PASS " if ok else "    FAIL ") + name + (f"  — {info}" if info != "" else ""))
    if not ok: fails.append(name)

def settle(pg, ms=80): pg.wait_for_timeout(ms)
def press(pg, key): pg.keyboard.press(key); settle(pg)
def cur(pg): return pg.evaluate("() => CONSOLE.current()")

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

def start_free(pg, ship="e18", opts="{ jump: true, missions: true }"):
    pg.evaluate(f"() => window.__sttQuickStart('{ship}', {opts})")
    pg.wait_for_function("() => REAL.started === true", timeout=60000, polling=250)
    pg.evaluate("() => { LAYERS.skipRender = true; window.__step(3); }")

def start_campaign(pg):
    pg.click('.lang-btn[data-lang="fr"]')
    pg.wait_for_function("() => document.getElementById('modeSelect') && document.getElementById('modeSelect').classList.contains('open')", timeout=30000, polling=100)
    pg.keyboard.press("Enter")
    pg.wait_for_function("() => gameStarted === true", timeout=60000, polling=250)
    pg.evaluate("() => { LAYERS.skipRender = true; window.__step(3); }")

RADIO = "(a) => { appendRadioLine({ from: a[0], label: a[1], text: a[2] }); }"
ROWS = "() => [...document.querySelectorAll('#sttConsole .con-panel[data-tab=journal] .jrn-row')].map(r => ({ kind: r.dataset.kind, text: r.textContent }))"
def chip(pg, f): pg.evaluate("(f) => document.querySelector('#sttConsole .jrn-chip[data-f=' + f + ']').click()", f); settle(pg)
def badge(pg): return pg.evaluate("() => { const b = document.querySelector('#sttConsoleTabs [data-tab=journal] .con-badge'); return b && !b.hidden ? b.textContent : null; }")
def evts(pg): return pg.evaluate("() => JOURNAL.list({ kinds: ['evt'] }).map(e => [e.code, e.a, e.b, e.imp])")
def wait_evt(pg, code, ms=8000):
    pg.wait_for_function("(c) => JOURNAL.list({ kinds: ['evt'] }).some(e => e.code === c)", arg=code, timeout=ms, polling=100)

def deliver(pg):
    """Une mission livrée de plus (le compteur MISSIONS.state.done), vue au prochain instantané (250 ms)."""
    pg.evaluate("() => { MISSIONS.state.done.push({ fake: true }); }"); wait_evt(pg, "msn.done")

def common(pg, label, campaign):
    print(f"  [{label}]")
    pg.evaluate("() => { if(gamePaused) resumeGame(); CONSOLE.close('user'); orbitState.active = false; CONSOLE.refresh(); }"); settle(pg)
    # --- onglet toujours visible, L ouvre puis ferme
    vis = pg.evaluate("() => CONSOLE.visibleTabs().map(t => t.id)")
    check(f"{label} : l'onglet « journal » est visible console fermée, loin d'un port", "journal" in vis, vis)
    press(pg, "KeyL"); c1 = cur(pg); shown = pg.evaluate("() => !document.getElementById('sttConsole').hidden")
    press(pg, "KeyL")
    check(f"{label} : L ouvre le Journal puis le referme", c1 == "journal" and shown and cur(pg) is None, [c1, cur(pg)])
    # --- radio : ordre, texte brut, filtres
    pg.evaluate(RADIO, ["ship", "Alpha", "premiere ligne"]); pg.evaluate(RADIO, ["tower", "Tour", "deuxieme ligne"])
    pg.evaluate(RADIO, ["ship", "Beta", "<b>gras</b> & <i>x</i>"])
    pg.evaluate("() => addCredits(250, 'delivery')")
    press(pg, "KeyL")
    rows = pg.evaluate(ROWS)
    radios = [r for r in rows if r["kind"] == "radio"]
    check(f"{label} : lignes radio en tête dans l'ordre récent -> ancien", len(radios) >= 3 and "<b>gras</b>" in radios[0]["text"] and "premiere" in radios[2]["text"], [r["text"][:30] for r in radios[:3]])
    raw = pg.evaluate("() => { const r = [...document.querySelectorAll('#sttConsole .con-panel[data-tab=journal] .jrn-row[data-kind=radio]')][0]; return { html: r.querySelector('.jrn-x').querySelectorAll('b, i').length, text: r.textContent }; }")
    check(f"{label} : texte radio contenant du HTML affiché brut (aucun <b>/<i> créé)", raw["html"] == 0 and "<b>gras</b> & <i>x</i>" in raw["text"], raw)
    kinds = {}
    for f in ("all", "radio", "fin", "evt"):
        chip(pg, f); rs = pg.evaluate(ROWS); kinds[f] = {r["kind"] for r in rs}
    check(f"{label} : filtres Tout/Radio/Finances/Événements ne montrent que leur rubrique",
          kinds["radio"] == {"radio"} and kinds["fin"] <= {"fin"} and kinds["evt"] <= {"evt"} and {"radio", "fin"} <= kinds["all"], {k: sorted(v) for k, v in kinds.items()})
    chip(pg, "all"); press(pg, "KeyL")
    # --- finances
    if not campaign:
        fin = pg.evaluate("() => JOURNAL.list({ kinds: ['fin'] }).map(e => [e.reason, e.delta, e.bal, credits])")
        check(f"{label} : addCredits en Partie libre -> entrée « fin » (motif, delta, solde)", bool(fin) and fin[0][0] == "delivery" and fin[0][1] == 250 and fin[0][2] == fin[0][3], fin[:2])
    else:
        led = pg.evaluate("() => ({ last: GAME.state.ledger[GAME.state.ledger.length - 1], fin: JOURNAL.list({ kinds: ['fin'] }).map(e => [e.reason, e.delta]) })")
        check(f"{label} : addCredits en campagne -> motif « delivery » dans GAME.state.ledger", led["last"] is not None and led["last"][1] == "delivery" and led["last"][2] == 250 and ["delivery", 250] in led["fin"], led)
    # --- badge après une livraison, remise à zéro à l'ouverture
    check(f"{label} : pas de badge avant livraison", badge(pg) is None, badge(pg))
    deliver(pg)
    b = badge(pg)
    check(f"{label} : badge de l'onglet après une livraison (entrée importante)", b is not None and int(b) >= 1, b)
    press(pg, "KeyL")
    check(f"{label} : badge remis à zéro à l'ouverture du Journal", badge(pg) is None, badge(pg))
    ev = evts(pg)
    check(f"{label} : événement msn.done important dans le journal", any(e[0] == "msn.done" and e[3] for e in ev), ev[:3])
    press(pg, "KeyL")
    if campaign:
        sj = pg.evaluate("() => GAME.state.journal.map(e => e[1])")
        check(f"{label} : GAME.state.journal rempli (msn.done)", "msn.done" in sj, sj)

with sync_playwright() as pw:
    br = pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])

    # ---------- Partie libre ----------
    pg = boot(br); start_free(pg)
    check("Partie libre : GAME.mode() = free, JOURNAL et onglet définis", pg.evaluate("() => GAME.mode() === 'free' && typeof JOURNAL === 'object' && CONSOLE.visibleTabs().some(t => t.id === 'journal')"))
    common(pg, "Partie libre", False)
    pg.context.close()

    # ---------- Campagne ----------
    pg = boot(br); start_campaign(pg)
    check("Campagne : GAME.mode() = campaign", pg.evaluate("() => GAME.mode() === 'campaign'"))
    common(pg, "Campagne", True)
    # sauvegarde puis rechargement d'une campagne avec journal
    r = pg.evaluate("""() => { const sj = GAME.state.journal.length; const ok = SAVE.write(); const s = SAVE.read();
        GAME.load(s); return { ok: ok, sj: sj, after: JOURNAL.list({ kinds: ['evt'] }).map(e => e.code), unread: JOURNAL.unread() }; }""")
    check("Campagne : sauvegarde puis rechargement -> journal restauré, tout lu", r["ok"] and r["sj"] >= 1 and "msn.done" in r["after"] and r["unread"] == 0, r)
    # reprise d'une sauvegarde v:1 SANS champ « journal »
    r = pg.evaluate("""() => { const s = JSON.parse(JSON.stringify(GAME.state)); delete s.journal; GAME.load(s);
        return { evts: JOURNAL.list({ kinds: ['evt'] }).length, hasJ: 'journal' in GAME.state }; }""")
    settle(pg, 900)
    ev2 = evts(pg)
    check("Campagne : reprise d'une sauvegarde v:1 sans champ journal -> aucun événement fantôme, pas d'erreur", r["evts"] == 0 and not ev2, [r, ev2])
    pg.evaluate("() => { MISSIONS.state.done.push({ fake: true }); }"); wait_evt(pg, "msn.done")
    check("Campagne : après reprise sans journal, le journal se remplit de nouveau (state.journal recréé)", pg.evaluate("() => Array.isArray(GAME.state.journal) && GAME.state.journal.length >= 1"))
    pg.context.close()

    # ---------- saut puis arrivée RÉELS (Partie libre, e140 : générateur de saut) ----------
    print("  [saut réel]")
    pg = boot(br); start_free(pg, "e140", "{ jump: true }")
    pg.evaluate("() => { window.__step(3); REAL.debugSkipToDeparture(); }")
    trace = []; s = {}
    for i in range(240):
        s = pg.evaluate("() => { window.__step(5); return { ph: REAL.phase, js: !!jumpState, hops: REAL.hops || 0 }; }")
        pg.wait_for_timeout(120)
        if i % 20 == 0: trace.append(s)
        if s["hops"] >= 1 and not s["js"] and s["ph"] == "TRANSFER": break
    settle(pg, 600)
    ev = pg.evaluate("() => JOURNAL.list({ kinds: ['evt'] }).reverse().map(e => [e.code, e.a, e.b])")
    codes = [e[0] for e in ev]
    check("saut réel : le moteur a franchi un saut (hops >= 1, phase TRANSFER)", s["hops"] >= 1 and s["ph"] == "TRANSFER", [s, trace[-3:]])
    check("saut réel : le Journal contient « jump » PUIS « arrive »", "jump" in codes and "arrive" in codes and codes.index("jump") < codes.index("arrive"), ev)
    arr = [e for e in ev if e[0] == "arrive"]
    check("saut réel : « arrive » porte le nom de l'étape d'arrivée (a)", bool(arr) and isinstance(arr[0][1], str) and arr[0][1] != "", arr)
    print("    info : événements du saut réel", ev)
    pg.context.close()

    # ---------- tactile 390x844 ----------
    print("  [tactile 390x844]")
    pg = boot(br, mobile=True); start_free(pg)
    for i in range(6): pg.evaluate(RADIO, ["ship", f"Pilote {i}", "message de test assez long pour déborder de la ligne sur un écran étroit " * 2 + str(i)])
    pg.evaluate("() => addCredits(120, 'delivery')")
    pg.keyboard.press("KeyL"); settle(pg, 150)
    m = pg.evaluate("() => ({ sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, iw: innerWidth, cur: CONSOLE.current() })")
    check("tactile : Journal — pas de défilement horizontal de la page (scrollWidth <= innerWidth)", m["cur"] == "journal" and m["sw"] <= m["iw"] and m["bw"] <= m["iw"], m)
    n_open0 = pg.evaluate("() => document.querySelectorAll('#sttConsole .jrn-row.open').length")
    pg.tap("#sttConsole .jrn-row >> nth=1"); settle(pg, 150)
    n_open1 = pg.evaluate("() => document.querySelectorAll('#sttConsole .jrn-row.open').length")
    check("tactile : un appui déplie une ligne", n_open0 == 0 and n_open1 == 1, [n_open0, n_open1])
    m = pg.evaluate("() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth })")
    check("tactile : ligne dépliée — toujours pas de défilement horizontal", m["sw"] <= m["iw"], m)
    pg.context.close()

    br.close()

check("aucune erreur JavaScript (pageerror)", not errors, errors[:3])
sys.exit(1 if fails else 0)
