<?php

use Illuminate\Support\Facades\DB;

$rows = DB::table('businesses')
    ->where('community_id', 52)
    ->whereNull('deleted_at')
    ->orderBy('id')
    ->get(['id', 'name', 'image_url']);

echo "biz=".$rows->count()."\n";
foreach ($rows as $row) {
    echo "{$row->id}|{$row->name}|".($row->image_url ?? 'null')."\n";
}
