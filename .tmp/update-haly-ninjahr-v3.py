import os
import subprocess
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw

os.environ["PYTHONUNBUFFERED"] = "1"

root = Path(r"D:\wamp64-330\www\go-havena")
src = Path(
    r"C:\Users\Sanaullah\.cursor\projects\d-wamp64-330-www-go-havena"
    r"\assets\ninjahr-portal-app-hero.png"
)

im = Image.open(src).convert("RGB")
layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
draw = ImageDraw.Draw(layer)
w, h = im.size
for y in range(int(h * 0.62), h):
    t = (y - h * 0.62) / (h * 0.38)
    draw.line([(0, y), (w, y)], fill=(8, 18, 32, int(120 * t)))

out = Image.alpha_composite(im.convert("RGBA"), layer).convert("RGB")
buf = BytesIO()
out.save(buf, "JPEG", quality=82, optimize=True, progressive=True)
jpg_bytes = buf.getvalue()
local = root / ".tmp" / "haly-ninjahr-v3.jpg"
local.write_bytes(jpg_bytes)
print(f"cover {out.size[0]}x{out.size[1]} {len(jpg_bytes)}", flush=True)

php = r"""
<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

$destDir = storage_path('app/public/notices');
File::ensureDirectoryExists($destDir);
$dest = $destDir.'/haly-ninjahr-v3.jpg';
if (! @copy('/tmp/haly-ninjahr-v3.jpg', $dest) || filesize($dest) < 1000) {
    echo "image_copy_failed\n";
    exit(1);
}
@chmod($dest, 0644);
$publicDir = public_path('storage/notices');
File::ensureDirectoryExists($publicDir);
@copy($dest, $publicDir.'/haly-ninjahr-v3.jpg');

$body = <<<'TXT'
See the NinjaHR portal and mobile app in person at Haly Tower.

On the laptop we will walk through the manager portal: attendance, leaves, approvals, payroll, and performance. On the phone we will open the employee app for check-in, leave requests, and self-service.

This session is for HR leads, office managers, and shop owners in the building. Questions at the end.

Thursday, 24 September · 4:00–6:00 PM
3rd Floor Food Court, Haly Tower, DHA Phase 2

Website: https://ninjahr.ai/

RSVP in the app so we can hold a seat. Walk-ins are welcome if space remains.
TXT;

$updated = DB::table('notices')->where('id', 82)->update([
    'title' => 'NinjaHR Live Demo',
    'body' => $body,
    'image_url' => '/storage/notices/haly-ninjahr-v3.jpg',
    'updated_at' => now(),
]);

$row = DB::table('notices')->where('id', 82)->first();
echo "updated={$updated}\n";
echo "title=".$row->title."\n";
echo "img=".$row->image_url." size=".filesize($dest)."\n";
"""

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
    [*common, "cat > /tmp/haly-ninjahr-v3.jpg"],
    input=jpg_bytes,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    timeout=60,
)
if put_img.returncode != 0:
    raise SystemExit(put_img.stdout.decode("ascii", "replace"))

put_php = subprocess.run(
    [*common, "cat > /tmp/update-haly-ninjahr-v3.php"],
    input=php.replace("\r\n", "\n").encode("utf-8"),
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    timeout=30,
)
if put_php.returncode != 0:
    raise SystemExit(put_php.stdout.decode("ascii", "replace"))

remote = (
    "sed -i 's/\\r$//' /tmp/update-haly-ninjahr-v3.php; "
    f"cd {api}; php artisan tinker --execute=\"require '/tmp/update-haly-ninjahr-v3.php';\"; "
    "rm -f /tmp/update-haly-ninjahr-v3.php /tmp/haly-ninjahr-v3.jpg"
)
out_text = subprocess.check_output([*common, remote], stderr=subprocess.STDOUT, timeout=120)
print(out_text.decode("utf-8", "replace").encode("ascii", "replace").decode("ascii"), flush=True)
