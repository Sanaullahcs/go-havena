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
export NVM_DIR=/root/.nvm
. "$NVM_DIR/nvm.sh"
nvm use 22 >/dev/null
echo "node=$(which node) $(node -v)"
echo "pm2=$(which pm2)"
echo
echo '=== HTACCESS PORTS ==='
grep -nE '3020|3021|Proxy|localhost' /home/gohvena/public_html/prod_frontend/.htaccess /home/gohvena/public_html/uat_frontend/.htaccess 2>/dev/null | head -n 40
echo
echo '=== PACKAGE START ==='
ls /home/gohvena/public_html/prod_frontend/package.json /home/gohvena/public_html/uat_frontend/package.json
echo '--- prod ---'
python3 - <<'PY' 2>/dev/null || true
import json
print(json.load(open('/home/gohvena/public_html/prod_frontend/package.json')).get('scripts'))
print(json.load(open('/home/gohvena/public_html/uat_frontend/package.json')).get('scripts'))
PY
echo
echo '=== EXISTING PM2 DUMP ==='
ls -la /root/.pm2 /home/gohvena/.pm2 2>/dev/null
pm2 list
echo
echo '=== START FRONTENDS ==='
cd /home/gohvena/public_html/prod_frontend
pm2 describe havena-prod >/dev/null 2>&1
if [ $? -ne 0 ]; then
  PORT=3020 NODE_ENV=production pm2 start npm --name havena-prod -- start
fi
cd /home/gohvena/public_html/uat_frontend
pm2 describe havena-uat >/dev/null 2>&1
if [ $? -ne 0 ]; then
  PORT=3021 NODE_ENV=production pm2 start npm --name havena-uat -- start
fi
pm2 save
pm2 list
echo
echo '=== LOCAL CHECK ==='
sleep 4
curl -sS -o /dev/null -w 'prod3020:%{http_code}\n' --max-time 15 http://127.0.0.1:3020/ || echo prod3020:fail
curl -sS -o /dev/null -w 'uat3021:%{http_code}\n' --max-time 15 http://127.0.0.1:3021/ || echo uat3021:fail
curl -sS --max-time 15 -H 'Host: apis.gohavena.com' http://127.0.0.1/api/v1/health
echo
curl -sS --max-time 15 -k -H 'Host: apis.gohavena.com' https://127.0.0.1/api/v1/health
echo
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
