import os
import subprocess
from io import BytesIO
from pathlib import Path

from PIL import Image

os.environ["PYTHONUNBUFFERED"] = "1"

root = Path(r"D:\wamp64-330\www\go-havena")
src = Path(
    r"C:\Users\Sanaullah\.cursor\projects\d-wamp64-330-www-go-havena\assets"
    r"\c__Users_Sanaullah_AppData_Roaming_Cursor_User_workspaceStorage_"
    r"2494e3549dd0de016244d195d12dbd2a_images_image-67c1a629-c215-4a9d-a21b-cb5e0200f2b0.png"
)

im = Image.open(src).convert("RGB")
im.thumbnail((960, 640), Image.Resampling.LANCZOS)
buf = BytesIO()
im.save(buf, "JPEG", quality=68, optimize=True, progressive=True)
jpg_bytes = buf.getvalue()
print(f"local {im.size[0]}x{im.size[1]} {len(jpg_bytes)}", flush=True)

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
    r"C:\Program Files\PuTTY\plink.exe",
    "-ssh",
    "-P", env["DEPLOY_SSH_PORT"],
    "-pw", env["DEPLOY_SSH_PASSWORD"],
    "-batch",
    "-hostkey", env.get("DEPLOY_SSH_HOSTKEY", ""),
    host,
]

put_img = subprocess.run(
    [*common, "cat > /tmp/haly-welcome.jpg"],
    input=jpg_bytes,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    timeout=60,
)
if put_img.returncode != 0:
    raise SystemExit(put_img.stdout.decode("ascii", "replace"))

php = (root / ".tmp" / "update-haly-welcome.php").read_bytes().replace(b"\r\n", b"\n")
put_php = subprocess.run(
    [*common, "cat > /tmp/update-haly-welcome.php"],
    input=php,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    timeout=30,
)
if put_php.returncode != 0:
    raise SystemExit(put_php.stdout.decode("ascii", "replace"))

remote = (
    "sed -i 's/\\r$//' /tmp/update-haly-welcome.php; "
    f"cd {api}; php artisan tinker --execute=\"require '/tmp/update-haly-welcome.php';\"; "
    "rm -f /tmp/update-haly-welcome.php /tmp/haly-welcome.jpg"
)
out = subprocess.check_output([*common, remote], stderr=subprocess.STDOUT, timeout=120)
text = out.decode("utf-8", "replace").encode("ascii", "replace").decode("ascii")
(root / ".tmp" / "update-haly-welcome.log").write_text(text, encoding="ascii")
print(text, flush=True)
