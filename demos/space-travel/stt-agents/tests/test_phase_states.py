"""
T3.4 : cohérence des états affichés d'un agent (étape, tâche, pastille).
Unitaire : reconcile_phase et PlanIndex ; serveur réel (faux agent) : task / task_status / phase ; interface (Playwright).
Aucun vrai `claude`.
"""

import json
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

import stt_agents_server as srv  # noqa: E402
from test_api import Server  # noqa: E402

OPEN, MERGED, CLOSED = {'state': 'open', 'merged': False}, {'state': 'closed', 'merged': True}, {'state': 'closed', 'merged': False}


class ReconcilePhase(unittest.TestCase):
    def test_matrice(self):
        r = srv.reconcile_phase
        cases = [
            ((2, None, None), 2), ((2, 'doing', None), 2), ((2, 'todo', None), 2), ((-1, None, None), -1),
            ((2, 'done', None), 6), ((-1, 'done', None), 6), ((6, 'done', None), 6),
            ((2, 'review', None), 3), ((4, 'review', None), 4), ((3, 'review', None), 3), ((5, 'review', None), 5),
            ((2, None, MERGED), 6), ((2, 'doing', MERGED), 6), ((2, None, OPEN), 5), ((6, None, OPEN), 6),
            ((3, None, CLOSED), 3), ((2, 'blocked', None), 2), ((None, None, None), -1),
        ]
        for args, want in cases:
            self.assertEqual(r(*args), want, args)

    def test_ne_recule_jamais(self):
        for ph in range(-1, 7):
            for st in (None, 'todo', 'doing', 'review', 'done'):
                for pr in (None, OPEN, MERGED, CLOSED):
                    self.assertGreaterEqual(srv.reconcile_phase(ph, st, pr), ph)


class PlanIndexTests(unittest.TestCase):
    def test_cache_mtime_et_erreur(self):
        d = tempfile.mkdtemp(prefix='stt-planidx-')
        path = os.path.join(d, 'plan-status.js')
        def write(status, extra=''):
            Path(path).write_text('window.PLAN={lots:[{id:"L"}],tasks:[{id:"L.1",lot:"L",status:"%s",session:"s1"%s}]};' % (status, extra))
        write('doing')
        idx = srv.PlanIndex(path)
        idx.refresh()
        self.assertEqual(idx.task_of('s1'), ('L.1', 'doing'))
        calls = []
        orig = srv.read_plan
        srv.read_plan = lambda p: (calls.append(p), orig(p))[1]
        try:
            idx.refresh()
            self.assertEqual(calls, [])             # inchangé : pas de relecture
            write('done', ', note:"x"')
            idx.refresh()
            self.assertEqual(len(calls), 1)
            self.assertEqual(idx.task_of('s1'), ('L.1', 'done'))
            Path(path).write_text('ceci n est pas du js (')
            idx.refresh()                            # erreur : ancien cache conservé
            self.assertEqual(idx.task_of('s1'), ('L.1', 'done'))
        finally:
            srv.read_plan = orig
        self.assertEqual(idx.task_of('inconnue'), (None, None))
        self.assertEqual(srv.PlanIndex(None).task_of('s1'), (None, None))


def agent_of(s, sid):
    st, state = s.call('GET', '/api/state', token=False, origin=False)
    return next((a for a in state.get('agents', []) if a['id'] == sid), None)


class ServerPhase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = Server(runner=True, extra=['--waiting-silence', '0.5'])

    @classmethod
    def tearDownClass(cls):
        cls.s.close()

    def tearDown(self):
        self.s.end_all()

    def wait_agent(self, sid, cond, timeout=20):
        end = time.time() + timeout
        a = None
        while time.time() < end:
            a = agent_of(self.s, sid)
            if a and cond(a):
                return a
            time.sleep(0.3)
        raise AssertionError(f'agent inattendu : {a}')

    def set_status(self, tid, status):
        st, out = self.s.call('POST', '/api/kanban', {'ops': [{'op': 'task', 'id': tid, 'set': {'status': status}}]},
                              headers={'X-STT-Kanban': '1'})
        self.assertEqual(st, 200, out)

    def test_task_status_et_phase(self):
        s = self.s
        tid = s.create('WAIT TOKENS 10', autostart=True)
        run = s.wait_state(tid, ('starting', 'running', 'waiting'))
        a = self.wait_agent(run['session'], lambda a: a.get('task') == tid)
        self.assertEqual(a['task'], tid)
        self.assertIn('task_status', a)
        self.assertLess(a['phase'], 6)
        self.set_status(tid, 'review')
        a = self.wait_agent(run['session'], lambda a: a.get('task_status') == 'review')
        self.assertGreaterEqual(a['phase'], 3)
        self.assertLess(a['phase'], 6)
        self.set_status(tid, 'done')
        a = self.wait_agent(run['session'], lambda a: a.get('task_status') == 'done')
        self.assertEqual(a['phase'], 6)
        self.assertLess(a['phase_raw'], 6)


