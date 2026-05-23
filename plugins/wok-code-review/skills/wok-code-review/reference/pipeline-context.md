# 管道上下文协议

## Stage 0 上下文包结构

review-engine Stage 0 预检产出统一上下文包，分发给所有 agent：

```yaml
# 必填（所有模式）
files: <string[]>           # 过滤后的变更文件绝对路径列表
language: <string>          # 主语言标识

# 仅管道模式
design_anchors: <string>    # 从 _define.md 提取的设计锚点文本
prd_summary: <string>       # 从 _define.md 提取的目标和验收标准摘要
phase_dir: <string>          # plans/<system-name>/ 的绝对路径

# 仅独立模式
# 以上管道字段为 null/空
```

## 双态行为

| 维度 | 管道模式（`_define.md` 存在） | 独立模式（`_define.md` 不存在） |
|------|---------------------------|---------------------------|
| 审查基准 | CLAUDE.md + 设计锚点 | 仅 CLAUDE.md |
| 修复方向校验 | 对照 PRD 验证不偏离 | 无校验 |
| 一致性评估 | 必须执行 | 标注"无管道上下文"并跳过 |
| simplify 触发 | 正常触发 | 正常触发 |
| 报告写入 | `<phase_dir>/_review.md` | 当前目录或 `--output` 指定路径 |

## 检测逻辑

1. 查找 `plans/` 目录下的 `_define.md`
2. 存在 → 管道模式，提取设计锚点
3. 不存在 → 独立模式，所有管道专属字段置空
