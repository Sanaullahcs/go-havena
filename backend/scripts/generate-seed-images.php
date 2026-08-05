<?php

/**
 * Generate lightweight placeholder JPEGs for demo content when source assets
 * are not available. Skips files that already exist.
 *
 * Usage: php scripts/generate-seed-images.php [--force]
 */

$force = in_array('--force', $argv, true);
$dest = __DIR__.'/../storage/app/public/seed';

if (! is_dir($dest)) {
    mkdir($dest, 0775, true);
}

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

$created = 0;
$skipped = 0;
$useGd = extension_loaded('gd');

foreach ($whitelist as $name) {
    $outPath = $dest.'/'.$name.'.jpg';
    if (! $force && is_file($outPath)) {
        $skipped++;
        continue;
    }

    if ($useGd) {
        writeGradientPlaceholder($outPath, $name);
    } else {
        file_put_contents($outPath, minimalDemoJpeg());
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

/** Small valid JPEG used when PHP GD is unavailable (e.g. default XAMPP). */
function minimalDemoJpeg(): string
{
    return base64_decode(
        '/9j/4AAQSkZJRgABAQEASABIAAD/2wCEAAkGBxISEhUQEhIVFhUVFRUVFRUVFRUWFhUV' .
        'FRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OGxAQGy0lHyUtLS0t' .
        'LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAKgBLAMB' .
        'IQMBIgACEQEDEQH/xAAXAAEBAQEAAAAAAAAAAAAAAAAAAQID/8QAFhEBAQEAAAAAAAAA' .
        'AAAAAAAAAAAB/9oADAMBAAIQAxAAAAG6P//EABYQAQEBAAAAAAAAAAAAAAAAAAABEf/aAA' .
        'gBAQABBQL/AP/EABYRAQEBAAAAAAAAAAAAAAAAAAARAf/aAAgBAwEBPwFyP//EABYRAQEB' .
        'AAAAAAAAAAAAAAAAAAARAf/aAAgBAgEBPwFyP//EABgQAAIDAAAAAAAAAAAAAAAAAAAA' .
        'AVFx/9oACAEBAAE/AI7/AP/EABYQAQEBAAAAAAAAAAAAAAAAAAARAf/aAAgBAQABPxAyn//Z',
        true
    ) ?: '';
}
