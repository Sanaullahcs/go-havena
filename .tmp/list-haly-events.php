<?php

use Illuminate\Support\Facades\DB;

$rows = DB::table('notices')
    ->where('community_id', 52)
    ->whereNull('deleted_at')
    ->orderByDesc('id')
    ->get(['id', 'title', 'category', 'status', 'review_status', 'event_date', 'event_time', 'event_time_end', 'is_pinned', 'location', 'requires_rsvp', 'event_capacity']);

echo "count=".$rows->count()."\n";
foreach ($rows as $row) {
    echo implode('|', [
        $row->id,
        $row->category,
        $row->status,
        $row->review_status,
        $row->title,
        $row->event_date,
        $row->event_time,
        $row->event_time_end,
        'pin='.($row->is_pinned ? '1' : '0'),
        'rsvp='.($row->requires_rsvp ? '1' : '0'),
        $row->location,
    ])."\n";
}
