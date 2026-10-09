"""
T3.1 : --add-dir du dossier de prompts, GET /api/runner/<tache>/report, autoexit (/exit en fin de tour).
Runner direct pour l'argv et la mecanique d'autoexit ; serveur reel (faux agent) pour la route et le plan.
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

import helpers  # noqa: E402
import stt_runner  # noqa: E402
from test_api import Server  # noqa: E402
from test_runner import RunnerTestBase, FAKE_CMD  # noqa: E402

FAST = ['--waiting-silence', '0.5', '--autoexit-grace', '1.5', '--autoexit-kill-after', '2', '--stop-grace', '1']


def wait(cond, timeout=15, what='condition'):
    end = time.time() + timeout
    while time.time() < end:
        v = cond()
        if v:
            return v
        time.sleep(0.1)
    raise AssertionError('delai depasse : ' + what)


class AddDirTests(RunnerTestBase):
    def launch(self, command, prompt='x', prompts_dir=None, **kw):
        helpers.assert_not_real_claude(command)
        r = stt_runner.Runner(self.state_dir, self.root, command=command, stop_grace_s=0.4,
                              env={'CLAUDE_CONFIG_DIR': self.cfg, 'FAKE_ARGV_FILE': os.path.join(self.tmp, 'argv.json')},
                              prompts_dir=prompts_dir, **kw)
        self.runners.append(r)
        run = r.enqueue('L2a.1', prompt=prompt)
        r.tick()
        return r, run

    def test_add_dir_avant_permission_mode_et_prompt_dernier(self):
        pd = os.path.join(self.tmp, 'prompts')
        os.makedirs(pd)
        r, run = self.launch(FAKE_CMD, prompt='Execute la tache L2a.1', prompts_dir=pd)
        argvf = os.path.join(self.tmp, 'argv.json')
        wait(lambda: os.path.exists(argvf) and os.path.getsize(argvf) > 0, what='argv')
        argv = json.loads(Path(argvf).read_text())
        self.assertIn('--add-dir', argv)
        i = argv.index('--add-dir')
        self.assertEqual(argv[i + 1], pd)
        self.assertTrue(os.path.isabs(argv[i + 1]))
        self.assertLess(i, argv.index('--permission-mode'))
        self.assertEqual(argv[-1], 'Execute la tache L2a.1')
        r.kill('L2a.1')

    def test_commande_sans_prompts_dir(self):
        cmd = [sys.executable, str(HERE / 'fake_agent.py'), '--agent', 'stt-{agent}', '--model', '{model}',
               '--session-id', '{session}', '--permission-mode', '{perm}', '-n', '{task}', '{prompt}']
        r, run = self.launch(cmd)           # aucun prompts_dir fourni : valide
        wait(lambda: run.state in ('running', 'waiting', 'starting') and run.pid, what='lancement')
        self.assertNotEqual(run.state, 'failed')
        r.kill('L2a.1')

    def test_prompts_dir_invalide_echoue_au_lancement(self):
        for bad in (None, 'relatif/dir', os.path.join(self.tmp, 'absent'), '-x', '/tmp/a\nb'):
            self.setUp()
            r, run = self.launch(FAKE_CMD, prompts_dir=bad)
            self.assertEqual(run.state, 'failed', bad)
            self.assertIn('prompts_dir', run.note)

    def test_validate_prompts_dir(self):
        self.assertEqual(stt_runner.validate_prompts_dir(self.tmp), self.tmp)
        for bad in ('', '-a', 'rel', '/nope-xyz', '/tmp\x00', 5):
            with self.assertRaises(stt_runner.ValidationError):
                stt_runner.validate_prompts_dir(bad)


class AutoexitMechanics(RunnerTestBase):
    """Mecanique pure du Runner avec des crochets simules."""

    def make_runner(self, pending=False, ended=True, **kw):
        self.flags = {'pending': pending, 'ended': ended}
        r = stt_runner.Runner(self.state_dir, self.root, command=FAKE_CMD, stop_grace_s=0.5, prompts_dir=self.tmp,
                              env={'CLAUDE_CONFIG_DIR': self.cfg}, waiting_silence_s=0.3,
                              autoexit_grace_s=1.0, autoexit_kill_after_s=1.0,
                              turn_ended_of=lambda run: self.flags['ended'],
                              tool_pending_of=lambda run: self.flags['pending'], **kw)
        self.runners.append(r)
        return r

    def drive(self, r, cond, timeout=15):
        end = time.time() + timeout
        while time.time() < end:
            r.tick()
            if cond():
                return True
            time.sleep(0.1)
        return False

    def test_outil_en_attente_aucun_exit(self):
        r = self.make_runner(pending=True)
        run = r.enqueue('L2a.1', prompt='WAIT EXITCMD', autoexit=True)
        self.assertTrue(self.drive(r, lambda: run.state == 'waiting'))
        self.drive(r, lambda: False, timeout=3)
        self.assertEqual(run.state, 'waiting')
        self.assertIsNone(run.exit_sent)

    def test_reprise_remet_le_delai_a_zero(self):
        r = self.make_runner()
        run = r.enqueue('L2a.1', prompt='WAIT IGNOREEXIT', autoexit=True)
        self.assertTrue(self.drive(r, lambda: run.state == 'waiting'))
        t0 = run.waiting_since
        time.sleep(0.5)
        self.flags['ended'] = False          # l'agent reprend le travail
        self.assertTrue(self.drive(r, lambda: run.state == 'running'))
        self.assertIsNone(run.waiting_since)
        self.assertIsNone(run.exit_sent)
        self.flags['ended'] = True
        self.assertTrue(self.drive(r, lambda: run.state == 'waiting'))
        self.assertGreater(run.waiting_since, t0)
        self.assertIsNone(run.exit_sent)     # le delai est reparti de zero

    def test_sans_autoexit_jamais_touche(self):
        r = self.make_runner()
        run = r.enqueue('L2a.1', prompt='WAIT EXITCMD')
        self.assertTrue(self.drive(r, lambda: run.state == 'waiting'))
        self.drive(r, lambda: run.state != 'waiting', timeout=3.5)
        self.assertEqual(run.state, 'waiting')
        self.assertIsNone(run.exit_sent)

    def test_exit_puis_done(self):
        r = self.make_runner()
        run = r.enqueue('L2a.1', prompt='WAIT EXITCMD', autoexit=True)
        self.assertTrue(self.drive(r, lambda: run.state == 'done'))
        self.assertEqual(run.exit, 0)

    def test_exit_ignore_stoppe(self):
        r = self.make_runner()
        seen = []
        r.on_autoexit = lambda run: seen.append(run.task)
        run = r.enqueue('L2a.1', prompt='WAIT IGNOREEXIT', autoexit=True)
        self.assertTrue(self.drive(r, lambda: run.state in ('stopping', 'stopped')))
        self.assertTrue(self.drive(r, lambda: run.state == 'stopped'))
        self.assertEqual(seen, ['L2a.1'])    # /exit une seule fois

    def test_arret_dur_reste_arme_si_le_transcript_bouge(self):
        """claude ecrit au transcript en traitant /exit sans sortir : l'arret dur ne doit pas etre desarme."""
        r = self.make_runner()
        run = r.enqueue('L2a.1', prompt='WAIT IGNOREEXIT WRITEONEXIT', autoexit=True)
        self.assertTrue(self.drive(r, lambda: run.state == 'waiting'))
        self.assertTrue(self.drive(r, lambda: run.exit_sent is not None))
        self.flags['ended'] = False          # le transcript bouge : le tour n'est plus « termine »
        self.assertTrue(self.drive(r, lambda: run.state in ('stopping', 'stopped')))
        self.assertTrue(self.drive(r, lambda: run.state == 'stopped'))

    def test_autoexit_persiste_et_expose(self):
        r = self.make_runner()
        run = r.enqueue('L2a.1', prompt='SLEEP 0', autoexit=True)
        self.assertTrue(r.snapshot()['runs'][0]['autoexit'])
        self.assertTrue(run.to_dict()['autoexit'])
        self.assertTrue(stt_runner.Run.from_dict(run.to_dict()).autoexit)
        r.kill('L2a.1') if run.state in ('running', 'waiting', 'starting') else None


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = Server(runner=True, extra=FAST)

    @classmethod
    def tearDownClass(cls):
        cls.s.close()

    def tearDown(self):
        self.s.end_all()

    # -- report ---------------------------------------------------------------------------------
    def report_when(self, tid, cond, timeout=15):
        end = time.time() + timeout
        while time.time() < end:
            st, rep = self.s.call('GET', f'/api/runner/{tid}/report')
            if st == 200 and cond(rep):
                return rep
            time.sleep(0.3)
        raise AssertionError(f'rapport inattendu : {rep}')

    def test_report_nominal(self):
        s = self.s
        tid = s.create('WAIT TOKENS 123 CACHE 50 EDIT /repo/a.py', autostart=True)
        rep = self.report_when(tid, lambda r: r['final_text'])
        self.assertEqual(rep['task'], tid)
        self.assertIn(rep['state'], ('starting', 'running', 'waiting'))
        self.assertEqual(rep['final_text'], 'Task completed.')
        self.assertEqual(rep['usage'], {'input_tokens': 10, 'output_tokens': 123, 'cache_creation_input_tokens': 50,
                                        'cache_read_input_tokens': 100, 'total_tokens': 183})
        self.assertEqual(rep['tool_calls'], 1)
        self.assertEqual(rep['files_modified'], ['…/a.py'])   # hors worktree : « …/ » + nom de base
        self.assertGreaterEqual(rep['duration_ms'], 0)
        self.assertTrue(rep['session'])
        self.assertIsNotNone(rep['last_activity'])
        for k in ('exit', 'started', 'ended'):
            self.assertIn(k, rep)
        # jamais dans /api/state
        _, state = s.call('GET', '/api/state', token=False, origin=False)
        self.assertNotIn('final_text', json.dumps(state))

    def test_report_files_modified_relatifs(self):
        s = self.s
        long_name = 'n' * 400 + '.py'
        tid = s.create('WAIT EDIT CWD/sub/x.py', autostart=True)
        rep = self.report_when(tid, lambda r: r['final_text'])
        self.assertEqual(rep['files_modified'], ['sub/x.py'])      # dans le worktree : relatif
        tid = s.create('WAIT EDIT /etc/secret/passwd', autostart=True)
        rep = self.report_when(tid, lambda r: r['final_text'])
        self.assertEqual(rep['files_modified'], ['…/passwd'])      # hors worktree : jamais de chemin absolu
        tid = s.create('WAIT EDIT CWD/' + long_name, autostart=True)
        rep = self.report_when(tid, lambda r: r['final_text'])
        self.assertEqual(len(rep['files_modified'][0]), 300)

    def test_report_sans_transcript(self):
        s = self.s
        tid = s.create('SLEEP 0', autostart=False)
        st, _ = s.call('POST', f'/api/runner/{tid}/enqueue', {})
        self.assertEqual(st, 200)
        st, rep = s.call('GET', f'/api/runner/{tid}/report')
        self.assertEqual(st, 200)
        # le transcript peut ne pas etre encore collecte : champs neutres
        if rep['final_text'] is None:
            self.assertEqual(rep['usage']['total_tokens'], 0)
            self.assertEqual(rep['tool_calls'], 0)
            self.assertEqual(rep['files_modified'], [])
        self.assertEqual(rep['task'], tid)

    def test_report_403_et_404(self):
        s = self.s
        tid = s.create('WAIT', autostart=True)
        s.wait_state(tid, ('running', 'waiting', 'starting'))
        p = f'/api/runner/{tid}/report'
        self.assertEqual(s.call('GET', p, token=False)[0], 403)
        self.assertEqual(s.call('GET', p, token='mauvais')[0], 403)
        self.assertEqual(s.call('GET', p, origin=False)[0], 403)
        self.assertEqual(s.call('GET', p, origin='http://evil.example')[0], 403)
        self.assertEqual(s.call('GET', '/api/runner/Z9.9/report')[0], 404)

    # -- autoexit -------------------------------------------------------------------------------
    def test_autoexit_waits_exitcmd_done(self):
        s = self.s
        tid = s.create('WAIT EXITCMD', autostart=True, autoexit=True)
        self.assertTrue(s.run(tid) is not None and s.runner()['runs'])
        r = s.wait_state(tid, 'done', timeout=25)
        self.assertEqual(r['exit'], 0)
        self.assertTrue(r['autoexit'])
        s.wait_notice('runner_autoexit', tid)
        _, state = s.call('GET', '/api/state', token=False, origin=False)
        n = next(n for n in state['notices'] if n['kind'] == 'runner_autoexit' and n['target']['id'] == tid)
        self.assertEqual((n['cat'] if 'cat' in n else 'runner'), 'runner')
        self.assertEqual(n['severity'], 'info')

    def test_autoexit_ignoreexit_stoppe(self):
        s = self.s
        tid = s.create('WAIT IGNOREEXIT', autostart=True, autoexit=True)
        r = s.wait_state(tid, 'stopped', timeout=30)
        self.assertEqual(r['state'], 'stopped')

    def test_autoexit_question_jamais(self):
        s = self.s
        tid = s.create('QUESTION EXITCMD', autostart=True, autoexit=True)
        s.wait_state(tid, ('running', 'waiting'))
        time.sleep(6)                         # bien au-dela de grace + kill_after
        r = s.run(tid)
        self.assertIn(r['state'], ('running', 'waiting'))

    def test_autoexit_outil_en_attente_garde_isolee(self):
        """Le transcript finit sur un texte (tour « termine », waiting) mais un tool_use est sans resultat plus tot :
        seule la garde tool_pending_of retient le /exit."""
        s = self.s
        tid = s.create('PENDINGTEXT EXITCMD', autostart=True, autoexit=True)
        s.wait_state(tid, 'waiting', timeout=20)     # ended vrai : sans la garde, /exit partirait
        time.sleep(6)                                # bien au-dela de grace + kill_after
        self.assertEqual(s.run(tid)['state'], 'waiting')

    def test_sans_autoexit_reste_waiting(self):
        s = self.s
        tid = s.create('WAIT EXITCMD', autostart=True)
        s.wait_state(tid, 'waiting', timeout=20)
        time.sleep(4)
        self.assertEqual(s.run(tid)['state'], 'waiting')
        self.assertFalse(s.run(tid)['autoexit'])

    # -- champ et relecture -----------------------------------------------------------------------
    def test_validation_du_champ(self):
        s = self.s
        for bad in ('oui', 1, None, [], {}):
            st, out = s.call('POST', '/api/tasks', dict(lot='T9', title='t', agent='dev', model='sonnet', cx='M',
                                                        prompt='x', autoexit=bad))
            self.assertEqual(st, 400, bad)
            self.assertIn('autoexit', out['error'])
        tid = s.create('x', autostart=False, autoexit=True)
        self.assertIs(s.plan_row(tid)['autoexit'], True)
        tid2 = s.create('x', autostart=False, autoexit=False)
        self.assertNotIn('autoexit', s.plan_row(tid2))
        base = dict(title='t', agent='dev', model='sonnet', cx='M', prompt='y')
        self.assertEqual(s.call('POST', f'/api/tasks/{tid}/edit', dict(base, autoexit='x'))[0], 400)
        self.assertEqual(s.call('POST', f'/api/tasks/{tid}/edit', dict(base, autoexit=False))[0], 200)
        self.assertNotIn('autoexit', s.plan_row(tid))
        self.assertEqual(s.call('POST', f'/api/tasks/{tid}/edit', dict(base, autoexit=True))[0], 200)
        self.assertIs(s.plan_row(tid)['autoexit'], True)

    def test_relecture_a_l_enqueue(self):
        s = self.s
        tid = s.create('WAIT EXITCMD', autostart=False, autoexit=True)
        st, _ = s.call('POST', f'/api/runner/{tid}/enqueue', {})
        self.assertEqual(st, 200)
        self.assertTrue(s.run(tid)['autoexit'])
        s.wait_state(tid, 'done', timeout=25)

    def test_report_orphelin_409_via_route_inconnue_404(self):
        self.assertEqual(self.s.call('GET', '/api/runner/T9.1/report')[0], 404)


