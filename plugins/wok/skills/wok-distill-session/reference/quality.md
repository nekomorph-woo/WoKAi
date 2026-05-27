# 🧪 质量保障维度

> 数据源：清洗后的 JSONL 文件。重点 Grep 测试相关 Bash 命令和纠正类消息。

## 维度清单

| 维度 | 信号来源 | 判定级别 | 规则示例 |
|------|---------|---------|---------|
| 测试金字塔 | Grep `tool_name:"Bash"` 含 test 的 command，区分单元/集成/E2E 比例 | 项目级 | `测试策略：70% 单元 + 20% 集成 + 10% E2E` |
| 测试框架选择 | Grep `tool_name:"Bash"` 含 vitest/pytest/jest 的 command 前缀 | 项目级 | `测试框架 Vitest + Testing Library；禁止 Jest` |
| 边界用例敏感度 | Grep `is_correction:true` 含边界/空值/负数/并发关键词的 human_input | 用户级 | `边界检查：覆盖空值/负数/极大值/并发场景` |
| Mock/Stub 偏好 | Grep `tool_name:"Edit"` 的 `file_path` 含 mock/stub/fake | 项目级 | `使用 MSW mock 外部 API，数据库使用内存 SQLite` |
| 覆盖率期望 | Grep `tool_name:"Bash"` 含 --coverage/--threshold 的 command 参数 | 项目级 | `覆盖率门禁：语句 ≥80%，分支 ≥70%，核心模块 ≥90%` |
| 安全检查关注 | Grep `tool_name:"Bash"` 含 audit/snyk/npm audit 的 command | 用户级 | `提交前运行安全扫描` |
| 性能验证阈值 | Grep `tool_name:"Bash"` 含 lighthouse/k6/wrk 的 command | 项目级 | `性能门禁：首屏 ≤2s，API 响应 ≤200ms` |

## 分析方法

1. Grep `"tool_name":"Bash"` 含 `test`/`spec`/`vitest`/`pytest`/`jest` 的 command，统计频率和参数
2. Grep `"is_correction":true` 提取关于边界条件/特殊场景的纠正，识别用户关注的边界模式
3. 覆盖率期望从 `--coverage`、`--threshold` 等参数提取
4. Mock 偏好从 `tool_name:"Edit"` 的 `file_path` 中 mock/test 相关路径推断
