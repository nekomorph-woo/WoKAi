# wok 管道指南

根据任务规模选择合适的 skill 组合，不需要每次都走完整管道。

## 场景速查

| 场景 | 管道 | 说明 |
|------|------|------|
| 简单 bug 修复 | `wok-implement` | 已知问题，直接修 |
| bug 根因不明 | `wok-issue` → `wok-implement` | 先排查再修 |
| 改几行现有代码 | `wok-implement` | 无需设计 |
| 理解现有代码再改 | `wok-findings` → `wok-implement` | 先摸底再动手 |
| 缺功能想法 | `wok-idea` | 发散灵感 + 设计路线图 |
| 小功能（1-2 文件） | `wok-define` → `wok-implement` | 一点设计 + 直接写 |
| 小功能（有设计存量） | `wok-plan` → `wok-implement` | 设计已有，翻译为执行步骤 |
| 新模块（单个） | `wok-define` → `wok-design` → `wok-implement` | 单模块跳过批量 |
| 大功能（多模块） | `wok-define` → `wok-design` → `wok-design-review` → `wok-plan` → `wok-implement` → `wok-code-review` | 完整管道 |
| 实现后审查 | `wok-code-review` | 独立审查变更质量 |
| 审查后深度分析 | `wok-code-review` → `wok-cr-insight` | 先审查再分析 Advisory 根因 |
| 从零规划 | `wok-idea` → `wok-define` → ... | 先发散再定义 |

## 灵活入口原则

每个管道技能都可独立使用。`upstream` 声明表示"可以读取该技能的产出"，不是"必须先运行"。

- **有上游产出**：读取 frontmatter 和关键章节，复用已有设计，减少重复工作
- **无上游产出**：从当前对话上下文和代码库探索中获取必要信息，正常执行

## 设计存量判断

同一任务在不同设计存量下，产出深度不同：

| 存量 | 判断方式 | 产出 |
|------|----------|------|
| 0%（0→1） | `plans/` 无相关文档 | 全量产出 |
| 30-50% | 部分模块已有设计 | 增量 + 受影响模块标注 |
| 70%+ | 核心模块已就绪 | 仅增量变更 |

## 各 Skill 快速定位

| Skill | 做什么 | 何时用 |
|-------|--------|--------|
| `wok-idea` | 发散功能想法 + 设计路线图 | 缺灵感、需要功能规划时 |
| `wok-findings` | 探索现有代码约束 | 需要理解已有架构时 |
| `wok-define` | 定义 What（问题/目标/锚点/验收标准） | 需要明确做什么时 |
| `wok-design` | 拆模块 + 设计接口 + 记录决策 | 需要拆分和设计时 |
| `wok-design-review` | 交叉验证一致性 | 多模块设计完成后 |
| `wok-plan` | 翻译为编码执行步骤 | 设计已就绪，准备写代码时 |
| `wok-implement` | TDD 驱动开发（RED-GREEN-REFACTOR） | 有执行计划或直接编码时 |
| `wok-code-review` | 多 agent 并行代码审查 | 实现完成后审查变更质量 |
| `wok-cr-insight` | 分析 Advisory 根因 + 修改方案 | 审查报告有 🟡 需深入分析时 |
| `zap` | 规范化 commit message，关联 issue | 审查通过后提交 |
