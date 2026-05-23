#!/usr/bin/env python3
"""wok-dashboard local HTTP server.

Serves pipeline documents from a feature directory with path traversal protection.
Binds to 127.0.0.1 only. Provides /api/files endpoint for .md file discovery.

Usage: python3 _server.py --port PORT --directory DIR
"""

import argparse
import hashlib
import http.server
import json
import os
import sys
import time
from pathlib import Path

ALLOWED_EXTENSIONS = {'.md', '.html', '.css', '.js', '.json'}
BASE_DIR = None


class SecureHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = path.split('?', 1)[0].split('#', 1)[0]

        if '..' in path:
            self.send_error(403, 'Path traversal not allowed')
            return ''

        translated = Path(BASE_DIR) / path.lstrip('/')

        try:
            translated = translated.resolve()
            base_resolved = Path(BASE_DIR).resolve()
            if not str(translated).startswith(str(base_resolved)):
                self.send_error(403, 'Access denied')
                return ''
        except (OSError, ValueError):
            self.send_error(403, 'Invalid path')
            return ''

        return str(translated)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def do_GET(self):
        if self.path == '/api/files':
            self._serve_file_list()
            return
        if self.path == '/api/notes':
            self._serve_notes()
            return
        super().do_GET()

    def do_POST(self):
        if self.path == '/api/notes':
            self._add_note()
            return
        self.send_error(404)

    def do_DELETE(self):
        if self.path.startswith('/api/notes/') and '/refs/' in self.path:
            self._delete_note_ref()
            return
        if self.path.startswith('/api/notes/'):
            self._delete_note()
            return
        self.send_error(404)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def _serve_file_list(self):
        base = Path(BASE_DIR).resolve()
        md_files = sorted(
            str(f.relative_to(base))
            for f in base.rglob('*.md')
            if f.is_file() and not f.name.startswith('.')
        )
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(json.dumps(md_files).encode())

    def _notes_path(self):
        return Path(BASE_DIR).resolve() / '_remark.jsonl'

    def _read_all_notes(self):
        p = self._notes_path()
        if not p.is_file():
            return []
        notes = []
        for line in p.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if line:
                try:
                    notes.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
        return notes

    def _write_all_notes(self, notes):
        p = self._notes_path()
        lines = [json.dumps(n, ensure_ascii=False) for n in notes]
        p.write_text('\n'.join(lines) + '\n' if lines else '', encoding='utf-8')

    def _serve_notes(self):
        notes = self._read_all_notes()
        self._verify_refs(notes)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(json.dumps(notes, ensure_ascii=False).encode())

    def _add_note(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
        except (json.JSONDecodeError, ValueError):
            self.send_error(400, 'Invalid JSON')
            return
        note = {
            'id': int(time.time() * 1000),
            'type': data.get('type', 'decision'),
            'content': data.get('content', ''),
            'refs': [],
        }
        base_resolved = Path(BASE_DIR).resolve()
        for ref in data.get('refs', []):
            text = ref.get('text', '')
            ref_entry = {
                'file': ref.get('file', ''),
                'line': ref.get('line', 0),
                'endLine': ref.get('endLine', ref.get('line', 0)),
                'text': text,
                'textHash': hashlib.md5(text.encode('utf-8')).hexdigest() if text else '',
            }
            try:
                ref_entry['absPath'] = str((base_resolved / ref_entry['file']).resolve())
            except (OSError, ValueError):
                pass
            note['refs'].append(ref_entry)
        if not note['content']:
            self.send_error(400, 'Empty content')
            return
        notes = self._read_all_notes()
        notes.insert(0, note)
        self._write_all_notes(notes)
        self.send_response(201)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(note, ensure_ascii=False).encode())

    def _delete_note(self):
        note_id_str = self.path.split('/')[-1]
        try:
            note_id = int(note_id_str)
        except ValueError:
            self.send_error(400, 'Invalid note id')
            return
        notes = self._read_all_notes()
        filtered = [n for n in notes if n.get('id') != note_id]
        if len(filtered) == len(notes):
            self.send_error(404, 'Note not found')
            return
        self._write_all_notes(filtered)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'deleted': note_id}).encode())

    def _delete_note_ref(self):
        parts = self.path.split('/')
        try:
            note_id = int(parts[3])
            ref_idx = int(parts[5])
        except (ValueError, IndexError):
            self.send_error(400, 'Invalid parameters')
            return
        notes = self._read_all_notes()
        note = next((n for n in notes if n.get('id') == note_id), None)
        if not note:
            self.send_error(404, 'Note not found')
            return
        refs = note.get('refs', [])
        if ref_idx < 0 or ref_idx >= len(refs):
            self.send_error(400, 'Invalid ref index')
            return
        removed = refs.pop(ref_idx)
        self._write_all_notes(notes)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(removed, ensure_ascii=False).encode())

    def _verify_refs(self, notes):
        base = Path(BASE_DIR).resolve()
        file_cache = {}
        for note in notes:
            for ref in note.get('refs', []):
                file_path = base / ref.get('file', '')
                if not file_path.is_file():
                    ref['stale'] = True
                    continue
                str_path = str(file_path)
                if str_path not in file_cache:
                    try:
                        file_cache[str_path] = file_path.read_text(encoding='utf-8')
                    except OSError:
                        file_cache[str_path] = None
                content = file_cache.get(str_path)
                if content is None:
                    ref['stale'] = True
                    continue
                text = ref.get('text', '')
                if not text:
                    ref['stale'] = False
                    continue
                if text not in content:
                    ref['stale'] = True
                else:
                    ref['stale'] = False
                    pos = content.index(text)
                    ref['line'] = content[:pos].count('\n') + 1

    def log_message(self, format, *args):
        pass


def main():
    global BASE_DIR

    parser = argparse.ArgumentParser(description='wok-dashboard server')
    parser.add_argument('--port', type=int, required=True)
    parser.add_argument('--directory', type=str, required=True)
    args = parser.parse_args()

    BASE_DIR = args.directory
    if not os.path.isdir(BASE_DIR):
        print(f'Error: directory does not exist: {BASE_DIR}', file=sys.stderr)
        sys.exit(1)

    class ReuseServer(http.server.HTTPServer):
        allow_reuse_address = True

    server = ReuseServer(('127.0.0.1', args.port), SecureHandler)
    print(f'wok-dashboard serving {BASE_DIR} on http://127.0.0.1:{args.port}', file=sys.stderr)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    server.server_close()


if __name__ == '__main__':
    main()
