<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\InviteCode;
use App\Models\Region;
use App\Models\User;
use App\Support\OnboardingContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OnboardingContextTest extends TestCase
{
    use RefreshDatabase;

    public function test_invited_resident_with_pending_invite_code_is_admin_onboarding(): void
    {
        $region = Region::query()->create([
            'title' => 'Test Region',
            'area' => 'Area',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);
        $community = Community::query()->create([
            'name' => 'Test Community',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);
        $user = User::factory()->create(['role' => 'resident']);
        InviteCode::query()->create([
            'community_id' => $community->id,
            'code' => 'NBR-TEST-1234',
            'invited_user_id' => $user->id,
            'max_uses' => 1,
            'used_count' => 0,
        ]);

        $this->assertTrue(OnboardingContext::invitedByAdmin($user));
    }

    public function test_provisioned_resident_with_same_second_membership_is_admin_onboarding(): void
    {
        $region = Region::query()->create([
            'title' => 'Test Region',
            'area' => 'Area',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);
        $community = Community::query()->create([
            'name' => 'Test Community',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);
        $now = now();
        $user = User::factory()->create([
            'role' => 'resident',
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        CommunityMembership::query()->create([
            'user_id' => $user->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $this->assertTrue(OnboardingContext::invitedByAdmin($user->fresh('memberships')));
    }
}
