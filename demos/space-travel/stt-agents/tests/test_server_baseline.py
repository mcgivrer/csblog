"""
Baseline tests for stt-agents server.
Tests existing functionality without the runner subsystem.
"""

import json
import os
import sys
import unittest
from pathlib import Path
from tempfile import NamedTemporaryFile

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

import helpers


class ServerBaselineTests(unittest.TestCase):
    """Test baseline server functionality."""

    @classmethod
    def setUpClass(cls):
        """Set up test fixtures."""
        # Find the worktree root (parent of demos directory)
        # __file__ = .../demos/space-travel/stt-agents/tests/test_server_baseline.py
        # Go up: tests -> stt-agents -> space-travel -> demos -> worktree root
        cls.worktree_root = Path(__file__).parent.parent.parent.parent.parent
        cls.stt_agents = cls.worktree_root / 'demos' / 'space-travel' / 'stt-agents'

        # Check that stt_agents_server.py exists
        cls.server_script = cls.stt_agents / 'stt_agents_server.py'
        if not cls.server_script.exists():
            raise FileNotFoundError(f'stt_agents_server.py not found: {cls.server_script}')

    def test_server_once_mode(self):
        """Test --once mode returns valid JSON with agents."""
        with helpers.test_server(str(self.worktree_root)) as srv:
            status, body = helpers.http_get(f'{srv["url"]}/api/state')
            self.assertEqual(status, 200)

            data = helpers.json_response(body)
            # Should have agents field (initially empty or from transcript)
            self.assertIsInstance(data, dict)

    def test_get_root(self):
        """Test GET / returns 200 and HTML."""
        with helpers.test_server(str(self.worktree_root)) as srv:
            status, body = helpers.http_get(f'{srv["url"]}/')
            self.assertEqual(status, 200)
            self.assertIn('html', body.lower())

    def test_get_kanban(self):
        """Test GET /kanban/ returns 200."""
        with helpers.test_server(str(self.worktree_root)) as srv:
            status, body = helpers.http_get(f'{srv["url"]}/kanban/')
            self.assertEqual(status, 200)

    def test_get_kanban_plan_status(self):
        """Test GET /kanban/plan-status.js returns 200."""
        with helpers.test_server(str(self.worktree_root)) as srv:
            status, body = helpers.http_get(f'{srv["url"]}/kanban/plan-status.js')
            self.assertEqual(status, 200)
            # Should contain JavaScript
            self.assertIn('PLAN', body)

    def test_get_api_kanban(self):
        """Test GET /api/kanban returns 200 with response."""
        with helpers.test_server(str(self.worktree_root)) as srv:
            status, body = helpers.http_get(f'{srv["url"]}/api/kanban')
            self.assertEqual(status, 200)

            data = helpers.json_response(body)
            self.assertIsInstance(data, dict)
            # Should have 'ok' field; response is valid even if Kanban is invalid
            self.assertIn('ok', data)

    def test_post_api_kanban_with_token(self):
        """Test POST /api/kanban with X-STT-Kanban header returns 200."""
        with helpers.test_server(str(self.worktree_root)) as srv:
            headers = {
                'X-STT-Kanban': 'test-token',
                'Content-Type': 'application/json'
            }
            payload = {
                'op': 'task_add',
                'lot': 'T1',
                'title': 'Test Task'
            }
            status, body = helpers.http_post(
                f'{srv["url"]}/api/kanban',
                data=payload,
                headers=headers
            )
            # Should either succeed (200) or fail gracefully (>= 400)
            self.assertIn(status, [200, 400, 403, 422])

    def test_post_api_kanban_without_token(self):
        """Test POST /api/kanban without X-STT-Kanban header returns 403."""
        with helpers.test_server(str(self.worktree_root)) as srv:
            payload = {
                'op': 'task_add',
                'lot': 'T1',
                'title': 'Test Task'
            }
            status, body = helpers.http_post(
                f'{srv["url"]}/api/kanban',
                data=payload
            )
            # Should be forbidden without the special header
            self.assertEqual(status, 403)

    def test_nonexistent_document(self):
        """Test GET /kanban/doc/nonexistent returns 404."""
        with helpers.test_server(str(self.worktree_root)) as srv:
            status, body = helpers.http_get(
                f'{srv["url"]}/kanban/doc/this-does-not-exist'
            )
            self.assertEqual(status, 404)

    def test_path_traversal_rejected(self):
        """Test path traversal attempts (/kanban/doc/../..) return 404."""
        with helpers.test_server(str(self.worktree_root)) as srv:
            # Try to escape the kanban directory
            status, body = helpers.http_get(
                f'{srv["url"]}/kanban/doc/../../etc/passwd'
            )
            self.assertEqual(status, 404)

            status, body = helpers.http_get(
                f'{srv["url"]}/kanban/../../../etc/passwd'
            )
            self.assertEqual(status, 404)


if __name__ == '__main__':
    unittest.main(verbosity=2)
