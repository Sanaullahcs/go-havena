<?php

/**
 * Replace teal label stubs with real Unsplash photos (Unsplash License).
 *
 * Usage: php scripts/download-seed-photos.php [--force]
 */

$force = in_array('--force', $argv, true);
$dest = __DIR__.'/../storage/app/public/seed';
$mobile = dirname(__DIR__, 2).'/apps/mobile/assets/images/seed';

if (! is_dir($dest)) {
    mkdir($dest, 0775, true);
}
if (! is_dir($mobile)) {
    mkdir($mobile, 0775, true);
}

$photos = [
    'community-cover' => 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1400&q=80',
    'amenity-pool' => 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=1400&q=80',
    'amenity-gym' => 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1400&q=80',
    'amenity-clubhouse' => 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=80',
    'listing-sofa' => 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1400&q=80',
    'listing-bike' => 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1400&q=80',
    'listing-desk' => 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=1400&q=80',
    'listing-plants' => 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=1400&q=80',
    'listing-tv' => 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=1400&q=80',
    'listing-stroller' => 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1400&q=80',
    'event-bbq' => 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1400&q=80',
    'event-townhall' => 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1400&q=80',
    'notice-maintenance' => 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=1400&q=80',
    'alert-weather' => 'https://images.unsplash.com/photo-1500673922987-e212871fec22?auto=format&fit=crop&w=1400&q=80',
    'wellness-weight' => 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1400&q=80',
    'wellness-exercise' => 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1400&q=80',
    'wellness-stress' => 'https://images.unsplash.com/photo-1545389336-cf090694435e?auto=format&fit=crop&w=1400&q=80',
    'wellness-learning' => 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?auto=format&fit=crop&w=1400&q=80',
    'wellness-social' => 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1400&q=80',
    'business-cafe' => 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1400&q=80',
    'business-fitness' => 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1400&q=80',
    'business-salon' => 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1400&q=80',
    'business-restaurant' => 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1400&q=80',
    'deal-pizza' => 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1400&q=80',
    'deal-coffee' => 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1400&q=80',
    'deal-spa' => 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1400&q=80',
    'feed-dog' => 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=1400&q=80',
    'feed-market' => 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=1400&q=80',
    'feed-harborwalk' => 'https://images.unsplash.com/photo-1501066928260-a15192e1f4da?auto=format&fit=crop&w=1600&h=1000&q=80',
    'feed-run' => 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1600&h=1000&q=80',
    'feed-boxes' => 'https://images.unsplash.com/photo-1600518464441-9154a4dea21b?auto=format&fit=crop&w=1600&h=1000&q=80',
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

foreach ($photos as $name => $url) {
    $outPath = $dest.'/'.$name.'.jpg';
    $exists = is_file($outPath);
    $size = $exists ? (int) filesize($outPath) : 0;
    $looksReal = $exists && $size >= 40000;

    if ($looksReal && ! $force) {
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
