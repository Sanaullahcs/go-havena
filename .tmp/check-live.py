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
echo '=== HOST ==='
hostname
uptime
date
echo
echo '=== LISTEN 80/443/3020/3021 ==='
ss -lntp 2>/dev/null | grep -E ':80|:443|:3020|:3021' || netstat -lntp 2>/dev/null | grep -E ':80|:443|:3020|:3021'
echo
echo '=== WEB SERVICES ==='
for s in httpd apache2 nginx litespeed lshttpd; do
  if systemctl list-unit-files 2>/dev/null | grep -q "^${s}"; then
    echo "-- $s: $(systemctl is-active $s 2>/dev/null) $(systemctl is-enabled $s 2>/dev/null)"
  fi
done
ps aux | grep -E 'httpd|apache|nginx|litespeed|lshttpd' | grep -v grep | head -n 20
echo
echo '=== PM2 ==='
export HOME=/root
command -v pm2 >/dev/null && pm2 list || echo 'pm2 not in PATH'
sudo -u gohvena bash -lc 'pm2 list' 2>/dev/null
echo
echo '=== DISK / MEM ==='
df -h / /home /tmp 2>/dev/null
free -h
echo
echo '=== APACHE/HTTPD ERROR (last) ==='
for f in /var/log/httpd/error_log /var/log/apache2/error.log /usr/local/apache/logs/error_log /var/log/httpd/error_log; do
  if [ -f "$f" ]; then echo "-- $f"; tail -n 40 "$f"; fi
done
echo
echo '=== CURL LOCAL ==='
curl -sS -o /dev/null -w 'local80:%{http_code}\n' --max-time 8 http://127.0.0.1/ || echo local80:fail
curl -sS -o /dev/null -w 'local443:%{http_code}\n' -k --max-time 8 https://127.0.0.1/ || echo local443:fail
curl -sS -o /dev/null -w 'prod3020:%{http_code}\n' --max-time 8 http://127.0.0.1:3020/ || echo prod3020:fail
curl -sS -o /dev/null -w 'uat3021:%{http_code}\n' --max-time 8 http://127.0.0.1:3021/ || echo uat3021:fail
curl -sS --max-time 8 http://127.0.0.1/api/v1/health || true
echo
echo '=== FIREWALL ==='
iptables -S 2>/dev/null | head -n 40
firewall-cmd --list-all 2>/dev/null | head -n 40
echo
echo '=== WHM/CPANEL HINT ==='
systemctl is-active cpanel 2>/dev/null
systemctl is-active httpd 2>/dev/null
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
