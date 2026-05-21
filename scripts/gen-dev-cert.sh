#!/bin/bash
# 为当前局域网 IP 生成本地 HTTPS 证书（手机访问必需）
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAN_IP="${LAN_IP:-$(ipconfig getifaddr en0 2>/dev/null || true)}"

if ! command -v mkcert &>/dev/null; then
  echo "❌ 请先安装 mkcert: brew install mkcert"
  exit 1
fi

NAMES="localhost 127.0.0.1 ::1"
if [ -n "$LAN_IP" ]; then
  NAMES="$NAMES $LAN_IP"
  echo "📡 局域网 IP: $LAN_IP"
else
  echo "⚠️  未检测到 en0 IP，证书仅含 localhost"
fi

mkcert -cert-file "$ROOT/frontend/localhost+1.pem" -key-file "$ROOT/frontend/localhost+1-key.pem" $NAMES
cp "$ROOT/frontend/localhost+1.pem" "$ROOT/backend/localhost+1.pem"
cp "$ROOT/frontend/localhost+1-key.pem" "$ROOT/backend/localhost+1-key.pem"
cp "$(mkcert -CAROOT)/rootCA.pem" "$ROOT/rootCA.pem"
cp "$ROOT/rootCA.pem" "$ROOT/frontend/public/rootCA.pem"
echo "✅ 证书已更新（frontend + backend + public/rootCA.pem）"
echo "📱 手机需安装并信任: https://${LAN_IP:-本机IP}:3000/rootCA.pem"
