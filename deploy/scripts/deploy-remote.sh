#!/usr/bin/env bash
# 在 K8s master 上构建镜像并部署到 namespace xiaozhi
# 用法: ./deploy/scripts/deploy-remote.sh [ubuntu@43.153.40.19]
set -euo pipefail

REMOTE="${1:-ubuntu@43.153.40.19}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REMOTE_DIR="${REMOTE_DIR:-/tmp/webrtc-stu}"

echo "==> 同步代码到 $REMOTE:$REMOTE_DIR"
ssh -o StrictHostKeyChecking=accept-new "$REMOTE" "mkdir -p $REMOTE_DIR"
rsync -az --delete \
  --exclude node_modules \
  --exclude frontend/build \
  --exclude .git \
  "$ROOT/" "$REMOTE:$REMOTE_DIR/"

echo "==> 远程构建镜像并 kubectl apply"
ssh "$REMOTE" bash -s <<EOF
set -euo pipefail
cd $REMOTE_DIR
chmod +x deploy/scripts/build-images.sh deploy/scripts/k8s-apply.sh

# 导入镜像到 containerd（K8s 使用 containerd 时）
build_and_import() {
  ./deploy/scripts/build-images.sh
  for img in webrtc-stu-backend:latest webrtc-stu-frontend:latest; do
    if command -v ctr >/dev/null 2>&1; then
      docker save "\$img" | sudo ctr -n k8s.io images import -
    fi
  done
}

if command -v docker >/dev/null 2>&1; then
  build_and_import
else
  echo "ERROR: 远程未安装 docker，请先安装 docker 或在本机构建后推送镜像仓库"
  exit 1
fi

./deploy/scripts/k8s-apply.sh
kubectl -n xiaozhi get pods,svc,ingress
EOF

echo "==> 部署完成。请确认 Ingress Controller 已安装且 80 端口可访问。"
echo "    访问: http://43.153.40.19/  (或你的 Ingress 外网 IP)"
echo "    健康检查: http://43.153.40.19/health"
