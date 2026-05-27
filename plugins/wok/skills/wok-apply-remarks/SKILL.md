---
name: wok-apply-remarks
description: 处理 pipeline 备注（remarks），修改文档并传播影响。Use when 用户要求处理备注、应用备注、或提到 "wok-apply-remarks"。
pipeline:
  upstream: [wok-define, wok-design, wok-design-review, wok-dashboard]
  downstream: []
  gate: false
  output: document
  adaptive: true
---

# wok-apply-remarks

处理 `_remark.jsonl` 中的待处理备注，修正目标文档，执行 impact propagation，输出影响报告。

## 快速开始

1. 读取备注 → 按目标文档分组 → 检测冲突
2. 确认修改方案
3. 按文档批量执行 → 聚合传播
4. 输出影响报告

## 工作流程

### 1. 加载备注

读取 `<phase-dir>/_remark.jsonl`，筛选 `state: open`（缺少 state 字段视为 open）的备注。

如果用户指定了特定备注 ID 列表（如 `rem_a1b2c3d4, rem_e5f6g7h8`），仅处理指定的备注。

用户可通过 prompt 中嵌入的 `jsonl` 代码块直接提供备注数据，此时跳过 `_remark.jsonl` 读取，直接解析代码块内容。

无符合条件的备注时输出"无待处理备注"并结束。

### 2. 分组与冲突检测

**分组**：按 `refs[].file` 将备注归入目标文档组。同一文档的多条备注合并处理。无 refs 的备注归入「待确认」组，执行时向用户询问目标文档。

**冲突检测**：同一文档组内，两条备注的 refs 行范围重叠（如 L10-20 和 L15-25）→ 标记为冲突对，向用户展示两条备注内容，要求裁定处理顺序或取舍。

输出分组结果供用户审阅：

```
_define.md: [rem_a1b2c3d4, rem_e5f6g7h8]（无冲突）
modules/auth/design.md: [rem_x1y2z3, rem_p4q5r6]（冲突：L30-40 重叠）
待确认：[rem_no_ref]
```

### 3. 确认修改方案

按文档组展示：每组列出关联备注 ID、推断的 impact 等级、预期变更描述。取同一文档组内所有备注的最高 impact 作为该文档的变更影响。询问用户确认，用户可调整 impact 等级或排除特定备注。

判定规则详见 [impact-rules.md](reference/impact-rules.md)。

### 4. 按文档执行修改

对每个文档组（按管道深度从浅到深：`_define.md` → `_registry.md` → `*/design.md` → `_check.md` → `_plan.md`）：

1. 打开目标文档
2. 按行号从后往前应用该组所有备注的修改
3. 对组内每条备注，运行 `scripts/update-remark.py` 更新 `_remark.jsonl`（state=applied + summary + impact + changedFiles + staleDownstream）

脚本命令详见 [impact-rules.md](reference/impact-rules.md) 的「脚本命令」节。

### 5. 聚合 Impact Propagation

所有文档组执行完毕后，单次聚合传播：

1. 收集所有变更文档及其 impact，同一文档取最高等级
2. 读取 [propagation-rules.md](reference/propagation-rules.md) 确定受影响下游
3. PATCH → 不影响下游，跳过
4. 对每个受影响下游文档运行 `scripts/set-freshness.py`
5. freshness 只升级不降级（`fresh < impacted < stale`）

### 6. 输出影响报告

输出包含：已处理备注列表（ID + 摘要 + impact）、变更文档列表（按管道深度排序）、受影响下游（按 stale/impacted 分组）、建议下一步。建议根据影响等级和受影响阶段生成，详见 [impact-rules.md](reference/impact-rules.md) 的恢复策略。

## 参考文档

- [impact-rules.md](reference/impact-rules.md) — Impact 判定规则、恢复策略、多备注执行规则、脚本命令
- [propagation-rules.md](reference/propagation-rules.md) — 管道依赖图、传播表、freshness 优先级

## 约束

- 仅处理 `state: open` 的备注
- `applied` / `resolved` 状态的备注不可修改
- 每次修改前必须获得用户确认
- 同一文档的多条备注合并处理，从后往前应用，避免行号偏移
- 影响等级默认由 LLM 推断，用户可覆盖
- `_remark.jsonl` 和 frontmatter freshness 使用 `scripts/` 下的 Python 脚本修改
- Python 脚本仅使用标准库，无需安装依赖
