"""Tests T1.11 : base du worktree, verrou inter-processus du plan, consigne anti-écriture,
sérialisation édition/mise en file. Dépôts et plans temporaires ; aucun vrai `claude`."""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
from test_api import Server, PLAN, git  # noqa: E402
import stt_runner  # noqa: E402

LIVE = ('running', 'waiting', 'done', 'failed', 'stopped')


def make_branch(repo, name, fname):
    """Crée la branche `name` portant un fichier en plus (dépôt temporaire uniquement)."""
    git('checkout', '-q', '-b', name, cwd=repo)
    Path(repo, fname).write_text(name)
    git('add', fname, cwd=repo)
    git('commit', '-q', '-m', name, cwd=repo)
    git('checkout', '-q', 'main', cwd=repo)


def current_branch(path):
    return subprocess.run(['git', '-C', str(path), 'branch', '--show-current'],
                          capture_output=True, text=True).stdout.strip()


class BaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = Server(runner=True)
        txt = Path(cls.s.kanban).read_text(encoding='utf-8')
        extra = ''.join('    { id: "%s", title: "Lot %s", status: "todo", budget: 100000, est0: 100000, cx: "L" },\n' % (x, x) for x in ('B1', 'B2'))
        Path(cls.s.kanban).write_text(txt.replace('    { id: "T8"', extra + '    { id: "T8"', 1), encoding='utf-8')
        make_branch(cls.s.repo, 'feat-x', 'extra-x.txt')
        make_branch(cls.s.repo, 'feat/y', 'extra-y.txt')

    @classmethod
    def tearDownClass(cls):
        cls.s.end_all()
        cls.s.close()

    def post(self, **kw):
        body = dict(lot='T9', title='T', agent='dev', model='sonnet', cx='M', prompt='SLEEP 0', autostart=False)
        body.update(kw)
        return self.s.call('POST', '/api/tasks', body)

    def edit_body(self, **kw):
        b = dict(title='T', agent='dev', model='sonnet', cx='M', prompt='p')
        b.update(kw)
        return b

    def test_invalid_base_400(self):
        for b in ('..', 'a/../b', '-x', '--upload-pack=x', 'a b', 'inconnue', 'feat/', 12, ['main'], 'x;ls', 'a..b'):
            st, out = self.post(base=b)
            self.assertEqual(st, 400, (b, out))
        tid = self.s.create(autostart=False)
        for b in ('..', '-x', 'inconnue'):
            st, out = self.s.call('POST', f'/api/tasks/{tid}/edit', self.edit_body(base=b))
            self.assertEqual(st, 400, (b, out))
        self.assertNotIn('base', self.s.plan_row(tid))

    def test_valid_base_stored_and_dropped(self):
        st, out = self.post(base='feat/y')
        self.assertEqual(st, 200, out)
        self.assertEqual(self.s.plan_row(out['id'])['base'], 'feat/y')
        st, out2 = self.post(base='main')
        self.assertEqual(st, 200)
        self.assertNotIn('base', self.s.plan_row(out2['id']))
        st, o = self.s.call('POST', f"/api/tasks/{out['id']}/edit", self.edit_body(base='feat-x'))
        self.assertEqual(st, 200, o)
        self.assertEqual(self.s.plan_row(out['id'])['base'], 'feat-x')
        st, o = self.s.call('POST', f"/api/tasks/{out['id']}/edit", self.edit_body(base=''))
        self.assertEqual(st, 200, o)
        self.assertNotIn('base', self.s.plan_row(out['id']))

    def test_new_worktree_from_base(self):
        s = self.s
        tid = s.create(autostart=True, lot='B1', worktree='.claude/worktrees/wt-from-x', base='feat-x')
        s.wait_state(tid, LIVE)
        wt = Path(s.repo, '.claude/worktrees/wt-from-x')
        self.assertTrue((wt / 'extra-x.txt').is_file())
        self.assertFalse((wt / 'extra-y.txt').exists())
        self.assertEqual(current_branch(wt), 'worktree-stt-B1')

    def test_existing_worktree_ignores_base(self):
        s = self.s
        wt = Path(s.repo, '.claude/worktrees/wt-exists')
        git('worktree', 'add', '-q', '-b', 'br-exists', str(wt), 'main', cwd=s.repo)
        tid = s.create(autostart=True, worktree='.claude/worktrees/wt-exists', base='feat-x')
        s.wait_state(tid, LIVE)
        self.assertFalse((wt / 'extra-x.txt').exists())
        self.assertEqual(current_branch(wt), 'br-exists')

    def test_known_task_enqueue_reads_base(self):
        s = self.s
        tid = s.create(autostart=False, lot='B2', worktree='.claude/worktrees/wt-late', base='feat/y')
        st, out = s.call('POST', f'/api/runner/{tid}/enqueue', {})
        self.assertEqual(st, 200, out)
        s.wait_state(tid, LIVE)
        self.assertTrue(Path(s.repo, '.claude/worktrees/wt-late/extra-y.txt').is_file())

    def test_api_worktrees(self):
        s = self.s
        git('worktree', 'add', '-q', '-b', 'br-listed', str(Path(s.repo, '.claude/worktrees/wt-listed')), 'main', cwd=s.repo)
        st, out = s.call('GET', '/api/worktrees', token=False, origin=False)
        self.assertEqual(st, 200)
        self.assertEqual(set(out), {'worktrees', 'branches'})
        self.assertIn({'path': '.claude/worktrees/wt-listed', 'branch': 'br-listed'}, out['worktrees'])
        self.assertTrue(all(w['path'].startswith('.claude/worktrees/') for w in out['worktrees']))
        for b in ('main', 'feat-x', 'feat/y', 'br-listed'):
            self.assertIn(b, out['branches'])
        self.assertIn('enabled', s.runner())

    def test_anti_write_phrase_in_argv(self):
        s = self.s
        tid = s.create(autostart=True)
        s.wait_state(tid, LIVE)
        argv = Path(s.prompts, tid + '.argv').read_text(encoding='utf-8')
        for frag in ('Règles : ne modifie jamais data/plan-status.js ni kanban.html',
                     'ne change pas le statut de ta tâche (le serveur le fait)',
                     'reste dans ton worktree', 'rends un rapport court à la fin.'):
            self.assertIn(frag, argv)
        self.assertFalse(argv.startswith('-'))
        self.assertLess(len(argv), 700)

    def test_edit_enqueue_concurrent(self):
        s = self.s
        for i in range(6):
            tid = s.create(autostart=False, cx='S', model='sonnet', prio=2)
            after = dict(title='Apres', agent='dev', model='opus', cx='XL', prio=1,
                         worktree=f'.claude/worktrees/stt-ee{i}', perm='plan', prompt='SLEEP 0')
            res = {}
            go = threading.Barrier(2)

            def do_edit():
                go.wait()
                res['edit'] = s.call('POST', f'/api/tasks/{tid}/edit', after)

            def do_enq():
                go.wait()
                res['enq'] = s.call('POST', f'/api/runner/{tid}/enqueue', {})

            ts = [threading.Thread(target=do_edit), threading.Thread(target=do_enq)]
            for t in ts:
                t.start()
            for t in ts:
                t.join()
            self.assertEqual(res['enq'][0], 200, res)
            self.assertIn(res['edit'][0], (200, 409), res)
            run = s.run(tid)
            key = (run['model'], run['prio'], run['perm'], run['worktree'])
            before = ('sonnet', 2, 'acceptEdits', '.claude/worktrees/stt-T9')
            post = ('opus', 1, 'plan', f'.claude/worktrees/stt-ee{i}')
            self.assertIn(key, (before, post), key)
            if res['edit'][0] == 409:
                self.assertEqual(key, before)
            s.end_all()


