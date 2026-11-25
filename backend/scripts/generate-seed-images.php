<?php

/**
 * Ensure demo seed JPEGs exist under storage/app/public/seed.
 *
 * Never overwrite real photos with teal label placeholders.
 * Placeholders are only created when a file is missing (or is a tiny stub).
 *
 * Usage: php scripts/generate-seed-images.php [--force]
 *   --force  regenerate missing/tiny stubs only (still never clobber real photos)
 */

$force = in_array('--force', $argv, true);
$dest = __DIR__.'/../storage/app/public/seed';

/** Real demo photos are typically 50KB+; teal label stubs are ~12–20KB. */
const MIN_REAL_SEED_BYTES = 40000;

if (! is_dir($dest)) {
    mkdir($dest, 0775, true);
}

$whitelist = [
    'community-cover',
    'amenity-pool', 'amenity-gym', 'amenity-clubhouse',
    'listing-sofa', 'listing-bike', 'listing-desk', 'listing-plants', 'listing-tv', 'listing-stroller',
    'event-bbq', 'event-townhall', 'event-yoga', 'event-bootcamp', 'event-cookies', 'event-coffee',
    'notice-maintenance', 'notice-security', 'alert-weather',
    'wellness-weight', 'wellness-exercise', 'wellness-stress', 'wellness-learning', 'wellness-social',
    'course-nutrition', 'course-meal-prep', 'course-exercise', 'course-home-workout', 'course-breathing',
    'course-mindful', 'course-learning', 'course-goals', 'course-neighbors', 'course-communication',
    'feed-gym',
    'feed-skyline', 'feed-books', 'feed-kids', 'feed-garden', 'feed-bread',
    'feed-keys', 'feed-recycle', 'feed-packages', 'feed-trivia', 'feed-dinner', 'feed-plumber', 'feed-family',
    'business-cafe', 'business-fitness', 'business-salon', 'business-restaurant',
    'business-bakery', 'business-grocery', 'business-pharmacy', 'business-pets',
    'business-bar', 'business-yoga', 'business-florist', 'business-bookstore',
    'business-icecream', 'business-wine', 'business-laundry', 'business-bike',
    'business-sushi', 'business-brunch',
    'deal-pizza', 'deal-coffee', 'deal-spa',
    'feed-dog', 'feed-market',
];

$created = 0;
$skipped = 0;
$useGd = extension_loaded('gd');

foreach ($whitelist as $name) {
    $outPath = $dest.'/'.$name.'.jpg';
    $exists = is_file($outPath);
    $size = $exists ? (int) filesize($outPath) : 0;
    $isRealPhoto = $exists && $size >= MIN_REAL_SEED_BYTES;

    // Always keep real photos. Never overwrite them with gradient stubs.
    if ($isRealPhoto) {
        $skipped++;
        continue;
    }

    // Skip existing stubs unless --force (then replace stub with another stub only if still tiny).
    if ($exists && ! $force) {
        $skipped++;
        continue;
    }

    if ($useGd) {
        writeGradientPlaceholder($outPath, $name);
    } elseif (PHP_OS_FAMILY === 'Windows' && is_file(__DIR__.'/generate-seed-images.ps1')) {
        fwrite(STDERR, "GD unavailable — run scripts/generate-seed-images.ps1 on Windows.\n");
        exit(1);
    } else {
        fwrite(STDERR, "PHP GD extension is required to generate seed images on this platform.\n");
        exit(1);
    }

    $created++;
}

printf("Seed images: %d created, %d skipped (already exist).\n", $created, $skipped);

function writeGradientPlaceholder(string $outPath, string $name): void
{
    $palette = [
        [15, 61, 95],
        [13, 148, 136],
        [20, 184, 166],
        [209, 250, 245],
    ];

    $hash = crc32($name);
    [$r1, $g1, $b1] = $palette[$hash % count($palette)];
    [$r2, $g2, $b2] = $palette[($hash + 2) % count($palette)];

    $width = 960;
    $height = 600;
    $img = imagecreatetruecolor($width, $height);

    for ($y = 0; $y < $height; $y++) {
        $t = $y / max($height - 1, 1);
        $r = (int) ($r1 + ($r2 - $r1) * $t);
        $g = (int) ($g1 + ($g2 - $g1) * $t);
        $b = (int) ($b1 + ($b2 - $b1) * $t);
        $color = imagecolorallocate($img, $r, $g, $b);
        imageline($img, 0, $y, $width, $y, $color);
    }

    $white = imagecolorallocate($img, 255, 255, 255);
    $label = strtoupper(str_replace('-', ' ', $name));
    $font = 5;
    $textWidth = imagefontwidth($font) * strlen($label);
    $textHeight = imagefontheight($font);
    $x = (int) (($width - $textWidth) / 2);
    $y = (int) (($height - $textHeight) / 2);
    imagestring($img, $font, $x, $y, $label, $white);

    imagejpeg($img, $outPath, 78);
    imagedestroy($img);
}
