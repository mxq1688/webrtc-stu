#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

BACKEND_IMAGE="${BACKEND_IMAGE:-webrtc-stu-backend:latest}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-webrtc-stu-frontend:latest}"
REACT_APP_WS_URL="${REACT_APP_WS_URL:-}"

echo "==> Build backend: $BACKEND_IMAGE"
docker build -f deploy/docker/backend/Dockerfile -t "$BACKEND_IMAGE" .

echo "==> Build frontend: $FRONTEND_IMAGE"
docker build -f deploy/docker/frontend/Dockerfile \
  --build-arg REACT_APP_WS_URL="$REACT_APP_WS_URL" \
  -t "$FRONTEND_IMAGE" .

echo "==> Done."
docker images | grep -E 'webrtc-stu-(backend|frontend)'
