"""Tests de sécurité du serveur stt-agents (T1.3) : jeton, Origin, en-têtes, clés réservées."""

import http.client
import json
import re
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import helpers

ROOT = Path(__file__).resolve().parents[4]
SERVER = ROOT / 'demos' / 'space-travel' / 'stt-agents' / 'stt_agents_server.py'


def raw(port, method, path, headers=None, body=None):
    c = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
    c.request(method, path, body=body, headers=headers or {})
    r = c.getresponse()
    data = r.read().decode('utf-8', errors='replace')
    out = (r.status, data, r)
    c.close()
    return out


class SecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._cm = helpers.test_server(str(ROOT))
        cls.srv = cls._cm.__enter__()
        cls.port = cls.srv['port']
        _, html, _ = raw(cls.port, 'GET', '/')
        m = re.search(r'<meta name="stt-token" content="([^"]+)">', html)
        assert m, 'jeton absent du HTML servi'
        cls.token = m.group(1)
        cls.html = html

    @classmethod
    def tearDownClass(cls):
        cls._cm.__exit__(None, None, None)

    def good(self, **over):
        h = {'X-STT-Token': self.token, 'Origin': f'http://127.0.0.1:{self.port}'}
        h.update(over)
        return {k: v for k, v in h.items() if v is not None}

    def check(self, headers):
        return raw(self.port, 'POST', '/api/runner/check', headers, b'{}')[0]

    def test_ok(self):
        self.assertEqual(self.check(self.good()), 200)
        self.assertEqual(self.check(self.good(Origin=f'http://localhost:{self.port}')), 200)
        self.assertEqual(self.check(self.good(**{'Sec-Fetch-Site': 'same-origin'})), 200)

    def test_sans_jeton(self):
        self.assertEqual(self.check(self.good(**{'X-STT-Token': None})), 403)

    def test_mauvais_jeton(self):
        self.assertEqual(self.check(self.good(**{'X-STT-Token': 'x' * 43})), 403)

    def test_mauvaise_origin(self):
        self.assertEqual(self.check(self.good(Origin='http://evil.example')), 403)
        self.assertEqual(self.check(self.good(Origin=f'http://127.0.0.1:{self.port + 1}')), 403)

    def test_origin_absente(self):
        self.assertEqual(self.check(self.good(Origin=None)), 403)

    def test_host_etranger(self):
        self.assertEqual(self.check(self.good(Host='evil.example')), 403)

    def test_sec_fetch_cross_site(self):
        self.assertEqual(self.check(self.good(**{'Sec-Fetch-Site': 'cross-site'})), 403)

    def test_403_sans_detail(self):
        _, body, _ = raw(self.port, 'POST', '/api/runner/check', {}, b'{}')
        self.assertEqual(body, '403')

    def test_jeton_dans_html_et_pas_ailleurs(self):
        self.assertGreaterEqual(len(self.token), 40)
        _, kb, _ = raw(self.port, 'GET', '/kanban/?embed=board')
        self.assertIn(f'content="{self.token}"', kb)
        _, state, _ = raw(self.port, 'GET', '/api/state')
        self.assertNotIn(self.token, state)
        _, cfg, _ = raw(self.port, 'GET', '/kanban/config.js')
        self.assertNotIn(self.token, cfg)
        self.assertNotIn(self.token, self.srv['url'])

    def test_en_tetes_html(self):
        for path in ('/', '/kanban/?embed=board'):
            st, _, r = raw(self.port, 'GET', path)
            self.assertEqual(st, 200)
            csp = r.getheader('Content-Security-Policy')
            for d in ("frame-ancestors 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'",
                      "connect-src 'self' https://api.github.com"):
                self.assertIn(d, csp)
            self.assertEqual(r.getheader('Referrer-Policy'), 'no-referrer')

    def test_kanban_iframe(self):
        st, body, _ = raw(self.port, 'GET', '/kanban/?embed=board')
        self.assertEqual(st, 200)
        self.assertIn('stt-token', body)
        self.assertIn('/kanban/', self.html)  # index.html embarque le Kanban

    def test_cles_reservees(self):
        h = {'X-STT-Kanban': '1', 'Content-Type': 'application/json'}
        cases = [
            {'op': 'task', 'id': 'T1.3', 'set': {'runner': 'x'}},
            {'op': 'task', 'id': 'T1.3', 'set': {'session': 'x'}},
            {'op': 'task', 'id': 'T1.3', 'add': {'started': 1}},
            {'op': 'task', 'id': 'T1.3', 'unset': ['runState']},
            {'op': 'task', 'id': 'T1.3', 'set': {'ended': 'x'}},
            {'op': 'task', 'id': 'T1.3', 'set': {'runner': 'x', 'inst': 'a'}},
            {'op': 'task_add', 'task': {'id': 'ZZ.1', 'lot': 'T1', 'runner': 'x'}},
        ]
        for op in cases:
            st, body, _ = raw(self.port, 'POST', '/api/kanban', h, json.dumps({'ops': [op], 'dry_run': True}))
            self.assertEqual(st, 400, op)
            self.assertIn('réservées', json.loads(body)['error'])


class ConsoleTests(unittest.TestCase):
    def test_jeton_une_seule_fois_dans_la_console(self):
        with helpers.test_server(str(ROOT)) as srv:
            _, html, _ = raw(srv['port'], 'GET', '/')
            token = re.search(r'name="stt-token" content="([^"]+)"', html).group(1)
            raw(srv['port'], 'GET', '/api/state')
            proc = srv['process']
            proc.terminate()
            out, err = proc.communicate(timeout=5)
        self.assertEqual(out.decode('utf-8', 'replace').count(token), 1)
        self.assertNotIn(token, err.decode('utf-8', 'replace'))


class RunnerFlagTests(unittest.TestCase):
    def test_runner_refuse_hors_boucle(self):
        r = subprocess.run([sys.executable, str(SERVER), '--no-github', '--runner', '--host', '0.0.0.0',
                            '--port', str(helpers.find_free_port())],
                           capture_output=True, text=True, timeout=20)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('--runner refusé', r.stderr)


if __name__ == '__main__':
    unittest.main()
