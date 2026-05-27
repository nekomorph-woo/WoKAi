#!/usr/bin/env python3
"""wok-dashboard local HTTP server.

Multi-feature architecture: serves from plans/ parent directory.
Each feature is accessed via /<feature-name>/... URL prefix.
API routes: /<feature>/api/files, /<feature>/api/notes, etc.
Static files: /<feature>/_dashboard.html, /<feature>/_define.md, etc.

Usage: python3 _server.py --port PORT --directory DIR
"""

import argparse
import hashlib
import http.server
import json
import os
import re
import sys
import time
from pathlib import Path

ALLOWED_EXTENSIONS = {'.md', '.html', '.css', '.js', '.json'}
BASE_DIR = None  # Points to plans/ parent directory


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
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    # ── Feature routing ──

    def _validate_feature(self, feature_name):
        """Validate feature name and return resolved root path, or None (sends error)."""
        if '..' in feature_name or '/' in feature_name or not feature_name:
            self.send_error(400, 'Invalid feature name')
            return None
        feature_root = Path(BASE_DIR).resolve() / feature_name
        try:
            feature_root = feature_root.resolve()
            base_resolved = Path(BASE_DIR).resolve()
            if not str(feature_root).startswith(str(base_resolved)):
                self.send_error(403, 'Access denied')
                return None
        except (OSError, ValueError):
            self.send_error(403, 'Invalid path')
            return None
        if not feature_root.is_dir():
            self.send_error(404, f'Feature not found: {feature_name}')
            return None
        return feature_root

    def _parse_api_route(self):
        """Parse /<feature>/api/<path> from URL. Returns (feature_root, api_path) or (None, None)."""
        path = self.path.split('?', 1)[0].split('#', 1)[0]
        match = re.match(r'^/([^/]+)/api(/.*)$', path)
        if not match:
            return None, None
        feature_name = match.group(1)
        api_path = match.group(2)
        feature_root = self._validate_feature(feature_name)
        if not feature_root:
            return None, None
        return feature_root, api_path

    # ── HTTP method dispatch ──

    def do_GET(self):
        feature_root, api_path = self._parse_api_route()
        if feature_root:
            if api_path == '/files':
                self._serve_file_list(feature_root)
                return
            if api_path == '/notes':
                self._serve_notes(feature_root)
                return
            if api_path == '/freshness':
                self._serve_freshness(feature_root)
                return
            self.send_error(404)
            return
        super().do_GET()

    def do_POST(self):
        feature_root, api_path = self._parse_api_route()
        if feature_root:
            if api_path == '/notes':
                self._add_note(feature_root)
                return
            if api_path == '/freshness/propagate':
                self._propagate_freshness(feature_root)
                return
            self.send_error(404)
            return
        self.send_error(404)

    def do_DELETE(self):
        feature_root, api_path = self._parse_api_route()
        if feature_root:
            if api_path.startswith('/notes/') and '/refs/' in api_path:
                self._delete_note_ref(feature_root, api_path)
                return
            if api_path.startswith('/notes/'):
                self._delete_note(feature_root, api_path)
                return
            self.send_error(404)
            return
        self.send_error(404)

    def do_PATCH(self):
        feature_root, api_path = self._parse_api_route()
        if feature_root:
            if api_path == '/status':
                self._update_status(feature_root)
                return
            if api_path.startswith('/notes/') and '/refs/' not in api_path:
                self._update_note(feature_root, api_path)
                return
            self.send_error(404)
            return
        self.send_error(404)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    # ── Status / Freshness ──

    VALID_STATUSES = {'draft', 'approved'}
    VALID_FRESHNESS = {'fresh', 'stale', 'impacted'}

    def _update_status(self, feature_root):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
        except (json.JSONDecodeError, ValueError):
            self.send_error(400, 'Invalid JSON')
            return
        rel_file = data.get('file', '')
        new_status = data.get('status', '')
        new_freshness = data.get('freshness', '')
        if not rel_file:
            self.send_error(400, 'Missing file')
            return
        if new_status and new_status not in self.VALID_STATUSES:
            self.send_error(400, f'Invalid status: {new_status}')
            return
        if new_freshness and new_freshness not in self.VALID_FRESHNESS:
            self.send_error(400, f'Invalid freshness: {new_freshness}')
            return
        base = feature_root.resolve()
        target = base / rel_file
        try:
            target = target.resolve()
            if not str(target).startswith(str(base)):
                self.send_error(403, 'Access denied')
                return
        except (OSError, ValueError):
            self.send_error(403, 'Invalid path')
            return
        if not target.is_file():
            self.send_error(404, 'File not found')
            return
        content = target.read_text(encoding='utf-8')
        old_status = None
        old_freshness = None

        if new_status:
            def replace_status(m):
                nonlocal old_status
                old_status = m.group(1)
                return f'status: {new_status}\n'
            content, count = re.subn(r'^status:\s*(\S+)', replace_status, content, count=1, flags=re.MULTILINE)
            if count == 0:
                self.send_error(400, 'No status field found in frontmatter')
                return

        if new_freshness:
            def replace_freshness(m):
                nonlocal old_freshness
                old_freshness = m.group(1)
                return f'freshness: {new_freshness}\n'
            content, _ = re.subn(r'^freshness:\s*(\S+)', replace_freshness, content, count=1, flags=re.MULTILINE)

        target.write_text(content, encoding='utf-8')
        result = {'ok': True, 'file': rel_file}
        if new_status:
            result['oldStatus'] = old_status
            result['newStatus'] = new_status
        if new_freshness:
            result['oldFreshness'] = old_freshness
            result['newFreshness'] = new_freshness
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(json.dumps(result, ensure_ascii=False).encode())

    # ── Freshness detection ──

    def _compute_file_hash(self, feature_root, rel_path):
        try:
            target = (feature_root / rel_path).resolve()
            if not target.is_file():
                return None
            if not str(target).startswith(str(feature_root)):
                return None
            content = target.read_text(encoding='utf-8')
            body = re.sub(r'^---\n[\s\S]*?\n---\s*\n?', '', content, count=1)
            return hashlib.sha1(body.encode('utf-8')).hexdigest()
        except (OSError, ValueError):
            return None

    def _parse_frontmatter_yaml(self, text):
        match = re.match(r'^---\n([\s\S]*?)\n---', text)
        if not match:
            return {}
        data = {}
        stack = [{'obj': data, 'indent': -1}]
        for line in match.group(1).split('\n'):
            if not line.strip():
                continue
            indent = len(line) - len(line.lstrip())
            while len(stack) > 1 and stack[-1]['indent'] >= indent:
                stack.pop()
            colon_idx = line.index(':')
            key = line[:colon_idx].strip()
            val = line[colon_idx + 1:].strip()
            if not val:
                new_obj = {}
                stack[-1]['obj'][key] = new_obj
                stack.append({'obj': new_obj, 'indent': indent})
            elif val.startswith('[') and val.endswith(']'):
                stack[-1]['obj'][key] = [s.strip() for s in val[1:-1].split(',')]
            else:
                stack[-1]['obj'][key] = val
        return data

    def _serve_freshness(self, feature_root):
        base = feature_root.resolve()
        md_files = sorted(
            str(f.relative_to(base))
            for f in base.rglob('*.md')
            if f.is_file() and not f.name.startswith('.')
        )
        result = {}
        for rel_path in md_files:
            fm = {}
            try:
                text = (base / rel_path).read_text(encoding='utf-8')
                fm = self._parse_frontmatter_yaml(text)
            except OSError:
                pass
            wok = fm.get('wok', {})
            upstream_hashes = wok.get('upstream_hashes', {})
            freshness = fm.get('freshness')
            stale_reasons = []
            for up_path, stored_hash in (upstream_hashes.items() if isinstance(upstream_hashes, dict) else []):
                current_hash = self._compute_file_hash(base, up_path)
                if current_hash and stored_hash and current_hash != stored_hash:
                    stale_reasons.append(up_path)
            if stale_reasons and freshness == 'fresh':
                freshness = 'stale'
            result[rel_path] = {
                'freshness': freshness,
                'status': fm.get('status'),
                'staleReasons': stale_reasons,
            }
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(json.dumps(result, ensure_ascii=False).encode())

    IMPACT_PROPAGATION = {
        '_define.md': {
            'patch': [],
            'minor': ['modules/_registry.md', 'modules/*/design.md', '_check.md', '_plan.md', '_review.md'],
            'major': ['modules/_registry.md', 'modules/*/design.md', '_check.md', '_plan.md', '_review.md'],
        },
        'modules/_registry.md': {
            'patch': [],
            'minor': ['modules/*/design.md', '_check.md', '_plan.md', '_review.md'],
            'major': ['modules/*/design.md', '_check.md', '_plan.md', '_review.md'],
        },
        'modules/*/design.md': {
            'patch': [],
            'minor': ['_check.md', '_plan.md'],
            'major': ['_check.md', '_plan.md'],
        },
        '_check.md': {
            'patch': [],
            'minor': ['_plan.md'],
            'major': ['_plan.md'],
        },
        '_plan.md': {
            'patch': [],
            'minor': ['_review.md'],
            'major': ['_review.md'],
        },
    }

    def _propagate_freshness(self, feature_root):
        import fnmatch
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
        except (json.JSONDecodeError, ValueError):
            self.send_error(400, 'Invalid JSON')
            return
        changed_doc = data.get('file', '')
        impact_level = data.get('impact', 'minor')
        if not changed_doc or impact_level not in ('patch', 'minor', 'major'):
            self.send_error(400, 'Missing or invalid file/impact')
            return
        if impact_level == 'patch':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'marked': []}, ensure_ascii=False).encode())
            return
        target_freshness = 'stale' if impact_level == 'major' else 'impacted'
        name = changed_doc.rsplit('/', 1)[-1] if '/' in changed_doc else changed_doc
        pattern_key = name if not changed_doc.startswith('modules/') else changed_doc.rsplit('/', 1)[-1]
        propagation = self.IMPACT_PROPAGATION.get(pattern_key, self.IMPACT_PROPAGATION.get('modules/*/design.md', {}))
        downstream_patterns = propagation.get(impact_level, [])
        base = feature_root.resolve()
        md_files = {str(f.relative_to(base)): f for f in base.rglob('*.md') if f.is_file() and not f.name.startswith('.')}
        marked = []
        for pattern in downstream_patterns:
            for rel_path in md_files:
                if fnmatch.fnmatch(rel_path, pattern):
                    text = md_files[rel_path].read_text(encoding='utf-8')
                    fm = self._parse_frontmatter_yaml(text)
                    current = fm.get('freshness')
                    if current == 'fresh' or (target_freshness == 'stale' and current == 'impacted'):
                        new_text, count = re.subn(
                            r'^(freshness:\s*)\S+',
                            lambda m: f'{m.group(1)}{target_freshness}',
                            text, count=1, flags=re.MULTILINE
                        )
                        if count == 0:
                            new_text = re.subn(
                                r'^(status:\s*\S+)',
                                lambda m: f'{m.group(1)}\nfreshness: {target_freshness}',
                                text, count=1, flags=re.MULTILINE
                            )[0]
                        md_files[rel_path].write_text(new_text, encoding='utf-8')
                        marked.append(rel_path)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(json.dumps({'ok': True, 'impact': impact_level, 'marked': marked}, ensure_ascii=False).encode())

    # ── File list ──

    def _serve_file_list(self, feature_root):
        base = feature_root.resolve()
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

    # ── Notes (per-feature _remark.jsonl) ──

    def _notes_path(self, feature_root):
        return feature_root.resolve() / '_remark.jsonl'

    def _read_all_notes(self, feature_root):
        p = self._notes_path(feature_root)
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

    def _write_all_notes(self, feature_root, notes):
        p = self._notes_path(feature_root)
        lines = [json.dumps(n, ensure_ascii=False) for n in notes]
        p.write_text('\n'.join(lines) + '\n' if lines else '', encoding='utf-8')

    def _serve_notes(self, feature_root):
        notes = self._read_all_notes(feature_root)
        self._verify_refs(feature_root, notes)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(json.dumps(notes, ensure_ascii=False).encode())

    def _add_note(self, feature_root):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
        except (json.JSONDecodeError, ValueError):
            self.send_error(400, 'Invalid JSON')
            return
        note = {
            'id': 'rem_' + hashlib.md5(os.urandom(16)).hexdigest()[:8],
            'type': data.get('type', 'decision'),
            'state': 'open',
            'content': data.get('content', ''),
            'refs': [],
            'createdAt': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
            'updatedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
        }
        base_resolved = feature_root.resolve()
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
        notes = self._read_all_notes(feature_root)
        notes.insert(0, note)
        self._write_all_notes(feature_root, notes)
        self.send_response(201)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(note, ensure_ascii=False).encode())

    VALID_NOTE_STATES = {'open', 'applied', 'resolved', 'rejected', 'deferred'}
    VALID_NOTE_TYPES = {'decision', 'question', 'suggestion'}
    VALID_STATE_TRANSITIONS = {
        'open': {'applied', 'rejected', 'deferred'},
        'applied': {'resolved', 'rejected'},
        'resolved': {'open'},
        'rejected': {'open'},
        'deferred': {'open'},
    }

    def _update_note(self, feature_root, api_path):
        note_id = api_path.split('/')[-1]
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
        except (json.JSONDecodeError, ValueError):
            self.send_error(400, 'Invalid JSON')
            return
        notes = self._read_all_notes(feature_root)
        note = next((n for n in notes if n.get('id') == note_id), None)
        if not note:
            self.send_error(404, 'Note not found')
            return
        new_state = data.get('state')
        if new_state:
            if new_state not in self.VALID_NOTE_STATES:
                self.send_error(400, f'Invalid state: {new_state}')
                return
            current_state = note.get('state', 'open')
            allowed = self.VALID_STATE_TRANSITIONS.get(current_state, set())
            if new_state not in allowed:
                self.send_error(400, f'Cannot transition from {current_state} to {new_state}')
                return
            note['state'] = new_state
            note['updatedAt'] = time.strftime('%Y-%m-%dT%H:%M:%S%z')
        if 'appliedBy' in data:
            note['appliedBy'] = data['appliedBy']
        if 'changedFiles' in data:
            note['changedFiles'] = data['changedFiles']
        if 'impact' in data:
            note['impact'] = data['impact']
        if 'content' in data:
            note['content'] = data['content']
        if 'type' in data and data['type'] in self.VALID_NOTE_TYPES:
            note['type'] = data['type']
        if 'refs' in data:
            note['refs'] = data['refs']
        note['updatedAt'] = time.strftime('%Y-%m-%dT%H:%M:%S%z')
        self._write_all_notes(feature_root, notes)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(json.dumps(note, ensure_ascii=False).encode())

    def _delete_note(self, feature_root, api_path):
        note_id = api_path.split('/')[-1]
        notes = self._read_all_notes(feature_root)
        filtered = [n for n in notes if n.get('id') != note_id]
        if len(filtered) == len(notes):
            self.send_error(404, 'Note not found')
            return
        self._write_all_notes(feature_root, filtered)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'deleted': note_id}).encode())

    def _delete_note_ref(self, feature_root, api_path):
        parts = api_path.split('/')
        # /notes/<id>/refs/<idx> → ['', 'notes', id, 'refs', idx]
        try:
            note_id = parts[2]
            ref_idx = int(parts[4])
        except (ValueError, IndexError):
            self.send_error(400, 'Invalid parameters')
            return
        notes = self._read_all_notes(feature_root)
        note = next((n for n in notes if n.get('id') == note_id), None)
        if not note:
            self.send_error(404, 'Note not found')
            return
        refs = note.get('refs', [])
        if ref_idx < 0 or ref_idx >= len(refs):
            self.send_error(400, 'Invalid ref index')
            return
        removed = refs.pop(ref_idx)
        self._write_all_notes(feature_root, notes)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(removed, ensure_ascii=False).encode())

    def _verify_refs(self, feature_root, notes):
        base = feature_root.resolve()
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

    parser = argparse.ArgumentParser(description='wok-dashboard server (multi-feature)')
    parser.add_argument('--port', type=int, required=True)
    parser.add_argument('--directory', type=str, required=True,
                        help='Parent directory containing feature folders (e.g., plans/)')
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
