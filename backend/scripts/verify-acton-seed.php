<?php

/**
 * Sanity check for the Acton seed: row counts, and every image/file path
 * referenced by the community must resolve to a real file on disk.
 *
 * Usage: php scripts/verify-acton-seed.php
 */

require __DIR__.'/../vendor/autoload.php';

$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

$community = DB::table('communities')
    ->where('name', \Database\Seeders\ActonCommunitySeeder::COMMUNITY_NAME)
    ->first()
    ?? DB::table('communities')
        ->where('name', \Database\Seeders\ActonCommunitySeeder::LEGACY_COMMUNITY_NAME)
        ->first();

if (! $community) {
    fwrite(STDERR, "Acton community not found.\n");
    exit(1);
}

$cid = (int) $community->id;
echo "Community #{$cid}: {$community->name} — {$community->address}\n";
echo "Region: {$community->region} · residents: {$community->estimated_residents}\n\n";

$counts = [
    'members (approved)' => DB::table('community_memberships')->where('community_id', $cid)->where('status', 'approved')->count(),
    'members (pending)' => DB::table('community_memberships')->where('community_id', $cid)->where('status', 'pending')->count(),
    'members (banned)' => DB::table('community_memberships')->where('community_id', $cid)->where('status', 'banned')->count(),
    'amenities (approved)' => DB::table('amenities')->where('community_id', $cid)->where('review_status', 'approved')->count(),
    'amenities (pending)' => DB::table('amenities')->where('community_id', $cid)->where('review_status', 'pending')->count(),
    'amenities w/ shared billing' => DB::table('amenities')->where('community_id', $cid)->where('shared_billing_enabled', true)->count(),
    'bookings' => DB::table('bookings')->join('amenities', 'amenities.id', '=', 'bookings.amenity_id')->where('amenities.community_id', $cid)->count(),
    'monthly bills' => DB::table('amenity_monthly_bills')->where('community_id', $cid)->count(),
    'resident bills' => DB::table('amenity_resident_bills')->where('community_id', $cid)->count(),
    'notices (non-event)' => DB::table('notices')->where('community_id', $cid)->where('category', '!=', 'event')->count(),
    'events' => DB::table('notices')->where('community_id', $cid)->where('category', 'event')->count(),
    'rsvps' => DB::table('event_rsvps')->join('notices', 'notices.id', '=', 'event_rsvps.notice_id')->where('notices.community_id', $cid)->count(),
    'posts' => DB::table('posts')->where('community_id', $cid)->count(),
    'comments' => DB::table('post_comments')->join('posts', 'posts.id', '=', 'post_comments.post_id')->where('posts.community_id', $cid)->count(),
    'likes' => DB::table('post_likes')->join('posts', 'posts.id', '=', 'post_likes.post_id')->where('posts.community_id', $cid)->count(),
    'listings' => DB::table('listings')->where('community_id', $cid)->count(),
    'businesses' => DB::table('businesses')->where('community_id', $cid)->count(),
    'deals' => DB::table('deals')->where('community_id', $cid)->count(),
    'rules' => DB::table('community_rules')->where('community_id', $cid)->count(),
    'rule acknowledgements' => DB::table('rule_acknowledgments')->join('community_rules', 'community_rules.id', '=', 'rule_acknowledgments.rule_id')->where('community_rules.community_id', $cid)->count(),
    'documents' => DB::table('community_documents')->where('community_id', $cid)->count(),
];

foreach ($counts as $label => $count) {
    printf("  %-30s %d\n", $label, $count);
}

echo "\nResident bill status spread:\n";
$spread = DB::table('amenity_resident_bills')
    ->where('community_id', $cid)
    ->selectRaw('status, count(*) as n')
    ->groupBy('status')
    ->orderBy('status')
    ->get();
foreach ($spread as $row) {
    printf("  %-24s %d\n", $row->status, $row->n);
}

echo "\nRSVP spread:\n";
$rsvps = DB::table('event_rsvps')
    ->join('notices', 'notices.id', '=', 'event_rsvps.notice_id')
    ->where('notices.community_id', $cid)
    ->selectRaw('event_rsvps.status, count(*) as n')
    ->groupBy('event_rsvps.status')
    ->get();
foreach ($rsvps as $row) {
    printf("  %-24s %d\n", $row->status, $row->n);
}

/* ── every referenced asset must exist on disk ── */

$paths = [];

$collect = function (string $table, string $column, ?string $where = null) use (&$paths, $cid) {
    $query = DB::table($table)->whereNotNull($column);
    if ($where === 'community') {
        $query->where('community_id', $cid);
    }
    foreach ($query->pluck($column, 'id') as $id => $value) {
        if ($value === '' || $value === null) {
            continue;
        }
        $paths["{$table}#{$id}.{$column}"] = (string) $value;
    }
};

$collect('amenities', 'image_url', 'community');
$collect('notices', 'image_url', 'community');
$collect('posts', 'image_url', 'community');
$collect('businesses', 'image_url', 'community');
$collect('deals', 'image_url', 'community');
$collect('community_documents', 'file_path', 'community');

// Listing images are a JSON array.
foreach (DB::table('listings')->where('community_id', $cid)->get(['id', 'images']) as $listing) {
    foreach (json_decode((string) $listing->images, true) ?: [] as $i => $url) {
        $paths["listings#{$listing->id}.images[{$i}]"] = (string) $url;
    }
}

// Profile avatars for this community's members.
$userIds = DB::table('community_memberships')->where('community_id', $cid)->pluck('user_id');
foreach (DB::table('profiles')->whereIn('user_id', $userIds)->get(['id', 'avatar_url', 'utility_bill_url']) as $profile) {
    foreach (['avatar_url', 'utility_bill_url'] as $column) {
        if (! empty($profile->$column)) {
            $paths["profiles#{$profile->id}.{$column}"] = (string) $profile->$column;
        }
    }
}

$missing = [];
foreach ($paths as $label => $url) {
    if (! str_starts_with($url, '/storage/')) {
        $missing[$label] = $url.'  (not a /storage/ path)';

        continue;
    }

    $relative = substr($url, strlen('/storage/'));
    if (! is_file(storage_path('app/public/'.$relative))) {
        $missing[$label] = $url;
    }
}

printf("\nAsset paths checked: %d\n", count($paths));

if ($missing === []) {
    echo "All referenced images and documents exist on disk.\n";
    exit(0);
}

printf("MISSING (%d):\n", count($missing));
foreach ($missing as $label => $url) {
    echo "  {$label} -> {$url}\n";
}
exit(1);
