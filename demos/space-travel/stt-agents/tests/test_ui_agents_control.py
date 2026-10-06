"""
Tests de l'onglet Agents : contrôles des runs lancés par le serveur et terminal (T1.6, Playwright).
Serveur réel (--runner) sur dépôt git temporaire ; l'agent est le faux agent (aucun vrai `claude`).
"""

import json
import re
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import helpers  # noqa: E402
from test_api import Server  # noqa: E402

try:
    from playwright.sync_api import sync_playwright
    HAVE_PW = True
except Exception:  # pragma: no cover
    HAVE_PW = False

CDN = re.compile(r'https://(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)/')


def card(page, session):
    return page.locator(f'article.agent[data-id="{session}"]')


def btn(page, act, task, scope=None):
    return (scope or page).locator(f'button[data-ra="{act}"][data-task="{task}"]').first


@unittest.skipUnless(HAVE_PW, 'Playwright non installé')
class UiAgentsControl(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = Server(runner=True)
        cls.off = Server(runner=False)
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        for s in (cls.srv, cls.off):
            try:
                s.end_all()
            except Exception:
                pass
            s.proc.terminate()

    def setUp(self):
        self.ctx = self.browser.new_context(viewport={'width': 1200, 'height': 900})
        self.page = self.ctx.new_page()
        self.errors = []
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))
        self.dialogs = []
        self.page.on('dialog', lambda d: (self.dialogs.append(d.message), d.accept()))

    def tearDown(self):
        self.ctx.close()
        self.srv.end_all()
        self.assertEqual(self.errors, [])

    def open(self, srv=None, block_cdn=True, query='', live=True):
        srv = srv or self.srv
        if block_cdn:
            self.page.route(CDN, lambda r: r.abort())
        self.page.goto(f'http://127.0.0.1:{srv.port}/?{query}')
        self.page.wait_for_selector('#conn.live' if live else '#agentGrid > *')

    def start(self, prompt='SLEEP 0'):
        task = self.srv.create(prompt)
        run = self.srv.wait_state(task, ('running', 'waiting', 'starting'))
        for _ in range(100):  # la carte existe quand le collecteur a lu le transcript
            st = self.srv.call('GET', '/api/state', token=False, origin=False)[1]
            if any(a['id'] == run['session'] for a in st.get('agents', [])):
                break
            time.sleep(0.1)
        return task, run['session']

    def wait_state(self, task, st):
        self.page.wait_for_selector(f'.rctl[data-task="{task}"] [data-rstate]:text-is("{st}")', timeout=15000)

    def view_cards(self):
        self.page.click('#views [data-v="cards"]')

    def test_card_badge_and_buttons_by_state(self):
        task, sid = self.start()
        self.open()
        self.view_cards()
        c = card(self.page, sid)
        c.wait_for(timeout=15000)
        self.assertIn('lancé par le serveur', c.inner_text().lower())
        self.assertTrue(btn(self.page, 'terminal', task, c).is_enabled())
        self.assertTrue(btn(self.page, 'kill', task, c).is_enabled())
        self.assertTrue(btn(self.page, 'pause', task, c).is_enabled())
        self.assertTrue(btn(self.page, 'stop', task, c).is_enabled())
        self.assertTrue(btn(self.page, 'resume', task, c).is_disabled())
        self.assertTrue(btn(self.page, 'retry', task, c).is_disabled())
        self.assertTrue(btn(self.page, 'pause', task, c).get_attribute('aria-label'))
        self.assertNotIn('non pilotable', c.inner_text())

    def test_pause_resume_stop_retry_kill_tree(self):
        task, sid = self.start()
        self.open()
        self.page.wait_for_selector(f'.rctl.tree[data-task="{task}"]', timeout=15000)
        sc = self.page.locator(f'.rctl[data-task="{task}"]').first
        btn(self.page, 'pause', task, sc).click()
        self.wait_state(task, 'en pause')
        self.assertEqual(self.srv.run(task)['state'], 'paused')
        self.assertTrue(btn(self.page, 'resume', task, sc).is_enabled())
        self.assertTrue(btn(self.page, 'pause', task, sc).is_disabled())
        btn(self.page, 'resume', task, sc).click()
        self.page.wait_for_function(
            "t => ['en cours','attend'].includes(document.querySelector(`.rctl[data-task=\"${t}\"] [data-rstate]`).textContent)", arg=task)
        btn(self.page, 'stop', task, sc).click()
        self.wait_state(task, 'arrêté')
        self.assertEqual(self.srv.run(task)['state'], 'stopped')
        self.assertTrue(btn(self.page, 'retry', task, sc).is_enabled())
        self.assertTrue(btn(self.page, 'kill', task, sc).is_disabled())
        btn(self.page, 'retry', task, sc).click()
        self.page.wait_for_function(
            "t => ['en file','démarrage','en cours','attend'].includes(document.querySelector(`.rctl[data-task=\"${t}\"] [data-rstate], tr[data-task=\"${t}\"] .rst`).textContent)", arg=task)
        self.srv.wait_state(task, ('running', 'waiting', 'starting'))
        self.page.wait_for_selector(f'.rctl[data-task="{task}"] button[data-ra="kill"]:not([disabled])')
        btn(self.page, 'kill', task, self.page.locator(f'.rctl[data-task="{task}"]').first).click()
        self.wait_state(task, 'tué')
        self.assertEqual(self.dialogs and 'Killer' in self.dialogs[0], True)
        self.assertEqual(self.srv.run(task)['state'], 'killed')

    def test_kill_refused_confirmation_keeps_run(self):
        task, sid = self.start()
        self.open()
        self.page.wait_for_selector(f'.rctl[data-task="{task}"]', timeout=15000)
        self.page.evaluate('window.confirm = () => false')
        btn(self.page, 'kill', task).click()
        self.page.wait_for_timeout(500)
        self.assertIn(self.srv.run(task)['state'], ('running', 'waiting', 'starting'))

    def test_error_409_toast(self):
        task, sid = self.start()
        self.open()
        self.page.wait_for_selector(f'.rctl[data-task="{task}"] button[data-ra="resume"]', timeout=15000)
        # la carte propose Reprendre désactivé ; on force un appel interdit via le gestionnaire
        self.page.evaluate("""t => { const b = document.querySelector(`button[data-ra="resume"][data-task="${t}"]`); b.disabled = false; b.click(); }""", task)
        self.page.wait_for_selector('.toast.sev-error', timeout=5000)

    def test_terminal_output_echo_and_resume(self):
        task, sid = self.start()
        self.open(query='debug=1')
        self.page.wait_for_selector(f'.rctl[data-task="{task}"]', timeout=15000)
        reqs = []
        self.page.on('request', lambda r: reqs.append(r.url) if '/tty' in r.url else None)
        btn(self.page, 'terminal', task).click()
        self.page.wait_for_selector('#ttyDlg[open][data-mode="pre"]')
        self.page.wait_for_function("document.querySelector('#ttyPre').textContent.includes('[fake-agent]')", timeout=10000)
        self.assertIn('data-task', self.page.inner_html('#ttyCtl'))
        self.assertTrue(self.page.inner_text('#ttyState').strip())
        self.page.fill('#ttyIn', 'bonjour-echo')
        self.page.press('#ttyIn', 'Enter')
        self.page.wait_for_function("document.querySelector('#ttyPre').textContent.includes('bonjour-echo')", timeout=10000)
        # coupure réseau simulée puis reprise depuis le dernier octet reçu
        before = len(reqs)
        self.page.evaluate('window.sttTty.ac.abort()')  # coupure du flux côté client
        for _ in range(60):
            if len(reqs) > before:
                break
            self.page.wait_for_timeout(100)
        self.page.wait_for_function('document.querySelector("#ttyConn").textContent === "connecté"', timeout=15000)
        self.assertGreater(len(reqs), before)
        m = re.search(r'since=(\d+)', reqs[-1])
        self.assertGreater(int(m.group(1)), 0)
        self.page.fill('#ttyIn', 'apres-reprise')
        self.page.press('#ttyIn', 'Enter')
        self.page.wait_for_function("document.querySelector('#ttyPre').textContent.includes('apres-reprise')", timeout=10000)
        txt = self.page.inner_text('#ttyPre')
        self.assertEqual(txt.count('[fake-agent]'), 1)  # pas de doublon après reprise
        # Échap dans le champ : le dialogue reste ouvert ; le bouton Fermer ferme sans arrêter le run
        self.page.press('#ttyIn', 'Escape')
        self.assertTrue(self.page.evaluate("document.querySelector('#ttyDlg').open"))
        self.page.click('#ttyClose')
        self.assertFalse(self.page.evaluate("document.querySelector('#ttyDlg').open"))
        self.assertIn(self.srv.run(task)['state'], ('running', 'waiting'))

    def test_terminal_pause_from_dialog_and_ctrl_alt_w(self):
        task, sid = self.start()
        self.open()
        self.page.wait_for_selector(f'.rctl[data-task="{task}"]', timeout=15000)
        btn(self.page, 'terminal', task).click()
        self.page.wait_for_selector('#ttyDlg[open]')
        btn(self.page, 'pause', task, self.page.locator('#ttyCtl')).click()
        self.page.wait_for_function("document.querySelector('#ttyState').textContent === 'en pause'", timeout=15000)
        self.assertEqual(self.srv.run(task)['state'], 'paused')
        self.page.keyboard.press('Control+Alt+w')
        self.assertFalse(self.page.evaluate("document.querySelector('#ttyDlg').open"))

    def test_terminal_xterm_when_cdn_available(self):
        task, sid = self.start()
        self.open(block_cdn=False)
        self.page.wait_for_selector(f'.rctl[data-task="{task}"]', timeout=15000)
        btn(self.page, 'terminal', task).click()
        self.page.wait_for_selector('#ttyDlg[open][data-mode]:not([data-mode=""])', timeout=15000)
        if self.page.get_attribute('#ttyDlg', 'data-mode') != 'xterm':
            self.skipTest('CDN injoignable : repli <pre> (couvert par ailleurs)')
        self.page.wait_for_function("document.querySelector('#ttyBody .xterm-rows').textContent.includes('[fake-agent]')", timeout=10000)
        self.page.keyboard.type('xt-echo\n')
        self.page.wait_for_function("document.querySelector('#ttyBody .xterm-rows').textContent.includes('xt-echo')", timeout=10000)
        self.page.keyboard.press('Escape')  # reste dans le terminal
        self.assertTrue(self.page.evaluate("document.querySelector('#ttyDlg').open"))

    def test_orphan_rules_only_kill(self):
        self.open()
        r = self.page.evaluate("""() => {
          const o = {task:'X', state:'orphan', controllable:false}, out = {};
          for (const [k, v] of Object.entries(window.sttRunRules(o))) out[k] = v;
          out.running = window.sttRunRules({state:'running', controllable:true});
          out.queued = window.sttRunRules({state:'queued', controllable:true});
          out.starting = window.sttRunRules({state:'starting', controllable:true});
          return out; }""")
        self.assertEqual([k for k in ('terminal', 'pause', 'resume', 'stop', 'kill', 'retry', 'cancel') if r[k]], ['kill'])
        self.assertTrue(r['orphan'])
        self.assertEqual([k for k, v in r['running'].items() if v is True and k != 'orphan'], ['terminal', 'pause', 'stop', 'kill'])
        self.assertEqual([k for k, v in r['queued'].items() if v is True], ['cancel'])
        self.assertEqual([k for k, v in r['starting'].items() if v is True], ['terminal', 'kill'])

    def forced_state(self, mutate):
        """Remplace le flux d'état : /api/state est servi modifié, /api/stream coupé."""
        def handle(route):
            resp = route.fetch()
            st = resp.json()
            mutate(st)
            route.fulfill(response=resp, body=json.dumps(st), content_type='application/json')
        self.page.route('**/api/state', handle)
        self.page.route('**/api/stream', lambda r: r.abort())

    def test_orphan_card_only_kill(self):
        task, sid = self.start()

        def orphan(st):
            for r in st['runner']['runs']:
                r['state'], r['controllable'] = 'orphan', False
        self.forced_state(orphan)
        self.open(live=False)
        self.view_cards()
        c = card(self.page, sid)
        c.wait_for(timeout=15000)
        self.assertIn('orphelin : kill seul', c.inner_text())
        for act in ('terminal', 'pause', 'resume', 'stop', 'retry'):
            self.assertTrue(btn(self.page, act, task, c).is_disabled(), act)
        self.assertTrue(btn(self.page, 'kill', task, c).is_enabled())

    def test_not_launched_by_server_is_observed(self):
        task, sid = self.start()

        def strip(st):
            st['runner']['runs'] = []
        self.forced_state(strip)
        self.open(live=False)
        self.view_cards()
        c = card(self.page, sid)
        c.wait_for(timeout=15000)
        self.assertIn('observé · non pilotable', c.inner_text())
        self.assertEqual(self.page.locator('button[data-ra]').count(), 0)
        self.assertNotIn('lancé par le serveur', c.inner_text().lower())

    def test_runner_disabled_hides_everything(self):
        self.open(srv=self.off)
        self.view_cards()
        self.page.wait_for_selector('#runnerOff:not([hidden])')
        self.assertIn('--runner', self.page.inner_text('#runnerOff'))
        self.assertEqual(self.page.locator('button[data-ra]').count(), 0)
        self.assertNotIn('non pilotable', self.page.inner_text('#agentGrid'))
        self.assertTrue(self.page.locator('#runnerQueue').is_hidden())

    def test_queue_section_and_cancel(self):
        # remplit le pool (profil dev : 3) puis met en file une tâche de plus
        t = [self.srv.create('SLEEP 0') for _ in range(3)]
        for x in t:
            self.srv.wait_state(x, ('running', 'waiting', 'starting'))
        q = self.srv.create('SLEEP 0')
        self.assertEqual(self.srv.run(q)['state'], 'queued')
        self.open()
        self.page.wait_for_selector('#runnerQueue:not([hidden])', timeout=15000)
        row = self.page.locator(f'#runnerQueue tr[data-task="{q}"]')
        self.assertIn('#', row.inner_text())
        btn(self.page, 'cancel', q, row).click()
        self.srv.wait_state(q, 'stopped')
        self.page.wait_for_selector(f'#runnerQueue tr[data-task="{q}"]', state='detached', timeout=15000)

    def test_light_theme(self):
        task, sid = self.start()
        self.open()
        self.page.click('[data-theme-set="light"]')
        self.page.wait_for_selector(f'.rctl[data-task="{task}"]', timeout=15000)
        btn(self.page, 'terminal', task).click()
        self.page.wait_for_selector('#ttyDlg[open]')
        bg = self.page.evaluate("getComputedStyle(document.querySelector('#ttyDlg')).backgroundColor")
        self.assertNotEqual(bg, 'rgb(15, 26, 48)')
        self.page.click('#ttyClose')


if __name__ == '__main__':
    unittest.main()
