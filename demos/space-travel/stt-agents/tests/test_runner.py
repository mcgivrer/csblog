"""
Tests de stt_runner.py (coeur du lanceur). Aucun vrai `claude` : tout passe par
tests/fake_agent.py (garde helpers.assert_not_real_claude).
"""

import glob
import json
import os
import signal
import subprocess
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
import stt_runner  # noqa: E402
from stt_runner import Runner, TransitionError, ValidationError  # noqa: E402

FAKE = str(HERE / 'fake_agent.py')
FAKE_CMD = [sys.executable, FAKE] + stt_runner.RUNNER_COMMAND[1:]


class Clock:
    def __init__(self, t=1000.0):
        self.t = t

    def __call__(self):
        return self.t


class RunnerTestBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='stt-runner-test-')
        self.root = os.path.join(self.tmp, 'root')
        self.state_dir = os.path.join(self.root, '.claude', 'stt-runner')
        self.cfg = os.path.join(self.tmp, 'claude-config')
        os.makedirs(os.path.join(self.root, '.claude', 'worktrees', 'stt-L2a'))
        self.runners = []
        self.extra_procs = []
        self.addCleanup(self._cleanup)

    def _cleanup(self):
        for r in self.runners:
            try:
                r.shutdown()
            except Exception:
                pass
            for run in r.runs.values():
                if run.pgid and run.proc is not None and run.proc.poll() is None:
                    try:
                        os.killpg(run.pgid, signal.SIGKILL)
                    except OSError:
                        pass
        for p in self.extra_procs:
            try:
                os.killpg(p.pid, signal.SIGKILL)
            except OSError:
                pass
            p.wait()
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def make(self, **kw):
        kw.setdefault('command', FAKE_CMD)
        kw.setdefault('stop_grace_s', 0.4)
        kw.setdefault('prompts_dir', self.tmp)
        kw.setdefault('env', {'CLAUDE_CONFIG_DIR': self.cfg})
        helpers.assert_not_real_claude(kw['command'])
        r = Runner(self.state_dir, self.root, **kw)
        self.runners.append(r)
        return r

    def until(self, runner, cond, timeout=10):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            runner.tick()
            if cond():
                return
            time.sleep(0.02)
        raise AssertionError('condition non atteinte; etats: %s' % {
            t: r.state for t, r in runner.runs.items()})

    def state(self, runner, task):
        return runner.runs[task].state

    def banner(self, runner, task):
        # le faux agent affiche d'abord un avertissement Python, puis sa banniere
        self.until(runner, lambda: self.state(runner, task) == 'running'
                   and b'[fake-agent]' in runner.read_output(task)[1])

    def start(self, runner, task, **kw):
        runner.enqueue(task, **kw)
        self.banner(runner, task)
        return runner.runs[task]

    def tokens_from_transcript(self, run):
        n = 0
        for p in glob.glob(os.path.join(self.cfg, 'projects', '*', run.session + '.jsonl')):
            with open(p) as f:
                for line in f:
                    m = json.loads(line).get('message') or {}
                    n += (m.get('usage') or {}).get('output_tokens', 0)
        return n


