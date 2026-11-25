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
cmd = (
    f"cd {api}/public/storage/seed; "
    "python3 - <<'PY'\n"
    "from PIL import Image\n"
    "import os\n"
    "for name in sorted(os.listdir('.')):\n"
    "    if not (name.startswith('course-') or name.startswith('wellness-')) or not name.endswith('.jpg'):\n"
    "        continue\n"
    "    p=os.path.join('.', name)\n"
    "    im=Image.open(p)\n"
    "    print(f'{name} {os.path.getsize(p)} {im.size[0]}x{im.size[1]} {im.mode}')\n"
    "PY\n"
    "echo '=== curl ==='; "
    "curl -sS -o /dev/null -w 'api_seed=%{http_code} time=%{time_total} size=%{size_download}\\n' "
    "https://apis.gohavena.com/storage/seed/course-nutrition.jpg; "
    "curl -sS -o /dev/null -w 'web_seed=%{http_code} time=%{time_total} size=%{size_download}\\n' "
    "https://gohavena.com/storage/seed/course-nutrition.jpg; "
    "echo '=== htaccess ==='; "
    "ls -la ../.htaccess .htaccess ../../.htaccess 2>/dev/null; "
    "echo '=== php convert ==='; which convert; php -r \"echo 'gd ok';\""
)
out = subprocess.check_output(
    [
        r"C:\Program Files\PuTTY\plink.exe",
        "-ssh",
        "-P", env["DEPLOY_SSH_PORT"],
        "-pw", env["DEPLOY_SSH_PASSWORD"],
        "-batch",
        "-hostkey", env.get("DEPLOY_SSH_HOSTKEY", ""),
        host,
        cmd,
    ],
    stderr=subprocess.STDOUT,
    timeout=90,
)
print(out.decode("utf-8", "replace").encode("ascii", "replace").decode("ascii"), flush=True)
