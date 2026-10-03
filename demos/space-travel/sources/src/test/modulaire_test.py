"""
Vaisseaux et stations modulaires (chantier naval STT, 09c-vaisseaux-modulaires.js) : pack embarqué décodé, compositions
de src/data/compositions/ enregistrées, chaque coque assemblée respecte le contrat de SHIPGEN.build (moteurs, RCS, balises,
gabarit), fiches (masses réelles), import d'une création dans le hangar (baie + navette amarrée → baie d'engins de la
navette), stations en port orbital (postes, poste L, budget de rendu), vol de 8 s, aucune erreur JavaScript.
Usage : python3 src/test/modulaire_test.py target/space-travel.html
"""
import os, re, sys, json
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
from playwright.sync_api import sync_playwright

page_path = os.path.abspath(sys.argv[1])
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
shots = os.path.join(ROOT, "target", "shots"); os.makedirs(shots, exist_ok=True)
tag = os.path.basename(page_path).replace(".html", "")
fails = []
def check(name, ok, info=""):
    print(("    PASS " if ok else "    FAIL ") + name + (f"  — {info}" if info != "" else ""))
    if not ok: fails.append(name)

comps = [json.load(open(os.path.join(ROOT, "src/data/compositions", f), encoding="utf-8"))
         for f in sorted(os.listdir(os.path.join(ROOT, "src/data/compositions"))) if f.endswith(".json")]
n_ships = sum(1 for c in comps if c.get("type") != "station"); n_st = len(comps) - n_ships

# création de test : baie latérale avec sa navette amarrée, compagnie personnalisée, immatriculation propre
BAY_SHIP = {"format": "stt-composition", "version": 1, "id": "test-baie", "name": "Essai Baie", "type": "ship", "company": "XTEST", "registry": "TST-0042",
    "companies": {"XTEST": {"name": "Test Lines", "mark": "TEST", "tagline": "ESSAIS", "registry": "TST-0001", "livery_hex": "#2a9d8f", "emblem": "star4"}},
    "root": "cmd1", "parts": [["cmd1", "CMD"], ["bay1", "BAY", {"door": "field"}], ["pax1", "PAX"], ["tank1", "TANK"], ["pwr1", "PWR"], ["prop1", "PROP"], ["shuttle1", "SHUTTLE"]],
    "links": [["cmd1.AFT", "bay1.FWD", 0], ["bay1.AFT", "pax1.FWD", 0], ["pax1.AFT", "tank1.FWD", 0], ["tank1.AFT", "pwr1.FWD", 0], ["pwr1.AFT", "prop1.FWD", 0], ["bay1.SHUTTLE", "shuttle1.PAD", 0]],
    "containers": {}, "docking_ports": [], "game": {"family": "passagers", "tier": "III", "ftl": True, "crew": 7}}

