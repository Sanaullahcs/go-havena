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

$carousel = [
    [
        'Coastal Flood Advisory for Boston Harbor',
        'emergency',
        'A coastal flood advisory is in effect tonight through Thursday for the Seaport and Fort Point Channel. P1 may pond at the vehicle ramp around high tide. Please move cars off the lowest row if you can. The lobby and elevators stay open. We will post immediately if the garage closes.',
        "{$img}/hp-storm.jpg",
        now()->addDays(2)->toDateString(),
        '18:00',
        '23:30',
        'P1 garage ramp',
        true,
        0,
    ],
    [
        'Fire Watch in the East Tower Overnight',
        'emergency',
        'A sprinkler zone on the east riser is offline for a valve replacement. A licensed fire watch is on site from 8:00 PM to 6:00 AM. This is not an evacuation. If you hear a second alarm or smell smoke, use the stairs, call 911, then the front desk.',
        "{$img}/hp-fire.jpg",
        now()->addDays(1)->toDateString(),
        '20:00',
        '23:45',
        'East tower corridors',
        true,
        1,
    ],
    [
        'Domestic Water Service on Wednesday',
        'maintenance',
        'Water tanks will be cleaned Wednesday from 9:00 AM to 2:00 PM. Pressure may drop on upper floors from 10:00 AM to 12:30 PM. Please store drinking water ahead of time. Lifts and fire systems stay in service.',
        "{$img}/hp-water.jpg",
        now()->addDays(2)->toDateString(),
        '09:00',
        '14:00',
        'Domestic water plant',
        true,
        2,
    ],
    [
        'Elevator B Modernization Starts Monday',
        'maintenance',
        'Elevator B in the east tower will be offline for two weeks starting Monday. Elevator A remains in service. Allow extra time at the morning peak. The freight cab is reserved for contractors until 4:00 PM.',
        "{$img}/hp-elevator.jpg",
        now()->addDays(6)->toDateString(),
        '07:00',
        '18:00',
        'East tower elevator lobby',
        false,
        3,
    ],
    [
        'Gate and Amenity Codes Rotate Friday',
        'security',
        'Lobby, garage, and amenity codes rotate Friday at 6:00 AM. New codes will be emailed to registered residents and are available at the desk with a photo ID. Do not share codes with guests. Use a digital invite instead.',
        "{$img}/hp-lobby.jpg",
        now()->addDays(4)->toDateString(),
        '06:00',
        '09:00',
        'Main lobby desk',
        false,
        4,
    ],
    [
        'Pool Deck Closed Monday to Wednesday',
        'maintenance',
        'The north pool deck will be resurfaced Monday through Wednesday, 8:00 AM to 4:00 PM. The pool stays open. Please use the south lounge chairs and keep the work area clear for the crew.',
        "{$img}/hp-pool.jpg",
        now()->addDays(6)->toDateString(),
        '08:00',
        '16:00',
        'North pool deck',
        false,
        5,
    ],
    [
        'Saturday Shuttle to Boston Public Market',
        'general',
        'The complimentary shuttle leaves the Liberty Drive porte cochere every Saturday from 8:00 AM to 12:00 PM. Last return is 12:15 PM. No RSVP. Meet in the lobby if you need help with bags.',
        "{$img}/hp-harbor.jpg",
        now()->addDays(4)->toDateString(),
        '08:00',
        '12:15',
        'Liberty Drive lobby',
        false,
        6,
    ],
];

$keepTitles = array_column($carousel, 0);
$keepEvents = [
    'Quarterly Residents Town Hall',
    'Fitness Bootcamp Saturday',
    'Kids Arts & Crafts Afternoon',
    'Holiday Cookie Exchange',
];

if ($hasPinned) {
    DB::table('notices')->where('community_id', $cid)->update(['is_pinned' => false, 'updated_at' => now()]);
}

$archived = DB::table('notices')
    ->where('community_id', $cid)
    ->whereNull('deleted_at')
    ->where('status', 'published')
    ->whereNotIn('title', array_merge($keepTitles, $keepEvents))
    ->update([
        'status' => 'archived',
        'updated_at' => now(),
    ]);

echo "archived_other={$archived}\n";

foreach ($carousel as [$title, $category, $body, $image, $eventDate, $start, $end, $location, $pinned, $ageMin]) {
    $published = now()->subMinutes($ageMin);
    $payload = [
        'author_id' => $adminId,
        'category' => $category,
        'body' => $body,
        'location' => $location,
        'image_url' => $image,
        'event_date' => $eventDate,
        'event_time' => $start,
        'event_time_end' => $end,
        'event_capacity' => null,
        'status' => 'published',
        'review_status' => 'approved',
        'is_global' => false,
        'approved_by' => $adminId,
        'approved_at' => $published,
        'published_at' => $published,
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
        $payload['created_at'] = $published;
    }

    DB::table('notices')->updateOrInsert(
        ['community_id' => $cid, 'title' => $title],
        $payload
    );
    echo "ok {$category} {$title} ".basename($image)."\n";
}

$live = DB::table('notices')
    ->where('community_id', $cid)
    ->where('status', 'published')
    ->whereNull('deleted_at')
    ->where('category', '!=', 'event')
    ->orderByDesc('is_pinned')
    ->orderByDesc('published_at')
    ->get(['id', 'title', 'category', 'is_pinned', 'image_url', 'event_date']);

echo "carousel=".$live->count()."\n";
$images = $live->pluck('image_url')->map(fn ($u) => basename((string) $u));
$dupes = $images->countBy()->filter(fn ($n) => $n > 1);
echo "dup_images=".($dupes->isEmpty() ? 'none' : $dupes->keys()->implode(','))."\n";
foreach ($live as $row) {
    echo $row->id."\t".$row->category."\tpin=".($row->is_pinned ? '1' : '0')."\t".$row->event_date."\t".basename((string) $row->image_url)."\t".$row->title."\n";
}
echo "DONE\n";