class TestLifecycle(RunnerTestBase):
    def test_enqueue_start_done(self):
        states = []
        r = self.make(on_change=lambda run: states.append(run.state))
        run = r.enqueue('L2a.1')
        self.assertEqual(run.state, 'queued')
        self.assertTrue(run.session)
        self.assertEqual(run.worktree, '.claude/worktrees/stt-L2a')
        self.banner(r, 'L2a.1')
        self.assertEqual(run.inst, 1)
        self.assertGreater(run.pid, 0)
        _, out = r.read_output('L2a.1')
        self.assertIn(b'[fake-agent] session=' + run.session.encode(), out)
        r.input('L2a.1', '\x04')  # EOF => le faux agent sort avec 0
        self.until(r, lambda: run.state == 'done')
        self.assertEqual(run.exit, 0)
        self.assertIsNotNone(run.ended)
        self.assertEqual(states[:3], ['queued', 'starting', 'running'])
        self.assertEqual(states[-1], 'done')
        with self.assertRaises(TransitionError):
            r.enqueue('L2a.1')  # done : terminal

    def test_failed_exit_code(self):
        r = self.make()
        run = self.start(r, 'L2a.1', prompt='EXIT 3')
        r.input('L2a.1', '\x04')
        self.until(r, lambda: run.state == 'failed')
        self.assertEqual(run.exit, 3)

    def test_spawn_error_fails(self):
        r = self.make(command=['/nonexistent/binaire-xyz'])
        run = r.enqueue('L2a.1')
        self.until(r, lambda: run.state == 'failed')
        self.assertIn('lancement impossible', run.note)

    def test_start_timeout(self):
        clock = Clock()
        cmd = [sys.executable, '-c', 'import time; time.sleep(60)']
        r = self.make(command=cmd, now=clock, start_timeout_s=60)
        run = r.enqueue('L2a.1')
        r.tick()
        self.assertEqual(run.state, 'starting')
        clock.t += 61
        r.tick()
        self.assertEqual(run.state, 'failed')
        self.assertIn('demarrage', run.note)
        run.proc.wait(timeout=5)

    def test_cancel_and_relaunch(self):
        r = self.make(profile_cap={'dev': 0, 'archi': 1, 'revue': 1, 'cp': 0})
        run = r.enqueue('L2a.1')
        r.tick()
        self.assertEqual(run.state, 'queued')
        r.cancel('L2a.1')
        self.assertEqual(run.state, 'stopped')
        r.enqueue('L2a.1')
        self.assertEqual(run.state, 'queued')

    def test_stop_then_resume_session(self):
        r = self.make()
        run = self.start(r, 'L2a.1')
        sess = run.session
        r.stop('L2a.1')
        self.assertEqual(run.state, 'stopping')
        self.until(r, lambda: run.state == 'stopped')
        self.assertIsNotNone(run.ended)
        r.enqueue('L2a.1')
        self.banner(r, 'L2a.1')
        self.assertEqual(run.session, sess)
        # reprise : --resume {session}, pas de prompt
        _, out = r.read_output('L2a.1')
        self.assertIn(b'session=' + sess.encode(), out)
        cfgs = glob.glob(os.path.join(self.cfg, 'projects', '*', sess + '.jsonl'))
        self.assertEqual(len(cfgs), 1)
        self.assertIn('(no prompt)', open(cfgs[0]).read().splitlines()[-2])

    def test_kill(self):
        r = self.make()
        run = self.start(r, 'L2a.1')
        pid = run.pid
        r.kill('L2a.1')
        self.assertEqual(run.state, 'killed')
        self.until(r, lambda: run.exit is not None)
        self.assertEqual(run.exit, -signal.SIGKILL)
        self.assertEqual(run.state, 'killed')
        with self.assertRaises(ProcessLookupError):
            os.killpg(pid, 0)
        r.enqueue('L2a.1')  # killed -> queued
        self.assertEqual(run.state, 'queued')

    def test_kill_after_failed_then_relaunch(self):
        r = self.make()
        run = self.start(r, 'L2a.1', prompt='EXIT 2')
        r.input('L2a.1', '\x04')
        self.until(r, lambda: run.state == 'failed')
        r.enqueue('L2a.1')
        self.assertEqual(run.state, 'queued')
        self.assertIsNone(run.exit)

    def test_sigkill_after_ignore_term(self):
        r = self.make(stop_grace_s=0.5)
        run = self.start(r, 'L2a.1', prompt='IGNORE_TERM')
        t0 = time.monotonic()
        r.stop('L2a.1')
        time.sleep(0.2)
        r.tick()
        self.assertEqual(run.state, 'stopping')  # SIGTERM ignore, grace non ecoulee
        self.assertIsNone(run.proc.poll())
        self.until(r, lambda: run.state == 'stopped')
        self.assertGreaterEqual(time.monotonic() - t0, 0.5)
        self.assertEqual(run.exit, -signal.SIGKILL)

    def test_pause_resume_and_stop_from_paused(self):
        r = self.make()
        run = self.start(r, 'L2a.1')
        r.pause('L2a.1')
        self.assertEqual(run.state, 'paused')
        time.sleep(0.2)
        with open('/proc/%d/stat' % run.pid) as f:
            self.assertEqual(f.read().rsplit(')', 1)[1].split()[0], 'T')
        # le noyau fait l'echo du pty ; l'agent, arrete, ne renvoie rien
        os.write(run.master, b'ping\n')
        time.sleep(0.4)
        _, out = r.read_output('L2a.1')
        self.assertEqual(out.count(b'ping'), 1)
        r.resume('L2a.1')
        self.assertEqual(run.state, 'running')
        self.until(r, lambda: r.read_output('L2a.1')[1].count(b'ping') == 2)
        r.pause('L2a.1')
        r.stop('L2a.1')  # SIGCONT puis SIGTERM
        self.until(r, lambda: run.state == 'stopped')
        self.assertGreaterEqual(run.paused_s, 0)

    def test_paused_time_excluded(self):
        clock = Clock()
        r = self.make(now=clock)
        run = self.start(r, 'L2a.1')
        clock.t += 10
        r.pause('L2a.1')
        clock.t += 100
        r.resume('L2a.1')
        clock.t += 5
        self.assertAlmostEqual(run.active_seconds(clock.t), 15, delta=0.01)


