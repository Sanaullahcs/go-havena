import os
import subprocess
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

os.environ["PYTHONUNBUFFERED"] = "1"

root = Path(r"D:\wamp64-330\www\go-havena")
src = Path(
    r"C:\Users\Sanaullah\.cursor\projects\d-wamp64-330-www-go-havena"
    r"\assets\ninjahr-event-bg.png"
)

W, H = 1280, 720
im = ImageOps.fit(
    Image.open(src).convert("RGB"),
    (W, H),
    method=Image.Resampling.LANCZOS,
    centering=(0.42, 0.48),
)
layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
draw = ImageDraw.Draw(layer)

for x in range(0, 820):
    t = 1 - (x / 820)
    alpha = int(205 * (t**1.15))
    draw.line([(x, 0), (x, H)], fill=(10, 24, 42, alpha))

for y in range(460, H):
    t = (y - 460) / 260
    alpha = int(150 * t)
    draw.line([(0, y), (W, y)], fill=(8, 20, 36, alpha))

bold = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 86)
sub = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 26)
meta = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 22)
pill_font = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 16)

x0, y0 = 64, 168
pill = "LIVE DEMO"
pb = draw.textbbox((0, 0), pill, font=pill_font)
pw, ph = pb[2] - pb[0], pb[3] - pb[1]
pad_x, pad_y = 16, 8
draw.rounded_rectangle(
    (x0, y0, x0 + pw + pad_x * 2, y0 + ph + pad_y * 2),
    radius=20,
    fill=(20, 184, 166, 230),
)
draw.text((x0 + pad_x, y0 + pad_y - 1), pill, font=pill_font, fill=(11, 36, 64, 255))

title = "NinjaHR"
draw.text((x0, y0 + 58), title, font=bold, fill=(255, 255, 255, 255))

line_y = y0 + 168
draw.rounded_rectangle((x0, line_y, x0 + 72, line_y + 4), radius=2, fill=(20, 184, 166, 255))

draw.text((x0, line_y + 22), "In-person product walkthrough", font=sub, fill=(226, 238, 248, 245))
draw.text((x0, line_y + 64), "Thu 24 Sep  ·  4:00 – 6:00 PM", font=meta, fill=(255, 255, 255, 235))
draw.text((x0, line_y + 98), "Haly Tower  ·  3rd Floor Food Court", font=meta, fill=(196, 214, 230, 230))

out = Image.alpha_composite(im.convert("RGBA"), layer).convert("RGB")
buf = BytesIO()
out.save(buf, "JPEG", quality=80, optimize=True, progressive=True)
jpg_bytes = buf.getvalue()
local = root / ".tmp" / "haly-ninjahr-v2.jpg"
local.write_bytes(jpg_bytes)
print(f"cover {out.size[0]}x{out.size[1]} {len(jpg_bytes)}", flush=True)

php = r"""
<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

$destDir = storage_path('app/public/notices');
File::ensureDirectoryExists($destDir);
$dest = $destDir.'/haly-ninjahr-v2.jpg';
if (! @copy('/tmp/haly-ninjahr-v2.jpg', $dest) || filesize($dest) < 1000) {
    echo "image_copy_failed\n";
    exit(1);
}
@chmod($dest, 0644);
$publicDir = public_path('storage/notices');
File::ensureDirectoryExists($publicDir);
@copy($dest, $publicDir.'/haly-ninjahr-v2.jpg');

$body = <<<'TXT'
Join a short in-person walkthrough of NinjaHR at Haly Tower.

NinjaHR is an all-in-one HR platform for office teams: attendance, leave approvals, payroll, performance, and a mobile employee app.

This session is for HR leads, office managers, and shop owners in the building. We will walk through the manager dashboard and the employee phone app, then take questions.

Thursday, 24 September · 4:00–6:00 PM
3rd Floor Food Court, Haly Tower, DHA Phase 2

Website: https://ninjahr.ai/

RSVP in the app so we can hold a seat. Walk-ins are welcome if space remains.
TXT;

$updated = DB::table('notices')->where('id', 82)->update([
    'title' => 'NinjaHR Live Demo',
    'body' => $body,
    'location' => '3rd Floor Food Court, Haly Tower, DHA Phase 2',
    'image_url' => '/storage/notices/haly-ninjahr-v2.jpg',
    'updated_at' => now(),
]);

$row = DB::table('notices')->where('id', 82)->first();
echo "updated={$updated}\n";
echo "title=".$row->title."\n";
echo "img=".$row->image_url." size=".filesize($dest)."\n";
echo "date=".$row->event_date." ".$row->event_time."-".$row->event_time_end."\n";
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
    [*common, "cat > /tmp/haly-ninjahr-v2.jpg"],
    input=jpg_bytes,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    timeout=60,
)
if put_img.returncode != 0:
    raise SystemExit(put_img.stdout.decode("ascii", "replace"))

put_php = subprocess.run(
    [*common, "cat > /tmp/update-haly-ninjahr-cover.php"],
    input=php.replace("\r\n", "\n").encode("utf-8"),
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    timeout=30,
)
if put_php.returncode != 0:
    raise SystemExit(put_php.stdout.decode("ascii", "replace"))

remote = (
    "sed -i 's/\\r$//' /tmp/update-haly-ninjahr-cover.php; "
    f"cd {api}; php artisan tinker --execute=\"require '/tmp/update-haly-ninjahr-cover.php';\"; "
    "rm -f /tmp/update-haly-ninjahr-cover.php /tmp/haly-ninjahr-v2.jpg"
)
out_text = subprocess.check_output([*common, remote], stderr=subprocess.STDOUT, timeout=120)
text = out_text.decode("utf-8", "replace").encode("ascii", "replace").decode("ascii")
(root / ".tmp" / "update-haly-ninjahr-cover.log").write_text(text, encoding="ascii")
print(text, flush=True)
