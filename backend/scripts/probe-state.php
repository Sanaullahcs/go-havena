<?php

/**
 * Snapshot of what exists locally right now: communities, Pakistan regions,
 * wellness catalog, and the tables a new community seeder has to populate.
 *
 * Usage: php scripts/probe-state.php
 */

require __DIR__.'/../vendor/autoload.php';

$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

echo "=== COMMUNITIES ===\n";
foreach (DB::table('communities')->orderBy('id')->get() as $c) {
    printf("%4d  %-38s %-22s %s/%s\n", $c->id, $c->name, $c->region, $c->status, $c->review_status);
}

echo "\n=== REGIONS (Pakistan) ===\n";
foreach (DB::table('regions')->where('title', 'like', '%Pakistan%')->orWhere('state', 'Punjab')->get() as $r) {
    printf("%4d  %-30s area=%-24s state=%-12s %s\n", $r->id, $r->title, $r->area, $r->state ?? '-', $r->status);
}

echo "\n=== DEMO USERS (gohavena.com) ===\n";
foreach (DB::table('users')->where('email', 'like', '%@gohavena.com')->orderBy('id')->get(['id', 'name', 'email', 'role', 'status']) as $u) {
    printf("%4d  %-26s %-34s %-18s %s\n", $u->id, $u->name, $u->email, $u->role, $u->status);
}

echo "\n=== WELLNESS ===\n";
foreach (['wellness_categories', 'wellness_courses', 'wellness_lessons', 'wellness_lesson_progress'] as $t) {
    printf("  %-28s exists=%s rows=%d\n", $t, Schema::hasTable($t) ? 'y' : 'n', Schema::hasTable($t) ? DB::table($t)->count() : 0);
}
if (Schema::hasTable('wellness_categories')) {
    echo "  categories: ".DB::table('wellness_categories')->pluck('key')->implode(', ')."\n";
    echo "  columns(wellness_courses): ".implode(', ', Schema::getColumnListing('wellness_courses'))."\n";
    echo "  columns(wellness_lessons): ".implode(', ', Schema::getColumnListing('wellness_lessons'))."\n";
    echo "  columns(wellness_categories): ".implode(', ', Schema::getColumnListing('wellness_categories'))."\n";
}

echo "\n=== UNITS ===\n";
if (Schema::hasTable('units')) {
    echo "  columns(units): ".implode(', ', Schema::getColumnListing('units'))."\n";
    echo "  columns(unit_residents): ".(Schema::hasTable('unit_residents') ? implode(', ', Schema::getColumnListing('unit_residents')) : 'no table')."\n";
}

echo "\n=== TABLES A COMMUNITY SEEDER TOUCHES ===\n";
$tables = [
    'amenities', 'bookings', 'amenity_monthly_bills', 'amenity_resident_bills',
    'notices', 'event_rsvps', 'posts', 'post_comments', 'post_likes',
    'listings', 'businesses', 'deals', 'community_rules', 'rule_acknowledgments',
    'community_documents', 'community_feature_flags', 'conversations', 'messages',
    'point_transactions', 'achievements', 'user_achievements', 'notifications',
    'guest_invitations', 'families', 'reports', 'activity_logs',
];
foreach ($tables as $t) {
    printf("  %-26s %s\n", $t, Schema::hasTable($t) ? 'yes' : 'MISSING');
}

echo "\n=== PENDING MIGRATIONS ===\n";
$ran = DB::table('migrations')->pluck('migration')->all();
$files = array_map(
    fn ($p) => basename($p, '.php'),
    glob(__DIR__.'/../database/migrations/*.php') ?: []
);
$pending = array_values(array_diff($files, $ran));
echo $pending ? '  '.implode("\n  ", $pending)."\n" : "  none\n";

echo "\n=== FEATURE FLAGS (keys in use) ===\n";
if (Schema::hasTable('community_feature_flags')) {
    echo '  columns: '.implode(', ', Schema::getColumnListing('community_feature_flags'))."\n";
    echo '  distinct keys: '.(DB::table('community_feature_flags')->distinct()->pluck('feature_key')->implode(', ') ?: '(none set)')."\n";
}
