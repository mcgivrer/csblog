"""
Tests des routes du lanceur (T1.4) : /api/runner, /api/tasks, ordonnanceur, ecriture Kanban,
flux tty. Serveur reel lance en sous-processus sur un depot git temporaire et une copie
temporaire de plan-status.js ; l'agent est le faux agent (aucun vrai `claude`).
"""

import base64
import http.client
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import types
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

import helpers  # noqa: E402

SERVER = HERE.parent / 'stt_agents_server.py'
FAKE = str(HERE / 'fake_agent.py')

PLAN = '''window.PLAN = {
  updated: "2026-10-07 00:00",
  spec: "test",
  currentLot: "T9",
  scale: { XS:{tokens:20000,minutes:2}, S:{tokens:40000,minutes:4}, M:{tokens:80000,minutes:8}, L:{tokens:150000,minutes:15}, XL:{tokens:300000,minutes:30} },
  history: [ { at:"2026-10-05 00:53", est:7000000, used:1320000 } ],

  lots: [
    { id: "T9", title: "Lot de test", status: "doing", budget: 100000, est0: 100000, cx: "L" },
    { id: "T8", title: "Autre lot", status: "todo", budget: 100000, est0: 100000, cx: "L" }
  ],
  tasks: [
    { id: "T9.1", lot: "T9", title: "Existante", agent: "dev", model: "sonnet", status: "done", progress: 100, budget: 40000, note: "Note du CP" },
    { id: "T9.P", lot: "T9", title: "Pilotage", agent: "cp", model: "sonnet", status: "doing", progress: 10, budget: 40000 }
  ],
  decisions: [
    { n: 1, subject: "Test", status: "acquise" }
  ],
  journal: [
    { at: "2026-10-07", text: "Debut" }
  ]
};
'''

# Enveloppe : relit le prompt de la tache dans data/prompts/<tache>.md (le faux agent obeit au texte),
# puis execv le faux agent. Pas d'accolades (la commande est substituee par le lanceur).
WRAPPER = '''
import os, sys
pd, task, fake = sys.argv[1], sys.argv[2], sys.argv[3]
args = sys.argv[4:]
prompt = ""
if args and args[-1].startswith("Ex"):
    open(os.path.join(pd, task + ".argv"), "w", encoding="utf-8").write(args[-1])
    args = args[:-1]
    try:
        prompt = open(os.path.join(pd, task + ".md"), encoding="utf-8").read()
    except OSError:
        pass
os.execv(sys.executable, [sys.executable, fake] + args + ([prompt] if prompt else []))
'''


def git(*a, cwd):
    subprocess.run(['git', *a], cwd=cwd, check=True, capture_output=True)


