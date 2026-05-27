# 🔧 纠错模式维度

> 数据源：清洗后的 JSONL 文件。重点分析 `is_correction:true` 的消息和 `is_error:true` 的工具结果。

## 维度清单

| 维度 | 信号来源 | 判定级别 | 规则示例 |
|------|---------|---------|---------|
| 常见纠正点 | Grep `is_correction:true` 的 human_input，按语义聚类 | 用户级 | `禁止使用 mermaid 代码块（CLI 无法渲染）` |
| 错误恢复策略 | Grep `is_error:true` 的 tool_result，关联后续 Bash command | 项目级 | `Gradle 构建失败时先执行 clean 再重试` |
| 重复犯错模式 | Grep `is_correction:true` 中相似文本在多 project 中出现 | 用户级 | `平台判断必须在流程开始时执行，不要中途判断` |
| 工具使用纠偏 | Grep `is_correction:true` 中关于工具选择的纠正 | 用户级 | `搜索代码用 Grep 而非 Bash grep` |

## 分析方法

1. Grep `"is_correction":true` 提取 text，按语义聚类（工具选择/代码风格/流程顺序/沟通方式）
2. 统计每类纠正出现频率，≥5 次 → 强规则；3-4 次 → 中规则；1-2 次 → 不输出
3. Grep `"is_error":true` 找到错误记录，按 `parent_tool` 分类，关联时间戳后续的 Bash command 提取恢复策略
4. 跨 project 对比：某类纠正在多个 project 出现 → 用户级习惯；仅单 project 出现 → 项目级
5. 重复犯错：同类纠正 text 的语义相似度 >3 次，说明 AI 反复犯同一种错，生成 DO NOT 规则
