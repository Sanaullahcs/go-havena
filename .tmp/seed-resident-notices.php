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

$membership = DB::table('community_memberships')
    ->where('user_id', $user->id)
    ->where('status', 'approved')
    ->orderByDesc('id')
    ->first();

if (! $membership) {
    echo "no community for {$email} id={$user->id}\n";
    exit(1);
}

$cid = (int) $membership->community_id;
$community = DB::table('communities')->where('id', $cid)->first();
$adminId = DB::table('community_memberships')
    ->where('community_id', $cid)
    ->whereIn('role', ['admin', 'community_admin'])
    ->where('status', 'approved')
    ->value('user_id');
if (! $adminId) {
    $adminId = DB::table('users')->whereIn('role', ['community_admin', 'system_admin'])->value('id');
}
$adminId = (int) ($adminId ?: $user->id);

echo "user={$user->id} community={$cid} ".($community->name ?? '')." admin={$adminId}\n";

$img = '/storage/seed';
$hasPinned = Schema::hasColumn('notices', 'is_pinned');
$hasAudience = Schema::hasColumn('notices', 'audience_type');

$notices = [
    [
        'Domestic Water Tank Cleaning — Wednesday',
        'maintenance',
        'Building management will clean and disinfect the domestic water tanks on Wednesday from 9:00 AM to 2:00 PM. Water pressure may drop on upper floors between 10:00 AM and 12:30 PM. Please store drinking water in advance. Lifts and fire systems stay in service.',
        "{$img}/notice-maintenance.jpg",
        0,
        true,
        now()->addDays(2)->toDateString(),
        '09:00',
        '14:00',
    ],
    [
        'P2 Garage Power Wash and Drain Flush',
        'maintenance',
        'The P2 parking level will be closed from 7:00 AM to 3:00 PM on Thursday for power washing and drain flushing. Please move vehicles to P1 or street parking overnight. Cones will mark the wet areas until 5:00 PM.',
        "{$img}/feed-packages.jpg",
        1,
        false,
        now()->addDays(3)->toDateString(),
        '07:00',
        '15:00',
    ],
    [
        'Common-Area HVAC Filter Replacement',
        'maintenance',
        'Facilities will replace corridor and lobby HVAC filters this Friday. You may hear brief fan shutdowns on each floor between 8:30 AM and 11:00 AM. No in-unit work is scheduled.',
        "{$img}/amenity-gym.jpg",
        1,
        false,
        now()->addDays(4)->toDateString(),
        '08:30',
        '11:00',
    ],
    [
        'Quarterly Fire Alarm Test — All Towers',
        'maintenance',
        'A scheduled fire alarm and strobe test will run Tuesday from 10:00 AM to 10:20 AM. Alarms will sound for up to two minutes. This is a test only. Do not call emergency services unless a second announcement is made.',
        "{$img}/notice-security.jpg",
        2,
        true,
        now()->addDays(5)->toDateString(),
        '10:00',
        '10:20',
    ],
    [
        'Standby Generator Load Test',
        'maintenance',
        'The standby generator will run a monthly load test Saturday at 8:00 AM for approximately 30 minutes. Lights may flicker once at start and stop. The test is required for life-safety compliance.',
        "{$img}/alert-weather.jpg",
        2,
        false,
        now()->addDays(6)->toDateString(),
        '08:00',
        '08:45',
    ],
    [
        'Hot Water Interruption — East Stack',
        'maintenance',
        'A circulating pump on the east stack will be replaced Monday. Units ending in 01–06 may have reduced hot water from 9:00 AM to 1:00 PM. Cold water remains available. Thank you for planning showers around this window.',
        "{$img}/notice-maintenance.jpg",
        0,
        false,
        now()->addDays(7)->toDateString(),
        '09:00',
        '13:00',
    ],
    [
        'Landscape Irrigation Repair at the Entry Court',
        'maintenance',
        'Broken irrigation heads at the Liberty Drive entry will be replaced tomorrow morning. The front walk may be briefly wet. The porte cochère stays open.',
        "{$img}/feed-garden.jpg",
        0,
        false,
        now()->addDay()->toDateString(),
        '07:30',
        '10:00',
    ],
    [
        'Guest Registration Before 9:00 PM',
        'security',
        'Please create a digital guest invitation before 9:00 PM so the desk can verify visitors quickly. Unregistered guests after 9:00 PM will be asked to wait while the resident is called.',
        "{$img}/notice-security.jpg",
        3,
        false,
        now()->addDays(1)->toDateString(),
        '09:00',
        '21:00',
    ],
    [
        'Quiet Hours: 11:00 PM to 7:00 AM',
        'general',
        'A reminder from the office: quiet hours are 11:00 PM to 7:00 AM in corridors, courtyards, and balconies. Report ongoing disturbances through the app so the night desk can follow up with a record.',
        "{$img}/community-cover.jpg",
        4,
        false,
        now()->addDays(1)->toDateString(),
        '23:00',
        '07:00',
    ],
    [
        'Package Room Hours Extended',
        'general',
        'The package room is now open 7:00 AM to 9:00 PM daily. Oversized deliveries still need a 30-minute desk appointment. Please collect items within 72 hours so the shelves stay clear for neighbors.',
        "{$img}/feed-packages.jpg",
        2,
        false,
        now()->addDays(2)->toDateString(),
        '07:00',
        '21:00',
    ],
    [
        'September Common Charge Statement',
        'finance',
        'September statements are available in Billing. The common charge is due on the 10th. Amenity reservations with a fee will appear as a separate line. Questions: message the office in the app.',
        "{$img}/event-townhall.jpg",
        5,
        false,
        now()->addDays(8)->toDateString(),
        '09:00',
        '17:00',
    ],
    [
        'Balcony Furniture Check Before High Wind',
        'general',
        'A coastal wind advisory is in effect this weekend. Please bring in loose balcony furniture, planters, and umbrellas by Friday evening. The grounds team will secure courtyard furniture after 6:00 PM Friday.',
        "{$img}/alert-weather.jpg",
        1,
        true,
        now()->addDays(3)->toDateString(),
        '18:00',
        '20:00',
    ],
];

$added = 0;
foreach ($notices as $i => [$title, $category, $body, $image, $daysAgo, $pinned, $eventDate, $start, $end]) {
    $exists = DB::table('notices')->where('community_id', $cid)->where('title', $title)->exists();
    $payload = [
        'author_id' => $adminId,
        'category' => $category,
        'body' => $body,
        'image_url' => $image,
        'event_date' => $eventDate,
        'event_time' => $start,
        'event_time_end' => $end,
        'status' => 'published',
        'review_status' => 'approved',
        'is_global' => false,
        'approved_by' => $adminId,
        'approved_at' => now()->subDays($daysAgo),
        'published_at' => now()->subDays($daysAgo),
        'updated_at' => now(),
        'created_at' => now()->subDays($daysAgo),
        'deleted_at' => null,
    ];
    if ($hasPinned) {
        $payload['is_pinned'] = $pinned;
    }
    if ($hasAudience) {
        $payload['audience_type'] = 'all';
    }

    DB::table('notices')->updateOrInsert(
        ['community_id' => $cid, 'title' => $title],
        $payload
    );
    echo ($exists ? 'updated' : 'added')." {$category} {$title}\n";
    $added++;
}

$total = DB::table('notices')->where('community_id', $cid)->where('status', 'published')->whereNull('deleted_at')->count();
$maint = DB::table('notices')->where('community_id', $cid)->where('status', 'published')->where('category', 'maintenance')->whereNull('deleted_at')->count();
echo "published={$total} maintenance={$maint}\nDONE\n";
