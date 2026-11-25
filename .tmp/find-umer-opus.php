<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$user = User::query()->where('email', 'umer@namuve.com')->first();
echo "user {$user->id} {$user->email} {$user->name} role={$user->role} admin={$user->community_admin_status}\n";

$cols = Schema::getColumnListing('communities');
echo "community_cols=".implode(',', $cols)."\n";

$q = DB::table('communities')->where('name', 'like', '%opus%');
if (in_array('deleted_at', $cols, true)) {
    $q->whereNull('deleted_at');
}
$communities = $q->get();
echo "communities=".$communities->count()."\n";
foreach ($communities as $c) {
    echo "community {$c->id} {$c->name}\n";
}

$rows = DB::table('community_memberships')
    ->where('user_id', $user->id)
    ->orderBy('id')
    ->get();
echo "memberships=".$rows->count()."\n";
foreach ($rows as $row) {
    $cname = DB::table('communities')->where('id', $row->community_id)->value('name');
    echo "membership {$row->id} community={$row->community_id} {$cname} role={$row->role} status={$row->status}\n";
}

$admins = DB::table('community_memberships')
    ->whereIn('community_id', $communities->pluck('id'))
    ->whereIn('role', ['admin', 'community_admin'])
    ->orderBy('id')
    ->get();
echo "opus_admins=".$admins->count()."\n";
foreach ($admins as $row) {
    $u = User::query()->find($row->user_id);
    echo "admin_membership {$row->id} user={$row->user_id} {$u?->email} role={$row->role} status={$row->status}\n";
}