class Server:
    """Un serveur stt-agents sur depot temporaire."""

    def __init__(self, runner=True):
        self.tmp = tempfile.mkdtemp(prefix='stt-api-test-')
        self.repo = os.path.join(self.tmp, 'repo')
        os.makedirs(self.repo)
        git('init', '-q', '-b', 'main', cwd=self.repo)
        git('config', 'user.email', 't@t', cwd=self.repo)
        git('config', 'user.name', 't', cwd=self.repo)
        Path(self.repo, 'README').write_text('x')
        git('add', 'README', cwd=self.repo)
        git('commit', '-q', '-m', 'init', cwd=self.repo)
        self.data = os.path.join(self.tmp, 'data')
        os.makedirs(self.data)
        self.kanban = os.path.join(self.data, 'plan-status.js')
        Path(self.kanban).write_text(PLAN, encoding='utf-8')
        self.prompts = os.path.join(self.data, 'prompts')
        self.cfg = os.path.join(self.tmp, 'claude-config')
        os.makedirs(self.cfg)
        self.port = helpers.find_free_port()
        cmd = [sys.executable, str(SERVER), '--no-github', '--port', str(self.port), '--repo', self.repo,
               '--kanban', self.kanban, '--claude-dir', self.cfg, '--match', 'stt-api-test']
        if runner:
            fake_cmd = [sys.executable, '-c', WRAPPER, self.prompts, '{task}', FAKE,
                        '--agent', 'stt-{agent}', '--model', '{model}', '--session-id', '{session}',
                        '--permission-mode', '{perm}', '-n', '{task}', '{prompt}']
            helpers.assert_not_real_claude(fake_cmd)
            cmd += ['--runner', '--runner-cmd', json.dumps(fake_cmd)]
        env = dict(os.environ, CLAUDE_CONFIG_DIR=self.cfg)
        self.proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, cwd=self.repo)
        for _ in range(100):
            try:
                st, html = self.raw('GET', '/')
                if st == 200:
                    break
            except Exception:
                pass
            time.sleep(0.1)
        self.token = re.search(r'name="stt-token" content="([^"]+)"', html).group(1)

    def raw(self, method, path, body=None, headers=None):
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10)
        c.request(method, path, body=body, headers=headers or {})
        r = c.getresponse()
        data = r.read().decode('utf-8', 'replace')
        c.close()
        return r.status, data

    def call(self, method, path, body=None, token=True, origin=True, headers=None):
        h = {'Content-Type': 'application/json'}
        if token:
            h['X-STT-Token'] = self.token if token is True else token
        if origin:
            h['Origin'] = f'http://127.0.0.1:{self.port}' if origin is True else origin
        h.update(headers or {})
        data = None if body is None else (body if isinstance(body, (str, bytes)) else json.dumps(body))
        st, txt = self.raw(method, path, data, h)
        try:
            return st, json.loads(txt)
        except ValueError:
            return st, txt

    def runner(self):
        return self.call('GET', '/api/runner', token=False, origin=False)[1]

    def run(self, task):
        return next((r for r in self.runner().get('runs', []) if r['task'] == task), None)

    def wait_state(self, task, states, timeout=15):
        states = (states,) if isinstance(states, str) else states
        end = time.time() + timeout
        last = None
        while time.time() < end:
            r = self.run(task)
            last = r and r['state']
            if last in states:
                return r
            time.sleep(0.1)
        raise AssertionError(f'{task}: etat {last!r}, attendu {states} ({self.stderr_tail()})')

    def stderr_tail(self):
        return ''

    def plan_row(self, tid):
        code = ("global.window={};require(process.argv[1]);"
                "console.log(JSON.stringify(window.PLAN.tasks.find(t=>t.id===process.argv[2])||null))")
        out = subprocess.run(['node', '-e', code, self.kanban, tid], capture_output=True, text=True).stdout
        return json.loads(out)

    def wait_row(self, tid, cond, timeout=15):
        end = time.time() + timeout
        row = None
        while time.time() < end:
            row = self.plan_row(tid)
            if row and cond(row):
                return row
            time.sleep(0.2)
        raise AssertionError(f'{tid}: ligne Kanban inattendue : {row}')

    def wait_notice(self, kind, tid, timeout=10):
        end = time.time() + timeout
        while time.time() < end:
            _, state = self.call('GET', '/api/state', token=False, origin=False)
            for n in state['notices']:
                if n['kind'] == kind and n['target']['id'] == tid:
                    return n
            time.sleep(0.3)
        raise AssertionError(f'notice {kind} absente pour {tid}')

    def create(self, prompt='SLEEP 0', autostart=True, **kw):
        body = dict(lot='T9', title='Tache de test', agent='dev', model='sonnet', cx='M', prompt=prompt,
                    autostart=autostart)
        body.update(kw)
        st, out = self.call('POST', '/api/tasks', body)
        assert st == 200, (st, out)
        return out['id']

    def end_all(self):
        """Tue les runs vivants et attend leur fin."""
        for r in self.runner().get('runs', []):
            if r['state'] in ('queued',):
                self.call('POST', f"/api/runner/{r['task']}/cancel", {})
            elif r['state'] in ('starting', 'running', 'waiting', 'paused', 'stopping', 'orphan'):
                self.call('POST', f"/api/runner/{r['task']}/kill", {})
        end = time.time() + 15
        while time.time() < end:
            if not any(r['state'] in ('queued', 'starting', 'running', 'waiting', 'paused', 'stopping')
                       for r in self.runner().get('runs', [])):
                return
            time.sleep(0.1)

    def close(self):
        self.proc.terminate()
        try:
            self.proc.wait(timeout=20)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            self.proc.wait()
        for s in (self.proc.stdout, self.proc.stderr):
            if s:
                s.close()
        shutil.rmtree(self.tmp, ignore_errors=True)


