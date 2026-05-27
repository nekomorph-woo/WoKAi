---
name: wok-simplify
description: >
  代码简化优化。检测并修复嵌套过深、过度防御、重复代码、冗余逻辑、过度工程化、冗长表达、函数复杂度。
  Use when 用户要求简化代码、消除冗余、提到 "wok-simplify" / "simplify" / "代码简化"。
model: opus
---

# 代码简化优化

检测并修复臃肿代码。双接口：独立调用 + 管道内调用。

## 命令接口

```
/wok-simplify --target <目标> [--dimensions <维度>]
```

| 参数 | 格式 | 默认值 | 说明 |
|------|------|--------|------|
| `--target` | 文件路径 / 目录 / `all` | 无（必填） | 优化目标 |
| `--dimensions` | 逗号分隔的维度名 | 全部 7 个 | 仅启用指定维度 |

维度名称：`nesting` / `over-guard` / `duplication` / `redundancy` / `over-engineering` / `verbosity` / `complexity`

## 参考文档

执行前读取以下共享参考文档：

- `reference/finding-format.md` — finding 输出格式规范
- `reference/agent-constraints.md` — 排除约束

## 简化维度

### D1: 嵌套深度（nesting）

**检测**：if/for/while/try/switch 嵌套超过 3 层

**修复**：提取子函数、guard clause、可选链替代嵌套 null 检查

**约束**：DO NOT 改变公开签名；提取的函数名必须表达语义

### D2: 过度防御（over-guard）

**检测**：类型系统已覆盖的运行时检查、不可达分支处理、冗余守卫

**修复**：移除冗余检查

**约束**：保留外部输入边界检查；保留有副作用的验证逻辑

### D3: 重复代码（duplication）

**检测**：3+ 位置相同代码片段（>5 行）、可提取函数的重复表达式

**修复**：提取共享函数、参数化差异、映射表替代 switch

**约束**：DO NOT 跨模块提取；DO NOT 为消除重复引入过度抽象

### D4: 冗余逻辑（redundancy）

**检测**：死代码、冗余条件、冗余变量、冗余集合操作

**修复**：移除死代码、简化布尔表达式、内联单次使用变量

**约束**：DO NOT 移除被外部引用的导出；DO NOT 移除带 @deprecated 的维护期代码

### D5: 过度工程化（over-engineering）

**检测**：仅一处使用的泛型/策略模式、无证据的性能优化、过度配置化

**修复**：内联单处抽象、移除无证据优化、常量替代配置

**约束**：保留标注"预留扩展"的抽象；保留公共 API 接口

### D6: 冗长表达（verbosity）

**检测**：可用解构/模板字符串/可选链替代的多步操作、过长链式调用（>5 层）

**修复**：应用语言惯用语法、引入语义中间变量

**约束**：仅使用主流版本特性；变量命名必须表达语义

### D7: 函数复杂度（complexity）

**检测**：函数超 50 行、参数超 4 个、圈复杂度超 10

**修复**：按职责拆分函数、参数对象化、IO 与逻辑分离

**约束**：DO NOT 改变公开签名；保持执行顺序语义

## 执行流程

### 独立调用

1. 解析 `--target`，确定目标文件列表
2. 逐文件扫描，按 `--dimensions` 筛选维度
3. 识别简化点，评估语义保持性
4. 执行修复（遵守各维度约束）
5. 写回文件
6. 输出变更摘要：

```
📄 <file> → 📝 <变更描述>
  D1: 提取函数 `validateInput()`，嵌套 4→2 层
  D4: 移除死代码 `legacyHandler()`
```

### 管道内调用（review-engine Stage 3 → simplify）

1. 接收文件路径 + 维度列表
2. 扫描 → 修复 → 写回
3. **静默返回，不输出摘要**

触发条件：finding 的 `优化维度` 字段非空。`--no-fix` 模式下由 review-engine 控制不触发。

## 实现约束

- 直接修改代码，DO NOT 产出独立报告
- 每个 simplify 操作必须语义保持
- 语义变更风险时跳过并记录原因
- DO NOT 替代 linter 或 typechecker
- DO NOT 替代重构工具（如 TypeScript compiler 的自动 fix）
- simplify 无 `--no-fix` 参数——管道模式下是否触发由 review-engine 的 `--no-fix` 控制，独立调用时始终执行简化
