# wok

为 Claude Code 设计的技能插件市场。

## 开发管道

```
wok-idea             灵感发散 + 路线图规划
       │
wok-findings         探索代码现状基线
       │
wok-define           定义做什么
       │
wok-design           拆模块 + 设计接口
       │
wok-design-review    交叉验证一致性
       │
wok-plan             翻译为编码步骤
       │
wok-implement        TDD 驱动开发
       │
wok-code-review      多 agent 并行代码审查
       │
zap                  规范化提交
```

每个技能可独立使用，不需要走完整管道。

## 插件一览

### 管道技能

| 技能 | 做什么 |
|------|--------|
| `wok-idea` | 发散功能想法，设计版本化路线图 |
| `wok-findings` | 探索现有代码的设计约束与架构模式 |
| `wok-define` | 定义 What：问题、目标、设计锚点、验收标准 |
| `wok-design` | 拆模块、设计接口、记录设计决策 |
| `wok-design-review` | 交叉验证模块设计的一致性和完整性 |
| `wok-plan` | 将模块设计翻译为编码执行计划 |
| `wok-implement` | TDD 驱动开发（RED-GREEN-REFACTOR） |
| `wok-code-review` | 多 agent 并行代码审查，自动修复 🔴🟠 问题 |
| `zap` | 规范化 commit message，关联 issue |

### 辅助技能

| 技能 | 做什么 |
|------|--------|
| `wok-grill-me` | 对计划/设计进行系统性追问和压力测试 |
| `wok-make-interface` | 生成多个差异显著的模块接口设计方案 |
| `wok-issue` | 调查问题根因，创建带 TDD 修复计划的 issue |
| `wok-refine-rule` | 管理 rules 配置：评估、改进、审计 |
| `wok-distill-session` | 分析会话日志，提取编码习惯生成 rules |
| `wok-access-hold` | 管理文件排除规则，保护敏感文件 |
| `write-a-skill` | 创建符合规范的新技能 |
| `wok-dashboard` | 部署交互式文档 dashboard，可视化阅读管道产出 |
| `wok-cr-insight` | 分析审查报告 Advisory 根因，追加修改方案 |
| `wok-apply-remarks` | 处理 pipeline 备注，修改文档并传播影响 |

## 安装

添加 marketplace：

```
/plugin marketplace add nekomorph-woo/wok
```

安装插件：

```
/plugin install <plugin-name>@wok
```

更新：

```
/plugin marketplace update wok
```

## 目录结构

```
wok/
├── plugins/                      # 16 个 marketplace 插件
├── .claude/
│   ├── rules/                    # 项目规则
│   └── skills/                   # 项目内部技能
│       ├── write-wok-skill/      # 插件编写指南
│       ├── wok-commit/           # 提交规范
│       └── wok-manage-version/   # 版本管理
├── CLAUDE.md
└── README.md
```

## 贡献

- [write-wok-skill](/.claude/skills/write-wok-skill/) — 插件编写规范
- [CLAUDE.md](/CLAUDE.md) — 语气措辞规范

## License

MIT
