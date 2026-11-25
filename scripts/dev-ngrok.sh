#!/usr/bin/env bash
# Start ngrok tunnels for frontend (:3000) and backend (:8000) in one agent.
# Requires a personal ngrok authtoken (the shared Expo token is rate-limited).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="/tmp/havena-ngrok.yml"
SESSION="ngrok-dev"
NGROK_BIN="${NGROK_BIN:-$(command -v ngrok || true)}"

resolve_authtoken() {
  if [[ -n "${NGROK_AUTHTOKEN:-}" ]]; then
    echo "$NGROK_AUTHTOKEN"
    return
  fi

  local token_file="$ROOT/apps/mobile/.ngrok-token"
  if [[ -f "$token_file" ]]; then
    tr -d '[:space:]' < "$token_file"
    return
  fi

  echo "[ngrok] Missing authtoken." >&2
  echo "[ngrok] Set NGROK_AUTHTOKEN or create apps/mobile/.ngrok-token (see .ngrok-token.example)." >&2
  echo "[ngrok] Get a token: https://dashboard.ngrok.com/get-started/your-authtoken" >&2
  exit 1
}

require_servers() {
  local ok=0
  curl -sf -o /dev/null http://127.0.0.1:3000/ || { echo "[ngrok] Frontend not running on :3000 — start with: npm run dashboards" >&2; ok=1; }
  curl -sf -o /dev/null http://127.0.0.1:8000/api/v1/health || { echo "[ngrok] Backend not running on :8000 — start with: npm run backend" >&2; ok=1; }
  [[ "$ok" -eq 0 ]]
}

write_config() {
  local token="$1"
  cat > "$CONFIG" <<EOF
version: "2"
authtoken: ${token}
tunnels:
  frontend:
    proto: http
    addr: 3000
  backend:
    proto: http
    addr: 8000
EOF
}

stop_existing() {
  tmux -f /exec-daemon/tmux.portal.conf kill-session -t "$SESSION" 2>/dev/null || true
  pkill -f "ngrok start --all --config=$CONFIG" 2>/dev/null || true
}

fetch_tunnel_url() {
  local name="$1"
  curl -sf http://127.0.0.1:4040/api/tunnels \
    | python3 -c "import json,sys; data=json.load(sys.stdin); print(next((t['public_url'] for t in data.get('tunnels',[]) if t.get('name')=='$name' and t['public_url'].startswith('https')), ''))"
}

wait_for_tunnels() {
  local frontend_url backend_url i
  for i in $(seq 1 30); do
    frontend_url="$(fetch_tunnel_url frontend || true)"
    backend_url="$(fetch_tunnel_url backend || true)"
    if [[ -n "$frontend_url" && -n "$backend_url" ]]; then
      echo "$frontend_url" "$backend_url"
      return 0
    fi
    sleep 1
  done
  echo "[ngrok] Timed out waiting for tunnel URLs. Check: tmux attach -t $SESSION" >&2
  return 1
}

update_backend_cors() {
  local env_file="$ROOT/backend/.env"
  [[ -f "$env_file" ]] || return 0

  local patterns=(
    '#^https://[a-z0-9-]+\.ngrok-free\.app$#'
    '#^https://[a-z0-9-]+\.ngrok\.io$#'
    '#^https://[a-z0-9-]+\.ngrok\.app$#'
  )

  python3 - "$env_file" "${patterns[@]}" <<'PY'
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
patterns = sys.argv[2:]
text = path.read_text()
key = "CORS_ALLOWED_ORIGIN_PATTERNS="
lines = text.splitlines()
out, found = [], False
for line in lines:
    if line.startswith(key):
        found = True
        existing = [p.strip() for p in line.split("=", 1)[1].split(",") if p.strip()]
        merged = existing[:]
        for p in patterns:
            if p not in merged:
                merged.append(p)
        out.append(key + ",".join(merged))
    else:
        out.append(line)
if not found:
    out.append(key + ",".join(patterns))
path.write_text("\n".join(out) + ("\n" if text.endswith("\n") else ""))
PY
}

write_dev_urls() {
  local frontend_url="$1"
  local backend_url="$2"
  cat > "$ROOT/dev-urls.txt" <<EOF
# Havena dev URLs — ngrok $(date -u +%Y-%m-%dT%H:%MZ)

## Local (VM)
- Frontend: http://localhost:3000
- Backend API: http://127.0.0.1:8000/api/v1
- Landing page: http://localhost:3001
- Expo Metro: http://localhost:8081

## Public ngrok tunnels (open on your Mac/phone)
- Frontend: ${frontend_url}
- Backend API: ${backend_url}/api/v1
- Plaid: ${frontend_url}/admin/plaid

## Test logins
- System admin: ${frontend_url}/system-login — admin@havena.app / password
- Community admin: ${frontend_url}/login — (555) 666-8888 · OTP 123456

## Notes
- Frontend uses NEXT_PUBLIC_API_URL=${backend_url}/api/v1 when started via this script.
- ngrok dashboard: http://127.0.0.1:4040
EOF
}

main() {
  [[ -n "$NGROK_BIN" ]] || { echo "[ngrok] Install ngrok first (apt install ngrok)." >&2; exit 1; }
  require_servers

  local token
  token="$(resolve_authtoken)"
  write_config "$token"
  stop_existing

  echo "[ngrok] Starting frontend + backend tunnels (session: $SESSION)..."
  tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION" -c "$ROOT" -- \
    "$NGROK_BIN" start --all --config="$CONFIG" --log=stdout

  sleep 2
  read -r FRONTEND_URL BACKEND_URL < <(wait_for_tunnels)

  update_backend_cors
  write_dev_urls "$FRONTEND_URL" "$BACKEND_URL"

  echo ""
  echo "Frontend:  $FRONTEND_URL"
  echo "Backend:   $BACKEND_URL/api/v1"
  echo "Plaid:     $FRONTEND_URL/admin/plaid"
  echo "Dashboard: http://127.0.0.1:4040"
  echo ""
  echo "Restart frontend with backend ngrok URL:"
  echo "  NEXT_PUBLIC_API_URL=${BACKEND_URL}/api/v1 npm run frontend"
  echo ""
  echo "URLs saved to dev-urls.txt"
}

main "$@"
