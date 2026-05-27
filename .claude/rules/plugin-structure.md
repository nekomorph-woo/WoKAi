# Plugin 目录结构规范

## 标准目录树

```
<plugin-name>/
├── .claude-plugin/
│   └── plugin.json              # 必须：插件 manifest
│
├── skills/                      # 必须：Agent Skills
│   └── <skill-name>/
│       ├── SKILL.md             # 每个 skill 必须有
│       ├── scripts/             # 可选：skill 专用脚本
│       └── reference/           # 可选：skill 参考文档
│
├── agents/                      # 可选：自定义 subagent 定义
│   └── <agent-name>.md
│
├── scripts/                     # 可选：插件级通用脚本
│   └── <script-name>
│
├── hooks/                       # 可选：Hook 配置
│   ├── hooks.json
│   └── scripts/
│       └── <hook-script>
│
├── bin/                         # 可选：可执行文件，自动加入 PATH
│   └── <tool-name>
│
├── .mcp.json                    # 可选：MCP server 定义
├── settings.json                # 可选：插件启用时默认设置
├── README.md                    # 推荐：说明文档
└── LICENSE                      # 推荐：许可证
```

## 关键规则

| 规则 | 说明 |
|------|------|
| `skills/` 是主机制 | 新插件通过 skills/ 注册能力，Agent 直接识别 SKILL.md |
| `commands/` 是旧式 | 旧式 slash commands，**新插件不使用**。commands/ 仅做转发代理，冗余 |
| `agents/` 放插件根目录 | 自定义 subagent 定义放 `<plugin>/agents/`，不放 skill 内部 |
| 一个 plugin 可含多个 skill | `skills/` 下可有多个 `<skill-name>/` 子目录 |
| `scripts/` 两级 | 插件根 `scripts/` = 通用脚本；skill 内 `scripts/` = skill 专用脚本 |
| `plugin.json` 必须字段 | `name`、`version`；推荐 `description` |

## plugin.json 格式

```json
{
  "name": "<plugin-name>",
  "description": "插件描述",
  "version": "0.1.0"
}
```

## WoKAi 项目特有区分：write-wok-skill vs write-a-skill

| | `write-wok-skill` | `write-a-skill` |
|---|---|---|
| **位置** | `.claude/skills/write-wok-skill/` | `plugins/wok-kit/skills/write-a-skill/` |
| **性质** | WoKAi **项目内部**技能 | 对外分发的**通用**插件 skill |
| **用途** | 创建 wok 项目特有的技能和 marketplace 插件 | 帮助**任何** Claude Code 用户创建自己的 skill/plugin |
| **内容差异** | 包含 wok 管道技能规范、marketplace 注册流程、wok 特有约定 | 通用技能编写指南，不包含 wok 项目特有概念 |

**DO NOT** 将两者内容互相覆盖。它们是独立的、面向不同受众的技能。

## 多 skill 插件示例

```
my-pipeline/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   ├── pipeline-define/
│   │   ├── SKILL.md
│   │   └── reference/
│   ├── pipeline-design/
│   │   ├── SKILL.md
│   │   └── reference/
│   └── pipeline-plan/
│       └── SKILL.md
├── agents/
│   ├── code-reviewer.md
│   └── architect.md
├── scripts/
│   └── validate.py
└── README.md
```
