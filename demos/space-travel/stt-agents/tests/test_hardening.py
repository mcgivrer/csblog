"""Tests des corrections de la revue de securite du lanceur (T1.8) : B1, I1, I2, I3, I5, M2, M4."""

import http.client
import json
import os
import shutil
import signal
import stat
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

import helpers  # noqa: E402
import stt_agents_server  # noqa: E402
import stt_runner  # noqa: E402
from test_api import Server, read_sse  # noqa: E402

SECRETS = {
    'CLAUDECODE': '1', 'CLAUDE_CODE_MESSAGING_TOKEN': 'sekret', 'CLAUDE_CODE_SESSION_ID': 'abc',
    'CLAUDE_CODE_CHILD_SESSION': '1', 'CLAUDE_CODE_MESSAGING_SOCKET': '/tmp/x', 'CLAUDE_CODE_AUTRE': 'x',
    'CLAUDE_PID': '42', 'CLAUDE_JOB_DIR': '/tmp/j', 'CLAUDE_EFFORT': 'high',
}


def wait_file(path, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        if os.path.isfile(path) and os.path.getsize(path) > 0:
            time.sleep(0.1)
            return Path(path).read_text()
        time.sleep(0.1)
    raise AssertionError('fichier absent : ' + path)


def pid_alive(pid):
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    try:
        with open('/proc/%d/stat' % pid) as f:
            return f.read().rsplit(')', 1)[1].split()[0] != 'Z'
    except OSError:
        return False


class EnvTests(unittest.TestCase):
    def test_agent_environment_unit(self):
        env = stt_runner.agent_environment(dict(SECRETS, PATH='/bin', HOME='/h', CLAUDE_CONFIG_DIR='/c',
                                                ANTHROPIC_API_KEY='k'))
        self.assertEqual(sorted(env), ['ANTHROPIC_API_KEY', 'CLAUDE_CONFIG_DIR', 'HOME', 'PATH'])

    def test_serveur_ne_transmet_pas_les_secrets(self):
        with mock.patch.dict(os.environ, SECRETS):
            s = Server(runner=True)
        try:
            out = os.path.join(s.tmp, 'env.json')
            tid = s.create('ENV ' + out)
            env = json.loads(wait_file(out))
            for k in SECRETS:
                self.assertNotIn(k, env)
            for k in ('CLAUDE_CONFIG_DIR', 'PATH', 'HOME'):
                self.assertIn(k, env)
            s.call('POST', f'/api/runner/{tid}/kill', {})
        finally:
            s.end_all()
            s.close()


class TerminalTests(unittest.TestCase):
    def test_terminal_de_controle(self):
        s = Server(runner=True)
        try:
            out = os.path.join(s.tmp, 'tty.json')
            s.create('TTY ' + out)
            info = json.loads(wait_file(out))
            self.assertTrue(info['ttyname'] and info['ttyname'].startswith('/dev/pts/'), info)
            self.assertTrue(info['devtty'], info)
            self.assertTrue(info['pgrp_is_fg'], info)
        finally:
            s.end_all()
            s.close()

    def test_mort_du_serveur_envoie_sighup(self):
        s = Server(runner=True)
        try:
            out = os.path.join(s.tmp, 'hup.txt')
            tid = s.create('HUP ' + out)
            run = s.wait_state(tid, 'running')
            pid = run['pid']
            time.sleep(0.8)  # le faux agent installe son gestionnaire avant sa banniere
            os.kill(s.proc.pid, signal.SIGKILL)
            self.assertEqual(wait_file(out), 'SIGHUP')
            end = time.time() + 10
            while pid_alive(pid) and time.time() < end:
                time.sleep(0.1)
            self.assertFalse(pid_alive(pid))
        finally:
            s.close()

    def test_sighup_serveur_arret_propre(self):
        s = Server(runner=True)
        try:
            tid = s.create('SLEEP 0')
            pid = s.wait_state(tid, 'running')['pid']
            os.kill(s.proc.pid, signal.SIGHUP)
            self.assertIsNotNone(s.proc.wait(timeout=20))
            end = time.time() + 10
            while pid_alive(pid) and time.time() < end:
                time.sleep(0.1)
            self.assertFalse(pid_alive(pid))
        finally:
            s.close()


class DocTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = Server(runner=False)
        r = Path(cls.s.repo)
        for rel in ('.claude/stt-runner/state.json', '.claude/stt-runner/T1.1.log', '.claude/projects/p/a.md',
                    '.claude/worktrees/w/a.md', '.claude/agents/stt-cp.md', '.claude/agents/sub/x.md',
                    '.claude/agents/x.json', 'docs/a.md', 'a/.claude/agents/b.md'):
            (r / rel).parent.mkdir(parents=True, exist_ok=True)
            (r / rel).write_text('x')

    @classmethod
    def tearDownClass(cls):
        cls.s.close()

    def get(self, rel):
        return self.s.raw('GET', '/kanban/doc/' + rel)[0]

    def test_refus_claude(self):
        for rel in ('.claude/stt-runner/state.json', '.claude/stt-runner/T1.1.log', '.claude/projects/p/a.md',
                    '.claude/worktrees/w/a.md', '.claude/agents/sub/x.md', '.claude/agents/x.json',
                    '.claude/agents', 'a/.claude/agents/b.md', '%2eclaude/stt-runner/state.json'):
            self.assertEqual(self.get(rel), 404, rel)

    def test_acces_permis(self):
        self.assertEqual(self.get('.claude/agents/stt-cp.md'), 200)
        self.assertEqual(self.get('docs/a.md'), 200)

    def test_traversee(self):
        self.assertEqual(self.get('../../etc/passwd'), 404)
        self.assertEqual(self.get('docs/../.claude/stt-runner/state.json'), 404)

    def test_find_doc_racines_worktree(self):
        # une racine de worktree est resolue cote serveur meme si elle contient .claude
        with mock.patch.object(stt_agents_server, 'KANBAN_DOC_ROOTS', ['.claude/worktrees/w/', '']):
            f, root = stt_agents_server.find_doc(self.s.repo, 'a.md')
        self.assertEqual(root, '.claude/worktrees/w/')


class PermissionTests(unittest.TestCase):
    def test_droits_fichiers_et_dossier(self):
        tmp = tempfile.mkdtemp(prefix='stt-perm-')
        root = os.path.join(tmp, 'root')
        sd = os.path.join(root, '.claude', 'stt-runner')
        os.makedirs(sd, mode=0o755)  # existant et trop ouvert
        os.makedirs(os.path.join(root, '.claude', 'worktrees', 'stt-L2a'))
        old = os.umask(0o022)
        try:
            r = stt_runner.Runner(sd, root, command=[sys.executable, str(HERE / 'fake_agent.py')]
                                  + stt_runner.RUNNER_COMMAND[1:], stop_grace_s=0.3,
                                  env={'CLAUDE_CONFIG_DIR': os.path.join(tmp, 'cfg')})
            r.enqueue('L2a.1')
            end = time.time() + 10
            while time.time() < end and b'[fake-agent]' not in r.read_output('L2a.1')[1]:
                r.tick()
                time.sleep(0.05)
            r.kill('L2a.1')

            def mode(p):
                return stat.S_IMODE(os.stat(p).st_mode)
            self.assertEqual(mode(sd), 0o700)
            self.assertEqual(mode(os.path.join(sd, 'state.json')), 0o600)
            self.assertEqual(mode(os.path.join(sd, 'L2a.1.log')), 0o600)
            r.shutdown()
        finally:
            os.umask(old)
            shutil.rmtree(tmp, ignore_errors=True)


class EnqueueTests(unittest.TestCase):
    def test_tache_inconnue_sans_prompt_409(self):
        s = Server(runner=True)
        try:
            h = {'X-STT-Kanban': '1', 'Content-Type': 'application/json'}
            op = {'op': 'task_add', 'task': {'id': 'T9.77', 'lot': 'T9', 'title': 'Injectee', 'agent': 'dev',
                                             'model': 'sonnet', 'status': 'todo', 'progress': 0, 'budget': 1000}}
            st, body = s.raw('POST', '/api/kanban', json.dumps({'ops': [op]}), h)
            self.assertEqual(st, 200, body)
            st, out = s.call('POST', '/api/runner/T9.77/enqueue', {})
            self.assertEqual(st, 409, out)
            self.assertIn('prompt', out['error'])
            self.assertIsNone(s.run('T9.77'))
            tid = s.create('SLEEP 0', autostart=False)
            st, out = s.call('POST', f'/api/runner/{tid}/enqueue', {})
            self.assertEqual((st, out['ok']), (200, True))
        finally:
            s.end_all()
            s.close()


class CspTests(unittest.TestCase):
    def test_csp(self):
        s = Server(runner=False)
        try:
            for path in ('/', '/kanban/?embed=board'):
                c = http.client.HTTPConnection('127.0.0.1', s.port, timeout=5)
                c.request('GET', path)
                r = c.getresponse()
                csp = r.getheader('Content-Security-Policy')
                r.read()
                c.close()
                for d in ("frame-ancestors 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'",
                          "connect-src 'self' https://api.github.com"):
                    self.assertIn(d, csp)
                for d in ('script-src', 'style-src', 'default-src'):
                    self.assertNotIn(d, csp)
        finally:
            s.close()


class TtyCapTests(unittest.TestCase):
    def test_plafond_4_flux(self):
        s = Server(runner=True)
        try:
            tid = s.create('SLEEP 0')
            s.wait_state(tid, 'running')
            h = {'X-STT-Token': s.token, 'Origin': f'http://127.0.0.1:{s.port}'}

            def open_tty():
                c = http.client.HTTPConnection('127.0.0.1', s.port, timeout=10)
                c.request('GET', f'/api/runner/{tid}/tty?since=0', headers=h)
                return c, c.getresponse()

            conns = []
            for _ in range(4):
                c, r = open_tty()
                self.assertEqual(r.status, 200)
                read_sse(r, lambda e: len(e) > 0)
                conns.append(c)
            c5, r5 = open_tty()
            self.assertEqual(r5.status, 429)
            self.assertIn('flux', r5.read().decode())
            c5.close()
            conns.pop().close()  # fermeture d'un client : le compteur est libere
            end, ok = time.time() + 10, False
            while time.time() < end and not ok:
                c, r = open_tty()
                if r.status == 200:
                    ok = True
                    conns.append(c)
                else:
                    r.read()
                    c.close()
                    time.sleep(0.2)
            self.assertTrue(ok, 'compteur non libere apres fermeture du client')
            for c in conns:
                c.close()
        finally:
            s.end_all()
            s.close()


if __name__ == '__main__':
    unittest.main()
