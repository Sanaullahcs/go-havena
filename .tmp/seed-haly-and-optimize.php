<?php

use App\Models\Community;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

$community = Community::query()->where('name', 'like', '%Haly Tower%')->firstOrFail();
$adminId = (int) DB::table('community_memberships')
    ->where('community_id', $community->id)
    ->where('role', 'admin')
    ->where('status', 'approved')
    ->value('user_id');
if (! $adminId) {
    $adminId = (int) DB::table('users')->where('email', 'sana@gohavena.com')->value('id');
}

$publicSeed = public_path('storage/seed');
$thumbDir = storage_path('app/public/wellness/thumbs');
$bizDir = storage_path('app/public/businesses/haly');
File::ensureDirectoryExists($thumbDir);
File::ensureDirectoryExists($bizDir);
File::ensureDirectoryExists(public_path('storage/wellness'));
$thumbPublic = public_path('storage/wellness/thumbs');
if (! is_link($thumbPublic) && ! is_dir($thumbPublic)) {
    @symlink($thumbDir, $thumbPublic);
}

$optimize = function (string $src, string $dest) {
    $cmd = 'convert '.escapeshellarg($src).' -auto-orient -strip -resize 800x800> -sampling-factor 4:2:0 -quality 68 '.escapeshellarg($dest);
    exec($cmd, $out, $code);

    return $code === 0 && is_file($dest) && filesize($dest) > 0;
};

$optimized = 0;
foreach (glob($publicSeed.'/{course,wellness}-*.jpg', GLOB_BRACE) ?: [] as $file) {
    $tmp = $file.'.opt.jpg';
    $before = filesize($file);
    if ($optimize($file, $tmp) && filesize($tmp) < $before) {
        rename($tmp, $file);
        $optimized++;
        echo "opt ".basename($file)." {$before} -> ".filesize($file)."\n";
    } else {
        @unlink($tmp);
        echo "keep ".basename($file)." {$before}\n";
    }
}
echo "optimized_seed={$optimized}\n";

$ytCount = 0;
$lessons = DB::table('wellness_lessons')->whereNull('deleted_at')->get(['video_url', 'link_url']);
foreach ($lessons as $lesson) {
    $url = $lesson->link_url ?: $lesson->video_url;
    if (! $url || ! preg_match('/(?:youtube\\.com\\/(?:watch\\?(?:.*&)?v=|embed\\/|shorts\\/)|youtu\\.be\\/)([a-zA-Z0-9_-]{11})/', $url, $m)) {
        continue;
    }
    $id = $m[1];
    $dest = $thumbDir.'/'.$id.'.jpg';
    if (is_file($dest) && filesize($dest) > 1000) {
        $ytCount++;
        continue;
    }
    $tmp = $dest.'.tmp';
    $raw = @file_get_contents('https://img.youtube.com/vi/'.$id.'/mqdefault.jpg');
    if (! $raw) {
        echo "yt_fail {$id}\n";
        continue;
    }
    file_put_contents($tmp, $raw);
    if (! $optimize($tmp, $dest)) {
        rename($tmp, $dest);
    }
    @unlink($tmp);
    $ytCount++;
    echo "yt {$id} ".filesize($dest)."\n";
}
echo "yt_thumbs={$ytCount}\n";

$ht = public_path('storage/.htaccess');
if (! is_file($ht)) {
    file_put_contents($ht, "<IfModule mod_expires.c>\nExpiresActive On\nExpiresByType image/jpeg \"access plus 30 days\"\nExpiresByType image/png \"access plus 30 days\"\nExpiresByType image/webp \"access plus 30 days\"\n</IfModule>\n<IfModule mod_headers.c>\nHeader set Cache-Control \"public, max-age=2592000, immutable\"\n</IfModule>\n");
    echo "wrote_cache_headers=1\n";
}

$fetchPage = function (string $url): string {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 25,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        CURLOPT_HTTPHEADER => ['Accept: text/html,application/xhtml+xml'],
    ]);
    $body = curl_exec($ch) ?: '';
    curl_close($ch);

    return $body;
};

$fetchBinary = function (string $url): ?string {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 25,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    ]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code >= 400 || ! $body) {
        return null;
    }

    return $body;
};

$ogImage = function (string $html): ?string {
    if (preg_match('/<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']/i', $html, $m)) {
        return html_entity_decode($m[1], ENT_QUOTES);
    }
    if (preg_match('/<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']/i', $html, $m)) {
        return html_entity_decode($m[1], ENT_QUOTES);
    }
    if (preg_match('/<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']/i', $html, $m)) {
        return html_entity_decode($m[1], ENT_QUOTES);
    }

    return null;
};

