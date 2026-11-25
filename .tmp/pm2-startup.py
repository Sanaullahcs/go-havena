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
pm2 startup systemd -u root --hp /root >/dev/null
pm2 save
systemctl is-enabled pm2-root 2>/dev/null || systemctl is-enabled pm2.service 2>/dev/null
echo 'pm2-startup-done'
systemctl is-active clamd@amavisd 2>/dev/null
echo "clamd=$(systemctl is-active clamd@amavisd 2>/dev/null)"
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
