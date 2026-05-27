#!/usr/bin/env python3
"""Check anchor coverage and EXCLUSION violations across module designs.

Usage: python3 check_anchors.py <phase-dir>

Scans _define.md for design anchors, then checks each module's
decisions.md for anchor claims. Reports coverage gaps by type and
EXCLUSION keyword violations.

Exit codes:
  0 — all checks pass
  1 — usage error
  2 — SECURITY gap or EXCLUSION violation detected
"""

import re
import sys
from pathlib import Path

ANCHOR_TYPES = ("EFFECT", "SECURITY", "NECESSITY", "EXCLUSION")


def parse_anchors(define_path: Path) -> dict[str, list[str]]:
    """Parse anchors from _define.md, grouped by type."""
    anchors = {t: [] for t in ANCHOR_TYPES}
    text = define_path.read_text(encoding="utf-8")

    m = re.search(r"^## 设计锚点\s*$(.*?)(?=^## |\Z)", text, re.M | re.S)
    if not m:
        return anchors

    for line in m.group(1).splitlines():
        line = line.strip()
        m2 = re.match(r"###\s*\\?\[(EFFECT|SECURITY|NECESSITY|EXCLUSION)\]\s*(.*)", line)
        if m2:
            anchors[m2.group(1)].append(m2.group(2).strip())

    return anchors


def parse_module_claims(modules_dir: Path) -> dict[str, dict[str, dict]]:
    """Parse anchor claims from each module's decisions.md.

    Returns: {module_name: {anchor_text: {"type": str, "claim": str}}}
    """
    claims: dict[str, dict[str, dict]] = {}
    if not modules_dir.exists():
        return claims

    for module_dir in sorted(modules_dir.iterdir()):
        if not module_dir.is_dir() or module_dir.name.startswith("_"):
            continue
        decisions_path = module_dir / "decisions.md"
        if not decisions_path.exists():
            continue

        text = decisions_path.read_text(encoding="utf-8")
        m = re.search(r"^## 锚点认领\s*$(.*?)(?=^## |\Z)", text, re.M | re.S)
        if not m:
            continue

        module_claims: dict[str, dict] = {}
        for line in m.group(1).splitlines():
            line = line.strip()
            m2 = re.match(
                r"(?:>\s*)?-\s*\[(EFFECT|SECURITY|NECESSITY|EXCLUSION)\]\s*(.*?)\s*→\s*(.*)",
                line,
            )
            if m2:
                module_claims[m2.group(2).strip()] = {
                    "type": m2.group(1),
                    "claim": m2.group(3).strip(),
                }

        if module_claims:
            claims[module_dir.name] = module_claims

    return claims


def extract_exclusion_keywords(exclusion_anchors: list[str]) -> list[str]:
    """Extract violation-scan keywords from EXCLUSION anchor text."""
    keywords = []
    for anchor in exclusion_anchors:
        parts = re.split(r"[，,、]", anchor)
        for part in parts:
            cleaned = re.sub(
                r"^(不做|不替代|不引入|不支持|不使用|不包含|not\s+|no\s+)",
                "",
                part.strip(),
                flags=re.I,
            ).strip()
            if cleaned and len(cleaned) >= 2:
                keywords.append(cleaned)
    return keywords


def scan_exclusion_violations(
    modules_dir: Path, keywords: list[str]
) -> list[dict]:
    """Scan module design files for EXCLUSION keyword violations."""
    violations = []
    if not modules_dir.exists() or not keywords:
        return violations

    # Build word-boundary patterns for each keyword
    patterns = []
    for kw in keywords:
        escaped = re.escape(kw)
        patterns.append((kw, re.compile(rf"\b{escaped}\b", re.I)))

    scan_files = ["design.md", "decisions.md"]
    for module_dir in sorted(modules_dir.iterdir()):
        if not module_dir.is_dir() or module_dir.name.startswith("_"):
            continue
        for fname in scan_files:
            fpath = module_dir / fname
            if not fpath.exists():
                continue
            text = fpath.read_text(encoding="utf-8")
            lines = text.splitlines()
            for i, line in enumerate(lines, 1):
                stripped = line.strip()
                # Skip claim declaration lines
                if re.match(r"(?:>\s*)?-\s*\[", stripped):
                    continue
                # Skip lines declaring or referencing the constraint
                if re.search(
                    r"DO\s+NOT|否决|约束|不替代|不做.*只|职责.*不|的职责",
                    stripped,
                    re.I,
                ):
                    continue
                for kw, pattern in patterns:
                    if pattern.search(stripped):
                        violations.append(
                            {
                                "module": module_dir.name,
                                "file": f"{module_dir.name}/{fname}",
                                "line": i,
                                "keyword": kw,
                                "content": stripped,
                            }
                        )
    return violations