class FileLockTests(unittest.TestCase):
    DRIVER = (
        "import sys\n"
        "sys.path.insert(0, sys.argv[1])\n"
        "import stt_agents_server as m\n"
        "p, who, kind = sys.argv[2], sys.argv[3], sys.argv[4]\n"
        "for i in range(20):\n"
        "    if kind == 'journal':\n"
        "        op = {'op': 'journal', 'text': '%s-%d' % (who, i)}\n"
        "    else:\n"
        "        op = {'op': 'task_add', 'task': {'id': 'T9.%s%02d' % (who, i), 'lot': 'T9', 'title': 't', 'agent': 'dev',\n"
        "              'model': 'sonnet', 'status': 'todo', 'progress': 0, 'budget': 1000}}\n"
        "    m.kanban_apply(p, [op])\n"
    )

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='stt-lock-')
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.plan = os.path.join(self.tmp, 'plan-status.js')
        Path(self.plan).write_text(PLAN, encoding='utf-8')

    def read(self):
        code = "global.window={};require(process.argv[1]);console.log(JSON.stringify(window.PLAN))"
        return json.loads(subprocess.run(['node', '-e', code, self.plan], capture_output=True, text=True, check=True).stdout)

    def run_two(self, kind, ids):
        procs = [subprocess.Popen([sys.executable, '-c', self.DRIVER, str(HERE.parent), self.plan, w, kind],
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for w in ids]
        for p in procs:
            _, err = p.communicate(timeout=120)
            self.assertEqual(p.returncode, 0, err)

    def test_two_processes_journal(self):
        self.run_two('journal', ('a', 'b'))
        texts = {j['text'] for j in self.read()['journal']}
        for w in 'ab':
            for i in range(20):
                self.assertIn(f'{w}-{i}', texts)

    def test_two_processes_task_add(self):
        self.run_two('task', ('a', 'b'))
        ids = {t['id'] for t in self.read()['tasks']}
        for w in 'ab':
            for i in range(20):
                self.assertIn(f'T9.{w}{i:02d}', ids)

    def test_lock_file_mode_and_timeout(self):
        import fcntl
        import stt_agents_server as m
        m.kanban_apply(self.plan, [{'op': 'journal', 'text': 'x'}])
        lock = m.plan_lock_path(self.plan)
        self.assertEqual(os.path.basename(lock), '.plan.lock')
        self.assertEqual(os.stat(lock).st_mode & 0o777, 0o600)
        fd = os.open(lock, os.O_RDWR)
        fcntl.flock(fd, fcntl.LOCK_EX)
        old = m.PLAN_LOCK_TIMEOUT
        m.PLAN_LOCK_TIMEOUT = 0.3
        try:
            with self.assertRaises(m.KanbanError) as cm:
                m.kanban_apply(self.plan, [{'op': 'journal', 'text': 'y'}])
            self.assertIn('verrouillé', str(cm.exception))
        finally:
            m.PLAN_LOCK_TIMEOUT = old
            os.close(fd)
        m.kanban_apply(self.plan, [{'op': 'journal', 'text': 'z'}])

    def test_lock_in_private_dir(self):
        import tempfile as _t
        import stt_agents_server as m
        ld = os.path.join(self.tmp, 'priv')
        m.kanban_apply(self.plan, [{'op': 'journal', 'text': 'x'}], lock_dir=ld)
        self.assertEqual(os.stat(ld).st_mode & 0o777, 0o700)
        self.assertEqual(os.stat(os.path.join(ld, 'plan.lock')).st_mode & 0o777, 0o600)
        self.assertEqual([n for n in os.listdir(_t.gettempdir()) if n.startswith('stt-plan-locks')], [])

    def test_server_lock_in_runner_dir(self):
        s = Server(runner=True)
        try:
            s.create(autostart=False)
            lock = Path(s.repo, '.claude/stt-runner/plan.lock')
            self.assertTrue(lock.is_file())
            self.assertEqual(lock.stat().st_mode & 0o777, 0o600)
        finally:
            s.end_all()
            s.close()

    def test_lax_dir_refused(self):
        import stt_agents_server as m
        ld = os.path.join(self.tmp, 'lax')
        os.mkdir(ld)
        os.chmod(ld, 0o777)
        with self.assertRaises(m.KanbanError) as cm:
            m.kanban_apply(self.plan, [{'op': 'journal', 'text': 'x'}], lock_dir=ld)
        self.assertIn('refusé', str(cm.exception))
        self.assertNotIn('x', [j['text'] for j in self.read()['journal']])

    def test_foreign_owner_refused(self):
        import stt_agents_server as m
        from unittest import mock
        ld = os.path.join(self.tmp, 'foreign')
        os.mkdir(ld, 0o700)
        real = os.lstat(ld)
        fake = os.stat_result((real.st_mode, real.st_ino, real.st_dev, real.st_nlink, os.getuid() + 1,
                               real.st_gid, real.st_size, 0, 0, 0))
        with mock.patch.object(m.os, 'lstat', return_value=fake):
            with self.assertRaises(m.KanbanError) as cm:
                m.kanban_apply(self.plan, [{'op': 'journal', 'text': 'x'}], lock_dir=ld)
        self.assertIn('propriétaire', str(cm.exception))

    def test_symlink_dir_and_file_refused(self):
        import stt_agents_server as m
        real = os.path.join(self.tmp, 'real')
        os.mkdir(real, 0o700)
        link = os.path.join(self.tmp, 'linkdir')
        os.symlink(real, link)
        with self.assertRaises(m.KanbanError):
            m.kanban_apply(self.plan, [{'op': 'journal', 'text': 'x'}], lock_dir=link)
        ld = os.path.join(self.tmp, 'ok')
        os.mkdir(ld, 0o700)
        target = os.path.join(self.tmp, 'target')
        Path(target).write_text('')
        os.symlink(target, os.path.join(ld, 'plan.lock'))
        with self.assertRaises(m.KanbanError):
            m.kanban_apply(self.plan, [{'op': 'journal', 'text': 'x'}], lock_dir=ld)

    def test_readonly_dir_clear_error(self):
        import stt_agents_server as m
        if os.getuid() == 0:
            self.skipTest('root ignore les droits')
        ld = os.path.join(self.tmp, 'ro')
        os.mkdir(ld, 0o500)
        self.addCleanup(os.chmod, ld, 0o700)
        with self.assertRaises(m.KanbanError) as cm:
            m.kanban_apply(self.plan, [{'op': 'journal', 'text': 'x'}], lock_dir=ld)
        self.assertIn('verrou', str(cm.exception))


class ValidateBaseTests(unittest.TestCase):
    def test_validate_base(self):
        for ok in ('main', 'worktree-stt-L2a', 'feat/y', 'a.b_c-d'):
            self.assertEqual(stt_runner.validate_base(ok), ok)
        for bad in ('', '-x', '..', 'a/../b', 'a b', '/x', 'a//b', 'x.lock', None, 3):
            with self.assertRaises(stt_runner.ValidationError):
                stt_runner.validate_base(bad)


if __name__ == '__main__':
    unittest.main()
