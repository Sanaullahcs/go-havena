<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$email = 'resident@gohavena.com';
$user = User::query()->whereRaw('LOWER(email) = ?', [strtolower($email)])->first();
if (! $user) {
    echo "missing {$email}\n";
    exit(1);
}

$cid = (int) DB::table('community_memberships')
    ->where('user_id', $user->id)
    ->where('status', 'approved')
    ->orderByDesc('id')
    ->value('community_id');

$adminId = (int) (DB::table('community_memberships')
    ->where('community_id', $cid)
    ->whereIn('role', ['admin', 'community_admin'])
    ->where('status', 'approved')
    ->value('user_id') ?: $user->id);

$img = '/storage/seed';
$hasPinned = Schema::hasColumn('notices', 'is_pinned');
$hasAudience = Schema::hasColumn('notices', 'audience_type');

$keepNotices = [
    [
        'Welcome to Harbor Point Residences',
        'general',
        'Welcome to Harbor Point. Use this app for notices, amenity booking, the resident marketplace, and messages with neighbors. The management office is on the ground floor of 50 Liberty Drive.',
        "{$img}/community-cover.jpg",
        now()->addDays(21)->toDateString(),
        '09:00',
        '17:00',
        true,
    ],
    [
        'Domestic Water Service on Wednesday',
        'maintenance',
        'Water tanks will be cleaned Wednesday from 9:00 AM to 2:00 PM. Pressure may drop on upper floors from 10:00 AM to 12:30 PM. Please store drinking water ahead of time. Lifts and fire systems stay in service.',
        "{$img}/feed-plumber.jpg",
        now()->addDays(2)->toDateString(),
        '09:00',
        '14:00',
        true,
    ],
    [
        'Elevator B Modernization',
        'maintenance',
        'Elevator B in the east tower is being modernized for two weeks. Elevator A remains in service. Allow extra time at peak hours. Thank you for your patience while we improve reliability.',
        "{$img}/amenity-gym.jpg",
        now()->addDays(14)->toDateString(),
        '08:00',
        '17:00',
        false,
    ],
    [
        'Pool Deck Closed Monday to Wednesday',
        'maintenance',
        'The north pool deck will be resurfaced Monday through Wednesday, 8:00 AM to 4:00 PM. The pool stays open. Please use the south lounge chairs and keep the work area clear.',
        "{$img}/amenity-pool.jpg",
        now()->addDays(6)->toDateString(),
        '08:00',
        '16:00',
        false,
    ],
    [
        'Gate and Amenity Codes Rotate This Month',
        'security',
        'Gate and amenity access codes rotate at month end. New codes will be emailed to registered residents and are available at the office with a photo ID. Do not share codes with guests.',
        "{$img}/notice-security.jpg",
        now()->addDays(16)->toDateString(),
        '09:00',
        '17:00',
        false,
    ],
    [
        'Saturday Shuttle to Boston Public Market',
        'general',
        'A complimentary shuttle runs from the Liberty Drive lobby to Boston Public Market every Saturday, 8:00 AM to 12:00 PM. Meet at the front porte cochere. No RSVP needed.',
        "{$img}/feed-market.jpg",
        now()->addDays(4)->toDateString(),
        '08:00',
        '12:00',
        false,
    ],
    [
        'Q3 Budget Summary is in Documents',
        'finance',
        'The third-quarter budget summary is now in Documents. It covers reserve contributions, landscaping, and the access system upgrade. A walkthrough is on the town hall agenda.',
        "{$img}/feed-books.jpg",
        now()->addDays(12)->toDateString(),
        '09:00',
        '17:00',
        false,
    ],
    [
        'Clubhouse Open Until 10:00 PM on Weekends',
        'general',
        'The clubhouse lounge now stays open until 10:00 PM on Fridays and Saturdays. Quiet hours still begin at 11:00 PM in corridors, courtyards, and balconies.',
        "{$img}/amenity-clubhouse.jpg",
        now()->addDays(8)->toDateString(),
        '18:00',
        '22:00',
        false,
    ],
    [
        'Register Overnight Guests Before 9:00 PM',
        'security',
        'Create a digital guest invitation before 9:00 PM so the desk can verify visitors quickly. Unregistered guests after 9:00 PM will wait while the resident is called.',
        "{$img}/feed-keys.jpg",
        now()->addDays(10)->toDateString(),
        '09:00',
        '21:00',
        false,
    ],
    [
        'Package Room Open 7:00 AM to 9:00 PM',
        'general',
        'The package room is open 7:00 AM to 9:00 PM daily. Oversized deliveries need a 30-minute desk appointment. Collect items within 72 hours so shelves stay clear.',
        "{$img}/feed-packages.jpg",
        now()->addDays(9)->toDateString(),
        '07:00',
        '21:00',
        false,
    ],
];

