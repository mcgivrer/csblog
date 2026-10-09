"""
Tests de l'équipe permanente (T4.2) : emplacements, files par profil, team.json,
state.json v2 + migration, _dispatch. Aucun vrai `claude` : faux agent.
"""

import json
import os
import stat
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

import stt_runner  # noqa: E402
from stt_runner import Runner, ValidationError, TransitionError  # noqa: E402
from test_runner import RunnerTestBase  # noqa: E402


def live(r, agent=None):
    return sorted(t for t, x in r.runs.items()
                  if x.state in ('starting', 'running') and (agent is None or x.agent == agent))


def queued(r, agent):
    return [q['task'] for q in r.team_snapshot()['queues'][agent]]


class TeamBase(RunnerTestBase):
    def team_file(self):
        return os.path.join(self.state_dir, 'team.json')

    def write_team(self, text):
        os.makedirs(self.state_dir, exist_ok=True)
        with open(self.team_file(), 'w') as f:
            f.write(text)

    def finish(self, r, task):
        """Termine une tâche (EOF => sortie 0) et attend que l'emplacement soit libre."""
        r.input(task, '\x04')
        self.until(r, lambda: r.runs[task].state == 'done')


class TestDefaultsAndFile(TeamBase):
    def test_default_without_team_json(self):
        r = self.make()
        self.assertEqual(r.team, {'cp': 1, 'archi': 1, 'dev': 3, 'revue': 2})
        ids = [s['id'] for s in r.team_snapshot()['slots']]
        self.assertEqual(ids, ['cp-1', 'archi-1', 'dev-1', 'dev-2', 'dev-3', 'revue-1', 'revue-2'])
        self.assertTrue(all(s['state'] == 'idle' for s in r.team_snapshot()['slots']))

    def test_invalid_team_json_falls_back(self):
        for bad in ('{pas du json', '[]', '{"v":1,"team":{"dev":9,"cp":1,"archi":1,"revue":1}}',
                    '{"v":1,"team":{"dev":"3","cp":1,"archi":1,"revue":1}}',
                    '{"v":1,"team":{"dev":5,"cp":1,"archi":2,"revue":3}}'):
            self.write_team(bad)
            r = self.make()
            self.assertEqual(r.team, {'cp': 1, 'archi': 1, 'dev': 3, 'revue': 2}, bad)
            self.assertTrue(r.team_error)

    def test_valid_team_json_loaded(self):
        self.write_team(json.dumps({'v': 1, 'team': {'cp': 0, 'archi': 2, 'dev': 1, 'revue': 0},
                                    'warm': False}))
        r = self.make()
        self.assertEqual(r.team, {'cp': 0, 'archi': 2, 'dev': 1, 'revue': 0})
        self.assertEqual([s['id'] for s in r.team_snapshot()['slots']],
                         ['archi-1', 'archi-2', 'dev-1'])

    def test_team_option_overrides_file(self):
        self.write_team(json.dumps({'v': 1, 'team': {'cp': 0, 'archi': 2, 'dev': 1, 'revue': 0}}))
        r = self.make(team={'cp': 1, 'archi': 1, 'dev': 2, 'revue': 1})
        self.assertEqual(r.team['dev'], 2)

    def test_parse_team(self):
        self.assertEqual(stt_runner.parse_team('cp=1,archi=0,dev=2,revue=3'),
                         {'cp': 1, 'archi': 0, 'dev': 2, 'revue': 3})
        with self.assertRaises(ValidationError):
            stt_runner.parse_team('dev=x')

    def test_bounds_refused(self):
        r = self.make()
        before = dict(r.team)
        for bad in ({'dev': 6}, {'dev': -1}, {'cp': 2}, {'archi': 3}, {'revue': 4},
                    {'dev': 5, 'archi': 2, 'revue': 2},     # somme hors CP = 9 > 8
                    {'dev': 2.0}, {'dev': '2'}, {'dev': True}, {'inconnu': 1}):
            with self.assertRaises(ValidationError, msg=str(bad)):
                r.set_team(bad)
        self.assertEqual(r.team, before)
        self.assertFalse(os.path.exists(self.team_file()))
        r.set_team({'dev': 4, 'archi': 2, 'revue': 2})              # 8 : accepté
        self.assertEqual(r.team['dev'], 4)

    def test_set_team_persists_private_and_logs(self):
        r = self.make()
        out = r.set_team({'dev': 2}, by='test')
        self.assertEqual(out['config']['dev'], 2)
        mode = stat.S_IMODE(os.stat(self.team_file()).st_mode)
        self.assertEqual(mode, 0o600)
        with open(self.team_file()) as f:
            data = json.load(f)
        self.assertEqual(data['team'], {'cp': 1, 'archi': 1, 'dev': 2, 'revue': 2})
        self.assertEqual(data['v'], 1)
        self.assertEqual(data['by'], 'test')
        with open(os.path.join(self.state_dir, 'team.log')) as f:
            line = json.loads(f.readlines()[-1])
        self.assertEqual(line['avant']['dev'], 3)
        self.assertEqual(line['après']['dev'], 2)
        r2 = self.make()                                            # rechargé au démarrage
        self.assertEqual(r2.team['dev'], 2)


