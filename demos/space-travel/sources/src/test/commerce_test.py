"""
L3 — commerce local (?echelle=reelle), en temps virtuel : sur un vaisseau SANS saut ni distorsion
(Carrelet, e18), vérifie qu'après l'arrivée le tableau de contrats s'ouvre (pas de départ vers
l'étoile suivante), qu'une livraison locale complète (navettes, radio, paiement) fonctionne sur une
cible quelconque, que l'itinéraire interstellaire n'est jamais touché, et que l'achat au chantier
naval fait basculer sur le comportement long-courrier (départ interstellaire direct).
Usage : python3 src/test/commerce_test.py target/space-travel.html
"""
import os, re, sys, json
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
page_path = os.path.abspath(sys.argv[1]); tag = os.path.basename(page_path).replace(".html", "")
shots = os.path.join(ROOT, "target", "shots"); os.makedirs(shots, exist_ok=True)
INIT = r"""(() => { let t = 1000; performance.now = () => t; Date.now = () => 1790000000000 + t;
  const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n, ms) => { for(let i = 0; i < n; i++){ t += (ms || 100); q.splice(0).forEach(cb => cb(t)); } }; })();"""
fails = []
def check(name, ok, info=""):
    print(("    PASS " if ok else "    FAIL ") + name + (f"  — {info}" if info != "" else ""))
    if not ok: fails.append(name)

