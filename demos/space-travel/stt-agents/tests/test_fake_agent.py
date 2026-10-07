"""
Tests for fake_agent.py - the test fake Claude agent.
"""

import json
import os
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

import helpers


class FakeAgentTests(unittest.TestCase):
    """Test the fake agent."""

    @classmethod
    def setUpClass(cls):
        """Set up test fixtures."""
        cls.fake_agent_script = Path(__file__).parent / 'fake_agent.py'
        if not cls.fake_agent_script.exists():
            raise FileNotFoundError(f'fake_agent.py not found: {cls.fake_agent_script}')

    def setUp(self):
        """Set up per-test fixtures."""
        # Create temporary CLAUDE_CONFIG_DIR
        self.temp_dir = tempfile.mkdtemp(prefix='claude-config-')
        self.old_claude_config = os.environ.get('CLAUDE_CONFIG_DIR')
        os.environ['CLAUDE_CONFIG_DIR'] = self.temp_dir

        # Create temporary working directory
        self.work_dir = tempfile.mkdtemp(prefix='fake-agent-work-')

    def tearDown(self):
        """Clean up per-test fixtures."""
        # Restore original CLAUDE_CONFIG_DIR
        if self.old_claude_config:
            os.environ['CLAUDE_CONFIG_DIR'] = self.old_claude_config
        else:
            os.environ.pop('CLAUDE_CONFIG_DIR', None)

        # Clean up temp directories
        import shutil
        for d in [self.temp_dir, self.work_dir]:
            if os.path.exists(d):
                try:
                    shutil.rmtree(d)
                except Exception:
                    pass

    def _run_agent(self, session_id, prompt='', agent='test-agent', model='test-model'):
        """Helper to run fake agent."""
        cmd = [
            sys.executable, str(self.fake_agent_script),
            '--agent', agent,
            '--model', model,
            '--session-id', session_id,
            '--permission-mode', 'acceptEdits',
            '-n', 'test-task'
        ]
        if prompt:
            cmd.append(prompt)

        helpers.assert_not_real_claude(cmd)

        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=self.work_dir,
            text=True
        )
        return proc

    def _get_transcript(self, session_id):
        """Get transcript file path and load entries."""
        config_dir = Path(self.temp_dir)
        # Slugify work_dir path
        import re
        slug = re.sub(r'[^a-z0-9]+', '-', self.work_dir.lower().strip('-'))
        transcript_path = config_dir / 'projects' / slug / f'{session_id}.jsonl'

        if not transcript_path.exists():
            return []

        entries = []
        with open(transcript_path) as f:
            for line in f:
                line = line.strip()
                if line:
                    entries.append(json.loads(line))
        return entries

    def test_fake_agent_creates_transcript(self):
        """Test fake agent creates a valid transcript file."""
        session_id = 'test-session-001'
        proc = self._run_agent(session_id)
        proc.stdin.close()
        proc.wait(timeout=5)

        entries = self._get_transcript(session_id)
        self.assertGreater(len(entries), 0)

        # Should have user and assistant entries
        types = [e['type'] for e in entries]
        self.assertIn('user', types)
        self.assertIn('assistant', types)

    def test_fake_agent_writes_valid_jsonl(self):
        """Test fake agent writes valid JSONL."""
        session_id = 'test-session-002'
        proc = self._run_agent(session_id)
        proc.stdin.close()
        proc.wait(timeout=5)

        entries = self._get_transcript(session_id)
        for entry in entries:
            # Each entry must be a dict with 'type' and 'timestamp'
            self.assertIsInstance(entry, dict)
            self.assertIn('type', entry)
            self.assertIn('timestamp', entry)
            self.assertIn('type', entry)

    def test_fake_agent_exit_code(self):
        """Test fake agent EXIT command."""
        session_id = 'test-session-003'
        proc = self._run_agent(session_id, prompt='EXIT 3')
        proc.stdin.close()
        proc.wait(timeout=5)

        self.assertEqual(proc.returncode, 3)

    def test_fake_agent_exit_zero(self):
        """Test fake agent default exit code is 0."""
        session_id = 'test-session-004'
        proc = self._run_agent(session_id, prompt='test prompt')
        proc.stdin.close()
        proc.wait(timeout=5)

        self.assertEqual(proc.returncode, 0)

    def test_fake_agent_echo_input(self):
        """Test fake agent echoes stdin to stdout."""
        session_id = 'test-session-005'
        proc = self._run_agent(session_id)

        test_input = 'Hello, agent!\n'
        stdout, stderr = proc.communicate(input=test_input, timeout=5)

        # Output should contain the echoed input
        self.assertIn(test_input.strip(), stdout)

    def test_fake_agent_ignore_term(self):
        """Test fake agent IGNORE_TERM command."""
        session_id = 'test-session-006'
        proc = self._run_agent(session_id, prompt='IGNORE_TERM SLEEP 2')

        # Send SIGTERM - should be ignored
        time.sleep(0.1)
        proc.terminate()

        try:
            proc.wait(timeout=1)
            # If we get here, process died - that's a failure
            self.fail('Process died after SIGTERM despite IGNORE_TERM')
        except subprocess.TimeoutExpired:
            # Good, process is still alive
            # Now kill it
            proc.kill()
            proc.wait(timeout=5)
            self.assertEqual(proc.returncode, -signal.SIGKILL)

    def test_fake_agent_accepts_resume(self):
        """Test fake agent accepts --resume instead of --session-id."""
        session_id = 'test-session-007'
        cmd = [
            sys.executable, str(self.fake_agent_script),
            '--agent', 'test',
            '--model', 'test',
            '--resume', session_id,
            '--permission-mode', 'acceptEdits',
            '-n', 'test'
        ]

        helpers.assert_not_real_claude(cmd)

        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=self.work_dir,
            text=True
        )
        proc.stdin.close()
        proc.wait(timeout=5)

        # Should succeed (not require --session-id)
        self.assertNotEqual(proc.returncode, 2)  # argparse error

    def test_fake_agent_tokens_field(self):
        """Test fake agent TOKENS command writes usage."""
        session_id = 'test-session-008'
        proc = self._run_agent(session_id, prompt='TOKENS 500')
        proc.stdin.close()
        proc.wait(timeout=5)

        entries = self._get_transcript(session_id)
        # Find assistant entry with usage
        assistant_entries = [e for e in entries if e['type'] == 'assistant']
        self.assertGreater(len(assistant_entries), 0)

        assistant = assistant_entries[0]
        self.assertIn('message', assistant)
        msg = assistant['message']
        # Should have usage with output_tokens set to 500
        if 'usage' in msg:
            self.assertEqual(msg['usage'].get('output_tokens'), 500)


if __name__ == '__main__':
    unittest.main(verbosity=2)
