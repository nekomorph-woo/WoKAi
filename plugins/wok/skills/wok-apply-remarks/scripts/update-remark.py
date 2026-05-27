#!/usr/bin/env python3
"""Update a remark entry in _remark.jsonl by ID."""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description="Update a remark in _remark.jsonl")
    p.add_argument("jsonl_path", help="Path to _remark.jsonl")
    p.add_argument("--id", required=True, help="Remark ID")
    p.add_argument("--state", help="New state value")
    p.add_argument("--applied-by", help="Who applied this remark")
    p.add_argument("--impact", choices=["major", "minor", "patch"], help="Impact level")
    p.add_argument("--summary", help="One-line change summary")
    p.add_argument("--changed-files", nargs="*", default=None, help="Files modified")
    p.add_argument("--stale-downstream", nargs="*", default=None, help="Stale/impacted downstream files")
    args = p.parse_args()

    path = Path(args.jsonl_path)
    if not path.exists():
        print(f"Error: {path} not found", file=sys.stderr)
        sys.exit(1)

    lines = path.read_text(encoding="utf-8").splitlines()
    found = False
    out = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            out.append(line)
            continue
        entry = json.loads(stripped)
        if entry.get("id") == args.id:
            found = True
            if args.state is not None:
                entry["state"] = args.state
            if args.applied_by is not None:
                entry["appliedBy"] = args.applied_by
            if args.impact is not None:
                entry["impact"] = args.impact
            if args.summary is not None:
                entry["summary"] = args.summary
            if args.changed_files is not None:
                entry["changedFiles"] = args.changed_files
            if args.stale_downstream is not None:
                entry["staleDownstream"] = args.stale_downstream
            entry["updatedAt"] = datetime.now().astimezone().strftime("%Y-%m-%dT%H:%M:%S%z")
        out.append(json.dumps(entry, ensure_ascii=False))

    if not found:
        print(f"Error: remark {args.id} not found in {path}", file=sys.stderr)
        sys.exit(1)

    path.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"OK: remark {args.id} updated")


if __name__ == "__main__":
    main()
