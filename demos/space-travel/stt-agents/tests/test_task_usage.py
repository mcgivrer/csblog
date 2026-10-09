"""
T4.4 : comptabilite par tache (Transcript.tokens_since, jetons et duree depuis t_assign,
rapport agrege sur plusieurs sessions, pause budgetaire sur le delta). Aucun vrai `claude`.
"""

import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

import stt_agents_server as srv  # noqa: E402
import stt_runner  # noqa: E402

T0 = 1_800_000_000.0


def entry(mid, t, inp=0, out=0, cw=0, cr=0, sid="s1", text=None):
    ts = None if t is None else srv.iso(T0 + t)
    e = {"type": "assistant", "sessionId": sid, "cwd": "/w",
         "message": {"id": mid, "model": "claude-sonnet-5-5",
                     "usage": {"input_tokens": inp, "output_tokens": out,
                               "cache_creation_input_tokens": cw, "cache_read_input_tokens": cr},
                     "content": [{"type": "text", "text": text or "ok"}]}}
    if ts:
        e["timestamp"] = ts
    return e


def transcript(path, entries):
    tr = srv.Transcript(path)
    for e in entries:
        tr.handle(e)
    return tr


def total(t):
    return t["input"] + t["output"] + t["cache_write"]


class TokensSince(unittest.TestCase):
    def test_delta_from_timestamp(self):
        tr = transcript("/x/s1.jsonl", [entry("a", 0, inp=10, out=5), entry("b", 100, inp=20, out=7),
                                         entry("c", 200, inp=1, out=2, cw=3, cr=9)])
        self.assertEqual(total(tr.tokens_since(T0 + 100)), 27 + 6)
        t = tr.tokens_since(T0 + 100)
        self.assertEqual((t["input"], t["output"], t["cache_write"], t["cache_read"]), (21, 9, 3, 9))
        self.assertEqual(total(tr.tokens_since(T0 + 201)), 0)
        self.assertEqual(total(tr.tokens_since(None)), total(tr.tokens()))
        self.assertEqual(total(tr.tokens_since(0)), total(tr.tokens()))

    def test_same_message_counted_once(self):
        tr = transcript("/x/s1.jsonl", [entry("a", 0, out=1), entry("a", 1, out=9)])
        self.assertEqual(tr.tokens_since(T0)["output"], 9)
        self.assertEqual(tr.tokens()["output"], 9)

    def test_no_timestamps_counts_everything(self):
        tr = transcript("/x/s1.jsonl", [entry("a", None, inp=4, out=4), entry("b", None, inp=1)])
        self.assertEqual(total(tr.tokens_since(T0 + 50)), 9)

    def test_reset_clears(self):
        tr = transcript("/x/s1.jsonl", [entry("a", 0, inp=4)])
        tr.reset()
        self.assertEqual(total(tr.tokens_since(0)), 0)


class FakeHub:
    def __init__(self, trs):
        self.claude = SimpleNamespace(files={t.path: t for t in trs})


def glue(trs, now=T0 + 1000):
    g = object.__new__(srv.RunnerGlue)
    g.hub = FakeHub(trs)
    g.runner = SimpleNamespace(now=lambda: now, runs={})
    return g


def mkrun(task="T9.1", session="s1", **kw):
    r = stt_runner.Run.__new__(stt_runner.Run)
    for k in stt_runner.Run.PERSISTED:
        setattr(r, k, None)
    r.task, r.session, r.state, r.exit = task, session, "running", None
    r.sessions, r.paused_s, r.paused_at, r.ended, r.note = [], 0.0, None, None, None
    r.started = T0
    for k, v in kw.items():
        setattr(r, k, v)
    return r


class TaskUsage(unittest.TestCase):
    def setUp(self):
        self.s1 = transcript("/p/s1.jsonl", [entry("a", 0, inp=100, sid="s1", text="un"),
                                              entry("b", 100, inp=50, sid="s1", text="deux")])
        self.s2 = transcript("/p/s2.jsonl", [entry("c", 300, inp=7, out=3, sid="s2", text="trois")])

    def test_cold_unchanged(self):
        g = glue([self.s1])
        run = mkrun(t_assign=T0 - 1)
        self.assertEqual(g.tokens_of(run), 150)
        self.assertEqual(g.tokens_of(mkrun()), 150)

    def test_warm_window_uses_t_assign(self):
        g = glue([self.s1])
        self.assertEqual(g.tokens_of(mkrun(t_assign=T0 + 100)), 50)

    def test_sessions_aggregated(self):
        g = glue([self.s1, self.s2])
        run = mkrun(session="s2", sessions=["s1", "s2"], t_assign=T0 + 250)
        # tentative precedente (s1) en entier, session courante depuis t_assign
        self.assertEqual(g.tokens_of(run), 150 + 10)

    def test_unknown_session_ignored(self):
        g = glue([self.s1])
        self.assertEqual(g.tokens_of(mkrun(session="zz", sessions=["zz"])), 0)

    def test_report_two_sessions(self):
        g = glue([self.s1, self.s2])
        g.runner.runs["T9.1"] = run = mkrun(session="s2", sessions=["s1", "s2"], t_assign=T0 + 250)
        out = g.report("T9.1")
        self.assertEqual(out["usage"]["total_tokens"], 160)
        self.assertEqual(out["usage"]["input_tokens"], 157)
        self.assertEqual(out["usage"]["output_tokens"], 3)
        self.assertEqual(out["final_text"], "trois")
        self.assertEqual([s["session"] for s in out["sessions"]], ["s1", "s2"])
        self.assertEqual([s["usage"]["total_tokens"] for s in out["sessions"]], [150, 10])
        self.assertEqual(out["session"], "s2")
        self.assertIs(run, g.runner.runs["T9.1"])

    def test_report_cold_has_one_session(self):
        g = glue([self.s1])
        g.runner.runs["T9.1"] = mkrun()
        out = g.report("T9.1")
        self.assertEqual(out["usage"]["total_tokens"], 150)
        self.assertEqual(len(out["sessions"]), 1)

    def test_duration_since_t_assign(self):
        g = glue([self.s1], now=T0 + 1000)
        cold = mkrun(started=T0 + 10, t_assign=T0 + 5)
        self.assertEqual(g.duration_ms_of(cold), 990_000)
        # processus chaud demarre a T0, tache attribuee a T0+400
        warm = mkrun(started=T0, t_assign=T0 + 400)
        self.assertEqual(g.duration_ms_of(warm), 600_000)
        warm.paused_s = 100
        self.assertEqual(g.duration_ms_of(warm), 500_000)
        self.assertEqual(g.duration_ms_of(mkrun(started=T0)), 1_000_000)


class BudgetOnDelta(unittest.TestCase):
    def test_pause_compares_delta_not_session_total(self):
        """Le Runner recoit tokens_of : il met en pause sur le delta, pas sur le total de session."""
        s = transcript("/p/s1.jsonl", [entry("a", 0, inp=5000, sid="s1"), entry("b", 100, inp=30, sid="s1")])
        g = glue([s])
        run = mkrun(t_assign=T0 + 100, budget=100)
        tokens = g.tokens_of(run)
        self.assertEqual(tokens, 30)
        self.assertFalse(tokens > run.budget * stt_runner.BUDGET_PAUSE_FACTOR)
        run2 = mkrun(t_assign=T0 + 100, budget=10)
        self.assertTrue(g.tokens_of(run2) > run2.budget * stt_runner.BUDGET_PAUSE_FACTOR)


if __name__ == "__main__":
    unittest.main()