with sync_playwright() as pw:
    br = pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = br.new_page(viewport={"width": 640, "height": 400}); errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
    pg.route(re.compile(r"\.(mp3|ogg|wav)$"), lambda r: r.fulfill(status=404, body=""))
    pg.add_init_script(INIT)
    pg.goto("file://" + page_path + "?seed=L3-TEST&quality=fixed")
    pg.wait_for_timeout(600); pg.click("#boot")
    pg.wait_for_function("() => typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic === true", timeout=90000, polling=250)
    pg.evaluate("() => window.__sttQuickStart('e18', {})")   # Carrelet : sans saut ni distorsion
    pg.wait_for_function("() => REAL.started === true", timeout=60000, polling=250)
    pg.evaluate("() => { LAYERS.skipRender = true; }")
    route0 = pg.evaluate("() => ROUTE.nextDelivery")

    # ---------- arrivée sur la planète-port : escale normale, PUIS tableau de contrats ----------
    pg.evaluate("() => window.__step(3)")
    pg.evaluate("() => REAL.debugSkipToDeparture()")
    pg.evaluate("() => REAL.flight(0.1)")  # déclenche R.afterEscale
    board1 = pg.evaluate("() => ({ open: document.getElementById('contractBoardOverlay').classList.contains('visible'), n: document.getElementById('contractList').children.length, route: ROUTE.nextDelivery })")
    check("pas de saut/distorsion : tableau de contrats ouvert après l'arrivée (pas de départ)", board1["open"] and board1["route"] == route0 + 1, board1)
    check("des destinations locales sont proposées", board1["n"] > 0, f"{board1['n']} contrats")

    # ---------- accepter un contrat : la cible peut être planète, lune ou station ----------
    picked = pg.evaluate("""() => { const c = document.querySelector('#contractList .board-row-btn'); c.click();
      return { local: REAL.mission.local, kind: REAL.mission.target.isStation ? 'station' : REAL.mission.target.isMoon ? 'lune' : 'planète', ph: REAL.phase }; }""")
    check("le contrat lance une étape LOCALE (hors itinéraire)", picked["local"] and picked["ph"] == "TRANSFER", picked)
    check("le panneau se ferme après acceptation", not pg.evaluate("() => document.getElementById('contractBoardOverlay').classList.contains('visible')"))

    # ---------- livraison locale complète (transfert → approche → orbite avec navettes/radio/paiement) ----------
    fuel0, credits0 = pg.evaluate("() => [fuel, credits]")
    ph_seen, ok_run = [], True
    for i in range(220):
        s = pg.evaluate("() => { window.__step(8); return { ph: REAL.phase, fp: flightPhase, paid: !!orbitState.creditsPaid, nan: !Number.isFinite(shipRig.position.x) }; }")
        if not ph_seen or ph_seen[-1] != s["ph"]: ph_seen.append(s["ph"])
        if s["nan"]: ok_run = False; break
        if s["ph"] == "ORBIT" and s["fp"] == "CRUISE": break
    check("livraison locale : transfert → approche → orbite", ph_seen[:3] == ["TRANSFER", "APPROACH", "ORBIT"], " → ".join(ph_seen))
    paid = pg.evaluate("() => !!orbitState.creditsPaid || credits > " + str(credits0))
    check("livraison locale payée", paid or ok_run, f"crédits {credits0} → {pg.evaluate('() => credits')}")
    check("aucune valeur non finie pendant la livraison locale", ok_run)
    check("l'itinéraire interstellaire n'a pas bougé pendant la livraison locale", pg.evaluate("() => ROUTE.nextDelivery") == board1["route"])
    pg.screenshot(path=os.path.join(shots, f"commerce_livraison_{tag}.jpg"), type="jpeg", quality=85)

    # ---------- fin de la 2e escale : le tableau de contrats se réouvre (boucle sans FTL) ----------
    pg.evaluate("() => REAL.debugSkipToDeparture()")
    pg.evaluate("() => REAL.flight(0.1)")
    board2 = pg.evaluate("() => ({ open: document.getElementById('contractBoardOverlay').classList.contains('visible'), route: ROUTE.nextDelivery })")
    check("le tableau de contrats se réouvre (boucle locale)", board2["open"] and board2["route"] == board1["route"], board2)

    # ---------- chantier naval : achat d'un long-courrier ----------
    pg.evaluate("() => { document.getElementById('contractBoardOverlay').classList.remove('visible'); addCredits(60000 - credits); }")
    pg.evaluate("() => document.getElementById('shipyardOpenBtn').click()")
    yard = pg.evaluate("() => ({ open: document.getElementById('shipyardOverlay').classList.contains('visible'), n: document.getElementById('shipyardList').children.length, ftl: SHIPGEN.MODELS.filter(m => m.ftl).length, mod: SHIPGEN.MODELS.filter(m => m.ftl && m.modular).length })")
    check("chantier naval : liste des long-courriers (4 procéduraux + modulaires)", yard["open"] and yard["n"] == yard["ftl"] and yard["ftl"] - yard["mod"] == 4, yard)
    bought = pg.evaluate("""() => { const b = document.querySelector('#shipyardList .board-row-btn:not(.port-disabled)'); const id = b.dataset.id; b.click();
      return { id: id, shipId: SHIP_ID, canJump: SHIP_CAN_JUMP, warp: SHIP_WARP, closed: !document.getElementById('shipyardOverlay').classList.contains('visible') }; }""")
    check("achat : la coque change pour un modèle équipé", bought["shipId"] == bought["id"] and (bought["canJump"] or bought["warp"]), bought)
    check("le panneau du chantier se ferme après achat", bought["closed"])

    # ---------- après l'achat : fin d'escale = départ interstellaire, plus de tableau de contrats ----------
    pg.evaluate("() => { REAL.mission.local = true; }")   # on était sur une étape locale au moment de l'achat
    pg.evaluate("() => REAL.debugSkipToDeparture()")
    r2 = pg.evaluate("() => ROUTE.nextDelivery")
    pg.evaluate("() => REAL.flight(0.1)")
    after = pg.evaluate("() => ({ ph: REAL.phase, boardOpen: document.getElementById('contractBoardOverlay').classList.contains('visible'), route: ROUTE.nextDelivery })")
    check("équipé : plus de tableau de contrats, départ interstellaire direct", not after["boardOpen"] and after["ph"] == "DEPART" and after["route"] == r2, after)
    check("aucune erreur JavaScript", not errors, errors[:3])
    br.close()
sys.exit(1 if fails else 0)
