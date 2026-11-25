import subprocess
from pathlib import Path

env = {}
for line in Path(r"D:\wamp64-330\www\go-havena\.deploy\local.env").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    env[key] = value

remote = r"""
set +e
echo '=== OOM DMESG ==='
dmesg -T 2>/dev/null | grep -iE 'oom|killed process|out of memory' | tail -n 40
echo
echo '=== MYSQL STATUS ==='
systemctl status mysql mysqld mariadb --no-pager -l 2>&1 | head -n 80
echo
echo '=== MYSQL JOURNAL ==='
journalctl -u mysql -u mysqld -u mariadb -n 50 --no-pager 2>&1 | tail -n 60
echo
echo '=== SERVICE LIST WEB/DB ==='
systemctl list-units --type=service --all | grep -iE 'http|nginx|mysql|maria|cwp|php-fpm|named' | head -n 40
echo
echo '=== NODE PATHS ==='
ls -l /usr/bin/node /usr/local/bin/node /home/gohvena/.nvm 2>/dev/null
find /usr/local /home/gohvena /opt -name node -type f 2>/dev/null | head
echo
echo '=== HAVENA DIRS ==='
ls -ld /home/gohvena/public_html/prod_frontend /home/gohvena/public_html/prod_apis /home/gohvena/public_html/uat_frontend /home/gohvena/public_html/uat_apis 2>&1
"""

cmd = [
    r"C:\Program Files\PuTTY\plink.exe",
    "-ssh",
    "-P",
    env["DEPLOY_SSH_PORT"],
    "-pw",
    env["DEPLOY_SSH_PASSWORD"],
    "-batch",
    "-hostkey",
    env.get("DEPLOY_SSH_HOSTKEY", ""),
    f"{env['DEPLOY_SSH_USER']}@{env['DEPLOY_SSH_HOST']}",
    remote,
]
raise SystemExit(subprocess.call(cmd))
