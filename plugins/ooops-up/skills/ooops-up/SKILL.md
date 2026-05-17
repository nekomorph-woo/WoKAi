---
name: ooops-up
description: 规范化 commit message 格式，支持关联 issue 自动关闭。Use when 用户要求 commit、提交代码、冲！、或提到 "ooops-up" / "commit"。
---

pipeline:
  upstream: []
  downstream: []
  gate: false
  output: none
  adaptive: false

# Ooops Up

规范化 commit message 格式，支持关联 GitHub/GitLab issue 自动关闭。

## Commit Message 格式

```
<type>(<scope>): <description>

Closes #<issue1>, closes #<issue2>
```

- **type**: 变更类型（必填）
- **scope**: 影响范围（必填，多处修改选主要 scope）
- **description**: 简要描述（单行）
- **Closes**: 关联 issue（可选，用户确认后添加）

### Type 类型

| Type | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修复 bug |
| `docs` | 文档变更 |
| `style` | 代码格式（不影响逻辑） |
| `refactor` | 重构 |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `chore` | 构建/工具/依赖 |
| `ci` | CI/CD 配置 |

## 执行流程

### 1. 分析变更

- 运行 `git diff --cached --stat` 查看暂存文件
- 运行 `git diff --cached` 分析具体变更内容
- 推断合适的 type 和 scope

### 2. 检测语言（按优先级）

1. 最近 5 条 commit message 语言
2. CLAUDE.md 内容语言
3. Claude Code 语言设置

### 3. 生成 commit message

- 使用检测到的语言编写 description
- 格式: `<type>(<scope>): <description>`

### 4. 自动关联 Issue

从上下文中扫描 issue 关联信号，**无信号则跳过，不询问**。

**扫描范围**（按优先级）：

| 信号 | 示例 |
|------|------|
| 用户消息中包含 `#<数字>` | "修复 #42"、"关联 #7 和 #13" |
| 用户消息中包含 issue URL | `https://github.com/owner/repo/issues/42` |
| 对话上下文中近期创建了 issue | diagnose-the-symptom / triage-issue 的输出含 issue 编号 |
| commit message draft 中引用了 issue | description 自带 `#<数字>` |

**匹配到 issue 时**：提取所有 issue 编号，追加到 commit message：
```
<type>(<scope>): <description>

Closes #42, closes #13
```

**未匹配时**：直接进入提交，不询问。

### 5. 执行提交

- 运行 `git commit -m "<message>"`
- 获取提交 ID

### 6. 输出变更摘要

## 控制台输出格式

```
✅ 提交成功
提交 ID: <short_hash>

包含内容:
- <修改点1>
- <修改点2>
- ...

关联 issue: #123, #122（可选）

<git stat 输出>
```

### 示例

```
✅ 提交成功
提交 ID: 1ba2b60

包含内容:
- 新增用户认证模块
- 修复 token 验证逻辑

关联 issue: #123, #124

5 files changed, 120 insertions(+), 30 deletions(-)
```

## Scope 推断规则

| 变更路径 | Scope 示例 |
|----------|-----------|
| `src/auth/*` | `auth` |
| `src/api/user.ts` | `api` |
| `tests/*` | `test` |
| `docs/*` | `docs` |
| `package.json`, `*.lock` | `deps` |
| `.github/workflows/*` | `ci` |
| 根目录配置文件 | `config` |
| 无法确定时 | 使用项目名或 `core` |

## Type 推断规则

| 变更特征 | Type |
|----------|------|
| 新增文件/函数/组件 | `feat` |
| 修复逻辑错误/bug | `fix` |
| 仅修改注释/文档 | `docs` |
| 代码格式调整（无逻辑变更） | `style` |
| 重构代码结构（无功能变更） | `refactor` |
| 性能相关优化 | `perf` |
| 测试文件变更 | `test` |
| 依赖/构建配置变更 | `chore` |
| CI/CD 配置变更 | `ci` |

## Issue 关闭关键词

两个平台都支持 `Closes`/`Fixes`/`Resolves`。使用 `Closes` 作为统一关键词。

| 平台 | 支持情况 |
|------|----------|
| GitHub | ✅ |
| GitLab | ✅ |
