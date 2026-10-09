"""
T3.9 : dernière tâche d'un worktree (last_task), GET /api/tasks/<id> et carte flottante (Playwright).
"""

import json
import os
import re
import sys
import tempfile
import time
import types
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent))
import stt_agents_server as srvmod  # noqa: E402
from test_api import Server, PLAN, git  # noqa: E402

try:
    from playwright.sync_api import sync_playwright
    HAVE_PW = True
except Exception:  # pragma: no cover
    HAVE_PW = False

CDN = re.compile(r'https://(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)/')


def run(task, wt, started):
    return types.SimpleNamespace(task=task, worktree=wt, started=started)


class LastTaskUnit(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(prefix='stt-lt-')
        self.wt = os.path.join(self.root, '.claude', 'worktrees', 'w1')
        os.makedirs(self.wt)
        os.makedirs(os.path.join(self.root, 'autre'))
        os.symlink(self.wt, os.path.join(self.root, 'lien'))
        self.rows = [{'id': 'T1.1', 'worktree': '.claude/worktrees/w1', 'updated': '2026-10-01 10:00'},
                     {'id': 'T1.2', 'worktree': '.claude/worktrees/w1', 'updated': '2026-10-02 10:00'},
                     {'id': 'T1.3', 'worktree': '.claude/worktrees/ailleurs', 'updated': '2026-10-09 10:00'},
                     {'id': 'T2.4'}]

    def lt(self, runs=(), rows=None, subject=''):
        return srvmod.last_task_of(self.wt, self.root, list(runs), self.rows if rows is None else rows, subject)

    def test_a_run_le_plus_recent_chemins_resolus(self):
        runs = [run('T1.1', '.claude/worktrees/w1', 100), run('T2.4', 'lien', 200), run('T1.3', 'autre', 300)]
        self.assertEqual(self.lt(runs), 'T2.4')

    def test_b_ligne_du_plan_la_plus_recente(self):
        self.assertEqual(self.lt([run('T1.3', 'autre', 5)]), 'T1.2')

    def test_c_sujet_du_commit_si_au_plan(self):
        self.assertEqual(self.lt(rows=[{'id': 'T2.4'}], subject='T2.4 : un sujet'), 'T2.4')
        self.assertIsNone(self.lt(rows=[{'id': 'T2.4'}], subject='T9.9 : inconnue'))

    def test_aucun(self):
        self.assertIsNone(self.lt(rows=[], subject='sujet quelconque'))
        self.assertIsNone(srvmod.last_task_of('', self.root, [], []))

    def test_plan_illisible(self):
        self.assertIsNone(self.lt(rows=None if False else [None, 3, 'x', {'worktree': 5}], subject=''))
        idx = srvmod.PlanIndex(os.path.join(self.root, 'absent.js'))
        idx.refresh()
        self.assertEqual(idx.by_id, {})
        bad = os.path.join(self.root, 'bad.js')
        Path(bad).write_text('throw new Error("x")')
        idx = srvmod.PlanIndex(bad)
        idx.refresh()
        self.assertEqual(list(idx.by_id.values()), [])


class TaskEndpoint(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = Server(runner=False)
        cls.secret = os.path.join(cls.s.tmp, 'secret.txt')
        Path(cls.secret).write_text('SECRET-CONTENU-INTERDIT')
        os.makedirs(cls.s.prompts, exist_ok=True)
        Path(cls.s.prompts, 'T9.7.md').write_text('P' * 3000)
        os.symlink(cls.secret, os.path.join(cls.s.prompts, 'T9.9.md'))
        rows = [
            '{ id: "T9.7", lot: "T9", title: "Carte <b>x</b>", agent: "dev", model: "sonnet", status: "done", cx: "M", budget: 80000, used: 12345, ms: 61000, '
            'note: "' + 'n' * 3000 + '", prompt: "stt-agents/data/prompts/T9.7.md", docs: [{f:"docs/a.md", r:"lu"}, {f:"../../etc/passwd", r:"lu"}], '
            'worktree: ".claude/worktrees/x", base: "main", deps: ["T9.1"] },',
            '{ id: "T9.8", lot: "T9", title: "Hors dossier", agent: "dev", model: "sonnet", status: "todo", prompt: "../../secret.txt", worktree: "/abs/chemin" },',
            '{ id: "T9.9", lot: "T9", title: "Lien", agent: "dev", model: "sonnet", status: "todo" },',
        ]
        text = Path(cls.s.kanban).read_text(encoding='utf-8').replace('  tasks: [\n', '  tasks: [\n    ' + '\n    '.join(rows) + '\n', 1)
        Path(cls.s.kanban).write_text(text, encoding='utf-8')
        time.sleep(0.2)

    @classmethod
    def tearDownClass(cls):
        cls.s.proc.terminate()

    def get(self, tid, **kw):
        return self.s.call('GET', '/api/tasks/' + tid, headers={'Sec-Fetch-Site': 'same-origin'}, **kw)

    def test_fiche(self):
        st, o = self.get('T9.7', origin=False)
        self.assertEqual(st, 200, o)
        for k in ('id', 'lot', 'title', 'agent', 'model', 'status', 'cx', 'budget', 'used', 'ms', 'note', 'prompt',
                  'prompt_excerpt', 'docs', 'worktree', 'base', 'deps'):
            self.assertIn(k, o)
        self.assertEqual((o['id'], o['agent'], o['model'], o['budget'], o['used']), ('T9.7', 'dev', 'sonnet', 80000, 12345))
        self.assertEqual(len(o['note']), 2000)
        self.assertEqual(len(o['prompt_excerpt']), 800)
        self.assertEqual(o['prompt'], 'stt-agents/data/prompts/T9.7.md')
        self.assertEqual(o['docs'], [{'f': 'docs/a.md', 'r': 'lu'}])
        self.assertEqual(o['deps'], ['T9.1'])

    def test_inconnue_invalide_jeton(self):
        self.assertEqual(self.get('T0.0', origin=False)[0], 404)
        self.assertEqual(self.s.call('GET', '/api/tasks/..%2Fx', origin=True)[0], 404)
        self.assertEqual(self.get('T9.7', token=False, origin=False)[0], 403)
        self.assertEqual(self.s.call('GET', '/api/tasks/T9.7', origin='http://evil.example')[0], 403)

    def test_rien_de_sensible(self):
        _, o = self.get('T9.7', origin=False)
        txt = json.dumps(o)
        self.assertNotIn(self.s.token, txt)
        self.assertNotIn(self.s.tmp, txt)
        self.assertNotIn('passwd', txt)

    def test_prompt_hors_dossier_jamais_lu(self):
        for tid in ('T9.8', 'T9.9'):
            st, o = self.get(tid, origin=False)
            self.assertEqual(st, 200)
            self.assertIsNone(o['prompt_excerpt'], tid)
            self.assertNotIn('SECRET', json.dumps(o))
        self.assertIsNone(self.get('T9.8', origin=False)[1]['prompt'])
        self.assertIsNone(self.get('T9.8', origin=False)[1]['worktree'])


@unittest.skipUnless(HAVE_PW, 'Playwright non installé')
class LastTaskUi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = Server(runner=False)
        git('worktree', 'add', '-q', '-b', 'wt-a', '.claude/worktrees/wt-a', cwd=cls.s.repo)
        row = ('{ id: "T9.7", lot: "T9", title: "Titre <b>gras</b>", agent: "dev", model: "sonnet", status: "done", cx: "M", budget: 80000, '
               'used: 12345, ms: 61000, note: "Une <i>note</i>", docs: [{f:"docs/a.md", r:"lu"}], worktree: ".claude/worktrees/wt-a" },')
        text = Path(cls.s.kanban).read_text(encoding='utf-8').replace('  tasks: [\n', '  tasks: [\n    ' + row + '\n', 1)
        Path(cls.s.kanban).write_text(text, encoding='utf-8')
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(ignore_default_args=['--hide-scrollbars'])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.s.proc.terminate()

    def test_carte(self):
        ctx = self.browser.new_context(viewport={'width': 1200, 'height': 900})
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.route(CDN, lambda r: r.abort())
        page.goto(f'http://127.0.0.1:{self.s.port}/#agents')
        link = page.locator('#wtBox tr:has-text("wt-a") button.wt-task')
        link.wait_for(timeout=15000)
        self.assertEqual(link.inner_text(), 'T9.7')
        pop = page.locator('#wtPop')
        link.hover()
        pop.wait_for(state='visible', timeout=5000)
        page.wait_for_selector('#wtPop h4')
        self.assertIn('T9.7', pop.inner_text())
        self.assertIn('Titre <b>gras</b>', pop.inner_text())
        self.assertEqual(pop.locator('b:text-is("gras")').count(), 0)
        self.assertIn('docs/a.md', pop.inner_text())
        box, vp = pop.bounding_box(), page.viewport_size
        self.assertTrue(box['x'] >= 0 and box['x'] + box['width'] <= vp['width'])
        link.click()
        page.mouse.move(5, 5)
        page.wait_for_timeout(500)
        self.assertTrue(pop.is_visible(), 'épinglée par le clic')
        page.keyboard.press('Escape')
        self.assertFalse(pop.is_visible())
        link.click()
        pop.locator('button[data-wt-goto]').click()
        page.wait_for_selector('#kanbanFrame', state='visible', timeout=5000)
        self.assertFalse(pop.is_visible())
        self.assertEqual(errors, [])
        ctx.close()


if __name__ == '__main__':
    unittest.main()
