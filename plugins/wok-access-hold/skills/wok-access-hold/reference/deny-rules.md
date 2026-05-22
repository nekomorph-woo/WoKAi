# Deny Rules 语法参考

## Read/Edit/Write — gitignore 风格

### 路径前缀

| 前缀 | 含义 | 示例 |
|------|------|------|
| `//path` | 文件系统绝对路径 | `Read(//etc/passwd)` |
| `~/path` | 家目录相对 | `Read(~/.ssh/**)` |
| `/path` | 项目根目录相对 | `Edit(/src/**/*.ts)` |
| `path` 或 `./path` | 当前工作目录相对 | `Read(./.env)` |

### 通配符

| 通配符 | 含义 | 示例 |
|--------|------|------|
| `*` | 单层目录内任意字符 | `*.env` 匹配 `.env`、`.env.local` |
| `**` | 跨目录递归匹配 | `**/*.key` 匹配所有子目录的 `.key` |
| `?` | 单个字符 | `file?.txt` 匹配 `file1.txt` |

### 作用范围

- `Read(...)` → 阻止 Read、Grep、Glob 工具
- `Edit(...)` → 阻止 Edit 工具
- `Write(...)` → 阻止 Write 工具

Read/Edit deny 规则**不作用于 Bash 子进程**。`Read(./.env)` 不阻止 `cat .env`。

## Bash(...) — 前缀匹配

### 基本语法

| 规则 | 匹配 | 不匹配 |
|------|------|--------|
| `Bash(npm run build)` | 精确匹配 `npm run build` | `npm run build --watch` |
| `Bash(npm run test *)` | `npm run test`、`npm run test --watch` | `npm run build` |
| `Bash(ls *)` | `ls -la`、`ls /tmp` | `lsof`（词边界） |
| `Bash(ls*)` | `ls -la`、`lsof` | （无词边界） |
| `Bash(ls:*)` | 同 `Bash(ls *)` | — |

### 通配符规则

- `*` 匹配任意字符序列（含空格），可跨参数
- `*` 前有空格时强制词边界（前缀后必须是空格或字符串结束）
- `:*` 后缀等价于 ` *`（仅模式尾部识别，中间的 `:` 为字面量）
- 无 `*` 时为精确匹配

### 复合命令

`&&`、`||`、`;`、`|`、`|&`、`&`、换行 — 每个子命令**独立匹配** deny 规则。

`Bash(safe-cmd *)` 不会授权 `safe-cmd && other-cmd`。

### 进程包装器自动剥离

`timeout`、`time`、`nice`、`nohup`、`stdbuf`、`xargs` 在匹配前自动剥离。

`Bash(npm test *)` 也匹配 `timeout 30 npm test`。

### 只读命令

`ls`、`cat`、`head`、`tail`、`grep`、`find`、`wc`、`diff`、`stat`、`du`、`cd`、`git`（只读形式）在默认模式下不弹权限提示。添加 deny 规则后**仍然生效**。

### 局限性

- 仅前缀匹配，无法阻止变体路径（`cat ./subdir/.env` 不匹配 `Bash(cat .env*)`）
- 无法匹配变量展开（`cat $ENV_FILE`）、命令替换（`cat $(echo .env)`）
- 无法可靠匹配重定向（`echo secret > .env`）

## Sandbox — OS 级隔离

### 启用

```json
{
  "sandbox": {
    "enabled": true
  }
}
```

仅 macOS（Seatbelt）、Linux（bubblewrap）、WSL2 可用。

### 文件系统配置

| 键 | 说明 |
|----|------|
| `sandbox.filesystem.denyRead` | 禁止读取的路径列表 |
| `sandbox.filesystem.denyWrite` | 禁止写入的路径列表 |
| `sandbox.filesystem.allowRead` | 在 denyRead 中重新允许的路径 |
| `sandbox.filesystem.allowWrite` | 额外允许写入的路径 |

路径前缀与 Read/Edit 一致：`//`、`~/`、`/`、`./`。

### 合并行为

`denyRead` 与 `Read(...)` deny 规则合并。`denyWrite` 与 `Edit(...)` deny 规则合并。

### 示例

```json
{
  "sandbox": {
    "enabled": true,
    "filesystem": {
      "denyRead": ["./.env", "./.env.*", "./secrets/**"],
      "denyWrite": ["./.env", "./.env.*", "./secrets/**"]
    }
  }
}
```

### 其他 sandbox 配置

| 键 | 说明 |
|----|------|
| `sandbox.autoAllowBashIfSandboxed` | sandbox 启用时自动批准 Bash（默认 true） |
| `sandbox.excludedCommands` | 绕过 sandbox 的命令列表 |
| `sandbox.network.allowedDomains` | 允许的出站域名 |
| `sandbox.network.deniedDomains` | 禁止的出站域名 |

## PowerShell Hook 层

Claude Code 在 Windows 上的 Bash 工具实际使用 Git Bash，PowerShell 是独立的预览工具（需 `CLAUDE_CODE_USE_POWERSHELL_TOOL=1` 启用）。Bash deny 规则对 PowerShell 无效。通过 PreToolUse hook 拦截 PowerShell 命令。

### 为什么用 Hook 而非 deny 规则

- PowerShell deny 规则语法几乎无文档，匹配行为未知
- PowerShell 有大量别名（`cat`=`Get-Content`、`rm`=`Remove-Item`、`gc`、`type`...），deny 规则无法穷举
- Hook 用正则匹配命令字符串，一条规则覆盖所有 cmdlet 和别名

### 架构

```
PowerShell 工具调用
    ↓
PreToolUse hook (matcher: "PowerShell")
    ↓
deny-access.py 读取 .claude/protected-patterns.json
    ↓
匹配命令中的保护模式 → block / 放行
```

### 配置

**1. 保护模式文件** `.claude/protected-patterns.json`：

```json
{
  "read": [".env", ".env.*", "secrets/**"],
  "write": [".env", ".env.*"]
}
```

- `read`：读取保护模式（`Get-Content`、`Select-String`、`cat` 等均拦截）
- `write`：写入保护模式（`Set-Content`、`Remove-Item`、`Copy-Item` 等均拦截）
- 两个数组独立维护，按保护方向分别写入

**2. Hook 注册** 在 `.claude/settings.json` 中：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "PowerShell",
        "hooks": [
          {
            "type": "command",
            "command": "python3 .claude/hooks/deny-access.py"
          }
        ]
      }
    ]
  }
}
```

**3. 拦截脚本** `.claude/hooks/deny-access.py`：

从 [scripts/deny-access-hook.py](../scripts/deny-access-hook.py) 复制。仅依赖 Python3 标准库（`json`、`re`、`os`、`sys`）。

### 匹配行为

脚本将保护模式转为正则，在 PowerShell 命令字符串中搜索匹配：

| 模式 | 转换后正则 | 匹配示例 | 不匹配 |
|------|-----------|----------|--------|
| `.env` | `\.env` | `Get-Content .env` | `$env:PATH`（无 `.` 前缀） |
| `.env.*` | `\.env\.\S*` | `cat .env.local` | `myenv.txt` |
| `*.pem` | `\S*\.pem` | `type key.pem` | `pem-file` |
| `secrets/**` | `secrets/.*` | `Get-Content secrets/key` | `my-secrets/key` |

匹配不区分大小写。拒绝提示文案伪装为系统级 deny：

```
Permission denied: Access to '.env' is blocked by deny-access rules.
```

### 依赖

- Python3（macOS/Linux 自带，Windows 需单独安装）
- `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`（PowerShell 工具需已启用）
