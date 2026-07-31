#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/frontend"

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"

npm run firebase:sw 2>/dev/null || true

# Webpack dev avoids Turbopack/SWC OOM crashes seen on this machine.
while true; do
  echo "[dev-frontend] Starting Next.js (webpack) on http://0.0.0.0:3000"
  npx next dev --webpack -p 3000 -H 0.0.0.0 || true
  echo "[dev-frontend] Next.js exited — restarting in 3s..."
  sleep 3
done
