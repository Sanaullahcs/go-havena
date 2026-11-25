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
api = env.get("DEPLOY_PATH_API") or "/home/gohvena/public_html/prod_apis"
common = [
    "-P", env["DEPLOY_SSH_PORT"],
    "-pw", env["DEPLOY_SSH_PASSWORD"],
    "-batch",
    "-hostkey", env.get("DEPLOY_SSH_HOSTKEY", ""),
]
script = root / ".tmp" / "remove-umer-opus.php"
script.write_bytes(script.read_bytes().replace(b"\r\n", b"\n"))
subprocess.check_call(
    [r"C:\Program Files\PuTTY\pscp.exe", *common, str(script), f"{host}:/tmp/remove-umer-opus.php"]
)
remote = (
    "set -e; sed -i 's/\\r$//' /tmp/remove-umer-opus.php; "
    f"cd {api}; "
    "php artisan tinker --execute=\"require '/tmp/remove-umer-opus.php';\"; "
    "rm -f /tmp/remove-umer-opus.php"
)
out = subprocess.check_output(
    [r"C:\Program Files\PuTTY\plink.exe", "-ssh", *common, host, remote],
    stderr=subprocess.STDOUT,
    timeout=90,
)
log = root / ".tmp" / "remove-umer-opus.log"
log.write_bytes(out)
print(out.decode("ascii", "replace"), flush=True)
