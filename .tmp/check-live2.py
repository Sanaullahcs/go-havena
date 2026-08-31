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
echo '=== HTTPD STATUS ==='
systemctl status httpd --no-pager -l | head -n 80
echo
echo '=== HTTPD JOURNAL ==='
journalctl -u httpd -n 80 --no-pager
echo
echo '=== APACHECTL CONFIGTEST ==='
/usr/sbin/apachectl configtest 2>&1 || /usr/local/apache/bin/apachectl configtest 2>&1 || httpd -t 2>&1
echo
echo '=== GOHVENA PM2 ==='
sudo -u gohvena bash -lc 'export HOME=/home/gohvena; pm2 list; echo ---; ls -la /home/gohvena/.pm2 2>/dev/null | head; echo ---; cat /home/gohvena/.pm2/dump.pm2 2>/dev/null | head -c 2000'
echo
echo '=== NODE PROCS ==='
ps aux | grep -E 'node|next|php-fpm|mysqld' | grep -v grep
echo
echo '=== MYSQL ==='
systemctl is-active mysql mysqld mariadb 2>/dev/null
echo
echo '=== CPANEL ==='
systemctl status cpanel --no-pager -l | head -n 30
echo
echo '=== LAST RESTART ATTEMPTS ==='
grep -E 'AH00016|AH00051|Syntax|Cannot|Address already|Permission|failed' /usr/local/apache/logs/error_log | tail -n 40
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
