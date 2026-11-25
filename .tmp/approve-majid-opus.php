<?php

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\User;
use App\Services\CommunityAdminAccessService;
use App\Services\CommunityLifecycleService;

$user = User::query()->findOrFail(131);
$community = Community::query()->findOrFail(43);

echo "before membership=".CommunityMembership::query()->where('user_id', 131)->where('community_id', 43)->value('status')."\n";

$assigned = app(CommunityLifecycleService::class)->assignCommunityAdmin($community, $user);

$access = app(CommunityAdminAccessService::class)->accessPayload($assigned);
$mem = CommunityMembership::query()->where('user_id', 131)->where('community_id', 43)->first();
$umer = CommunityMembership::query()->where('user_id', 59)->where('community_id', 43)->first();

echo "after user={$assigned->id} {$assigned->email} role={$assigned->role} admin={$assigned->community_admin_status} status={$assigned->status}\n";
echo "after membership {$mem?->id} role={$mem?->role} status={$mem?->status}\n";
echo "umer membership status=".($umer?->status ?? 'none')."\n";
echo "access next={$access['next_step']} platform=".($access['platform_approved'] ? 'yes' : 'no')." billing=".($access['billing_complete'] ? 'yes' : 'no')." profile=".($access['profile_complete'] ? 'yes' : 'no')." mobile=".($access['can_use_mobile_app'] ? 'yes' : 'no')." community=".($access['community_id'] ?? 'null')."\n";
echo "blocking=".implode(',', $access['blocking_reasons'])."\n";
echo "has_admin_assigned=".(app(CommunityLifecycleService::class)->hasCommunityAdminAssigned($community->fresh()) ? 'yes' : 'no')."\n";
