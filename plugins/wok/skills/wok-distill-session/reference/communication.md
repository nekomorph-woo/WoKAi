# 💬 沟通偏好维度

> 数据源：清洗后的 JSONL 文件。重点分析 `msg_category:"human_input"` 的 text 字段。

## 维度清单

| 维度 | 信号来源 | 判定级别 | 规则示例 |
|------|---------|---------|---------|
| 语言偏好 | Grep `msg_category:"human_input"`，统计 text 中中文字符占比 | 用户级 | `对话用中文，代码注释用英文` |
| 信息密度 | Grep `msg_category:"human_input"`，统计 text 长度分布 | 用户级 | `输出控制在 5 行内，详细内容按需展开` |
| 验收标准 | Grep `is_accept:true` 的记录，分析 text 中的验收关键词上下文 | 用户级 | `任务完成标准：测试通过 + 无报错 + 变更摘要` |
| 沟通风格 | Grep `msg_category:"human_input"` 的 text，分析句式（祈使/疑问/陈述比例） | 用户级 | `用户习惯用"帮我…"开头，偏好结构化提问` |
| 上下文复用习惯 | Grep `is_correction:true` 中关于"忘记之前约定"的纠正 | 用户级 | `新会话开始时，主动加载 CLAUDE.md 中的项目规范` |

## 分析方法

1. 统计 `human_input` 的 text 中中文字符占比，chinese > 50% → 中文为主
2. 统计 `human_input` 的 text 长度分布：<50 字 → 简洁型；50-200 → 平衡型；>200 → 详细型
3. Grep `"is_accept":true` 提取验收关键词（"完成""好了"等），Read 关联上下文分析验收标准
4. 沟通风格从 `human_input` 的句式结构分析：祈使句/疑问句/陈述句比例
5. 上下文复用从 `is_correction:true` 的 text 中检测跨会话记忆相关纠正
