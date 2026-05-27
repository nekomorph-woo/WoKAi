# 🎯 任务处理维度

> 数据源：清洗后的 JSONL 文件。重点分析 `human_input` 的粒度和 `ai_tool_call` 的工具组合。

## 维度清单

| 维度 | 信号来源 | 判定级别 | 规则示例 |
|------|---------|---------|---------|
| 任务粒度偏好 | Grep `msg_category:"human_input"` 分析单条消息涉及的任务复杂度 | 用户级 | `单个任务超过 3 个步骤时，先拆分再执行` |
| 确认频率阈值 | Grep `is_correction:true` 中关于"未确认就执行"的纠正 | 用户级 | `删除文件/修改配置前必须确认，代码修改可直接执行` |
| 风险规避倾向 | Grep `tool_name:"Bash"` 含 --dry-run/git stash/备份 的 command | 用户级 | `删除操作前创建备份或提示确认` |
| 时间节奏感知 | Grep `msg_category:"human_input"` 中的催促信号 | 用户级 | `复杂任务提供时间估算，按 3m 单位计算` |

## 分析方法

1. 任务粒度：统计 `human_input` 的 text 长度，长消息（>200字）多为大粒度任务；短消息（<50字）多为小任务
2. 确认频率：Grep `"is_correction":true` 中含"确认""先问""不要直接"的纠正次数，>3 次 → 高确认阈值
3. 风险规避：Grep `"tool_name":"Bash"` 含 `--dry-run`/`git stash`/`backup` 的 command 频率
4. 时间节奏：Grep `msg_category:"human_input"` 中的催促信号（"快点""先这样""来不及"）
