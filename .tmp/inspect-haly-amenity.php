<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$row = DB::table('amenities')->where('id', 36)->first();
echo json_encode($row, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)."\n";

echo "cols=".implode(',', Schema::getColumnListing('amenities'))."\n";

$all = DB::table('amenities')->where('community_id', 52)->get(['id', 'name', 'status', 'deleted_at']);
echo "all_haly=".$all->toJson()."\n";

$notices = DB::table('notices')->where('community_id', 52)->whereNull('deleted_at')->get(['id', 'title', 'category', 'status']);
echo "haly_notices=".$notices->toJson()."\n";