class TestTransitions(RunnerTestBase):
    def test_forbidden(self):
        r = self.make(profile_cap={'dev': 0, 'archi': 1, 'revue': 1, 'cp': 0})
        run = r.enqueue('L2a.1')  # queued
        for fn in (r.pause, r.resume, r.stop, r.kill):
            with self.assertRaises(TransitionError, msg=fn.__name__):
                fn('L2a.1')
        with self.assertRaises(TransitionError):
            r.enqueue('L2a.1')
        with self.assertRaises(TransitionError):
            r.input('L2a.1', 'x')
        r2 = self.make()
        run2 = self.start(r2, 'L2a.2')
        with self.assertRaises(TransitionError):
            r2.resume('L2a.2')
        with self.assertRaises(TransitionError):
            r2.cancel('L2a.2')
        with self.assertRaises(TransitionError):
            r2.enqueue('L2a.2')
        r2.stop('L2a.2')
        with self.assertRaises(TransitionError):
            r2.pause('L2a.2')  # stopping
        with self.assertRaises(TransitionError):
            r2.stop('L2a.2')
        self.until(r2, lambda: run2.state == 'stopped')
        for fn in (r2.pause, r2.resume, r2.stop, r2.kill, r2.cancel):
            with self.assertRaises(TransitionError, msg=fn.__name__):
                fn('L2a.2')
        self.assertEqual(run.state, 'queued')

    def test_set_state_rejects_table(self):
        r = self.make()
        run = r.enqueue('L2a.1')
        with self.assertRaises(TransitionError):
            r._set_state(run, 'running')  # queued -> running interdit
        with self.assertRaises(TransitionError):
            r._set_state(run, 'done')

    def test_unknown_task(self):
        r = self.make()
        with self.assertRaises(KeyError):
            r.pause('nope')


