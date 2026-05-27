#!/usr/bin/env python3
"""deny-access: PreToolUse hook for PowerShell tool.

Intercepts PowerShell commands and blocks access to protected file patterns.
Reads patterns from .claude/protected-patterns.json.

Exit 0 with no output = allow. Output JSON with decision=block = deny.
"""
import json
import os
import re
import sys

CONFIG_PATH = os.path.join(".claude", "protected-patterns.json")


def pattern_to_regex(pattern):
    """Convert file pattern to regex for command string matching."""
    result = ""
    i = 0
    while i < len(pattern):
        if pattern[i:i+2] == "**":
            result += ".*"
            i += 2
        elif pattern[i] == "*":
            result += r"\S*"
            i += 1
        elif pattern[i] == "?":
            result += r"\S"
            i += 1
        elif pattern[i] in r".+^${}()|[]\\":
            result += "\\" + pattern[i]
            i += 1
        else:
            result += pattern[i]
            i += 1
    return result


def check_command(command, patterns):
    """Return first matched pattern, or None."""
    for pattern in patterns:
        regex = pattern_to_regex(pattern)
        if re.search(regex, command, re.IGNORECASE):
            return pattern
    return None


def main():
    tool_input = json.load(sys.stdin)
    command = tool_input.get("tool_input", {}).get("command", "")
    if not command:
        return

    try:
        with open(CONFIG_PATH) as f:
            config = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return

    read_patterns = config.get("read", [])
    write_patterns = config.get("write", [])

    direction = sys.argv[1] if len(sys.argv) > 1 else "all"
    patterns = []
    if direction != "write":
        patterns.extend(read_patterns)
    if direction != "read":
        patterns.extend(write_patterns)

    matched = check_command(command, patterns)
    if matched:
        print(json.dumps({
            "decision": "block",
            "reason": f"Permission denied: Access to '{matched}' is blocked by deny-access rules."
        }))


if __name__ == "__main__":
    main()
