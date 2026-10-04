"""
Lot L0.6 — campagne jouable : fenêtre du choix de mode, Nouvelle campagne (Courlis, crédits de départ), synchro des
crédits et de l'horloge, sauvegarde (automatique, export, import), Continuer, reprise dans le même univers (rechargement
avec la graine de la sauvegarde), import en pause qui change le vaisseau, confirmation avant remplacement, Partie libre inchangée.
Usage : python3 src/test/campagne_test.py target/space-travel.html
"""
import os, re, sys, json
if os.path.isdir("/opt/pw-browsers"): os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")   # bac a sable d origine ; ailleurs, emplacement par defaut de Playwright
from playwright.sync_api import sync_playwright
page_path = os.path.abspath(sys.argv[1]); URL = "file://" + page_path + "?seed=CAMPAGNE-1&quality=fixed"
INIT = r"""(() => { let t = 1000; performance.now = () => t; Date.now = () => 1790000000000 + t;
  const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n, ms) => { for(let i = 0; i < n; i++){ t += (ms || 100); q.splice(0).forEach(cb => cb(t)); } }; })();"""
# la fenêtre du choix de mode a-t-elle été affichée un instant ? (une reprise automatique ne doit pas l'afficher)
WATCH = """() => { window.__modeSeen = false; new MutationObserver(() => { const e = document.getElementById('modeSelect'); if(e && e.classList.contains('open')) window.__modeSeen = true; })
  .observe(document.body, { subtree: true, attributes: true, childList: true, attributeFilter: ['class'] }); }"""
MODAL_OPEN = "() => document.getElementById('modeSelect') && document.getElementById('modeSelect').classList.contains('open')"
fails = []; errors = []
def check(name, ok, info=""):
    print(("    PASS " if ok else "    FAIL ") + name + (f"  — {info}" if info != "" else ""))
    if not ok: fails.append(name)

def title(pg):
    """Générique passé, monde prêt : l'écran-titre attend la langue."""
    pg.wait_for_timeout(600); pg.click("#boot")
    pg.wait_for_function("() => typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic === true", timeout=90000, polling=250)

def boot(ctx, lang="fr"):
    """Page neuve du même contexte (même localStorage) : langue choisie, fenêtre du choix de mode ouverte."""
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)[:200]))
    pg.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.goto(URL, timeout=90000); title(pg)
    pg.click(f'.lang-btn[data-lang="{lang}"]')
    pg.wait_for_function(MODAL_OPEN, timeout=30000, polling=100)
    return pg

def resumed(pg, lang="fr"):
    """Après un rechargement demandé par la reprise : le drapeau attend, la langue est choisie, la partie démarre SANS fenêtre."""
    flag = pg.evaluate("() => sessionStorage.getItem('stt.resume')")
    title(pg); pg.evaluate(WATCH)
    pg.click(f'.lang-btn[data-lang="{lang}"]')
    s = started(pg)
    s["flag"] = flag; s["flagAfter"] = pg.evaluate("() => sessionStorage.getItem('stt.resume')")
    s["seen"] = pg.evaluate("() => window.__modeSeen"); s["url"] = pg.url
    return s

def started(pg):
    pg.wait_for_function("() => gameStarted === true", timeout=60000, polling=250)
    return pg.evaluate("""() => ({ ship: SHIP_ID, credits: credits, mode: GAME.mode(), missions: MISSIONS.enabled(), flag: window.__sttMissions === true,
      seed: GAME.state ? GAME.state.seed : null, SEED: SEED, comp: GAME.state ? GAME.state.ships[0].comp : null, gcredits: GAME.state ? GAME.state.credits : null,
      lang: GAME.state ? GAME.state.flags.lang : null, ledger: GAME.state ? GAME.state.ledger.length : null,
      modal: document.getElementById('modeSelect').classList.contains('open'), shipSel: document.getElementById('shipSelect').classList.contains('open') })""")

def vis(pg, sel): return pg.is_visible(sel)
def file(name, state): return [{"name": name, "mimeType": "application/json", "buffer": json.dumps(state).encode()}]

