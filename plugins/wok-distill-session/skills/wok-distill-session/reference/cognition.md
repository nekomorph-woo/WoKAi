# 🧠 认知模式维度

> 数据源：清洗后的 JSONL 文件。重点分析纠正率、工具分布和错误容忍度。

## 维度清单

| 维度 | 信号来源 | 判定级别 | 规则示例 |
|------|---------|---------|---------|
| 决策参与度 | Grep `msg_category:"human_input"` 中"你决定""我来选"类表达频率 | 用户级 | `用户倾向授权决策，AI 主动选择并简述理由` |
| 纠错触发阈值 | 统计 `is_correction:true` 条数 / `msg_category:"human_input"` 总条数 | 用户级 | `纠错率 >10% → 用户容忍度高，AI 可大胆探索` |
| 领域术语熟悉度 | Grep `msg_category:"human_input"` 中专业术语使用频率 | 用户级 | `在 devops 话题中提供更多背景解释` |
| 情绪信号映射 | Grep `is_correction:true` 的高频挫败点 | 用户级 | `AI 忘记之前约定时用户挫败感强，需加强上下文锚定` |
| 工具使用模式 | Grep `msg_category:"ai_tool_call"` 统计 `tool_name` 分布，计算 Read:Edit 比值 | 用户级 | `用户偏好先查看 diff 再确认修改` |
| 错误容忍与恢复 | Grep `is_error:true` 的 tool_result，关联后续 Bash command 恢复动作 | 用户级 | `构建失败时用户愿意一起调试，AI 应提供诊断步骤` |

## 分析方法

1. 决策参与度：Grep `human_input` 中"你决定""你来选""随你" vs "我要""给我""必须"的表达比例
2. 纠错阈值 = Grep `is_correction:true` 总数 / Grep `human_input` 总数。>0.1 → 高纠错率；<0.05 → 低纠错率
3. 领域熟悉度：按技术领域统计 `human_input` text 中术语出现频率
4. 情绪信号：Grep `is_correction:true` 的 text，聚类相似纠正，高频聚类点为挫败触发区
5. 工具模式：Grep `ai_tool_call` 统计 `tool_name` 分布。Read:Edit >1 → 先理解后修改；<0.5 → 快速迭代
6. 错误容忍：Grep `is_error:true` 的 tool_result，关联时间戳前后的 Bash command 恢复序列
