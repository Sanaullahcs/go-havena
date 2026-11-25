<?php

/**
 * Replace teal label stubs with real Unsplash photos (Unsplash License).
 *
 * Usage: php scripts/download-seed-photos.php [--force] [--only=key1,key2]
 */

$force = in_array('--force', $argv, true);
$only = [];
foreach ($argv as $arg) {
    if (str_starts_with($arg, '--only=')) {
        $only = array_values(array_filter(array_map('trim', explode(',', substr($arg, 7)))));
    }
}
$dest = __DIR__.'/../storage/app/public/seed';
$mobile = dirname(__DIR__, 2).'/apps/mobile/assets/images/seed';

if (! is_dir($dest)) {
    mkdir($dest, 0775, true);
}
if (! is_dir($mobile)) {
    mkdir($mobile, 0775, true);
}

$photos = [
    'community-cover' => 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=2400&q=80',
    'amenity-pool' => 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=1400&q=80',
    'amenity-gym' => 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1400&q=80',
    'amenity-clubhouse' => 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=80',
    'listing-sofa' => 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1400&q=80',
    'listing-bike' => 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=2400&q=80',
    'listing-desk' => 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=1400&q=80',
    'listing-plants' => 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=1400&q=80',
    'listing-tv' => 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=1400&q=80',
    'listing-stroller' => 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1400&q=80',
    'event-bbq' => 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1400&q=80',
    'event-townhall' => 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1400&q=80',
    'notice-maintenance' => 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=1400&q=80',
    'alert-weather' => 'https://images.unsplash.com/photo-1605727216801-e27ce1d0cc28?auto=format&fit=crop&w=2400&q=80',
    'notice-security' => 'https://images.unsplash.com/photo-1582139329536-e7284fece509?auto=format&fit=crop&w=2400&q=80',
    'wellness-weight' => 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=2400&q=80',
    'wellness-exercise' => 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=2400&q=80',
    'wellness-stress' => 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=2400&q=80',
    'wellness-learning' => 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?auto=format&fit=crop&w=2400&q=80',
    'wellness-social' => 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=2400&q=80',
    'course-nutrition' => 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=2400&q=80',
    'course-meal-prep' => 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=2400&q=80',
    'course-exercise' => 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=2400&q=80',
    'course-home-workout' => 'https://images.unsplash.com/photo-1594381898411-846e7d193883?auto=format&fit=crop&w=2400&q=80',
    'course-breathing' => 'https://images.unsplash.com/photo-1554244933-d876deb6b2ff?auto=format&fit=crop&w=2400&q=80',
    'course-mindful' => 'https://images.unsplash.com/photo-1545389336-cf090694435e?auto=format&fit=crop&w=2400&q=80',
    'course-learning' => 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=2400&q=80',
    'course-goals' => 'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?auto=format&fit=crop&w=2400&q=80',
    'course-neighbors' => 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=2400&q=80',
    'course-communication' => 'https://images.unsplash.com/photo-1543269865-cbf427effbad?auto=format&fit=crop&w=2400&q=80',
    'event-yoga' => 'https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?auto=format&fit=crop&w=2400&q=80',
    'event-bootcamp' => 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?auto=format&fit=crop&w=2400&q=80',
    'event-cookies' => 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=2400&q=80',
    'event-coffee' => 'https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=2400&q=80',
    'feed-gym' => 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&w=2400&q=80',
    'business-cafe' => 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1400&q=80',
    'business-fitness' => 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=2400&q=80',
    'business-salon' => 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1400&q=80',
    'business-restaurant' => 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1400&q=80',
    'business-bakery' => 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1400&q=80',
    'business-grocery' => 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1400&q=80',
    'business-pharmacy' => 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=1400&q=80',
    'business-pets' => 'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?auto=format&fit=crop&w=1400&q=80',
    'business-bar' => 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=1400&q=80',
    'business-yoga' => 'https://images.unsplash.com/photo-1588286840104-8957b019727f?auto=format&fit=crop&w=2400&q=80',
    'business-florist' => 'https://images.unsplash.com/photo-1468327768560-75b778cbb551?auto=format&fit=crop&w=1400&q=80',
    'business-bookstore' => 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1400&q=80',
    'business-icecream' => 'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?auto=format&fit=crop&w=1400&q=80',
    'business-wine' => 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=1400&q=80',
    'business-laundry' => 'https://images.unsplash.com/photo-1545173168-9f1947eebb7f?auto=format&fit=crop&w=1400&q=80',
    'business-bike' => 'https://images.unsplash.com/photo-1571068316344-75bc76f77890?auto=format&fit=crop&w=2400&q=80',
    'business-sushi' => 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=1400&q=80',
    'business-brunch' => 'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=1400&q=80',
    'deal-pizza' => 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1400&q=80',
    'deal-coffee' => 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1400&q=80',
    'deal-spa' => 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1400&q=80',
    'feed-dog' => 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=1400&q=80',
    'feed-market' => 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=1400&q=80',
    'feed-harborwalk' => 'https://images.unsplash.com/photo-1563840111261-8b096fb63b65?auto=format&fit=crop&w=2400&q=80',
    'feed-run' => 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1600&h=1000&q=80',
    'feed-boxes' => 'https://images.unsplash.com/photo-1600518464441-9154a4dea21b?auto=format&fit=crop&w=1600&h=1000&q=80',
    'feed-skyline' => 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=2400&q=80',
    'feed-books' => 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=2400&q=80',
    'feed-kids' => 'https://images.unsplash.com/photo-1471286174890-9c112ffca468?auto=format&fit=crop&w=2400&q=80',
    'feed-garden' => 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&w=2400&q=80',
    'feed-bread' => 'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?auto=format&fit=crop&w=2400&q=80',
    'feed-keys' => 'https://images.pexels.com/photos/279810/pexels-photo-279810.jpeg?auto=compress&cs=tinysrgb&w=2400',
    'feed-recycle' => 'https://images.pexels.com/photos/802221/pexels-photo-802221.jpeg?auto=compress&cs=tinysrgb&w=2400',
    'feed-packages' => 'https://images.pexels.com/photos/4498136/pexels-photo-4498136.jpeg?auto=compress&cs=tinysrgb&w=2400',
    'feed-trivia' => 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=2400&q=80',
    'feed-dinner' => 'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?auto=format&fit=crop&w=2400&q=80',
    'feed-plumber' => 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?auto=format&fit=crop&w=2400&q=80',
    'feed-kids' => 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=2400&q=80',
    'feed-family' => 'https://images.unsplash.com/photo-1516627145497-ae6968895b74?auto=format&fit=crop&w=2400&q=80',
    'avatar-01' => 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
    'avatar-02' => 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
    'avatar-03' => 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=400&q=80',
    'avatar-04' => 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    'avatar-05' => 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80',
    'avatar-06' => 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80',
    'avatar-07' => 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    'avatar-08' => 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=400&q=80',
    'avatar-09' => 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=400&q=80',
    'avatar-10' => 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80',
    'avatar-11' => 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80',
    'avatar-12' => 'https://images.unsplash.com/photo-1463453091185-61582044d556?auto=format&fit=crop&w=400&q=80',
    'avatar-13' => 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=400&q=80',
    'avatar-14' => 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=400&q=80',
    'avatar-alex' => 'https://images.unsplash.com/photo-1507591064344-4c6ce005b128?auto=format&fit=crop&w=400&q=80',
    'avatar-admin' => 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80',
];

