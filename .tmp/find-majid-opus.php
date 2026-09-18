<?php

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\User;
use App\Services\AdminRoleService;
use App\Services\CommunityLifecycleService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$users = User::query()
    ->where(function ($q) {
        $q->where('email', 'like', '%majid%')
            ->orWhere('name', 'like', '%majid%')
            ->orWhere('name', 'like', '%Majid%');
    })
    ->get();

echo "users=".$users->count()."\n";
foreach ($users as $user) {
    echo "user {$user->id} email={$user->email} name={$user->name} role={$user->role} admin={$user->community_admin_status} status={$user->status} susp=".($user->suspension_reason ?? 'null')."\n";
}

$community = Community::query()->where('name', 'like', '%Opus Luxury%')->first();
if ($community) {
    echo "community {$community->id} {$community->name} status={$community->status} review={$community->review_status} requested_by=".($community->requested_by_user_id ?? 'null')."\n";
}

foreach ($users as $user) {
    $rows = CommunityMembership::query()->where('user_id', $user->id)->orderBy('id')->get();
    echo "memberships_for_{$user->id}=".$rows->count()."\n";
    foreach ($rows as $row) {
        $cname = Community::query()->where('id', $row->community_id)->value('name');
        echo "membership {$row->id} community={$row->community_id} {$cname} role={$row->role} status={$row->status}\n";
    }
}

if ($community) {
    $admins = CommunityMembership::query()
        ->where('community_id', $community->id)
        ->where('role', 'admin')
        ->orderBy('id')
        ->get();
    echo "opus_admin_memberships=".$admins->count()."\n";
    foreach ($admins as $row) {
        $u = User::query()->find($row->user_id);
        echo "opus_admin {$row->id} user={$row->user_id} {$u?->email} {$u?->name} role={$u?->role} admin={$u?->community_admin_status} user_status={$u?->status} mem_status={$row->status}\n";
    }
}

$profileCols = Schema::hasTable('profiles') ? Schema::getColumnListing('profiles') : [];
echo "has_profiles=".(Schema::hasTable('profiles') ? 'yes' : 'no')."\n";
