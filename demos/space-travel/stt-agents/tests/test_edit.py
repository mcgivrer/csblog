"""Tests de POST /api/tasks/<id>/edit (T1.10). Serveur réel sur plan temporaire ; aucun vrai `claude`."""

import os
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
from test_api import Server  # noqa: E402


class EditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = Server(runner=True)

    @classmethod
    def tearDownClass(cls):
        cls.s.end_all()
        cls.s.close()

    def body(self, **kw):
        b = dict(title='Nouveau titre', agent='archi', model='opus', cx='XL', prio=1,
                 worktree='.claude/worktrees/stt-edit', perm='plan', prompt='Nouveau prompt **md**')
        b.update(kw)
        return b

    def edit(self, tid, body, **kw):
        return self.s.call('POST', f'/api/tasks/{tid}/edit', body, **kw)

    def todo(self, **kw):
        return self.s.create('Ancien prompt', autostart=False, **kw)

    def test_nominal(self):
        s = self.s
        tid = self.todo(cx='S', title='Ancien', prio=3)
        before = s.plan_row(tid)
        self.assertEqual(before['budget'], 40000)
        st, out = self.edit(tid, self.body(docs=[{'f': 'a/b.md', 'r': 'lu'}]))
        self.assertEqual(st, 200, out)
        self.assertEqual(out, {'ok': True, 'id': tid, 'budget': 300000, 'prompt': f'stt-agents/data/prompts/{tid}.md'})
        row = s.plan_row(tid)
        self.assertEqual((row['title'], row['agent'], row['model'], row['cx']), ('Nouveau titre', 'archi', 'opus', 'XL'))
        self.assertEqual((row['budget'], row['est0']), (300000, 300000))
        self.assertEqual((row['prio'], row['perm'], row['worktree']), (1, 'plan', '.claude/worktrees/stt-edit'))
        self.assertEqual(row['docs'], [{'f': 'a/b.md', 'r': 'lu'}])
        self.assertEqual((row['id'], row['lot'], row['status']), (tid, 'T9', 'todo'))
        self.assertEqual(row['prompt'], out['prompt'])
        self.assertEqual(Path(s.prompts, tid + '.md').read_text(encoding='utf-8'), 'Nouveau prompt **md**\n')
        # plan toujours valide et autres tâches intactes
        self.assertEqual(s.plan_row('T9.1')['title'], 'Existante')
        st, state = s.call('GET', '/api/state', token=False, origin=False)
        self.assertEqual(st, 200)

    def test_defaults_drop_keys(self):
        s = self.s
        tid = self.todo(worktree='.claude/worktrees/stt-x', perm='plan', prio=3)
        self.assertIn('worktree', s.plan_row(tid))
        st, out = self.edit(tid, dict(title='T', agent='dev', model='sonnet', cx='M', prompt='p', worktree='', perm='acceptEdits', prio=2))
        self.assertEqual(st, 200, out)
        row = s.plan_row(tid)
        for k in ('worktree', 'perm', 'prio'):
            self.assertNotIn(k, row)
        self.assertEqual(row['budget'], 80000)

    def test_no_prompt_file_created(self):
        s = self.s
        tid = self.todo()
        os.remove(os.path.join(s.prompts, tid + '.md'))
        st, out = self.edit(tid, self.body())
        self.assertEqual(st, 200, out)
        self.assertTrue(Path(s.prompts, tid + '.md').is_file())

    def test_auth(self):
        tid = self.todo()
        self.assertEqual(self.edit(tid, self.body(), token=False)[0], 403)
        self.assertEqual(self.edit(tid, self.body(), origin=False)[0], 403)
        self.assertEqual(self.edit(tid, self.body(), origin='http://evil.example')[0], 403)
        self.assertEqual(self.s.plan_row(tid)['title'], 'Tache de test')

    def test_unknown_404(self):
        self.assertEqual(self.edit('T9.999', self.body())[0], 404)

    def test_not_todo_409(self):
        st, out = self.edit('T9.1', self.body())
        self.assertEqual(st, 409)
        self.assertIn('À faire', out['error'])
        self.assertEqual(self.edit('T9.P', self.body())[0], 409)

    def test_known_by_runner_409(self):
        s = self.s
        tid = s.create('SLEEP 0', autostart=True)
        s.wait_state(tid, ('starting', 'running', 'waiting', 'done', 'failed', 'stopped'))
        s.end_all()
        row = s.wait_row(tid, lambda r: r.get('status') in ('blocked', 'review') and 'ended' in r)
        # remet la ligne à « todo » sans clé réservée : seul le lanceur connaît encore la tâche
        txt = Path(s.kanban).read_text(encoding='utf-8')
        clean = ('    { id: "%s", lot: "T9", title: "Connue", agent: "dev", model: "sonnet", status: "todo", '
                 'progress: 0, budget: 40000 }' % tid)
        lines = []
        for ln in txt.split('\n'):
            if ('id: "%s"' % tid) in ln:
                ln = clean + (',' if ln.rstrip().endswith(',') else '')
            lines.append(ln)
        Path(s.kanban).write_text('\n'.join(lines), encoding='utf-8')
        now = s.plan_row(tid)
        self.assertEqual(now['status'], 'todo')
        self.assertFalse({'runner', 'session', 'runState', 'started', 'ended'} & set(now))
        self.assertIsNotNone(s.run(tid))
        st, out = self.edit(tid, self.body())
        self.assertEqual(st, 409, (out, row))
        self.assertIn('lanceur', out['error'])

    def test_reserved_key_409(self):
        s = self.s
        txt = Path(s.kanban).read_text(encoding='utf-8')
        marker = '    { id: "T9.P",'
        row = '    { id: "T9.R", lot: "T9", title: "Reservee", agent: "dev", model: "sonnet", status: "todo", progress: 0, budget: 40000, session: "abc" },\n'
        Path(s.kanban).write_text(txt.replace(marker, row + marker, 1), encoding='utf-8')
        st, out = self.edit('T9.R', self.body())
        self.assertEqual(st, 409, out)
        self.assertIn('session', out['error'])

    def test_validation_400(self):
        s = self.s
        tid = self.todo()
        for kw in (dict(cx='ZZ'), dict(cx=3), dict(model='mauvais modèle!'), dict(perm='bypassPermissions'),
                   dict(perm='inconnue'), dict(worktree='/tmp/ailleurs'), dict(worktree='foo'),
                   dict(worktree='.claude/worktrees/../x'), dict(prompt='   '), dict(prompt=''), dict(title=''),
                   dict(agent='cp'), dict(prio=9), dict(docs=[{'f': '../x', 'r': 'lu'}])):
            st, out = self.edit(tid, self.body(**kw))
            self.assertEqual(st, 400, (kw, out))
        self.assertEqual(self.edit(tid, [1])[0], 400)
        row = s.plan_row(tid)
        self.assertEqual((row['title'], row['cx']), ('Tache de test', 'M'))
        self.assertEqual(Path(s.prompts, tid + '.md').read_text(encoding='utf-8'), 'Ancien prompt\n')

    def test_lot_and_autostart_ignored(self):
        tid = self.todo()
        st, out = self.edit(tid, self.body(lot='T8', autostart=True))
        self.assertEqual(st, 200, out)
        row = self.s.plan_row(tid)
        self.assertEqual(row['lot'], 'T9')
        self.assertNotIn('runner', row)
        self.assertIsNone(self.s.run(tid))


if __name__ == '__main__':
    unittest.main()