$keepEvents = [
    'Quarterly Residents Town Hall',
    'Fitness Bootcamp Saturday',
    'Kids Arts & Crafts Afternoon',
    'Holiday Cookie Exchange',
];

$keepTitles = array_merge(array_column($keepNotices, 0), $keepEvents);

$archived = DB::table('notices')
    ->where('community_id', $cid)
    ->whereNull('deleted_at')
    ->where('status', 'published')
    ->whereNotIn('title', $keepTitles)
    ->update([
        'status' => 'archived',
        'is_pinned' => $hasPinned ? false : DB::raw('is_pinned'),
        'updated_at' => now(),
    ]);

echo "archived_other={$archived}\n";

if ($hasPinned) {
    DB::table('notices')->where('community_id', $cid)->update(['is_pinned' => false, 'updated_at' => now()]);
}

foreach ($keepNotices as $i => [$title, $category, $body, $image, $eventDate, $start, $end, $pinned]) {
    $payload = [
        'author_id' => $adminId,
        'category' => $category,
        'body' => $body,
        'location' => null,
        'image_url' => $image,
        'event_date' => $eventDate,
        'event_time' => $start,
        'event_time_end' => $end,
        'event_capacity' => null,
        'status' => 'published',
        'review_status' => 'approved',
        'is_global' => false,
        'approved_by' => $adminId,
        'approved_at' => now()->subDays(1),
        'published_at' => now()->subDays(min($i, 6)),
        'updated_at' => now(),
        'deleted_at' => null,
    ];
    if ($hasPinned) {
        $payload['is_pinned'] = $pinned;
    }
    if ($hasAudience) {
        $payload['audience_type'] = 'all';
    }
    if (! DB::table('notices')->where('community_id', $cid)->where('title', $title)->exists()) {
        $payload['created_at'] = now()->subDays(min($i, 6));
    }

    DB::table('notices')->updateOrInsert(
        ['community_id' => $cid, 'title' => $title],
        $payload
    );
    echo "notice {$category} {$title} ".basename($image)."\n";
}

$eventImages = [
    'Quarterly Residents Town Hall' => "{$img}/event-townhall.jpg",
    'Fitness Bootcamp Saturday' => "{$img}/event-bootcamp.jpg",
    'Kids Arts & Crafts Afternoon' => "{$img}/listing-plants.jpg",
    'Holiday Cookie Exchange' => "{$img}/event-cookies.jpg",
];

foreach ($keepEvents as $title) {
    $q = DB::table('notices')->where('community_id', $cid)->where('title', $title);
    if (! $q->exists()) {
        echo "missing_event {$title}\n";
        continue;
    }
    $update = [
        'status' => 'published',
        'review_status' => 'approved',
        'image_url' => $eventImages[$title],
        'deleted_at' => null,
        'updated_at' => now(),
    ];
    if ($hasPinned) {
        $update['is_pinned'] = false;
    }
    $q->update($update);
    echo "event {$title} ".basename($eventImages[$title])."\n";
}

$live = DB::table('notices')
    ->where('community_id', $cid)
    ->where('status', 'published')
    ->whereNull('deleted_at')
    ->orderByDesc('is_pinned')
    ->orderBy('event_date')
    ->get(['id', 'title', 'category', 'is_pinned', 'image_url', 'event_date']);

$images = $live->pluck('image_url')->filter()->map(fn ($u) => basename((string) $u));
$dupes = $images->countBy()->filter(fn ($n) => $n > 1);

echo "published=".$live->count()." notices=".$live->where('category', '!=', 'event')->count()." events=".$live->where('category', 'event')->count()."\n";
echo "dup_images=".($dupes->isEmpty() ? 'none' : $dupes->keys()->implode(','))."\n";
foreach ($live as $row) {
    echo $row->id."\t".$row->category."\tpin=".($row->is_pinned ? '1' : '0')."\t".$row->event_date."\t".basename((string) $row->image_url)."\t".$row->title."\n";
}
echo "DONE\n";
