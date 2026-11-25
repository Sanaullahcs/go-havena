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
out_dir = root / ".tmp" / "haly-welcome"
out_dir.mkdir(parents=True, exist_ok=True)
jpg_path = out_dir / "haly-welcome.jpg"

im = Image.open(src).convert("RGB")
im.thumbnail((1920, 1280), Image.Resampling.LANCZOS)
buf = BytesIO()
im.save(buf, "JPEG", quality=88, optimize=True, progressive=True)
jpg_bytes = buf.getvalue()
jpg_path.write_bytes(jpg_bytes)
print(f"image {im.size[0]}x{im.size[1]} {len(jpg_bytes)}", flush=True)

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

put = subprocess.run(
    [*common, "cat > /tmp/haly-welcome.jpg"],
    input=jpg_bytes,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    timeout=90,
)
if put.returncode != 0:
    raise SystemExit(put.stdout.decode("ascii", "replace"))

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
$dest = $destDir.'/haly-welcome.jpg';
if (! @copy('/tmp/haly-welcome.jpg', $dest) || ! is_file($dest) || filesize($dest) < 1000) {
    echo "image_copy_failed\n";
    exit(1);
}
@chmod($dest, 0644);

$publicNotices = public_path('storage/notices');
File::ensureDirectoryExists($publicNotices);
if (! is_file($publicNotices.'/haly-welcome.jpg')) {
    @copy($dest, $publicNotices.'/haly-welcome.jpg');
}

$imageRel = '/storage/notices/haly-welcome.jpg';
$title = 'Welcome to Haly Tower';
$body = 'Welcome to Haly Tower. Use Havena for community notices, amenity booking, the food-court deals on the 3rd floor, and messages with neighbors. The restaurants and services in this building are listed in Deals.';

$payload = [
    'author_id' => $adminId,
    'title' => $title,
    'category' => 'general',
    'body' => $body,
    'location' => 'Haly Tower, DHA Phase 2, Lahore',
    'image_url' => $imageRel,
    'event_date' => now()->addYear()->toDateString(),
    'event_time' => null,
    'event_time_end' => null,
    'event_capacity' => null,
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
    $payload['requires_rsvp'] = false;
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
echo "community={$cid} ".$community->name."\n";
echo "admin={$adminId}\n";
echo "title=".$row->title."\n";
echo "status=".$row->status." review=".$row->review_status." pin=".($row->is_pinned ? '1' : '0')."\n";
echo "date=".$row->event_date." img=".$row->image_url."\n";
echo "filesize=".filesize($dest)." public=".(is_file($publicNotices.'/haly-welcome.jpg') ? filesize($publicNotices.'/haly-welcome.jpg') : 0)."\n";
echo "published_haly=".DB::table('notices')->where('community_id', $cid)->where('status', 'published')->whereNull('deleted_at')->count()."\n";
"""

php_bytes = php.replace("\r\n", "\n").encode("utf-8")
put_php = subprocess.run(
    [*common, "cat > /tmp/seed-haly-welcome.php"],
    input=php_bytes,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    timeout=30,
)
if put_php.returncode != 0:
    raise SystemExit(put_php.stdout.decode("ascii", "replace"))

remote = (
    "sed -i 's/\\r$//' /tmp/seed-haly-welcome.php; "
    f"cd {api}; php artisan tinker --execute=\"require '/tmp/seed-haly-welcome.php';\"; "
    "rm -f /tmp/seed-haly-welcome.php /tmp/haly-welcome.jpg"
)
out = subprocess.check_output([*common, remote], stderr=subprocess.STDOUT, timeout=120)
text = out.decode("utf-8", "replace").encode("ascii", "replace").decode("ascii")
(root / ".tmp" / "seed-haly-welcome.log").write_text(text, encoding="ascii")
print(text, flush=True)
