#!/usr/bin/env bash
# Quick diagnostics: is Metro reachable on this Mac (and on LAN IP)?
set -euo pipefail

LAN="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
echo "LAN IP: ${LAN:-none}"
echo -n "Metro localhost: "
curl -sf -m 2 http://127.0.0.1:8081/status || echo "NOT RUNNING"
if [[ -n "${LAN:-}" ]]; then
  echo -n "Metro LAN ($LAN): "
  curl -sf -m 2 "http://${LAN}:8081/status" || echo "UNREACHABLE (router may block device-to-device)"
fi
echo -n "API health: "
curl -sf -m 2 http://127.0.0.1:8000/api/v1/health | head -c 80 || echo "down"
echo ""
lsof -nP -iTCP:8081 -sTCP:LISTEN 2>/dev/null || echo "No process on :8081"