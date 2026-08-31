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
echo '=== OLD DUMP NAMES/PORTS ==='
python3 - <<'PY'
import json
p='/root/.pm2/dump.pm2.bak'
try:
    data=json.load(open(p))
except Exception as e:
    print('no bak', e)
    raise SystemExit
for item in data:
    print(item.get('name'), item.get('pm_cwd'), item.get('pm_exec_path'), (item.get('args') or item.get('pm_exec_args')), item.get('env',{}).get('PORT'), item.get('env',{}).get('NODE_ENV'))
PY
echo
echo '=== CURRENT LISTEN NODE ==='
ss -lntp | grep -E 'node|next|3000|3020|3021' || true
echo
echo '=== PM2 LOGS ==='
pm2 logs havena-prod --lines 20 --nostream
pm2 logs havena-uat --lines 10 --nostream
echo
echo '=== RESTART ON CORRECT PORTS ==='
pm2 delete havena-prod havena-uat
cd /home/gohvena/public_html/prod_frontend
NODE_ENV=production pm2 start ./node_modules/next/dist/bin/next --name havena-prod -- start -p 3020 -H 0.0.0.0
cd /home/gohvena/public_html/uat_frontend
NODE_ENV=production pm2 start ./node_modules/next/dist/bin/next --name havena-uat -- start -p 3021 -H 0.0.0.0
pm2 save
sleep 6
pm2 list
echo
ss -lntp | grep -E ':3020|:3021|:3000' || true
curl -sS -o /dev/null -w 'prod3020:%{http_code}\n' --max-time 20 http://127.0.0.1:3020/ || echo prod3020:fail
curl -sS -o /dev/null -w 'uat3021:%{http_code}\n' --max-time 20 http://127.0.0.1:3021/ || echo uat3021:fail
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
