import os
import subprocess
from pathlib import Path

os.environ["PYTHONUNBUFFERED"] = "1"
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
script = root / ".tmp" / "seed-haly-and-optimize.php"
body = script.read_bytes().replace(b"\r\n", b"\n")
ctrl = (root / "backend" / "app" / "Http" / "Controllers" / "Api" / "V1" / "WellnessController.php").read_bytes().replace(b"\r\n", b"\n")
common = [
    r"C:\Program Files\PuTTY\plink.exe",
    "-ssh",
    "-P", env["DEPLOY_SSH_PORT"],
    "-pw", env["DEPLOY_SSH_PASSWORD"],
    "-batch",
    "-hostkey", env.get("DEPLOY_SSH_HOSTKEY", ""),
    host,
]
put1 = subprocess.run([*common, "cat > /tmp/seed-haly-and-optimize.php"], input=body, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=60)
if put1.returncode != 0:
    raise SystemExit(put1.stdout.decode("ascii", "replace"))
put2 = subprocess.run(
    [*common, f"cat > {api}/app/Http/Controllers/Api/V1/WellnessController.php"],
    input=ctrl,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    timeout=60,
)
if put2.returncode != 0:
    raise SystemExit(put2.stdout.decode("ascii", "replace"))
remote = (
    "sed -i 's/\\r$//' /tmp/seed-haly-and-optimize.php; "
    f"cd {api}; php artisan tinker --execute=\"require '/tmp/seed-haly-and-optimize.php';\"; "
    "rm -f /tmp/seed-haly-and-optimize.php"
)
out = subprocess.check_output([*common, remote], stderr=subprocess.STDOUT, timeout=300)
safe = out.decode("utf-8", "replace").encode("ascii", "replace").decode("ascii")
(root / ".tmp" / "seed-haly-and-optimize.log").write_text(safe, encoding="ascii")
print(safe, flush=True)
