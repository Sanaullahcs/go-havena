<?php

/**
 * Download landscape feed photos only (does not touch amenity/avatar/listing art).
 *
 * Usage: php scripts/download-feed-photos.php [--force]
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
    'feed-harborwalk' => [
        'https://images.unsplash.com/photo-1570784859790-6ba01080ea14?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1556075798-4825dfaaf498?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?auto=format&fit=crop&w=1920&h=1200&q=80',
    ],
    'feed-run' => [
        'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1486218119243-13883505764c?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?auto=format&fit=crop&w=1920&h=1200&q=80',
    ],
    'feed-boxes' => [
        'https://images.unsplash.com/photo-1534723452862-4c874018d66d?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1607346256330-dee7af15f7c5?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1920&h=1200&q=80',
    ],
    'feed-dog' => [
        'https://images.unsplash.com/photo-1601758174114-e711c0cbaa69?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1611255802646-43c8690b8e3b?auto=format&fit=crop&w=1920&h=1200&q=80',
    ],
    'feed-market' => [
        'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=1600&q=80',
    ],
    'feed-plumber' => [
        'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=1920&h=1200&q=80',
    ],
    'feed-gym' => [
        'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1920&h=1200&q=80',
    ],
    'feed-garden' => [
        'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1466692476866-aef1dfb1e648?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1600&q=80',
    ],
    'feed-pizza' => [
        'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=1920&h=1200&q=80',
    ],
    'feed-books' => [
        'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1920&h=1200&q=80',
    ],
    'feed-rowing' => [
        'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1530549387789-4c1017266635?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1502680390469-be75c86b339f?auto=format&fit=crop&w=1920&h=1200&q=80',
    ],
    'feed-sowa' => [
        'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1499781350541-7783f6c6a0c8?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=1920&h=1200&q=80',
    ],
    'feed-package' => [
        'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1556740738-b6a63d7f4f53?auto=format&fit=crop&w=1920&h=1200&q=80',
    ],
    'feed-kids' => [
        'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1588072432836-e10032774343?auto=format&fit=crop&w=1920&h=1200&q=80',
    ],
    'feed-sunset' => [
        'https://images.unsplash.com/photo-1496568816309-51d7c20e3b21?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&h=1200&q=80',
    ],
    'feed-snow' => [
        'https://images.unsplash.com/photo-1483664852095-d6cc6870703f?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1517299321609-52687d1bc55a?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1418985991508-e47386d170a2?auto=format&fit=crop&w=1920&h=1200&q=80',
    ],
    'feed-greenway' => [
        'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1920&h=1200&q=80',
    ],
    'feed-coffee' => [
        'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1498804103079-a6351b050096?auto=format&fit=crop&w=1920&h=1200&q=80',
    ],
    'feed-skyline' => [
        'https://images.unsplash.com/photo-1501979376757-77ed285dd3b4?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1570784859790-6ba01080ea14?auto=format&fit=crop&w=1920&h=1200&q=80',
        'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=1920&h=1200&q=80',
    ],
];

$mustReplace = [
    'feed-harborwalk' => true,
    'feed-run' => true,
    'feed-boxes' => true,
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
        if ($body !== false && $code >= 200 && $code < 300 && strlen($body) > 80000 && str_contains($type, 'image')) {
            return $body;
        }
    }

    return null;
}

$downloaded = 0;
$skipped = 0;
$failed = 0;

foreach ($photos as $name => $urls) {
    $outPath = $dest.'/'.$name.'.jpg';
    $exists = is_file($outPath);
    $size = $exists ? (int) filesize($outPath) : 0;
    $looksReal = $exists && $size >= 80000;
    $replace = $force || isset($mustReplace[$name]) || ! $looksReal;

    if (! $replace) {
        $skipped++;
        $mobilePath = $mobile.'/'.$name.'.jpg';
        if (! is_file($mobilePath) || filesize($mobilePath) < 80000) {
            @copy($outPath, $mobilePath);
        }
        fwrite(STDOUT, "Kept {$name}.jpg ({$size} bytes)\n");
        continue;
    }

    $body = null;
    foreach ($urls as $url) {
        $body = downloadPhoto($url);
        if ($body !== null) {
            break;
        }
        fwrite(STDERR, "  miss {$name}: ".substr($url, 0, 72)."\n");
    }

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

printf("Feed photos: %d downloaded, %d kept, %d failed.\n", $downloaded, $skipped, $failed);
exit($failed > 0 ? 1 : 0);
