"""
Tests du client stt_client.py (T3.2) : serveur de test réel (faux agent) pour submit/list/status/wait/kill/
input/exit/kanban-ops, et petit serveur HTTP factice pour report, la redétection du jeton, les en-têtes
envoyés et les cas de serveur qui disparaît. Aucun vrai `claude`.
"""

import contextlib
import http.client
import http.server
import io
import json
import os
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

import helpers  # noqa: E402,F401
import stt_client  # noqa: E402
from test_api import Server  # noqa: E402  (seule la classe de serveur de test est reprise)


def run(url, *argv, expect=None):
    out, err = io.StringIO(), io.StringIO()
    code = stt_client.main(["--url", url] + list(argv), out, err)
    if expect is not None:
        assert code == expect, (code, out.getvalue(), err.getvalue())
    return code, out.getvalue(), err.getvalue()


class Fake:
    """Serveur HTTP factice : routes {(méthode, chemin): (code, objet|texte)} ; enregistre les requêtes."""

    def __init__(self, token='tok-secret-123', page=True):
        self.token = token
        self.page = page
        self.routes = {}
        self.requests = []
        self.lock = threading.Lock()
        fake = self

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _serve(self, method):
                n = int(self.headers.get('Content-Length') or 0)
                body = self.rfile.read(n).decode('utf-8') if n else ''
                with fake.lock:
                    fake.requests.append({'method': method, 'path': self.path, 'headers': {k.lower(): v for k, v in self.headers.items()},
                                          'body': json.loads(body) if body else None})
                    token, page, route = fake.token, fake.page, fake.routes.get((method, self.path))
                if method == 'GET' and self.path == '/':
                    html = ('<html><head><meta name="stt-token" content="%s"></head></html>' % token) if page \
                        else '<html></html>'
                    return self._send(200, html, 'text/html')
                if self.headers.get('X-STT-Token') != token:
                    return self._send(403, '403', 'text/plain')
                if callable(route):
                    route = route()
                if route is None:
                    return self._send(404, '404', 'text/plain')
                code, obj = route
                if isinstance(obj, str):
                    return self._send(code, obj, 'text/plain')
                return self._send(code, json.dumps(obj), 'application/json')

            def _send(self, code, text, ctype):
                data = text.encode('utf-8')
                self.send_response(code)
                self.send_header('Content-Type', ctype)
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):
                self._serve('GET')

            def do_POST(self):
                self._serve('POST')

        self.httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H)
        self.port = self.httpd.server_address[1]
        self.url = 'http://127.0.0.1:%d' % self.port
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


REPORT = {'task': 'T9.2', 'state': 'done', 'exit': 0, 'session': 's', 'started': 1, 'ended': 2,
          'final_text': 'Rapport', 'usage': {'input_tokens': 1, 'output_tokens': 2,
                                             'cache_creation_input_tokens': 3, 'cache_read_input_tokens': 4,
                                             'total_tokens': 10},
          'duration_ms': 4321, 'tool_calls': 5, 'files_modified': ['a'], 'last_activity': 'x'}


class RealServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = Server(runner=True)
        cls.url = 'http://127.0.0.1:%d' % cls.s.port

    @classmethod
    def tearDownClass(cls):
        cls.s.close()

    def tearDown(self):
        self.s.end_all()

    def submit(self, prompt='SLEEP 0', *extra):
        code, out, err = run(self.url, 'submit', '--lot', 'T9', '--title', 'Client', '--agent', 'dev',
                             '--model', 'sonnet', '--cx', 'M', '--prompt', prompt, *extra, expect=0)
        return json.loads(out)

    def finish(self, tid):
        self.s.wait_state(tid, ('running', 'waiting'))
        self.s.call('POST', f'/api/runner/{tid}/input', {'data': '\x04'})

    def test_submit_list_status_wait(self):
        res = self.submit('SLEEP 0')
        self.finish(res['id'])
        self.assertEqual(set(res), {'id', 'budget', 'prompt', 'state'})
        self.assertTrue(res['id'].startswith('T9.'))
        self.assertEqual(res['state'], 'queued')
        code, out, _ = run(self.url, 'wait', res['id'], '--timeout', '30', '--interval', '0.2')
        self.assertEqual(code, 0, out)
        self.assertEqual(json.loads(out)['state'], 'done')
        _, out, _ = run(self.url, 'list', expect=0)
        row = next(r for r in json.loads(out) if r['task'] == res['id'])
        self.assertEqual(set(row), set(stt_client.LIST_KEYS))
        _, out, _ = run(self.url, 'status', res['id'], expect=0)
        self.assertEqual(json.loads(out)['task'], res['id'])
        self.assertEqual(out.count('\n'), 1)
        _, out, _ = run(self.url, '--pretty', 'status', res['id'], expect=0)
        self.assertGreater(out.count('\n'), 3)

    def test_no_autostart(self):
        res = self.submit('SLEEP 0', '--no-autostart')
        self.assertEqual(res['state'], 'todo')
        code, out, err = run(self.url, 'status', res['id'])
        self.assertEqual(code, 1)
        self.assertIn('404', err)

    def test_kill_input_exit(self):
        res = self.submit('SLEEP 60')
        self.s.wait_state(res['id'], ('running', 'waiting'))
        _, out, _ = run(self.url, 'input', res['id'], '--text', 'bonjour\\n', expect=0)
        self.assertTrue(json.loads(out)['ok'])
        _, out, _ = run(self.url, 'exit', res['id'], expect=0)
        self.assertTrue(json.loads(out)['ok'])
        t2 = self.submit('SLEEP 60')
        self.s.wait_state(t2['id'], ('running', 'waiting'))
        run(self.url, 'kill', t2['id'], expect=0)
        self.s.wait_state(t2['id'], ('killed', 'failed', 'stopped', 'done'))
        code, out, _ = run(self.url, 'wait', t2['id'], '--timeout', '10', '--interval', '0.2')
        self.assertEqual(code, 1)

    def test_conflict_and_unknown(self):
        res = self.submit('SLEEP 0')
        self.finish(res['id'])
        self.s.wait_state(res['id'], 'done')
        code, out, err = run(self.url, 'pause', res['id'])
        self.assertEqual(code, 1)
        self.assertIn('HTTP 409', err)
        self.assertNotIn('Traceback', err)
        code, out, err = run(self.url, 'kill', 'T9.999')
        self.assertEqual(code, 1)
        self.assertIn('HTTP 404', err)
        self.assertNotIn(self.s.token, out + err)

    def test_kanban_ops_dry_run(self):
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, 'ops.json')
            Path(f).write_text(json.dumps([{'op': 'task', 'id': 'T9.1', 'set': {'progress': 100}}]))
            def row():  # seule la ligne de T9.1 : l'ecrivain asynchrone peut encore ecrire l'etat d'un test precedent
                txt = Path(self.s.kanban).read_text(encoding='utf-8')
                return [l for l in txt.splitlines() if "T9.1" in l]
            time.sleep(0.5)
            before = row()
            code, out, err = run(self.url, 'kanban-ops', f, '--dry-run')
            self.assertEqual(code, 0, (out, err))
            self.assertTrue(json.loads(out).get('dry_run'))
            time.sleep(0.5)
            self.assertEqual(row(), before)
            leftovers = [n for n in os.listdir(os.path.dirname(self.s.kanban)) if n.endswith('.tmp')]
            self.assertEqual(leftovers, [])

    def test_kanban_ops_invalid_is_400(self):
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, 'ops.json')
            Path(f).write_text(json.dumps([{'op': 'inconnue'}]))
            code, out, err = run(self.url, 'kanban-ops', f, '--dry-run')
            self.assertEqual(code, 1)
            self.assertIn('HTTP 400', err)

    def test_submit_server_validation_400(self):
        code, out, err = run(self.url, 'submit', '--lot', 'ZZ', '--title', 'x', '--agent', 'dev', '--model', 'sonnet',
                             '--cx', 'M', '--prompt', 'x')
        self.assertEqual(code, 1)
        self.assertIn('HTTP 400', err)
        self.assertIn('lot inconnu', err)


