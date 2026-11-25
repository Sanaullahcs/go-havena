<?php

/**
 * One-off: optimize generated demo images (resize + recompress) into the
 * public storage seed folder so the app serves small, fast JPEGs.
 *
 * Detects real image format by content (generated files may be PNG bytes with
 * a .jpg name) and only processes the known demo image set.
 *
 * Usage: php scripts/optimize-seed-images.php "<source-assets-dir>"
 */

$source = $argv[1] ?? null;
if (! $source || ! is_dir($source)) {
    fwrite(STDERR, 'Source dir not found: ' . var_export($source, true) . PHP_EOL);
    exit(1);
}

$dest = __DIR__ . '/../storage/app/public/seed';
if (! is_dir($dest)) {
    mkdir($dest, 0775, true);
}

// Only these demo images (basename without extension).
$whitelist = [
    'community-cover',
    'amenity-pool', 'amenity-gym', 'amenity-clubhouse',
    'listing-sofa', 'listing-bike', 'listing-desk', 'listing-plants', 'listing-tv', 'listing-stroller',
    'event-bbq', 'event-townhall', 'notice-maintenance', 'alert-weather',
    'wellness-weight', 'wellness-exercise', 'wellness-stress', 'wellness-learning', 'wellness-social',
    'business-cafe', 'business-fitness', 'business-salon', 'business-restaurant',
    'deal-pizza', 'deal-coffee', 'deal-spa',
    'feed-dog', 'feed-market',
];

$maxWidth = 1200;
$quality  = 72;

$totalIn = 0;
$totalOut = 0;
$count = 0;
$missing = [];

foreach ($whitelist as $name) {
    $src = null;
    foreach (['jpg', 'jpeg', 'png'] as $ext) {
        $candidate = rtrim($source, "\\/") . '/' . $name . '.' . $ext;
        if (is_file($candidate)) {
            $src = $candidate;
            break;
        }
    }

    if (! $src) {
        $missing[] = $name;
        continue;
    }

    $raw = file_get_contents($src);
    $inBytes = strlen($raw);
    $img = @imagecreatefromstring($raw);

    if (! $img) {
        fwrite(STDERR, "Decode failed: {$src}" . PHP_EOL);
        continue;
    }

    $w = imagesx($img);
    $h = imagesy($img);

    if ($w > $maxWidth) {
        $newW = $maxWidth;
        $newH = (int) round($h * ($maxWidth / $w));
        $resized = imagecreatetruecolor($newW, $newH);
        imagecopyresampled($resized, $img, 0, 0, 0, 0, $newW, $newH, $w, $h);
        imagedestroy($img);
        $img = $resized;
    }

    $outPath = $dest . '/' . $name . '.jpg';
    imagejpeg($img, $outPath, $quality);
    imagedestroy($img);

    $outBytes = filesize($outPath);
    $totalIn += $inBytes;
    $totalOut += $outBytes;
    $count++;

    printf("%-24s %6.0f KB -> %5.0f KB%s", $name . '.jpg', $inBytes / 1024, $outBytes / 1024, PHP_EOL);
}

printf(
    "%sOptimized %d/%d images: %.0f KB -> %.0f KB (%.0f%% smaller)%s",
    PHP_EOL,
    $count,
    count($whitelist),
    $totalIn / 1024,
    $totalOut / 1024,
    $totalIn > 0 ? (1 - $totalOut / $totalIn) * 100 : 0,
    PHP_EOL
);

if ($missing) {
    fwrite(STDERR, 'Missing sources: ' . implode(', ', $missing) . PHP_EOL);
}
