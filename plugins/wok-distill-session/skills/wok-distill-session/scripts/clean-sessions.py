#!/usr/bin/env python3
"""
clean-sessions.py - 清洗 Claude Code 会话日志为分析就绪的 JSONL

职责：过滤噪声、分类消息、脱敏、截断。不做任何统计分析。
输出每行一条结构化 JSON 记录，供 Claude 直接 Grep/Read 分析。

用法: python3 clean-sessions.py [--days N] [--output FILE]
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ── 截断长度 ──────────────────────────────────────────────

MAX_HUMAN_TEXT = 500
MAX_AI_TEXT = 300
MAX_TOOL_RESULT_TEXT = 200
MAX_ERROR_RESULT_TEXT = 500
MAX_EDIT_PREVIEW = 200
MAX_BASH_COMMAND = 300
MAX_WRITE_CONTENT = 200

# ── 脱敏模式 ──────────────────────────────────────────────

SENSITIVE_PATTERNS = [
    re.compile(r"(sk-|api_key|apikey|secret_key)\s*[:=]\s*['\"]?\S+", re.IGNORECASE),
    re.compile(r"(Bearer\s+|token=|access_token)\s*\S+", re.IGNORECASE),
    re.compile(r"(password|passwd|pwd)\s*[:=]\s*['\"]?\S+", re.IGNORECASE),
    re.compile(r"-----BEGIN.*PRIVATE KEY-----", re.IGNORECASE),
    re.compile(r"(mongodb|postgres|mysql|redis|amqp)://\S+:\S+@", re.IGNORECASE),
    re.compile(r"AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN)\s*[:=]\s*\S+", re.IGNORECASE),
    re.compile(r"\.env\b.*(?:KEY|SECRET|TOKEN|PASSWORD)\s*[:=]", re.IGNORECASE),
]

# ── 消息分类模式 ──────────────────────────────────────────

CORRECTION_PATTERNS = [
    re.compile(r"不对|不要|错了|重来|换方案|不是这样|别用|禁止|不能|不可以|不行|不是这个意思|我说的不是|我没让你|不需要|不用"),
    re.compile(r"恢复|撤销|回退|还原", re.IGNORECASE),
    re.compile(r"\bNO\b|\bwrong\b|not like this|don't use|\bstop\b|\brestart\b|\bredo\b|\bundo\b|\brevert\b", re.IGNORECASE),
]

ACCEPT_PATTERNS = [
    re.compile(r"完成|好了|可以|对|正确|没问题|nice|perfect|好的|是的|没错|可以了"),
    re.compile(r"\bgood\b|\bok\b|\byes\b|\bcorrect\b|\bgreat\b|\bperfect\b|\bnice\b", re.IGNORECASE),
]

# 跳过的条目类型
SKIP_ENTRY_TYPES = frozenset({"system", "progress", "file-history-snapshot", "queue-operation", "last-prompt"})

# 噪声前缀（Claude Code 内部命令注入）
NOISE_PREFIXES = ("<command-message>", "<local-command", "<command-name")


# ── 辅助函数 ──────────────────────────────────────────────


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="清洗 Claude Code 会话日志")
    parser.add_argument("--days", type=int, default=7, help="最近 N 天（默认 7）")
    parser.add_argument("--output", default=None, help="输出文件路径（默认当前目录 cleaned-sessions.jsonl）")
    args = parser.parse_args()
    if args.days <= 0:
        parser.error("--days must be a positive integer")
    return args


def find_all_project_dirs() -> list:
    projects_dir = Path.home() / ".claude" / "projects"
    if not projects_dir.exists():
        return []
    return [d for d in projects_dir.iterdir()
            if d.is_dir() and not d.name.startswith(".") and any(d.glob("*.jsonl"))]


def extract_project_name(cwd: str) -> str:
    return Path(cwd).name


def redact_sensitive(text: str) -> str:
    for p in SENSITIVE_PATTERNS:
        text = p.sub("[REDACTED]", text)
    return text


def check_correction(text: str) -> bool:
    return any(p.search(text) for p in CORRECTION_PATTERNS)


def check_accept(text: str) -> bool:
    return any(p.search(text) for p in ACCEPT_PATTERNS)


def parse_ts(ts_str: str) -> datetime | None:
    if not ts_str:
        return None
    try:
        return datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def common_fields(entry: dict) -> dict:
    return {
        "ts": entry.get("timestamp", ""),
        "session": entry.get("sessionId", ""),
        "project": extract_project_name(entry.get("cwd", "")),
        "branch": entry.get("gitBranch", ""),
    }


# ── 工具输入摘要 ──────────────────────────────────────────


def summarize_tool_input(tool_name: str, tool_input: dict) -> dict:
    if tool_name == "Edit":
        return {
            "file_path": tool_input.get("file_path", ""),
            "old_string_head": (tool_input.get("old_string") or "")[:MAX_EDIT_PREVIEW],
            "new_string_head": (tool_input.get("new_string") or "")[:MAX_EDIT_PREVIEW],
            "replace_all": tool_input.get("replace_all", False),
        }
    if tool_name == "Bash":
        return {
            "command": redact_sensitive((tool_input.get("command") or "")[:MAX_BASH_COMMAND]),
            "description": tool_input.get("description", ""),
        }
    if tool_name == "Read":
        return {
            "file_path": tool_input.get("file_path", ""),
            "limit": tool_input.get("limit"),
            "offset": tool_input.get("offset"),
        }
    if tool_name == "Write":
        return {
            "file_path": tool_input.get("file_path", ""),
            "content_head": redact_sensitive((tool_input.get("content") or "")[:MAX_WRITE_CONTENT]),
        }
    if tool_name == "Glob":
        return {"pattern": tool_input.get("pattern", ""), "path": tool_input.get("path", "")}
    if tool_name == "Grep":
        return {
            "pattern": tool_input.get("pattern", ""),
            "path": tool_input.get("path", ""),
            "output_mode": tool_input.get("output_mode", ""),
        }
    if tool_name == "WebSearch":
        return {"query": tool_input.get("query", "")}
    if tool_name == "Agent":
        return {
            "description": tool_input.get("description", ""),
            "prompt_head": (tool_input.get("prompt") or "")[:200],
        }
    # 其他工具：保留原始 input 的前 500 字符
    raw = json.dumps(tool_input, ensure_ascii=False)
    return {"raw_input_head": raw[:500]}


# ── 消息处理 ──────────────────────────────────────────────


def process_human_input(entry: dict) -> dict | None:
    message = entry.get("message", {})
    content = message.get("content", "")

    # 仅字符串内容为人类输入
    if not isinstance(content, str):
        return None
    content = content.strip()
    if len(content) <= 2:
        return None
    if any(content.startswith(prefix) for prefix in NOISE_PREFIXES):
        return None

    text = redact_sensitive(content[:MAX_HUMAN_TEXT])

    record = {**common_fields(entry), "msg_category": "human_input", "text": text}

    # 纠正 / 验收标记（基于截断前文本）
    raw = content[:MAX_HUMAN_TEXT]
    record["is_correction"] = check_correction(raw)
    record["is_accept"] = check_accept(raw) and not record["is_correction"]
    return record


def process_ai_message(entry: dict, tool_id_map: dict) -> list:
    message = entry.get("message", {})
    content = message.get("content", [])
    if not isinstance(content, list):
        return []

    records = []
    for block in content:
        if not isinstance(block, dict):
            continue
        block_type = block.get("type", "")

        # 跳过 thinking block
        if block_type == "thinking":
            continue

        if block_type == "tool_use":
            tool_name = block.get("name", "")
            tool_input = block.get("input", {})
            tool_id = block.get("id", "")

            # 维护 tool_id → tool_name 映射
            if tool_id:
                tool_id_map[tool_id] = tool_name

            record = {
                **common_fields(entry),
                "msg_category": "ai_tool_call",
                "tool_name": tool_name,
                "tool_input": summarize_tool_input(tool_name, tool_input),
            }
            records.append(record)

        elif block_type == "text":
            text = block.get("text", "")
            if not text.strip():
                continue
            record = {
                **common_fields(entry),
                "msg_category": "ai_text",
                "text": text[:MAX_AI_TEXT],
            }
            records.append(record)

    return records


def process_tool_result(entry: dict, tool_id_map: dict) -> dict | None:
    message = entry.get("message", {})
    content = message.get("content", [])

    if not isinstance(content, list) or not content:
        return None

    # 从 content 数组中提取 tool_use_id 和结果文本
    result_text_parts = []
    parent_tool = "unknown"
    is_error = False

    for item in content:
        if not isinstance(item, dict):
            continue

        tool_use_id = item.get("tool_use_id", "")
        if tool_use_id and tool_use_id in tool_id_map:
            parent_tool = tool_id_map[tool_use_id]

        if item.get("is_error"):
            is_error = True

        item_content = item.get("content", "")
        if isinstance(item_content, str):
            result_text_parts.append(item_content)
        elif isinstance(item_content, list):
            for sub in item_content:
                if isinstance(sub, dict):
                    result_text_parts.append(sub.get("text", ""))
                elif isinstance(sub, str):
                    result_text_parts.append(sub)

    if not result_text_parts:
        return None

    full_text = "\n".join(result_text_parts)
    limit = MAX_ERROR_RESULT_TEXT if is_error else MAX_TOOL_RESULT_TEXT
    text = redact_sensitive(full_text[:limit])

    if not text.strip():
        return None

    return {
        **common_fields(entry),
        "msg_category": "tool_result",
        "parent_tool": parent_tool,
        "is_error": is_error,
        "text": text,
    }


# ── 文件处理 ──────────────────────────────────────────────


def process_file(filepath: Path, cutoff_time: datetime, outfile) -> int:
    count = 0
    tool_id_map: dict[str, str] = {}

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue

                try:
                    entry = json.loads(line)
                except (json.JSONDecodeError, ValueError):
                    continue

                # 时间过滤
                ts = parse_ts(entry.get("timestamp", ""))
                if ts and ts < cutoff_time:
                    continue

                # 跳过噪声类型
                entry_type = entry.get("type", "")
                if entry_type in SKIP_ENTRY_TYPES:
                    continue

                # 跳过子线程
                if entry.get("isSidechain"):
                    continue

                message = entry.get("message", {})
                if not isinstance(message, dict):
                    continue

                output_lines = []

                # 人类输入：content 是字符串
                if entry_type == "user" and isinstance(message.get("content"), str):
                    record = process_human_input(entry)
                    if record:
                        output_lines.append(record)

                # tool_result：content 是数组
                elif entry_type == "user" and isinstance(message.get("content"), list):
                    record = process_tool_result(entry, tool_id_map)
                    if record:
                        output_lines.append(record)

                # assistant 消息
                elif entry_type == "assistant":
                    records = process_ai_message(entry, tool_id_map)
                    output_lines.extend(records)

                for record in output_lines:
                    outfile.write(json.dumps(record, ensure_ascii=False) + "\n")
                    count += 1

    except (OSError, IOError) as e:
        print(f"Warning: Cannot read {filepath}: {e}", file=sys.stderr)

    return count


# ── 主流程 ────────────────────────────────────────────────


def main():
    args = parse_args()
    cutoff_time = datetime.now(timezone.utc) - timedelta(days=args.days)

    project_dirs = find_all_project_dirs()
    if not project_dirs:
        print("Error: No project session dirs found in ~/.claude/projects/", file=sys.stderr)
        sys.exit(1)

    output_path = args.output or "cleaned-sessions.jsonl"

    total_entries = 0
    total_files = 0

    try:
        with open(output_path, "w", encoding="utf-8") as outfile:
            for project_dir in project_dirs:
                project_name = project_dir.name
                project_entries = 0
                project_files = 0

                for f in sorted(project_dir.glob("*.jsonl")):
                    try:
                        if f.stat().st_size == 0:
                            continue
                    except OSError:
                        continue
                    n = process_file(f, cutoff_time, outfile)
                    if n > 0:
                        project_entries += n
                        project_files += 1

                if project_entries > 0:
                    total_entries += project_entries
                    total_files += project_files
                    print(f"  {project_name}: {project_entries} records ({project_files} files)", file=sys.stderr)

    except (OSError, IOError) as e:
        print(f"Error: Cannot write to {output_path}: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Done: {total_entries} records from {total_files} files", file=sys.stderr)
    print(f"Output: {output_path}", file=sys.stderr)
    print("Hint: Delete this file after use.", file=sys.stderr)


if __name__ == "__main__":
    main()