with sync_playwright() as pw:
    br = pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    ctx = br.new_context(viewport={"width": 1100, "height": 640})
    ctx.add_init_script(INIT)
    ctx.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
    ctx.route(re.compile(r"\.(mp3|ogg|wav)$"), lambda r: r.fulfill(status=404, body=""))

    print("  [fenêtre du choix de mode, Nouvelle campagne]")
    pg = boot(ctx)
    w = pg.evaluate("""() => { const q = k => document.querySelector('#modeSelect [data-mode="' + k + '"]');
      return { n: document.querySelectorAll('#modeSelect .ms-opt').length, order: [...document.querySelectorAll('#modeSelect .ms-opt')].map(b => b.dataset.mode),
               lbl: [...document.querySelectorAll('#modeSelect .ms-lbl')].map(s => s.textContent), cont: q('continue').disabled, hasSave: SAVE.has(),
               focus: document.activeElement.dataset.mode, shipSel: document.getElementById('shipSelect').classList.contains('open'), mode: GAME.mode() }; }""")
    check("fenêtre : 3 choix dans l'ordre, textes en français", w["order"] == ["new", "continue", "free"] and w["lbl"] == ["Nouvelle campagne", "Continuer", "Partie libre"], w["lbl"])
    check("Continuer désactivé sans sauvegarde, focus sur Nouvelle campagne", w["cont"] is True and w["hasSave"] is False and w["focus"] == "new", w)
    check("choix de vaisseau pas encore ouvert, mode libre", w["shipSel"] is False and w["mode"] == "free")
    pg.keyboard.press("ArrowDown")
    f1 = pg.evaluate("() => document.activeElement.dataset.mode")
    pg.keyboard.press("ArrowUp")
    f2 = pg.evaluate("() => document.activeElement.dataset.mode")
    check("flèches : le choix désactivé est sauté (new → free → new)", f1 == "free" and f2 == "new", [f1, f2])
    pg.keyboard.press("Enter")
    s = started(pg)
    check("Nouvelle campagne (Entrée, sans sauvegarde : pas de confirmation) : partie lancée, fenêtre fermée, pas de choix de vaisseau", s["modal"] is False and s["shipSel"] is False, s)
    check("vaisseau = mod_stt-courlis (comp du vaisseau amiral : stt-courlis)", s["ship"] == "mod_stt-courlis" and s["comp"] == "stt-courlis", s)
    check("crédits de départ = 4000 (jeu et état)", s["credits"] == 4000 and s["gcredits"] == 4000, s)
    check("GAME.mode() = campaign, graine de la page, missions actives", s["mode"] == "campaign" and s["seed"] == "CAMPAGNE-1" and s["missions"] and s["flag"], s)
    check("langue mémorisée dans state.flags.lang", s["lang"] == "fr", s["lang"])
    nm = pg.evaluate("() => document.getElementById('shipName').textContent")
    check("HUD : STT COURLIS STT-0001", "STT COURLIS" in nm and "STT-0001" in nm, nm)

    print("  [synchro des crédits et de l'horloge]")
    r = pg.evaluate("""() => { addCredits(1234); const a = { c: credits, g: GAME.state.credits, led: GAME.state.ledger.slice(-1)[0], disp: document.getElementById('creditsVal').textContent };
      addCredits(-400); a.c2 = credits; a.g2 = GAME.state.credits; a.led2 = GAME.state.ledger.slice(-1)[0]; return a; }""")
    check("addCredits(+1234) : GAME.state suit, ledger [clock, 'jeu', 1234]", r["c"] == 5234 and r["g"] == 5234 and r["led"][1:] == ["jeu", 1234], r)
    check("addCredits(-400) : GAME.state suit, ledger [clock, 'jeu', -400]", r["c2"] == 4834 and r["g2"] == 4834 and r["led2"][1:] == ["jeu", -400], r)
    c0 = pg.evaluate("() => GAME.state.clock"); pg.wait_for_timeout(2400); c1 = pg.evaluate("() => GAME.state.clock")
    check("horloge : ≥ 2 s de jeu en 2,4 s réelles", c1 - c0 >= 2, [c0, c1])
    pg.evaluate("() => enterPause()"); pg.wait_for_timeout(300); c2 = pg.evaluate("() => GAME.state.clock"); pg.wait_for_timeout(1700); c3 = pg.evaluate("() => GAME.state.clock")
    check("horloge arrêtée en pause", c3 == c2, [c2, c3])
    pb = pg.evaluate("""() => ({ exp: document.getElementById('pauseSaveExportBtn') && document.getElementById('pauseSaveExportBtn').textContent,
      imp: document.getElementById('pauseSaveImportBtn') && document.getElementById('pauseSaveImportBtn').textContent }); """)
    check("menu pause : boutons Exporter / Importer visibles en campagne", vis(pg, "#pauseSaveExportBtn") and vis(pg, "#pauseSaveImportBtn") and pb["exp"] == "Exporter la sauvegarde" and pb["imp"] == "Importer…", pb)
    with pg.expect_download() as dl:
        pg.click("#pauseSaveExportBtn")
    d = dl.value; st = json.loads(open(d.path(), encoding="utf-8").read())
    check("export : stt-campagne-<seed>.stt-save.json, état de campagne complet", d.suggested_filename == "stt-campagne-CAMPAGNE-1.stt-save.json" and st["mode"] == "campaign" and st["credits"] == 4834 and st["v"] == 1, [d.suggested_filename, st["credits"]])
    check("export : message de confirmation", pg.inner_text("#pauseSaveMsg") == "Sauvegarde terminée.", pg.inner_text("#pauseSaveMsg"))

    print("  [import en pause : fichier refusé, puis import qui change le vaisseau (rechargement, reprise)]")
    pg.set_input_files("#pauseSaveFile", files=[{"name": "y.stt-save.json", "mimeType": "application/json", "buffer": b"{pas du json"}])
    pg.wait_for_function("() => document.getElementById('pauseSaveMsg').textContent.indexOf('impossible') >= 0", timeout=5000, polling=100)
    st3 = dict(st); st3["v"] = 99
    pg.set_input_files("#pauseSaveFile", files=file("z.stt-save.json", st3)); pg.wait_for_timeout(500)
    check("import refusé (invalide, trop récent) : message, état et slot intacts, pas de rechargement",
          pg.evaluate("() => credits === 4834 && GAME.state.credits === 4834 && !SAVE.has() && sessionStorage.getItem('stt.resume') === null") and "impossible" in pg.inner_text("#pauseSaveMsg"))
    st2 = dict(st); st2["credits"] = 7777; st2["ships"] = [dict(st["ships"][0], comp="stt-meridian")]
    with pg.expect_navigation(timeout=90000):
        pg.set_input_files("#pauseSaveFile", files=file("x.stt-save.json", st2))
    s = resumed(pg)
    check("import en pause : la page recharge, drapeau posé puis effacé, reprise SANS fenêtre", s["flag"] == "1" and s["flagAfter"] is None and s["seen"] is False and s["modal"] is False, s)
    check("import en pause : le vaisseau change (mod_stt-meridian), crédits importés, même graine", s["ship"] == "mod_stt-meridian" and s["comp"] == "stt-meridian" and s["credits"] == 7777 and s["gcredits"] == 7777 and s["SEED"] == "CAMPAGNE-1" and s["seed"] == "CAMPAGNE-1", s)
    check("import en pause : campagne reprise, missions actives", s["mode"] == "campaign" and s["missions"] and s["flag"], s)

    print("  [sauvegarde automatique]")
    clear = "() => { localStorage.removeItem(SAVE.KEYS.auto); return SAVE.has(); }"
    check("(préparation) sauvegarde effacée", pg.evaluate(clear) is False)
    pg.evaluate("() => { MISSIONS.state.done.push({ fake: true }); }")
    pg.wait_for_function("() => SAVE.has()", timeout=5000, polling=250)
    check("autosave quand MISSIONS.state.done augmente", pg.evaluate("() => SAVE.has()"))
    pg.evaluate(clear); pg.evaluate("() => { jumpState = { phase: 'charge' }; MISSIONS.state.done.push({ fake: true }); }"); pg.wait_for_timeout(2600)
    check("jamais d'autosave pendant un saut (jumpState actif)", pg.evaluate("() => SAVE.has()") is False)
    pg.evaluate("() => { jumpState = null; }"); pg.wait_for_function("() => SAVE.has()", timeout=5000, polling=250)
    check("autosave reportée, faite dès la fin du saut", pg.evaluate("() => SAVE.has()"))
    pg.evaluate(clear)
    pg.evaluate("() => { const e = JSON.parse(JSON.stringify(DATA.get('economy'))); window.__eco0 = e; const all = JSON.parse(JSON.stringify(DATA.all())); all.economy.autosaveSeconds = 2; DATA._set(all); }")
    pg.wait_for_function("() => SAVE.has()", timeout=8000, polling=250)
    check("autosave périodique (autosaveSeconds de clock)", pg.evaluate("() => SAVE.has()"))
    pg.evaluate("() => { const all = DATA.all(); all.economy = window.__eco0; DATA._set(all); }")
    pg.evaluate("() => { addCredits(1000); SAVE.write(); }")                    # crédits 8777 dans la sauvegarde
    saved = pg.evaluate("() => ({ credits: GAME.state.credits, comp: GAME.state.ships[0].comp })")
    pg.close()

    print("  [Continuer, même graine : démarrage direct, sans rechargement]")
    pg = boot(ctx)
    w = pg.evaluate("() => ({ cont: document.querySelector('#modeSelect [data-mode=\"continue\"]').disabled, focus: document.activeElement.dataset.mode })")
    check("Continuer actif avec une sauvegarde, focus dessus", w["cont"] is False and w["focus"] == "continue", w)
    pg.evaluate("() => { window.__marker = 1; }")
    pg.click('#modeSelect [data-mode="continue"]')
    s = started(pg)
    check("Continuer : vaisseau de l'amiral restauré (mod_stt-meridian)", s["ship"] == "mod_" + saved["comp"] == "mod_stt-meridian" and s["mode"] == "campaign" and s["missions"], s)
    check("Continuer : crédits restaurés (jeu et état)", s["credits"] == saved["credits"] and s["gcredits"] == saved["credits"], [s["credits"], saved["credits"]])
    check("Continuer : pas de choix de vaisseau, fenêtre fermée, pas de rechargement", s["modal"] is False and s["shipSel"] is False and pg.evaluate("() => window.__marker") == 1)
    pg.close()

    print("  [Nouvelle campagne alors qu'une sauvegarde existe : confirmation dans la fenêtre]")
    pg = boot(ctx)
    base = pg.evaluate("() => SAVE.read()")
    pg.click('#modeSelect [data-mode="new"]')
    q = pg.evaluate("""() => ({ lbl: document.querySelector('#modeSelect [data-mode="new"] .ms-lbl').textContent, act: document.activeElement.dataset.act, started: gameStarted, mode: GAME.mode(), sel: SHIP_SELECT_OPEN })""")
    check("1ᵉʳ temps : le bouton demande « Une campagne existe : la remplacer ? », focus sur Annuler, rien de lancé",
          q["lbl"] == "Une campagne existe : la remplacer ?" and q["act"] == "cancel" and not q["started"] and q["mode"] == "free" and not q["sel"], q)
    check("confirmation : Confirmer / Annuler / « Exporter d'abord » visibles, autres choix masqués",
          pg.text_content('#modeSelect [data-act="confirm"]') == "Confirmer" and pg.text_content('#modeSelect [data-act="cancel"]') == "Annuler" and pg.text_content('#modeSelect [data-act="export"]') == "Exporter d’abord"
          and not vis(pg, '#modeSelect [data-mode="continue"]') and not vis(pg, '#modeSelect [data-mode="free"]'))
    pg.keyboard.press("Escape")
    q = pg.evaluate("() => ({ lbl: document.querySelector('#modeSelect [data-mode=\"new\"] .ms-lbl').textContent, open: document.getElementById('modeSelect').classList.contains('open'), sel: SHIP_SELECT_OPEN, started: gameStarted })")
    check("Échap en confirmation = Annuler (pas Partie libre) : fenêtre ouverte, libellés normaux", q["lbl"] == "Nouvelle campagne" and q["open"] and not q["sel"] and not q["started"] and vis(pg, '#modeSelect [data-mode="free"]') and not vis(pg, '#modeSelect [data-act="confirm"]'), q)
    pg.click('#modeSelect [data-mode="new"]')
    with pg.expect_download() as dl:
        pg.click('#modeSelect [data-act="export"]')
    d = dl.value; ex = json.loads(open(d.path(), encoding="utf-8").read())
    check("« Exporter d'abord » : télécharge la sauvegarde stockée, sans rien lancer", d.suggested_filename == "stt-campagne-CAMPAGNE-1.stt-save.json" and ex["credits"] == base["credits"] and pg.evaluate("() => !gameStarted && GAME.mode() === 'free'"), [d.suggested_filename, ex["credits"]])
    pg.click('#modeSelect [data-act="cancel"]')
    check("Annuler : retour aux trois choix, sauvegarde intacte", vis(pg, '#modeSelect [data-mode="continue"]') and pg.evaluate("() => SAVE.read().credits") == base["credits"])
    pg.click('#modeSelect [data-mode="new"]'); pg.click('#modeSelect [data-act="confirm"]')
    s = started(pg)
    check("Confirmer : nouvelle campagne (Courlis, 4000 crédits, journal vide, langue mémorisée)", s["ship"] == "mod_stt-courlis" and s["credits"] == 4000 and s["gcredits"] == 4000 and s["ledger"] == 0 and s["lang"] == "fr" and s["mode"] == "campaign" and not s["modal"], s)
    pg.close()

    print("  [reprise dans le même univers : Continuer avec une autre graine]")
    pg = boot(ctx)
    pg.evaluate("""() => { const s = SAVE.read(); s.seed = 'AUTRE-GRAINE'; s.credits = 3333; s.ships[0].comp = 'stt-courlis'; localStorage.setItem(SAVE.KEYS.auto, JSON.stringify(s)); }""")
    with pg.expect_navigation(timeout=90000):
        pg.click('#modeSelect [data-mode="continue"]')
    s = resumed(pg)
    check("autre graine : rechargement avec ?seed=<graine> (autres paramètres conservés)", "seed=AUTRE-GRAINE" in s["url"] and "quality=fixed" in s["url"] and "CAMPAGNE-1" not in s["url"], s["url"])
    check("autre graine : drapeau posé puis effacé, campagne reprise SANS fenêtre", s["flag"] == "1" and s["flagAfter"] is None and s["seen"] is False and s["modal"] is False and s["mode"] == "campaign", s)
    check("autre graine : SEED de la page = graine de la sauvegarde, vaisseau et crédits restaurés", s["SEED"] == "AUTRE-GRAINE" and s["seed"] == "AUTRE-GRAINE" and s["ship"] == "mod_stt-courlis" and s["credits"] == 3333 and s["gcredits"] == 3333, s)
    pg.close()

    print("  [import depuis l'écran-titre]")
    pg = boot(ctx)
    base = pg.evaluate("() => SAVE.read()")
    pg.set_input_files("#msImportFile", files=[{"name": "n.stt-save.json", "mimeType": "application/json", "buffer": b"nope"}])
    pg.wait_for_function("() => document.querySelector('#modeSelect .ms-msg').textContent.indexOf('impossible') >= 0", timeout=5000, polling=100)
    check("import (titre) : fichier invalide refusé, fenêtre toujours ouverte", pg.evaluate(MODAL_OPEN) and pg.evaluate("() => !gameStarted && SAVE.read().credits") == base["credits"])
    imp = dict(base); imp["seed"] = "IMPORT-GRAINE"; imp["credits"] = 2468; imp["ships"] = [dict(base["ships"][0], comp="stt-meridian")]
    with pg.expect_navigation(timeout=90000):
        pg.set_input_files("#msImportFile", files=file("i.stt-save.json", imp))
    s = resumed(pg)
    check("import (titre) : autre graine → rechargement puis reprise sans fenêtre, vaisseau importé", s["flag"] == "1" and s["seen"] is False and s["SEED"] == "IMPORT-GRAINE" and s["ship"] == "mod_stt-meridian" and s["credits"] == 2468 and s["mode"] == "campaign", s)
    check("import (titre) : sauvegarde automatique remplacée", pg.evaluate("() => SAVE.read().credits") == 2468)
    pg.close()

    print("  [Partie libre : inchangée]")
    pg = boot(ctx, "en")
    w = pg.evaluate("() => [...document.querySelectorAll('#modeSelect .ms-lbl')].map(s => s.textContent)")
    check("fenêtre en anglais", w == ["New campaign", "Continue", "Free play"], w)
    pg.click('#modeSelect [data-mode="new"]')
    check("confirmation en anglais", pg.text_content('#modeSelect [data-mode="new"] .ms-lbl') == "A campaign exists: replace it?" and pg.text_content('#modeSelect [data-act="confirm"]') == "Confirm", pg.text_content('#modeSelect [data-mode="new"] .ms-lbl'))
    pg.keyboard.press("Escape"); pg.keyboard.press("Escape")
    pg.wait_for_function("() => SHIP_SELECT_OPEN === true", timeout=90000, polling=250)
    s = pg.evaluate("() => ({ sel: document.getElementById('shipSelect').classList.contains('open'), modal: document.getElementById('modeSelect').classList.contains('open'), mode: GAME.mode(), missions: MISSIONS.enabled() })")
    check("Échap (annule, puis Partie libre) : choix du vaisseau du hangar affiché, mode libre", s["sel"] and not s["modal"] and s["mode"] == "free" and not s["missions"], s)
    pg.click("#ssConfirm")
    pg.wait_for_function("() => gameStarted === true", timeout=60000, polling=250)
    r = pg.evaluate("""() => { const c0 = credits; addCredits(10); return { d: credits - c0, state: GAME.state, mode: GAME.mode(), missions: MISSIONS.enabled(),
      exp: !!document.getElementById('pauseSaveExportBtn'), imp: !!document.getElementById('pauseSaveImportBtn') }; }""")
    check("partie libre : ni état de campagne ni boutons de sauvegarde, crédits non synchronisés (missions comme avant : actives via le dialogue)", r["state"] is None and r["mode"] == "free" and not r["exp"] and not r["imp"] and r["d"] == 10, r)
    pg.close(); br.close()

check("aucune erreur JS", not errors, errors[:3])
print("\n" + ("campagne_test : OK" if not fails else "campagne_test : ÉCHECS : " + ", ".join(fails)))
sys.exit(1 if fails else 0)
