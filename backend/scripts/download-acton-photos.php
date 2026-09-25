<?php

/**
 * Build the image set for the Village of Nagog Woods (Acton, MA) seed data.
 *
 * Two kinds of sources:
 *   1. Wikimedia Commons photographs of the actual Acton locations referenced in
 *      the seed copy (town hall, rail trails, South Acton station, Great Hill,
 *      Faulkner Homestead, the village libraries). Freely licensed — see
 *      storage/app/public/seed/acton/CREDITS.txt written by this script.
 *   2. Seasonal / amenity stock (Unsplash License) for the things Commons has no
 *      good Acton photo of, such as the lap pool or the EV bays.
 *
 * Every entry also names a `local` fallback from the existing /storage/seed set,
 * so a failed download degrades to a sensible image instead of a broken one.
 *
 * Usage: php scripts/download-acton-photos.php [--force] [--only=key1,key2]
 */

$force = in_array('--force', $argv, true);
$only = [];
foreach ($argv as $arg) {
    if (str_starts_with($arg, '--only=')) {
        $only = array_values(array_filter(array_map('trim', explode(',', substr($arg, 7)))));
    }
}

$seedDir = __DIR__.'/../storage/app/public/seed';
$dest = $seedDir.'/acton';
$mobile = dirname(__DIR__, 2).'/apps/mobile/assets/images/seed/acton';

foreach ([$dest, $mobile] as $dir) {
    if (! is_dir($dir)) {
        mkdir($dir, 0775, true);
    }
}

/**
 * Wikimedia only serves the original reliably (its thumb endpoint rejects
 * scripted requests), so pull the full file and downscale locally.
 */
function commons(string $hashPath, string $encodedName): array
{
    return ["https://upload.wikimedia.org/wikipedia/commons/{$hashPath}/{$encodedName}"];
}

function unsplash(string $id, int $width = 1800): string
{
    return "https://images.unsplash.com/{$id}?auto=format&fit=crop&w={$width}&q=80";
}

/*
 * key => [sources, local fallback, credit]
 */
