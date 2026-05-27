#!/bin/bash

# init-skill.sh - 快速创建技能骨架
# 用法: init-skill.sh <skill-name> [location] [project-dir]
#   location: global（默认）或 project

set -e

SKILL_NAME="$1"
LOCATION_TYPE="${2:-global}"
PROJECT_DIR="${3:-$(pwd)}"

if [ -z "$SKILL_NAME" ]; then
    echo "用法: init-skill.sh <skill-name> [location] [project-dir]"
    echo ""
    echo "参数:"
    echo "  skill-name   技能名称（使用 kebab-case）"
    echo "  location     存放位置：global（默认）或 project"
    echo "  project-dir  项目目录（仅 location=project 时使用，默认当前目录）"
    echo ""
    echo "示例:"
    echo "  init-skill.sh my-skill                    # 全局技能"
    echo "  init-skill.sh my-skill project            # 项目技能（当前项目）"
    echo "  init-skill.sh my-skill project /path/to   # 项目技能（指定项目）"
    exit 1
fi

# 验证技能名称格式
if ! [[ "$SKILL_NAME" =~ ^[a-z][a-z0-9-]*$ ]]; then
    echo "错误: 技能名称必须使用 kebab-case（小写字母、数字、连字符）"
    echo "示例: my-skill, api-client, json-formatter"
    exit 1
fi

# 根据位置类型确定目标目录
case "$LOCATION_TYPE" in
    project)
        TARGET_DIR="$PROJECT_DIR/.claude/skills"
        ;;
    global|*)
        TARGET_DIR="$HOME/.claude/skills"
        ;;
esac

SKILL_PATH="$TARGET_DIR/$SKILL_NAME"

# 检查目录是否已存在
if [ -d "$SKILL_PATH" ]; then
    echo "错误: 技能目录已存在: $SKILL_PATH"
    exit 1
fi

# 创建目录结构
mkdir -p "$SKILL_PATH"
mkdir -p "$SKILL_PATH/reference"
mkdir -p "$SKILL_PATH/examples"
mkdir -p "$SKILL_PATH/scripts"

# 创建 SKILL.md 模板
cat > "$SKILL_PATH/SKILL.md" << EOF
---
name: $SKILL_NAME
description: 能力简述。Use when [具体触发条件]。
---

# 技能名称

## 快速开始

提供最简可运行示例。

## 工作流程

复杂任务分步执行并检查。

## 高级功能

详见 [reference/](reference/)。
EOF

# 创建 .gitkeep 保持空目录
touch "$SKILL_PATH/reference/.gitkeep"
touch "$SKILL_PATH/examples/.gitkeep"
touch "$SKILL_PATH/scripts/.gitkeep"

echo "✓ 技能骨架已创建: $SKILL_PATH"
echo ""
echo "目录结构:"
echo "  $SKILL_PATH/"
echo "  ├── SKILL.md"
echo "  ├── reference/"
echo "  ├── examples/"
echo "  └── scripts/"
echo ""
echo "下一步: 编辑 SKILL.md 填充技能内容"
