"""Tests de stt_notices (T2.1) : détection des événements, anti-bruit, intégration serveur."""

import http.client
import json
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import helpers
from stt_notices import NoticeEngine

ROOT = Path(__file__).resolve().parents[4]


class Clock:
    def __init__(self):
        self.t = 1_000_000.0

    def __call__(self):
        return self.t


def agent(aid="s1", state="running", label="Travaille", subs=()):
    return {"id": aid, "title": "Session " + aid, "branch": "b", "state": state, "state_label": label,
            "subagents": [{"id": i, "lifecycle": lc, "description": "tâche " + i} for i, lc in subs]}


def pr(num, state="open", merged=False):
    return {"number": num, "title": "PR " + str(num), "state": state, "merged": merged}


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.clk = Clock()
        self.e = NoticeEngine(clock=self.clk)

    def last(self):
        return self.e.recent(1)[0]

    def test_base_de_reference_sans_notice(self):
        self.e.observe([agent(state="waiting", subs=[("a", "erreur")])], [pr(1, "closed", True)])
        self.assertEqual(self.e.recent(), [])
        self.assertEqual(self.e.seq, 0)
        self.e.observe([agent(state="waiting", subs=[("a", "erreur")])], [pr(1, "closed", True)])
        self.assertEqual(self.e.recent(), [])

    def test_waiting_et_permission(self):
        self.e.observe([agent()])
        self.e.observe([agent(state="waiting")])
        n = self.last()
        self.assertEqual((n["cat"], n["severity"], n["kind"], n["target"]), ("attention", "attention", "agent_waiting", {"type": "agent", "id": "s1"}))
        self.e.observe([agent(state="permission")])
        n = self.last()
        self.assertEqual((n["cat"], n["severity"], n["kind"]), ("attention", "attention", "agent_permission"))
        self.assertEqual(len(self.e.recent()), 2)

    def test_pas_de_renotification_sans_changement(self):
        self.e.observe([agent()])
        self.e.observe([agent(state="waiting")])
        self.clk.t += 100
        self.e.observe([agent(state="waiting")])
        self.assertEqual(len(self.e.recent()), 1)

    def test_sous_agents(self):
        self.e.observe([agent(subs=[("a", "actif"), ("b", "actif"), ("c", "actif"), ("d", "actif")])])
        self.e.observe([agent(subs=[("a", "rapport rendu"), ("b", "arrêté"), ("c", "erreur"), ("d", "silencieux")])])
        got = {n["kind"]: (n["cat"], n["severity"], n["target"]) for n in self.e.recent()}
        self.assertEqual(got, {
            "agent_report": ("agents", "success", {"type": "agent", "id": "s1"}),
            "agent_stopped": ("agents", "info", {"type": "agent", "id": "s1"}),
            "agent_error": ("agents", "error", {"type": "agent", "id": "s1"}),
            "agent_silent": ("agents", "attention", {"type": "agent", "id": "s1"}),
        })

    def test_livre(self):
        self.e.observe([agent(state="idle", label="Inactif")])
        self.e.observe([agent(state="idle", label="Livré")])
        n = self.last()
        self.assertEqual((n["kind"], n["cat"], n["severity"]), ("agent_delivered", "agents", "success"))

    def test_pr(self):
        self.e.observe([], [pr(1), pr(2), pr(3)])
        self.e.observe([], [pr(1), pr(2, "closed", True), pr(3, "closed"), pr(4)])
        got = {n["kind"]: (n["cat"], n["severity"], n["target"]) for n in self.e.recent()}
        self.assertEqual(got, {
            "pr_merged": ("pr", "success", {"type": "pr", "id": 2}),
            "pr_closed": ("pr", "info", {"type": "pr", "id": 3}),
            "pr_opened": ("pr", "info", {"type": "pr", "id": 4}),
        })

    def test_pr_base_au_premier_appel_non_none(self):
        self.e.observe([agent()], None)
        self.e.observe([agent()], [pr(1)])      # base PR : rien
        self.assertEqual(self.e.recent(), [])
        self.e.observe([agent()], [pr(1), pr(2)])
        self.assertEqual([n["kind"] for n in self.e.recent()], ["pr_opened"])

    def test_kanban_changes(self):
        self.e.kanban_changes([
            {"op": "task", "id": "A.1", "avant": {"status": "doing"}, "status": "review"},
            {"op": "task", "id": "A.2", "avant": {"status": "review"}, "status": "done"},
            {"op": "task", "id": "A.3", "avant": {"status": "doing"}, "status": "blocked"},
            {"op": "task", "id": "A.4", "avant": {"progress": 1}, "status": "doing"},   # sans notice
            {"op": "task", "id": "A.5", "avant": {"status": "done"}, "status": "done"},  # inchangé
            {"op": "task_add", "id": "A.6"},
            {"op": "journal"},
        ])
        got = [(n["kind"], n["cat"], n["severity"], n["target"]) for n in self.e.recent()]
        self.assertEqual(got, [
            ("task_review", "kanban", "attention", {"type": "task", "id": "A.1"}),
            ("task_done", "kanban", "success", {"type": "task", "id": "A.2"}),
            ("task_blocked", "kanban", "error", {"type": "task", "id": "A.3"}),
            ("task_created", "kanban", "info", {"type": "task", "id": "A.6"}),
        ])

    def test_emit_runner(self):
        n = self.e.emit("run_failed", "runner", "error", "Lancement échoué", "x" * 300, {"type": "task", "id": "T1.1"}, "run:T1.1")
        self.assertLessEqual(len(n["body"]), 140)
        self.assertEqual(set(n), {"id", "ts", "kind", "cat", "severity", "title", "body", "target", "key"})
        self.assertRegex(n["ts"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$")
        with self.assertRaises(ValueError):
            self.e.emit("k", "nimporte", "info", "t")
        with self.assertRaises(ValueError):
            self.e.emit("k", "runner", "grave", "t")

    def test_deduplication(self):
        self.assertIsNotNone(self.e.emit("k", "runner", "info", "t", key="x"))
        self.clk.t += 29
        self.assertIsNone(self.e.emit("k", "runner", "info", "t", key="x"))
        self.assertIsNotNone(self.e.emit("k", "runner", "info", "t", key="y"))
        self.clk.t += 2   # 31 s après la première publication de x
        self.assertIsNotNone(self.e.emit("k", "runner", "info", "t", key="x"))
        self.assertEqual(self.e.seq, 3)

    def test_anneau_et_ids(self):
        e = NoticeEngine(max_items=200, clock=self.clk)
        for i in range(250):
            e.emit("k", "runner", "info", "t", key=f"k{i}")
        items = e.recent(1000)
        self.assertEqual(len(items), 200)
        self.assertEqual([n["id"] for n in items], list(range(51, 251)))   # croissants, jamais réutilisés
        self.assertEqual(len(e.recent()), 50)
        self.assertEqual(e.recent()[-1]["id"], 250)
        self.assertEqual(e.seq, 250)


def raw(port, method, path, headers=None, body=None):
    c = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
    c.request(method, path, body=body, headers=headers or {})
    r = c.getresponse()
    data = r.read().decode('utf-8', errors='replace')
    c.close()
    return r.status, data


class ServerIntegration(unittest.TestCase):
    def test_notice_kanban_dans_api_state(self):
        src = ROOT / 'demos/space-travel/docs/work_in_progress/plan-status.js'
        kb = helpers.copy_plan_status(str(src))
        with helpers.test_server(str(ROOT), kanban_path=kb) as srv:
            port = srv['port']
            helpers.wait_for_condition(lambda: 'notices' in json.loads(raw(port, 'GET', '/api/state')[1]), timeout=8)
            self.assertEqual(json.loads(raw(port, 'GET', '/api/state')[1])['notices'], [])
            h = {'X-STT-Kanban': '1', 'Content-Type': 'application/json'}
            _, html = raw(port, 'GET', '/')
            m = re.search(r'name="stt-token" content="([^"]+)"', html)
            if m:
                h.update({'X-STT-Token': m.group(1), 'Origin': f'http://127.0.0.1:{port}'})
            ops = [{'op': 'task', 'id': 'C0.1', 'set': {'status': 'review'}}]
            st, body = raw(port, 'POST', '/api/kanban', h, json.dumps({'ops': ops}))
            self.assertEqual(st, 200, body)
            self.assertEqual(json.loads(body)['changes'][0]['status'], 'review')

            def got():
                s = json.loads(raw(port, 'GET', '/api/state')[1])
                return s['notice_seq'] >= 1 and any(n['kind'] == 'task_review' for n in s['notices'])
            helpers.wait_for_condition(got, timeout=8)
            s = json.loads(raw(port, 'GET', '/api/state')[1])
            n = [n for n in s['notices'] if n['kind'] == 'task_review'][0]
            self.assertEqual((n['cat'], n['severity'], n['target']), ('kanban', 'attention', {'type': 'task', 'id': 'C0.1'}))
            # dry_run : aucune notice de plus
            raw(port, 'POST', '/api/kanban', h, json.dumps({'ops': [{'op': 'task', 'id': 'C0.1', 'set': {'status': 'done'}}], 'dry_run': True}))
            self.assertEqual(json.loads(raw(port, 'GET', '/api/state')[1])['notice_seq'], s['notice_seq'])


if __name__ == '__main__':
    unittest.main()
