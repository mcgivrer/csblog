"""Tests de l'édition d'une tâche « À faire » dans le Kanban (T1.10, Playwright). Aucun vrai `claude`."""

import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from test_api import Server  # noqa: E402
from test_ui_kanban_form import contrast  # noqa: E402

try:
    from playwright.sync_api import sync_playwright
    HAVE_PW = True
except Exception:  # pragma: no cover
    HAVE_PW = False


@unittest.skipUnless(HAVE_PW, 'Playwright non installé')
class KanbanEdit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()
        cls.srv = Server(runner=True)

    @classmethod
    def tearDownClass(cls):
        cls.srv.end_all()
        cls.srv.close()
        cls.browser.close()
        cls.pw.stop()

    def page(self, path='/kanban/', theme=None, width=1280, height=900, wait='#board .card', notoken=False):
        ctx = self.browser.new_context(viewport={'width': width, 'height': height})
        if theme:
            ctx.add_init_script(f"try{{localStorage.setItem('kanbanTheme','{theme}')}}catch(e){{}}")
        pg = ctx.new_page()
        pg.errors = []
        pg.on('pageerror', lambda e: pg.errors.append(str(e)))
        pg.on('console', lambda m: pg.errors.append(m.text) if m.type == 'error' and 'favicon' not in m.text and 'Failed to load resource' not in m.text else None)
        if notoken:
            def strip(route):
                resp = route.fetch()
                body = re.sub(r'(name="stt-token" content=")[^"]*', r'\1', resp.text())
                route.fulfill(response=resp, body=body)
            pg.route('**/kanban/', strip)
        pg.goto(f'http://127.0.0.1:{self.srv.port}{path}')
        if wait:
            pg.wait_for_selector(wait)
        self.addCleanup(ctx.close)
        return pg

    def todo(self, prompt='Prompt initial\nligne 2', with_file=True, **kw):
        tid = self.srv.create(prompt, autostart=False, **kw)
        if with_file:
            d = Path(self.srv.repo, 'demos/space-travel/stt-agents/data/prompts')
            d.mkdir(parents=True, exist_ok=True)
            (d / f'{tid}.md').write_text(prompt + '\n', encoding='utf-8')
        return tid

    def card(self, tid):
        return f'#board .card[data-id="{tid}"]'

    def open_edit(self, pg, tid):
        pg.click(f'{self.card(tid)} .ed')
        pg.wait_for_selector('#newTask[open]')

    def test_icon_presence(self):
        tid = self.todo()
        pg = self.page()
        pg.wait_for_selector(self.card(tid))
        b = pg.locator(f'{self.card(tid)} .top .ed')
        self.assertEqual(b.count(), 1)
        self.assertEqual(b.get_attribute('aria-label'), f'Modifier la tâche {tid}')
        self.assertTrue(b.get_attribute('title'))
        self.assertEqual(pg.eval_on_selector(f'{self.card(tid)} .ed svg', 'e => e.getBoundingClientRect().width'), 14)
        # pas sur les cartes en cours / faites
        self.assertEqual(pg.locator('#board .card[data-s=doing] .ed, #board .card[data-s=done] .ed').count(), 0)
        self.assertGreater(pg.locator('#board .card[data-s=done]').count(), 0)
        # un clic sur l'icône ne plie/déplie pas la carte
        was = pg.eval_on_selector(self.card(tid), 'e => e.classList.contains("folded")')
        self.open_edit(pg, tid)
        self.assertEqual(pg.eval_on_selector(self.card(tid), 'e => e.classList.contains("folded")'), was)
        self.assertEqual(pg.errors, [])

    def test_icon_absent_without_token(self):
        self.todo()
        pg = self.page(notoken=True)
        self.assertGreater(pg.locator('#board .card[data-s=todo]').count(), 0)
        self.assertEqual(pg.locator('#board .ed').count(), 0)
        self.assertEqual(pg.errors, [])

    def test_prefilled_dialog(self):
        tid = self.todo(title='Titre préparé', cx='L', prio=3, worktree='.claude/worktrees/stt-pre', perm='plan', agent='archi', model='opus')
        pg = self.page()
        self.open_edit(pg, tid)
        self.assertIn(f'Modifier la tâche {tid}', pg.inner_text('#ntT'))
        self.assertEqual(pg.inner_text('#ntOk'), 'Enregistrer')
        pg.wait_for_function("document.getElementById('ntPrompt').value.length > 0")
        self.assertEqual(pg.input_value('#ntPrompt'), 'Prompt initial\nligne 2\n')
        self.assertEqual(pg.input_value('#ntTitle'), 'Titre préparé')
        self.assertEqual(pg.input_value('#ntAgent'), 'archi')
        self.assertEqual(pg.input_value('#ntModel'), 'opus')
        self.assertEqual(pg.input_value('#ntCx'), 'L')
        self.assertEqual(pg.input_value('#ntPrio'), '3')
        self.assertEqual(pg.input_value('#ntWt'), '.claude/worktrees/stt-pre')
        self.assertEqual(pg.input_value('#ntPerm'), 'plan')
        self.assertEqual(pg.input_value('#ntLot'), 'T9')
        self.assertTrue(pg.is_disabled('#ntLot'))
        self.assertFalse(pg.is_visible('#ntAuto'))

    def test_save_updates_card(self):
        s = self.srv
        tid = self.todo(title='Avant', cx='S')
        pg = self.page()
        self.open_edit(pg, tid)
        pg.wait_for_function("document.getElementById('ntPrompt').value.length > 0")
        pg.fill('#ntTitle', 'Après édition')
        pg.select_option('#ntCx', 'XL')
        pg.fill('#ntPrompt', 'Nouveau texte')
        with pg.expect_response(f'**/api/tasks/{tid}/edit') as ri:
            pg.click('#ntOk')
        self.assertEqual(ri.value.status, 200)
        pg.wait_for_function("!document.getElementById('newTask').open")
        pg.wait_for_function(f"document.querySelector('#board .card[data-id=\"{tid}\"] h3').textContent.includes('Après édition')")
        self.assertEqual(pg.inner_text(f'{self.card(tid)} .badge.cx'), 'XL')
        pg.wait_for_selector(f'{self.card(tid)}.flash')
        row = s.plan_row(tid)
        self.assertEqual((row['title'], row['cx'], row['budget']), ('Après édition', 'XL', 300000))
        self.assertEqual(Path(s.prompts, tid + '.md').read_text(encoding='utf-8'), 'Nouveau texte\n')
        self.assertEqual(pg.errors, [])

    def test_server_error_shown(self):
        s = self.srv
        tid = self.todo()
        pg = self.page()
        self.open_edit(pg, tid)
        pg.wait_for_function("document.getElementById('ntPrompt').value.length > 0")
        # la tâche passe « en cours » côté serveur entre-temps : l'édition est refusée
        st, _ = s.call('POST', '/api/kanban', {'ops': [{'op': 'task', 'id': tid, 'set': {'status': 'blocked'}}]},
                       headers={'X-STT-Kanban': '1'})
        self.assertEqual(st, 200)
        pg.click('#ntOk')
        pg.wait_for_function("document.getElementById('ntSrv').textContent.length > 0")
        self.assertIn('409', pg.inner_text('#ntSrv'))
        self.assertIn('À faire', pg.inner_text('#ntSrv'))
        self.assertTrue(pg.evaluate("document.getElementById('newTask').open"))
        self.assertFalse(pg.is_disabled('#ntOk'))

    def test_client_validation_and_busy(self):
        tid = self.todo()
        pg = self.page()
        self.open_edit(pg, tid)
        pg.wait_for_function("document.getElementById('ntPrompt').value.length > 0")
        pg.fill('#ntTitle', '')
        pg.click('#ntOk')
        self.assertIn('obligatoire', pg.inner_text('#ntTitleE'))
        pg.fill('#ntTitle', 'Ok')
        pg.route(f'**/api/tasks/{tid}/edit', lambda r: (pg.wait_for_timeout(600), r.continue_()))
        pg.click('#ntOk')
        self.assertTrue(pg.is_disabled('#ntOk'))
        pg.wait_for_function("!document.getElementById('newTask').open", timeout=15000)

    def test_create_mode_intact_after_edit(self):
        tid = self.todo()
        pg = self.page()
        self.open_edit(pg, tid)
        pg.wait_for_function("document.getElementById('ntPrompt').value.length > 0")
        pg.keyboard.press('Escape')
        pg.click('#newBtn')
        pg.wait_for_selector('#newTask[open]')
        self.assertIn('Nouvelle tâche', pg.inner_text('#ntT'))
        self.assertEqual(pg.inner_text('#ntOk'), 'Créer la tâche')
        self.assertFalse(pg.is_disabled('#ntLot'))
        self.assertTrue(pg.is_visible('#ntAuto'))
        self.assertEqual(pg.input_value('#ntTitle'), '')
        self.assertEqual(pg.input_value('#ntPrompt'), '')
        self.assertEqual(pg.input_value('#ntWt'), '')
        self.assertFalse(pg.is_disabled('#ntPrompt'))
        self.assertEqual(pg.errors, [])

    def test_embedded_in_frame(self):
        tid = self.todo()
        pg = self.page(path='/#kanban', width=1280, height=800, wait=None)
        fr = pg.wait_for_selector('#kanbanFrame:not([hidden])', timeout=15000).content_frame()
        fr.wait_for_selector(f'{self.card(tid)} .ed', timeout=15000)
        fr.click(f'{self.card(tid)} .ed')
        pg.wait_for_function("document.getElementById('kanbanFrame').classList.contains('full')", timeout=5000)
        self.assertTrue(fr.is_visible('#newTask'))
        fr.click('#ntX')
        pg.wait_for_function("!document.getElementById('kanbanFrame').classList.contains('full')", timeout=5000)

    def test_light_theme_readable(self):
        tid = self.todo()
        pg = self.page(theme='light')
        c = pg.evaluate(f"""() => {{
          const rgb = s => s.match(/[\\d.]+/g).map(Number);
          const e = document.querySelector('#board .card[data-id="{tid}"] .ed'), cs = getComputedStyle(e);
          let bg = cs.backgroundColor, n = e;
          while (/rgba\\(.*, 0\\)|transparent/.test(bg) && n.parentElement) {{ n = n.parentElement; bg = getComputedStyle(n).backgroundColor; }}
          return [rgb(cs.color), rgb(bg)];
        }}""")
        self.assertGreaterEqual(contrast(c[0], c[1]), 3.0)
        self.open_edit(pg, tid)
        pg.wait_for_function("document.getElementById('ntPrompt').value.length > 0")
        ratios = pg.evaluate("""() => {
          const rgb = s => s.match(/[\\d.]+/g).map(Number), out = {};
          for (const id of ['ntTitle', 'ntPrompt', 'ntT']) {
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


if __name__ == '__main__':
    unittest.main()
