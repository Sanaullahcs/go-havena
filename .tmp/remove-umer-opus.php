<?php

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\User;
use App\Services\CommunityLifecycleService;
use Illuminate\Support\Facades\DB;

$user = User::query()->where('email', 'umer@namuve.com')->firstOrFail();
$community = Community::query()
    ->where('name', 'like', '%Opus Luxury%')
    ->whereNull('deleted_at')
    ->firstOrFail();

echo "before user={$user->id} {$user->email} role={$user->role} admin={$user->community_admin_status} status={$user->status}\n";
echo "before community={$community->id} {$community->name} status={$community->status} requested_by=".($community->requested_by_user_id ?? 'null')."\n";

$memberships = CommunityMembership::query()
    ->where('user_id', $user->id)
    ->where('community_id', $community->id)
    ->get();

echo "target_memberships=".$memberships->count()."\n";
foreach ($memberships as $m) {
    echo "target membership {$m->id} role={$m->role} status={$m->status}\n";
}

$otherMembers = CommunityMembership::query()
    ->where('community_id', $community->id)
    ->where('user_id', '!=', $user->id)
    ->count();
echo "other_members={$otherMembers}\n";

DB::transaction(function () use ($user, $community) {
    CommunityMembership::query()
        ->where('user_id', $user->id)
        ->where('community_id', $community->id)
        ->where('role', 'admin')
        ->whereIn('status', ['approved', 'pending'])
        ->update(['status' => 'banned']);

    if ((int) $community->requested_by_user_id === (int) $user->id) {
        $community->update(['requested_by_user_id' => null]);
    }
});

$user->refresh();
$community->refresh();
$lifecycle = app(CommunityLifecycleService::class);

$afterMemberships = CommunityMembership::query()
    ->where('user_id', $user->id)
    ->orderBy('id')
    ->get();
echo "after_user_memberships=".$afterMemberships->count()."\n";
foreach ($afterMemberships as $m) {
    echo "after membership {$m->id} community={$m->community_id} role={$m->role} status={$m->status}\n";
}

$opusAdmins = CommunityMembership::query()
    ->where('community_id', $community->id)
    ->where('role', 'admin')
    ->where('status', 'approved')
    ->get();
echo "opus_approved_admins=".$opusAdmins->count()."\n";
echo "after user role={$user->role} admin={$user->community_admin_status} status={$user->status}\n";
echo "after community status={$community->status} requested_by=".($community->requested_by_user_id ?? 'null')."\n";
echo "has_admin_assigned=".($lifecycle->hasCommunityAdminAssigned($community) ? 'yes' : 'no')."\n";
echo "needs_reassign=".(in_array($community->id, $lifecycle->communityIdsNeedingAdminReassignment(), true) ? 'yes' : 'no')."\n";
