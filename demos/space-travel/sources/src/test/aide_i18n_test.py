"""
Lot U1.6 — aide (#helpGrid) : aucune clé I18N brute (lbl…, hk_…) affichée, touches « ESPACE / ENTRÉE » et « ÉCHAP / P » traduites
(en/de/es), casse uniforme (text-transform:uppercase) ; 4 langues.
Usage : python3 src/test/aide_i18n_test.py target/space-travel.html
"""
import os, re, sys
if os.path.isdir("/opt/pw-browsers"): os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
from playwright.sync_api import sync_playwright
URL = "file://" + os.path.abspath(sys.argv[1]) + "?seed=AIDE-1&quality=fixed"
INIT = r"""(() => { let t = 1000; performance.now = () => t; Date.now = () => 1790000000000 + t;
  const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.__step = (n, ms) => { for(let i = 0; i < n; i++){ t += (ms || 100); q.splice(0).forEach(cb => cb(t)); } }; })();"""
fails = []; errors = []
def check(name, ok, info=""):
    print(("    PASS " if ok else "    FAIL ") + name + (f"  — {info}" if info != "" else ""))
    if not ok: fails.append(name)

with sync_playwright() as pw:
    br = pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    ctx = br.new_context(viewport={"width": 1100, "height": 640}); ctx.add_init_script(INIT)
    ctx.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
    ctx.route(re.compile(r"\.(mp3|ogg|wav)$"), lambda r: r.fulfill(status=404, body=""))
    pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)[:200]))
    pg.goto(URL, timeout=90000); pg.wait_for_timeout(600); pg.click("#boot")
    pg.wait_for_function("() => typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic === true", timeout=90000, polling=250)
    pg.evaluate("() => window.__sttQuickStart('e18', { jump: true, missions: true })")
    pg.wait_for_function("() => REAL.started === true", timeout=60000, polling=250)
    pg.evaluate("() => { LAYERS.skipRender = true; window.__step(3); }")
    for lang in ("fr", "en", "de", "es"):
        pg.evaluate("(l) => { if(gamePaused) resumeGame(); CONSOLE.close('user'); LANG = l; applyLanguage(); }", lang)
        pg.keyboard.press("KeyH"); pg.wait_for_timeout(80)
        rows = pg.evaluate("() => [...document.querySelectorAll('#helpGrid .help-row')].map(r => r.textContent.trim())")
        shown = pg.evaluate("() => CONSOLE.current()")
        check(f"{lang} : onglet Aide ouvert, grille remplie", shown == "help" and len(rows) > 20, [shown, len(rows)])
        raw = [r for r in rows if re.search(r"lbl[A-Z]|hk_|hlp_", r)]
        check(f"{lang} : aucune clé brute (lbl…/hk_…/hlp_…) dans l'aide", raw == [], raw)
        if lang != "fr":
            fr = [r for r in rows if "ESPACE / ENTR" in r or "ÉCHAP" in r]
            check(f"{lang} : « ESPACE / ENTRÉE » et « ÉCHAP » absents", fr == [], fr)
        ttl = pg.evaluate("() => [document.getElementById('lblHelpTitle').textContent.trim(), t('lblHelpTitle'), document.getElementById('lblHelpFoot').textContent.trim(), t('lblHelpFoot')]")
        check(f"{lang} : titre et pied de l'aide traduits (U1.4)", ttl[0] == ttl[1] and ttl[2] == ttl[3] and (lang == "fr" or "COMMANDES" not in ttl[0]), ttl)
        cases = pg.evaluate("() => [...new Set([...document.querySelectorAll('#helpGrid .hv')].map(e => getComputedStyle(e).textTransform))]")
        check(f"{lang} : casse uniforme (text-transform unique : uppercase)", cases == ["uppercase"], cases)
        pg.evaluate("() => CONSOLE.close('user')")
    br.close()
check("aucune erreur JavaScript (pageerror)", not errors, errors[:3])
sys.exit(1 if fails else 0)