class UsageTests(unittest.TestCase):
    URL = 'http://127.0.0.1:9'  # jamais atteint : l'usage est validé avant toute requête

    def test_non_loopback_refused(self):
        for u in ('http://example.com:8765', 'http://192.168.1.5:8765', 'https://127.0.0.1:8765',
                  'http://127.0.0.1.evil.com'):
            code, out, err = run(u, 'list')
            self.assertEqual(code, 2, u)
            self.assertIn('hôte refusé', err)

    def test_loopback_accepted_forms(self):
        for u in ('http://localhost:9', 'http://[::1]:9', 'http://127.0.0.1:9'):
            self.assertEqual(run(u, 'list')[0], 3, u)  # accepté, mais personne n'écoute

    def test_usage_errors(self):
        cases = [
            ['submit', '--lot', 'T9'],
            ['submit', '--lot', 'T9', '--title', 't', '--agent', 'cp', '--model', 'sonnet', '--cx', 'M', '--prompt', 'x'],
            ['submit', '--lot', 'T9', '--title', 't', '--agent', 'dev', '--model', 'sonnet', '--cx', 'M'],
            ['submit', '--lot', 'T9', '--title', 't', '--agent', 'dev', '--model', 'sonnet', '--cx', 'M',
             '--prompt', 'x', '--prompt-file', 'y'],
            ['submit', '--lot', 'T9', '--title', 't', '--agent', 'dev', '--model', 'sonnet', '--cx', 'M',
             '--prompt', 'x', '--docs', 'sansrole'],
            ['submit', '--lot', 'T9', '--title', 't', '--agent', 'dev', '--model', 'sonnet', '--cx', 'M',
             '--prompt-file', '/inexistant/p.md'],
            ['wait', 'T9.1', '--interval', '0'],
            ['kill', '../x'],
            ['bidon'],
            [],
            ['kanban-ops', '/inexistant.json'],
        ]
        for argv in cases:
            code, out, err = run(self.URL, *argv)
            self.assertEqual(code, 2, (argv, err))
            self.assertEqual(out, '')

    def test_prompt_file_too_big(self):
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, 'p.md')
            Path(f).write_bytes(b'a' * (200 * 1024 + 1))
            code, _, err = run(self.URL, 'submit', '--lot', 'T9', '--title', 't', '--agent', 'dev', '--model', 'sonnet',
                               '--cx', 'M', '--prompt-file', f)
            self.assertEqual(code, 2)
            self.assertIn('200 Ki', err)

    def test_env_url(self):
        old = os.environ.get('STT_AGENTS_URL')
        os.environ['STT_AGENTS_URL'] = 'http://example.com'
        try:
            out, err = io.StringIO(), io.StringIO()
            self.assertEqual(stt_client.main(['list'], out, err), 2)
        finally:
            if old is None:
                del os.environ['STT_AGENTS_URL']
            else:
                os.environ['STT_AGENTS_URL'] = old


