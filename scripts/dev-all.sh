#!/usr/bin/env bash
# Start all dev servers and keep them alive (see dev-persistent.sh).
# Legacy one-shot nohup mode is unreliable when launched from short-lived shells.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "$ROOT/scripts/dev-persistent.sh"