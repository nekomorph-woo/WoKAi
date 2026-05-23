---
name: wok-define
description: 定义要构建什么（What），输出问题定义、目标、设计锚点和验收标准，严格不包含实现设计。Use when 用户要求定义需求、编写 PRD、描述功能目标，或提到 "define" / "需求定义" / "PRD" / "wok-define"。
pipeline:
  upstream: []
  downstream: [wok-design]
  gate: true
  output: document
  adaptive: true
---

# 需求定义

定义要构建什么，不涉及怎么做。产出需求定义文档。

## 快速开始

1. 询问用户要构建什么
2. 通过访谈明确问题、目标、范围
3. 生成 `_define.md`（路径见下方约定）

### 路径约定

| 场景 | 产出物路径 |
|------|-----------|
| 有 roadmap（`_roadmap.md` 存在） | `plans/<system-name>/p<n>-<phase-name>/_define.md` |
| 无 roadmap（单阶段） | `plans/<system-name>/_define.md` |

**DO NOT** 在无 roadmap 时为 skill 名创建子目录。系统目录即为阶段目录。

## 工作流程

### 1. 评估设计存量

判断当前功能的设计存量，决定产出深度：

| 存量 | 判断依据 | 产出深度 |
|------|----------|----------|
| 0%（0→1） | `plans/` 无相关文档，代码库无相关模块 | 全量产出 |
| 30-50% | 部分模块已有设计 | 增量 + 受影响模块标注 |
| 70%+ | 核心模块已就绪 | 仅增量变更 |

评估手段：读取 `plans/` 下已有文档的 frontmatter，探索代码库相关模块，询问用户。

### 2. 需求访谈

通过对话收集：

- **问题**：解决什么问题？受影响的用户是谁？当前如何处理？
- **目标**：成功的标准是什么？可量化的指标？
- **非目标**：明确不做什么（至少 3 条）
- **用户故事**：核心场景（3-7 个），格式："作为 X，我希望 Y，以便 Z"
- **设计锚点**：对下游设计的方向性约束（详见 reference/design-anchor.md）
- **验收标准**：每个用户故事对应可验证的通过条件

收集过程中使用 `/wok-grill-me` 追问：

- 这个问题真的存在吗？有没有更简单的解法？
- 目标是否可量化？有没有隐含假设？
- 非目标的边界在哪？
- 设计锚点之间是否有冲突？
- 每个用户故事的验收条件能否明确通过/失败？

访谈和拷问交替进行，直到需求清晰无歧义。

### 3. 生成文档

产出 `<phase-dir>/_define.md`（`<phase-dir>` 与 `_define.md` 同级，无 roadmap 时为 `plans/<system-name>/`）：

```markdown
---
status: draft
intent: decision
scope: global
depends: []
changed: 初始版本
---

> Brief（3-5 行 blockquote）

## 问题
## 目标
## 非目标
## 用户故事
## 设计锚点
### [DECISION] <锚点1：一句话>
### [DECISION] <锚点2：一句话>
## 验收标准
```

### 4. 验证门

展示产出摘要，用户确认后更新 `status: approved`。

```
## ✅ 需求定义完成

**产出**：<feature-name> 需求定义
**目标**：<核心目标列表>
**锚点**：<关键设计锚点>
**阻塞**：<阻塞项，无则写"无">
**下一步**：/wok-design
```

## 约束

- **DO NOT** 包含架构设计、模块拆分、接口定义、技术方案 — 那是 How
- **DO NOT** 在设计锚点中写实现细节 — 锚点收窄设计空间，不指定具体方案
- 设计锚点数量：3-8 条，每条一句话
