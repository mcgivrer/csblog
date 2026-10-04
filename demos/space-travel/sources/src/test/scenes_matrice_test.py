"""
Caractérisation des scènes — matrice scène × touche (docs/DAT-annexe_3-matrice_des_scenes_T0.2-V1.0.md, §5).
Filet de sécurité de la refonte en scènes : ce test fige le comportement du jeu APRÈS correction des défauts
relevés par l'inventaire (docs/DAT-annexe_2-inventaire_des_etats_T0.1-V1.0.md, §5) ; la version précédente figeait le comportement d'origine.
Chaque cas porte l'identifiant de la matrice (K-…). En temps virtuel (30 images/s, sans rendu).
Usage : python3 src/test/scenes_matrice_test.py target/space-travel.html
"""
import os, re, sys
if os.path.isdir("/opt/pw-browsers"): os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")   # bac a sable d origine ; ailleurs, emplacement par defaut de Playwright
from playwright.sync_api import sync_playwright
page_path = os.path.abspath(sys.argv[1])
INIT = r"""(() => { let t = 1000; performance.now = () => t; Date.now = () => 1790000000000 + t;
  const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n, ms) => { for(let i = 0; i < n; i++){ t += (ms || 100); q.splice(0).forEach(cb => cb(t)); } }; })();"""
STATE = """() => ({ paused: gamePaused, started: gameStarted, map: isStarMapOpen(), surv: SURVOL.isActive(), phase: REAL.phase,
  fp: flightPhase, skip: arrivalSkip, sel: SHIP_SELECT_OPEN,
  help: document.getElementById('helpOverlay').classList.contains('visible'),
  port: document.getElementById('portPanel').classList.contains('visible') })"""
fails, errors = [], []
def check(cid, name, ok, info=""):
    print(("    PASS " if ok else "    FAIL ") + f"{cid} {name}" + (f"  — {info}" if info != "" else ""))
    if not ok: fails.append(cid)
dlg = {"accept": True, "msgs": []}
def on_dialog(d):
    dlg["msgs"].append(d.message)
    d.accept() if dlg["accept"] else d.dismiss()
def new_page(br, seed):
    pg = br.new_page(viewport={"width": 640, "height": 400})
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("dialog", on_dialog)
    pg.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
    pg.add_init_script(INIT)
    pg.goto("file://" + page_path + "?seed=" + seed + "&quality=fixed")
    pg.wait_for_timeout(600); pg.click("#boot")
    pg.wait_for_function("() => typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic === true", timeout=90000, polling=250)
    return pg
def fly(br, seed):
    pg = new_page(br, seed)
    pg.evaluate("() => window.__sttQuickStart('e140', { jump: true })")
    pg.wait_for_function("() => REAL.started === true", timeout=60000, polling=250)
    pg.evaluate("() => { LAYERS.skipRender = true; window.__step(3); }")
    return pg
S = lambda pg: pg.evaluate(STATE)
def press(pg, k): pg.keyboard.press(k)
def held(pg, code): return pg.evaluate("c => !!keys[c]", code)

