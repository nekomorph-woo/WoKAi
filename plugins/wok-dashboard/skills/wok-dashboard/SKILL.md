---
name: wok-dashboard
description: 部署管道文档 dashboard 到指定系统目录。Use when 用户要求部署 dashboard、打开 dashboard、或提到 "dashboard" / "wok-dashboard"。
---

# wok Dashboard

部署交互式 HTML dashboard 到系统目录，启动本地 HTTP server 提供管道文档的可视化阅读能力。

## 执行流程

### 1. 确认系统名称

从用户消息或当前工作上下文提取系统名称（`<system-name>`）。未提供时询问用户。

### 2. 部署

运行 `deploy.sh <system-name>`，脚本自动完成：

- 覆盖生成 `_dashboard.html`、`_render.js`、`_style.css` 到 `plans/<system-name>/`
- 将 `_server.py` 部署到 `~/.claude/wok-dashboard/`
- 管理 HTTP server 生命周期（详见下方规则）

### 3. Server 生命周期

| 条件 | 行为 |
|------|------|
| 无 server 运行 | 启动新 server |
| server 运行中且服务同一 feature | 复用，不重启 |
| server 运行中但服务不同 feature | 杀死旧进程，启动新 server |
| 用户要求重启 | 无条件杀死旧进程并重启（追加 `--restart`） |

Server 状态存储在 `~/.claude/wok-dashboard/server.json`。

### 4. 访问

输出 HTTP URL，用户在浏览器中打开即可查看管道文档。文档更新后刷新页面即可同步最新内容。

## 约束

- `_server.py` 部署到 `~/.claude/wok-dashboard/`，不放入项目目录
- Server 仅绑定 `127.0.0.1`，仅本机可访问
- 每个 feature 的 dashboard 只能读取自己目录下的文件（路径隔离）
