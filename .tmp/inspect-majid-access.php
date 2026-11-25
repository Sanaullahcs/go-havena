<?php

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\User;
use App\Services\CommunityAdminAccessService;
use Illuminate\Support\Facades\DB;

$user = User::query()->with(['profile', 'memberships.community'])->findOrFail(131);
$access = app(CommunityAdminAccessService::class)->accessPayload($user);
$profile = $user->profile;

echo "user={$user->id} {$user->email} role={$user->role} admin={$user->community_admin_status} status={$user->status}\n";
echo "profile display=".($profile?->display_name ?? 'null')." unit=".($profile?->unit_number ?? 'null')." util=".($profile?->utility_bill_url ? 'yes' : 'no')." created=".($profile?->created_at ?? 'null')." updated=".($profile?->updated_at ?? 'null')."\n";
echo "access next={$access['next_step']} platform=".($access['platform_approved'] ? 'yes' : 'no')." billing=".($access['billing_complete'] ? 'yes' : 'no')." profile=".($access['profile_complete'] ? 'yes' : 'no')." mobile=".($access['can_use_mobile_app'] ? 'yes' : 'no')." community=".($access['community_id'] ?? 'null')." sub=".($access['subscription_status'] ?? 'null')." exempt=".($access['billing_exempt'] ? 'yes' : 'no')."\n";
echo "blocking=".implode(',', $access['blocking_reasons'])."\n";

$sub = DB::table('community_subscriptions')->where('community_id', 43)->first();
if ($sub) {
    echo "sub id={$sub->id} status={$sub->status} plan=".($sub->plan_slug ?? 'null')." card=".(!empty($sub->stripe_payment_method_id) ? 'yes' : 'no')."\n";
} else {
    echo "sub=none\n";
}

$mem = CommunityMembership::query()->find(95);
echo "membership 95 status={$mem?->status} role={$mem?->role} created={$mem?->created_at} updated={$mem?->updated_at}\n";
