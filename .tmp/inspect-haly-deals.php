<?php

use Illuminate\Support\Facades\DB;

$rows = DB::table('deals')
    ->where('community_id', 52)
    ->whereNull('deleted_at')
    ->orderBy('id')
    ->get(['id', 'title', 'vendor', 'discount_label', 'location', 'business_id']);

echo "deals=".$rows->count()."\n";
foreach ($rows as $row) {
    echo "{$row->id}|{$row->title}|vendor={$row->vendor}|label={$row->discount_label}|loc={$row->location}|biz={$row->business_id}\n";
}
