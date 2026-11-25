<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$needles = ['%test%', '%dummy%', '%asdf%', '%lorem%', '%sample%', '%todo%'];

function dumpHits(string $table, array $fields): void
{
    if (! Schema::hasTable($table)) {
        echo "skip {$table}\n";
        return;
    }
    $q = DB::table($table);
    if (Schema::hasColumn($table, 'deleted_at')) {
        $q->whereNull('deleted_at');
    }
    $q->where(function ($inner) use ($fields) {
        foreach ($fields as $field) {
            if (! Schema::hasColumn($inner->from ?? '', $field) && ! Schema::hasColumn($GLOBALS['__t'] ?? $field, $field)) {
                // checked below
            }
        }
        foreach ($fields as $field) {
            if (! \Illuminate\Support\Facades\Schema::hasColumn($table, $field)) {
                continue;
            }
            $inner->orWhere($field, 'like', '%test%')
                ->orWhere($field, 'like', '%dummy%')
                ->orWhere($field, 'like', '%lorem%')
                ->orWhere($field, 'like', '%asdf%')
                ->orWhere($field, 'like', '%sample%');
        }
    });
    $rows = $q->limit(80)->get();
    echo "hits_{$table}=".$rows->count()."\n";
    foreach ($rows as $row) {
        $id = $row->id ?? '?';
        $name = $row->title ?? $row->name ?? $row->label ?? '';
        $cid = $row->community_id ?? '';
        echo "  {$table} {$id}|cid={$cid}|{$name}|status=".($row->status ?? '')."\n";
    }
}

dumpHits('listings', ['title', 'description', 'category']);
dumpHits('businesses', ['name', 'description', 'category']);
dumpHits('deals', ['title', 'description', 'vendor', 'discount_label']);
dumpHits('amenities', ['name', 'description', 'title']);
dumpHits('notices', ['title', 'body']);
dumpHits('feed_posts', ['body', 'title']);
dumpHits('wellness_lessons', ['title', 'description']);
dumpHits('nearby_places', ['name', 'category']);

echo "all_listings=".DB::table('listings')->whereNull('deleted_at')->count()."\n";
$latest = DB::table('listings')->whereNull('deleted_at')->orderByDesc('id')->limit(30)->get(['id', 'community_id', 'type', 'title', 'status', 'price']);
foreach ($latest as $row) {
    echo "listing {$row->id}|cid={$row->community_id}|{$row->type}|{$row->title}|{$row->status}|{$row->price}\n";
}

if (Schema::hasTable('amenities')) {
    echo "amenities_haly=".DB::table('amenities')->where('community_id', 52)->when(Schema::hasColumn('amenities', 'deleted_at'), fn ($q) => $q->whereNull('deleted_at'))->count()."\n";
    $ams = DB::table('amenities')->where('community_id', 52)->when(Schema::hasColumn('amenities', 'deleted_at'), fn ($q) => $q->whereNull('deleted_at'))->get(['id', 'name', 'status']);
    foreach ($ams as $row) {
        echo "amenity {$row->id}|{$row->name}|{$row->status}\n";
    }
}
