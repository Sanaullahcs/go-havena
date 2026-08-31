import subprocess
from pathlib import Path

env = {}
for line in Path(r"D:\wamp64-330\www\go-havena\.deploy\local.env").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    env[key] = value

host = f"{env['DEPLOY_SSH_USER']}@{env['DEPLOY_SSH_HOST']}"
common_pscp = [
    r"C:\Program Files\PuTTY\pscp.exe",
    "-P", env["DEPLOY_SSH_PORT"],
    "-pw", env["DEPLOY_SSH_PASSWORD"],
    "-batch",
    "-hostkey", env.get("DEPLOY_SSH_HOSTKEY", ""),
]
common_plink = [
    r"C:\Program Files\PuTTY\plink.exe",
    "-ssh",
    "-P", env["DEPLOY_SSH_PORT"],
    "-pw", env["DEPLOY_SSH_PASSWORD"],
    "-batch",
    "-hostkey", env.get("DEPLOY_SSH_HOSTKEY", ""),
    host,
]

files = [
    (r"D:\wamp64-330\www\go-havena\backend\app\Http\Controllers\Api\V1\ProfileController.php",
     "/home/gohvena/public_html/prod_apis/app/Http/Controllers/Api/V1/ProfileController.php"),
    (r"D:\wamp64-330\www\go-havena\backend\routes\api.php",
     "/home/gohvena/public_html/prod_apis/routes/api.php"),
    (r"D:\wamp64-330\www\go-havena\backend\app\Http\Controllers\Api\V1\ProfileController.php",
     "/home/gohvena/public_html/uat_apis/app/Http/Controllers/Api/V1/ProfileController.php"),
    (r"D:\wamp64-330\www\go-havena\backend\routes\api.php",
     "/home/gohvena/public_html/uat_apis/routes/api.php"),
]
for local, remote in files:
    cmd = common_pscp + [local, f"{host}:{remote}"]
    print("upload", remote)
    subprocess.check_call(cmd)

remote = r"""
chown gohvena:gohvena /home/gohvena/public_html/prod_apis/app/Http/Controllers/Api/V1/ProfileController.php /home/gohvena/public_html/prod_apis/routes/api.php /home/gohvena/public_html/uat_apis/app/Http/Controllers/Api/V1/ProfileController.php /home/gohvena/public_html/uat_apis/routes/api.php
cd /home/gohvena/public_html/prod_apis && php artisan optimize:clear && php artisan route:clear
cd /home/gohvena/public_html/uat_apis && php artisan optimize:clear && php artisan route:clear
php /home/gohvena/public_html/prod_apis/artisan route:list --path=me | head
"""
raise SystemExit(subprocess.call(common_plink + [remote]))
