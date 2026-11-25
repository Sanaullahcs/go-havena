<?php

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$needle = '%mahnoor%';
$ids = [74, 76, 85, 86, 87, 89, 90, 97];

foreach (Schema::getTableListing() as $table) {
    $cols = Schema::getColumnListing($table);
    foreach ($cols as $col) {
        try {
            $count = DB::table($table)->where($col, 'like', $needle)->count();
        } catch (\Throwable $e) {
            continue;
        }
        if ($count > 0) {
            echo "hit {$table}.{$col} count={$count}\n";
            $rows = DB::table($table)->where($col, 'like', $needle)->limit(15)->get(['id', $col]);
            foreach ($rows as $row) {
                echo "  id=".($row->id ?? '?')." {$col}=".($row->{$col} ?? '')."\n";
            }
        }
    }
}

$community = Community::query()->find(51);
echo "valensia id={$community?->id} name={$community?->name} status={$community?->status} review={$community?->review_status} requested_by=".($community?->requested_by_user_id ?? 'null')."\n";

$members = CommunityMembership::query()->where('community_id', 51)->get();
echo "valensia_memberships=".$members->count()."\n";
foreach ($members as $m) {
    $u = User::withTrashed()->find($m->user_id);
    echo "  mem {$m->id} user={$m->user_id} {$u?->email} role={$m->role} status={$m->status}\n";
}

foreach ($ids as $id) {
    $tokenCount = Schema::hasTable('personal_access_tokens')
        ? DB::table('personal_access_tokens')->where('tokenable_id', $id)->count()
        : 0;
    $inviteCount = Schema::hasTable('invite_codes')
        ? DB::table('invite_codes')->where('invited_user_id', $id)->orWhere('created_by', $id)->count()
        : 0;
    echo "user {$id} tokens={$tokenCount} invites={$inviteCount}\n";
}

echo "user_soft_deletes=".(in_array('deleted_at', Schema::getColumnListing('users'), true) ? 'yes' : 'no')."\n";