class FakeServerTests(unittest.TestCase):
    def setUp(self):
        self.f = Fake()
        self.addCleanup(self.f.close)

    def check_clean(self, *texts):
        for t in texts:
            self.assertNotIn(self.f.token, t)

    def test_submit_request_content(self):
        self.f.routes[('POST', '/api/tasks')] = (200, {'ok': True, 'id': 'T9.2', 'budget': 80000, 'prompt': 'p.md'})
        with tempfile.TemporaryDirectory() as d:
            pf = os.path.join(d, 'p.md')
            Path(pf).write_text('Prompt é à\n', encoding='utf-8')
            code, out, err = run(self.f.url, 'submit', '--lot', 'T9', '--title', 'Tâche', '--agent', 'archi',
                                 '--model', 'opus', '--cx', 'XL', '--prompt-file', pf, '--prio', '1',
                                 '--worktree', 'w', '--base', 'b', '--perm', 'plan',
                                 '--docs', 'a/b.md:lu', 'c.md:modifié', 'd.md:créé')
        self.assertEqual(code, 0, err)
        req = [r for r in self.f.requests if r['method'] == 'POST'][0]
        b = req['body']
        self.assertIs(b['autostart'], True)
        self.assertIs(b['autoexit'], True)
        self.assertEqual((b['prio'], b['perm'], b['worktree'], b['base']), (1, 'plan', 'w', 'b'))
        self.assertEqual(b['prompt'], 'Prompt é à\n')
        self.assertEqual(b['docs'], [{'f': 'a/b.md', 'r': 'lu'}, {'f': 'c.md', 'r': 'modifié'},
                                     {'f': 'd.md', 'r': 'créé'}])
        self.assertEqual(req['headers']['x-stt-token'], self.f.token)
        self.assertEqual(req['headers']['origin'], self.f.url)
        self.assertEqual(json.loads(out), {'id': 'T9.2', 'budget': 80000, 'prompt': 'p.md', 'state': 'queued'})
        self.check_clean(out, err)

    def test_submit_no_flags(self):
        self.f.routes[('POST', '/api/tasks')] = (200, {'ok': True, 'id': 'T9.2', 'budget': 1, 'prompt': 'p'})
        run(self.f.url, 'submit', '--lot', 'T9', '--title', 't', '--agent', 'dev', '--model', 'haiku', '--cx', 'XS',
            '--prompt', 'x', '--no-autostart', '--no-autoexit', expect=0)
        b = [r for r in self.f.requests if r['method'] == 'POST'][0]['body']
        self.assertIs(b['autostart'], False)
        self.assertIs(b['autoexit'], False)

    def test_report_shape_and_kanban(self):
        self.f.routes[('GET', '/api/runner/T9.2/report')] = (200, REPORT)
        _, out, _ = run(self.f.url, 'report', 'T9.2', expect=0)
        self.assertEqual(json.loads(out), REPORT)
        _, out, _ = run(self.f.url, 'report', 'T9.2', '--kanban', expect=0)
        d = json.loads(out)
        self.assertEqual(d['kanban_add'], {'used': 10, 'ms': 4321})
        self.assertEqual(d['usage']['total_tokens'], 10)

    def test_report_404_and_403(self):
        code, out, err = run(self.f.url, 'report', 'T9.2')
        self.assertEqual(code, 1)
        self.assertIn('HTTP 404', err)
        self.f.routes[('GET', '/api/runner/T9.3/report')] = (403, 'interdit')
        code, out, err = run(self.f.url, 'report', 'T9.3')
        self.assertEqual(code, 1)
        self.assertIn('HTTP 403', err)
        self.assertNotIn('Traceback', err)
        self.check_clean(out, err)

    def test_token_redetection(self):
        self.f.routes[('GET', '/api/runner/T9.2/report')] = (200, REPORT)
        client = stt_client.Client(self.f.url)
        client.request('GET', '/api/runner/T9.2/report')
        self.f.token = 'nouveau-jeton-456'  # serveur relancé : l'ancien jeton est périmé
        res = client.request('GET', '/api/runner/T9.2/report')
        self.assertEqual(res['task'], 'T9.2')
        self.assertEqual(client.token, 'nouveau-jeton-456')

    def test_token_error_message_hides_token(self):
        client = stt_client.Client(self.f.url)
        client.token = self.f.token
        self.f.routes[('GET', '/api/x')] = (400, 'erreur contenant %s' % self.f.token)
        with self.assertRaises(stt_client.HttpFail) as cm:
            client.request('GET', '/api/x')
        self.assertNotIn(self.f.token, cm.exception.message)

    def test_token_not_found(self):
        self.f.page = False
        code, out, err = run(self.f.url, 'list')
        self.assertEqual(code, 3)
        self.assertIn('jeton introuvable', err)
        self.check_clean(out, err)

    def test_unreachable(self):
        self.f.close()
        code, out, err = run(self.f.url, 'list')
        self.assertEqual(code, 3)
        self.assertNotIn('Traceback', err)
        self.f.httpd = type('X', (), {'shutdown': lambda s: None, 'server_close': lambda s: None})()

    def test_wait_timeout(self):
        self.f.routes[('GET', '/api/runner')] = (200, {'runs': [{'task': 'T9.2', 'state': 'running'}]})
        t = time.time()
        code, out, err = run(self.f.url, 'wait', 'T9.2', '--timeout', '1', '--interval', '0.2')
        self.assertEqual(code, 4)
        self.assertLess(time.time() - t, 5)
        self.assertEqual(json.loads(out)['state'], 'running')

    def test_wait_until_and_codes(self):
        self.f.routes[('GET', '/api/runner')] = (200, {'runs': [{'task': 'T9.2', 'state': 'failed'}]})
        code, out, _ = run(self.f.url, 'wait', 'T9.2', '--timeout', '5', '--interval', '0.1')
        self.assertEqual((code, json.loads(out)['state']), (1, 'failed'))
        self.f.routes[('GET', '/api/runner')] = (200, {'runs': [{'task': 'T9.2', 'state': 'paused'}]})
        code, out, _ = run(self.f.url, 'wait', 'T9.2', '--until', 'paused', '--timeout', '5', '--interval', '0.1')
        self.assertEqual((code, json.loads(out)['state']), (1, 'paused'))

    def test_wait_server_disappears_and_returns(self):
        self.f.routes[('GET', '/api/runner')] = (200, {'runs': [{'task': 'T9.2', 'state': 'running'}]})
        port = self.f.port
        result = {}

        def waiter():
            result['r'] = run(self.f.url, 'wait', 'T9.2', '--timeout', '30', '--interval', '0.2')

        th = threading.Thread(target=waiter)
        th.start()
        time.sleep(0.6)
        old = self.f
        old.close()  # le serveur disparaît
        time.sleep(0.8)
        new = Fake.__new__(Fake)
        # relance sur le même port, nouveau jeton, run terminé
        saved = dict(token='jeton-apres-redemarrage', routes={('GET', '/api/runner'): (
            200, {'runs': [{'task': 'T9.2', 'state': 'done'}]})})
        for _ in range(50):
            try:
                new = Fake.__new__(Fake)
                self._restart(new, port, saved)
                break
            except OSError:
                time.sleep(0.1)
        self.addCleanup(new.close)
        th.join(40)
        self.assertFalse(th.is_alive())
        code, out, err = result['r']
        self.assertEqual(code, 0, err)
        self.assertEqual(json.loads(out)['state'], 'done')
        self.check_clean(out, err)

    @staticmethod
    def _restart(new, port, saved):
        """Reconstruit un Fake sur un port donné (même mécanique que Fake.__init__)."""
        class Bound(Fake):
            pass
        orig = http.server.ThreadingHTTPServer

        class Fixed(orig):
            def __init__(self, addr, handler):
                super().__init__(('127.0.0.1', port), handler)
        http.server.ThreadingHTTPServer = Fixed
        try:
            Fake.__init__(new, token=saved['token'])
        finally:
            http.server.ThreadingHTTPServer = orig
        new.routes.update(saved['routes'])

    def test_kanban_ops_headers_and_body(self):
        self.f.routes[('POST', '/api/kanban')] = (200, {'ok': True, 'dry_run': True})
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, 'o.json')
            Path(p).write_text('{"ops": [{"op": "x"}]}')
            run(self.f.url, 'kanban-ops', p, '--dry-run', expect=0)
        req = [r for r in self.f.requests if r['path'] == '/api/kanban'][0]
        self.assertEqual(req['headers']['x-stt-kanban'], '1')
        self.assertEqual(req['body'], {'ops': [{'op': 'x'}], 'dry_run': True})

    def test_input_escapes_and_exit(self):
        self.f.routes[('POST', '/api/runner/T9.2/input')] = (200, {'ok': True})
        run(self.f.url, 'input', 'T9.2', '--text', 'a\\nb\\tc\\r', expect=0)
        run(self.f.url, 'exit', 'T9.2', expect=0)
        bodies = [r['body'] for r in self.f.requests if r['path'].endswith('/input')]
        self.assertEqual(bodies, [{'data': 'a\nb\tc\r'}, {'data': '/exit\r'}])

    def test_emit_scrubs_server_output(self):
        self.f.routes[('GET', '/api/runner')] = (200, {'runs': [{'task': self.f.token, 'state': 'running'}]})
        code, out, err = run(self.f.url, 'list')
        self.assertEqual(code, 0, err)
        self.check_clean(out, err)
        self.assertIn('***', out)

    def test_help_sans_jeton(self):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code, out, err = run(self.f.url, '--help')
        self.assertEqual(code, 0)
        self.assertEqual(self.f.requests, [])     # aucune requête, donc aucune lecture du jeton

    def test_kanban_ops_trop_gros(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, 'o.json')
            Path(p).write_text(json.dumps([{'op': 'x', 'pad': 'a' * (1024 * 1024)}]))
            code, out, err = run(self.f.url, 'kanban-ops', p)
        self.assertEqual(code, 2)
        self.assertIn('1 Mio', err)
        self.assertEqual(self.f.requests, [])

    def test_prompt_en_caracteres(self):
        # 150 Ki caractères « é » = 300 Kio en octets : accepté (la limite du serveur est en caractères)
        self.f.routes[('POST', '/api/tasks')] = (200, {'ok': True, 'id': 'T9.2'})
        args = ('submit', '--lot', 'T9', '--title', 't', '--agent', 'dev', '--model', 'sonnet', '--cx', 'M')
        code, _, err = run(self.f.url, *args, '--prompt', 'é' * (150 * 1024))
        self.assertEqual(code, 0, err)
        code, _, err = run(self.f.url, *args, '--prompt', 'a' * (200 * 1024 + 1))
        self.assertEqual(code, 2)


