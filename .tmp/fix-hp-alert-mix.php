<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$user = User::query()->whereRaw('LOWER(email) = ?', ['resident@gohavena.com'])->first();
$cid = (int) DB::table('community_memberships')
    ->where('user_id', $user->id)
    ->where('status', 'approved')
    ->orderByDesc('id')
    ->value('community_id');

$hasPinned = Schema::hasColumn('notices', 'is_pinned');

$updates = [
    'Severe Thunderstorm Warning' => [
        'category' => 'emergency',
        'is_pinned' => true,
    ],
    'Annual Fire Evacuation Drill' => [
        'category' => 'general',
        'is_pinned' => true,
        'body' => 'The annual fire evacuation drill is Thursday at 10:00 AM. Alarms and strobes will run for about three minutes on every floor. Follow your floor warden to the courtyard muster point. This is a scheduled drill only. Do not call 911 unless a second announcement is made.',
    ],
    'Coastal Flood Advisory Tonight' => [
        'category' => 'maintenance',
        'is_pinned' => false,
        'title' => 'P1 Ramp May Pond at High Tide',
        'body' => 'High tide tonight may pond at the P1 vehicle ramp. Please move cars off the lowest row if you can. The lobby and elevators stay open. The desk will post if the garage needs to close.',
    ],
    'Winter Storm Watch: Secure Balconies' => [
        'category' => 'maintenance',
        'is_pinned' => false,
        'title' => 'Secure Balcony Furniture Before High Wind',
        'body' => 'Strong wind is expected through Thursday. Please bring in balcony furniture, planters, and umbrellas by this evening. The grounds team will strap down courtyard furniture after 6:00 PM.',
    ],
];

foreach ($updates as $title => $payload) {
    $row = DB::table('notices')->where('community_id', $cid)->where('title', $title)->first();
    if (! $row) {
        echo "missing {$title}\n";
        continue;
    }
    $data = [
        'category' => $payload['category'],
        'updated_at' => now(),
        'deleted_at' => null,
        'status' => 'published',
    ];
    if (isset($payload['body'])) {
        $data['body'] = $payload['body'];
    }
    if (isset($payload['title'])) {
        $data['title'] = $payload['title'];
    }
    if ($hasPinned) {
        $data['is_pinned'] = (bool) $payload['is_pinned'];
    }
    DB::table('notices')->where('id', $row->id)->update($data);
    echo "updated {$row->id} {$payload['category']} ".($payload['title'] ?? $title)."\n";
}

$live = DB::table('notices')
    ->where('community_id', $cid)
    ->where('status', 'published')
    ->whereNull('deleted_at')
    ->where('category', '!=', 'event')
    ->orderByRaw("CASE WHEN category = 'emergency' THEN 0 ELSE 1 END")
    ->orderByDesc('is_pinned')
    ->orderByDesc('published_at')
    ->get(['title', 'category', 'is_pinned']);

echo "alerts=".$live->where('category', 'emergency')->count()." maintenance=".$live->where('category', 'maintenance')->count()."\n";
foreach ($live as $row) {
    echo $row->category."\tpin=".($row->is_pinned ? '1' : '0')."\t".$row->title."\n";
}
echo "DONE\n";