def read_sse(conn_resp, until, timeout=10):
    """Lit un flux SSE jusqu'a until(events) vrai ; retourne la liste [(event, data)]."""
    events, ev, end = [], None, time.time() + timeout
    conn_resp.fp.raw._sock.settimeout(1.0)
    while time.time() < end and not until(events):
        try:
            line = conn_resp.fp.readline()
        except (TimeoutError, OSError):
            continue
        if not line:
            break
        line = line.decode('utf-8').rstrip('\n')
        if line.startswith('event: '):
            ev = line[7:]
        elif line.startswith('data: ') and ev:
            events.append((ev, json.loads(line[6:])))
    return events


def decode(events):
    return b''.join(base64.b64decode(d['b64']) for e, d in events if e == 'out')


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = Server(runner=True)

    @classmethod
    def tearDownClass(cls):
        cls.s.close()

    def tearDown(self):
        self.s.end_all()

    # -- creation ----------------------------------------------------------------
    def test_creation_id_budget_prompt(self):
        s = self.s
        tid = s.create('Fais le test\n', autostart=False, cx='M')
        n = int(tid.split('.')[1])
        self.assertGreaterEqual(n, 2)  # T9.1 existe deja ; T9.P n'est pas numerique
        row = s.plan_row(tid)
        self.assertEqual(row['status'], 'todo')
        self.assertEqual(row['budget'], 80000)  # PLAN.scale.M.tokens
        self.assertEqual(row['est0'], 80000)
        self.assertEqual(row['prompt'], f'stt-agents/data/prompts/{tid}.md')
        self.assertEqual(row['agent'], 'dev')
        self.assertNotIn('runner', row)
        self.assertEqual(Path(s.prompts, tid + '.md').read_text(encoding='utf-8'), 'Fais le test\n')
        tid2 = s.create(autostart=False, cx='XS')
        self.assertEqual(int(tid2.split('.')[1]), n + 1)
        self.assertEqual(s.plan_row(tid2)['budget'], 20000)
        self.assertIsNone(s.run(tid))  # sans autostart : rien dans le lanceur
        # note du CP des autres lignes intacte
        self.assertEqual(s.plan_row('T9.1')['note'], 'Note du CP')

    def test_validation_400(self):
        s = self.s
        base = dict(lot='T9', title='t', agent='dev', model='sonnet', cx='M', prompt='p', autostart=False)
        bad = [dict(agent='cp'), dict(agent='x'), dict(model='Sonnet;rm'), dict(model='-x'), dict(cx='XXL'),
               dict(perm='bypassPermissions'), dict(perm='auto'), dict(perm='nimporte'), dict(prio=7), dict(prio='1'),
               dict(lot='ZZ'), dict(lot='../x'), dict(worktree='/etc'), dict(worktree='.claude/worktrees/../../x'),
               dict(worktree='autre/chose'), dict(title=''), dict(prompt=''), dict(autostart='oui'),
               dict(docs=[{'f': '../x', 'r': 'lu'}]), dict(agent=['dev'])]
        before = os.listdir(s.prompts) if os.path.isdir(s.prompts) else []
        for over in bad:
            b = dict(base)
            b.update(over)
            st, out = s.call('POST', '/api/tasks', b)
            self.assertEqual(st, 400, over)
        st, _ = s.call('POST', '/api/tasks', 'pas du json')
        self.assertEqual(st, 400)
        st, _ = s.call('POST', '/api/tasks', 'x' * (512 * 1024 + 10))
        self.assertEqual(st, 413)
        self.assertEqual(os.listdir(s.prompts) if os.path.isdir(s.prompts) else [], before)

    def test_refus_sans_jeton_ou_origin(self):
        s = self.s
        body = dict(lot='T9', title='t', agent='dev', model='sonnet', cx='M', prompt='p')
        n_before = len(os.listdir(s.prompts)) if os.path.isdir(s.prompts) else 0
        self.assertEqual(s.call('POST', '/api/tasks', body, token=False)[0], 403)
        self.assertEqual(s.call('POST', '/api/tasks', body, token='x' * 43)[0], 403)
        self.assertEqual(s.call('POST', '/api/tasks', body, origin='http://evil.example')[0], 403)
        self.assertEqual(s.call('POST', '/api/tasks', body, origin=False)[0], 403)
        for act in ('enqueue', 'pause', 'resume', 'stop', 'kill', 'cancel', 'input', 'resize'):
            self.assertEqual(s.call('POST', f'/api/runner/T9.2/{act}', {}, token=False)[0], 403, act)
            self.assertEqual(s.call('POST', f'/api/runner/T9.2/{act}', {}, origin='http://evil.example')[0], 403, act)
        self.assertEqual(s.call('GET', '/api/runner/T9.2/tty', token=False)[0], 403)
        self.assertEqual(s.call('GET', '/api/runner/T9.2/tty', origin='http://evil.example')[0], 403)
        self.assertEqual(s.call('GET', '/api/runner/T9.2/tty', origin=False)[0], 403)
        self.assertEqual(len(os.listdir(s.prompts)) if os.path.isdir(s.prompts) else 0, n_before)

    # -- cycle complet --------------------------------------------------------------
    def test_cycle_done_review(self):
        s = self.s
        tid = s.create('EXIT 0', autostart=True)
        row = s.wait_row(tid, lambda r: r.get('status') == 'doing' and r.get('runState') in ('starting', 'running'))
        self.assertEqual(row['inst'], 1)
        self.assertTrue(row['session'])
        self.assertEqual(row['runner'], 'auto')
        self.assertTrue(row['started'])
        run = s.wait_state(tid, 'running')
        self.assertTrue(run['controllable'])
        self.assertEqual(run['session'], row['session'])
        self.assertEqual(run['agent'], 'dev')
        self.assertEqual(run['inst'], 1)
        st, out = s.call('POST', f'/api/runner/{tid}/input', {'data': '\x04'})
        self.assertEqual((st, out['ok']), (200, True))
        run = s.wait_state(tid, 'done')
        self.assertEqual(run['exit'], 0)
        row = s.wait_row(tid, lambda r: r.get('status') == 'review')
        self.assertEqual(row['reviewer'], 'revue')
        self.assertEqual(row['runState'], 'done')
        self.assertTrue(row['ended'])
        self.assertGreater(row.get('ms') or 0, 0)
        # jamais review -> done par le serveur
        time.sleep(1.5)
        self.assertEqual(s.plan_row(tid)['status'], 'review')
        # notices du lanceur
        self.assertEqual(s.wait_notice('runner_started', tid)['severity'], 'info')
        n0 = s.wait_notice('runner_done', tid)
        self.assertEqual((n0['cat'], n0['severity'], n0['target']), ('runner', 'success', {'type': 'task', 'id': tid}))
        _, state = s.call('GET', '/api/state', token=False, origin=False)
        # /api/state.runner == GET /api/runner (hors duree active)
        self.assertTrue(state['runner']['enabled'])
        self.assertIn(tid, [r['task'] for r in state['runner']['runs']])

    def test_cycle_failed_blocked(self):
        s = self.s
        tid = s.create('EXIT 3', autostart=True)
        s.wait_state(tid, 'running')
        s.call('POST', f'/api/runner/{tid}/input', {'data': '\x04'})
        run = s.wait_state(tid, 'failed')
        self.assertEqual(run['exit'], 3)
        row = s.wait_row(tid, lambda r: r.get('status') == 'blocked')
        self.assertIn('code de sortie 3', row['note'])
        self.assertEqual(row['runState'], 'failed')
        self.assertEqual(s.wait_notice('runner_failed', tid)['severity'], 'error')

    def test_pause_reprise_stop_kill_et_409(self):
        s = self.s
        tid = s.create('SLEEP 0', autostart=True)
        s.wait_state(tid, 'running')
        post = lambda act, body=None: s.call('POST', f'/api/runner/{tid}/{act}', body or {})
        self.assertEqual(post('resume')[0], 409)   # pas en pause
        self.assertEqual(post('cancel')[0], 409)   # pas en file
        self.assertEqual(post('enqueue')[0], 409)  # deja vivant
        st, out = post('pause')
        self.assertEqual((st, out), (200, {'ok': True, 'state': 'paused'}))
        self.assertEqual(post('pause')[0], 409)
        s.end_all()
        s.wait_state(tid, ('killed', 'stopped'))
        # nouveau cycle : pause / reprise / stop / relance / kill
        tid = s.create('SLEEP 0', autostart=True)
        s.wait_state(tid, 'running')
        post = lambda act, body=None: s.call('POST', f'/api/runner/{tid}/{act}', body or {})
        self.assertEqual(post('pause')[1]['state'], 'paused')
        s.wait_row(tid, lambda r: r.get('runState') == 'paused')
        self.assertEqual(post('resume')[1]['state'], 'running')
        st, out = post('stop')
        self.assertEqual((st, out['state']), (200, 'stopping'))
        s.wait_state(tid, 'stopped')
        row = s.wait_row(tid, lambda r: r.get('runState') == 'stopped')
        self.assertEqual(row['status'], 'doing')
        self.assertEqual(post('stop')[0], 409)
        self.assertEqual(post('pause')[0], 409)
        # relance par enqueue : --resume (meme session)
        sess = s.run(tid)['session']
        self.assertEqual(post('enqueue')[1]['state'], 'queued')
        run = s.wait_state(tid, 'running')
        self.assertEqual(run['session'], sess)
        st, out = post('kill')
        self.assertEqual((st, out['state']), (200, 'killed'))
        row = s.wait_row(tid, lambda r: r.get('status') == 'blocked')
        self.assertEqual(row['runState'], 'killed')
        self.assertEqual(post('kill')[0], 409)
        self.assertEqual(s.call('POST', '/api/runner/Z9.9/kill', {})[0], 404)
        self.assertEqual(s.call('POST', '/api/runner/Z9.9/pause', {})[0], 404)
        self.assertEqual(s.call('POST', f'/api/runner/{tid}/nimporte', {})[0], 404)
        self.assertEqual(s.call('POST', '/api/runner/Z9.9/enqueue', {})[0], 404)

    def test_enqueue_tache_existante(self):
        s = self.s
        tid = s.create('SLEEP 0', autostart=False, prio=1)
        self.assertIsNone(s.run(tid))
        st, out = s.call('POST', f'/api/runner/{tid}/enqueue', {})
        self.assertEqual((st, out['ok']), (200, True))
        run = s.wait_state(tid, 'running')
        self.assertEqual(run['prio'], 1)
        self.assertEqual(s.plan_row(tid)['runner'], 'auto')
        # agent cp : jamais lance
        self.assertEqual(s.call('POST', '/api/runner/T9.P/enqueue', {})[0], 400)

    def test_prompt_chemin_absolu(self):
        s = self.s
        tid = s.create('SLEEP 0', autostart=True)
        s.wait_state(tid, 'running')
        argv = Path(s.prompts, tid + '.argv').read_text(encoding='utf-8')
        expected = os.path.abspath(os.path.join(s.prompts, tid + '.md'))
        self.assertIn(expected, argv)
        self.assertTrue(os.path.isabs(expected) and os.path.isfile(expected))
        # enqueue d'une tâche existante : même garantie
        t2 = s.create('SLEEP 0', autostart=False)
        s.call('POST', f'/api/runner/{t2}/enqueue', {})
        s.wait_state(t2, 'running')
        self.assertIn(os.path.abspath(os.path.join(s.prompts, t2 + '.md')),
                      Path(s.prompts, t2 + '.argv').read_text(encoding='utf-8'))

    # -- terminal ---------------------------------------------------------------------
    def test_tty_flux_rejeu_et_echo(self):
        s = self.s
        tid = s.create('SLEEP 0', autostart=True)
        s.wait_state(tid, 'running')
        h = {'X-STT-Token': s.token, 'Origin': f'http://127.0.0.1:{s.port}'}
        c = http.client.HTTPConnection('127.0.0.1', s.port, timeout=10)
        c.request('GET', f'/api/runner/{tid}/tty?since=0', headers=h)
        r = c.getresponse()
        self.assertEqual(r.status, 200)
        self.assertIn('text/event-stream', r.getheader('Content-Type'))
        ev = read_sse(r, lambda e: b'fake-agent' in decode(e))
        self.assertIn(b'[fake-agent] session=', decode(ev))
        self.assertIn(('state', {'state': 'running'}), ev)
        first = [d for e, d in ev if e == 'out'][0]
        self.assertEqual(first['seq'], 0)
        total = len(decode(ev))
        s.call('POST', f'/api/runner/{tid}/input', {'data': 'bonjour tty\n'})
        ev2 = read_sse(r, lambda e: decode(e).count(b'bonjour tty') >= 2)  # echo du pty + echo de l'agent
        self.assertIn(b'bonjour tty', decode(ev2))
        self.assertEqual([d for e, d in ev2 if e == 'out'][0]['seq'], total)
        c.close()
        # rejeu depuis seq
        c = http.client.HTTPConnection('127.0.0.1', s.port, timeout=10)
        c.request('GET', f'/api/runner/{tid}/tty?since={total}', headers=h)
        r = c.getresponse()
        ev3 = read_sse(r, lambda e: b'bonjour tty' in decode(e))
        self.assertEqual([d for e, d in ev3 if e == 'out'][0]['seq'], total)
        self.assertNotIn(b'[fake-agent]', decode(ev3))
        c.close()
        # since invalide
        self.assertEqual(s.call('GET', f'/api/runner/{tid}/tty?since=abc')[0], 400)
        self.assertEqual(s.call('GET', '/api/runner/Z9.9/tty')[0], 404)
        # GET fetch same-origin : pas d'Origin mais Sec-Fetch-Site same-origin
        c = http.client.HTTPConnection('127.0.0.1', s.port, timeout=10)
        c.request('GET', f'/api/runner/{tid}/tty?since=0',
                  headers={'X-STT-Token': s.token, 'Sec-Fetch-Site': 'same-origin'})
        r = c.getresponse()
        self.assertEqual(r.status, 200)
        c.close()
        # resize / input trop gros / saisie invalide
        self.assertEqual(s.call('POST', f'/api/runner/{tid}/resize', {'cols': 100, 'rows': 30})[0], 200)
        self.assertEqual(s.call('POST', f'/api/runner/{tid}/resize', {'cols': 0, 'rows': 30})[0], 400)
        self.assertEqual(s.call('POST', f'/api/runner/{tid}/input', {'data': 'x' * (70 * 1024)})[0], 413)
        self.assertEqual(s.call('POST', f'/api/runner/{tid}/input', {'data': 5})[0], 400)

    # -- plafonds -----------------------------------------------------------------------
    def test_plafonds_quatrieme_dev_en_file(self):
        s = self.s
        ids = [s.create('SLEEP 0', autostart=True) for _ in range(4)]
        for t in ids[:3]:
            s.wait_state(t, 'running', timeout=25)
        end = time.time() + 5
        while time.time() < end and s.run(ids[3])['state'] != 'queued':
            time.sleep(0.1)
        time.sleep(2.5)  # deux tours d'ordonnanceur : il doit rester en file
        fourth = s.run(ids[3])
        self.assertEqual(fourth['state'], 'queued')
        self.assertEqual(fourth['rank'], 1)
        self.assertEqual(sorted(s.run(t)['inst'] for t in ids[:3]), [1, 2, 3])
        rn = s.runner()
        self.assertEqual(rn['caps'], {'profile': {'dev': 3, 'archi': 1, 'revue': 1, 'cp': 0}, 'global': 4})
        # annulation de la 4e (queued -> stopped), puis liberation d'une place
        self.assertEqual(s.call('POST', f'/api/runner/{ids[3]}/cancel', {})[1]['state'], 'stopped')
        s.call('POST', f'/api/runner/{ids[0]}/kill', {})
        ids5 = s.create('SLEEP 0', autostart=True)
        s.wait_state(ids5, 'running', timeout=25)
        self.assertEqual(s.run(ids5)['inst'], s.run(ids[0])['inst'])

    # -- cles reservees -----------------------------------------------------------------
    def test_cles_reservees_refusees_par_api_kanban(self):
        s = self.s
        h = {'X-STT-Kanban': '1', 'Content-Type': 'application/json'}
        for k in ('runner', 'session', 'runState', 'started', 'ended'):
            st, body = s.raw('POST', '/api/kanban', json.dumps({'ops': [{'op': 'task', 'id': 'T9.1', 'set': {k: 'x'}}],
                                                               'dry_run': True}), h)
            self.assertEqual(st, 400, k)
            self.assertIn('réservées', json.loads(body)['error'])


class NoRunnerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = Server(runner=False)

    @classmethod
    def tearDownClass(cls):
        cls.s.close()

    def test_runner_desactive(self):
        s = self.s
        st, out = s.call('GET', '/api/runner', token=False, origin=False)
        self.assertEqual(st, 200)
        self.assertIs(out['enabled'], False)
        self.assertTrue(out['reason'])
        self.assertNotIn('runs', out)
        _, state = s.call('GET', '/api/state', token=False, origin=False)
        self.assertIs(state['runner']['enabled'], False)
        for act in ('enqueue', 'pause', 'kill'):
            self.assertEqual(s.call('POST', f'/api/runner/T9.2/{act}', {})[0], 409)
        self.assertEqual(s.call('GET', '/api/runner/T9.2/tty')[0], 409)

    def test_creation_simple_possible_autostart_refuse(self):
        s = self.s
        body = dict(lot='T9', title='t', agent='dev', model='sonnet', cx='S', prompt='p')
        st, out = s.call('POST', '/api/tasks', dict(body, autostart=True))
        self.assertEqual(st, 409)
        self.assertFalse(os.path.isdir(s.prompts) and os.listdir(s.prompts))
        st, out = s.call('POST', '/api/tasks', dict(body, autostart=False))
        self.assertEqual((st, out['id']), (200, 'T9.2'))
        self.assertEqual(s.plan_row('T9.2')['budget'], 40000)
        self.assertEqual(s.call('POST', '/api/tasks', body, token=False)[0], 403)


