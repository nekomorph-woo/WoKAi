# 🚀 工程实践维度

> 数据源：清洗后的 JSONL 文件。重点 Grep `tool_name:"Bash"` 的 command 字段。

## 维度清单

| 维度 | 信号来源 | 判定级别 | 规则示例 |
|------|---------|---------|---------|
| 构建工具 | Grep `tool_name:"Bash"` 含 mvn/gradle/npm/pip/go/cargo 的 command | 项目级 | `使用 Gradle，执行 ./gradlew build -x test 跳过测试` |
| 测试习惯 | Grep `tool_name:"Bash"` 含 test/spec/vitest/pytest/jest 的 command | 项目级 | `测试框架 Vitest + Testing Library` |
| 平台偏好 | Grep `tool_name:"Bash"` 含 gh/glab 的 command，对比跨 project 使用比例 | 用户级 | `代码托管在 GitLab，使用 glab CLI` |
| 部署策略 | Grep `tool_name:"Bash"` 含 docker/kubectl/helm 的 command | 项目级 | `部署使用 K8s + Helm，chart 路径 deploy/charts/` |
| 环境配置 | Grep `tool_name:"Edit"` 的 `file_path` 含 .env/config | 项目级 | `敏感配置使用环境变量注入，禁止硬编码` |
| CI/CD 平台 | Grep `tool_name:"Edit"` 的 `file_path` 含 .github/workflows/.gitlab-ci/Jenkinsfile | 项目级 | `CI 使用 GitHub Actions，main 分支 push 触发` |
| 故障诊断流程 | Grep `is_error:true` 的 tool_result，关联 `parent_tool` 和后续 Bash command | 项目级 | `Pod 异常按序执行：logs → describe → events` |
| 容器镜像策略 | Grep `tool_name:"Bash"` 含 docker build 的 command | 项目级 | `基础镜像 eclipse-temurin:21-jre-alpine，标签用 git sha` |

## 分析方法

1. Grep `"tool_name":"Bash"` 从 command 提取构建/测试/部署命令，按频率确定主力工具
2. 平台偏好看 gh vs glab 的使用比例，跨 project 一致 → 用户级
3. CI/CD 平台从 `tool_name:"Edit"` 的 `file_path` 中检测 `.github/workflows/`、`.gitlab-ci.yml`、`Jenkinsfile` 等路径
4. 故障诊断：Grep `"is_error":true` 找到错误记录，关联时间戳前后的 Bash command 恢复序列
