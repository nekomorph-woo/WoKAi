# 项目技能示例

以下是一个最小化的项目技能结构（`.claude/skills/` 模式）：

```
.claude/skills/ddai-commit/
└── SKILL.md
```

**SKILL.md 内容**：

```md
---
name: ddai-commit
description: 规范化 commit message 格式，支持关联 issue 自动关闭。Use when 用户要求 commit、提交代码、或规范 commit message。
---

# DDAi Commit

规范化 commit message 格式，支持关联 GitHub/GitLab issue 自动关闭。

## Commit Message 格式

\`\`\`
<type>(<scope>): <description>

Closes #<issue1>, closes #<issue2>
\`\`\`

## 工作流程

### 1. 分析变更

- 运行 `git diff --cached --stat` 查看暂存文件
- 运行 `git diff --cached` 分析具体变更内容
- 推断合适的 type 和 scope

### 2. 生成 commit message

- 使用检测到的语言编写 description
- 格式: `<type>(<scope>): <description>`

### 3. 询问关联 Issue

使用 AskUserQuestion 询问是否关联 issue。

### 4. 执行提交

- 运行 `git commit -m "<message>"`
- 输出变更摘要

## Type 类型

| Type | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修复 bug |
| `docs` | 文档变更 |
| `refactor` | 重构 |
| `chore` | 构建/工具/依赖 |
```

**关键特征**：

| 特征 | 说明 |
|------|------|
| 单文件 | 所有内容在 SKILL.md 中 |
| 无 plugin.json | 不需要独立版本号 |
| 无 commands/ | 不需要斜杠命令入口 |
| 无 marketplace 注册 | 不对外分发 |
| 项目特定 | 引用 DDAi 项目内部的 marketplace.json |