def build_claim_map(
    claims: dict[str, dict[str, dict]],
) -> dict[str, list[tuple[str, str]]]:
    """Build reverse map: anchor_text -> [(module_name, claim_info)]."""
    claim_map: dict[str, list[tuple[str, str]]] = {}
    for module_name, module_claims in claims.items():
        for anchor_text, info in module_claims.items():
            claim_map.setdefault(anchor_text, []).append(
                (module_name, info["claim"])
            )
    return claim_map


def check_coverage(
    anchors: dict[str, list[str]], claim_map: dict[str, list[tuple[str, str]]]
) -> tuple[list[str], bool]:
    """Check EFFECT/SECURITY/NECESSITY coverage.

    Returns (report_lines, has_security_gap).
    """
    report = []
    has_security_gap = False

    for anchor_type in ("EFFECT", "SECURITY", "NECESSITY"):
        type_anchors = anchors.get(anchor_type, [])
        if not type_anchors:
            continue

        unclaimed = []
        for anchor_text in type_anchors:
            if anchor_text not in claim_map:
                unclaimed.append(anchor_text)

        if unclaimed:
            icon = "\U0001f6d1" if anchor_type == "SECURITY" else "⚠️"
            claimed_count = len(type_anchors) - len(unclaimed)
            report.append(
                f"{icon} [{anchor_type}] {claimed_count}/{len(type_anchors)} 已认领"
            )
            for ua in unclaimed:
                report.append(f"   {icon} 未认领: [{anchor_type}] {ua}")
            if anchor_type == "SECURITY":
                has_security_gap = True
        else:
            report.append(
                f"✅ [{anchor_type}] {len(type_anchors)}/{len(type_anchors)} 已认领"
            )

    return report, has_security_gap


def main():
    if len(sys.argv) < 2:
        print(
            "Usage: python3 check_anchors.py <phase-dir>", file=sys.stderr
        )
        sys.exit(1)

    phase_dir = Path(sys.argv[1])
    define_path = phase_dir / "_define.md"
    modules_dir = phase_dir / "modules"

    if not define_path.exists():
        print(f"❌ _define.md not found: {define_path}", file=sys.stderr)
        sys.exit(1)

    # 1. Parse anchors
    anchors = parse_anchors(define_path)
    total = sum(len(v) for v in anchors.values())
    print(f"📋 解析到 {total} 条设计锚点")
    for atype in ANCHOR_TYPES:
        alist = anchors[atype]
        if alist:
            print(f"   [{atype}] {len(alist)} 条")

    # 2. Parse module claims
    claims = parse_module_claims(modules_dir)
    print(f"\n📦 扫描到 {len(claims)} 个模块的锚点认领")
    for module_name, module_claims in claims.items():
        print(f"   {module_name}: {len(module_claims)} 条认领")

    # 3. Check EFFECT/SECURITY/NECESSITY coverage
    claim_map = build_claim_map(claims)
    print("\n## 锚点覆盖检查")
    coverage_report, has_security_gap = check_coverage(anchors, claim_map)
    for line in coverage_report:
        print(line)

    # 4. Check EXCLUSION violations
    has_exclusion_violation = False
    exclusion_anchors = anchors.get("EXCLUSION", [])
    if exclusion_anchors:
        print("\n## 排除约束违规检查")
        keywords = extract_exclusion_keywords(exclusion_anchors)
        print(f"   扫描关键词: {', '.join(keywords)}")

        violations = scan_exclusion_violations(modules_dir, keywords)
        if violations:
            has_exclusion_violation = True
            for v in violations:
                print(
                    f"   🚨 违规: {v['file']}:{v['line']} — 命中 \"{v['keyword']}\""
                )
                print(f"      内容: {v['content']}")
        else:
            print("   ✅ 未发现排除约束违规")

    # Exit code
    if has_security_gap or has_exclusion_violation:
        sys.exit(2)
    sys.exit(0)


if __name__ == "__main__":
    main()