if __name__ == '__main__':
    unittest.main()


try:
    from playwright.sync_api import sync_playwright
    HAVE_PW = True
except Exception:  # pragma: no cover
    HAVE_PW = False


@unittest.skipUnless(HAVE_PW, 'Playwright non installé')
class UiSteps(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = Server(runner=True, extra=['--waiting-silence', '0.5'])
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(ignore_default_args=['--hide-scrollbars'])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.s.end_all()
        cls.s.proc.terminate()

    def start(self, end):
        s = self.s
        tid = s.create('WAIT TOKENS 10', autostart=True)
        run = s.wait_state(tid, ('running', 'waiting', 'starting'))
        for _ in range(100):
            if agent_of(s, run['session']):
                break
            time.sleep(0.2)
        if end == 'done':
            s.call('POST', f'/api/runner/{tid}/input', {'data': '\x04'})
            s.wait_state(tid, 'done')
        else:
            s.call('POST', f'/api/runner/{tid}/kill', {})
            s.wait_state(tid, 'killed')
        return tid, run['session']

    def steps(self, page, sid):
        page.wait_for_selector(f'article.agent[data-id="{sid}"] ol.steps')
        return page.evaluate("""id => { const c = document.querySelector(`article.agent[data-id="${id}"]`);
            return { steps: [...c.querySelectorAll('ol.steps li')].map(li => li.className + ':' + li.textContent),
                     pill: c.querySelector('.pill').textContent.trim(), tk: (c.querySelector('.tk') || {}).textContent || '' }; }""", sid)

    def test_livre_si_termine_et_tache_faite_jamais_si_tue(self):
        s = self.s
        done_t, done_s = self.start('done')
        kill_t, kill_s = self.start('kill')
        for t, status in ((done_t, 'done'), (kill_t, 'doing')):
            st, out = s.call('POST', '/api/kanban', {'ops': [{'op': 'task', 'id': t, 'set': {'status': status}}]},
                             headers={'X-STT-Kanban': '1'})
            self.assertEqual(st, 200, out)
        end = time.time() + 20
        while time.time() < end and (agent_of(s, done_s) or {}).get('task_status') != 'done':
            time.sleep(0.3)
        a = agent_of(s, done_s)
        self.assertEqual((a['task'], a['task_status'], a['phase']), (done_t, 'done', 6), a)
        page = self.browser.new_context(viewport={'width': 1200, 'height': 900}).new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.route('https://**/*', lambda r: r.abort())
        page.goto(f'http://127.0.0.1:{s.port}/?x=1#agents')
        page.wait_for_selector('#conn.live')
        page.wait_for_function("() => document.querySelector('#filters [data-f=\"done\"]')", timeout=20000)
        page.click('[data-v="cards"]')
        page.click('#filters [data-f="done"]')
        r = self.steps(page, done_s)
        self.assertEqual(r['pill'], 'Terminé')
        self.assertIn(done_t, r['tk'])
        self.assertEqual(r['steps'][6], 'cur last:Livré')
        self.assertTrue(all(x.startswith('done') for x in r['steps'][:6]), r)
        page.click('#filters [data-f="all"]')
        r = self.steps(page, kill_s)
        self.assertEqual(r['pill'], 'Tué')
        self.assertNotIn('cur', r['steps'][6])
        self.assertFalse(any(x.endswith('Livré') and x.startswith(('cur', 'done')) for x in r['steps']), r)
        self.assertEqual(errors, [])
