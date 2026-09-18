<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$community = DB::table('communities')->where('name', 'like', '%Haly Tower%')->first();
echo "community=".($community->id ?? 'none')." ".($community->name ?? '')."\n";
if (! $community) {
    exit(1);
}

$cols = Schema::getColumnListing('notices');
echo "cols=".implode(',', $cols)."\n";

$rows = DB::table('notices')
    ->where('community_id', $community->id)
    ->whereNull('deleted_at')
    ->orderByDesc('id')
    ->get();

echo "count=".$rows->count()."\n";
foreach ($rows as $row) {
    echo implode('|', [
        $row->id,
        $row->category ?? '',
        $row->status ?? '',
        $row->title ?? '',
        'pin='.(($row->is_pinned ?? 0) ? '1' : '0'),
        'date='.($row->event_date ?? ''),
        'img='.($row->image_url ?? ''),
    ])."\n";
}