class TestFeeding(TeamBase):
    def test_five_dev_three_launched_two_queued(self):
        r = self.make()
        for i in range(1, 6):
            r.enqueue('L2a.%d' % i)
        r.tick()
        self.assertEqual(len([t for t in r.runs if r.runs[t].state != 'queued']), 3)
        self.assertEqual(queued(r, 'dev'), ['L2a.4', 'L2a.5'])
        slots = {s['id']: s for s in r.team_snapshot()['slots']}
        self.assertEqual({slots['dev-%d' % n]['task'] for n in (1, 2, 3)},
                         {'L2a.1', 'L2a.2', 'L2a.3'})
        self.assertEqual(sorted(r.runs[t].inst for t in ('L2a.1', 'L2a.2', 'L2a.3')), [1, 2, 3])
        self.assertEqual(r.runs['L2a.1'].slot, 'dev-1')
        self.assertIsNotNone(r.runs['L2a.1'].t_assign)

    def test_fifo_and_head_never_skipped(self):
        r = self.make(team={'cp': 1, 'archi': 1, 'dev': 1, 'revue': 1})
        for i in range(1, 5):
            r.enqueue('L2a.%d' % i)
        r.tick()
        self.assertEqual(live(r, 'dev'), ['L2a.1'])
        order = []
        for _ in range(3):
            cur = live(r, 'dev')[0]
            self.until(r, lambda: r.runs[cur].state == 'running')
            self.finish(r, cur)
            self.until(r, lambda: any(x.state in ('starting', 'running')
                                      for x in r.runs.values() if x.agent == 'dev'))
            order.append(live(r, 'dev')[0])
        self.assertEqual(order, ['L2a.2', 'L2a.3', 'L2a.4'])

    def test_slot_back_to_idle_then_next(self):
        r = self.make(team={'cp': 0, 'archi': 0, 'dev': 1, 'revue': 0})
        r.enqueue('L2a.1')
        r.tick()
        self.until(r, lambda: r.runs['L2a.1'].state == 'running')
        self.finish(r, 'L2a.1')
        r.tick()
        slot = r.team_snapshot()['slots'][0]
        self.assertEqual(slot['state'], 'idle')
        self.assertIsNone(slot['task'])
        self.assertEqual(slot['done_count'], 1)

    def test_priority_classes_with_fifo_inside(self):
        r = self.make(team={'cp': 0, 'archi': 0, 'dev': 1, 'revue': 0})
        r.enqueue('L2a.1')                                          # prend l'emplacement
        r.tick()
        r.enqueue('L2a.2', prio=3)
        r.enqueue('L2a.3', prio=2)
        r.enqueue('L2a.4', prio=1)
        r.enqueue('L2a.5', prio=2)
        r.enqueue('L2a.6', prio=1)
        self.assertEqual(queued(r, 'dev'), ['L2a.4', 'L2a.6', 'L2a.3', 'L2a.5', 'L2a.2'])
        self.assertEqual([q['rank'] for q in r.team_snapshot()['queues']['dev']], [1, 2, 3, 4, 5])
        order = []
        for _ in range(5):
            r.kill(live(r, 'dev')[0] if live(r, 'dev') else next(
                t for t, x in r.runs.items() if x.state in ('starting', 'running')))
            r.tick()
            order.append([t for t, x in r.runs.items() if x.state in ('starting', 'running')][0])
        self.assertEqual(order, ['L2a.4', 'L2a.6', 'L2a.3', 'L2a.5', 'L2a.2'])

    def test_queues_are_per_profile(self):
        r = self.make(team={'cp': 1, 'archi': 1, 'dev': 1, 'revue': 1})
        r.enqueue('L2a.1')
        r.enqueue('L2a.2')                                          # dev, attend
        r.enqueue('A.1', agent='archi', lot='L2a')
        r.enqueue('R.1', agent='revue', lot='L2a')
        r.tick()
        self.assertEqual(sorted(live(r)), ['A.1', 'L2a.1', 'R.1'])  # la file dev ne bloque pas les autres
        self.assertEqual(queued(r, 'dev'), ['L2a.2'])

    def test_cp_never_fed(self):
        r = self.make()
        r.enqueue('C.1', agent='cp', lot='L2a')
        for _ in range(3):
            r.tick()
        self.assertEqual(r.runs['C.1'].state, 'queued')
        self.assertEqual(queued(r, 'cp'), ['C.1'])
        self.assertEqual({s['id']: s for s in r.team_snapshot()['slots']}['cp-1']['state'], 'idle')

    def test_total_bound_team_max(self):
        r = self.make(team={'cp': 0, 'archi': 2, 'dev': 5, 'revue': 1})     # 8
        for i in range(1, 6):
            r.enqueue('L2a.%d' % i)
        r.enqueue('A.1', agent='archi', lot='L2a')
        r.enqueue('A.2', agent='archi', lot='L2a')
        r.enqueue('R.1', agent='revue', lot='L2a')
        r.tick()
        self.assertEqual(len(live(r)), 8)
        self.assertEqual(stt_runner.TEAM_MAX, 8)


