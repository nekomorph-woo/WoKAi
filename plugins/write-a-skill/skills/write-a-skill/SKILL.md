---
name: write-a-skill
description: 创建符合规范的用户技能，包含完整结构、渐进式信息展示和配套资源。Use when 用户要求创建、编写或开发新技能，或提到 "skill" / "技能" / "plugin" / "插件"。
---

# 技能编写指南

辅助用户创建个人技能。

## 流程

1. **收集需求** - 询问用户：
   - 技能覆盖的任务/领域
   - 需要处理的具体场景
   - 是否需要可执行脚本或仅指令
   - 是否需要包含参考材料

2. **确认存放位置** - 使用 AskUserQuestion 询问：
   ```json
   {
     "question": "技能存放位置？",
     "header": "位置",
     "options": [
       {"label": "全局技能", "description": "~/.claude/skills/ - 所有项目可用"},
       {"label": "项目技能", "description": "<project>/.claude/skills/ - 仅当前项目可用"}
     ]
   }
   ```

3. **确认技能名称** - 根据收集到的需求，构想了 3 个候选技能名称，使用 AskUserQuestion 询问用户偏好：
   ```json
   {
     "question": "以下哪个技能名称最合适？或自行输入名称。",
     "header": "技能名称",
     "options": [
       {"label": "candidate-1", "description": "命名理由简述"},
       {"label": "candidate-2", "description": "命名理由简述"},
       {"label": "candidate-3", "description": "命名理由简述"}
     ],
     "multiSelect": false
   }
   ```
   - 候选名称基于需求关键词提炼，遵循 `kebab-case` 命名
   - 用户选择 "Other" 可自行输入名称

4. **创建技能骨架** - 执行：
   ```bash
   scripts/init-skill.sh <skill-name> <target-dir>
   ```

5. **起草内容** - 填充：
   - SKILL.md：精简指令
   - reference/：详细文档（内容超过 500 行时）
   - examples/：使用示例
   - scripts/：确定性操作脚本

6. **处理资源文件** - 用户提供资源文件（模板、参考文档等）时：
   - 拷贝到对应目录：参考文档 → `reference/`，示例 → `examples/`，脚本 → `scripts/`
   - 在 SKILL.md 中使用相对路径引用
   - 确保技能自包含，不依赖外部文件路径

7. **与用户确认** - 展示草稿并询问：
   - 是否覆盖目标场景
   - 是否有遗漏或模糊之处
   - 各部分详略是否恰当

## 技能存放位置

推荐目录：

| 位置 | 说明 |
|------|------|
| `~/.claude/skills/` | 用户全局技能（推荐） |
| `<project>/.claude/skills/` | 项目级技能 |

## 技能结构

```
skill-name/
├── SKILL.md           # 主指令文件（必需）
├── reference/         # 详细文档目录（按需）
│   └── *.md
├── examples/          # 使用示例目录（按需）
│   └── *.md
└── scripts/           # 工具脚本目录（按需）
    └── helper.*       # bash/py/ts
```

## 示例

### 基础技能

最小化结构：

```
my-skill/
└── SKILL.md
```

**SKILL.md 内容**：

```md
---
name: format-json
description: 格式化、验证和转换 JSON 数据。Use when 处理 JSON 文件，或用户提到 JSON 格式化、验证、转换。
---

# JSON 格式化

## 快速开始

1. 读取目标 JSON 文件
2. 验证 JSON 语法
3. 按配置格式化输出

## 工作流程

- [ ] 检查文件是否存在
- [ ] 验证 JSON 语法有效性
- [ ] 应用格式化规则
- [ ] 输出结果
```

### 完整技能

包含所有组件的结构：

```
api-client/
├── SKILL.md
├── reference/
│   ├── authentication.md
│   └── error-handling.md
├── examples/
│   └── basic-usage.md
└── scripts/
    └── validate-response.js
```

**SKILL.md 内容**：

```md
---
name: api-client
description: 调用 REST API、处理认证和错误响应。Use when 需要调用外部 API、处理 HTTP 请求，或用户提到 API、REST、HTTP、认证。
---

# API 客户端

## 快速开始

使用 `scripts/validate-response.js` 验证响应格式。

## 工作流程

1. 确定认证方式（详见 [reference/authentication.md](reference/authentication.md)）
2. 构建请求
3. 发送请求
4. 处理响应或错误（详见 [reference/error-handling.md](reference/error-handling.md)）

## 检查清单

- [ ] 确认 API 端点
- [ ] 配置认证信息
- [ ] 设置请求超时
- [ ] 处理错误响应
```

## SKILL.md 模板

```md
---
name: skill-name
description: 能力简述。Use when [具体触发条件]。
---

# 技能名称

## 快速开始

提供最简可运行示例。

## 工作流程

复杂任务分步执行并检查。

## 高级功能

详见 [reference/](reference/)。
```

## 描述规范

描述决定 Agent 技能选择。Agent 读取技能描述匹配用户请求。

**目标**：让 Agent 明确：
1. 该技能提供什么能力
2. 何时/为何触发（关键词、上下文、文件类型）

**格式要求**：

- 最多 1024 字符
- 第三人称描述
- 第一句：描述能力
- 第二句："Use when [具体触发条件]"

**正确示例**：

```
提取 PDF 文件中的文本和表格，填充表单，合并文档。Use when 处理 PDF 文件，或用户提到 PDF、表单、文档提取。
```

**错误示例**：

```
帮助处理文档。
```

错误示例不区分技能差异。

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

**Python 标准库覆盖**：

| 功能 | 标准库 | 是否需要三方库 |
|------|--------|----------------|
| JSON/CSV/XML | `json`, `csv`, `xml.etree` | ❌ |
| HTTP 请求 | `urllib.request` | ⚠️ 可用但繁琐 |
| Excel 解析 | - | ✅ 需要 `openpyxl` |
| 文件系统 | `pathlib`, `os`, `shutil` | ❌ |

如需三方库，在 SKILL.md 中明确声明依赖。

## 拆分文件条件

满足以下条件时拆分为独立文件：

- SKILL.md 超过 100 行
- 内容涉及不同领域（如财务 vs 销售模式）
- 高级功能较少使用

## 检查清单

验证项目：

- [ ] 描述包含触发条件（"Use when..."）
- [ ] SKILL.md 控制在 100 行以内
- [ ] 移除时效性信息
- [ ] 统一术语使用
- [ ] 提供具体示例
- [ ] 限制引用层级（1 层以内）
- [ ] 版本号设置为 0.1.0
