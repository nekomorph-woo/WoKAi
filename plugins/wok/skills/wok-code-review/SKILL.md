---
name: wok-code-review
description: >
  多 agent 并行代码审查引擎。调度 5 个专业 agent 审查代码，三级分级自动修复，
  迭代验证直到收敛。Use when 用户要求代码审查、审查变更、提到
  "wok-code-review" / "代码审查" / "code review"。
pipeline:
  upstream: [wok-implement, wok-plan]
  downstream: [wok-cr-insight]
  gate: false
  output: _review.md
  adaptive: false
---

# 多 Agent 代码审查

审查编排引擎，调度 5 个专业 agent 并行审查，三级分级自动修复，迭代验证直到收敛。

## 命令接口

```
/wok-code-review [--scope <范围>] [--focus <维度>] [--max-rounds <N>] [--no-fix]
```

| 参数 | 格式 | 默认值 | 说明 |
|------|------|--------|------|
| `--scope` | `diff` / `branch` / `files:<path>` | `diff` | 审查范围 |
| `--focus` | 逗号分隔的 agent 名 | 全部 | 仅启用指定 agent |
| `--max-rounds` | 正整数 | `3` | 最大修复-验证轮次 |
| `--no-fix` | flag | off | 只审查不修复 |

**agent 名称映射**：

| `--focus` 值 | agent |
|-------------|-------|
| `logic` | code-reviewer |
| `comment` | comment-analyzer |
| `error-handling` | silent-failure-hunter |
| `type` | type-design-analyzer |
| `test` | pr-test-analyzer |

## 参考文档

执行前读取以下共享参考文档：

- `reference/finding-format.md` — finding 输出格式规范
- `reference/severity-guide.md` — 严重度分级标准
- `reference/agent-constraints.md` — 排除约束
- `reference/pipeline-context.md` — 管道上下文协议
- `reference/report-writer.md` — 报告写入规格

## 执行阶段

### Stage 0: 预检

1. **检测管道上下文**：搜索 `plans/` 目录下的 `_define.md`
   - 存在 → 管道模式：提取设计锚点和验收标准作为审查基准，`phase_dir` 设为 `plans/<system-name>/`
   - 不存在 → 独立模式（`cr-` 管道）：生成 `cr-` 前缀的 system-name（如 `cr-refactor-auth`），创建 `plans/cr-<name>/` 目录，`phase_dir` 设为该目录
2. **解析已有报告**：若 `<phase_dir>/_review.md` 存在，提取所有已报告 🟡 的 `file:line + title` 作为去重集合
3. **解析 `--scope`**：
   - `diff` → `git diff --name-only` 获取未提交变更
   - `branch` → `git diff --name-only main...HEAD` 获取全分支变更
   - `files:<path>` → 直接使用指定路径
4. 过滤非代码文件（图片、二进制、lock 文件等）
5. 若无变更文件 → 输出"无变更可审查"并退出

**产出**：上下文包（含 files 列表、language、design_anchors、prd_summary、phase_dir）

### Stage 1: 并行审查

读取 `agents/*.md` 目录下所有 agent 定义文件。按 `--focus` 参数筛选子集，未指定则调度全部 5 个。

使用 Agent 工具并行调度每个 agent：

| Agent | 输入构建方式 |
|-------|-------------|
| code-reviewer | 构建 XML 格式上下文包（`<files>` + `<rules>` + `<design-anchors>`） |
| comment-analyzer | 构建表格格式（files + diff + phase-context） |
| silent-failure-hunter | 构建表格格式（files + context + language） |
| type-design-analyzer | 构建表格格式（files + context） |
| pr-test-analyzer | 构建表格格式（scope_files + test_dir + prd_context） |

**构建规则**：
- `files`：读取每个文件的完整内容，包含绝对路径和语言标识
- `rules`：从 `CLAUDE.md` 和 `.claude/rules/*.md` 提取项目规则摘要
- `design-anchors`：管道模式下从 `_define.md` 提取；独立模式省略
- `diff`：`git diff` 的变更内容
- `context` / `phase-context` / `prd_context`：管道模式下为设计锚点摘要；独立模式为 null

每个 agent 返回标准化 finding 列表。格式参见 `reference/finding-format.md`。

### Stage 2: 聚合与分级

1. 收集所有 agent 的 findings，按 `file:line + title` 去重
2. 对照 `reference/severity-guide.md` 校准严重度
3. **🟡 去重**：对比 Stage 0 提取的去重集合，移除已报告的 🟡
4. 分类：
   - `findings_open`：本轮所有 🔴 + 🟠 + 去重后的 🟡
   - `findings_advisory_new`：本轮新增的 🟡（仅首次出现）

