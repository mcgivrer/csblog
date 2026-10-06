"""Tests du formulaire « Nouvelle tâche » du Kanban (T1.5, Playwright). Aucun vrai `claude` : faux agent."""

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from test_api import Server  # noqa: E402  (fixture : serveur réel sur dépôt et plan temporaires)

try:
    from playwright.sync_api import sync_playwright
    HAVE_PW = True
except Exception:  # pragma: no cover
    HAVE_PW = False

KANBAN_HTML = Path(__file__).resolve().parent.parent / 'kanban.html'
SHOTS = Path(tempfile.gettempdir()) / 'stt-t15-shots'


def lum(rgb):
    def c(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = rgb[:3]
    return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)


def contrast(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


@unittest.skipUnless(HAVE_PW, 'Playwright non installé')
class KanbanForm(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()
        SHOTS.mkdir(exist_ok=True)
        cls.srv = Server(runner=True)
        cls.srv_off = Server(runner=False)

    @classmethod
    def tearDownClass(cls):
        cls.srv.end_all()
        cls.srv.close()
        cls.srv_off.close()
        cls.browser.close()
        cls.pw.stop()

    def page(self, srv=None, path='/kanban/', theme=None, width=1280, height=900, wait='#board .card'):
        srv = srv or self.srv
        ctx = self.browser.new_context(viewport={'width': width, 'height': height})
        if theme:
            ctx.add_init_script(f"try{{localStorage.setItem('kanbanTheme','{theme}')}}catch(e){{}}")
        pg = ctx.new_page()
        pg.errors = []
        pg.on('pageerror', lambda e: pg.errors.append(str(e)))
        pg.on('console', lambda m: pg.errors.append(m.text) if m.type == 'error' and 'favicon' not in m.text else None)
        pg.goto(f'http://127.0.0.1:{srv.port}{path}')
        if wait:
            pg.wait_for_selector(wait)
        self.addCleanup(ctx.close)
        return pg

    def open_form(self, pg):
        pg.click('#newBtn')
        pg.wait_for_selector('#newTask[open]')

    def reload_until(self, pg, col, tid, tries=20):
        sel = f'#board .col[data-s={col}] .card[data-id="{tid}"]'
        for _ in range(tries):
            pg.wait_for_function("!document.getElementById('reload').hasAttribute('aria-busy')")
            pg.click('#reload')
            try:
                pg.wait_for_selector(sel, timeout=1500)
                return
            except Exception:
                pass
        self.fail(f'{tid} jamais dans la colonne {col}')

    def fill_ok(self, pg, title='Ma tâche', prompt='SLEEP 0\nFaire **quelque chose**.'):
        pg.fill('#ntTitle', title)
        pg.fill('#ntPrompt', prompt)

    def test_button_absent_without_token(self):
        pg = self.browser.new_page()
        self.addCleanup(pg.close)
        pg.goto(KANBAN_HTML.as_uri())
        pg.wait_for_selector('#filters')
        self.assertTrue(pg.eval_on_selector('#newBtn', 'e => e.hidden'))
        self.assertFalse(pg.is_visible('#newBtn'))

    def test_button_visible_with_token_and_dialog_defaults(self):
        pg = self.page()
        self.assertTrue(pg.is_visible('#newBtn'))
        self.open_form(pg)
        self.assertEqual(pg.evaluate('document.activeElement.id'), 'ntTitle')
        self.assertEqual(pg.input_value('#ntLot'), 'T9')
        self.assertIn('T9 · Lot de test', pg.inner_text('#ntLot'))
        self.assertEqual(pg.input_value('#ntModel'), 'sonnet')
        pg.select_option('#ntAgent', 'archi')
        self.assertEqual(pg.input_value('#ntModel'), 'opus')
        pg.select_option('#ntAgent', 'revue')
        self.assertEqual(pg.input_value('#ntModel'), 'haiku')
        self.assertEqual(pg.eval_on_selector_all('#ntAgent option', 'o => o.map(x => x.value)'), ['dev', 'archi', 'revue'])
        pg.select_option('#ntModel', 'opus')
        self.assertEqual(pg.input_value('#ntModel'), 'opus')
        pg.select_option('#ntCx', 'L')
        hint = pg.inner_text('#ntCxH')
        self.assertIn('150 k', hint)
        self.assertIn('15 min', hint)
        self.assertEqual(pg.input_value('#ntPrio'), '2')
        # compteur de caractères
        pg.fill('#ntPrompt', 'abc')
        self.assertIn('3 caractères', pg.inner_text('#ntPrCnt'))
        # capacité restante (lanceur actif)
        pg.wait_for_function("document.getElementById('ntCap').textContent.includes('Capacité restante')")
        self.assertFalse(pg.is_disabled('#ntAuto'))
        # Échap ferme
        pg.keyboard.press('Escape')
        self.assertFalse(pg.evaluate("document.getElementById('newTask').open"))
        self.assertEqual(pg.errors, [])

    def test_validation(self):
        pg = self.page()
        self.open_form(pg)
        pg.click('#ntOk')
        self.assertIn('obligatoire', pg.inner_text('#ntTitleE'))
        self.assertEqual(pg.get_attribute('#ntTitle', 'aria-invalid'), 'true')
        self.assertTrue(pg.evaluate("document.getElementById('newTask').open"))
        pg.fill('#ntTitle', 'Titre')
        pg.click('#ntOk')
        self.assertEqual(pg.inner_text('#ntTitleE'), '')
        self.assertIn('prompt est obligatoire', pg.inner_text('#ntPrE'))
        pg.fill('#ntPrompt', 'x')
        for bad in ('/tmp/autre', '.claude/worktrees/../x', 'foo'):
            pg.fill('#ntWt', bad)
            pg.click('#ntOk')
            self.assertIn('.claude/worktrees/', pg.inner_text('#ntWtE'), bad)
        self.assertTrue(pg.evaluate("document.getElementById('newTask').open"))
        self.assertEqual(pg.errors, [])

    def test_create_without_autostart(self):
        s = self.srv
        pg = self.page()
        self.open_form(pg)
        self.fill_ok(pg, title='<b>Titre</b> & co')
        with pg.expect_response('**/api/tasks') as ri:
            pg.click('#ntOk')
        tid = ri.value.json()['id']
        pg.wait_for_function("!document.getElementById('newTask').open")
        pg.wait_for_selector(f'#board .col[data-s=todo] .card[data-id="{tid}"]')
        self.assertTrue(Path(s.prompts, tid + '.md').exists())
        self.assertIn('quelque chose', Path(s.prompts, tid + '.md').read_text(encoding='utf-8'))
        # titre non interprété comme HTML
        self.assertEqual(pg.locator('#board b').count(), 0)
        self.assertIn('<b>Titre</b> & co', pg.inner_text(f'#board .card[data-id="{tid}"]'))
        self.assertEqual(s.plan_row(tid)['status'], 'todo')
        self.assertEqual(pg.errors, [])

    def test_create_with_autostart(self):
        s = self.srv
        pg = self.page()
        self.open_form(pg)
        pg.wait_for_function("document.getElementById('ntCap').textContent.includes('Capacité restante')")
        self.fill_ok(pg, title='Auto', prompt='EXIT 0')
        pg.check('#ntAuto')
        with pg.expect_response('**/api/tasks') as ri:
            pg.click('#ntOk')
        tid = ri.value.json()['id']
        pg.wait_for_function("!document.getElementById('newTask').open")
        s.wait_row(tid, lambda r: r.get('status') == 'doing')
        self.reload_until(pg, 'doing', tid)
        s.wait_state(tid, 'running')
        s.call('POST', f'/api/runner/{tid}/input', {'data': '\x04'})
        s.wait_row(tid, lambda r: r.get('status') == 'review', timeout=45)
        self.reload_until(pg, 'review', tid)
        self.assertEqual(pg.errors, [])

    def test_server_error_shown(self):
        pg = self.page()
        self.open_form(pg)
        self.fill_ok(pg)
        pg.evaluate("""() => { const a = document.createElement('option'); a.value = 'ZZ'; a.textContent = 'ZZ'; document.getElementById('ntLot').appendChild(a); document.getElementById('ntLot').value = 'ZZ'; }""")
        pg.click('#ntOk')
        pg.wait_for_function("document.getElementById('ntSrv').textContent.length > 0")
        self.assertIn('400', pg.inner_text('#ntSrv'))
        self.assertIn('lot inconnu', pg.inner_text('#ntSrv'))
        self.assertTrue(pg.evaluate("document.getElementById('newTask').open"))
        self.assertFalse(pg.is_disabled('#ntOk'))

    def test_button_disabled_while_sending(self):
        pg = self.page()
        self.open_form(pg)
        self.fill_ok(pg)
        pg.route('**/api/tasks', lambda r: (pg.wait_for_timeout(600), r.continue_()))
        pg.click('#ntOk')
        self.assertTrue(pg.is_disabled('#ntOk'))
        pg.wait_for_function("!document.getElementById('newTask').open", timeout=15000)

    def test_autostart_disabled_when_runner_off(self):
        pg = self.page(self.srv_off)
        self.open_form(pg)
        pg.wait_for_function("document.getElementById('ntAuto').disabled")
        self.assertIn('Lanceur désactivé', pg.inner_text('#ntAutoH'))
        self.assertFalse(pg.is_checked('#ntAuto'))

    def test_light_theme_readable(self):
        pg = self.page(theme='light')
        self.open_form(pg)
        pg.screenshot(path=str(SHOTS / 'form-light.png'))
        ratios = pg.evaluate("""() => {
          const rgb = s => s.match(/[\\d.]+/g).map(Number);
          const out = {};
          for (const id of ['ntTitle', 'ntPrompt', 'ntLot', 'ntCxH', 'ntT']) {
            const e = document.getElementById(id), cs = getComputedStyle(e);
            let bg = cs.backgroundColor, n = e;
            while (/rgba\\(.*, 0\\)|transparent/.test(bg) && n.parentElement) { n = n.parentElement; bg = getComputedStyle(n).backgroundColor; }
            out[id] = [rgb(cs.color), rgb(bg)];
          }
          return out;
        }""")
        for k, (fg, bg) in ratios.items():
            self.assertGreaterEqual(contrast(fg, bg), 4.5, k)
        self.assertEqual(pg.errors, [])

    def test_embedded_in_frame(self):
        pg = self.page(path='/#kanban', width=1280, height=800, wait=None)
        frame_el = pg.wait_for_selector('#kanbanFrame:not([hidden])', timeout=15000)
        fr = frame_el.content_frame()
        fr.wait_for_selector('#board .card', timeout=15000)
        fr.wait_for_selector('#newBtn:not([hidden])')
        self.assertFalse(pg.evaluate("document.getElementById('kanbanFrame').classList.contains('full')"))
        fr.click('#newBtn')
        pg.wait_for_function("document.getElementById('kanbanFrame').classList.contains('full')", timeout=5000)
        box = pg.eval_on_selector('#kanbanFrame', 'e => { const r = e.getBoundingClientRect(); return [r.width, r.height, innerWidth, innerHeight]; }')
        self.assertEqual(box[0], box[2])
        self.assertEqual(box[1], box[3])
        self.assertTrue(fr.is_visible('#newTask'))
        fr.click('#ntX')
        pg.wait_for_function("!document.getElementById('kanbanFrame').classList.contains('full')", timeout=5000)
        self.assertFalse(fr.evaluate("document.getElementById('newTask').open"))


if __name__ == '__main__':
    unittest.main()
