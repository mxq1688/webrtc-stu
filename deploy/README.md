# WebRTC 会议室 — 腾讯云 K8s 部署

> 与 ioam 其它服务相同：Harbor 推镜像 + `xiaozhi` 命名空间 + NodePort 外网访问

---

## 服务镜像

| 服务 | 镜像地址 | Dockerfile |
|------|---------|------------|
| webrtc-backend | `docker.ioam.top/xiaozhi/webrtc-backend:latest` | `deploy/docker/backend/Dockerfile` |
| webrtc-frontend | `docker.ioam.top/xiaozhi/webrtc-frontend:latest` | `deploy/docker/frontend/Dockerfile` |

前端 Nginx 反代：

| 路径 | 用途 |
|------|------|
| `/ws` | 视频会议信令 |
| `/ws/ue` | UE 场景信令（独立） |
| `/health` | 会议后端健康检查 |

---

## 访问地址

| 服务 | 容器端口 | NodePort | 外网访问 |
|------|---------|----------|---------|
| WebRTC 前端（含信令反代） | 80 | **30810** | http://43.153.40.19:30810/ |
| WebRTC 信令（仅集群内） | 8080 | — | `webrtc-backend:8080` |

- 会议首页：`http://43.153.40.19:30810/`
- UE 场景：`http://43.153.40.19:30810/ue`
- 健康检查：`http://43.153.40.19:30810/health`

> WebRTC 摄像头建议 HTTPS；可在 Ingress 或负载均衡上配置 TLS。

---

## 构建与部署

### 前置

1. 本机已安装 `docker`，并启用 `buildx`
2. `kubectl` 已指向集群（在 master 执行或 kubeconfig 可用）
3. Harbor：`docker.ioam.top`，项目 `xiaozhi`（TLS 过期时节点 containerd 已 `skip_verify`）

### 一键脚本（推荐）

```bash
export HARBOR_PASS='你的Harbor密码'   # 勿提交到 Git
chmod +x deploy-k8s.sh

./deploy-k8s.sh              # 构建推送 + apply + 滚动更新
./deploy-k8s.sh backend      # 仅后端
./deploy-k8s.sh frontend     # 仅前端
./deploy-k8s.sh apply        # 仅 kubectl apply（不构建）
```

默认平台 **`linux/amd64`**，避免 Mac arm64 镜像在节点无法运行。

### 手动 K8s

```bash
ssh ubuntu@43.153.40.19

kubectl apply -f deploy/k8s/namespace.yaml
kubectl apply -f deploy/k8s/

kubectl rollout restart deployment/webrtc-backend -n xiaozhi
kubectl rollout restart deployment/webrtc-frontend -n xiaozhi

kubectl get pods -n xiaozhi -l 'app in (webrtc-backend,webrtc-frontend)'
kubectl logs -f deployment/webrtc-frontend -n xiaozhi
```

### 创建 Harbor 拉取密钥（首次）

```bash
kubectl -n xiaozhi create secret docker-registry harbor-registry \
  --docker-server=docker.ioam.top \
  --docker-username=admin \
  --docker-password='你的密码'
```

`deploy-k8s.sh` 在设置了 `HARBOR_PASS` 时会自动创建/更新该 Secret。

---

## 配置

| 项 | 文件 |
|----|------|
| CORS 允许来源 | `deploy/k8s/configmap.yaml` → `ALLOWED_ORIGINS` |
| NodePort | `deploy/k8s/frontend-service.yaml` → `nodePort: 30810` |

---

## 架构

```
浏览器 → NodePort 30810 → webrtc-frontend (Nginx)
                              ├─ /        → React（/room 会议 + /ue 场景）
                              ├─ /ws      → 会议信令
                              ├─ /ws/ue   → UE 信令（与会议无关）
                              └─ /health
```

- 会议：`ws://43.153.40.19:30810/ws`
- UE：`ws://43.153.40.19:30810/ws/ue`

---

## 故障排查

```bash
kubectl describe pod -l app=webrtc-frontend -n xiaozhi
kubectl logs deployment/webrtc-backend -n xiaozhi
kubectl get events -n xiaozhi --sort-by=.metadata.creationTimestamp
```

| 现象 | 处理 |
|------|------|
| ImagePullBackOff | 检查 `harbor-registry` Secret、Harbor 项目 `xiaozhi` 是否有镜像 |
| exec format error | 重新用 `./deploy-k8s.sh` 构建（amd64） |
| WebSocket 失败 | 确认访问带 NodePort **30810**，且 `/health` 返回 OK |

构建完成后脚本会自动 `docker builder prune -af`。

---

## 可选 Ingress

若已安装 Ingress Controller，可额外应用 `deploy/k8s/ingress.yaml`；默认以 NodePort **30810** 为准。
