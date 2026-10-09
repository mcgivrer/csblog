"""
T3.8 : liste d'autorisations des agents (--settings). Aucun vrai `claude` : faux agent et serveur reel.
"""

import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

import helpers  # noqa: E402
import stt_agent_settings as sas  # noqa: E402
import stt_runner  # noqa: E402
from test_api import Server, SERVER  # noqa: E402
from test_report_autoexit import wait  # noqa: E402
from test_runner import RunnerTestBase  # noqa: E402

GOOD = {'permissions': {'allow': ['Bash(git status*)', 'Read(~/x/**)'], 'deny': ['Bash(nc *)']}}


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='stt-as-test-')

    def write(self, data, mode=0o600, name='p.json'):
        p = os.path.join(self.tmp, name)
        Path(p).write_text(data if isinstance(data, str) else json.dumps(data), encoding='utf-8')
        os.chmod(p, mode)
        return p

    def bad(self, data, **kw):
        with self.assertRaises(sas.SettingsError):
            sas.validate_settings_file(self.write(data, **kw))

    def test_accepte(self):
        for mode in (0o600, 0o644):
            allow, deny = sas.validate_settings_file(self.write(GOOD, mode=mode))
            self.assertEqual(allow, GOOD['permissions']['allow'])
            self.assertEqual(deny, ['Bash(nc *)'])

    def test_fichier_du_depot_valide(self):
        allow, deny = sas.validate_settings_file(str(HERE.parent / 'agent-permissions.json'))
        for r in ('Read(~/Projects/web/csblog/**)', 'Bash(python3 -m unittest *)', 'Bash(node --test *)',
                  'Bash(python3 build.py compile)', 'Bash(git branch --show-current)'):
            self.assertEqual(allow.count(r), 1, r)

    def test_lien_symbolique(self):
        p = self.write(GOOD)
        ln = os.path.join(self.tmp, 'ln.json')
        os.symlink(p, ln)
        with self.assertRaises(sas.SettingsError):
            sas.validate_settings_file(ln)

    def test_mode_inscriptible_par_les_autres(self):
        self.bad(GOOD, mode=0o666)

    def test_trop_gros(self):
        self.bad(json.dumps({'permissions': {'allow': ['Bash(ls*)'], 'deny': []}}) + ' ' * (sas.MAX_BYTES + 1))

    def test_absent_ou_dossier(self):
        for p in (os.path.join(self.tmp, 'nope.json'), self.tmp):
            with self.assertRaises(sas.SettingsError):
                sas.validate_settings_file(p)

    def test_cles_inconnues(self):
        self.bad({'permissions': {'allow': []}, 'env': {}})
        self.bad({'permissions': {'allow': [], 'ask': []}})
        self.bad({'env': {}})

    def test_types_faux(self):
        for d in ([], {'permissions': []}, {'permissions': {'allow': 'x'}}, {'permissions': {'allow': [1]}},
                  {'permissions': {'deny': [None]}}, {'permissions': {'allow': ['']}},
                  {'permissions': {'allow': ['a\nb(x)']}}, {'permissions': {'allow': ['Bash(' + 'a' * 300 + ')']}}):
            self.bad(d)

    def test_trop_de_regles(self):
        self.bad({'permissions': {'allow': ['Bash(ls %d)' % i for i in range(sas.MAX_RULES + 1)]}})

    def test_doublon(self):
        self.bad({'permissions': {'allow': ['Bash(ls*)', 'Bash(ls*)']}})
        self.bad({'permissions': {'deny': ['Bash(nc *)', 'Bash(nc *)']}})

    def test_json_invalide(self):
        self.bad('{"permissions": ')
        self.bad(b'\xff'.decode('latin1'))

    def test_regles_trop_larges(self):
        for r in ('Bash', 'Edit', 'Write', '*', 'Bash(*)', 'Bash()', 'Bash(python3 *)', 'Bash(python *)', 'Bash(sh *)',
                  'Bash(bash *)', 'Bash(rm*)', 'Bash(curl*)', 'Bash(git push*)', 'Bash(git reset*)', 'Bash(gh *)',
                  'Read(~/.ssh/**)', 'Edit(**/stt-agents/data/**)'):
            self.bad({'permissions': {'allow': [r]}})


class MergeTests(unittest.TestCase):
    def test_union_sans_doublon(self):
        out = sas.merge_deny(['Bash(nc *)', 'Bash(gh *)'])
        self.assertEqual(len(out), len(set(out)))
        self.assertEqual(out[0], 'Bash(nc *)')
        for r in sas.MANDATORY_DENY:
            self.assertIn(r, out)
        self.assertEqual(len(sas.MANDATORY_DENY), 25)

    def test_fichier_effectif_0600_atomique(self):
        tmp = tempfile.mkdtemp(prefix='stt-as-eff-')
        victim = os.path.join(tmp, 'victim')
        Path(victim).write_text('intact')
        os.symlink(victim, os.path.join(tmp, sas.EFFECTIVE_NAME))   # lien posé d'avance : jamais suivi
        p = sas.write_effective(tmp, ['Bash(ls*)'], [])
        self.assertEqual(p, os.path.join(tmp, sas.EFFECTIVE_NAME))
        st = os.lstat(p)
        self.assertTrue(stat.S_ISREG(st.st_mode))
        self.assertEqual(st.st_mode & 0o777, 0o600)
        self.assertEqual(Path(victim).read_text(), 'intact')
        d = json.loads(Path(p).read_text())
        self.assertEqual(d['permissions']['allow'], ['Bash(ls*)'])
        self.assertEqual(set(d['permissions']['deny']), set(sas.MANDATORY_DENY))
        self.assertEqual(os.listdir(tmp).count(sas.EFFECTIVE_NAME), 1)
        self.assertFalse([n for n in os.listdir(tmp) if n.endswith('.tmp')])
        sas.write_effective(tmp, ['Bash(pwd)'], ['Bash(nc *)'])      # réécriture
        self.assertEqual(json.loads(Path(p).read_text())['permissions']['allow'], ['Bash(pwd)'])


