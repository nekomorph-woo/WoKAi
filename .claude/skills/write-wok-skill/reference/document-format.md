# 文档输出格式规范

管道技能生成的所有 markdown 文档遵循统一格式。

## 双端口设计

每个文档有两个消费端口：

- **AI 端口**：YAML frontmatter — 结构化元数据，SKILL 互调时快速筛选，不加载正文
- **人类端口**：Brief blockquote — 3-5 行，30 秒理解文件内容

## 格式模板

```markdown
---
status: draft | reviewed | approved
intent: decision | reference | action | explanation
scope: global | affected-modules
depends: [doc-id, ...]
changed: 变更摘要（一句话）
---

# 标题

> **做什么**：一句话说明
> **怎么做**：一句话说明
> **阻塞**：阻塞项，无则写"无"

## 正文段落（按意图分区）

## <details><summary>深度内容标题</summary>

按需下钻的内容。

</details>
```

## Frontmatter 字段

| 字段 | 必填 | 说明 |
|------|:----:|------|
| `status` | ✅ | `draft`（生成中）、`reviewed`（已审阅）、`approved`（已确认） |
| `intent` | ✅ | 文档的主要意图类型（见下方分类） |
| `scope` | ✅ | 影响范围：`global`（全局）或 `affected-modules`（仅影响指定模块） |
| `depends` | ❌ | 依赖的其他文档 ID，用于 SKILL 互调时的依赖分析 |
| `changed` | ❌ | 最近一次变更的一句话摘要，用于版本间快速对比 |

## 意图分类

| 意图 | 读者目的 | 典型内容 |
|------|----------|----------|
| `decision` | "定了什么？" | 设计锚点、方案选择、排除项 |
| `reference` | "具体定义是什么？" | 接口签名、数据结构、配置项、参数列表 |
| `action` | "下一步做什么？" | 执行步骤、验证标准、编码顺序 |
| `explanation` | "为什么这样设计？" | 设计 rationale、方案取舍、技术权衡 |

**一个文档只承载一种主要意图。** 需要混合意图时，拆分为多个文件。

## Brief 规范

- 格式：3-5 行 blockquote（`>`）
- 结构：做什么 / 怎么做 / 阻塞项
- 禁止：表格、代码块、超过 80 字的单行
- 位置：紧接在 `# 标题` 之后，正文之前

## <details> 使用规范

- 深度内容默认折叠：接口详细参数、实现约束、设计决策详解
- 浅层内容保持展开：Brief、核心结论、状态概览
- 每个 `<details>` 必须有描述性的 `<summary>`
- 禁止嵌套超过 1 层

## 文档 ID 约定

文档 ID 用于 `depends` 字段和跨文档引用：

| 文档类型 | ID 格式 |
|----------|---------|
| 需求定义 | `req:<feature-name>` |
| 模块设计 | `mod:<module-name>` |
| 验证报告 | `chk:<feature-name>` |
| 执行计划 | `plan:<feature-name>` |
