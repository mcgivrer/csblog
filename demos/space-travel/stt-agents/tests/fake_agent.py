#!/usr/bin/env python3
"""
Fake agent for testing stt-agents infrastructure.
Mimics 'claude' command: reads --agent, --model, --session-id or --resume options,
writes minimal JSONL transcript, echoes stdin, and responds to prompt commands.

Consignes (dans le prompt) :
  EXIT n, SLEEP s, IGNORE_TERM, SPAM, TOKENS n, ENV/TTY/HUP <fichier>   (voir plus bas)
  WAIT        ecrit son rapport puis attend l'entree sans sortir (comportement par defaut, explicite)
  EXITCMD     sort avec le code 0 quand il lit `/exit`
  IGNOREEXIT  ignore `/exit` (il continue d'attendre)
  WRITEONEXIT avec IGNOREEXIT : a la lecture de `/exit`, ecrit au transcript (nouveau texte) puis ignore la commande
  PENDINGTEXT ecrit un tool_use Bash SANS tool_result, puis le texte final (le transcript finit sur un texte)
  QUESTION    ecrit un tool_use AskUserQuestion SANS tool_result, puis attend
  EDIT <chemin>  ecrit un tool_use Edit (+ son tool_result) avant le rapport
  CACHE n     usage : cache_creation_input_tokens n, cache_read_input_tokens 2n
  ARGV <fichier>  ecrit son argv (JSON) dans le fichier
Variable d'environnement FAKE_ARGV_FILE : meme effet que ARGV.
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
    parser.add_argument('--add-dir', action='append', default=[], help='Dossier supplementaire autorise')
    parser.add_argument('--settings', help='Fichier de reglages supplementaire (T3.8)')
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

    m = re.search(r'\bARGV\s+(\S+)', prompt)
    argv_file = (m.group(1) if m else None) or os.environ.get('FAKE_ARGV_FILE')
    if argv_file:
        with open(argv_file, 'w') as f:
            json.dump(sys.argv[1:], f)
    exit_on_cmd = bool(re.search(r'\bEXITCMD\b', prompt))
    ignore_exit = bool(re.search(r'\bIGNOREEXIT\b', prompt))
    question = bool(re.search(r'\bQUESTION\b', prompt))
    pending_text = bool(re.search(r'\bPENDINGTEXT\b', prompt))
    write_on_exit = bool(re.search(r'\bWRITEONEXIT\b', prompt))
    m = re.search(r'\bEDIT\s+(\S+)', prompt)
    edit_path = m.group(1).replace('CWD/', os.getcwd() + '/') if m else None   # CWD/ : le worktree du run
    m = re.search(r'\bCACHE\s+(\d+)', prompt)
    cache = int(m.group(1)) if m else 0

    # Consignes de durcissement : ENV <fichier>, TTY <fichier>, HUP <fichier>
    m = re.search(r'\bENV\s+(\S+)', prompt)
    if m:
        with open(m.group(1), 'w') as f:
            json.dump(dict(os.environ), f)
    m = re.search(r'\bTTY\s+(\S+)', prompt)
    if m:
        info = {}
        try:
            info['ttyname'] = os.ttyname(0)
        except OSError as e:
            info['ttyname'] = None
        try:
            fd = os.open('/dev/tty', os.O_RDWR)
            os.close(fd)
            info['devtty'] = True
        except OSError:
            info['devtty'] = False
        try:
            info['pgrp_is_fg'] = os.tcgetpgrp(0) == os.getpgrp()
        except OSError:
            info['pgrp_is_fg'] = None
        with open(m.group(1), 'w') as f:
            json.dump(info, f)
    m = re.search(r'\bHUP\s+(\S+)', prompt)
    if m:
        hup_file = m.group(1)

        def on_hup(signum, frame):
            with open(hup_file, 'w') as f:
                f.write('SIGHUP')
            os._exit(0)
        signal.signal(signal.SIGHUP, on_hup)

    # Set up signal handlers
    if ignore_term:
        signal.signal(signal.SIGTERM, signal.SIG_IGN)

    # Write initial user message to transcript
    user_entry = {
        'type': 'user',
        'timestamp': timestamp_iso(),
        'sessionId': session_id,
        'cwd': os.getcwd(),
        'message': {
            'content': [
                {'type': 'text', 'text': prompt or '(no prompt)'}
            ]
        }
    }
    write_transcript_entry(transcript_path, user_entry)

    if edit_path:
        write_transcript_entry(transcript_path, {
            'type': 'assistant', 'timestamp': timestamp_iso(), 'sessionId': session_id,
            'message': {'id': 'm-edit', 'content': [
                {'type': 'tool_use', 'id': 'tu-edit', 'name': 'Edit',
                 'input': {'file_path': edit_path, 'old_string': 'a', 'new_string': 'b'}}]}})
        write_transcript_entry(transcript_path, {
            'type': 'user', 'timestamp': timestamp_iso(), 'sessionId': session_id,
            'message': {'content': [{'type': 'tool_result', 'tool_use_id': 'tu-edit', 'content': 'ok'}]}})

    if pending_text:
        write_transcript_entry(transcript_path, {
            'type': 'assistant', 'timestamp': timestamp_iso(), 'sessionId': session_id,
            'message': {'id': 'm-pend', 'content': [
                {'type': 'tool_use', 'id': 'tu-pend', 'name': 'Bash', 'input': {'command': 'sleep 99'}}]}})

    # Write assistant response to transcript
    usage = {'input_tokens': 10, 'output_tokens': tokens}
    if cache:
        usage.update(cache_creation_input_tokens=cache, cache_read_input_tokens=cache * 2)
    assistant_entry = {
        'type': 'assistant',
        'timestamp': timestamp_iso(),
        'message': {
            'content': [
                {'type': 'text', 'text': 'Task completed.'}
            ],
            'usage': usage
        }
    }
    write_transcript_entry(transcript_path, assistant_entry)
    if question:
        write_transcript_entry(transcript_path, {
            'type': 'assistant', 'timestamp': timestamp_iso(), 'sessionId': session_id,
            'message': {'id': 'm-q', 'content': [
                {'type': 'tool_use', 'id': 'tu-question', 'name': 'AskUserQuestion',
                 'input': {'questions': [{'question': 'Continuer ?'}]}}]}})

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
                if write_on_exit and line.strip() == '/exit':
                    write_transcript_entry(transcript_path, {
                        'type': 'assistant', 'timestamp': timestamp_iso(), 'sessionId': session_id,
                        'message': {'id': 'm-exit', 'content': [{'type': 'text', 'text': 'Je continue.'},
                                    {'type': 'tool_use', 'id': 'tu-exit', 'name': 'Bash', 'input': {'command': 'true'}}]}})
                if exit_on_cmd and not ignore_exit and line.strip() == '/exit':
                    sys.exit(0)
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
