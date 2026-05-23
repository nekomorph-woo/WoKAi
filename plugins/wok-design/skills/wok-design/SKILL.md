---
name: wok-design
description: 将需求拆分为模块并迭代设计，输出模块接口契约和设计决策。Use when 用户要求拆分模块、设计架构、模块化需求，或提到 "wok-design" / "模块拆分" / "模块设计"。
pipeline:
  upstream: [wok-define]
  downstream: [wok-design-review]
  gate: true
  output: document
  adaptive: true
---

# 模块设计

将需求拆分为模块，迭代设计接口和决策。产出模块注册表 + 各模块设计文档。

## 快速开始

1. 读取上游 `_define.md` 的 frontmatter（可选）
2. 识别模块和依赖关系
3. 用 `/wok-grill-me` 拷问模块边界
4. 用 `/wok-make-interface` 设计模板模块接口
5. 迭代验证后批量展开

## 工作流程

### 1. 读取上游（可选）

检查 `<phase-dir>/_define.md` 是否存在（`<phase-dir>` 指 `_define.md` 所在目录，无 roadmap 时为 `plans/<system-name>/`，有 roadmap 时为 `plans/<system-name>/p<n>-<phase>/`）：

- **存在**：读取 frontmatter，提取设计锚点、用户故事、验收标准作为设计输入
- **不存在**：从当前对话上下文和代码库探索中获取必要信息，正常执行

根据设计存量判断产出深度（全量 / 增量）。

**跨 phase 设计感知**：检查 `plans/<system-name>/_roadmap.md` 是否存在，读取同批次兄弟 phase 的模块设计：

1. 从 `_roadmap.md` 提取当前 phase 之前的兄弟 phase 目录列表
2. 读取兄弟 phase 的 `modules/_registry.md` 和关键模块的 `design.md`
3. 评估接口兼容性：当前 phase 的模块是否需要扩展/修改兄弟 phase 的接口
4. 如需修改：更新兄弟 phase 的 `design.md`，在当前 phase 的 `decisions.md` 中记录原因

**仅在同批次 phase（同一个 `_roadmap.md`）中跨 phase 修改设计文档。** 独立迭代（无 `_roadmap.md`）以代码库为准，不改历史文档。

### 2. 模块识别

通过代码库探索和需求分析，识别模块（详见 reference/module-principles.md）：

- 每个模块承担一个明确职责
- 追求 **deep module**：接口简单，实现复杂度隐藏在内部
- 每个模块 **自闭环**：独立可测试、可交付（垂直切片）
- 模块之间单向依赖，无循环
- 产出模块注册表 `<phase-dir>/modules/_registry.md`

### 3. 验证门：模块边界

使用 `/wok-grill-me` 拷问模块边界：

- 模块职责是否正交？
- 依赖方向是否合理？
- 是否有模块过浅（接口复杂、实现简单）？
- 设计锚点是否被覆盖？

拷问达成共识后继续。

### 4. 模板模块设计

选择一个核心模块作为模板，委托 `/wok-make-interface` 进行多方案对比：

- `/wok-make-interface` 生成 3+ 个差异显著的接口设计方案
- 用户选择最优方案
- 产出 `<phase-dir>/modules/<name>/design.md`（intent: reference）— 接口契约
- 产出 `<phase-dir>/modules/<name>/decisions.md`（intent: explanation）— 设计决策

### 5. 验证门：模板深度

展示模板模块设计，用户确认深度合适后继续：

- 接口是否清晰完整？
- 决策是否有理有据？
- 这个深度是否适合作为其余模块的标杆？

### 6. 批量展开

以模板为标杆，批量设计其余模块。使用 Agent 并行生成各模块的 design.md 和 decisions.md。

### 7. 交叉分析与公共产物提取

扫描全部模块设计文档，识别跨模块重复定义的数据模型、工具方法、共享类型：

- 提取到 `<phase-dir>/modules/_shared/` 目录
- 更新各模块 design.md 中的引用，指向共享定义而非重复副本
- 判断标准：2+ 个模块使用相同的类型/方法/常量则提取

详见 reference/cross-analysis.md。

### 8. 持久架构决策

将上游设计锚点翻译为具体的架构决策，记录在 `_registry.md` 的持久架构决策区：

- 每条设计锚点对应一条架构决策
- 包含决策内容、影响的模块、与代码库现有实现的兼容性评估
- 后续所有模块共享这些决策，无需重复讨论

### 9. 最终验证门

展示批量展开结果，用户确认后继续：

```
## ✅ 模块设计完成

**模块数**：<N> 个
**设计锚点覆盖**：<全部 / 列出未覆盖项>
**阻塞**：<阻塞项>
**下一步**：/wok-design-review
```

## 文档规范

详见 reference/output-format.md。

核心原则：**参考（接口契约）和解释（设计决策）物理分离**，不混在一个文件里。

## 约束

- **DO NOT** 在 design.md 中写设计理由 — 那属于 decisions.md
- **DO NOT** 跳过验证门直接批量生成 — 先验证模板再展开
- **DO NOT** 自行设计接口 — 委托 `/wok-make-interface` 进行多方案对比
- 依赖方向必须单向，检测到循环依赖时暂停并报告
