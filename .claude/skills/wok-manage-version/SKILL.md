---
name: wok-manage-version
description: 管理 wok 插件版本号的升级与同步，确保 plugin.json 与 marketplace.json 一致。Use when 用户要求升级版本、同步版本号、审计版本一致性，或提到 "bump" / "版本" / "version" / "同步版本"。
---

# wok 版本管理

管理 wok marketplace 中插件的版本号升级与同步。

## 版本号架构

```
.claude-plugin/marketplace.json
├── metadata.version        ← Marketplace 整体版本（独立）
└── plugins[].version       ← 各插件注册版本（与 plugin.json 同步）

plugins/<name>/.claude-plugin/plugin.json
└── version                 ← 插件独立版本（与 marketplace.json 同步）
```

每个插件的版本号存在于 **2 个位置**，升级时必须同步更新：

| 位置 | 文件 |
|------|------|
| 插件清单 | `plugins/<name>/.claude-plugin/plugin.json` |
| 市场注册 | `.claude-plugin/marketplace.json` 中对应条目 |

## 工作流程

### 1. 确定操作类型

使用 AskUserQuestion 询问用户意图：

```json
{
  "question": "执行什么版本操作？",
  "header": "版本操作",
  "options": [
    {"label": "升级插件版本", "description": "升级指定插件的版本号并同步"},
    {"label": "升级 Marketplace 版本", "description": "升级 marketplace.json 整体版本"},
    {"label": "审计版本一致性", "description": "检查所有插件版本号是否同步"},
    {"label": "批量升级", "description": "同时升级多个插件的版本"}
  ],
  "multiSelect": false
}
```

### 2. 升级插件版本

1. 使用 Grep 或 Read 读取目标插件的当前版本：
   - `plugins/<name>/.claude-plugin/plugin.json` → `version` 字段
   - `.claude-plugin/marketplace.json` → `plugins[]` 中对应条目的 `version` 字段

2. 展示当前版本，询问升级幅度：

```json
{
  "question": "当前版本 X.Y.Z，升级到哪个级别？",
  "header": "升级幅度",
  "options": [
    {"label": "patch", "description": "Z+1，修复/小调整"},
    {"label": "minor", "description": "Y+1，新功能/新流程步骤"},
    {"label": "major", "description": "X+1，破坏性变更"}
  ],
  "multiSelect": false
}
```

3. 计算新版本号，**同时更新两个文件**：
   - `plugins/<name>/.claude-plugin/plugin.json` 的 `version`
   - `.claude-plugin/marketplace.json` 中该插件条目的 `version`

4. 输出变更摘要：

```
📄 <name>/.claude-plugin/plugin.json → 📝 version: X.Y.Z → X.Y.Z+1
📄 marketplace.json                   → 📝 <name> version: X.Y.Z → X.Y.Z+1
```

### 3. 升级 Marketplace 整体版本

1. 读取 `.claude-plugin/marketplace.json` 的 `metadata.version`
2. 询问升级幅度（patch / minor / major）
3. 更新 `metadata.version` 字段

### 4. 审计版本一致性

1. 遍历所有插件的 `plugin.json`，收集版本号
2. 遍历 `marketplace.json` 中 `plugins[]`，收集版本号
3. 对比每对版本号，输出报告：

```
📊 版本一致性审计

✅ write-a-skill      plugin.json: 0.2.0  marketplace.json: 0.2.0
✅ zap               plugin.json: 0.2.0  marketplace.json: 0.2.0
❌ wok-refine-rule       plugin.json: 0.3.0  marketplace.json: 0.2.0  ← 不一致

总计: 16 个插件，15 个一致，1 个不一致
```

检测到不一致时，询问是否自动修复为 `plugin.json` 中的版本。

### 5. 批量升级

1. 使用 AskUserQuestion（multiSelect: true）让用户选择多个插件
2. 统一询问升级幅度
3. 逐个执行升级并同步

## 版本号计算规则

遵循语义化版本（SemVer）：

| 升级类型 | 规则 | 示例 |
|----------|------|------|
| patch | Z+1，X.Y 不变 | 0.1.0 → 0.1.1 |
| minor | Y+1，Z 归零 | 0.1.0 → 0.2.0 |
| major | X+1，Y.Z 归零 | 1.2.3 → 2.0.0 |

## 检查清单

- [ ] `plugin.json` 和 `marketplace.json` 中的版本已同步更新
- [ ] 版本号符合 SemVer 格式
- [ ] 输出变更摘要，列出修改的文件和版本变化
- [ ] 审计时标记所有不一致的插件
