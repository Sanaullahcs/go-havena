<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$needle = '%mahnoor%';
$emailCols = [];
foreach (Schema::getTableListing() as $table) {
    foreach (Schema::getColumnListing($table) as $col) {
        if (! str_contains(strtolower($col), 'email')) {
            continue;
        }
        try {
            $count = DB::table($table)->where($col, 'like', $needle)->count();
        } catch (\Throwable $e) {
            continue;
        }
        echo "check {$table}.{$col}={$count}\n";
        if ($count > 0) {
            $emailCols[] = "{$table}.{$col}={$count}";
        }
    }
}

$users = DB::table('users')->where('email', 'like', $needle)->count();
echo "users_email={$users}\n";
echo "leftover_email_columns=".(count($emailCols) ? implode(',', $emailCols) : 'none')."\n";
