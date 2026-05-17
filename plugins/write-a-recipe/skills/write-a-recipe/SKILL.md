---
name: write-a-recipe
description: 将模块设计翻译为编码执行计划，定义文件顺序、集成点和每步验证标准。Use when 用户要求制定开发计划、编写执行步骤、拆分编码任务，或提到 "devplan" / "开发计划" / "执行计划" / "write-a-recipe"。
pipeline:
  upstream: [season-the-dish]
  downstream: []
  gate: true
  output: document
  adaptive: true
---

# 写菜谱

将模块设计翻译为可执行的编码步骤，与 TDD 衔接。

## 快速开始

1. 读取 `_check.md` 确认无阻塞项
2. 读取各模块 `design.md` 提取接口
3. 生成执行计划

## 工作流程

### 1. 读取上游（可选）

- 读取 `plans/<feature-name>/_check.md` — 如有 🔴 阻塞项，提示先解决；文件不存在则跳过
- 读取 `plans/<feature-name>/modules/_registry.md` — 获取模块列表和依赖顺序；文件不存在则从代码库识别
- 读取各模块 `design.md` — 提取接口契约和实现约束；文件不存在则从代码库和对话上下文推断

### 2. 确定执行顺序

根据依赖图确定编码顺序：

- 无依赖的模块先做
- 被依赖最多的模块优先
- 标注集成点（模块间的接口调用时刻）

### 3. 生成执行计划

产出 `plans/<feature-name>/_plan.md`：

```markdown
---
status: draft
intent: action
scope: global
depends: [chk:<feature-name>]
changed: 初始版本
---

> **模块数**：N 个
> **执行步骤**：M 步
> **集成点**：K 个
> **阻塞**：<阻塞项>

## 执行顺序

### Step 1: [ ] [ACTION] <模块名> — <一句话描述>
- **文件**：创建/修改哪些文件
- **接口**：要实现的接口列表
- **验证**：如何验证这一步完成
- **集成**：这一步是否是某个集成点的前置
- **完成标记**：更新本 step 的 `[ ]` → `[x]`（cook-by-recipe 自动回填）

### Step 2: ...
```

### 4. 补充检查项

对每个步骤补充检查维度（详见 reference/step-quality.md）：

- **跨模块集成点**：这一步是否引入了对其他模块的调用？
- **测试覆盖**：这一步的验证标准是否能通过测试实现？
- **遗漏风险**：模块 design.md 中是否有未覆盖的接口或约束？

### 5. 验证门

展示执行计划，用户确认后准备进入 TDD：

```
## ✅ 执行计划完成

**步骤数**：<M> 步
**集成点**：<K> 个
**遗漏风险**：<列出有风险的步骤>
**阻塞**：<阻塞项>
**下一步**：开始 TDD 编码
```

## 约束

- **DO NOT** 将执行计划拆分为独立 issue — 计划是一个整体，TDD 按步骤执行
- 每个步骤必须有明确的验证标准
- 集成点必须显式标注 — 隐藏的集成是开发遗漏的主要来源
