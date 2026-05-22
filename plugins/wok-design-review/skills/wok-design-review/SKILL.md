---
name: wok-design-review
description: 交叉验证模块设计的一致性和完整性，检查接口对齐、依赖方向和跨模块遗漏。Use when 用户要求交叉验证、检查设计一致性、审查模块设计，或提到 "season" / "调味" / "交叉验证" / "wok-design-review"。
pipeline:
  upstream: [wok-design]
  downstream: [wok-plan]
  gate: false
  output: document
  adaptive: true
---

# 调味检查

对模块设计做 3 项聚焦检查，不产出长篇审阅报告。发现问题直接列出，需要人工决策的标记为阻塞项。

## 快速开始

1. 读取 `modules/_registry.md` 获取模块列表
2. 执行 3 项检查
3. 产出 `plans/<system-name>/<phase-name>/_check.md`

## 工作流程

### 1. 读取上游（可选）

检查 `plans/<system-name>/<phase-name>/modules/_registry.md` 是否存在：

- **存在**：读取 frontmatter，提取模块列表和依赖图，加载各模块 `design.md` 的 frontmatter 和接口契约
- **不存在**：从代码库和当前对话上下文中识别模块和接口定义

### 2. 执行检查

3 项聚焦检查（详见 reference/check-spec.md）：

| 检查项 | 内容 | 严重度分级 |
|--------|------|:----------:|
| **接口一致性** | 跨模块调用的参数类型、返回值、异常是否对齐 | 🔴/🟡/🟢 |
| **依赖方向** | 是否存在循环依赖、是否违反分层约束 | 🔴/🟡 |
| **跨模块遗漏** | 设计锚点是否被全部覆盖、用户故事是否有遗漏模块 | 🔴/🟡/🟢 |

### 3. 生成检查结果

产出 `plans/<system-name>/<phase-name>/_check.md`：

```markdown
---
status: draft
intent: action
scope: global
depends: [mod:*]
changed: 初始版本
---

> **检查项**：3 项
> **问题数**：<N> 个（🔴 <N> / 🟡 <N> / 🟢 <N>）
> **阻塞**：<是否有阻塞项>

## 检查结果

### 接口一致性
### 依赖方向
### 跨模块遗漏

## 行动项

### [OPEN] <阻塞标题>

- [ACTION] <修复动作>
```

### 4. 处理检查结果

🟢 级问题自动修复（文档层面的机械性修正）。

🔴 阻塞项使用 `/wok-grill-me` 拷问修复方案：

- 这个问题的根因是什么？
- 修复会影响哪些模块？
- 是否需要回到上游技能重新设计？

拷问达成共识后，执行修复：

1. **反向修补**：定位受影响的设计文档段落，展示 diff，确认后修补
2. **连锁更新**：修补后检查是否影响其他文档（依赖方向、引用关系），深度上限 2 级
3. **修补顺序**：共享定义 → 模块 design.md → 模块 decisions.md → _registry.md

修补完成后，判断变更范围决定下一步：

- **轻量变更**（仅文档措辞修正、无接口变更）→ 继续处理下一个阻塞项
- **接口变更**（签名修改、新增接口、模块边界调整）→ 更新 `_check.md` 行动项状态，提示是否需要重新运行 `/wok-plan`

🟡 级标记为建议项，用户自行决定是否处理。

## 约束

- **DO NOT** 产出超过 3 份以上的报告文件 — 只有一个 `_check.md`
- **DO NOT** 审查代码实现 — 只审查设计文档
- 检查范围随设计存量自适应：增量模式只检查变更涉及的模块
