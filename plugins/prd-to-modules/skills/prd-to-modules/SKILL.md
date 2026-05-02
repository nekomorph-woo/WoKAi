---
name: prd-to-modules
description: 将大 PRD 纵向拆分为自闭环的功能模块，设计模块间依赖关系和对内对外接口，最终为每个模块生成执行计划。Use when 用户要求拆分 PRD 为模块、设计模块接口、规划模块依赖、或提到 "模块拆分" / "模块设计" / "prd-to-modules"。
---

# PRD 转模块设计

将大 PRD 纵向拆分为自闭环的功能/技术模块，设计模块间依赖与接口，为每个模块生成执行计划。输出至 `当前项目根目录/plans/modules/`。

## 输入

- 上下文中的完整 PRD（若无则向用户询问）
- 可选：现有代码库（用于理解已有架构）

## 输出结构

```
plans/modules/
├── _registry.md          # 模块注册表 + 依赖图
├── <module-a>/
│   ├── design.md         # 模块设计文档
│   └── plan.md           # 模块执行计划
└── ...
```

## 流程总览

```
SOP1 → ✅ 确认 → SOP2 → ✅ 确认 → SOP3 → ✅ 确认 → SOP4 → ✅ 确认 → SOP5 → ✅ 确认
```

SOP4 完成后设计锁定。

## 流程

### SOP1: 模块识别与依赖分析

1. 读取 PRD 全文，识别功能/技术模块（纵向贯穿，非按层拆分）
2. 分析模块间依赖：X 依赖 Y 的什么能力/接口/模型/方法
3. 输出 `plans/modules/_registry.md`

使用 1 个 Explore subagent 分析 PRD。详见 [reference/sop1-identification.md](reference/sop1-identification.md)。

**→ 向用户展示模块列表和依赖关系，确认后进入 SOP2。**

### SOP2: 模块设计

1. 遵循 `/design-an-interface` 的设计哲学（发散思维、Design It Twice）
2. 模块间接口按 API 协议设计：仅通过入参/出参通信
3. DO NOT 在接口调用中产生副作用（写操作/消息传递除外）
4. 最大化降低调用者与被调用者的耦合度，为后续编码阶段 AI 并行实现提供基础
5. SOP1 已收集设计所需全部上下文，优先从文档获取，不询问用户
6. 同时 spawn 最多 3 个 general-purpose subagent 并行设计
7. 每个模块输出 `plans/modules/<name>/design.md`

**模块数量较多时**（7+）：先评估是否有可合并的相似模块以减少总数，降低串行轮次耗时。

详见 [reference/sop2-design.md](reference/sop2-design.md)。

**→ 向用户展示各模块设计摘要，确认后进入 SOP3。**

### SOP3: 交叉分析与公共提取

1. 对比所有模块 design.md，识别跨模块公共产物
2. 提取公共模块、公共模型、公共方法
3. 更新各模块 design.md，引用公共产物而非重复定义

由主流程执行（需要全局视野）。详见 [reference/sop3-cross-analysis.md](reference/sop3-cross-analysis.md)。

**→ 向用户展示提取的公共产物列表（新增模块、公共模型、公共方法），确认后进入 SOP4。**

### SOP4: 审查与修正

1. 检查模块间职责交叉和边界模糊
2. 验证每个模块的自闭环性（依赖可满足、接口完整）
3. 必要时拆分/合并模块，更新 _registry.md 和受影响的 design.md

由主流程执行。详见 [reference/sop4-review.md](reference/sop4-review.md)。

**→ 向用户展示修正内容，确认后设计锁定，进入 SOP5。**

### SOP5: Agent Teams 计划生成

使用 Agent Teams（独立 Claude Code 实例，teammates 直接互发消息）为每个模块生成执行计划。

**前提**：需要 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`。

**角色**：

| 角色 | 职责 |
|------|------|
| Team lead（主流程） | 创建团队、分配任务、汇总结果 |
| PRD 查询专员 | PRD 内容查询服务，响应队友查询 |
| 依赖分析专员 | 模块依赖关系查询服务，响应队友查询 |
| 计划编写专员 | 逐模块 claim 任务，生成执行计划 |

**执行**：

1. 主流程创建 Agent Team，spawn 3 个 teammates
2. 创建共享任务列表，为每个模块创建一个待认领任务
3. 计划编写专员直接向 PRD 查询专员和依赖分析专员发消息查询（P2P，无需 lead 中继）
4. 已决策内容直接从专员查询，不重新询问用户
5. 计划包含 block-by 依赖关系
6. 每个模块输出 `plans/modules/<name>/plan.md`

详见 [reference/agent-teams.md](reference/agent-teams.md)。

**→ 向用户展示所有模块执行计划总览，确认后完成。**

## 异常处理

- 每个 subagent 设 **20 分钟超时**，超时后重试 1 次
- 连续失败则跳过该模块，在 SOP4 审查中标记为需人工介入
- SOP 间失败（如 SOP2 某 subagent 超时）不阻塞后续 SOP，已完成的模块正常流转

## 关键原则

- **纵向贯穿** — 按业务/功能纵向切分，非按技术层水平切分
- **自闭环** — 每个模块 design.md 足以独立指导实现
- **低耦合** — 模块间仅通过 API 协议（入参/出参）通信，杜绝接口副作用
- **依赖显式化** — 所有模块间依赖在 _registry.md 中声明
- **已决策不重复** — PRD 和模块设计已确认的内容直接引用
