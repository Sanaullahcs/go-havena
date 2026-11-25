<?php

/**
 * Column listings for every table the Haly Tower seeder needs to populate.
 *
 * Usage: php scripts/probe-haly-schema.php
 */

require __DIR__.'/../vendor/autoload.php';

$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$groups = [
    'identity' => ['communities', 'community_subscriptions', 'invite_codes', 'community_feature_flags', 'units', 'unit_residents', 'profiles'],
    'wellness' => ['wellness_categories', 'wellness_courses', 'wellness_lessons', 'wellness_lesson_progress', 'wellness_progress'],
    'points' => ['point_transactions', 'point_rules', 'user_points', 'leaderboard_snapshots'],
    'messaging' => ['conversations', 'conversation_participants', 'messages'],
    'family' => ['families', 'family_members', 'family_join_requests', 'family_add_member_requests'],
    'guests' => ['guest_invitations', 'guest_access_logs'],
    'misc' => ['reports', 'activity_logs', 'devices', 'nearby_places', 'referrals', 'referral_attributions'],
];

foreach ($groups as $group => $tables) {
    echo "\n######## {$group} ########\n";
    foreach ($tables as $table) {
        if (! Schema::hasTable($table)) {
            printf("  %-28s MISSING\n", $table);

            continue;
        }
        printf("  %s (rows=%d)\n", $table, DB::table($table)->count());
        foreach (DB::select('SHOW COLUMNS FROM '.$table) as $col) {
            printf("      %-30s %-46s null=%-3s def=%s\n", $col->Field, $col->Type, $col->Null, $col->Default ?? 'NULL');
        }
    }
}

echo "\n######## every table in the schema ########\n";
$all = array_map(fn ($r) => array_values((array) $r)[0], DB::select('SHOW TABLES'));
sort($all);
echo '  '.implode("\n  ", $all)."\n";

echo "\n######## currency hints ########\n";
foreach (['communities', 'amenities', 'deals', 'listings', 'community_subscriptions'] as $table) {
    $cols = array_filter(Schema::getColumnListing($table), fn ($c) => str_contains($c, 'currency') || str_contains($c, 'locale'));
    printf("  %-26s %s\n", $table, $cols ? implode(', ', $cols) : '(no currency/locale column)');
}