$photos = [
    /* ── Real Acton, Massachusetts (Wikimedia Commons) ── */
    'acton-fall-woods' => [
        commons('f/f6', 'Acton_Massachusetts_nature_area_October_2015.jpg'),
        'community-cover',
        'Acton, Massachusetts nature area, October 2015 — Victor Grigas, CC BY-SA',
    ],
    'acton-wetlands' => [
        commons('1/1b', 'Acton_Massachusetts_wetlands.jpg'),
        'feed-garden',
        'Acton, Massachusetts wetlands — Victor Grigas, CC BY-SA',
    ],
    'acton-town-hall' => [
        commons('7/72', 'ActonTownHall.jpg'),
        'event-townhall',
        'Acton Town Hall, 472 Main Street — public domain',
    ],
    'acton-main-street' => [
        commons('2/2d', 'Main_Street%2C_Acton_MA.jpg'),
        'community-cover',
        'Main Street (Route 27), Acton — John Phelan, CC BY-SA 4.0',
    ],
    'acton-plaza' => [
        commons('3/3e', 'Acton_Plaza%2C_Acton_MA.jpg'),
        'business-grocery',
        'Acton Plaza, Great Road — John Phelan, CC BY-SA 3.0',
    ],
    'east-acton-green' => [
        commons('c/c5', 'East_Acton_Village_Green%2C_East_Acton_MA.jpg'),
        'feed-garden',
        'East Acton Village Green — John Phelan, CC BY-SA 4.0',
    ],
    'rail-trail-bridge' => [
        commons('e/e7', 'Bruce_Freeman_Rail_Trail_bridge_over_Route_2A%2C_Acton_MA.jpg'),
        'feed-run',
        'Bruce Freeman Rail Trail bridge over Route 2A — John Phelan, CC BY-SA 4.0',
    ],
    'assabet-rail-trail' => [
        commons('f/f4', 'Assabet_River_Rail_Trail%2C_South_Acton_MA.jpg'),
        'feed-run',
        'Assabet River Rail Trail, South Acton — John Phelan, CC BY-SA 4.0',
    ],
    'nashoba-brook' => [
        commons('6/6b', 'Nashoba_Brook%2C_Acton_MA.jpg'),
        'feed-garden',
        'Nashoba Brook, Acton — John Phelan, CC BY-SA 4.0',
    ],
    'great-hill-field' => [
        commons('9/9f', 'Athletic_field_at_Great_Hill_Conservation_Land_in_Acton_MA_USA.jpg'),
        'event-bootcamp',
        'Athletic field, Great Hill Conservation Land — Swampyank, CC BY-SA 4.0',
    ],
    'great-hill-trail' => [
        commons('9/91', 'Great_Hill_Conservation_Area_in_Acton_Massachusetts_USA.jpg'),
        'feed-run',
        'Great Hill Conservation Area, Acton — Swampyank, CC BY-SA 4.0',
    ],
    'great-hill-bridge' => [
        commons('2/2c', 'Brook_bridge_on_Great_Hill_Conservation_Area_in_Acton_Massachusetts_USA.jpg'),
        'feed-garden',
        'Brook bridge, Great Hill Conservation Area — Swampyank, CC BY-SA 4.0',
    ],
    'skating-pond' => [
        commons('b/b1', 'Skating_pond_at_Great_Hill_Conservation_Land_in_Acton_MA_USA.jpg'),
        'amenity-pool',
        'Skating pond, Great Hill Conservation Land — Swampyank, CC BY-SA 4.0',
    ],
    'south-acton-station' => [
        commons('c/c1', 'South_Acton_station_October_2022_%281%29.jpg'),
        'feed-skyline',
        'South Acton MBTA station, October 2022 — CC BY-SA',
    ],
    'fitchburg-train' => [
        commons('9/92', 'Inbound_train_at_South_Acton_station_October_2022_%281%29.jpg'),
        'feed-skyline',
        'Inbound Fitchburg Line train at South Acton — CC BY-SA',
    ],
    'acton-memorial-library' => [
        commons('2/2c', 'Acton_Memorial_Library_2006_%28cropped%29.jpg'),
        'feed-books',
        'Acton Memorial Library, 486 Main Street — CC BY-SA',
    ],
    'west-acton-library' => [
        commons('d/d6', 'West_Acton_Citizens_Library%2C_West_Acton_MA.jpg'),
        'feed-books',
        "West Acton Citizens' Library, 21 Windsor Avenue — John Phelan, CC BY 4.0",
    ],
    'faulkner-homestead' => [
        commons('9/9e', 'Faulkner_Homestead%2C_South_Acton_MA.jpg'),
        'community-cover',
        'Faulkner Homestead (1707), South Acton — John Phelan, CC BY 3.0',
    ],
    'acton-firehouse' => [
        commons('b/bd', 'Acton_Centre_District_Firehouse_1%2C_Acton_MA.JPG'),
        'notice-security',
        'Acton Fire Department District 1 — CC BY-SA',
    ],
    'acton-minutemen' => [
        commons('e/e6', 'Line_of_March_of_the_Acton_Minutemen%2C_Acton_MA.jpg'),
        'event-townhall',
        'Line of March of the Acton Minutemen, Route 27 — John Phelan, CC BY-SA',
    ],
    'little-free-library' => [
        commons('e/e9', 'Little_Free_Library%2C_West_Acton_MA.jpg'),
        'feed-books',
        'Little Free Library, West Acton — John Phelan, CC BY-SA 4.0',
    ],

    /* ── Amenities ── */
    'amenity-lap-pool' => [
        [unsplash('photo-1560090995-01632a28895b'), unsplash('photo-1576013551627-0cc20b96c2a7')],
        'amenity-pool',
        'Unsplash License',
    ],
    'amenity-tennis' => [
        [unsplash('photo-1554068865-24cecd4e34b8'), unsplash('photo-1595435934249-5df7ed86e1c0')],
        'event-bootcamp',
        'Unsplash License',
    ],
    'amenity-pickleball' => [
        [unsplash('photo-1626224583764-f87db24ac4ea'), unsplash('photo-1554068865-24cecd4e34b8')],
        'event-bootcamp',
        'Unsplash License',
    ],
    'amenity-ev-charging' => [
        [unsplash('photo-1593941707882-a5bba14938c7'), unsplash('photo-1558425040-c4a5e7fe0ee2')],
        'notice-maintenance',
        'Unsplash License',
    ],
    'amenity-kayak-rack' => [
        [unsplash('photo-1544551763-46a013bb70d5'), unsplash('photo-1502680390469-be75c86b636f')],
        'amenity-pool',
        'Unsplash License',
    ],
    'amenity-garden-plots' => [
        [unsplash('photo-1466692476868-aef1dfb1e735'), unsplash('photo-1416879595882-3373a0480b5b')],
        'feed-garden',
        'Unsplash License',
    ],
    'amenity-mail-house' => [
        [unsplash('photo-1568667256549-094345857637'), unsplash('photo-1600518464441-9154a4dea21b')],
        'feed-packages',
        'Unsplash License',
    ],
    'amenity-tot-lot' => [
        [unsplash('photo-1596464716127-f2a82984de30'), unsplash('photo-1503919545889-aef636e10f5c')],
        'listing-plants',
        'Unsplash License',
    ],
    'amenity-woodshop' => [
        [unsplash('photo-1572981779307-38b8cabb2407'), unsplash('photo-1504148455328-c376907d081c')],
        'notice-maintenance',
        'Unsplash License',
    ],
    'amenity-winter-lot' => [
        [unsplash('photo-1517299321609-52687d1bc55a'), unsplash('photo-1548777123-e216912df7d8')],
        'notice-maintenance',
        'Unsplash License',
    ],

    /* ── Seasonal notices, events, feed ── */
    'autumn-foliage' => [
        [unsplash('photo-1444927714506-8492d94b4e3d'), unsplash('photo-1476820865390-c52aeebb9891')],
        'community-cover',
        'Unsplash License',
    ],
    'leaf-collection' => [
        [unsplash('photo-1508921340878-ba53e1f016ec'), unsplash('photo-1444927714506-8492d94b4e3d')],
        'feed-garden',
        'Unsplash License',
    ],
    'noreaster-storm' => [
        [unsplash('photo-1527482797697-8795b05a13fe'), unsplash('photo-1605727216801-e27ce1d0cc28')],
        'alert-weather',
        'Unsplash License',
    ],
    'fire-hydrant' => [
        [unsplash('photo-1590845947670-c009801ffa74'), unsplash('photo-1504148455328-c376907d081c')],
        'notice-maintenance',
        'Unsplash License',
    ],
    'farm-stand' => [
        [unsplash('photo-1506280754576-f6fa8a873550'), unsplash('photo-1570913149827-d2ac84ab3f9a')],
        'business-grocery',
        'Unsplash License',
    ],
    'cider-donuts' => [
        [unsplash('photo-1551024601-bec78aea704b'), unsplash('photo-1509440159596-0249088772ff')],
        'business-bakery',
        'Unsplash License',
    ],
    'lobster-roll' => [
        [unsplash('photo-1559737558-2f5a35f4523b'), unsplash('photo-1565680018434-b513d5e5fd47')],
        'business-sushi',
        'Unsplash License',
    ],
    'taproom' => [
        [unsplash('photo-1518176258769-f2a4c7b1ed07'), unsplash('photo-1470337458703-46ad1756a187')],
        'business-bar',
        'Unsplash License',
    ],
    'halloween-porch' => [
        [unsplash('photo-1509557965875-b88c97052f0e'), unsplash('photo-1572978533427-b6c00e7ad6f9')],
        'event-cookies',
        'Unsplash License',
    ],
    'diwali-diyas' => [
        [
            'https://pd.w.org/2024/02/84065c0cb5a55e1e5.29330613-2048x1463.jpg',
            'https://pd.w.org/2024/02/65465bf4ba4323156.69965662-2048x1365.jpg',
        ],
        'event-cookies',
        'Diwali diya — Makarand Mane, CC0 1.0',
    ],
    'chili-pot' => [
        [unsplash('photo-1547592180-85f173990554'), unsplash('photo-1476224203421-9ac39bcb3327')],
        'feed-dinner',
        'Unsplash License',
    ],
    'pancake-breakfast' => [
        [unsplash('photo-1528207776546-365bb710ee93'), unsplash('photo-1482049016688-2d3e1b311543')],
        'business-brunch',
        'Unsplash License',
    ],
    'holiday-lights' => [
        [unsplash('photo-1513297887119-d46091b24bfa'), unsplash('photo-1543934638-bd2e138430c4')],
        'event-cookies',
        'Unsplash License',
    ],
    'science-museum' => [
        [unsplash('photo-1610394908298-d4a5dfc0c47e'), unsplash('photo-1503454537195-1dcabb73ffb9')],
        'feed-kids',
        'Unsplash License',
    ],
    'theater-stage' => [
        [unsplash('photo-1503095396549-807759245b35'), unsplash('photo-1514933651103-005eec06c04b')],
        'event-townhall',
        'Unsplash License',
    ],
];

