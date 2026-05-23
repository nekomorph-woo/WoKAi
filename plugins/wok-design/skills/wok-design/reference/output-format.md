# 模块设计输出格式

## 目录结构

```
plans/<system-name>/                ← 无 roadmap 时（下文以 <phase-dir> 统称）
plans/<system-name>/p<n>-<phase>/  ← 有 roadmap 时
<phase-dir>/
├── _define.md                    ← 上游产出（wok-define）
└── modules/
    ├── _registry.md              ← 模块注册表 + 持久架构决策
    ├── _shared/                  ← 公共产物（交叉分析提取）
    │   ├── models.md
    │   ├── utils.md
    │   ├── constants.md
    │   └── errors.md
    └── <module-name>/
        ├── design.md             ← 接口契约（intent: reference）
        └── decisions.md          ← 设计决策（intent: explanation）
```

## _registry.md

```markdown
---
status: draft
intent: reference
scope: global
depends: [req:<feature-name>]
changed: 初始版本
---

> **模块数**：N 个
> **依赖方向**：<概述>
> **阻塞**：<阻塞项>

## 模块概览

| 模块 | 职责 | 依赖 | 状态 |
|------|------|------|------|

## 依赖图

（ASCII 有向图，箭头表示依赖方向）

## 持久架构决策

将上游设计锚点翻译为具体架构决策：

| 设计锚点 | 架构决策 | 影响模块 | 兼容性 |
|----------|----------|----------|--------|
| "认证必须在一个请求内完成" | 采用 JWT + httpOnly Cookie | auth-core, api-gateway | 与现有 session 中间件不兼容，需迁移 |

```

## design.md（每个模块）

```markdown
---
status: draft
intent: reference
scope: affected-modules
depends: [req:<feature-name>]
changed: 初始版本
---

> **做什么**：<一句话>
> **接口数**：<N> 个
> **阻塞**：<阻塞项>

## 接口契约

<details>
<summary>FunctionName(param: Type): ReturnType</summary>

### 参数
| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|

### 返回值
| 字段 | 类型 | 说明 |
|------|------|------|

### 异常
| 场景 | 处理 |
|------|------|
</details>

## 实现约束

- 约束 1
- 约束 2
```

## decisions.md（每个模块）

```markdown
---
status: draft
intent: explanation
scope: affected-modules
depends: [req:<feature-name>]
changed: 初始版本
---

> **关键决策**：N 条
> **设计锚点覆盖**：<列出覆盖的锚点>
> **未覆盖锚点**：<列出未覆盖的，无则写"全部覆盖">

## 决策

### [DECISION] <决策标题>

**选择**：<方案>
**否决**：<被否决的方案>
**理由**：<为什么>
**影响**：<影响范围>
```

## 意图分离原则

| 文件 | 意图 | 读者目的 | 什么放这里 |
|------|------|----------|------------|
| design.md | reference | "接口怎么定义？" | 签名、参数、返回值、异常、约束 |
| decisions.md | explanation | "为什么这样设计？" | 方案选择、取舍理由、设计锚点响应 |

**DO NOT** 在 design.md 中写"为什么选择了 X 而不是 Y"。那属于 decisions.md。
**DO NOT** 在 decisions.md 中写接口签名。那属于 design.md。
