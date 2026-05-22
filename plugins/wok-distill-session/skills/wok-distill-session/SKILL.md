---
name: wok-distill-session
description: 分析近7日跨项目会话日志，提取编码习惯、工程实践和沟通偏好，生成用户级和项目级 rules 文件。Use when 用户要求生成规则、分析习惯、提取洞见、或提到 "insights" / "洞见" / "规则生成" / "wok-distill-session" / "萃取"。
pipeline:
  upstream: []
  downstream: [wok-refine-rule]
  gate: false
  output: document
  adaptive: false
---

# 会话洞见 → 规则生成

扫描所有项目近 7 日 Claude Code 会话日志，提取行为模式，生成用户级和项目级规则文件。

## 步骤 1：清洗数据

```bash
python3 scripts/clean-sessions.py --days 7
```

输出 JSONL 文件（路径见 stderr），每行一条结构化记录。核心字段：

| 字段 | 说明 |
|------|------|
| `msg_category` | `human_input` / `ai_tool_call` / `ai_text` / `tool_result` |
| `project` | 项目名称 |
| `is_correction` | 人类输入是否为纠正类消息 |
| `is_accept` | 人类输入是否为验收类消息 |
| `tool_name` | 工具名称（ai_tool_call） |
| `tool_input` | 工具输入摘要（file_path/command/old_string_head 等） |

记住输出文件路径，后续步骤需要。

## 步骤 2：7 维度并行分析

使用 Agent 工具并行启动 7 个子任务，每个子任务负责一个维度：

| 维度 | reference 文件 | Grep 搜索重点 |
|------|--------------|--------------|
| coding-style | reference/coding-style.md | `tool_name:"Edit"` 的 file_path、old_string_head；`tool_name:"Glob"` 的 pattern |
| engineering | reference/engineering.md | `tool_name:"Bash"` 的 command（构建/部署/CI 命令） |
| quality | reference/quality.md | `tool_name:"Bash"` 含 test 的 command；`is_correction:true` 的 human_input |
| communication | reference/communication.md | 所有 `human_input` 的 text；`is_accept:true` 的记录 |
| task-handling | reference/task-handling.md | `human_input` 的长度和内容；`is_correction:true` 中确认类纠正 |
| cognition | reference/cognition.md | `is_correction:true` 与 `human_input` 总量比值；`ai_tool_call` 工具分布 |
| correction | reference/correction.md | `is_correction:true` 的 human_input 上下文；`is_error:true` 的 tool_result |

每个子任务的指令模板：

```
分析清洗后的会话 JSONL 文件（{jsonl_path}）中的 {维度} 维度。

1. 读取 reference/{ref_file}，理解信号来源和分析方法
2. 用 Grep 工具在 JSONL 中搜索相关模式（参考上表），用 Read 查看具体记录
3. 输出结构化报告：

## {维度} 分析报告
### 发现的模式
| 规则 | 级别 | 置信度 | 证据摘要 |
|------|------|--------|---------|

### 关键数据点
- [定量数据]

级别判定：某模式跨 3+ 个 project 出现 → 用户级；仅 1-2 个 → 项目级。
置信度：5+ 次独立证据 → 强；3-4 次 → 中；1-2 次 → 弱。弱规则不输出。
```

## 步骤 3：综合生成规则

收集 7 份报告，合并去重后按以下分组生成 rules 文件：

| 输出文件 | 合并维度 | 输出目录 |
|---------|---------|---------|
| `coding-style.md` | coding-style | 用户级 + 项目级（按级别拆分） |
| `engineering.md` | engineering | 项目级 |
| `quality.md` | quality | 项目级 |
| `communication.md` | communication + task-handling | 用户级 |
| `correction.md` | correction + cognition | 用户级 |

### 规则文件格式

项目级规则添加 `paths:` frontmatter 限定作用范围（根据文件后缀自动推断 paths 值）：

```markdown
---
paths:
  - "src/**/*.py"
  - "plugins/**"
---

# 工程实践

## 规则

- 使用 Gradle 构建，执行 ./gradlew build -x test 跳过测试
- 测试框架 Vitest + Testing Library
```

用户级规则不加 `paths:`：

```markdown
# 沟通偏好

## 规则

- 对话使用中文，代码注释使用英文
- 使用 ASCII 线框图代替 mermaid/plantuml（CLI 无法渲染）

## 例外

- 技术术语保留英文原文
```

**格式要求**：
- 移除 blockquote 元数据（不输出"来源/置信度/样本数"等标注）
- 规则使用命令式，动词开头
- 取消"建议规则"分区（弱规则不输出）
- 如果目标路径已有非 wok-distill-session 生成的 rules 文件，跳过并在步骤 4 提醒

## 步骤 4：评估与改进

使用 wok-refine-rule 的五维度评估模型对生成的规则草案进行质量把关：

1. **Language 语言**：规则是否使用祈使句、正向表述，无模糊词
2. **Precision 精准度**：规则是否具体可验证，含边界条件
3. **Length 长度**：每个文件是否 < 200 行，token 经济
4. **Maintenance 维护性**：新规则是否与目标目录下已有 rules 文件冲突或重叠

执行方式：
- 读取目标 rules 目录下已有的 rules 文件
- 对每条新规则按五维度检查
- 对已有文件执行冲突/重叠审计
- 标记需要改进的规则，应用改进策略（正向化/去模糊化/去重/精简化）

## 步骤 5：确认与写入

使用 AskUserQuestion 展示改进后的规则草案，确认后写入对应 rules 目录。提醒用户删除步骤 1 生成的临时 JSONL 文件。

## 限制

- **隐私**：敏感信息在清洗阶段已被替换为 `[REDACTED]`
- **范围**：扫描所有项目会话，按级别分流输出
- **时长**：清洗脚本约 3-5 秒；7 维度并行分析约 1-2 分钟