class TestPool(RunnerTestBase):
    def test_caps_inst_and_global(self):
        r = self.make(global_cap=4)   # T4.2 : le plafond global est la somme des emplacements (TEAM_MAX)
        for i in range(1, 5):
            r.enqueue('L2a.%d' % i)
        r.enqueue('A.1', agent='archi', lot='L2a')
        r.enqueue('R.1', agent='revue', lot='L2a')
        r.enqueue('C.1', agent='cp', lot='L2a')
        for _ in range(3):
            r.tick()
        st = {t: x.state for t, x in r.runs.items()}
        started = [t for t, s in st.items() if s in ('starting', 'running')]
        self.assertEqual(len(started), 4)  # GLOBAL_CAP
        devs = [x for x in r.runs.values() if x.agent == 'dev' and x.state != 'queued']
        self.assertEqual(sorted(x.inst for x in devs), [1, 2, 3])
        self.assertEqual(st['L2a.4'], 'queued')  # dev plafonne a 3
        self.assertEqual(st['A.1'], 'starting' if st['A.1'] != 'running' else 'running')
        self.assertEqual(st['R.1'], 'queued')  # plafond global atteint
        self.assertEqual(st['C.1'], 'queued')  # cp : cap 0
        # liberer un dev (inst 2) : L2a.4 prend inst 2 ; R.1 attend encore (4 pris)
        r.kill('L2a.2')
        r.tick()
        self.assertEqual(r.runs['L2a.4'].inst, 2)
        self.assertEqual(r.runs['R.1'].state, 'queued')
        r.kill('A.1')
        self.until(r, lambda: r.runs['R.1'].state in ('starting', 'running'))
        self.assertEqual(r.runs['C.1'].state, 'queued')

    def test_priority_order(self):
        r = self.make(profile_cap={'dev': 1, 'archi': 1, 'revue': 1, 'cp': 0})
        self.start(r, 'L2a.1')
        r.enqueue('L2a.2', prio=3)
        r.enqueue('L2a.3', prio=1)
        r.enqueue('L2a.4', prio=2)
        r.enqueue('L2a.5', prio=2)
        order = []
        for t in ('L2a.3', 'L2a.4', 'L2a.5', 'L2a.2'):
            r.kill(next(x.task for x in r.runs.values() if x.state in ('starting', 'running')))
            r.tick()
            live = [x.task for x in r.runs.values() if x.state in ('starting', 'running')]
            order += live
        self.assertEqual(order, ['L2a.3', 'L2a.4', 'L2a.5', 'L2a.2'])

    def test_paused_and_waiting_hold_slot(self):
        flag = {'ended': False}
        clock = Clock()
        r = self.make(profile_cap={'dev': 1, 'archi': 1, 'revue': 1, 'cp': 0}, now=clock,
                      turn_ended_of=lambda run: flag['ended'])
        run = self.start(r, 'L2a.1')
        r.enqueue('L2a.2')
        r.pause('L2a.1')
        r.tick()
        self.assertEqual(r.runs['L2a.2'].state, 'queued')
        r.resume('L2a.1')
        flag['ended'] = True
        clock.t += 25
        r.tick()
        self.assertEqual(run.state, 'waiting')
        r.tick()
        self.assertEqual(r.runs['L2a.2'].state, 'queued')

    def test_snapshot_rank(self):
        r = self.make(profile_cap={'dev': 0, 'archi': 1, 'revue': 1, 'cp': 0})
        r.enqueue('L2a.1', prio=3)
        r.enqueue('L2a.2', prio=1)
        snap = r.snapshot()
        by = {x['task']: x for x in snap['runs']}
        self.assertEqual(by['L2a.2']['rank'], 1)
        self.assertEqual(by['L2a.1']['rank'], 2)
        self.assertEqual(snap['caps']['global'], stt_runner.TEAM_MAX)  # T4.2 : plafond = somme des emplacements
        self.assertTrue(by['L2a.1']['controllable'])
        json.dumps(snap)


class TestTerminal(RunnerTestBase):
    def test_input_echo(self):
        r = self.make()
        self.start(r, 'L2a.1')
        r.input('L2a.1', 'bonjour\n')
        # echo du noyau + echo de l'agent
        self.until(r, lambda: r.read_output('L2a.1')[1].count(b'bonjour') >= 2)

    def test_input_limits(self):
        r = self.make()
        self.start(r, 'L2a.1')
        with self.assertRaises(ValidationError):
            r.input('L2a.1', 'x' * (64 * 1024 + 1))

    def test_resize(self):
        import fcntl
        import struct
        import termios
        r = self.make()
        run = self.start(r, 'L2a.1')
        r.resize('L2a.1', 120, 40)
        rows, cols, _, _ = struct.unpack('HHHH', fcntl.ioctl(
            run.master, termios.TIOCGWINSZ, b'\0' * 8))
        self.assertEqual((cols, rows), (120, 40))
        with self.assertRaises(ValidationError):
            r.resize('L2a.1', 0, 10)
        with self.assertRaises(ValidationError):
            r.resize('L2a.1', 'a', 10)

    def test_circular_buffer_and_replay(self):
        with mock.patch.object(stt_runner, 'OUT_BUFFER_MAX', 1024):
            r = self.make()
            run = self.start(r, 'L2a.1')
            for i in range(6):
                r.input('L2a.1', ('%d' % i) * 400 + '\n')
                time.sleep(0.05)
            self.until(r, lambda: run.total > 3000)
            time.sleep(0.2)
            seq, data = r.read_output('L2a.1', 0)
            self.assertGreater(seq, 0)  # le debut a tourne
            self.assertEqual(seq, run.buf_start)
            self.assertLessEqual(len(data), 1024)
            self.assertEqual(seq + len(data), run.total)
            seq2, data2 = r.read_output('L2a.1', seq + 100)
            self.assertEqual(seq2, seq + 100)
            self.assertEqual(data2, data[100:])
            seq3, data3 = r.read_output('L2a.1', run.total)
            self.assertEqual((seq3, data3), (run.total, b''))

    def test_log_truncated_from_start(self):
        with mock.patch.object(stt_runner, 'LOG_MAX', 2000):
            r = self.make()
            run = self.start(r, 'L2a.1')
            for i in range(8):
                r.input('L2a.1', ('%d' % i) * 500 + '\n')
                time.sleep(0.05)
            self.until(r, lambda: run.total > 6000)
            time.sleep(0.2)
            size = os.path.getsize(os.path.join(self.state_dir, 'L2a.1.log'))
            self.assertLessEqual(size, 2000)
            self.assertGreater(size, 0)


