# WebRTC 视频会议室

基于 WebRTC 技术的实时视频会议应用，支持多人音视频通话。

## 技术栈

- **后端**: Golang + Gorilla WebSocket
- **前端**: React + WebRTC API
- **通信**: WebSocket (信令服务器)

## 功能特性

- ✅ 多人实时视频通话
- ✅ 音频/视频开关控制
- ✅ 用户加入/离开通知
- ✅ 房间管理（创建/加入）
- ✅ 用户列表显示
- ✅ 响应式界面设计

## 项目结构

```
webrtc-stu/
├── backend/          # Golang 后端服务
│   ├── main.go      # 主服务文件
│   └── go.mod       # Go 依赖管理
├── frontend/         # React 前端应用
│   ├── public/      # 静态资源
│   ├── src/         # 源代码
│   │   ├── components/  # React 组件
│   │   ├── App.js      # 主应用组件
│   │   ├── index.js    # 入口文件
│   │   └── index.css   # 样式文件
│   └── package.json    # Node.js 依赖管理
└── README.md         # 项目说明
```

## 快速开始

### 前置要求

- Go 1.21+
- Node.js 16+
- 现代浏览器（支持 WebRTC）

### 运行后端服务

```bash
cd backend
go mod tidy
go run main.go
```

后端服务将在 `http://localhost:8080` 启动。

### 运行前端应用

```bash
cd frontend
npm install
npm start
```

前端应用将在 `http://localhost:3000` 启动。

## 使用说明

1. **访问应用**: 打开浏览器访问 `http://localhost:3000`
2. **输入用户名**: 在主页输入您的用户名
3. **创建或加入房间**: 
   - 点击"创建新房间"自动生成房间ID
   - 或输入已有房间ID点击"加入房间"
4. **授权权限**: 首次使用需要授权摄像头和麦克风权限
5. **开始会议**: 分享房间ID给其他人，即可开始多人视频会议

## 核心技术原理

### WebRTC 信令流程

1. **用户加入**: 通过 WebSocket 连接信令服务器
2. **媒体协商**: 交换 SDP Offer/Answer
3. **ICE 收集**: 交换网络连接候选者
4. **P2P 连接**: 建立端到端的媒体流传输

### 架构设计

- **信令服务器**: Golang WebSocket 服务，负责房间管理和消息转发
- **WebRTC 连接**: 浏览器间直接的 P2P 音视频传输
- **React 前端**: 现代化的用户界面和 WebRTC API 封装

## API 接口

### WebSocket 消息格式

```json
{
  "type": "offer|answer|ice-candidate|user-joined|user-left|user-list",
  "userId": "用户ID",
  "roomId": "房间ID", 
  "username": "用户名",
  "data": "消息数据"
}
```

### HTTP 端点

- `GET /health` - 健康检查
- `WebSocket /ws` - WebSocket 连接端点

## 开发说明

### 后端开发

- 使用 Gorilla Mux 路由器
- WebSocket 升级器处理连接
- 房间和用户状态管理
- 消息广播机制

### 前端开发

- React Hooks 状态管理
- React Router 路由控制
- WebRTC API 封装
- 响应式 CSS 设计

## 部署说明

### 生产环境配置

1. **后端**: 编译为二进制文件部署
2. **前端**: 构建静态文件部署到 CDN
3. **HTTPS**: 生产环境必须使用 HTTPS（WebRTC 要求）
4. **STUN/TURN**: 配置 STUN/TURN 服务器处理 NAT 穿透

### Docker 部署（可选）

```bash
# 构建镜像
docker build -t webrtc-meeting .

# 运行容器
docker run -p 8080:8080 -p 3000:3000 webrtc-meeting
```

## 故障排除

### 常见问题

1. **摄像头/麦克风无法访问**
   - 检查浏览器权限设置
   - 确保使用 HTTPS（生产环境）

2. **无法建立连接**
   - 检查防火墙设置
   - 确认 STUN 服务器可访问

3. **音视频质量问题**
   - 检查网络带宽
   - 调整视频分辨率设置

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！ 