class Raw:
    """Serveur factice à comportement libre : handler(self_http_handler, méthode) ; compte les requêtes."""

    def __init__(self, handler):
        self.requests = []
        raw = self

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _go(self, method):
                n = int(self.headers.get('Content-Length') or 0)
                if n:
                    self.rfile.read(n)
                raw.requests.append((method, self.path, self.headers.get('X-STT-Token')))
                handler(self, method, raw)

            def do_GET(self):
                self._go('GET')

            def do_POST(self):
                self._go('POST')

        self.httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H)
        self.url = 'http://127.0.0.1:%d' % self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


def send(h, code, body, ctype='application/json', extra=None):
    data = body.encode('utf-8')
    h.send_response(code)
    h.send_header('Content-Type', ctype)
    h.send_header('Content-Length', str(len(data)))
    for k, v in (extra or {}).items():
        h.send_header(k, v)
    h.end_headers()
    h.wfile.write(data)


PAGE = '<meta name="stt-token" content="tok-abc">'


class HardeningTests(unittest.TestCase):
    def test_redirection_refusee_sans_fuite_du_jeton(self):
        other = Raw(lambda h, m, r: send(h, 200, '{"runs": []}'))
        main = Raw(lambda h, m, r: send(h, 200, PAGE, 'text/html') if h.path == '/'
                   else send(h, 302, '', 'text/plain', {'Location': other.url + '/api/runner'}))
        self.addCleanup(main.close)
        self.addCleanup(other.close)
        code, out, err = run(main.url, 'list')
        self.assertEqual(code, 3)
        self.assertIn('redirection', err)
        self.assertEqual(other.requests, [])       # rien n'est parti vers l'autre hôte (ni jeton)
        self.assertNotIn('tok-abc', out + err)

    def test_proxy_ignore(self):
        main = Raw(lambda h, m, r: send(h, 200, PAGE, 'text/html') if h.path == '/' else send(h, 200, '{"runs": []}'))
        proxy = Raw(lambda h, m, r: send(h, 200, '{"runs": ["proxy"]}'))
        self.addCleanup(main.close)
        self.addCleanup(proxy.close)
        old = os.environ.get('http_proxy')
        os.environ['http_proxy'] = proxy.url
        try:
            code, out, err = run(main.url, 'list')
        finally:
            if old is None:
                del os.environ['http_proxy']
            else:
                os.environ['http_proxy'] = old
        self.assertEqual(code, 0, err)
        self.assertEqual(proxy.requests, [])

    def test_403_une_seule_relecture_du_jeton(self):
        main = Raw(lambda h, m, r: send(h, 200, PAGE, 'text/html') if h.path == '/' else send(h, 403, 'non', 'text/plain'))
        self.addCleanup(main.close)
        code, out, err = run(main.url, 'list')
        self.assertEqual(code, 1)
        self.assertIn('HTTP 403', err)
        self.assertEqual([q for q in main.requests if q[1] == '/'].__len__(), 2)   # lecture initiale + UNE relecture
        self.assertEqual(len([q for q in main.requests if q[1] != '/']), 2)

    @staticmethod
    def cut(h):
        """Annonce 100 octets, en envoie 10 puis coupe la connexion."""
        h.send_response(200)
        h.send_header('Content-Type', 'application/json')
        h.send_header('Content-Length', '100')
        h.end_headers()
        h.wfile.write(b'{"runs": [')
        h.wfile.flush()
        h.close_connection = True

    def test_reponse_coupee_code_3(self):
        main = Raw(lambda h, m, r: send(h, 200, PAGE, 'text/html') if h.path == '/' else self.cut(h))
        self.addCleanup(main.close)
        code, out, err = run(main.url, 'list')
        self.assertEqual(code, 3)
        self.assertNotIn('Traceback', err)

    def test_wait_reessaie_apres_coupure(self):
        def handler(h, m, r):
            if h.path == '/':
                return send(h, 200, PAGE, 'text/html')
            n = len([q for q in r.requests if q[1] != '/'])
            if n <= 2:
                return self.cut(h)
            send(h, 200, json.dumps({'runs': [{'task': 'T9.2', 'state': 'done'}]}))
        main = Raw(handler)
        self.addCleanup(main.close)
        code, out, err = run(main.url, 'wait', 'T9.2', '--timeout', '15', '--interval', '0.2')
        self.assertEqual(code, 0, err)
        self.assertEqual(json.loads(out)['state'], 'done')


if __name__ == '__main__':
    unittest.main()