class TestBudgetAndWaiting(RunnerTestBase):
    def test_budget_pause(self):
        r = self.make(tokens_of=self.tokens_from_transcript)
        big = r.enqueue('L2a.1', prompt='TOKENS 5000', budget=1000)
        small = r.enqueue('L2a.2', prompt='TOKENS 100', budget=1000)
        self.until(r, lambda: big.state == 'paused')
        self.assertIn('budget', big.note)
        self.assertGreater(big.tokens, 2000)
        self.until(r, lambda: small.state == 'running')
        for _ in range(3):
            r.tick()
        self.assertEqual(small.state, 'running')  # 110 < 2000
        r.resume('L2a.1')
        for _ in range(3):
            r.tick()
        self.assertEqual(big.state, 'running')  # une fois : pas de re-pause

    def test_waiting_and_reactive(self):
        clock = Clock()
        flag = {'ended': True}
        r = self.make(now=clock, turn_ended_of=lambda run: flag['ended'])
        run = self.start(r, 'L2a.1')
        time.sleep(0.3)  # laisse passer toute la sortie initiale (horloge figee)
        clock.t += 10
        r.tick()
        self.assertEqual(run.state, 'running')  # pty pas assez muet
        clock.t += 15
        r.tick()
        self.assertEqual(run.state, 'waiting')
        r.input('L2a.1', 'x\n')  # sortie => reactif
        self.until(r, lambda: run.state == 'running')
        clock.t += 30
        flag['ended'] = False
        r.tick()
        self.assertEqual(run.state, 'running')


class TestOrphans(RunnerTestBase):
    def _spawn_orphan(self):
        p = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'],
                             start_new_session=True)
        self.extra_procs.append(p)
        return p

    def _write_state(self, task, pid, tag, state='running'):
        os.makedirs(self.state_dir, exist_ok=True)
        run = stt_runner.Run(task, 'dev', 'sonnet', 'acceptEdits', 2, 'sess-' + task,
                             '.claude/worktrees/stt-L2a', 'L2a')
        run.state, run.pid, run.pgid, run.proc_start = state, pid, pid, tag
        run.enqueued = run.started = 1.0
        run.resumed = True
        with open(os.path.join(self.state_dir, 'state.json'), 'w') as f:
            json.dump({'version': 1, 'runs': [run.to_dict()]}, f)

    def test_real_pid_becomes_orphan_then_kill(self):
        p = self._spawn_orphan()
        self._write_state('L2a.1', p.pid, stt_runner.process_start_tag(p.pid))
        r = self.make()
        r.load_state()
        run = r.runs['L2a.1']
        self.assertEqual(run.state, 'orphan')
        self.assertFalse(r.snapshot()['runs'][0]['controllable'])
        for fn in (r.pause, r.resume, r.stop, r.cancel):
            with self.assertRaises(TransitionError):
                fn('L2a.1')
        with self.assertRaises(TransitionError):
            r.input('L2a.1', 'x')
        r.kill('L2a.1')
        self.assertEqual(run.state, 'killed')
        p.wait(timeout=5)
        self.assertEqual(p.returncode, -signal.SIGKILL)

    def test_reused_pid_is_stopped_and_never_signalled(self):
        p = self._spawn_orphan()
        self._write_state('L2a.1', p.pid, 'proc:0-autre-heure')
        r = self.make()
        r.load_state()
        self.assertEqual(r.runs['L2a.1'].state, 'stopped')
        time.sleep(0.1)
        self.assertIsNone(p.poll())  # l'inconnu n'a pas ete touche

    def test_dead_pid_is_stopped(self):
        p = self._spawn_orphan()
        tag = stt_runner.process_start_tag(p.pid)
        os.killpg(p.pid, signal.SIGKILL)
        p.wait()
        self._write_state('L2a.1', p.pid, tag, state='paused')
        r = self.make()
        r.load_state()
        self.assertEqual(r.runs['L2a.1'].state, 'stopped')
        r.enqueue('L2a.1')  # reprenable
        self.assertEqual(r.runs['L2a.1'].state, 'queued')

    def test_orphan_disappears_on_tick(self):
        p = self._spawn_orphan()
        self._write_state('L2a.1', p.pid, stt_runner.process_start_tag(p.pid))
        r = self.make()
        r.load_state()
        os.killpg(p.pid, signal.SIGKILL)
        p.wait()
        r.tick()
        self.assertEqual(r.runs['L2a.1'].state, 'stopped')

    def test_orphan_holds_slot(self):
        p = self._spawn_orphan()
        self._write_state('L2a.1', p.pid, stt_runner.process_start_tag(p.pid))
        r = self.make(profile_cap={'dev': 1, 'archi': 1, 'revue': 1, 'cp': 0})
        r.load_state()
        r.enqueue('L2a.2')
        r.tick()
        self.assertEqual(r.runs['L2a.2'].state, 'queued')

    def test_persistence_roundtrip_queue(self):
        r = self.make(profile_cap={'dev': 0, 'archi': 1, 'revue': 1, 'cp': 0})
        r.enqueue('L2a.1', prio=1)
        self.assertFalse(os.path.exists(r.state_path + '.tmp'))
        data = json.load(open(r.state_path))
        self.assertEqual(data['runs'][0]['task'], 'L2a.1')
        r2 = self.make()
        r2.load_state()
        self.assertEqual(r2.runs['L2a.1'].state, 'queued')
        self.assertEqual(r2.runs['L2a.1'].prio, 1)
        self.assertEqual(r2.runs['L2a.1'].session, r.runs['L2a.1'].session)


