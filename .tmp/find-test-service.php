<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$tables = ['listings', 'marketplace_listings', 'classifieds', 'services', 'businesses', 'deals'];
foreach ($tables as $table) {
    if (! Schema::hasTable($table)) {
        echo "no_table {$table}\n";
        continue;
    }
    $cols = Schema::getColumnListing($table);
    echo "table {$table} cols=".implode(',', $cols)."\n";
}

$needles = ['%test%', '%dummy%', '%asdf%', '%lorem%', '%sample%'];

foreach (['listings', 'marketplace_listings'] as $table) {
    if (! Schema::hasTable($table)) {
        continue;
    }
    $q = DB::table($table);
    if (Schema::hasColumn($table, 'deleted_at')) {
        $q->whereNull('deleted_at');
    }
    $q->where(function ($inner) use ($table, $needles) {
        foreach ($needles as $needle) {
            $inner->orWhere('title', 'like', $needle);
            if (Schema::hasColumn($table, 'description')) {
                $inner->orWhere('description', 'like', $needle);
            }
            if (Schema::hasColumn($table, 'name')) {
                $inner->orWhere('name', 'like', $needle);
            }
        }
    });
    $rows = $q->limit(50)->get();
    echo "hits_{$table}=".$rows->count()."\n";
    foreach ($rows as $row) {
        echo json_encode($row, JSON_UNESCAPED_SLASHES)."\n";
    }
}

$communities = DB::table('communities')->where('name', 'like', '%Haly%')->get(['id', 'name']);
echo "communities=".$communities->toJson()."\n";
foreach ($communities as $c) {
    if (Schema::hasTable('listings') && Schema::hasColumn('listings', 'community_id')) {
        $listings = DB::table('listings')
            ->when(Schema::hasColumn('listings', 'deleted_at'), fn ($q) => $q->whereNull('deleted_at'))
            ->where('community_id', $c->id)
            ->orderByDesc('id')
            ->limit(40)
            ->get();
        echo "haly_listings=".$listings->count()."\n";
        foreach ($listings as $row) {
            $title = $row->title ?? $row->name ?? '';
            $type = $row->type ?? $row->listing_type ?? '';
            echo "L {$row->id}|{$type}|{$title}|status=".($row->status ?? '')."\n";
        }
    }
}
