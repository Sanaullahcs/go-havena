import os
import subprocess
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps

os.environ["PYTHONUNBUFFERED"] = "1"

root = Path(r"D:\wamp64-330\www\go-havena")
src = Path(
    r"C:\Users\Sanaullah\.cursor\projects\d-wamp64-330-www-go-havena\assets"
    r"\c__Users_Sanaullah_AppData_Roaming_Cursor_User_workspaceStorage_"
    r"2494e3549dd0de016244d195d12dbd2a_images_image-292aa57e-35c9-47d2-9129-3849b3ebf7da.png"
)

im = Image.open(src).convert("RGB")
im = ImageOps.crop(im, border=8)
# Landscape cover for Happening Soon + event hero
target_w, target_h = 1280, 720
fitted = ImageOps.fit(im, (target_w, target_h), method=Image.Resampling.LANCZOS, centering=(0.5, 0.42))
buf = BytesIO()
fitted.save(buf, "JPEG", quality=78, optimize=True, progressive=True)
jpg_bytes = buf.getvalue()
out = root / ".tmp" / "haly-ninjahr.jpg"
out.write_bytes(jpg_bytes)
print(f"cover {fitted.size[0]}x{fitted.size[1]} {len(jpg_bytes)}", flush=True)

php = r"""
<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;

$community = DB::table('communities')->where('name', 'like', '%Haly Tower%')->first();
if (! $community) {
    echo "missing_community\n";
    exit(1);
}
$cid = (int) $community->id;

$adminId = (int) (DB::table('community_memberships')
    ->where('community_id', $cid)
    ->whereIn('role', ['admin', 'community_admin'])
    ->where('status', 'approved')
    ->value('user_id') ?: 0);
if (! $adminId) {
    $adminId = (int) (DB::table('users')->where('email', 'sana@gohavena.com')->value('id') ?: 0);
}

$destDir = storage_path('app/public/notices');
File::ensureDirectoryExists($destDir);
$dest = $destDir.'/haly-ninjahr.jpg';
if (! @copy('/tmp/haly-ninjahr.jpg', $dest) || filesize($dest) < 1000) {
    echo "image_copy_failed\n";
    exit(1);
}
@chmod($dest, 0644);
$publicDir = public_path('storage/notices');
File::ensureDirectoryExists($publicDir);
@copy($dest, $publicDir.'/haly-ninjahr.jpg');

$title = 'NinjaHR Live Demo at Haly Tower';
$body = <<<'TXT'
See NinjaHR in person at Haly Tower.

NinjaHR (ninjahr.ai) is an all-in-one HR platform for office teams: attendance, leave approvals, payroll, performance, and a mobile employee app.

This walkthrough is for HR leads, office managers, and shop owners in the building. We will show the manager dashboard and the employee phone app, then take questions.

What we will cover
• Attendance, leaves, and one-click approvals
• Auto payroll synced from attendance
• Performance and evaluation views
• Employee self-service on mobile

Website
https://ninjahr.ai/

RSVP in the app so we can set seats. Walk-ins are welcome if space remains.
TXT;

$payload = [
    'author_id' => $adminId,
    'title' => $title,
    'category' => 'event',
    'body' => $body,
    'location' => '3rd Floor Food Court, Haly Tower, DHA Phase 2',
    'image_url' => '/storage/notices/haly-ninjahr.jpg',
    'event_date' => '2026-09-24',
    'event_time' => '16:00',
    'event_time_end' => '18:00',
    'status' => 'published',
    'review_status' => 'approved',
    'is_global' => false,
    'approved_by' => $adminId ?: null,
    'approved_at' => now(),
    'published_at' => now(),
    'updated_at' => now(),
    'deleted_at' => null,
    'rejection_reason' => null,
    'scheduled_at' => null,
];
if (Schema::hasColumn('notices', 'is_pinned')) {
    $payload['is_pinned'] = true;
}
if (Schema::hasColumn('notices', 'requires_rsvp')) {
    $payload['requires_rsvp'] = true;
}
if (Schema::hasColumn('notices', 'event_capacity')) {
    $payload['event_capacity'] = 40;
}
if (Schema::hasColumn('notices', 'audience_type')) {
    $payload['audience_type'] = 'all';
}

$existing = DB::table('notices')
    ->where('community_id', $cid)
    ->where('title', $title)
    ->whereNull('deleted_at')
    ->first();

if ($existing) {
    DB::table('notices')->where('id', $existing->id)->update($payload);
    $id = (int) $existing->id;
    echo "updated {$id}\n";
} else {
    $payload['community_id'] = $cid;
    $payload['created_at'] = now();
    $id = (int) DB::table('notices')->insertGetId($payload);
    echo "created {$id}\n";
}

$row = DB::table('notices')->where('id', $id)->first();
echo "title=".$row->title."\n";
echo "cat=".$row->category." status=".$row->status." review=".$row->review_status." pin=".($row->is_pinned ? '1' : '0')."\n";
echo "date=".$row->event_date." ".$row->event_time."-".$row->event_time_end."\n";
echo "loc=".$row->location." rsvp=".($row->requires_rsvp ? '1' : '0')." cap=".$row->event_capacity."\n";
echo "img=".$row->image_url." size=".filesize($dest)."\n";
echo "events=".DB::table('notices')->where('community_id', $cid)->where('category', 'event')->where('status', 'published')->whereNull('deleted_at')->count()."\n";
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
    [*common, "cat > /tmp/haly-ninjahr.jpg"],
    input=jpg_bytes,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    timeout=60,
)
if put_img.returncode != 0:
    raise SystemExit(put_img.stdout.decode("ascii", "replace"))

put_php = subprocess.run(
    [*common, "cat > /tmp/seed-haly-ninjahr-event.php"],
    input=php.replace("\r\n", "\n").encode("utf-8"),
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    timeout=30,
)
if put_php.returncode != 0:
    raise SystemExit(put_php.stdout.decode("ascii", "replace"))

remote = (
    "sed -i 's/\\r$//' /tmp/seed-haly-ninjahr-event.php; "
    f"cd {api}; php artisan tinker --execute=\"require '/tmp/seed-haly-ninjahr-event.php';\"; "
    "rm -f /tmp/seed-haly-ninjahr-event.php /tmp/haly-ninjahr.jpg"
)
out_text = subprocess.check_output([*common, remote], stderr=subprocess.STDOUT, timeout=120)
text = out_text.decode("utf-8", "replace").encode("ascii", "replace").decode("ascii")
(root / ".tmp" / "seed-haly-ninjahr-event.log").write_text(text, encoding="ascii")
print(text, flush=True)
