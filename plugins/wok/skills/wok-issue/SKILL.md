---
name: wok-issue
description: 调查问题根因，生成本地 _issue.md 产物，并按平台条件创建远程 issue。Use when 用户报告 bug、要求创建 issue、提到 "wok-issue" / "排查" / "诊断"。
pipeline:
  upstream: []
  downstream: [wok-implement]
  gate: false
  output: document
  adaptive: false
---

# Triage Issue

调查问题根因，生成本地 `_issue.md`，按平台条件创建远程 issue。

## 执行流程

### 0. 确定 system-name

生成 `fix-` 前缀的 system-name：

- 从问题描述提取关键词（模块名、错误类型、组件名）
- 格式：`fix-<关键词>`（如 `fix-auth-401`、`fix-payment-timeout`）
- 使用 AskUserQuestion 让用户确认生成的 system-name，或提供自定义名称
- 创建目录 `plans/fix-<system-name>/`

### 1. 捕获问题

获取问题简要描述和补充资料。

**情况 A：用户已提供问题描述**

使用 AskUserQuestion 询问：

```
是否有更多资料？（报错信息、现场日志、初步排查等）
```

选项：
- `是，我来提供` → 等待用户输入
- `暂无，开始调查` → 进入步骤 2

**情况 B：用户未提供问题描述**

使用 AskUserQuestion 询问：

```
请描述遇到的问题：
- 问题现象
- 报错信息（如有）
- 现场日志（如有）
- 初步排查信息（如有）
```

收到回复后，**DO NOT** 继续追问。立即开始调查。

### 2. 探索诊断

使用 Agent 工具（subagent_type=Explore）深入调查代码库。目标：

| 目标 | 说明 |
|------|------|
| **Where** | 问题表现位置（入口点、UI、API 响应） |
| **What** | 涉及的代码路径（追踪流程） |
| **Why** | 根本原因（而非表象） |
| **Related** | 相关代码（相似模式、测试、相邻模块） |

检查项：

- 相关源文件及其依赖
- 现有测试（覆盖范围、缺失部分）
- 受影响文件的最近变更（`git log`）
- 代码路径中的错误处理
- 代码库中正确工作的相似模式

### 3. 确定修复方案

基于调查结果确定：

- 修复根因所需的最小变更
- 受影响的模块/接口
- 需要通过测试验证的行为
- 问题类型：回归缺陷、功能缺失、设计缺陷

### 3.5 设计缺陷审查（仅当根因为设计缺陷时）

当 §3 判定问题类型为"设计缺陷"时：

1. 从受影响模块名称搜索 `plans/` 下对应的 `design.md`（Glob `plans/**/modules/*/design.md`，匹配模块名关键词）
2. **找到相关 design.md**：使用 AskUserQuestion 询问用户：
   - "触发设计审查" → 对找到的 design.md 执行 `wok-design-review` 的 3 项检查（接口一致性、依赖方向、跨模块覆盖）
   - "跳过审查，直接创建 Issue"
3. **未找到**：静默跳过，继续 §4

审查发现追加到 `_issue.md` 的"根因分析"节中。

### 4. 设计 TDD 修复计划

创建有序的 RED-GREEN 循环列表。每个循环是一个垂直切片：

- **RED**：描述捕获错误/缺失行为的具体测试
- **GREEN**：描述使测试通过的最小代码变更

规则：

- 测试通过公共接口验证行为，而非实现细节
- 一次一个测试，垂直切片（**DO NOT** 先写所有测试再写所有代码）
- 测试应能经受内部重构
- 最后包含重构步骤（如需要）

**耐久性**：描述行为和契约，而非内部结构。测试断言可观察结果（API 响应、UI 状态），而非内部状态。

### 5. 评估修复范围

判断修复规模，决定后续路径：

| 条件 | 判断 | 后续路径 |
|------|------|----------|
| 修复 ≤ 3 个文件，无架构变更 | 简单修复 | 生成本地产物，后续 `/wok-implement` |
| 修复 > 3 个文件，或涉及模块边界 | 需要设计 | 生成本地产物后建议用户走 `wok-define` → `wok-design` → `wok-plan` → `/wok-implement` |
| 根因指向架构缺陷 | 需要重构 | 生成本地产物后建议用户先走设计管线 |

简单修复路径直接进入步骤 6。需要设计的路径在 `_issue.md` 中标注建议管道路径。

### 6. 生成本地 `_issue.md`

产出 `plans/fix-<system-name>/_issue.md`：

```markdown
---
status: draft
freshness: fresh
intent: action
scope: global
depends: []
changed: 初始版本
wok:
  feature: <system-name>
  stage: issue
  upstream_hashes: {}
---

> **做什么**：记录 bug 根因分析和 TDD 修复计划
> **怎么做**：探索诊断 → 根因定位 → TDD 循环设计
> **阻塞**：无

## 修复范围

> 简单修复 / ⚠️ 需要设计
> （需要设计时标注建议的管道路径）

## 问题

- **实际行为**：
- **预期行为**：
- **复现步骤**：

## 根因分析

- **代码路径**：
- **失败原因**：
- **问题类型**：回归缺陷 / 功能缺失 / 设计缺陷

## TDD 修复计划

1. **RED**: 编写测试验证 [预期行为]
   **GREEN**: [最小变更使其通过]

2. **RED**: 编写测试验证 [下一行为]
   **GREEN**: [最小变更使其通过]

**REFACTOR**: [全部测试通过后的清理工作]

## 验收标准

- [ ] 🤖 <可自动验证的条件>
- [ ] 👤 <需人工确认的条件>
- [ ] 🤖 新测试全部通过
- [ ] 🤖 现有测试不受影响
```

### 7. 创建远程 Issue（平台条件化）

判断平台：运行 `git remote get-url origin`

**GitHub**（URL 包含 `github.com`）：

1. 创建远程 issue：`gh issue create --title "..." --body "..." --label "bug"`
2. 在 `_issue.md` 末尾追加：

```markdown
## 远程 Issue

- URL: <issue_url>
```

**GitLab**（URL 包含 `gitlab.com` 或私有 GitLab 域名）：

1. **DO NOT** 创建远程 issue
2. 仅保留本地 `_issue.md` 产物
3. 输出提示："本地 _issue.md 已生成。GitLab issue 需手动创建。"

**完成**：输出 `_issue.md` 路径 + 远程 issue URL（如有）+ 根因摘要。

## 约束

- **DO NOT** 包含具体文件路径、行号或实现细节 — 描述模块、行为和契约
- **DO NOT** 在创建 `_issue.md` 前请求用户审阅 — 直接生成，用户可在 Dashboard 中审批
- **DO NOT** 在 GitLab 平台创建远程 issue — 仅生成本地文档