function downloadPhoto(string $url): ?string
{
    $headers = [
        'User-Agent: HavenaSeedDownloader/1.0',
        'Accept: image/jpeg,image/*,*/*',
    ];

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 40,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $type = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        curl_close($ch);
        if ($body !== false && $code >= 200 && $code < 300 && strlen($body) > 8000 && str_contains($type, 'image')) {
            return $body;
        }
    }

    $ctx = stream_context_create([
        'http' => [
            'header' => implode("\r\n", $headers)."\r\n",
            'follow_location' => 1,
            'timeout' => 40,
        ],
    ]);
    $body = @file_get_contents($url, false, $ctx);
    if (is_string($body) && strlen($body) > 8000) {
        return $body;
    }

    return null;
}

$downloaded = 0;
$skipped = 0;
$failed = 0;

if ($only !== []) {
    $photos = array_intersect_key($photos, array_flip($only));
}

foreach ($photos as $name => $url) {
    $outPath = $dest.'/'.$name.'.jpg';
    $exists = is_file($outPath);
    $size = $exists ? (int) filesize($outPath) : 0;
    $looksReal = $exists && $size >= 8000;
    $replaceListed = $only !== [] && in_array($name, $only, true);

    if ($looksReal && ! $force && ! $replaceListed) {
        $skipped++;
        $mobilePath = $mobile.'/'.$name.'.jpg';
        if (! is_file($mobilePath) || filesize($mobilePath) < 40000) {
            @copy($outPath, $mobilePath);
        }
        continue;
    }

    $body = downloadPhoto($url);
    if ($body === null) {
        fwrite(STDERR, "Failed: {$name}\n");
        $failed++;
        continue;
    }

    file_put_contents($outPath, $body);
    @copy($outPath, $mobile.'/'.$name.'.jpg');
    $downloaded++;
    fwrite(STDOUT, "Wrote {$name}.jpg (".strlen($body)." bytes)\n");
}

printf("Seed photos: %d downloaded, %d kept, %d failed.\n", $downloaded, $skipped, $failed);
exit($failed > 0 && $downloaded === 0 ? 1 : 0);
