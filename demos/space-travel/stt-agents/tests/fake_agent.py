#!/usr/bin/env python3
"""
Fake agent for testing stt-agents infrastructure.
Mimics 'claude' command: reads --agent, --model, --session-id or --resume options,
writes minimal JSONL transcript, echoes stdin, and responds to prompt commands.
"""

import argparse
import json
import os
import re
import signal
import sys
import time
from datetime import datetime
from pathlib import Path


def slugify(path):
    """Convert a path to a slug for CLAUDE_CONFIG_DIR."""
    return re.sub(r'[^a-z0-9]+', '-', path.lower().strip('-'))


def get_transcript_path(session_id):
    """Get the path to the JSONL transcript file."""
    claude_config = os.environ.get('CLAUDE_CONFIG_DIR', os.path.expanduser('~/.claude'))
    cwd = os.getcwd()
    slug = slugify(cwd)
    transcript_dir = Path(claude_config) / 'projects' / slug
    transcript_dir.mkdir(parents=True, exist_ok=True)
    return transcript_dir / f'{session_id}.jsonl'


def timestamp_iso():
    """Get current timestamp in ISO 8601 format."""
    return datetime.utcnow().isoformat() + 'Z'


def write_transcript_entry(path, entry):
    """Append a JSON entry to the transcript file."""
    with open(path, 'a') as f:
        f.write(json.dumps(entry, separators=(',', ':')) + '\n')


def main():
    parser = argparse.ArgumentParser(description='Fake agent for testing')
    parser.add_argument('--agent', required=True, help='Agent name')
    parser.add_argument('--model', required=True, help='Model name')
    parser.add_argument('--session-id', help='Session ID')
    parser.add_argument('--resume', help='Resume session ID')
    parser.add_argument('--permission-mode', required=True, help='Permission mode')
    parser.add_argument('-n', '--task', required=True, help='Task name')
    parser.add_argument('prompt', nargs='?', help='Optional prompt')

    args = parser.parse_args()

    session_id = args.resume or args.session_id
    if not session_id:
        parser.error('Either --session-id or --resume required')

    prompt = args.prompt or ''
    transcript_path = get_transcript_path(session_id)

    # Parse prompt commands
    exit_code = 0
    sleep_duration = 0
    ignore_term = False
    spam = False
    tokens = 100

    if prompt:
        # Check for special commands in prompt
        if 'EXIT' in prompt:
            m = re.search(r'EXIT\s+(\d+)', prompt)
            if m:
                exit_code = int(m.group(1))
        if 'SLEEP' in prompt:
            m = re.search(r'SLEEP\s+([\d.]+)', prompt)
            if m:
                sleep_duration = float(m.group(1))
        if 'IGNORE_TERM' in prompt:
            ignore_term = True
        if 'SPAM' in prompt:
            spam = True
        if 'TOKENS' in prompt:
            m = re.search(r'TOKENS\s+(\d+)', prompt)
            if m:
                tokens = int(m.group(1))

    # Set up signal handlers
    if ignore_term:
        signal.signal(signal.SIGTERM, signal.SIG_IGN)

    # Write initial user message to transcript
    user_entry = {
        'type': 'user',
        'timestamp': timestamp_iso(),
        'sessionId': session_id,
        'message': {
            'content': [
                {'type': 'text', 'text': prompt or '(no prompt)'}
            ]
        }
    }
    write_transcript_entry(transcript_path, user_entry)

    # Write assistant response to transcript
    assistant_entry = {
        'type': 'assistant',
        'timestamp': timestamp_iso(),
        'message': {
            'content': [
                {'type': 'text', 'text': 'Task completed.'}
            ],
            'usage': {
                'input_tokens': 10,
                'output_tokens': tokens
            }
        }
    }
    write_transcript_entry(transcript_path, assistant_entry)

    # Echo stdin to stdout (simulate terminal interaction)
    print(f'[fake-agent] session={session_id} task={args.task}')

    try:
        while True:
            try:
                line = sys.stdin.readline()
                if not line:
                    break
                # Echo the input
                sys.stdout.write(line)
                sys.stdout.flush()
            except (KeyboardInterrupt, BrokenPipeError):
                break
    except Exception:
        pass

    # Handle sleep if requested
    if sleep_duration > 0:
        time.sleep(sleep_duration)

    sys.exit(exit_code)


if __name__ == '__main__':
    main()
