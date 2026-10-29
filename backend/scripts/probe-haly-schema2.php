<?php

/**
 * Columns for the newer feature tables the Haly demo should exercise.
 *
 * Usage: php scripts/probe-haly-schema2.php
 */

require __DIR__.'/../vendor/autoload.php';

$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$tables = [
    'polls', 'poll_options', 'poll_votes',
    'property_services', 'unit_service_subscriptions', 'unit_service_bills',
    'booking_slot_allocations',
    'agreements', 'agreement_recipients',
    'app_notifications',
    'community_document_categories', 'community_rule_categories',
    'referral_codes', 'referral_program_settings',
    'user_daily_logins', 'comment_likes', 'deal_saves', 'listing_saves',
    'wellness_content',
];

foreach ($tables as $table) {
    if (! Schema::hasTable($table)) {
        printf("\n%s  MISSING\n", $table);

        continue;
    }
    printf("\n%s (rows=%d)\n", $table, DB::table($table)->count());
    foreach (DB::select('SHOW COLUMNS FROM '.$table) as $col) {
        printf("    %-30s %-60s null=%-3s def=%s\n", $col->Field, $col->Type, $col->Null, $col->Default ?? 'NULL');
    }
}

echo "\n==== sample property_services rows ====\n";
if (Schema::hasTable('property_services')) {
    foreach (DB::table('property_services')->limit(10)->get() as $row) {
        echo '  '.json_encode($row, JSON_UNESCAPED_SLASHES)."\n";
    }
}

echo "\n==== amenities columns (current) ====\n";
echo '  '.implode(', ', Schema::getColumnListing('amenities'))."\n";
echo "\n==== notices columns (current) ====\n";
echo '  '.implode(', ', Schema::getColumnListing('notices'))."\n";
echo "\n==== posts columns (current) ====\n";
echo '  '.implode(', ', Schema::getColumnListing('posts'))."\n";
echo "\n==== bookings columns (current) ====\n";
echo '  '.implode(', ', Schema::getColumnListing('bookings'))."\n";
echo "\n==== businesses columns (current) ====\n";
echo '  '.implode(', ', Schema::getColumnListing('businesses'))."\n";
echo "\n==== deals columns (current) ====\n";
echo '  '.implode(', ', Schema::getColumnListing('deals'))."\n";
echo "\n==== listings columns (current) ====\n";
echo '  '.implode(', ', Schema::getColumnListing('listings'))."\n";
