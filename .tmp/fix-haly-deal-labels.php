<?php

use Illuminate\Support\Facades\DB;

$rows = DB::table('deals as d')
    ->leftJoin('businesses as b', 'b.id', '=', 'd.business_id')
    ->where('d.community_id', 52)
    ->whereNull('d.deleted_at')
    ->get(['d.id', 'd.title', 'd.vendor', 'd.discount_label', 'b.name as business_name']);

foreach ($rows as $row) {
    $name = trim((string) ($row->business_name ?: $row->vendor));
    if ($name === '') {
        continue;
    }
    DB::table('deals')->where('id', $row->id)->update([
        'title' => $name,
        'vendor' => $name,
        'discount_label' => $name,
        'updated_at' => now(),
    ]);
    echo "deal {$row->id} {$row->discount_label} -> {$name}\n";
}

echo "updated=".$rows->count()."\n";
