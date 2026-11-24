#!/bin/bash
# Manual fallback to start XAMPP MariaDB if it is down.
# Preferred keeper: LaunchAgent com.havena.local-mariadb (KeepAlive on mysqld_safe).
# Do not re-enable the old interval+pkill watchdog — it thrased healthy mysqld from launchd.
set -u

SOCK="/Applications/XAMPP/xamppfiles/var/mysql/mysql.sock"
ADMIN="/Applications/XAMPP/xamppfiles/bin/mysqladmin"
SERVER="/Applications/XAMPP/xamppfiles/bin/mysql.server"
LOG="${HOME}/Library/Logs/havena-mysql-watchdog.log"
LOCK="/tmp/havena-mysql-watchdog.lock"

mkdir -p "$(dirname "$LOG")"

exec 9>"$LOCK"
if ! flock -n 9; then
  exit 0
fi

ts() { date '+%Y-%m-%d %H:%M:%S'; }

is_alive() {
  if [ -S "$SOCK" ] && "$ADMIN" --socket="$SOCK" -uroot ping >/dev/null 2>&1; then
    return 0
  fi
  if "$ADMIN" -h 127.0.0.1 -P 3306 -uroot --protocol=TCP ping >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

if is_alive; then
  echo "[$(ts)] mysql already alive" >>"$LOG"
  exit 0
fi

echo "[$(ts)] mysql down — starting (no pkill)" >>"$LOG"
"$SERVER" start >>"$LOG" 2>&1 || true

for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 1
  if is_alive; then
    echo "[$(ts)] mysql started OK" >>"$LOG"
    exit 0
  fi
done

echo "[$(ts)] mysql start FAILED" >>"$LOG"
exit 1
