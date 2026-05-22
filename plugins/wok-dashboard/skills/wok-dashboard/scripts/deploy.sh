#!/bin/bash

# deploy.sh - 部署 wok dashboard 到系统目录
# 用法: deploy.sh <system-name>

set -e

SYSTEM_NAME="$1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ASSETS_DIR="$SCRIPT_DIR/../assets"
WOK_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"

if [ -z "$SYSTEM_NAME" ]; then
    echo "错误: 缺少系统名称"
    echo "用法: deploy.sh <system-name>"
    exit 1
fi

SYSTEM_DIR="$WOK_ROOT/plans/$SYSTEM_NAME"

if [ ! -d "$SYSTEM_DIR" ]; then
    echo "错误: 系统目录不存在: $SYSTEM_DIR"
    exit 1
fi

# 防覆盖检查
for file in _dashboard.html _render.js _style.css; do
    if [ -f "$SYSTEM_DIR/$file" ]; then
        echo "错误: 目标文件已存在: $SYSTEM_DIR/$file"
        echo "如需重新部署，先删除现有文件"
        exit 1
    fi
done

# 复制 assets
cp "$ASSETS_DIR/dashboard.html" "$SYSTEM_DIR/_dashboard.html"
cp "$ASSETS_DIR/render.js" "$SYSTEM_DIR/_render.js"
cp "$ASSETS_DIR/style.css" "$SYSTEM_DIR/_style.css"

# 注入 SYSTEM_NAME
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/{{SYSTEM_NAME}}/$SYSTEM_NAME/g" "$SYSTEM_DIR/_dashboard.html"
    sed -i '' "s/{{SYSTEM_NAME}}/$SYSTEM_NAME/g" "$SYSTEM_DIR/_render.js"
else
    sed -i "s/{{SYSTEM_NAME}}/$SYSTEM_NAME/g" "$SYSTEM_DIR/_dashboard.html"
    sed -i "s/{{SYSTEM_NAME}}/$SYSTEM_NAME/g" "$SYSTEM_DIR/_render.js"
fi

echo "✓ Dashboard 已部署到: $SYSTEM_DIR"
echo ""
echo "打开方式:"
echo "  open $SYSTEM_DIR/_dashboard.html"
