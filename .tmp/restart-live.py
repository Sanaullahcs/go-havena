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
echo '=== START MARIADB ==='
systemctl reset-failed mariadb
systemctl start mariadb
systemctl is-active mariadb
sleep 2
echo
echo '=== START HTTPD ==='
systemctl reset-failed httpd
systemctl start httpd
systemctl is-active httpd
sleep 2
echo
echo '=== START NAMED ==='
systemctl reset-failed named
systemctl start named
systemctl is-active named
echo
echo '=== LISTEN ==='
ss -lntp | grep -E ':80|:443|:3306|:3020|:3021|:53' || true
echo
echo '=== FIND NODE ==='
ls /home/gohvena/.nvm/versions/node 2>/dev/null
ls /opt/cpanel/ea-nodejs*/bin/node 2>/dev/null
ls /usr/local/bin/node /bin/node 2>/dev/null
find /home/gohvena /usr/local /opt /root -name 'node' -type f 2>/dev/null | head -n 20
echo
echo '=== PM2 AS GOHVENA ==='
sudo -u gohvena bash -lc 'export HOME=/home/gohvena; export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; which node; node -v; which pm2; pm2 list'
echo
echo '=== MEM AFTER START ==='
free -h
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
