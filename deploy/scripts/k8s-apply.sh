#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
kubectl apply -f "$ROOT/deploy/k8s/namespace.yaml"
kubectl apply -f "$ROOT/deploy/k8s/configmap.yaml"
kubectl apply -f "$ROOT/deploy/k8s/backend-deployment.yaml"
kubectl apply -f "$ROOT/deploy/k8s/backend-service.yaml"
kubectl apply -f "$ROOT/deploy/k8s/frontend-deployment.yaml"
kubectl apply -f "$ROOT/deploy/k8s/frontend-service.yaml"
# 可选: kubectl apply -f "$ROOT/deploy/k8s/ingress.yaml"
kubectl -n xiaozhi rollout status deployment/webrtc-backend --timeout=120s
kubectl -n xiaozhi rollout status deployment/webrtc-frontend --timeout=120s