$restaurants = [
    ['name' => 'Chaayé Khana', 'url' => 'https://www.chaayekhana.com/', 'address' => 'Haly Tower, DHA Phase 2, Lahore', 'slug' => 'chaaye-khana'],
    ['name' => 'Saudi Broast', 'url' => 'https://www.foodpanda.pk/chain/cn8bs/saudi-broast', 'address' => 'Haly Tower, DHA Phase 2, Lahore', 'slug' => 'saudi-broast'],
    ['name' => 'California Pizza', 'url' => 'https://www.foodpanda.pk/restaurant/f5ot/california-pizza-dha-f5ot', 'address' => '3rd Floor, DHA Haly Tower, Lahore', 'slug' => 'california-pizza'],
    ['name' => 'Ping Pong', 'url' => 'https://www.foodpanda.pk/restaurant/cvw3/ping-pong-dha-cvw3', 'address' => '3rd Floor, DHA Haly Tower, Lahore', 'slug' => 'ping-pong'],
    ['name' => 'Pret Brasserie', 'url' => 'https://www.foodpanda.pk/restaurant/d3km/pret-brasserie-dha-d3km', 'address' => 'DHA Haly Tower, Lahore', 'slug' => 'pret-brasserie'],
    ['name' => 'FoodGuy', 'url' => 'https://www.foodpanda.pk/restaurant/lxkw/foodguy-dha-lxkw', 'address' => 'DHA Haly Tower, Lahore', 'slug' => 'foodguy'],
    ['name' => 'Cuisine By Ayesha Kamil', 'url' => 'https://www.foodpanda.pk/restaurant/t4b6/cuisine-by-ayesha-kamil-dha-t4b6', 'address' => 'DHA Haly Tower, Lahore', 'slug' => 'cuisine-ayesha-kamil'],
    ['name' => 'Saadi Di Sajji', 'url' => 'https://www.foodpanda.pk/restaurant/q75o/saadi-di-sajji-dha-q75o', 'address' => 'DHA Haly Tower, Lahore', 'slug' => 'saadi-di-sajji'],
    ['name' => 'Paradise Restaurant', 'url' => 'https://www.foodpanda.pk/restaurant/cch9/paradise-restaurant-dha-cch9', 'address' => 'DHA Haly Tower, Lahore', 'slug' => 'paradise-restaurant'],
    ['name' => 'KAFI', 'url' => 'https://www.foodpanda.pk/restaurant/blxe/kafi-dha-phase-2', 'address' => 'DHA Haly Tower, Lahore', 'slug' => 'kafi'],
    ['name' => 'Majnoon Lebanese', 'url' => 'https://www.foodpanda.pk/restaurant/pmrp/majnoon-lebanese-dha-pmrp', 'address' => 'DHA Haly Tower, Lahore', 'slug' => 'majnoon-lebanese'],
    ['name' => 'Chips & Chopsticks', 'url' => 'https://www.foodpanda.pk/restaurant/y4s9/chips-and-chopsticks-dha-y4s9', 'address' => 'DHA Haly Tower, Lahore', 'slug' => 'chips-chopsticks'],
    ['name' => 'Rax Foods', 'url' => 'https://www.foodpanda.pk/restaurant/kggw/rax-foods-dha-kggw', 'address' => 'DHA Haly Tower, Lahore', 'slug' => 'rax-foods'],
    ['name' => 'Kruncheese', 'url' => 'https://www.foodpanda.pk/restaurant/ugui/kruncheese-dha', 'address' => 'DHA Haly Tower, Lahore', 'slug' => 'kruncheese'],
    ['name' => 'Khas Samosa', 'url' => 'https://khassamosa.com/', 'address' => 'Food Court, Haly Tower, Sector R, DHA Phase 2, Lahore', 'slug' => 'khas-samosa'],
];

$saved = 0;
$withPhoto = 0;
foreach ($restaurants as $row) {
    $imageRel = null;
    $html = $fetchPage($row['url']);
    $imgUrl = $html ? $ogImage($html) : null;
    if ($imgUrl) {
        $bin = $fetchBinary($imgUrl);
        if ($bin && strlen($bin) > 2000) {
            $rawPath = $bizDir.'/'.$row['slug'].'-raw.bin';
            $jpgPath = $bizDir.'/'.$row['slug'].'.jpg';
            file_put_contents($rawPath, $bin);
            if ($optimize($rawPath, $jpgPath) || copy($rawPath, $jpgPath)) {
                $imageRel = '/storage/businesses/haly/'.$row['slug'].'.jpg';
                $withPhoto++;
                echo "photo {$row['slug']} ".filesize($jpgPath)."\n";
            }
            @unlink($rawPath);
        } else {
            echo "photo_fail {$row['slug']}\n";
        }
    } else {
        echo "og_fail {$row['slug']}\n";
    }

    $desc = $row['name'].' at Haly Tower. '.$row['address'].' Menu / listing: '.$row['url'];
    DB::table('businesses')->updateOrInsert(
        ['community_id' => $community->id, 'name' => $row['name']],
        [
            'owner_id' => $adminId,
            'category' => 'Food',
            'description' => $desc,
            'address' => $row['address'],
            'phone' => null,
            'hours' => null,
            'amenities' => $row['url'],
            'image_url' => $imageRel,
            'status' => 'approved',
            'approved_at' => now(),
            'approved_by' => $adminId,
            'updated_at' => now(),
            'created_at' => now(),
        ]
    );
    $bizId = (int) DB::table('businesses')
        ->where('community_id', $community->id)
        ->where('name', $row['name'])
        ->value('id');

    DB::table('deals')->updateOrInsert(
        ['community_id' => $community->id, 'title' => $row['name'].' — Haly Tower'],
        [
            'created_by' => $adminId,
            'business_id' => $bizId,
            'vendor' => $row['name'],
            'description' => $desc,
            'type' => 'offer',
            'discount_label' => 'At Haly Tower',
            'original_price' => null,
            'discounted_price' => null,
            'promo_code' => null,
            'category' => 'Food',
            'location' => $row['address'],
            'image_url' => $imageRel,
            'is_featured' => in_array($row['slug'], ['chaaye-khana', 'khas-samosa', 'california-pizza'], true),
            'status' => 'active',
            'starts_at' => now(),
            'ends_at' => null,
            'updated_at' => now(),
            'created_at' => now(),
        ]
    );
    $saved++;
}

echo "community={$community->id}\n";
echo "restaurants={$saved} photos={$withPhoto}\n";
echo "biz_total=".DB::table('businesses')->where('community_id', $community->id)->whereNull('deleted_at')->count()."\n";
echo "deal_total=".DB::table('deals')->where('community_id', $community->id)->whereNull('deleted_at')->count()."\n";
