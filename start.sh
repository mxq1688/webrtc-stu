#!/bin/bash

echo "🚀 启动 WebRTC 视频会议室应用"
echo "================================"

# 检查Go是否安装
if ! command -v go &> /dev/null; then
    echo "❌ Go 未安装，请先安装 Go 1.21+"
    exit 1
fi

# 检查Node.js是否安装
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js 16+"
    exit 1
fi

# 启动后端服务器
echo "📡 启动后端服务器..."
cd backend
go mod tidy
go run main.go &
BACKEND_PID=$!
cd ..

# 等待后端启动
sleep 3

# 启动前端应用
echo "🌐 启动前端应用..."
cd frontend

# 检查是否已安装依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装前端依赖..."
    npm install
fi

npm start &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ 应用启动成功！"
echo "📱 前端地址: http://localhost:3000"
echo "🔗 后端地址: http://localhost:8080"
echo ""
echo "按 Ctrl+C 停止所有服务"

# 捕获 Ctrl+C 信号
trap "echo '🛑 正在停止服务...'; kill $BACKEND_PID $FRONTEND_PID; exit" INT

# 等待进程结束
wait 