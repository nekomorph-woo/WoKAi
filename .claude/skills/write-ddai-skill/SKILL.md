---
name: write-ddai-skill
description: 创建 DDAi 项目技能或 marketplace 插件，区分内部维护工具和对外分发插件。Use when 用户要求创建、编写或开发 DDAi 技能/插件，或提到 "DDAi plugin" / "DDAi 插件" / "DDAi skill" / "marketplace plugin" / "项目技能"。
---

# DDAi 技能/插件编写指南

辅助用户创建 DDAi 项目技能或 marketplace 插件。

## 两种模式

创建前，**先判断**使用哪种模式：

| 模式 | 目标目录 | 结构 | 适用场景 |
|------|----------|------|----------|
| **项目技能** | `.claude/skills/<name>/` | 仅 `SKILL.md`（按需扩展 reference/scripts/） | 仅本项目内部使用的维护工具 |
| **Marketplace 插件** | `plugins/<name>/` | 完整三层结构 | 面向外部用户分发的能力 |

### 判断标准

| 维度 | Marketplace 插件 | 项目技能 |
|------|------------------|----------|
| 用户 | 外部用户安装使用 | 仅本项目开发者 |
| 分发 | 通过 marketplace 分发 | 跟随项目仓库 |
| 版本 | 独立版本号（需同步 plugin.json + marketplace.json） | 无独立版本号 |
| 依赖 | 自包含，无项目特定路径 | 可引用项目内部文件 |
| 结构 | 三层目录（plugin.json + commands/ + skills/） | 最小结构（SKILL.md） |

### Good Case

```
✅ plugins/quick-commit/                → 面向用户的 commit 工具，marketplace 分发
✅ plugins/tdd/                         → TDD 工作流，任何项目可用
✅ .claude/skills/ddai-commit/          → 仅 DDAi 项目使用的 commit 规范
✅ .claude/skills/ddai-manage-version/  → 管理 DDAi 版本号，仅本项目需要
✅ .claude/skills/write-ddai-skill/     → 创建技能/插件的元工具，仅本项目需要
```

### Bad Case

```
❌ plugins/ddai-manage-version/
   问题: 管理本项目版本号，外部用户无此需求，不应作为 marketplace 插件分发
   修正: 移至 .claude/skills/ddai-manage-version/SKILL.md

❌ .claude/skills/tdd/
   问题: TDD 是通用开发实践，应作为 marketplace 插件分发
   修正: 移至 plugins/tdd/ 完整三层结构
```

## 流程

### 1. 收集需求

确认以下信息：

- 覆盖的任务/领域
- 需要处理的具体场景
- 是否需要可执行脚本或仅指令
- 是否需要包含参考材料

### 2. 判断模式

根据上述分类标准，使用 AskUserQuestion 询问：

```json
{
  "question": "创建类型？",
  "header": "类型",
  "options": [
    {"label": "项目技能", "description": ".claude/skills/ — 仅本项目内部使用，最小结构"},
    {"label": "Marketplace 插件", "description": "plugins/ — 面向用户分发，完整三层结构"}
  ]
}
```

### 3. 创建骨架

使用 `scripts/init-skill.sh <name> <type>` 创建骨架：

```bash
# 项目技能
scripts/init-skill.sh my-tool skill

# Marketplace 插件
scripts/init-skill.sh my-plugin plugin
```

骨架结构按模式不同：

**项目技能**：

```
.claude/skills/<name>/
└── SKILL.md
```

**Marketplace 插件**：

```
plugins/<name>/
├── .claude-plugin/
│   └── plugin.json
├── commands/
│   └── <name>.md
└── skills/
    └── <name>/
        ├── SKILL.md
        ├── reference/
        ├── examples/
        └── scripts/
```

### 4. 起草内容

**项目技能** — 编辑 `.claude/skills/<name>/SKILL.md`：

- 所有指令、流程、模板均在此文件
- 超过 100 行时，考虑拆分到子目录（`reference/`、`scripts/`）

**Marketplace 插件** — 编辑以下文件：

| 文件 | 用途 |
|------|------|
| `skills/<name>/SKILL.md` | 精简指令（必需） |
| `commands/<name>.md` | 斜杠命令入口，更新 description（必需） |
| `skills/<name>/reference/` | 详细文档（SKILL.md 超 100 行时） |
| `skills/<name>/examples/` | 使用示例（按需） |
| `skills/<name>/scripts/` | 确定性操作脚本（按需） |