function fetch(string $url): ?string
{
    static $ca = null;
    if ($ca === null) {
        $ca = caBundle();
    }

    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 60,
        // Wikimedia rejects generic agents, so identify the tool and a contact.
        CURLOPT_USERAGENT => 'Havena-SeedBot/1.0 (https://gohavena.com; admin@gohavena.com) php-curl',
        CURLOPT_HTTPHEADER => ['Accept: image/jpeg,image/webp,image/*,*/*;q=0.8'],
    ];
    if ($ca !== null) {
        $options[CURLOPT_CAINFO] = $ca;
    }

    $handle = curl_init($url);
    curl_setopt_array($handle, $options);
    $body = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
    $type = (string) curl_getinfo($handle, CURLINFO_CONTENT_TYPE);
    curl_close($handle);

    $ok = is_string($body)
        && $status >= 200 && $status < 300
        && strlen($body) > 20000
        && str_contains($type, 'image');

    return $ok ? $body : null;
}

/** WAMP ships with an empty curl.cainfo, so bootstrap Mozilla's bundle once. */
function caBundle(): ?string
{
    $path = __DIR__.'/../storage/app/certs/cacert.pem';
    if (is_file($path) && filesize($path) > 1000) {
        return $path;
    }

    @mkdir(dirname($path), 0755, true);
    $handle = curl_init('https://curl.se/ca/cacert.pem');
    curl_setopt_array($handle, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 40,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
    ]);
    $pem = curl_exec($handle);
    curl_close($handle);

    if (is_string($pem) && str_contains($pem, 'BEGIN CERTIFICATE')) {
        file_put_contents($path, $pem);

        return $path;
    }

    return null;
}