class TestResize(TeamBase):
    def test_raise_creates_idle_slots_and_feeds(self):
        r = self.make(team={'cp': 1, 'archi': 1, 'dev': 1, 'revue': 1})
        for i in range(1, 4):
            r.enqueue('L2a.%d' % i)
        r.tick()
        self.assertEqual(queued(r, 'dev'), ['L2a.2', 'L2a.3'])
        out = r.set_team({'dev': 3})
        self.assertEqual(out['draining'], [])
        ids = [s['id'] for s in r.team_snapshot()['slots'] if s['profile'] == 'dev']
        self.assertEqual(ids, ['dev-1', 'dev-2', 'dev-3'])
        r.tick()
        self.assertEqual(queued(r, 'dev'), [])

    def test_lower_drains_busy_without_killing(self):
        r = self.make()
        for i in range(1, 4):
            r.enqueue('L2a.%d' % i)
        r.tick()
        for t in ('L2a.1', 'L2a.2', 'L2a.3'):
            self.until(r, lambda t=t: r.runs[t].state == 'running')
        out = r.set_team({'dev': 1})
        self.assertEqual(sorted(out['draining']), ['dev-2', 'dev-3'])
        slots = {s['id']: s for s in r.team_snapshot()['slots']}
        self.assertEqual(slots['dev-2']['state'], 'draining')
        self.assertEqual(slots['dev-3']['state'], 'draining')
        self.assertEqual(slots['dev-1']['state'], 'busy')
        self.assertEqual(live(r, 'dev'), ['L2a.1', 'L2a.2', 'L2a.3'])   # rien n'est tué
        # un draining n'est plus alimenté
        r.enqueue('L2a.4')
        self.finish(r, 'L2a.2')
        r.tick()
        ids = [s['id'] for s in r.team_snapshot()['slots'] if s['profile'] == 'dev']
        self.assertEqual(ids, ['dev-1', 'dev-3'])                       # dev-2 retiré après sa tâche
        self.assertEqual(r.runs['L2a.4'].state, 'queued')
        self.finish(r, 'L2a.3')
        r.tick()
        ids = [s['id'] for s in r.team_snapshot()['slots'] if s['profile'] == 'dev']
        self.assertEqual(ids, ['dev-1'])
        self.assertEqual(r.runs['L2a.4'].state, 'queued')               # dev-1 encore occupé
        self.finish(r, 'L2a.1')
        r.tick()
        self.assertIn(r.runs['L2a.4'].state, ('starting', 'running'))
        self.assertEqual(r.runs['L2a.4'].slot, 'dev-1')

    def test_lower_removes_idle_at_once(self):
        r = self.make()
        out = r.set_team({'dev': 1, 'revue': 0})
        self.assertEqual(out['draining'], [])
        ids = [s['id'] for s in r.team_snapshot()['slots']]
        self.assertEqual(ids, ['cp-1', 'archi-1', 'dev-1'])

    def test_raise_again_cancels_draining(self):
        r = self.make()
        for i in range(1, 4):
            r.enqueue('L2a.%d' % i)
        r.tick()
        r.set_team({'dev': 1})
        r.set_team({'dev': 3})
        states = {s['id']: s['state'] for s in r.team_snapshot()['slots'] if s['profile'] == 'dev'}
        self.assertNotIn('draining', states.values())
        self.assertEqual(len(states), 3)

    def test_profile_zero_keeps_queue(self):
        r = self.make(team={'cp': 1, 'archi': 0, 'dev': 1, 'revue': 1})
        r.enqueue('A.1', agent='archi', lot='L2a')
        r.enqueue('A.2', agent='archi', lot='L2a')
        for _ in range(3):
            r.tick()
        self.assertEqual(queued(r, 'archi'), ['A.1', 'A.2'])
        self.assertFalse([s for s in r.team_snapshot()['slots'] if s['profile'] == 'archi'])
        r.set_team({'archi': 1})
        r.tick()
        self.assertEqual(queued(r, 'archi'), ['A.2'])                   # la file gardée est servie


