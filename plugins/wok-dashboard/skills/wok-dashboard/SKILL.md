---
name: wok-dashboard
description: 部署管道文档 dashboard 到指定系统目录。Use when 用户要求部署 dashboard、打开 dashboard、或提到 "dashboard" / "wok-dashboard"。
---

# wok Dashboard

部署交互式 HTML dashboard 到系统目录，提供管道文档的可视化阅读能力。

## 执行流程

### 1. 确认系统名称

从用户消息或当前工作上下文提取系统名称（`<system-name>`）。未提供时询问用户。

### 2. 验证目录

运行 `deploy.sh <system-name>`，脚本自动校验：

- `plans/<system-name>/` 目录存在
- 目标文件不存在（防覆盖）

### 3. 部署

执行 `deploy.sh`，输出部署路径。

### 4. 提示打开

输出文件路径，建议用户用浏览器打开 `plans/<system-name>/_dashboard.html`。