class RunnerArgvTests(RunnerTestBase):
    def launch(self, command, settings_path=None):
        helpers.assert_not_real_claude(command)
        r = stt_runner.Runner(self.state_dir, self.root, command=command, stop_grace_s=0.4, settings_path=settings_path,
                              env={'CLAUDE_CONFIG_DIR': self.cfg, 'FAKE_ARGV_FILE': os.path.join(self.tmp, 'argv.json')},
                              prompts_dir=self.tmp)
        self.runners.append(r)
        run = r.enqueue('L2a.1', prompt='Execute la tache L2a.1')
        r.tick()
        return r, run

    def argv(self):
        f = os.path.join(self.tmp, 'argv.json')
        wait(lambda: os.path.exists(f) and os.path.getsize(f) > 0, what='argv')
        return json.loads(Path(f).read_text())

    def test_commande_par_defaut(self):
        self.assertNotIn('--settings', stt_runner.default_command(False))
        cmd = stt_runner.default_command(True)
        self.assertEqual(cmd[cmd.index('--settings') + 1], '{settings}')
        self.assertEqual(cmd[-1], '{prompt}')
        self.assertEqual(cmd[-2], '{task}')

    def test_argv_contient_settings(self):
        eff = sas.write_effective(self.tmp, ['Bash(ls*)'], [])
        cmd = [sys.executable, str(HERE / 'fake_agent.py')] + stt_runner.default_command(True)[1:]
        r, run = self.launch(cmd, eff)
        argv = self.argv()
        self.assertEqual(argv[argv.index('--settings') + 1], eff)
        self.assertEqual(argv[-1], 'Execute la tache L2a.1')
        self.assertTrue(r.snapshot()['caps']['settings'])
        r.kill('L2a.1')

    def test_sans_settings_absent(self):
        cmd = [sys.executable, str(HERE / 'fake_agent.py')] + stt_runner.default_command(False)[1:]
        r, run = self.launch(cmd)
        self.assertNotIn('--settings', self.argv())
        self.assertFalse(r.snapshot()['caps']['settings'])
        r.kill('L2a.1')

    def test_placeholder_sans_fichier_echoue(self):
        cmd = [sys.executable, str(HERE / 'fake_agent.py')] + stt_runner.default_command(True)[1:]
        r, run = self.launch(cmd, None)
        self.assertEqual(run.state, 'failed')
        self.assertIn('settings', run.note)


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='stt-as-srv-')
        self.src = os.path.join(self.tmp, 'perm.json')
        Path(self.src).write_text(json.dumps({'permissions': {'allow': ['Bash(secret-marker-xyz *)'], 'deny': []}}))
        os.chmod(self.src, 0o600)

    def test_explicite_effectif_et_pas_de_fuite(self):
        s = Server(extra=['--agent-settings', self.src])
        try:
            eff = os.path.join(s.repo, '.claude', 'stt-runner', sas.EFFECTIVE_NAME)
            self.assertEqual(os.stat(eff).st_mode & 0o777, 0o600)
            d = json.loads(Path(eff).read_text())
            self.assertEqual(d['permissions']['allow'], ['Bash(secret-marker-xyz *)'])
            self.assertIn('Bash(git push*)', d['permissions']['deny'])
            st, txt = s.raw('GET', '/api/runner')
            self.assertEqual(st, 200)
            self.assertTrue(json.loads(txt)['caps']['settings'])
            self.assertNotIn('secret-marker-xyz', txt)
            self.assertNotIn(sas.EFFECTIVE_NAME, txt)
            self.assertNotIn('perm.json', txt)
        finally:
            s.close()

    def test_none_desactive(self):
        s = Server(extra=['--agent-settings', 'none'])
        try:
            self.assertFalse(s.runner()['caps']['settings'])
            self.assertFalse(os.path.exists(os.path.join(s.repo, '.claude', 'stt-runner', sas.EFFECTIVE_NAME)))
        finally:
            s.close()

    def test_defaut_utilise_le_fichier_du_depot(self):
        s = Server()
        try:
            self.assertTrue(s.runner()['caps']['settings'])
        finally:
            s.close()

    def refuse(self, path):
        repo = tempfile.mkdtemp(prefix='stt-as-repo-')
        subprocess.run(['git', 'init', '-q', '-b', 'main', repo], check=True)
        kanban = os.path.join(repo, 'plan-status.js')
        Path(kanban).write_text('window.PLAN={tasks:[],lots:[]};')
        r = subprocess.run([sys.executable, str(SERVER), '--no-github', '--port', str(helpers.find_free_port()),
                            '--repo', repo, '--kanban', kanban, '--runner', '--agent-settings', path],
                           capture_output=True, text=True, timeout=30)
        self.assertEqual(r.returncode, 2, r.stderr)
        self.assertIn('--agent-settings refusé', r.stderr)

    def test_chemin_explicite_invalide_refuse_le_demarrage(self):
        self.refuse(os.path.join(self.tmp, 'absent.json'))
        bad = os.path.join(self.tmp, 'bad.json')
        Path(bad).write_text('{"permissions": {"allow": ["Bash"]}}')
        self.refuse(bad)


if __name__ == '__main__':
    unittest.main()
