<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

foreach (['amenity_bookings', 'bookings', 'amenity_bills', 'amenity_resident_bills', 'shared_bills'] as $table) {
    if (! Schema::hasTable($table)) {
        echo "no {$table}\n";
        continue;
    }
    echo "table {$table} cols=".implode(',', Schema::getColumnListing($table))."\n";
    $q = DB::table($table);
    if (Schema::hasColumn($table, 'amenity_id')) {
        $count = (clone $q)->where('amenity_id', 36)->count();
        echo "  amenity_36_rows={$count}\n";
    }
}
