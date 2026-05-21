#!/bin/bash

echo "🚀 启动 WebRTC 视频会议室应用"
echo "================================"

if ! command -v go &> /dev/null; then
    echo "❌ Go 未安装，请先安装 Go 1.21+"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js 16+"
    exit 1
fi

ROOT="$(cd "$(dirname "$0")" && pwd)"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"

# 证书需包含当前局域网 IP，否则手机 wss://IP:8443 会失败
if command -v mkcert &>/dev/null; then
    NEED_CERT=0
    if [ -n "$LAN_IP" ] && ! openssl x509 -in "$ROOT/frontend/localhost+1.pem" -noout -text 2>/dev/null | grep -q "IP Address:${LAN_IP}"; then
        NEED_CERT=1
    fi
    if [ ! -f "$ROOT/frontend/localhost+1.pem" ]; then
        NEED_CERT=1
    fi
    if [ "$NEED_CERT" = "1" ]; then
        echo "🔐 更新开发证书（含 $LAN_IP）..."
        bash "$ROOT/scripts/gen-dev-cert.sh"
    fi
fi

echo "📡 启动后端服务器..."
cd "$ROOT/backend"
go mod tidy
GOTOOLCHAIN="${GOTOOLCHAIN:-go1.23.6}" CGO_ENABLED=0 go build -o /tmp/webrtc-backend .
if [ -n "$LAN_IP" ]; then
    export ALLOWED_ORIGINS="https://localhost:3000,http://localhost:3000,https://127.0.0.1:3000,https://${LAN_IP}:3000,http://${LAN_IP}:3000"
fi
TLS_ENABLED=true HTTP_PORT=8081 /tmp/webrtc-backend &
BACKEND_PID=$!
cd "$ROOT"

sleep 2

echo "🌐 启动前端应用..."
cd "$ROOT/frontend"

if [ -d "$HOME/.nvm/versions/node" ]; then
    NVM_NODE="$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)"
    export PATH="$HOME/.nvm/versions/node/$NVM_NODE/bin:$PATH"
fi

if [ ! -d "node_modules" ]; then
    echo "📦 安装前端依赖..."
    npm install
fi

npm start &
FRONTEND_PID=$!
cd "$ROOT"

echo ""
echo "✅ 应用启动成功！"
echo "💻 本机: https://localhost:3000"
if [ -n "$LAN_IP" ]; then
    echo "📱 手机（同一 WiFi）: https://${LAN_IP}:3000"
    echo ""
    echo "📱 手机首次使用必做两步："
    echo "   1) Safari 打开 https://${LAN_IP}:8443/health 并信任证书"
    echo "   2) 设置 → 通用 → 关于本机 → 证书信任设置 → 开启 mkcert"
    echo "   或安装根证书: https://${LAN_IP}:3000/rootCA.pem"
fi
echo "🔗 信令: https://localhost:8443  (wss)"
echo ""
echo "按 Ctrl+C 停止所有服务"

trap "echo '🛑 正在停止服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT
wait