### Stage 3: 两阶段修复 + 验证循环

**`--no-fix` 模式下跳过此阶段。**

循环执行以下步骤，直到收敛或达到 `max-rounds`：

1. **洞察分析 🔴🟠**：
   - 执行 cr-insight 的分析流程，参数为 `--types red,orange`
   - 每个 🔴🟠 获得结构化洞察（根因 + 修改方案 + 一致性评估）
   - cr-insight 分析失败 → 跳过该 finding 的洞察，降级为直接修复
2. **基于洞察修复 🔴🟠**：
   - 参考洞察中的修改方案，结合原始 finding 描述执行代码修改
   - 管道模式下，修复前对照 PRD 设计锚点验证方向
   - 记录 `fix_applied`
3. **触发 simplify**：检查 finding 的 `优化维度` 字段
   - 非空 → per-file 调用 simplify agent（管道内调用模式，静默执行）
   - 记录 `simplified: true`
4. **追加验证**：对已修复文件重新执行 Stage 1（仅涉及修改文件的 agent）
5. **收敛判断**：
   - 验证轮次无新 🔴🟠 → `converged = true`，退出循环
   - 有新 🔴🟠 → 继续修复
6. **迭代上限**：达到 `max-rounds` → `max_rounds_reached = true`，剩余 🔴🟠 降级为 🟡

**修复失败处理**：
- 🔴 修复失败 → 阻塞，升级用户确认
- 🟠 修复失败 → 标记为用户确认，不阻塞

### Stage 4: 报告写入

调用 `reference/report-writer.md` 规格写入 `<phase_dir>/_review.md`：

- 首次生成 → 创建文件，写入 header + Round 1
- 后续轮次 → 当前 Round 覆写，历史向下追加
- 🔴🟠 修复 → 从 Open 移入 Resolved
- 🟡 仅首次出现时写入 Open

状态标记：
- 无 🔴🟠 → `✅ Converged`
- 达到上限 → `⚠️ Max rounds`

### Stage 5: 洞见生成

触发 `wok-cr-insight` 分析 🟡 问题。cr-insight 在 `_review.md` 的每个 🟡 问题下方追加根因分析和修改方案。

调用方式：直接执行 cr-insight 的分析流程，参数为 `--types yellow`。此时 🔴🟠 已在 Stage 3 获得洞察并修复，此步骤补全 🟡 分析。

### Stage 6: 验收标准检查（仅管道模式）

**独立模式（`cr-` 管道）跳过此阶段。**

1. **定位验收文档**：
   - `fix` 管道 → 读取 `_issue.md` 的 `## 验收标准` section
   - 其他管道 → 读取 `_define.md` 的 `## 验收标准` section
   - 无验收标准 → 跳过此阶段
2. **逐条检查**：
   - 🤖 项（自动验证）：
     - 对应代码已有测试覆盖或修复已确认 → 标记 `[x]`
     - 未满足 → 保持 `[ ]`，列入「未通过」清单
   - 👤 项（人工确认）：保持 `[ ]` 不动，留给人类在 Dashboard 确认
3. **写回文件**：仅修改 `[ ]` → `[x]`，不改变其他内容
4. **结果提示**：
   - 存在未通过的 🤖 项 → 输出「N 条自动验收标准未通过，需 wok-implement 修复/返工」
   - 存在待确认的 👤 项 → 输出「N 条验收标准需人工确认，请在 Dashboard 中操作」

## 异常处理

| 场景 | 处理 |
|------|------|
| 无变更文件 | 输出"无变更可审查"，不产出报告 |
| 达到 max-rounds 未收敛 | 剩余 🔴🟠 降级为 🟡，标记"达到迭代上限" |
| cr-insight 分析失败 | 跳过该 finding 的洞察，降级为直接修复 |
| 修复失败（🔴） | 升级用户确认，阻塞管道 |
| 修复失败（🟠） | 标记用户确认，不阻塞 |
| simplify 语义变更风险 | 跳过该文件，记录原因 |

## 实现约束

- 每个 agent 必须可独立调用
- `--no-fix` 模式下同步跳过 Stage 3 和 Stage 3 的 simplify
- DO NOT 替代 CI（构建、类型检查、测试运行）
- DO NOT 替代 linter（代码风格、格式化）
- DO NOT 做 PR review（不评估变更合理性）
- 管道终点全分支审查由外部调用方使用 `--scope branch` 触发
