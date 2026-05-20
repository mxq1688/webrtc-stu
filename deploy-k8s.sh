#!/usr/bin/env bash
# WebRTC 会议室 — 构建镜像推送 Harbor 并部署到 K8s (namespace: xiaozhi)
#
# 用法:
#   export HARBOR_PASS='你的密码'
#   ./deploy-k8s.sh              # 构建并部署 backend + frontend
#   ./deploy-k8s.sh backend      # 仅后端
#   ./deploy-k8s.sh frontend     # 仅前端
#   ./deploy-k8s.sh build        # 仅构建推送 Harbor（不 kubectl）
#   KUBECONFIG=~/.kube/tencent.yaml ./deploy-k8s.sh apply
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

REGISTRY="${REGISTRY:-docker.ioam.top}"
PROJECT="${PROJECT:-xiaozhi}"
PLATFORM="${PLATFORM:-linux/amd64}"
HARBOR_USER="${HARBOR_USER:-admin}"
HARBOR_PASS="${HARBOR_PASS:-}"

BACKEND_IMAGE="${REGISTRY}/${PROJECT}/webrtc-backend:latest"
FRONTEND_IMAGE="${REGISTRY}/${PROJECT}/webrtc-frontend:latest"

log() { echo "==> $*"; }

harbor_login() {
  if [[ -z "$HARBOR_PASS" ]]; then
    echo "ERROR: 请设置环境变量 HARBOR_PASS（Harbor admin 密码）"
    exit 1
  fi
  log "登录 Harbor $REGISTRY"
  echo "$HARBOR_PASS" | docker login "$REGISTRY" -u "$HARBOR_USER" --password-stdin
}

ensure_buildx() {
  if ! docker buildx inspect multiarch-builder &>/dev/null; then
    docker buildx create --name multiarch-builder --use
  else
    docker buildx use multiarch-builder
  fi
}

build_backend() {
  log "构建并推送 $BACKEND_IMAGE ($PLATFORM)"
  docker buildx build --platform "$PLATFORM" \
    -f deploy/docker/backend/Dockerfile \
    -t "$BACKEND_IMAGE" \
    --push .
}

build_frontend() {
  log "构建并推送 $FRONTEND_IMAGE ($PLATFORM)"
  docker buildx build --platform "$PLATFORM" \
    -f deploy/docker/frontend/Dockerfile \
    --build-arg REACT_APP_WS_URL= \
    -t "$FRONTEND_IMAGE" \
    --push .
}

ensure_harbor_secret() {
  if [[ -z "$HARBOR_PASS" ]]; then
    return 0
  fi
  log "确保 namespace xiaozhi 存在 harbor-registry Secret"
  kubectl apply -f deploy/k8s/namespace.yaml
  kubectl -n xiaozhi create secret docker-registry harbor-registry \
    --docker-server="$REGISTRY" \
    --docker-username="$HARBOR_USER" \
    --docker-password="$HARBOR_PASS" \
    --dry-run=client -o yaml | kubectl apply -f -
}

apply_k8s() {
  log "kubectl apply"
  kubectl apply -f deploy/k8s/namespace.yaml
  kubectl apply -f deploy/k8s/configmap.yaml
  kubectl apply -f deploy/k8s/backend-deployment.yaml
  kubectl apply -f deploy/k8s/backend-service.yaml
  kubectl apply -f deploy/k8s/frontend-deployment.yaml
  kubectl apply -f deploy/k8s/frontend-service.yaml
}

rollout() {
  local target="${1:-all}"
  case "$target" in
    backend)
      kubectl -n xiaozhi rollout restart deployment/webrtc-backend
      kubectl -n xiaozhi rollout status deployment/webrtc-backend --timeout=180s
      ;;
    frontend)
      kubectl -n xiaozhi rollout restart deployment/webrtc-frontend
      kubectl -n xiaozhi rollout status deployment/webrtc-frontend --timeout=180s
      ;;
    all|*)
      kubectl -n xiaozhi rollout restart deployment/webrtc-backend deployment/webrtc-frontend
      kubectl -n xiaozhi rollout status deployment/webrtc-backend --timeout=180s
      kubectl -n xiaozhi rollout status deployment/webrtc-frontend --timeout=180s
      ;;
  esac
}

prune_builder() {
  log "清理 buildx 缓存"
  docker builder prune -af >/dev/null 2>&1 || true
}

assert_k8s_cluster() {
  local ctx=""
  ctx="$(kubectl config current-context 2>/dev/null || true)"
  case "${ctx}" in
    kind-learn|kind-*)
      if [[ "${ALLOW_LOCAL_K8S:-}" != "1" ]]; then
        echo "ERROR: kubectl context is '${ctx}' (local kind), not Tencent cluster."
        echo "  Build only: ./deploy-k8s.sh build"
        echo "  Deploy on master: ./deploy-k8s.sh apply"
        exit 1
      fi
      ;;
  esac
  log "kubectl context: ${ctx:-default}"
}

TARGET="${1:-all}"

case "$TARGET" in
  build)
    harbor_login
    ensure_buildx
    build_backend
    build_frontend
    ;;
  backend)
    harbor_login
    ensure_buildx
    build_backend
    assert_k8s_cluster
    ensure_harbor_secret
    apply_k8s
    rollout backend
    ;;
  frontend)
    harbor_login
    ensure_buildx
    build_frontend
    assert_k8s_cluster
    ensure_harbor_secret
    apply_k8s
    rollout frontend
    ;;
  all|"")
    harbor_login
    ensure_buildx
    build_backend
    build_frontend
    assert_k8s_cluster
    ensure_harbor_secret
    apply_k8s
    rollout all
    ;;
  apply)
    assert_k8s_cluster
    ensure_harbor_secret
    apply_k8s
    rollout all
    ;;
  *)
    echo "未知目标: $TARGET (可选: build | backend | frontend | all | apply)"
    exit 1
    ;;
esac

prune_builder

log "完成"
if [[ "$TARGET" == "build" ]]; then
  echo "Harbor 镜像已推送:"
  echo "  $BACKEND_IMAGE"
  echo "  $FRONTEND_IMAGE"
  echo "在腾讯云 master 上执行: ./deploy-k8s.sh apply"
  exit 0
fi

kubectl -n xiaozhi get pods -l 'app in (webrtc-backend,webrtc-frontend)' -o wide 2>/dev/null || true
kubectl -n xiaozhi get svc webrtc-frontend webrtc-backend 2>/dev/null || true
echo ""
echo "外网访问: http://43.153.40.19:30810/"
echo "健康检查: http://43.153.40.19:30810/health"
