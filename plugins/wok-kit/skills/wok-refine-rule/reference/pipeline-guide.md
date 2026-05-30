# wok 管道指南

根据任务规模选择合适的管道类型。每种管道有固定的入口 SKILL 和 `plans/` 目录前缀。

## 管道类型速查

| 前缀 | 管道 | 入口 SKILL | 流程 | Dashboard Tabs |
|------|------|-----------|------|----------------|
| `feat-` | 大功能 | `/wok-idea` | findings? → idea? → define → design → design-review → plan → implement → code-review | 概览, 需求, 设计, 校验, 执行, 审查 |
| `feat-s-` | 小功能 | `/wok-define` | define → design?(auto) → implement → code-review | 概览, 需求, 审查 |
| `fix-` | 问题修复 | `/wok-issue` | issue → implement → code-review | 概览, 问题, 审查 |
| `exp-` | 探索优化 | `/wok-findings` | findings → plan → implement → code-review | 概览, 探索, 执行, 审查 |
| `cr-` | 独立审查 | `/wok-code-review` | code-review → cr-insight | 概览, 审查 |

## 场景 → 管道映射

| 场景 | 入口命令 | 管道 |
|------|----------|------|
| 从零规划大功能 | `/wok-idea` | `feat-` |
| 小功能（1-3 模块） | `/wok-define` | `feat-s-` |
| bug 排查修复 | `/wok-issue` | `fix-` |
| 理解代码后优化 | `/wok-findings` | `exp-`（或转交其他管道） |
| 审查已有代码变更 | `/wok-code-review` | `cr-` |

## 灵活入口原则

每个管道 SKILL 都可独立使用。`upstream` 声明表示"可以读取该技能的产出"，不是"必须先运行"。

- **有上游产出**：读取 frontmatter 和关键章节，复用已有设计
- **无上游产出**：从当前对话上下文和代码库探索中获取必要信息

## system-name 前缀约定

所有管道产物存放于 `plans/<system-name>/`，通过前缀区分管道类型：

```
plans/
├── feat-user-system/        # 大功能管道
├── feat-s-login-modal/      # 小功能管道
├── fix-auth-401/            # 问题修复管道
├── exp-payment-module/      # 探索优化管道
└── cr-refactor-auth/        # 独立审查管道
```

前缀由入口 SKILL 自动生成，Dashboard 据此适配阶段视图和 next-action 提示。

## wok-findings 延迟定型

`/wok-findings` 是唯一有歧义的入口。探索完成后不立即创建目录，而是询问意图：

- **探索管道（exp-）**：创建 `plans/exp-<name>/_findings.md`
- **定义功能（feat-s-）**：转交 `/wok-define`，产物存入 `plans/feat-s-<name>/`
- **修复问题（fix-）**：转交 `/wok-issue`，产物存入 `plans/fix-<name>/`

## 各 Skill 快速定位

| Skill | 做什么 | 入口管道 |
|-------|--------|----------|
| `wok-idea` | 发散功能想法 + 设计路线图 | `feat-` |
| `wok-findings` | 探索现有代码约束 | `exp-`（默认） |
| `wok-define` | 定义 What（问题/目标/锚点/验收标准） | `feat-s-` |
| `wok-design` | 拆模块 + 设计接口 + 记录决策 | — |
| `wok-design-review` | 交叉验证一致性 | — |
| `wok-plan` | 翻译为编码执行步骤 | — |
| `wok-implement` | TDD 驱动开发（RED-GREEN-REFACTOR） | — |
| `wok-code-review` | 多 agent 并行代码审查 | `cr-` |
| `wok-cr-insight` | 分析 Advisory 根因 + 修改方案 | — |
| `wok-issue` | 调查根因 + TDD 修复计划 | `fix-` |
| `zap` | 规范化 commit message，关联 issue | — |
