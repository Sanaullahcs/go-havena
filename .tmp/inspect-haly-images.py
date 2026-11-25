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
    f"cd {api}; "
    "echo '=== seed wellness ==='; "
    "ls -lah public/storage/seed/course-*.jpg public/storage/seed/wellness-*.jpg 2>/dev/null || "
    "ls -lah storage/app/public/seed/course-*.jpg storage/app/public/seed/wellness-*.jpg 2>/dev/null; "
    "echo '=== lesson files ==='; "
    "php artisan tinker --execute=\"echo implode(chr(10), Illuminate\\\\Support\\\\Facades\\\\DB::table('wellness_lessons')->whereNull('deleted_at')->get(['id','title','file_path','video_url'])->map(fn(\\$l)=>\\$l->id.' '.\\$l->title.' file='.(\\$l->file_path?:'').' vid='.(\\$l->video_url?:''))->all());\"; "
    "echo '=== deals cols ==='; "
    "php artisan tinker --execute=\"echo implode(',', Illuminate\\\\Support\\\\Facades\\\\Schema::getColumnListing('deals'));\"; "
    "echo; echo '=== biz cols ==='; "
    "php artisan tinker --execute=\"echo implode(',', Illuminate\\\\Support\\\\Facades\\\\Schema::getColumnListing('businesses'));\"; "
    "echo; echo '=== php gd ==='; php -r \"echo extension_loaded('gd')?'gd=yes':'gd=no'; echo PHP_EOL; echo extension_loaded('imagick')?'imagick=yes':'imagick=no';\""
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
safe = out.decode("utf-8", "replace").encode("ascii", "replace").decode("ascii")
(root / ".tmp" / "inspect-haly-images.log").write_text(safe, encoding="ascii")
print(safe, flush=True)