### 5. 处理资源文件

用户提供资源文件（模板、参考文档等）时：

- 参考文档 → `reference/`，示例 → `examples/`，脚本 → `scripts/`
- 在 SKILL.md 中使用相对路径引用
- 确保技能自包含，不依赖外部文件路径

### 6. 注册到 marketplace

**仅 Marketplace 插件**执行此步骤。在 `.claude-plugin/marketplace.json` 中添加：

```json
{
  "name": "<name>",
  "source": "./plugins/<name>",
  "description": "插件描述",
  "version": "0.1.0"
}
```

项目技能**跳过**此步骤。

### 7. 与用户确认

展示草稿并验证：

- 是否覆盖目标场景
- 是否有遗漏或模糊之处
- 各部分详略是否恰当

## SKILL.md 模板

### 项目技能模板

```md
---
name: <name>
description: 能力简述。Use when [具体触发条件]。
---

# 技能名称

## 快速开始

最简可运行示例。

## 工作流程

分步执行并检查。

## 检查清单

- [ ] 验证项1
```

### Marketplace 插件模板

**commands/<name>.md**：

```md
---
name: <name>
description: 能力简述。Use when [具体触发条件]。
---

执行 [<name> 技能](../skills/<name>/SKILL.md) 的完整流程。

**定位技能文件**：

1. 使用 Bash 执行：
   ```bash
   ls ~/.claude/plugins/cache/ddai/<name>/*/skills/<name>/SKILL.md
   ```

2. 使用 Read 工具读取输出的路径

3. 执行技能文件中的所有指令
```

**skills/<name>/SKILL.md**：

```md
---
name: <name>
description: 能力简述。Use when [具体触发条件]。
---

# 技能名称

## 快速开始

最简可运行示例。

## 工作流程

分步执行并检查。

## 高级功能

详见 [reference/](reference/)。
```

**plugin.json**：

```json
{
  "name": "<name>",
  "version": "0.1.0"
}
```

## 描述规范

描述决定 Agent 技能选择。Agent 读取技能描述匹配用户请求。

**格式要求**：

- 最多 1024 字符
- 第三人称描述
- 第一句：描述能力
- 第二句："Use when [具体触发条件]"

**正确**：

```
提取 PDF 文件中的文本和表格，填充表单，合并文档。Use when 处理 PDF 文件，或用户提到 PDF、表单、文档提取。
```

**错误**：

```
帮助处理文档。
```

错误示例不区分技能差异。

## 语气措辞规范

遵循 `CLAUDE.md` 中的规范。详见 [reference/tone-guide.md](reference/tone-guide.md)。

## 添加脚本条件

满足以下条件时添加脚本：

- 操作具有确定性（验证、格式化）
- 相同代码会被重复生成
- 需要显式错误处理

脚本比生成代码更节省 token 且更可靠。

## 脚本语言选择

| 语言 | 适用场景 | 约束 |
|------|----------|------|
| **Bash** | 文件/目录操作、简单命令组合 | 仅 Unix 系统 |
| **Python** | 数据处理、API调用、中等复杂逻辑 | 仅使用标准库，不引入三方依赖 |
| **TypeScript** | 复杂业务逻辑、与项目共享类型 | 必须提供 `npx ts-node` 运行方式或预编译 JS |

**优先级**：Bash > Python > TypeScript

如需三方库，在 SKILL.md 中明确声明依赖。

## 拆分文件条件

满足以下条件时拆分为独立文件：

- SKILL.md 超过 100 行
- 内容涉及不同领域
- 高级功能较少使用

## 检查清单

**通用**：

- [ ] 已根据分类标准选择正确的模式
- [ ] 描述包含触发条件（"Use when..."）
- [ ] SKILL.md 控制在 100 行以内
- [ ] 移除时效性信息
- [ ] 统一术语使用
- [ ] 提供具体示例
- [ ] 限制引用层级（1 层以内）

**仅 Marketplace 插件**：

- [ ] `.claude-plugin/plugin.json` 存在且格式正确
- [ ] `commands/<name>.md` 存在且引用正确
- [ ] `skills/<name>/SKILL.md` 存在
- [ ] 版本号设置为 0.1.0
- [ ] 已在 marketplace.json 中注册

## 示例

- [项目技能示例](examples/basic-skill.md)
- [Marketplace 插件示例](examples/basic-plugin.md)
