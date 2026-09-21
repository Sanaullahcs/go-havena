<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use App\Services\CommunityBillingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MemberInviteTest extends TestCase
{
    use RefreshDatabase;

    private function seedCommunityAdmin(Community $community): User
    {
        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'phone'                  => '+12015550700',
            'phone_verified_at'      => now(),
            'email'                  => 'admin.invite@example.com',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        return $admin;
    }

    private function seedCommunity(): Community
    {
        $region = Region::query()->create([
            'title'       => 'Invite Region',
            'area'        => 'Invite Area',
            'users_label' => '0 users',
            'sort_order'  => 1,
            'status'      => 'active',
        ]);

        return Community::query()->create([
            'name'          => 'Invite Community',
            'region_id'     => $region->id,
            'region'        => $region->title,
            'status'        => 'active',
            'review_status' => 'approved',
        ]);
    }

    public function test_member_invite_code_claims_placeholder_and_allows_profile_email(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);
        app(CommunityBillingService::class)->activateManualSubscription($community, 'growth');

        $adminToken = $admin->createToken('test')->plainTextToken;
        $inviteResponse = $this->withToken($adminToken)
            ->postJson('/api/v1/admin/members/invite', [
            'name'        => 'Jane Resident',
            'email'       => 'jane.invite@example.com',
            'unit_number' => 'Unit 12B',
        ])->assertCreated();

        $inviteCode = $inviteResponse->json('data.invite_code');
        $invitedUserId = $inviteResponse->json('data.id');
        $this->assertNotEmpty($inviteCode);

        $phone = '+15555550123';

        $this->postJson('/api/v1/auth/otp/request', [
            'phone'  => $phone,
            'intent' => 'signup',
        ])->assertStatus(202);

        $verify = $this->postJson('/api/v1/auth/otp/verify', [
            'phone'  => $phone,
            'code'   => '123456',
            'intent' => 'signup',
            'role'   => 'resident',
        ])->assertOk();

        $token = $verify->json('token');
        $claimantId = $verify->json('user.id');
        $this->assertSame('resident', $verify->json('user.role'));

        $claimant = User::query()->findOrFail($claimantId);
        Sanctum::actingAs($claimant);

        $this->postJson('/api/v1/communities/join-by-invite', ['invite_code' => $inviteCode])
            ->assertCreated()
            ->assertJsonPath('data.invited_profile.email', 'jane.invite@example.com')
            ->assertJsonPath('data.invited_profile.display_name', 'Jane Resident')
            ->assertJsonPath('data.invited_profile.unit_number', 'Unit 12B');

        $this->assertSoftDeleted('users', ['id' => $invitedUserId]);
        $this->assertDatabaseHas('users', [
            'id'    => $claimantId,
            'email' => 'jane.invite@example.com',
        ]);
        $this->assertDatabaseHas('profiles', [
            'user_id'      => $claimantId,
            'display_name' => 'Jane Resident',
            'unit_number'  => 'Unit 12B',
        ]);

        Sanctum::actingAs($claimant);

        $this->putJson('/api/v1/me', [
                'display_name'   => 'Jane Resident',
                'email'          => 'jane.invite@example.com',
                'unit_number'    => 'Unit 12B',
                'residence_type' => 'tenant',
            ])
            ->assertOk()
            ->assertJsonPath('data.email', 'jane.invite@example.com');
    }
}
