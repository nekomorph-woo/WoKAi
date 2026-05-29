#!/bin/bash

# deploy.sh - 部署 wok dashboard + 启动本地 HTTP server
# 用法: deploy.sh <system-name> [--restart]
#
# 多 feature 架构：server 绑定 plans/ 父目录，通过 URL 路径 /<feature>/ 访问不同 feature。
# 切换 feature 无需重启 server，只需部署 assets 到对应 feature 目录。

set -e

SYSTEM_NAME="$1"
RESTART=false
[[ "$2" == "--restart" ]] && RESTART=true

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ASSETS_DIR="$SCRIPT_DIR/../assets"
WOK_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
DASHBOARD_DIR="$HOME/.claude/wok-dashboard"
SERVER_STATE="$DASHBOARD_DIR/server.json"
SERVER_SCRIPT="$DASHBOARD_DIR/_server.py"

if [ -z "$SYSTEM_NAME" ]; then
    echo "错误: 缺少系统名称"
    echo "用法: deploy.sh <system-name> [--restart]"
    exit 1
fi

SYSTEM_DIR="$WOK_ROOT/plans/$SYSTEM_NAME"

if [ ! -d "$SYSTEM_DIR" ]; then
    echo "错误: 系统目录不存在: $SYSTEM_DIR"
    exit 1
fi

# ── 1. 覆盖部署三件套到 feature 目录 ──

SERVER_PORT=18730

mkdir -p "$DASHBOARD_DIR"
cp -f "$ASSETS_DIR/dashboard.html" "$SYSTEM_DIR/_dashboard.html"
cp -f "$ASSETS_DIR/render.js" "$SYSTEM_DIR/_render.js"
cp -f "$ASSETS_DIR/style.css" "$SYSTEM_DIR/_style.css"
cp -f "$SCRIPT_DIR/_server.py" "$SERVER_SCRIPT"

if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/{{SYSTEM_NAME}}/$SYSTEM_NAME/g" "$SYSTEM_DIR/_dashboard.html"
    sed -i '' "s/{{SYSTEM_NAME}}/$SYSTEM_NAME/g" "$SYSTEM_DIR/_render.js"
else
    sed -i "s/{{SYSTEM_NAME}}/$SYSTEM_NAME/g" "$SYSTEM_DIR/_dashboard.html"
    sed -i "s/{{SYSTEM_NAME}}/$SYSTEM_NAME/g" "$SYSTEM_DIR/_render.js"
fi

echo "✓ 三件套已部署到: $SYSTEM_DIR"

# ── 2. Server 生命周期管理 ──
# Server 绑定 plans/ 父目录，所有 feature 共享同一个 server 进程。
# 只有 server 脚本更新或 --restart 时才重启。

PLANS_DIR="$WOK_ROOT/plans"

ensure_server() {
    local force_restart="$1"

    # 检查已有 server
    if [ -f "$SERVER_STATE" ]; then
        local old_pid old_port
        old_pid=$(python3 -c "import json; d=json.load(open('$SERVER_STATE')); print(d.get('pid',''))" 2>/dev/null || echo "")
        old_port=$(python3 -c "import json; d=json.load(open('$SERVER_STATE')); print(d.get('port',''))" 2>/dev/null || echo "")

        if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
            if [ "$force_restart" != "true" ]; then
                echo "✓ Server 已在运行: http://127.0.0.1:$old_port"
                return 0
            fi
            # --restart 强制重启
            kill "$old_pid" 2>/dev/null || true
            sleep 0.5
        fi
        rm -f "$SERVER_STATE"
    fi

    # 启动 server（绑定 plans/ 父目录）
    local port=$SERVER_PORT

    nohup python3 "$SERVER_SCRIPT" --port "$port" --directory "$PLANS_DIR" > /dev/null 2>&1 &
    local pid=$!

    # 写入状态文件（仅 pid + port，不含 feature 信息）
    python3 -c "
import json
json.dump({'pid': $pid, 'port': $port}, open('$SERVER_STATE', 'w'))
"

    # 验证 server 启动
    local verify_attempts=0
    while [ $verify_attempts -lt 5 ]; do
        if curl -sf "http://127.0.0.1:$port/$SYSTEM_NAME/api/files" >/dev/null 2>&1; then
            echo "✓ Server 已启动: http://127.0.0.1:$port"
            return 0
        fi
        sleep 0.2
        verify_attempts=$((verify_attempts + 1))
    done

    # 启动失败，清理
    kill "$pid" 2>/dev/null || true
    rm -f "$SERVER_STATE"
    echo "错误: Server 启动失败（端口 $port）"
    exit 1
}

ensure_server "$RESTART"

echo ""
echo "Dashboard URL: http://127.0.0.1:$SERVER_PORT/$SYSTEM_NAME/_dashboard.html"
