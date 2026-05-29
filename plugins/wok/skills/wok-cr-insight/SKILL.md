---
name: wok-cr-insight
description: >
  分析审查报告中的问题，支持按严重度类型或指定 finding 进行根因追溯、
  修改方案和一致性评估。纯分析工具，不执行代码修改。
  Use when 用户要求分析审查问题、深入分析特定问题，或提到
  "wok-cr-insight" / "洞察" / "根因分析"。
pipeline:
  upstream: [wok-code-review]
  downstream: []
  gate: false
  output: _review.md（追加）
  adaptive: false
---

# 问题深度分析

读取 `_review.md` 中的问题，按严重度类型或指定 finding 进行结构化分析，追加根因追溯、修改方案和一致性评估。

## 命令接口

```
/wok-cr-insight [--types <类型>] [--finding <定位符>]
```

| 参数 | 格式 | 默认值 | 说明 |
|------|------|--------|------|
| `--types` | `red,orange,yellow` / `all` | `yellow` | 按严重度批量分析 |
| `--finding` | `file:line` | 无 | 分析指定 finding（优先于 --types） |

**严重度映射**：

| `--types` 值 | 匹配的 finding |
|--------------|---------------|
| `yellow` | 🟡 |
| `orange` | 🟠 |
| `red` | 🔴 |
| `red,orange` | 🔴 + 🟠 |
| `all` | 🔴 + 🟠 + 🟡 |

## 执行流程

### Step 1: 定位输入

1. 搜索 `plans/` 目录下的 `_review.md`（与 code-review Stage 0 检测逻辑一致）
2. 验证文件存在
3. **检测管道上下文**：搜索 `plans/` 目录下的 `_define.md`
   - 存在 → 管道模式：一致性评估对照设计锚点
   - 不存在 → 独立模式（cr- 管道）：一致性评估标注"无管道上下文"
4. 解析 `--finding` 或 `--types` 参数

### Step 2: 解析目标 finding

1. 解析 `_review.md` 中所有 **Open** 区段下的 finding
2. **按参数筛选**：
   - `--finding file:line` → 定位到该 file:line 的 finding（无视严重度）
   - `--types <值>` → 按严重度筛选匹配的 finding
   - 无参数 → `--types yellow`（默认，向后兼容）
3. 跳过已有 `🔍 原因分析` 区块的 finding（**幂等**）
4. 无目标 finding → 输出"无匹配问题需要分析"并退出

### Step 3: 逐个分析

对每个未分析的 finding（不区分严重度，分析流程相同）：

1. **读取源代码**：读取 finding 涉及的源代码上下文（Read 工具）
2. **根因追溯**：分类为以下之一
   - 设计缺陷：需求阶段遗漏或设计不充分
   - 编码疏忽：实现过程中的疏忽或简化
   - 架构约束：现有架构导致的最优妥协
   - 上下文缺失：缺少领域知识或业务背景
3. **修改方案**：给出可直接执行的代码，DO NOT 给出伪代码
4. **一致性评估**（仅管道模式）：对照 `_define.md` 设计锚点评估

### Step 4: 追加写入

在每个 finding 下方追加 3 个引用块：

```markdown
> **🔍 原因分析**
> <根因分类>: <详细说明>

> **🔧 修改方案**
> <具体修改步骤，含完整代码>

> **📐 一致性评估**
> <与 PRD/设计目标的关系评估>
```

无管道上下文时，一致性评估替换为：

```markdown
> **📐 一致性评估**
> ⚠️ 无管道上下文，跳过一致性评估
```

### Step 5: 更新 round 状态（仅 cr 管道）

当满足以下全部条件时，更新当前 round header：

- 独立模式（无 `_define.md`）— 即 cr- 管道
- `--types` 包含 red 或 orange（非仅 yellow）

更新规则：

- 原来：`## Round N — In Progress`（或任何非 Converged/Analyzed 状态）
- 更新为：`## Round N — Analyzed`

**DO NOT** 在管道模式下更新 round 状态（由 code-review Stage 3/4 控制）。

写回 `_review.md`。

## 实现约束

- **幂等性**：重复调用不重复追加，通过检测 `🔍 原因分析` 区块判断
- **只读源码**：仅读取源代码，DO NOT 修改源代码文件
- **只写报告**：仅修改 `_review.md`
- **管道模式优先**：有 PRD 上下文时必须执行一致性评估
- **独立模式降级**：无管道上下文时标注跳过
- **分析触及根因**：DO NOT 仅重述问题现象
- **代码示例完整**：DO NOT 给出伪代码
- **纯分析工具**：DO NOT 执行任何代码修改