class TestShutdown(RunnerTestBase):
    def test_shutdown_stops_all(self):
        r = self.make()
        a = self.start(r, 'L2a.1')
        b = self.start(r, 'L2a.2', prompt='IGNORE_TERM')
        c = self.start(r, 'L2a.3')
        r.pause('L2a.3')
        r.enqueue('L2a.4', agent='cp', lot='L2a')  # reste en file
        pids = [a.pid, b.pid, c.pid]
        r.shutdown()
        for run in (a, b, c):
            self.assertEqual(run.state, 'stopped', run.task)
        self.assertEqual(r.runs['L2a.4'].state, 'queued')
        for pid in pids:
            with self.assertRaises(ProcessLookupError):
                os.killpg(pid, 0)
        data = json.load(open(r.state_path))
        self.assertEqual({x['task']: x['state'] for x in data['runs']}['L2a.1'], 'stopped')
        # reprenables
        r.enqueue('L2a.1')
        self.assertEqual(a.state, 'queued')

    def test_thread_runs_scheduler(self):
        r = self.make()
        r.start_thread()
        try:
            run = r.enqueue('L2a.1')
            helpers.wait_for_condition(lambda: run.state == 'running', timeout=10)
        finally:
            r.shutdown()
        self.assertEqual(run.state, 'stopped')
        self.assertIsNone(r._thread)


