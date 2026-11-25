<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

$notice = DB::table('notices')->where('id', 81)->where('community_id', 52)->first();
if (! $notice) {
    echo "missing_notice\n";
    exit(1);
}

$body = <<<'TXT'
Welcome to Haly Tower in Sector R, DHA Phase 2, Lahore.

This is your building on Havena. Use the app for community notices, amenity bookings, neighbor messages, and the 3rd-floor food court.

Address
Haly Tower, Sector R, DHA Phase 2, Lahore. Food court and restaurants are on the 3rd floor.

Food court
These restaurants are listed under Deals. Open a deal for the menu, call, or directions.

• Chaaye Khana — Shop 2, 3rd Floor
  Daily 8:30 AM – 12:00 AM
  Call (042) 34550937

• Khas Samosa — Food Court, 3rd Floor
  Call 0301 1221125

• California Pizza — brand order line (042) 111 753 753

• Saudi Broast
• Ping Pong
• Pret Brasserie
• FoodGuy
• Cuisine By Ayesha Kamil
• Saadi Di Sajji
• Paradise Restaurant
• KAFI
• Majnoon Lebanese
• Chips & Chopsticks
• Rax Foods
• Kruncheese

How to use Havena at Haly Tower
• Home — building announcements at the top
• Deals — food-court restaurants, menus, and call
• Services — book community amenities
• Messages — reach neighbors and building admin

This is an ongoing welcome notice for residents of Haly Tower.
TXT;

$src = storage_path('app/public/notices/haly-welcome.jpg');
$public = public_path('storage/notices/haly-welcome.jpg');
File::ensureDirectoryExists(dirname($src));
File::ensureDirectoryExists(dirname($public));
if (is_file('/tmp/haly-welcome.jpg') && filesize('/tmp/haly-welcome.jpg') > 2000) {
    @copy('/tmp/haly-welcome.jpg', $src);
    echo 'copied_local '.filesize($src)."\n";
}
$before = is_file($src) ? filesize($src) : 0;

$tmp = $src.'.opt.jpg';
$cmd = 'convert '.escapeshellarg($src).' -auto-orient -strip -resize 960x640> -quality 68 -interlace Plane '.escapeshellarg($tmp);
exec($cmd, $out, $code);
if ($code === 0 && is_file($tmp) && filesize($tmp) > 2000) {
    rename($tmp, $src);
    @copy($src, $public);
    echo "optimized {$before} -> ".filesize($src)."\n";
} else {
    @unlink($tmp);
    echo "keep {$before}\n";
}

$ht = public_path('storage/.htaccess');
$rules = <<<'HT'
<IfModule mod_expires.c>
ExpiresActive On
ExpiresByType image/jpeg "access plus 30 days"
ExpiresByType image/png "access plus 30 days"
ExpiresByType image/webp "access plus 30 days"
</IfModule>
<IfModule mod_headers.c>
Header set Cache-Control "public, max-age=2592000"
</IfModule>
HT;
if (! is_file($ht) || ! str_contains((string) file_get_contents($ht), 'max-age=2592000')) {
    File::put($ht, $rules);
    echo "wrote_cache_headers=1\n";
} else {
    echo "cache_headers=ok\n";
}

@copy($src, $public);

DB::table('notices')->where('id', 81)->update([
    'body' => $body,
    'location' => 'Haly Tower, Sector R, DHA Phase 2, Lahore',
    'image_url' => '/storage/notices/haly-welcome.jpg',
    'is_pinned' => true,
    'status' => 'published',
    'review_status' => 'approved',
    'updated_at' => now(),
]);

$row = DB::table('notices')->where('id', 81)->first();
echo "updated id={$row->id} pin=".($row->is_pinned ? '1' : '0')." loc=".$row->location."\n";
echo "body_len=".strlen((string) $row->body)." img=".(is_file($src) ? filesize($src) : 0)."\n";
echo "done\n";
