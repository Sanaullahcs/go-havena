import os
import subprocess
from pathlib import Path

os.environ["PYTHONUNBUFFERED"] = "1"
os.environ["PYTHONIOENCODING"] = "utf-8"

root = Path(r"D:\wamp64-330\www\go-havena")
env = {}
for line in (root / ".deploy" / "local.env").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    env[key] = value

host = f"{env['DEPLOY_SSH_USER']}@{env['DEPLOY_SSH_HOST']}"
common = [
    "-P", env["DEPLOY_SSH_PORT"],
    "-pw", env["DEPLOY_SSH_PASSWORD"],
    "-batch",
    "-hostkey", env.get("DEPLOY_SSH_HOSTKEY", ""),
]
sh = root / ".tmp" / "gohavena-prod-deploy-remote.sh"
sh.write_bytes(sh.read_bytes().replace(b"\r\n", b"\n"))
subprocess.check_call(
    [r"C:\Program Files\PuTTY\pscp.exe", *common, str(sh), f"{host}:/tmp/gohavena-prod-deploy-remote.sh"]
)
proc = subprocess.run(
    [
        r"C:\Program Files\PuTTY\plink.exe",
        "-ssh",
        *common,
        host,
        "sed -i 's/\\r$//' /tmp/gohavena-prod-deploy-remote.sh && bash /tmp/gohavena-prod-deploy-remote.sh",
    ],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    timeout=1200,
)
text = proc.stdout.decode("utf-8", "replace")
safe = text.encode("ascii", "replace").decode("ascii")
log = root / ".tmp" / "deploy-prod-full-now.log"
log.write_text(safe, encoding="ascii")
print(safe, flush=True)
raise SystemExit(proc.returncode)
