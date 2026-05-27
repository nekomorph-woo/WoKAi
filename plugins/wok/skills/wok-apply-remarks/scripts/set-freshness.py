#!/usr/bin/env python3
"""Set freshness field in a document's YAML frontmatter."""

import argparse
import re
import sys
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description="Set freshness in document frontmatter")
    p.add_argument("doc_path", help="Path to the markdown document")
    p.add_argument("--freshness", required=True, choices=["fresh", "impacted", "stale"],
                    help="Freshness level to set")
    p.add_argument("--reason", help="Stale reason (stored in staleReasons)")
    args = p.parse_args()

    path = Path(args.doc_path)
    if not path.exists():
        print(f"Error: {path} not found", file=sys.stderr)
        sys.exit(1)

    content = path.read_text(encoding="utf-8")
    fm_match = re.match(r'^---\n(.*?\n)---\s*\n', content, re.DOTALL)
    if not fm_match:
        print(f"Error: no frontmatter found in {path}", file=sys.stderr)
        sys.exit(1)

    fm_text = fm_match.group(1)
    fm_lines = fm_text.splitlines()

    # Update or add freshness field
    freshness_found = False
    for i, line in enumerate(fm_lines):
        if re.match(r'^freshness\s*:', line):
            fm_lines[i] = f"freshness: {args.freshness}"
            freshness_found = True
            break
    if not freshness_found:
        fm_lines.append(f"freshness: {args.freshness}")

    # Update or add staleReasons
    if args.reason:
        reasons_found = False
        for i, line in enumerate(fm_lines):
            m = re.match(r'^staleReasons\s*:\s*\[?(.*?)\]?\s*$', line)
            if m:
                existing = [r.strip().strip('"').strip("'") for r in m.group(1).split(",") if r.strip()]
                if args.reason not in existing:
                    existing.append(args.reason)
                quoted = ", ".join(f'"{r}"' for r in existing)
                fm_lines[i] = f"staleReasons: [{quoted}]"
                reasons_found = True
                break
        if not reasons_found:
            fm_lines.append(f'staleReasons: ["{args.reason}"]')

    new_fm = "\n".join(fm_lines) + "\n"
    new_content = f"---\n{new_fm}---\n" + content[fm_match.end():]
    path.write_text(new_content, encoding="utf-8")
    print(f"OK: {path.name} freshness={args.freshness}")


if __name__ == "__main__":
    main()
