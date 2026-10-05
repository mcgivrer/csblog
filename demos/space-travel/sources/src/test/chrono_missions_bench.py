"""
L0.3 — chronométrage des missions locales (temps simulé, pas de rendu).
Même amorce que missions_test.py : horloge simulée, __step, LAYERS.skipRender pendant les avances.
Pour chacune des n missions : attendre le tableau, accepter la première offre locale (inter faux),
avancer jusqu'au paiement (MISSIONS.state.done s'allonge) ; mesurer les secondes simulées et les phases.
Sortie : target/mesures/missions-<modele>.json = {modele, seed, runs:[{dest, qty, s_board, s_mission, phases}], mean_s}
(une mission qui n'aboutit pas en MAX_STEPS pas est notée "timeout" et exclue de la moyenne) + une ligne de résumé.
Usage : python3 src/test/chrono_missions_bench.py page [modele=e18] [n=3]
"""
import os, re, sys, json
if os.path.isdir("/opt/pw-browsers"): os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")   # bac a sable d origine ; ailleurs, emplacement par defaut de Playwright
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
page_path = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit(__doc__)
ship = sys.argv[2] if len(sys.argv) > 2 else 'e18'
N = int(sys.argv[3]) if len(sys.argv) > 3 else 3
SEED = "CHRONO1"
MAX_STEPS = 20000      # garde-fou par mission (pas de 100 ms simulées)
CHUNK = 500            # pas par appel evaluate (suivi de la progression, pas de blocage long)
INIT = r"""(() => { let t = 1000; performance.now = () => t; Date.now = () => 1790000000000 + t;
  const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n, ms) => { for(let i = 0; i < n; i++){ t += (ms || 100); q.splice(0).forEach(cb => cb(t)); } }; })();"""
# attente du tableau : renvoie les secondes simulées écoulées depuis t0 (None si non ouvert après max pas)
WAIT_BOARD = """([t0, max]) => { let n = 0; LAYERS.skipRender = true;
  while(n++ < max && !(document.getElementById('missionBoardOverlay') && missionBoardOverlay.style.display === 'flex')) window.__step(1, 100);
  const open = !!(document.getElementById('missionBoardOverlay') && missionBoardOverlay.style.display === 'flex');
  return { open, s: (performance.now() - t0)/1000, offers: open ? MISSIONS.state.offers.map(o => ({ kind: o.kind, qty: o.qty, inter: !!o.inter, reward: o.reward, dest: o.dest.name })) : [] }; }"""
# avance par tranches jusqu'au paiement ; l'état de suivi vit dans window.__B
ACCEPT = """([i]) => { const d0 = MISSIONS.state.done.length; MISSIONS.accept(i);
  window.__B = { t0: performance.now(), d0, ph: [], last: null, steps: 0 }; return d0; }"""
ADVANCE = """([chunk]) => { const B = window.__B; let n = 0;
  while(n++ < chunk){ window.__step(1, 100); B.steps++;
    const k = REAL.phase + '/' + flightPhase; if(k !== B.last){ B.ph.push([k, Math.round((performance.now() - B.t0)/1000)]); B.last = k; }
    if(MISSIONS.state.done.length > B.d0) return { paid: true, s: (performance.now() - B.t0)/1000, ph: B.ph, steps: B.steps }; }
  return { paid: false, s: (performance.now() - B.t0)/1000, ph: B.ph, steps: B.steps }; }"""

runs, errors = [], []
with sync_playwright() as pw:
    br = pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = br.new_page(viewport={"width": 1100, "height": 640})
    pg.on("pageerror", lambda e: errors.append(str(e)[:200]))
    pg.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
    pg.add_init_script(INIT)
    pg.goto("file://" + page_path + "?seed=" + SEED + "&quality=fixed", timeout=90000); pg.wait_for_timeout(600); pg.click("#boot")
    pg.wait_for_function("() => typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic === true", timeout=90000, polling=250)
    pg.evaluate(f"() => window.__sttQuickStart('{ship}', {{ missions: true }})")
    pg.wait_for_function("() => REAL.started === true", timeout=60000, polling=250)
    t_wait = pg.evaluate("() => performance.now()")    # début de l'attente du tableau (démarrage, puis chaque paiement)
    for k in range(N):
        b = pg.evaluate(WAIT_BOARD, [t_wait, 4000])
        if not b["open"]:
            print(f"   run {k+1} : tableau non ouvert après {b['s']:.0f} s simulées"); runs.append({"dest": None, "qty": None, "s_board": None, "s_mission": None, "phases": [], "timeout": "board"}); break
        i = next((j for j, o in enumerate(b["offers"]) if not o["inter"]), None)
        print("   offres :", [(o["dest"], o["qty"], o["reward"], "saut" if o["inter"] else "local") for o in b["offers"]])
        if i is None:
            print(f"   run {k+1} : aucune offre locale"); runs.append({"dest": None, "qty": None, "s_board": round(b["s"], 1), "s_mission": None, "phases": [], "timeout": "no_local"}); break
        o = b["offers"][i]
        pg.evaluate(ACCEPT, [i]); res = None; steps = 0
        while steps < MAX_STEPS:
            res = pg.evaluate(ADVANCE, [min(CHUNK, MAX_STEPS - steps)]); steps = res["steps"]
            if res["paid"]: break
        run = {"dest": o["dest"], "qty": o["qty"], "s_board": round(b["s"], 1), "s_mission": round(res["s"], 1) if res["paid"] else None, "phases": res["ph"]}
        if not res["paid"]: run["timeout"] = True
        runs.append(run)
        print(f"   run {k+1} : {o['dest']} x{o['qty']} — tableau {run['s_board']} s, mission " + (f"{run['s_mission']} s ({steps} pas)" if res["paid"] else f"TIMEOUT après {steps} pas") + " ; phases", res["ph"])
        if not res["paid"]: break
        t_wait = pg.evaluate("() => performance.now()")
    br.close()

ok = [r["s_mission"] for r in runs if r.get("s_mission") is not None and not r.get("timeout")]
mean_s = round(sum(ok)/len(ok), 1) if ok else None
out = {"modele": ship, "seed": SEED, "runs": runs, "mean_s": mean_s}
os.makedirs(os.path.join(ROOT, "target/mesures"), exist_ok=True)
path = os.path.join(ROOT, "target/mesures", f"missions-{ship}.json")
with open(path, "w", encoding="utf-8") as f: json.dump(out, f, ensure_ascii=False, indent=1)
print(f"[chrono] {ship} : {len(ok)}/{N} missions locales, moyenne = " + (f"{mean_s} s ({mean_s/60:.2f} min)" if ok else "n/a") + (f", erreurs JS : {errors[:3]}" if errors else "") + f" -> {os.path.relpath(path, ROOT)}")
sys.exit(0 if ok else 1)