with sync_playwright() as pw:
    br = pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = br.new_page(viewport={"width": 1100, "height": 680})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)[:240]))
    pg.on("console", lambda m: errors.append(m.text[:240]) if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
    pg.route(re.compile(r"\.(mp3|ogg|wav)$"), lambda r: r.fulfill(status=404, body=""))
    pg.goto("file://" + page_path); pg.wait_for_timeout(600)
    pg.evaluate("() => { try { localStorage.removeItem('stt.game.compositions.v1'); } catch(e){} }")
    pg.click("#boot")
    pg.wait_for_function("() => typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic === true", timeout=90000)
    pg.wait_for_function("() => MODSHIP.settled", timeout=60000)
    st = pg.evaluate("() => ({ ready: MODSHIP.ready, failed: String(MODSHIP.failed), ships: MODSHIP.ships(), stations: MODSHIP.stations().map(s => s.id), pack: !!document.getElementById('sttPack') })")
    check("bibliothèque de modules décodée (meshopt, r128)", st["ready"], st["failed"])
    check("compositions du dossier enregistrées", len(st["ships"]) == n_ships and len(st["stations"]) == n_st, f"{len(st['ships'])} vaisseaux, {len(st['stations'])} stations")
    check("pack retiré du DOM après lecture", not st["pack"])

    r = pg.evaluate("""() => MODSHIP.ships().map(id => {
      try {
        const out = [];
        for(let k = 0; k < 2; k++){                                   // 2e passe : prototypes intacts après dispose()
          const b = SHIPGEN.build(id, {}), sp = shipSpecs(b); let flares = 0, calls = 0;
          b.group.traverse(o => { if(o.userData.isFlare) flares++; if(o.isMesh) calls++; });
          out.push({ id, L: +b.hullDims.z.toFixed(1), eng: b.stats.engines, rcs: b.rcs.length, tips: b.tips.length, flares, calls,
                     dry: sp.dry, mass: b.massT, warp: b.warp, rings: b.stats.rings, reactor: !!b.group.userData.reactor, verts: b.group.children.length });
          SHIPGEN.dispose(b.group);
        }
        return out;
      } catch(e){ return [{ id, err: String(e.stack || e).slice(0, 300) }]; } })""")
    flat = [x for l in r for x in l]
    print("   coques :", [(x["id"], x.get("L"), x.get("calls"), x.get("dry")) for x in flat[::2]])
    check("chaque coque modulaire se construit (deux fois, après dispose)", all("err" not in x for x in flat), [x for x in flat if "err" in x][:1])
    ok = [x for x in flat if "err" not in x]
    check("contrat du générateur : tuyère Epstein, RCS, balises", all(x["eng"] >= 1 and x["flares"] >= 1 and x["rcs"] >= 4 and x["tips"] >= 1 for x in ok))
    check("gabarit : longueur réaliste (60 à 300 m)", all(60 <= x["L"] <= 300 for x in ok), [x["L"] for x in ok[::2]])
    check("fiche : masse à vide = masses des modules (hors anneaux)", all(x["dry"] == x["mass"] for x in ok if not x["rings"]))
    check("long-courriers : anneaux de distorsion autour du réacteur", all(x["rings"] >= 1 and x["reactor"] for x in ok if x["warp"]), [x["id"] for x in ok if x["warp"]][:2])
    check("budget de rendu : ≤ 160 appels de dessin par coque (une maille par matériau)", all(x["calls"] <= 160 for x in ok), max(x["calls"] for x in ok))

    imp = pg.evaluate("(t) => { const r = MODSHIP.importText(t); return { ok: r.ok, err: r.err, n: (r.added || []).length, stored: (JSON.parse(localStorage.getItem('stt.game.compositions.v1') || '[]')).length }; }", json.dumps(BAY_SHIP))
    check("import d'une création (gardée dans le navigateur)", imp["ok"] and imp["n"] == 1 and imp["stored"] == 1, imp)
    bad = pg.evaluate("() => [MODSHIP.importText('{oops').err, MODSHIP.importText(JSON.stringify({ a: 1 })).err]")
    check("fichier invalide refusé", bad == ["json", "format"], bad)
    b = pg.evaluate("""() => { const b = SHIPGEN.build('mod_test-baie', { warp: true, jump: true }); const inf = shipCatalogInfo(b);
      const d = b.docks[0]; const o = { docks: b.docks.length, side: d && !d.ventral, hide: d ? d.hide.length : 0, crew: inf.crew, tier: inf.M.tier, group: inf.M.group,
        warp: b.warp, jump: b.jump, reg: inf.M.reg }; SHIPGEN.dispose(b.group); return o; }""")
    check("baie modulaire → baie d'engins (latérale, navette amarrée masquable)", b["docks"] == 1 and b["side"] and b["hide"] == 1, b)
    check("fiche de jeu de la création appliquée (famille, palier, équipage, FTL)", b["group"] == "Passagers" and b["tier"] == "III" and b["crew"] == 7 and b["warp"] and b["jump"], b)

    # hangar : créations repérées, bouton d'import
    pg.evaluate("() => { document.getElementById('titleScreen').style.display = 'none'; openShipSelect(function(){}); }")
    pg.wait_for_timeout(1200)
    hs = pg.evaluate("() => ({ mods: document.querySelectorAll('#ssStrip .ss-mod').length, all: SHIP_CATALOG.length, imp: !document.getElementById('ssImport').hidden, idx: SHIP_CATALOG.findIndex(i => i.id === 'mod_test-baie') })")
    check("hangar : créations du chantier repérées, import proposé", hs["mods"] == n_ships + 1 and hs["imp"] and hs["idx"] >= 0, hs)
    pg.evaluate(f"() => document.getElementById('ssStrip').children[{hs['idx']}].click()")
    pg.wait_for_timeout(2500)
    pg.screenshot(path=os.path.join(shots, f"modulaire_hangar_{tag}.png"))
    pg.evaluate("() => document.getElementById('ssConfirm').click()")

    # stations : port orbital modulaire
    ports = pg.evaluate("""() => MODSHIP.stations().map(e => { const P = PORTS.build('modular', 'x'); const Q = MODSHIP.stationPort(Math.random, '', e.id); let n = 0;
      Q.group.traverse(o => { if(o.isMesh || o.isSprite) n++; });
      return { id: e.id, berths: Q.berths.length, L: Q.berths.filter(b => b.cls === 'L').length, calls: n, R: Math.round(P.radius), arch: P.archetype }; })""")
    print("   stations :", ports)
    check("stations : au moins un poste, dont un L", all(p["berths"] >= 1 and p["L"] >= 1 for p in ports))
    check("stations : ≤ 60 appels de dessin", all(p["calls"] <= 60 for p in ports), [p["calls"] for p in ports])
    check("archétype « modular » construit par PORTS.build", all(p["arch"] == "modular" and p["R"] > 20 for p in ports))

    # vol avec la création importée, engin de baie
    pg.evaluate("() => window.__sttQuickStart('mod_test-baie', { jump: true })")
    pg.wait_for_function("() => gameStarted === true", timeout=30000)
    p0 = pg.evaluate("() => shipRig.position.toArray()")
    pg.wait_for_timeout(8000)
    fl = pg.evaluate("() => ({ id: SHIP_ID, p: shipRig.position.toArray(), glows: window.__engineGlows.length, rcs: window.__rcs.length, name: (document.getElementById('shipName') || {}).textContent })")
    moved = sum((a - b) ** 2 for a, b in zip(fl["p"], p0)) ** 0.5
    check("vol : le vaisseau modulaire se déplace, moteurs et RCS raccordés", fl["id"] == "mod_test-baie" and moved > 1 and fl["glows"] >= 1 and fl["rcs"] >= 4, f"{moved:.0f} u · {fl['name']}")
    bay = pg.evaluate("""() => { try { const ok = CARGO.startBay(); MODSHIP.update(); const d = SHIP_BUILD.docks[0];
      return { ok, flow: !!(orbitState.loading && orbitState.loading.bayFlow), hidden: d.hide.every(o => !o.visible) }; } catch(e){ return { err: String(e).slice(0, 200) }; } }""")
    check("navette de baie : un engin sort de la baie modulaire, la navette amarrée s'efface", bay.get("ok") and bay.get("flow") and bay.get("hidden"), bay)
    pg.screenshot(path=os.path.join(shots, f"modulaire_vol_{tag}.png"))
    check("aucune erreur JavaScript", not errors, errors[:3])
    br.close()
sys.exit(1 if fails else 0)
