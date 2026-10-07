"""Tests de l'interface « base du worktree » du dialogue de tâche (T1.11, Playwright). Aucun vrai `claude`."""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from test_api import Server, git  # noqa: E402
import test_ui_kanban_edit as _ke  # noqa: E402
from test_ui_kanban_form import contrast  # noqa: E402

try:
    from playwright.sync_api import sync_playwright
    HAVE_PW = True
except Exception:  # pragma: no cover
    HAVE_PW = False


@unittest.skipUnless(HAVE_PW, 'Playwright non installé')
class KanbanBase(unittest.TestCase):
    page = _ke.KanbanEdit.page
    todo = _ke.KanbanEdit.todo
    card = _ke.KanbanEdit.card
    open_edit = _ke.KanbanEdit.open_edit

    @classmethod
    def setUpClass(cls):
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()
        cls.srv = Server(runner=True)
        git('branch', 'feat-ui', cwd=cls.srv.repo)
        git('worktree', 'add', '-q', '-b', 'br-ui', str(Path(cls.srv.repo, '.claude/worktrees/wt-ui')), 'main', cwd=cls.srv.repo)

    @classmethod
    def tearDownClass(cls):
        cls.srv.end_all()
        cls.srv.close()
        cls.browser.close()
        cls.pw.stop()

    def open_new(self, pg):
        pg.click('#newBtn')
        pg.wait_for_selector('#newTask[open]')
        pg.wait_for_function("document.querySelectorAll('#ntBase option').length > 1")

    def fill_min(self, pg):
        pg.fill('#ntTitle', 'Titre UI')
        pg.fill('#ntPrompt', 'Prompt UI')

    def test_suggestions_branches_and_help(self):
        pg = self.page()
        self.open_new(pg)
        self.assertEqual(pg.get_attribute('#ntWt', 'list'), 'ntWtList')
        vals = pg.eval_on_selector_all('#ntWtList option', 'els => els.map(e => e.value)')
        self.assertIn('.claude/worktrees/wt-ui', vals)
        branches = pg.eval_on_selector_all('#ntBase option', 'els => els.map(e => e.value)')
        for b in ('main', 'feat-ui', 'br-ui'):
            self.assertIn(b, branches)
        self.assertEqual(pg.input_value('#ntBase'), 'main')
        help_txt = pg.inner_text('#ntBaseH')
        self.assertIn('seulement si le worktree est créé', help_txt)
        self.assertIn('code non fusionné', help_txt)
        self.assertEqual(pg.errors, [])

    def test_create_sends_base(self):
        pg = self.page()
        self.open_new(pg)
        self.fill_min(pg)
        pg.select_option('#ntBase', 'feat-ui')
        bodies = []
        pg.route('**/api/tasks', lambda route: (bodies.append(json.loads(route.request.post_data)), route.fulfill(
            status=200, content_type='application/json', body=json.dumps({'ok': True, 'id': 'T9.999', 'budget': 1, 'prompt': 'x'}))))
        pg.click('#ntOk')
        pg.wait_for_function("!document.getElementById('newTask').open")
        self.assertEqual(len(bodies), 1)
        self.assertEqual(bodies[0]['base'], 'feat-ui')
        self.assertEqual(pg.errors, [])

    def test_create_default_omits_base(self):
        pg = self.page()
        self.open_new(pg)
        self.fill_min(pg)
        bodies = []
        pg.route('**/api/tasks', lambda route: (bodies.append(json.loads(route.request.post_data)), route.fulfill(
            status=200, content_type='application/json', body=json.dumps({'ok': True, 'id': 'T9.998', 'budget': 1, 'prompt': 'x'}))))
        pg.click('#ntOk')
        pg.wait_for_function("!document.getElementById('newTask').open")
        self.assertNotIn('base', bodies[0])

    def test_edit_prefill_and_send(self):
        tid = self.todo(base='feat-ui', worktree='.claude/worktrees/wt-ui-new')
        pg = self.page()
        self.open_edit(pg, tid)
        pg.wait_for_function("document.getElementById('ntPrompt').value.length > 0")
        pg.wait_for_function("document.querySelectorAll('#ntBase option').length > 1")
        self.assertEqual(pg.input_value('#ntBase'), 'feat-ui')
        pg.select_option('#ntBase', 'br-ui')
        bodies = []
        pg.route(f'**/api/tasks/{tid}/edit', lambda route: (bodies.append(json.loads(route.request.post_data)), route.continue_()))
        with pg.expect_response(f'**/api/tasks/{tid}/edit') as ri:
            pg.click('#ntOk')
        self.assertEqual(ri.value.status, 200)
        self.assertEqual(bodies[0]['base'], 'br-ui')
        self.assertEqual(self.srv.plan_row(tid)['base'], 'br-ui')
        self.assertEqual(pg.errors, [])

    def test_light_theme_readable(self):
        pg = self.page(theme='light')
        self.open_new(pg)
        ratios = pg.evaluate("""() => {
          const rgb = s => s.match(/[\\d.]+/g).map(Number), out = {};
          for (const id of ['ntBase', 'ntBaseH', 'ntWt']) {
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
