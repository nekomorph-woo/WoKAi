---
name: wok-access-hold
description: 管理 Claude Code 文件排除规则，同步维护所有工具层的 deny 配置。Use when 用户要求保护敏感文件、添加/移除 deny 规则、排除 .env/secrets 等文件、或提到 "wok-access-hold" / "文件保护" / "排除文件"。
---

# 文件访问控制

统一维护 `.claude/settings.json` 中所有层级的文件排除规则。按保护方向（读取/写入/全保护）生成对应规则，移除时同步清理。

## 保护层级

| 层级 | 配置键 | 覆盖范围 | 适用平台 |
|------|--------|----------|----------|
| 🔧 工具层 | `permissions.deny` → Read/Edit/Write | 内置文件工具 | 全平台 |
| 💻 命令层 | `permissions.deny` → Bash | Bash 常见命令 | 全平台 |
| 🔌 Hook 层 | `hooks.PreToolUse` + 脚本 | PowerShell 工具 | Windows（需启用） |
| 🛡️ 系统层 | `sandbox.filesystem.denyRead/denyWrite` | 所有进程 I/O | macOS/Linux/WSL2 |

> 语法细节见 [deny-rules 参考](reference/deny-rules.md)。

## 添加保护

1. 询问用户：需要保护的文件/目录/通配模式，以及配置级别（项目级 `.claude/settings.json` 或用户级 `~/.claude/settings.json`）
2. 根据用户措辞推断保护方向，使用 AskUserQuestion 确认：
   - 📖 仅读取保护（阻止 LLM 读敏感内容）
   - ✏️ 仅写入保护（阻止 LLM 修改/删除文件）
   - 🔒 读写全保护
3. 读取现有 settings.json
4. 根据用户模式 + 保护方向生成规则，与现有规则合并去重
5. 使用 AskUserQuestion 让用户选择启用的层级：
   - 🔧 工具层（推荐，必选）
   - 💻 命令层（补充 Bash 防护，仅简单模式有效）
   - 🔌 Hook 层（拦截 PowerShell 工具，Windows 环境推荐）
   - 🛡️ 系统层（OS 级隔离，最强防护）
6. 写入 settings.json。若选 Hook 层，同步创建脚本和配置文件（见 Hook 层规则生成）

## 移除保护

1. 读取现有 settings.json，列出当前所有 deny 规则
2. 用户选择要移除的模式
3. 从所有层级中删除包含该模式的规则
4. 若 `sandbox.filesystem` 的 denyRead 和 denyWrite 均为空，询问是否关闭 sandbox
5. 若 Hook 层的 `.claude/protected-patterns.json` 中无剩余模式，询问是否删除 hook 配置和脚本
6. 写入 settings.json，输出变更摘要

## 规则生成

输入用户模式 `<P>`（如 `.env`、`secrets/**`、`*.pem`）。

### 工具层

根据保护方向选择性生成（使用相同的 gitignore 风格模式）：

| 方向 | 规则 |
|------|------|
| 📖 仅读取 | `Read(./<P>)` |
| ✏️ 仅写入 | `Edit(./<P>)` `Write(./<P>)` |
| 🔒 全保护 | `Read(./<P>)` `Edit(./<P>)` `Write(./<P>)` |

目录模式使用 `**`（如 `./secrets/**`），单文件使用精确路径或 `*`。

### 命令层

仅对**简单文件模式**（不含 `**`）生成。根据保护方向选择性生成：

**📖 读取类命令**（仅读取保护 / 全保护）：

```
Bash(cat <P>*)    Bash(head <P>*)    Bash(tail <P>*)    Bash(less <P>*)    Bash(more <P>*)
Bash(grep *<P>*)  Bash(find *<P>*)   Bash(wc <P>*)      Bash(base64 <P>*)  Bash(xxd <P>*)
Bash(od <P>*)     Bash(diff <P>*)    Bash(sort <P>*)
```

**✏️ 写入类命令**（仅写入保护 / 全保护）：

```
Bash(cp <P>*)    Bash(mv <P>*)    Bash(rm <P>*)    Bash(sed *<P>*)    Bash(awk *<P>*)
```

### Hook 层

更新 `.claude/protected-patterns.json`，按方向写入模式：`{"read": ["<P>"]}` / `{"write": ["<P>"]}` / 两个都写。创建 `.claude/hooks/deny-access.py` 拦截脚本，在 `settings.json` 的 `hooks.PreToolUse` 中注册。

> 脚本模板见 [deny-access-hook.py](scripts/deny-access-hook.py)，配置细节见 [Hook 配置](reference/deny-rules.md#powershell-hook)。

### 系统层

写入 `sandbox.filesystem`，确保 `sandbox.enabled: true`。📖 → `denyRead`；✏️ → `denyWrite`；🔒 → 两者都写。

## 已知局限

- 命令层仅覆盖前缀匹配的常见命令，无法阻止变体路径（如 `cat ./subdir/.env`）
- Hook 层依赖 Python3，需 PowerShell 工具已启用（`CLAUDE_CODE_USE_POWERSHELL_TOOL=1`）
- sandbox 仅 macOS/Linux/WSL2 可用
- `respectGitignore` 仅影响 `@` 选择器，**不**影响 LLM 读取行为
