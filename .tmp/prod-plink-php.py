import os
import subprocess
import sys
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
script = Path(sys.argv[1]).resolve()
remote_name = script.name
body = script.read_bytes().replace(b"\r\n", b"\n")
common = [
    r"C:\Program Files\PuTTY\plink.exe",
    "-ssh",
    "-P", env["DEPLOY_SSH_PORT"],
    "-pw", env["DEPLOY_SSH_PASSWORD"],
    "-batch",
    "-hostkey", env.get("DEPLOY_SSH_HOSTKEY", ""),
    host,
]
put = subprocess.run(
    [*common, f"cat > /tmp/{remote_name}"],
    input=body,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    timeout=60,
    check=False,
)
if put.returncode != 0:
    sys.stdout.buffer.write(put.stdout)
    raise SystemExit(put.returncode)

remote = (
    f"sed -i 's/\\r$//' /tmp/{remote_name}; "
    f"cd {api}; "
    f"php artisan tinker --execute=\"require '/tmp/{remote_name}';\"; "
    f"rm -f /tmp/{remote_name}"
)
out = subprocess.check_output(
    [*common, remote],
    stderr=subprocess.STDOUT,
    timeout=120,
)
text = out.decode("utf-8", "replace")
safe = text.encode("ascii", "replace").decode("ascii")
log = root / ".tmp" / (script.stem + ".log")
log.write_text(safe, encoding="ascii")
print(safe, flush=True)