class ReportConflicts(unittest.TestCase):
    """Les vrais cas 409 de la route : run orphelin, lanceur désactivé."""

    def test_orphelin_409(self):
        import shutil
        import tempfile
        import types
        import stt_agents_server as srv
        from stt_notices import NoticeEngine
        tmp = tempfile.mkdtemp(prefix='stt-report-orphan-')
        try:
            kan = os.path.join(tmp, 'data', 'plan-status.js')
            os.makedirs(os.path.dirname(kan))
            Path(kan).write_text('window.PLAN_STATUS = {};\n', encoding='utf-8')
            hub = types.SimpleNamespace(notices=NoticeEngine(), claude=types.SimpleNamespace(files={}))
            args = types.SimpleNamespace(kanban=kan, main_root=tmp, repo=tmp)
            glue = srv.RunnerGlue(hub, args, command=[sys.executable, '-c', 'pass'])
            run = stt_runner.Run('T9.9', 'dev', 'sonnet', 'acceptEdits', 2, 's-1', '.claude/worktrees/stt-T9', 'T9')
            run.state = 'orphan'
            glue.runner.runs['T9.9'] = run
            with self.assertRaises(srv.HttpError) as cm:
                glue.report('T9.9')
            self.assertEqual(cm.exception.code, 409)
            self.assertIn('orphelin', cm.exception.message)
            with self.assertRaises(KeyError):
                glue.report('Z9.9')
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_lanceur_desactive_409(self):
        s = Server(runner=False)
        try:
            st, out = s.call('GET', '/api/runner/T9.2/report')
            self.assertEqual(st, 409)
            self.assertIn('lanceur', out['error'])
        finally:
            s.close()


if __name__ == '__main__':
    unittest.main()
