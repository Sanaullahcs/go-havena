<?php

use App\Services\ActivityLogService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$amenity = DB::table('amenities')->where('id', 36)->where('community_id', 52)->first();
if (! $amenity) {
    echo "missing amenity 36\n";
    exit(0);
}

echo "found {$amenity->id} {$amenity->name}\n";

$bookings = DB::table('bookings')->where('amenity_id', 36)->count();
echo "bookings={$bookings}\n";

if (Schema::hasTable('amenity_monthly_bills')) {
    $monthly = DB::table('amenity_monthly_bills')->where('amenity_id', 36)->count();
    echo "monthly_bills={$monthly}\n";
    if ($monthly > 0) {
        $ids = DB::table('amenity_monthly_bills')->where('amenity_id', 36)->pluck('id');
        if (Schema::hasTable('amenity_resident_bills')) {
            DB::table('amenity_resident_bills')->whereIn('monthly_bill_id', $ids)->delete();
        }
        DB::table('amenity_monthly_bills')->where('amenity_id', 36)->delete();
        echo "cleared_monthly_bills={$monthly}\n";
    }
}

if (Schema::hasTable('amenity_resident_bills')) {
    $residents = DB::table('amenity_resident_bills')->where('amenity_id', 36)->delete();
    echo "cleared_resident_bills={$residents}\n";
}

DB::table('bookings')->where('amenity_id', 36)->delete();
DB::table('amenities')->where('id', 36)->where('community_id', 52)->delete();

if (class_exists(ActivityLogService::class)) {
    ActivityLogService::user('amenity_deleted', 'Deleted test amenity on Haly Tower', 'Amenity', 36);
}

$left = DB::table('amenities')->where('community_id', 52)->get(['id', 'name', 'status']);
echo "haly_left=".$left->count()."\n";
foreach ($left as $row) {
    echo "  {$row->id}|{$row->name}|{$row->status}\n";
}

$faker = DB::table('amenities')
    ->where(function ($q) {
        $q->where('name', 'like', '%asperiores%')
            ->orWhere('name', 'like', '%dignissimos%')
            ->orWhere('name', 'like', '%lorem%')
            ->orWhere('description', 'like', '%Facere non%')
            ->orWhere('floor', 'like', '%Architecto%');
    })
    ->get(['id', 'community_id', 'name']);
echo "other_faker=".$faker->count()."\n";
foreach ($faker as $row) {
    echo "  {$row->id}|cid={$row->community_id}|{$row->name}\n";
}

echo "done\n";
