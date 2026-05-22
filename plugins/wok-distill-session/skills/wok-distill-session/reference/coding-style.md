# 🏗️ 编码风格维度

> 数据源：清洗后的 JSONL 文件。使用 Grep 搜索 `msg_category` 和工具相关字段提取信号。

## 维度清单

| 维度 | 信号来源 | 判定级别 | 规则示例 |
|------|---------|---------|---------|
| 技术栈偏好 | Grep `tool_name:"Edit"` 统计 `file_path` 后缀分布；Grep `tool_name:"Bash"` 中包管理命令 | 项目级 | `项目使用 Kotlin + Gradle，优先使用协程处理异步` |
| 命名约定 | Grep `tool_name:"Edit"` 的 `file_path` 提取文件名，分析命名模式（snake/camel/kebab） | 用户级 | `组件文件用 PascalCase，工具函数用 camelCase` |
| 目录结构 | Grep `tool_name:"Edit"` 的 `file_path` 提取路径层级，识别组织模式 | 项目级 | `按功能域分组：features/auth/、features/dashboard/` |
| 错误处理策略 | Grep `tool_name:"Edit"` 的 `old_string_head` 中 try/except/error 模式 | 项目级 | `API 调用统一包装错误：{code, message, context}` |
| 代码复用阈值 | Grep `tool_name:"Edit"` 统计同一文件路径的重复编辑频率 | 用户级 | `相同逻辑出现 3 次时提取为工具函数` |
| 依赖引入风格 | Grep `tool_name:"Edit"` 的 `old_string_head` 中 import/require 路径模式 | 用户级 | `使用 @/ 别名引用 src 目录，禁止 ../../../` |
| 状态管理决策 | Grep `tool_name:"Edit"` 的 `old_string_head` 中状态管理库名称 | 项目级 | `跨组件状态用 Zustand，局部状态用 useState` |
| API 设计偏好 | Grep `tool_name:"Bash"` 含 curl/httpie 的 command | 项目级 | `列表接口返回 {data, total, hasMore}` |
| 性能优化触发点 | Grep `tool_name:"Edit"` 中性能相关文件路径的编辑频率 | 项目级 | `列表渲染超过 50 项时使用虚拟滚动` |
| 技术债务标记 | Grep `msg_category:"human_input"` 中 TODO/FIXME/HACK 关键词 | 用户级 | `HACK 标记超过 7 天自动提升为待办` |

## 分析方法

1. Grep `"tool_name":"Edit"` 从 `tool_input.file_path` 统计后缀分布，top 3 为主要技术栈
2. Grep `"tool_name":"Edit"` 从 `file_path` 提取文件名，分析命名规则（snake_case / camelCase / kebab-case）
3. 对比 `project` 字段：技术栈、目录结构通常为项目级；命名偏好、代码复用阈值通常为用户级
4. 交叉验证：某个框架/库只在单 project 出现 → 项目级；跨 project 使用 → 用户级
