# SOP5: Agent Teams 协议

## 概述

SOP5 使用 Claude Code 的 **Agent Teams** 功能（独立 Claude Code 实例 + 共享任务列表 + teammates 直接互发消息）为每个模块生成执行计划。

**前提条件**：`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`（需在环境变量或 settings.json 中启用）。

### Agent Teams vs Subagents

| 维度 | Subagents | Agent Teams |
|------|-----------|-------------|
| 实例 | 单会话内的子进程 | **独立的 Claude Code 实例** |
| 通信 | 结果只返回主 agent | **Teammates 直接互发消息（P2P）** |
| 协调 | 主 agent 管理 | **共享任务列表 + self-claim** |
| 上下文 | 继承主 agent 上下文 | 各自独立上下文，加载项目 CLAUDE.md/skills |

## 团队结构

```
Team Lead（主流程）
├── PRD 查询专员      ← teammate，响应 PRD 内容查询
├── 依赖分析专员      ← teammate，响应模块依赖关系查询
└── 计划编写专员      ← teammate，逐模块 claim 任务生成计划
```

## 启动流程

Team lead 通过自然语言创建团队并 spawn teammates：

```
Create an agent team to generate execution plans for each module.
Spawn three teammates:
- "prd-query": PRD 内容查询专员，提供 PRD 原文和已决策内容的查询服务
- "dep-analyst": 模块依赖分析专员，提供模块间依赖关系的查询服务
- "plan-writer": 计划编写专员，使用 /prd-to-plan 工作流逐模块生成执行计划
```

## 角色定义

### PRD 查询专员（prd-query）

**职责**：根据队友查询请求，从 PRD 中提取和返回相关内容。

**掌握资料**：完整 PRD 文档、模块注册表、所有模块 design.md。

**行为规则**：
- 收到查询后返回 PRD 原文 + 所属章节位置
- 查询涉及已决策内容时，标注决策结果
- DO NOT 做分析或推断，仅返回原文

### 依赖分析专员（dep-analyst）

**职责**：根据队友查询请求，返回指定模块的依赖和被依赖信息。

**掌握资料**：模块注册表、所有模块 design.md、SOP3/SOP4 交叉分析结果。

**行为规则**：
- 返回完整依赖信息：依赖了谁/需要什么、被谁依赖/需要提供什么
- 同时返回相关 design.md 中的接口签名
- DO NOT 做分析或推断，仅返回结构化信息

### 计划编写专员（plan-writer）

**职责**：使用 `/prd-to-plan` 的垂直切片工作流，逐模块生成执行计划。

**行为规则**：
- 从共享任务列表 claim 模块任务（串行，一次一个）
- 遵循垂直切片原则，每阶段覆盖端到端路径
- **直接向 prd-query 和 dep-analyst 发消息查询**（P2P，无需 lead 中继）
- 已决策内容直接查询，DO NOT 重新询问用户
- 输出 `plans/modules/<name>/plan.md`

**spawn 提示**：

```
你是计划编写专员。从共享任务列表中逐个 claim 模块任务，为每个模块生成执行计划。

## 工作流程
1. Claim 一个模块任务
2. 读取 plans/modules/<name>/design.md
3. 遵循 /prd-to-plan 的垂直切片原则拆分阶段
4. 需要 PRD 信息时，直接发消息给 prd-query
5. 需要依赖信息时，直接发消息给 dep-analyst
6. 输出 plans/modules/<name>/plan.md
7. 标记任务完成，claim 下一个

## 关键约束
- DO NOT 重新询问用户已决策的内容
- DO NOT 包含具体文件名/函数名
- 每个阶段标注 block-by 依赖
- 跨模块决策引用 _registry.md
```

## 任务列表

Team lead 创建共享任务列表：

```
任务列表:
├── [pending] 生成 <module-a> 执行计划
├── [pending] 生成 <module-b> 执行计划
├── [pending] 生成 <module-c> 执行计划
└── ...
```

- 计划编写专员 self-claim 任务（串行处理）
- prd-query 和 dep-analyst 不 claim 任务，仅响应查询

## 通信机制

Teammates 通过 Mailbox 系统直接互发消息，无需 lead 中继：

```
plan-writer → prd-query:    "用户认证模块的技术选型决策是什么？"
prd-query   → plan-writer:  "PRD 第3.2节: 采用 JWT + httpOnly Cookie..."

plan-writer → dep-analyst:  "auth 模块依赖哪些模块的什么接口？"
dep-analyst → plan-writer:  "auth 依赖 user 模块的 getUserById 接口..."
```

- 消息自动投递，无需轮询
- Teammate idle 时自动通知 lead

## 完成与清理

所有任务完成后：

1. Lead 确认所有 plan.md 已生成
2. 关闭 teammates：`Ask the prd-query teammate to shut down`（逐个关闭）
3. Lead 汇总输出：
   - 模块数量和计划数量
   - 各模块的阶段数
   - 跨模块 block-by 依赖关系总览
4. 清理团队：`Clean up the team`