if ($only !== []) {
    $photos = array_intersect_key($photos, array_flip($only));
}

$downloaded = 0;
$kept = 0;
$fellBack = 0;
$failed = [];
$credits = [];

foreach ($photos as $key => [$sources, $localFallback, $credit]) {
    $outPath = $dest.'/'.$key.'.jpg';
    $credits[$key] = $credit;

    if (is_file($outPath) && filesize($outPath) > 20000 && ! $force) {
        $kept++;
        mirror($outPath, $mobile.'/'.$key.'.jpg');
        continue;
    }

    // upload.wikimedia.org answers 429 on rapid bursts, so back off and retry
    // before giving up on a source.
    $body = null;
    foreach ((array) $sources as $url) {
        foreach ([0, 4, 12] as $backoff) {
            if ($backoff > 0) {
                sleep($backoff);
            }
            $body = fetch($url);
            if ($body !== null) {
                break 2;
            }
        }
    }

    if ($body !== null) {
        $original = strlen($body);
        $body = downscale($body, 1800);
        file_put_contents($outPath, $body);
        mirror($outPath, $mobile.'/'.$key.'.jpg');
        $downloaded++;
        printf(
            "  ok       %-26s %s KB (from %s KB)\n",
            $key,
            number_format(strlen($body) / 1024),
            number_format($original / 1024)
        );

        continue;
    }

    $localPath = $seedDir.'/'.$localFallback.'.jpg';
    if (is_file($localPath)) {
        copy($localPath, $outPath);
        mirror($outPath, $mobile.'/'.$key.'.jpg');
        $fellBack++;
        $credits[$key] = $credit.' (fallback: '.$localFallback.')';
        printf("  fallback %-26s <- %s.jpg\n", $key, $localFallback);

        continue;
    }

    $failed[] = $key;
    fwrite(STDERR, "  FAILED   {$key}\n");
}

/**
 * Commons originals run 3–7 MB. Cap the long edge and re-encode so the portal
 * serves web-sized files without visible quality loss.
 */
function downscale(string $body, int $maxEdge, int $quality = 82): string
{
    if (! extension_loaded('gd')) {
        return $body;
    }

    $image = @imagecreatefromstring($body);
    if ($image === false) {
        return $body;
    }

    $width = imagesx($image);
    $height = imagesy($image);
    $longEdge = max($width, $height);

    if ($longEdge > $maxEdge) {
        $scale = $maxEdge / $longEdge;
        $resized = imagescale($image, (int) round($width * $scale), (int) round($height * $scale), IMG_BICUBIC_FIXED);
        if ($resized !== false) {
            imagedestroy($image);
            $image = $resized;
        }
    }

    ob_start();
    $ok = imagejpeg($image, null, $quality);
    $encoded = (string) ob_get_clean();
    imagedestroy($image);

    return ($ok && strlen($encoded) > 20000) ? $encoded : $body;
}

function mirror(string $from, string $to): void
{
    if (! is_file($to) || filesize($to) !== filesize($from)) {
        @copy($from, $to);
    }
}

$creditLines = ["Image credits for the Acton (Village of Nagog Woods) seed set.", ''];
foreach ($credits as $key => $credit) {
    $creditLines[] = str_pad($key.'.jpg', 30).$credit;
}
file_put_contents($dest.'/CREDITS.txt', implode(PHP_EOL, $creditLines).PHP_EOL);

printf(
    "\nActon photos: %d downloaded, %d kept, %d local fallbacks, %d failed.\n",
    $downloaded,
    $kept,
    $fellBack,
    count($failed)
);

exit($failed === [] ? 0 : 1);
