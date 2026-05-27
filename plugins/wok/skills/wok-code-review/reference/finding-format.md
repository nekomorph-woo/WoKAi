# Finding 输出格式

所有 agent 的输出 finding 必须严格遵循此格式。

## 标准格式

每条 finding 占连续 3 行，finding 之间空一行：

```
[<severity>] <file>:<line> — <title>
  原因: <why>
  修复方案: <how>
```

## 字段规范

| 字段 | 类型 | 约束 |
|------|------|------|
| `severity` | `"🔴"` / `"🟠"` / `"🟡"` | 严格使用 emoji，不使用文字 |
| `file` | 相对路径 | 相对于项目根目录 |
| `line` | 正整数 | 文件级问题使用 `file` |
| `title` | 字符串 ≤60 | 简洁描述，不含换行 |
| `原因` | 字符串 | 说明为什么是问题 |
| `修复方案` | 字符串 | 必须具体可执行，给出代码片段或明确步骤 |

## 扩展字段

在 `修复方案` 行之后追加（可选）：

| 字段 | 适用 agent | 格式 |
|------|-----------|------|
| `优化维度` | code-reviewer, silent-failure-hunter, type-design-analyzer, pr-test-analyzer | `  优化维度: <simplify 触发标记>` |
| `来源` | 所有 agent | `  来源: <agent 名称>` |

## 空结果哨兵值

无 finding 时统一输出：

```
[OK] 无问题
```