class TestQueueLimits(TeamBase):
    def test_per_profile_and_total_limits(self):
        r = self.make(team={'cp': 0, 'archi': 0, 'dev': 0, 'revue': 0})  # rien ne part
        for i in range(50):
            r.enqueue('T%d.1' % i, lot='L2a')
        with self.assertRaises(TransitionError):
            r.enqueue('T50.1', lot='L2a')                           # 51e dev : refusé
        for i in range(50):
            r.enqueue('A%d.1' % i, agent='archi', lot='L2a')
        for i in range(50):
            r.enqueue('R%d.1' % i, agent='revue', lot='L2a')
        self.assertEqual(sum(1 for x in r.runs.values() if x.state == 'queued'), 150)
        with self.assertRaises(TransitionError):
            r.enqueue('C0.1', agent='cp', lot='L2a')                # 150 au total
        with self.assertRaises(TransitionError):
            r.enqueue('R50.1', agent='revue', lot='L2a')
        self.assertNotIn('T50.1', r.runs)


class TestPersistence(TeamBase):
    def test_v2_state_and_queue_reload(self):
        r = self.make(team={'cp': 0, 'archi': 0, 'dev': 0, 'revue': 0})
        r.enqueue('L2a.1', prio=2)
        r.enqueue('L2a.2', prio=1)
        r.enqueue('L2a.3', prio=2)
        with open(os.path.join(self.state_dir, 'state.json')) as f:
            data = json.load(f)
        self.assertEqual(data['v'], 2)
        self.assertIn('slots', data)
        r2 = self.make(team={'cp': 0, 'archi': 0, 'dev': 0, 'revue': 0})
        r2.load_state()
        self.assertEqual(queued(r2, 'dev'), ['L2a.2', 'L2a.1', 'L2a.3'])
        r2.enqueue('L2a.4', prio=2)                                 # l'ordre d'arrivée reprend après
        self.assertEqual(queued(r2, 'dev')[-1], 'L2a.4')

    def test_restart_feeds_queue_in_order(self):
        r = self.make(team={'cp': 0, 'archi': 0, 'dev': 0, 'revue': 0})
        for i in range(1, 4):
            r.enqueue('L2a.%d' % i)
        r2 = self.make(team={'cp': 0, 'archi': 0, 'dev': 1, 'revue': 0})
        r2.load_state()
        r2.tick()
        self.assertEqual(live(r2), ['L2a.1'])
        self.assertEqual(queued(r2, 'dev'), ['L2a.2', 'L2a.3'])

    def test_migration_v1(self):
        os.makedirs(self.state_dir, exist_ok=True)
        base = {'agent': 'dev', 'model': 'sonnet', 'perm': 'acceptEdits', 'prio': 2,
                'worktree': '.claude/worktrees/stt-L2a', 'lot': 'L2a'}
        v1 = {'version': 1, 'runs': [
            dict(base, task='L2a.1', session='s1', state='done', inst=2, order=1, ended=5.0),
            dict(base, task='L2a.2', session='s2', state='queued', order=3, enqueued=3.0),
            dict(base, task='L2a.3', session='s3', state='queued', order=2, enqueued=2.0, prio=1),
            dict(base, task='L2a.4', session='s4', state='running', inst=1, order=4,
                 pid=999999, proc_start='x'),
        ]}
        with open(os.path.join(self.state_dir, 'state.json'), 'w') as f:
            json.dump(v1, f)
        r = self.make(team={'cp': 0, 'archi': 0, 'dev': 0, 'revue': 0})
        r.load_state()
        self.assertEqual(sorted(r.runs), ['L2a.1', 'L2a.2', 'L2a.3', 'L2a.4'])
        self.assertEqual(r.runs['L2a.1'].slot, 'dev-2')
        self.assertEqual(r.runs['L2a.1'].inst, 2)
        self.assertEqual(r.runs['L2a.1'].attempts, 0)
        self.assertEqual(r.runs['L2a.4'].state, 'stopped')          # processus disparu
        self.assertEqual(queued(r, 'dev'), ['L2a.3', 'L2a.2'])
        with open(os.path.join(self.state_dir, 'state.json')) as f:
            data = json.load(f)
        self.assertEqual(data['v'], 2)
        self.assertEqual(len(data['runs']), 4)

    def test_orphan_keeps_its_slot(self):
        import subprocess
        p = subprocess.Popen(['sleep', '30'], start_new_session=True)
        self.extra_procs.append(p)
        os.makedirs(self.state_dir, exist_ok=True)
        run = {'agent': 'dev', 'model': 'sonnet', 'perm': 'acceptEdits', 'prio': 2,
               'worktree': '.claude/worktrees/stt-L2a', 'lot': 'L2a', 'task': 'L2a.1',
               'session': 's1', 'state': 'running', 'inst': 2, 'order': 1, 'pid': p.pid,
               'pgid': p.pid, 'proc_start': stt_runner.process_start_tag(p.pid)}
        with open(os.path.join(self.state_dir, 'state.json'), 'w') as f:
            json.dump({'version': 1, 'runs': [run]}, f)
        r = self.make(team={'cp': 0, 'archi': 0, 'dev': 2, 'revue': 0})
        r.load_state()
        self.assertEqual(r.runs['L2a.1'].state, 'orphan')
        slots = {s['id']: s for s in r.team_snapshot()['slots']}
        self.assertEqual(slots['dev-2']['task'], 'L2a.1')
        self.assertEqual(slots['dev-2']['state'], 'orphan')
        self.assertEqual(slots['dev-1']['state'], 'idle')
        r.enqueue('L2a.2')
        r.enqueue('L2a.3')
        r.tick()
        self.assertEqual(r.runs['L2a.2'].slot, 'dev-1')             # dev-2 reste occupé
        self.assertEqual(r.runs['L2a.3'].state, 'queued')


if __name__ == '__main__':
    unittest.main()
