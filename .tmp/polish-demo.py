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
# Keep this as one PHP string. Avoid bash $vars so plink/cmd does not eat them.
remote = r"""
cd /home/gohvena/public_html/prod_apis
php artisan tinker --execute="
\$img = '/storage/seed';
\$admin = DB::table('users')->where('phone', '+15555550200')->first();
\$alex = DB::table('users')->where('phone', '+15555550100')->first();
if (! \$admin || ! \$alex) { echo 'missing demo users'; return; }

DB::table('community_memberships')->where('user_id', \$admin->id)->where('community_id', '!=', 1)->delete();
DB::table('users')->where('id', \$alex->id)->update(['name' => 'Alex Rivera', 'status' => 'active', 'role' => 'resident', 'phone_verified_at' => now()]);
DB::table('users')->where('id', \$admin->id)->update(['name' => 'Jordan Hale', 'status' => 'active', 'role' => 'community_admin', 'community_admin_status' => 'approved', 'phone_verified_at' => now()]);
DB::table('profiles')->where('user_id', \$alex->id)->update(['display_name' => 'Alex Rivera', 'avatar_url' => \$img.'/avatar-alex.jpg', 'unit_number' => 'Apt 101', 'residence_type' => 'Two-bedroom', 'bio' => 'Resident at Florida Main Street. Weekend runner and farmers-market regular.']);
DB::table('profiles')->where('user_id', \$admin->id)->update(['display_name' => 'Jordan Hale', 'avatar_url' => \$img.'/avatar-admin.jpg', 'unit_number' => 'Management Office', 'residence_type' => 'Office', 'bio' => 'Community manager at Florida Main Street.']);
DB::table('community_memberships')->updateOrInsert(['user_id' => \$alex->id, 'community_id' => 1], ['role' => 'member', 'status' => 'approved', 'updated_at' => now()]);
DB::table('community_memberships')->updateOrInsert(['user_id' => \$admin->id, 'community_id' => 1], ['role' => 'admin', 'status' => 'approved', 'updated_at' => now()]);

\$amenityMap = [
  'Swimming Pool' => 'amenity-pool.jpg',
  'Fitness Center' => 'amenity-gym.jpg',
  'Community Hall' => 'amenity-clubhouse.jpg',
  'Tennis Court' => 'amenity-gym.jpg',
  'BBQ Terrace' => 'event-bbq.jpg',
  'Kids Playground' => 'listing-plants.jpg',
  'Meeting Room' => 'event-townhall.jpg',
  'Residents Lounge' => 'amenity-clubhouse.jpg',
  'Yoga Studio (Pending)' => 'wellness-exercise.jpg',
  'Guest Parking Bay (Pending)' => 'community-cover.jpg',
];
foreach (\$amenityMap as \$name => \$file) {
  DB::table('amenities')->where('community_id', 1)->where('name', \$name)->update(['image_url' => \$img.'/'.\$file, 'updated_at' => now()]);
}

\$listingMap = [
  'Sony 4K Smart TV - 55\"' => ['listing-tv.jpg'],
  'Professional Piano Lessons' => ['wellness-learning.jpg'],
  'IKEA Dining Table Set' => ['listing-desk.jpg'],
  '20% Off Homemade Baked Goods' => ['deal-coffee.jpg'],
  'Baby Crib - Gently Used' => ['listing-stroller.jpg'],
  'Mountain Bike - Trek Marlin 5' => ['listing-bike.jpg'],
];
foreach (\$listingMap as \$title => \$files) {
  \$urls = array_map(fn (\$f) => \$img.'/'.\$f, \$files);
  DB::table('listings')->where('community_id', 1)->where('title', \$title)->update([
    'images' => json_encode(\$urls),
    'status' => 'approved',
    'is_verified' => true,
    'approved_at' => now()->subDays(2),
    'updated_at' => now(),
  ]);
}

\$bizMap = [
  'The Daily Grind' => 'business-cafe.jpg',
  'Green Bowl' => 'listing-plants.jpg',
  \"Joe's Burger Bar\" => 'deal-pizza.jpg',
  'Zenith Fitness' => 'business-fitness.jpg',
];
foreach (\$bizMap as \$name => \$file) {
  DB::table('businesses')->where('community_id', 1)->where('name', \$name)->update(['image_url' => \$img.'/'.\$file, 'status' => 'approved', 'updated_at' => now()]);
}

\$postImages = ['feed-dog.jpg','feed-market.jpg','wellness-exercise.jpg','notice-maintenance.jpg','amenity-gym.jpg','listing-desk.jpg','event-bbq.jpg','amenity-pool.jpg','community-cover.jpg','deal-coffee.jpg'];
\$barePosts = DB::table('posts')->where('community_id', 1)->where(function (\$q) { \$q->whereNull('image_url')->orWhere('image_url',''); })->orderBy('id')->get(['id']);
foreach (\$barePosts as \$i => \$row) {
  DB::table('posts')->where('id', \$row->id)->update(['image_url' => \$img.'/'.\$postImages[\$i % count(\$postImages)], 'status' => 'approved', 'updated_at' => now()]);
}

\$dealImages = ['deal-coffee.jpg','business-fitness.jpg','deal-spa.jpg','deal-pizza.jpg','event-bbq.jpg'];
if (Schema::hasTable('deals')) {
  \$bareDeals = DB::table('deals')->where(function (\$q) { \$q->whereNull('image_url')->orWhere('image_url',''); })->orderBy('id')->get(['id']);
  foreach (\$bareDeals as \$i => \$row) {
    DB::table('deals')->where('id', \$row->id)->update(['image_url' => \$img.'/'.\$dealImages[\$i % count(\$dealImages)], 'updated_at' => now()]);
  }
}

\$noticeCovers = ['community-cover.jpg','notice-maintenance.jpg','event-townhall.jpg','alert-weather.jpg','amenity-gym.jpg','listing-plants.jpg','feed-market.jpg','business-cafe.jpg'];
\$bareNotices = DB::table('notices')->where('community_id', 1)->where(function (\$q) { \$q->whereNull('image_url')->orWhere('image_url','')->orWhere('image_url','not like','/storage/seed/%'); })->orderBy('id')->get(['id']);
foreach (\$bareNotices as \$i => \$row) {
  DB::table('notices')->where('id', \$row->id)->update(['image_url' => \$img.'/'.\$noticeCovers[\$i % count(\$noticeCovers)], 'updated_at' => now()]);
}

if (Schema::hasColumn('communities', 'image_url')) {
  DB::table('communities')->where('id', 1)->update(['image_url' => \$img.'/community-cover.jpg']);
}
if (Schema::hasColumn('communities', 'cover_image')) {
  DB::table('communities')->where('id', 1)->update(['cover_image' => \$img.'/community-cover.jpg']);
}
if (Schema::hasColumn('communities', 'cover_url')) {
  DB::table('communities')->where('id', 1)->update(['cover_url' => \$img.'/community-cover.jpg']);
}

echo 'admin memberships=', DB::table('community_memberships')->where('user_id', \$admin->id)->count(), PHP_EOL;
echo 'posts with image=', DB::table('posts')->where('community_id',1)->whereNotNull('image_url')->where('image_url','!=','')->count(), '/', DB::table('posts')->where('community_id',1)->count(), PHP_EOL;
echo 'listings with images=', DB::table('listings')->where('community_id',1)->where('images','!=','[]')->whereNotNull('images')->count(), '/', DB::table('listings')->where('community_id',1)->count(), PHP_EOL;
echo 'amenities with image=', DB::table('amenities')->where('community_id',1)->whereNotNull('image_url')->where('image_url','!=','')->count(), '/', DB::table('amenities')->where('community_id',1)->count(), PHP_EOL;
echo 'businesses with image=', DB::table('businesses')->where('community_id',1)->whereNotNull('image_url')->where('image_url','!=','')->count(), '/', DB::table('businesses')->where('community_id',1)->count(), PHP_EOL;
echo json_encode([
  'alex' => DB::table('profiles')->where('user_id', \$alex->id)->first(['display_name','avatar_url','unit_number']),
  'admin' => DB::table('profiles')->where('user_id', \$admin->id)->first(['display_name','avatar_url','unit_number']),
  'memberships' => DB::table('community_memberships')->whereIn('user_id', [\$alex->id, \$admin->id])->get(['user_id','community_id','role','status']),
], JSON_PRETTY_PRINT), PHP_EOL;
"
echo DONE
"""

cmd = [
    r"C:\Program Files\PuTTY\plink.exe",
    "-ssh",
    "-P",
    env["DEPLOY_SSH_PORT"],
    "-pw",
    env["DEPLOY_SSH_PASSWORD"],
    "-batch",
    "-hostkey",
    env.get("DEPLOY_SSH_HOSTKEY", ""),
    host,
    remote,
]
raise SystemExit(subprocess.call(cmd))