class TestValidation(RunnerTestBase):
    def test_forbidden_permissions(self):
        r = self.make()
        for perm in ('bypassPermissions', 'auto', 'dontAsk', 'plop'):
            with self.assertRaises(ValidationError, msg=perm):
                r.enqueue('L2a.1', perm=perm)
        self.assertEqual(r.runs, {})
        for perm in ('acceptEdits', 'plan', 'manual'):
            r.enqueue('P.' + perm, perm=perm, lot='L2a')

    def test_params(self):
        r = self.make()
        bad = [
            dict(task='L2a.1', agent='root'),
            dict(task='L2a.1', model='Opus'),
            dict(task='L2a.1', model='a b'),
            dict(task='L2a.1', model='-x'),
            dict(task='L2a.1', model='a;rm'),
            dict(task='L2a.1', prio=4),
            dict(task='../x'),
            dict(task='a/b'),
            dict(task='L2a.1', worktree='.claude/stt-x'),
            dict(task='L2a.1', worktree='/tmp/x'),
            dict(task='L2a.1', worktree='.claude/worktrees/../../etc'),
            dict(task='L2a.1', worktree='.claude/worktrees/'),
            dict(task='L2a.1', worktree='.claude/worktrees//x'),
            dict(task='L2a.1', prompt='--dangerous'),
        ]
        for kw in bad:
            with self.assertRaises(ValidationError, msg=str(kw)):
                r.enqueue(**kw)
        r.enqueue('L2a.1', agent='revue', model='haiku-4.5', prio=1,
                  worktree='.claude/worktrees/stt-L2a')

    def test_worktree_symlink_escape(self):
        os.symlink('/tmp', os.path.join(self.root, '.claude', 'worktrees', 'evil'))
        r = self.make()
        with self.assertRaises(ValidationError):
            r.enqueue('L2a.1', worktree='.claude/worktrees/evil')

    def test_substitute_command(self):
        vals = {'agent': 'dev', 'model': 'sonnet', 'session': 'S', 'perm': 'plan',
                'task': 'T.1', 'prompt': 'P x', 'prompts_dir': '/p/d'}
        argv = stt_runner.substitute_command(stt_runner.RUNNER_COMMAND, vals)
        self.assertEqual(argv, ['claude', '--agent', 'stt-dev', '--model', 'sonnet',
                                '--session-id', 'S', '--add-dir', '/p/d', '--permission-mode', 'plan',
                                '-n', 'T.1', 'P x'])
        res = stt_runner.substitute_command(stt_runner.RUNNER_COMMAND, vals, resume=True)
        self.assertEqual(res[5:7], ['--resume', 'S'])
        self.assertNotIn('P x', res)
        self.assertNotIn('--session-id', res)

    def test_hook_exceptions_do_not_break(self):
        def boom(run):
            raise RuntimeError('x')
        r = self.make(on_change=boom)
        run = r.enqueue('L2a.1')
        self.assertEqual(run.state, 'queued')

    def test_guard(self):
        with self.assertRaises(AssertionError):
            helpers.assert_not_real_claude(['claude', '--x'])


class TestEnsureWorktree(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='stt-wt-')
        self.addCleanup(lambda: __import__('shutil').rmtree(self.tmp, ignore_errors=True))
        self.repo = os.path.join(self.tmp, 'repo')
        os.makedirs(self.repo)
        env = dict(os.environ, GIT_AUTHOR_NAME='t', GIT_AUTHOR_EMAIL='t@t',
                   GIT_COMMITTER_NAME='t', GIT_COMMITTER_EMAIL='t@t')
        for cmd in (['git', 'init', '-q', '-b', 'main'],
                    ['git', 'commit', '-q', '--allow-empty', '-m', 'init']):
            subprocess.run(cmd, cwd=self.repo, env=env, check=True)

    def test_create_idempotent_and_branch(self):
        path = stt_runner.ensure_worktree(self.repo, '.claude/worktrees/stt-L9', 'L9')
        self.assertTrue(os.path.isdir(path))
        branch = subprocess.run(['git', '-C', path, 'rev-parse', '--abbrev-ref', 'HEAD'],
                                capture_output=True, text=True).stdout.strip()
        self.assertEqual(branch, 'worktree-stt-L9')
        self.assertEqual(stt_runner.ensure_worktree(
            self.repo, '.claude/worktrees/stt-L9', 'L9'), path)

    def test_existing_branch_reused(self):
        subprocess.run(['git', '-C', self.repo, 'branch', 'worktree-stt-L8'], check=True)
        path = stt_runner.ensure_worktree(self.repo, '.claude/worktrees/stt-L8', 'L8')
        self.assertTrue(os.path.isdir(path))

    def test_refuses_bad_paths(self):
        for rel in ('.claude/worktrees/../x', 'other/x', '/abs', '.claude/worktrees/'):
            with self.assertRaises(ValidationError, msg=rel):
                stt_runner.ensure_worktree(self.repo, rel, 'L9')
        with self.assertRaises(ValidationError):
            stt_runner.ensure_worktree(self.repo, '.claude/worktrees/ok', 'l;9')

    def test_runner_creates_worktree_on_launch(self):
        cfg = os.path.join(self.tmp, 'cfg')
        r = Runner(os.path.join(self.repo, '.claude', 'stt-runner'), self.repo,
                   command=FAKE_CMD, stop_grace_s=0.4, prompts_dir=self.tmp, env={'CLAUDE_CONFIG_DIR': cfg})
        try:
            run = r.enqueue('L7.1')
            end = time.monotonic() + 10
            while run.state != 'running' and time.monotonic() < end:
                r.tick()
                time.sleep(0.02)
            self.assertEqual(run.state, 'running')
            self.assertTrue(os.path.isdir(os.path.join(self.repo, '.claude/worktrees/stt-L7')))
        finally:
            r.shutdown()


if __name__ == '__main__':
    unittest.main()