class OrphelinTests(unittest.TestCase):
    """Un orphelin n'accepte que kill : 409 avec message clair pour le reste."""

    def test_orphelin_409(self):
        import stt_agents_server as srv
        import stt_runner
        from stt_notices import NoticeEngine
        tmp = tempfile.mkdtemp(prefix='stt-api-orphan-')
        try:
            kan = os.path.join(tmp, 'data', 'plan-status.js')
            os.makedirs(os.path.dirname(kan))
            Path(kan).write_text(PLAN, encoding='utf-8')
            hub = types.SimpleNamespace(notices=NoticeEngine(), claude=types.SimpleNamespace(files={}))
            args = types.SimpleNamespace(kanban=kan, main_root=tmp, repo=tmp)
            glue = srv.RunnerGlue(hub, args, command=[sys.executable, '-c', 'pass'])
            run = stt_runner.Run('T9.9', 'dev', 'sonnet', 'acceptEdits', 2, 's-1', '.claude/worktrees/stt-T9', 'T9')
            run.state = 'orphan'
            glue.runner.runs['T9.9'] = run
            snap = glue.runner.snapshot()
            self.assertFalse(snap['runs'][0]['controllable'])
            for act in ('pause', 'resume', 'stop', 'cancel', 'enqueue'):
                with self.assertRaises(srv.HttpError) as cm:
                    glue.action('T9.9', act, {})
                self.assertEqual(cm.exception.code, 409)
                self.assertIn('orphelin', cm.exception.message)
            with self.assertRaises(srv.HttpError) as cm:
                glue.input('T9.9', 'x')
            self.assertEqual(cm.exception.code, 409)
            # kill reste permis (processus deja disparu : orphelin -> stopped, rien n'est signale)
            self.assertEqual(glue.action('T9.9', 'kill', {})['ok'], True)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    unittest.main()