with sync_playwright() as pw:
    br = pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])

    print("  [écran-titre et choix du vaisseau]")
    pg = new_page(br, "SCN-TITRE"); pg.wait_for_timeout(1500)
    s = pg.evaluate("() => ({ shown: document.getElementById('titleScreen').style.display, started: gameStarted })")
    check("K-TITLE", "écran-titre affiché, partie non démarrée", s["shown"] == "flex" and not s["started"], s)
    for k in ("h", "v", "i", "l", "Tab", "F1", "F7"): press(pg, k)
    s = S(pg)
    ov = pg.evaluate("() => ({ audio: document.getElementById('audioOverlay').classList.contains('visible'), radio: document.getElementById('radioPanel').classList.contains('visible') })")
    check("K-H-TITLE", "H, V, I, L, Tab, F1, F7 sur le titre : aucun effet (garde gameStarted)", s["help"] is False and not ov["audio"] and not ov["radio"], f"aide = {s['help']} · {ov}")
    pg.click('.lang-btn[data-lang="en"]')
    pg.wait_for_function("() => SHIP_SELECT_OPEN === true", timeout=90000, polling=250)
    for k in ("h", "v", "Tab"): press(pg, k)
    s = S(pg)
    ov = pg.evaluate("() => ({ audio: document.getElementById('audioOverlay').classList.contains('visible'), radio: document.getElementById('radioPanel').classList.contains('visible') })")
    check("K-H-SELECT", "H, V, Tab dans le choix du vaisseau : aucun effet", s["help"] is False and not ov["audio"] and not ov["radio"], f"aide = {s['help']} · {ov}")
    for k in ("Escape", "p", "m"): press(pg, k)
    s = S(pg)
    check("K-SELECT-ESC", "Échap, P, M dans le choix du vaisseau : aucun effet sur la partie",
          not s["started"] and not s["paused"] and not s["map"] and s["sel"], s)
    pg.focus("#ssConfirm"); press(pg, " "); pg.wait_for_timeout(300); s = S(pg)
    check("K-SELECT-SPACE", "Espace, bouton Confirmer au focus : confirme et démarre (activation native, 42:295 n'appelle pas preventDefault)",
          s["started"] and not s["sel"], s)
    pg.close()

    print("  [vol : pause, carte, survol]")
    pg = fly(br, "SCN-VOL")
    press(pg, "Escape"); s = S(pg)
    check("K-ESC-PAUSE", "Échap en vol : pause", s["paused"] is True, s)
    press(pg, "p"); s = S(pg)
    check("K-P-PAUSED", "P en pause : aucun changement", s["paused"] is True, s)
    press(pg, "m"); s = S(pg)
    check("K-M-PAUSE", "M en pause : aucun effet (la carte ne s'ouvre pas sous la pause)", not s["map"] and s["paused"], s)
    press(pg, "h"); s = S(pg)
    check("K-H-PAUSE", "H en pause : aucun effet", s["help"] is False, s)
    pg.keyboard.down("z"); z = held(pg, "KeyZ"); pg.keyboard.up("z")
    check("K-STEER-PAUSE", "touche de pilotage pendant la pause : non mémorisée", z is False, f"keys['KeyZ'] = {z}")
    press(pg, " "); s = S(pg)
    check("K-SPACE-RESUME", "Espace en pause : reprend", s["paused"] is False, s)
    press(pg, " "); s = S(pg)
    check("K-SKIP-CRUISE", "Espace hors escale : n'abrège rien", s["fp"] == "CRUISE" and s["skip"] is False, s)
    press(pg, "m"); s = S(pg)
    check("K-M-OPEN", "M en vol : ouvre la carte sans pause", s["map"] and not s["paused"], s)
    p0 = pg.evaluate("() => shipRig.position.toArray()")
    pg.evaluate("() => window.__step(30)")
    p1 = pg.evaluate("() => shipRig.position.toArray()")
    moved = sum((a - b) ** 2 for a, b in zip(p0, p1)) ** .5
    check("K-MAP-SIM", "la simulation avance sous la carte ouverte", moved > 1, f"déplacement {moved:.0f} m en 3 s simulées")
    pg.keyboard.down("z"); z = held(pg, "KeyZ"); pg.keyboard.up("z")
    check("K-STEER-MAP", "touche de pilotage sous la carte : non mémorisée", z is False, f"keys['KeyZ'] = {z}")
    press(pg, "m"); s = S(pg)
    check("K-M-CLOSE", "M, carte ouverte : la ferme", not s["map"], s)
    press(pg, "F8"); s = S(pg)
    check("K-F8-NOPORT", "F8 hors de portée d'un port : aucun effet", s["port"] is False, s)
    press(pg, "g"); s = S(pg)
    check("K-G-OK", "G en TRANSFER : lance le survol", s["surv"] is True and s["phase"] == "TRANSFER", s)
    press(pg, "Escape"); s = S(pg)
    check("K-FLYOVER-ESC", "Échap pendant le survol : met en pause (et lance le retour au vaisseau)", s["paused"] is True, s)
    press(pg, " ")
    n = pg.evaluate("() => { let n = 0; while(SURVOL.isActive() && n < 600){ window.__step(1); n++; } return n; }"); s2 = S(pg)
    check("K-FLYOVER-END", "après la reprise : le survol se termine (retour au vaisseau)", not s2["surv"] and not s2["paused"], f"survol terminé après {n} pas de 0,1 s")
    press(pg, "g"); pg.evaluate("() => window.__step(2)"); press(pg, "x"); s = S(pg)
    check("K-FLYOVER-KEY", "une touche ordinaire pendant le survol : l'abrège sans pause", not s["paused"], s)
    pg.evaluate("() => { let n = 0; while(SURVOL.isActive() && n < 600){ window.__step(1); n++; } }")
    pg.evaluate("() => { REAL.phase = 'APPROACH'; }"); press(pg, "g"); s = S(pg)
    pg.evaluate("() => { REAL.phase = 'TRANSFER'; }")
    check("K-G-APPROACH", "G en APPROACH : refusé", s["surv"] is False, s)
    press(pg, "Escape"); press(pg, "g"); s = S(pg)
    check("K-G-PAUSE", "G en pause : aucun effet (pas de survol sous la pause)", s["surv"] is False and s["paused"] is True, s)
    pg.close()

    print("  [quitter vers le titre]")
    pg = fly(br, "SCN-QUIT")
    pg.evaluate("() => { window.__mark = 1; }")
    press(pg, "Escape")
    dlg["accept"] = False; dlg["msgs"].clear()
    press(pg, "Escape"); pg.wait_for_timeout(500)
    s = S(pg); mark = pg.evaluate("() => window.__mark")
    check("K-QUIT-CANCEL", "Échap en pause : demande confirmation ; refuser garde la partie en pause",
          len(dlg["msgs"]) == 1 and "Quitter" in dlg["msgs"][0] and s["paused"] is True and mark == 1, f"message = {dlg['msgs']} · pause = {s['paused']} · marque = {mark}")
    dlg["accept"] = True
    try:
        with pg.expect_navigation(timeout=20000): press(pg, "Escape")
        reloaded = True
    except Exception:
        reloaded = False
    check("K-ESC-QUIT", "Échap en pause puis confirmation : recharge la page", reloaded)
    pg.close()

    print("  [orbite et saut]")
    pg = fly(br, "SCN-ORBITE")
    pg.evaluate("() => { for(let i = 0; i < 1500 && REAL.phase !== 'ORBIT'; i++) window.__step(1); }")
    s = S(pg)
    check("K-ORBIT", "orbite atteinte (ORBIT + ARRIVAL_PAUSE)", s["phase"] == "ORBIT" and s["fp"] == "ARRIVAL_PAUSE", s)
    press(pg, " "); s = S(pg)
    check("K-SKIP-ORBIT", "Espace en ARRIVAL_PAUSE : abrège l'escale", s["skip"] is True, s)
    press(pg, "Escape")
    t0 = pg.evaluate("() => pauseTimer"); pg.evaluate("() => window.__step(20)"); t1 = pg.evaluate("() => pauseTimer")
    s = S(pg); press(pg, " ")
    check("K-PAUSE-ORBIT", "Échap pendant l'orbite : pause, minuterie d'escale gelée", s["paused"] and t0 == t1, f"pauseTimer {t0:.2f} → {t1:.2f}")
    got = pg.evaluate("() => { for(let i = 0; i < 8000 && !jumpState; i++) window.__step(1); return !!jumpState; }")
    if got:
        press(pg, "Escape")
        j0 = pg.evaluate("() => jumpState.t"); pg.evaluate("() => window.__step(30)"); j1 = pg.evaluate("() => jumpState.t")
        s = S(pg)
        check("K-PAUSE-JUMP", "Échap pendant un saut : pause, saut gelé", s["paused"] and j0 == j1, f"jumpState.t {j0:.2f} → {j1:.2f}")
    else:
        check("K-PAUSE-JUMP", "saut atteint dans la borne de 8000 pas", False, "jumpState jamais créé")
    pg.close()

    print("  [pilotage]")
    pg = fly(br, "SCN-APPROCHE")
    pg.evaluate("() => { for(let i = 0; i < 1500 && REAL.phase !== 'APPROACH'; i++) window.__step(1); }")
    o0 = pg.evaluate("() => ({ ph: REAL.phase, ox: REAL.mission.ox, oy: REAL.mission.oy })")
    pg.keyboard.down("ArrowLeft"); pg.evaluate("() => window.__step(15)")
    o1 = pg.evaluate("() => ({ ox: REAL.mission.ox, oy: REAL.mission.oy })"); pg.keyboard.up("ArrowLeft")
    check("K-STEER-APPROACH", "flèche en APPROACH : décale le vaisseau dans le couloir",
          o0["ph"] == "APPROACH" and abs(o1["ox"] - o0["ox"]) > 0.05, f"ox {o0['ox']:.2f} → {o1['ox']:.2f}")
    pg.close()
    pos = {}
    for held_key in (False, True):
        pg = fly(br, "SCN-TRANSFERT")
        if held_key: pg.keyboard.down("ArrowLeft")
        pg.evaluate("() => window.__step(100)")
        pos[held_key] = pg.evaluate("() => ({ p: shipRig.position.toArray(), ph: REAL.phase })")
        if held_key: pg.keyboard.up("ArrowLeft")
        pg.close()
    d = sum((a - b) ** 2 for a, b in zip(pos[False]["p"], pos[True]["p"])) ** .5
    check("K-STEER-TRANSFER", "flèche tenue en TRANSFER : trajectoire inchangée",
          pos[True]["ph"] == "TRANSFER" and d < 1e-3, f"écart de position {d:.4f} m, phase {pos[True]['ph']}")
    br.close()

check("K-ERRORS", "aucune erreur JavaScript", not errors, errors[:3])
print(f"  {len(fails)} échec(s)" if fails else "  tous les cas de la matrice sont conformes")
sys.exit(1 if fails else 0)
