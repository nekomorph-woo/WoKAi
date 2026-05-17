#!/bin/bash

# init-skill.sh - 创建 wok 技能或插件骨架
# 用法: init-skill.sh <name> <type>
#   type: skill（项目技能）或 plugin（Marketplace 插件）

set -e

SKILL_NAME="$1"
SKILL_TYPE="$2"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WOK_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

if [ -z "$SKILL_NAME" ] || [ -z "$SKILL_TYPE" ]; then
    echo "用法: init-skill.sh <name> <type>"
    echo ""
    echo "参数:"
    echo "  name  技能/插件名称（使用 kebab-case）"
    echo "  type  创建类型："
    echo "        skill   → .claude/skills/<name>/SKILL.md（项目维护工具）"
    echo "        plugin  → plugins/<name>/（Marketplace 插件，完整结构）"
    echo ""
    echo "示例:"
    echo "  init-skill.sh wok-commit skill"
    echo "  init-skill.sh format-json plugin"
    exit 1
fi

# 验证名称格式
if ! [[ "$SKILL_NAME" =~ ^[a-z][a-z0-9-]*$ ]]; then
    echo "错误: 名称必须使用 kebab-case（小写字母、数字、连字符）"
    exit 1
fi

# 验证类型
if [ "$SKILL_TYPE" != "skill" ] && [ "$SKILL_TYPE" != "plugin" ]; then
    echo "错误: 类型必须是 skill 或 plugin"
    exit 1
fi

# ── 模式 A: 项目技能 ──
if [ "$SKILL_TYPE" = "skill" ]; then
    TARGET_DIR="$WOK_ROOT/.claude/skills/$SKILL_NAME"

    if [ -d "$TARGET_DIR" ]; then
        echo "错误: 技能目录已存在: $TARGET_DIR"
        exit 1
    fi

    mkdir -p "$TARGET_DIR"

    cat > "$TARGET_DIR/SKILL.md" << EOF
---
name: $SKILL_NAME
description: 能力简述。Use when [具体触发条件]。
---

# 技能名称

## 快速开始

最简可运行示例。

## 工作流程

分步执行并检查。

## 检查清单

- [ ] 验证项1
EOF

    echo "✓ 项目技能已创建: $TARGET_DIR"
    echo ""
    echo "目录结构:"
    echo "  $TARGET_DIR/"
    echo "  └── SKILL.md"
    echo ""
    echo "下一步:"
    echo "  编辑 SKILL.md 填充技能内容"

# ── 模式 B: Marketplace 插件 ──
else
    TARGET_DIR="$WOK_ROOT/plugins/$SKILL_NAME"

    if [ -d "$TARGET_DIR" ]; then
        echo "错误: 插件目录已存在: $TARGET_DIR"
        exit 1
    fi

    # 创建三层目录结构
    mkdir -p "$TARGET_DIR/.claude-plugin"
    mkdir -p "$TARGET_DIR/commands"
    mkdir -p "$TARGET_DIR/skills/$SKILL_NAME/reference"
    mkdir -p "$TARGET_DIR/skills/$SKILL_NAME/examples"
    mkdir -p "$TARGET_DIR/skills/$SKILL_NAME/scripts"

    # 创建 plugin.json
    cat > "$TARGET_DIR/.claude-plugin/plugin.json" << EOF
{
  "name": "$SKILL_NAME",
  "version": "0.1.0"
}
EOF

    # 创建 commands 入口
    cat > "$TARGET_DIR/commands/$SKILL_NAME.md" << EOF
---
name: $SKILL_NAME
description: 能力简述。Use when [具体触发条件]。
---

执行 [$SKILL_NAME 技能](../skills/$SKILL_NAME/SKILL.md) 的完整流程。

**定位技能文件**：

1. 使用 Bash 执行：
   \`\`\`bash
   ls ~/.claude/plugins/cache/wok/$SKILL_NAME/*/skills/$SKILL_NAME/SKILL.md
   \`\`\`

2. 使用 Read 工具读取输出的路径

3. 执行技能文件中的所有指令
EOF

    # 创建 SKILL.md
    cat > "$TARGET_DIR/skills/$SKILL_NAME/SKILL.md" << EOF
---
name: $SKILL_NAME
description: 能力简述。Use when [具体触发条件]。
---

# 技能名称

## 快速开始

最简可运行示例。

## 工作流程

分步执行并检查。

## 高级功能

详见 [reference/](reference/)。
EOF

    # 创建 .gitkeep 保持空目录
    touch "$TARGET_DIR/skills/$SKILL_NAME/reference/.gitkeep"
    touch "$TARGET_DIR/skills/$SKILL_NAME/examples/.gitkeep"
    touch "$TARGET_DIR/skills/$SKILL_NAME/scripts/.gitkeep"

    echo "✓ Marketplace 插件已创建: $TARGET_DIR"
    echo ""
    echo "目录结构:"
    echo "  $TARGET_DIR/"
    echo "  ├── .claude-plugin/"
    echo "  │   └── plugin.json"
    echo "  ├── commands/"
    echo "  │   └── $SKILL_NAME.md"
    echo "  └── skills/"
    echo "      └── $SKILL_NAME/"
    echo "          ├── SKILL.md"
    echo "          ├── reference/"
    echo "          ├── examples/"
    echo "          └── scripts/"
    echo ""
    echo "下一步:"
    echo "  1. 编辑 skills/$SKILL_NAME/SKILL.md 填充插件内容"
    echo "  2. 更新 commands/$SKILL_NAME.md 的 description"
    echo "  3. 在 .claude-plugin/marketplace.json 中添加插件条目"
fi
