# 审查排除约束

以下约束适用于所有审查 agent 和 simplify agent。

## 排除清单

- **DO NOT** 替代 linter（代码风格、格式化、命名风格、import 排序）
- **DO NOT** 替代 type checker（类型语法错误、编译错误）
- **DO NOT** 替代 CI（构建信号、测试运行、部署检查）
- **DO NOT** 做 PR review（不评估变更合理性，只评估代码正确性）
- **DO NOT** 引入第三方依赖或工具
