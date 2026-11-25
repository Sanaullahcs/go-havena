<?php

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\User;
use App\Services\CommunityCurrencyService;
use Illuminate\Support\Facades\DB;

$cid = (int) DB::table('invite_codes')->where('code', 'HALY-DHA2-26')->value('community_id');
$c = DB::table('communities')->where('id', $cid)->first();
echo "community #{$c->id} {$c->name} currency={$c->currency} status={$c->status}\n";

foreach (['haly@gohavena.com', 'haly.resident@gohavena.com'] as $email) {
    $user = User::query()->where('email', $email)->first();
    $code = app(CommunityCurrencyService::class)->forUser($user);
    $unit = DB::table('profiles')->where('user_id', $user->id)->value('unit_number');
    echo sprintf("%-28s role=%-16s unit=%-8s currency=%s\n", $email, $user->role, $unit, $code);
}

$tables = [
    'amenities', 'bookings' => null, 'notices', 'posts', 'listings', 'businesses', 'deals',
    'community_rules', 'community_documents', 'property_services', 'unit_service_bills',
    'amenity_monthly_bills', 'amenity_resident_bills', 'guest_invitations', 'families',
    'point_transactions', 'polls' => null,
];

foreach ([
    'amenities', 'notices', 'posts', 'listings', 'businesses', 'deals',
    'community_rules', 'community_documents', 'property_services',
    'unit_service_subscriptions', 'unit_service_bills', 'amenity_monthly_bills',
    'amenity_resident_bills', 'guest_invitations', 'families', 'point_transactions',
] as $table) {
    $n = DB::table($table)->where('community_id', $cid)->count();
    echo str_pad($table, 32).$n."\n";
}

$amenityIds = DB::table('amenities')->where('community_id', $cid)->pluck('id');
echo str_pad('bookings', 32).DB::table('bookings')->whereIn('amenity_id', $amenityIds)->count()."\n";
$postIds = DB::table('posts')->where('community_id', $cid)->pluck('id');
echo str_pad('polls', 32).DB::table('polls')->whereIn('post_id', $postIds)->count()."\n";
echo str_pad('wellness_progress', 32).DB::table('wellness_lesson_progress')
    ->whereIn('user_id', DB::table('community_memberships')->where('community_id', $cid)->pluck('user_id'))
    ->count()."\n";

$missing = [];
foreach (['amenities' => 'image_url', 'notices' => 'image_url', 'posts' => 'image_url', 'businesses' => 'image_url', 'deals' => 'image_url'] as $table => $col) {
    foreach (DB::table($table)->where('community_id', $cid)->pluck($col) as $url) {
        if (! $url) {
            continue;
        }
        $path = storage_path('app/public/'.ltrim(str_replace('/storage/', '', $url), '/'));
        if (! is_file($path)) {
            $missing[$url] = true;
        }
    }
}
echo 'missing_images '.count($missing)."\n";
foreach (array_keys($missing) as $url) {
    echo "  MISSING $url\n";
}
