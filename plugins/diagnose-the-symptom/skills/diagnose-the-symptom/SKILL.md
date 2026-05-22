---
name: diagnose-the-symptom
description: 调查问题根因并创建带 TDD 修复计划的 issue。Use when 用户报告 bug、要求创建 issue、提到 "diagnose" / "排查" / "诊断" / "diagnose-the-symptom"。
pipeline:
  upstream: []
  downstream: [cook-by-recipe, season-the-dish]
  gate: false
  output: none
  adaptive: false
---

# Triage Issue

调查问题根因，创建包含 TDD 修复计划的 issue。

## 执行流程

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
   - "触发设计审查" → 对找到的 design.md 执行 `season-the-dish` 的 3 项检查（接口一致性、依赖方向、跨模块覆盖）
   - "跳过审查，直接创建 Issue"
3. **未找到**：静默跳过，继续 §4

审查发现追加到 Issue body 的"根因分析"节中。

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
| 修复 ≤ 3 个文件，无架构变更 | 简单修复 | 直接创建 Issue，后续 `/cook-by-recipe` |
| 修复 > 3 个文件，或涉及模块边界 | 需要设计 | 创建 Issue 后建议用户走 `define-a-delicacy` → `prepare-the-ingredient` → `write-a-recipe` → `/cook-by-recipe` |
| 根因指向架构缺陷 | 需要重构 | 创建 Issue 后建议用户先走烹饪管线 `define-a-delicacy` → `prepare-the-ingredient` → `write-a-recipe` → `/cook-by-recipe` |

简单修复路径直接进入步骤 6。需要设计的路径创建 Issue 时在 Issue 体中标注。

### 6. 创建 Issue

使用已判断的 CLI 创建 issue：

- GitHub: `gh issue create --title "..." --body "..."` 或 `gh issue create --file -` (从 stdin)
- GitLab: `glab issue create --title "..." --description "..."` 或 `glab issue create --file -` (从 stdin)

**DO NOT** 在创建前请求用户审阅。直接创建，创建后输出 issue URL 和根因摘要。

## Issue 模板

```markdown
## 修复范围

> ⚠️ 需要设计 / 简单修复
> （需要设计时标注建议的管道路径）

## 问题

描述 bug 或 issue：
- 实际行为
- 预期行为
- 复现步骤（如适用）

## 根因分析

调查发现：
- 涉及的代码路径
- 当前代码失败原因
- 相关因素

**DO NOT** 包含具体文件路径、行号或实现细节。描述模块、行为和契约。

## TDD 修复计划

RED-GREEN 循环列表：

1. **RED**: 编写测试验证 [预期行为]
   **GREEN**: [最小变更使其通过]

2. **RED**: 编写测试验证 [下一行为]
   **GREEN**: [最小变更使其通过]

...

**REFACTOR**: [全部测试通过后的清理工作]

## 验收标准

- [ ] 标准 1
- [ ] 标准 2
- [ ] 新测试全部通过
- [ ] 现有测试不受影响
```
