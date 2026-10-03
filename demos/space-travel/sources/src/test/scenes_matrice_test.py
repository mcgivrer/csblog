"""
Caractérisation des scènes — matrice scène × touche du comportement ACTUEL (docs/PLAN-scenes-T0.2-matrice.md, §5).
Filet de sécurité de la refonte en scènes : ce test fige ce que le jeu fait aujourd'hui, défauts compris.
Chaque cas porte l'identifiant de la matrice (K-…). En temps virtuel (30 images/s, sans rendu).
Usage : python3 src/test/scenes_matrice_test.py target/space-travel.html
"""
import os, re, sys
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
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
def new_page(br, seed):
    pg = br.new_page(viewport={"width": 640, "height": 400})
    pg.on("pageerror", lambda e: errors.append(str(e)))
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
    press(pg, "h"); h1 = S(pg)["help"]; press(pg, "h")
    check("K-H-TITLE", "H sur le titre ouvre l'aide (aucune garde gameStarted)", h1 is True, f"aide visible = {h1}")
    pg.click('.lang-btn[data-lang="en"]')
    pg.wait_for_function("() => SHIP_SELECT_OPEN === true", timeout=90000, polling=250)
    press(pg, "h"); h2 = S(pg)["help"]; press(pg, "h")
    check("K-H-SELECT", "H dans le choix du vaisseau ouvre l'aide", h2 is True, f"aide visible = {h2}")
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
    check("K-M-PAUSE", "M en pause : ouvre la carte au-dessus de la pause", s["map"] and s["paused"], s)
    press(pg, "Escape"); s = S(pg)
    check("K-ESC-MAP-PAUSE", "Échap, carte ouverte en pause : ferme la carte, reste en pause", not s["map"] and s["paused"], s)
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
    check("K-STEER-MAP", "touche de pilotage sous la carte : mémorisée (non avalée)", z is True, f"keys['KeyZ'] = {z}")
    press(pg, "m"); s = S(pg)
    check("K-M-CLOSE", "M, carte ouverte : la ferme", not s["map"], s)
    press(pg, "F8"); s = S(pg)
    check("K-F8-NOPORT", "F8 hors de portée d'un port : aucun effet", s["port"] is False, s)
    press(pg, "g"); s = S(pg)
    check("K-G-OK", "G en TRANSFER : lance le survol", s["surv"] is True and s["phase"] == "TRANSFER", s)
    press(pg, "Escape"); s = S(pg)
    n = pg.evaluate("() => { let n = 0; while(SURVOL.isActive() && n < 600){ window.__step(1); n++; } return n; }"); s2 = S(pg)
    check("K-FLYOVER-ESC", "Échap pendant le survol : l'abrège (retour au vaisseau), sans pause",
          not s["paused"] and not s2["surv"] and not s2["paused"], f"survol terminé après {n} pas de 0,1 s ; pause = {s['paused']}")
    pg.evaluate("() => { REAL.phase = 'APPROACH'; }"); press(pg, "g"); s = S(pg)
    pg.evaluate("() => { REAL.phase = 'TRANSFER'; }")
    check("K-G-APPROACH", "G en APPROACH : refusé", s["surv"] is False, s)
    press(pg, "Escape"); s = S(pg)
    press(pg, "g"); s = S(pg)
    check("K-G-PAUSE", "G en pause : lance le survol sous la pause", s["surv"] is True and s["paused"] is True, s)
    press(pg, "Escape"); s = S(pg)
    check("K-ESC-SURVOL-PAUSE", "Échap pendant un survol lancé en pause : avalé, la pause n'est pas quittée", s["paused"] is True and s["surv"] is True, s)
    pg.close()

    print("  [quitter vers le titre]")
    pg = fly(br, "SCN-QUIT")
    pg.evaluate("() => { window.__mark = 1; }")
    press(pg, "Escape")
    try:
        with pg.expect_navigation(timeout=20000): press(pg, "Escape")
        reloaded = True
    except Exception:
        reloaded = False
    check("K-ESC-QUIT", "Échap en pause : recharge la page, sans confirmation", reloaded)
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
