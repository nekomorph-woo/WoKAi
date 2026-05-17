# wok

为 Claude Code 设计的技能插件市场。把软件开发当作烹饪——从觅食到出餐，每一步都有对应的工具。

## 烹饪管道

```
forage-the-market   觅食：发散灵感 + 规划路线图
       │
pick-the-finding    挑拣：探索代码现状
       │
define-a-delicacy   定菜：定义做什么
       │
prepare-the-ingredient   备料：拆模块 + 设计接口
       │
season-the-dish      调味：交叉验证一致性
       │
write-a-recipe       写谱：翻译为编码步骤
       │
cook-by-recipe       烹饪：TDD 驱动开发
       │
ooops-up             出餐：规范化提交
```

每个技能可独立使用，不需要走完整管道。

## 插件一览

### 管道技能

| 技能 | 做什么 |
|------|--------|
| `forage-the-market` | 发散功能想法，设计版本化路线图 |
| `pick-the-finding` | 探索现有代码的设计约束与架构模式 |
| `define-a-delicacy` | 定义 What：问题、目标、设计锚点、验收标准 |
| `prepare-the-ingredient` | 拆模块、设计接口、记录设计决策 |
| `season-the-dish` | 交叉验证模块设计的一致性和完整性 |
| `write-a-recipe` | 将模块设计翻译为编码执行计划 |
| `cook-by-recipe` | TDD 驱动开发（RED-GREEN-REFACTOR） |
| `ooops-up` | 规范化 commit message，关联 issue |

### 辅助技能

| 技能 | 做什么 |
|------|--------|
| `grill-me` | 对计划/设计进行系统性追问和压力测试 |
| `plate-the-dish` | 生成多个差异显著的模块接口设计方案 |
| `diagnose-the-symptom` | 调查问题根因，创建带 TDD 修复计划的 issue |
| `refine-the-technique` | 管理 rules 配置：评估、改进、审计 |
| `distill-the-essence` | 分析会话日志，提取编码习惯生成 rules |
| `seal-the-pantry` | 管理文件排除规则，保护敏感文件 |
| `write-a-skill` | 创建符合规范的新技能 |

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
├── plugins/                      # 15 个 marketplace 插件
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
