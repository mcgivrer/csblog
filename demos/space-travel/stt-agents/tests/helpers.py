"""
Test helpers for stt-agents server tests.
Provides utilities for test server setup, HTTP requests, and assertions.
"""

import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.error
from pathlib import Path
from contextlib import contextmanager


def assert_not_real_claude(cmd):
    """Fail if cmd[0] is 'claude' (guard against running real agent)."""
    if not cmd or cmd[0] == 'claude':
        raise AssertionError(f'Must not run real claude command: {cmd}')


def find_free_port():
    """Find a free port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        s.listen(1)
        port = s.getsockname()[1]
    return port


def copy_plan_status(source_path):
    """
    Copy plan-status.js to a temporary file.
    Returns the path to the temporary copy.
    """
    if not Path(source_path).exists():
        raise FileNotFoundError(f'plan-status.js not found: {source_path}')

    fd, temp_path = tempfile.mkstemp(suffix='.js', prefix='plan-status-')
    os.close(fd)
    shutil.copy2(source_path, temp_path)
    return temp_path


@contextmanager
def test_server(repo_path, kanban_path=None, port=None):
    """
    Context manager: start test server, yield port and cleanup.

    Args:
        repo_path: Path to the worktree repository
        kanban_path: Path to kanban data file (optional)
        port: Specific port to use (optional, finds free port if not given)

    Yields:
        dict with keys: port, url, process
    """
    if port is None:
        port = find_free_port()

    if not kanban_path:
        # Create a temporary kanban copy if not provided
        default_kanban = Path(repo_path) / 'demos/space-travel/stt-agents/data/plan-status.js'
        if default_kanban.exists():
            kanban_path = copy_plan_status(str(default_kanban))
        else:
            # Create empty temporary kanban
            fd, kanban_path = tempfile.mkstemp(suffix='.js', prefix='plan-status-')
            os.write(fd, b'window.PLAN = {tasks: []};')
            os.close(fd)

    # Build server command
    stt_agents_dir = Path(repo_path) / 'demos/space-travel/stt-agents'
    server_script = stt_agents_dir / 'stt_agents_server.py'

    if not server_script.exists():
        raise FileNotFoundError(f'stt_agents_server.py not found: {server_script}')

    cmd = [
        sys.executable, str(server_script),
        '--no-github',
        '--port', str(port),
        '--repo', str(repo_path),
        '--kanban', kanban_path
    ]

    assert_not_real_claude(cmd)

    # Start server
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=repo_path
    )

    # Wait for server to be ready
    url = f'http://127.0.0.1:{port}'
    max_retries = 30
    for i in range(max_retries):
        try:
            with urllib.request.urlopen(f'{url}/', timeout=1) as f:
                if f.status == 200:
                    break
        except (urllib.error.URLError, Exception):
            time.sleep(0.1)

    try:
        yield {
            'port': port,
            'url': url,
            'process': proc,
            'kanban_path': kanban_path
        }
    finally:
        # Clean up
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()

        # Remove temp files
        if kanban_path and os.path.exists(kanban_path):
            try:
                os.unlink(kanban_path)
            except Exception:
                pass


def http_get(url, headers=None, timeout=5):
    """
    Make HTTP GET request.
    Returns (status_code, body) tuple.
    """
    try:
        req = urllib.request.Request(url, headers=headers or {})
        with urllib.request.urlopen(req, timeout=timeout) as f:
            return f.status, f.read().decode('utf-8', errors='replace')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', errors='replace')
    except Exception as e:
        raise RuntimeError(f'GET {url} failed: {e}')


def http_post(url, data=None, headers=None, timeout=5):
    """
    Make HTTP POST request.
    Returns (status_code, body) tuple.
    """
    if data is not None:
        if isinstance(data, dict):
            data = json.dumps(data).encode('utf-8')
        elif isinstance(data, str):
            data = data.encode('utf-8')

    try:
        req = urllib.request.Request(
            url,
            data=data,
            headers=headers or {},
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=timeout) as f:
            return f.status, f.read().decode('utf-8', errors='replace')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', errors='replace')
    except Exception as e:
        raise RuntimeError(f'POST {url} failed: {e}')


def wait_for_condition(condition_func, timeout=10, interval=0.1):
    """
    Wait for a condition to become true.

    Args:
        condition_func: Callable that returns True when condition is met
        timeout: Maximum seconds to wait
        interval: Seconds between checks

    Raises:
        TimeoutError if condition not met within timeout
    """
    start = time.time()
    while time.time() - start < timeout:
        try:
            if condition_func():
                return
        except Exception:
            pass
        time.sleep(interval)
    raise TimeoutError(f'Condition not met within {timeout}s')


def json_response(body):
    """Parse JSON response body."""
    if isinstance(body, bytes):
        body = body.decode('utf-8')
    return json.loads(body)
