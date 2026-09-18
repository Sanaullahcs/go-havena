<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

echo "has_website=".(Schema::hasColumn('businesses', 'website') ? '1' : '0')."\n";
echo "has_menu=".(Schema::hasColumn('businesses', 'menu_items') ? '1' : '0')."\n";

$rows = DB::table('businesses')
    ->where('community_id', 52)
    ->whereNull('deleted_at')
    ->orderBy('id')
    ->get(['id', 'name', 'phone', 'hours', 'address', 'amenities', 'description']);

foreach ($rows as $row) {
    $desc = substr(str_replace(["\n", "\r"], " ", (string) $row->description), 0, 90);
    echo "{$row->id}|{$row->name}|ph=".($row->phone ?: '-')."|hr=".($row->hours ?: '-')."|am=".($row->amenities ?: '-')."|{$desc}\n";
}

$deals = DB::table('deals')->where('community_id', 52)->whereNull('deleted_at')->get(['id', 'business_id', 'title', 'description']);
echo "deals=".$deals->count()."\n";
foreach ($deals as $row) {
    $desc = substr(str_replace(["\n", "\r"], " ", (string) $row->description), 0, 90);
    echo "D{$row->id}|biz={$row->business_id}|{$row->title}|{$desc}\n";
}
