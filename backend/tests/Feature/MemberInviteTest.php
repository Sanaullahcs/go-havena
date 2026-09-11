<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySeatReservation;
use App\Models\InviteCode;
use App\Models\Region;
use App\Models\User;
use App\Services\CommunityBillingService;
use App\Services\ContactIdentityService;
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
            'phone'       => '+12025550123',
            'unit_number' => 'Unit 12B',
        ])->assertCreated();

        $inviteCode = $inviteResponse->json('data.invite_code');
        $invitedUserId = $inviteResponse->json('data.id');
        $this->assertNotEmpty($inviteCode);

        $this->assertDatabaseMissing('community_memberships', [
            'user_id' => $invitedUserId,
            'community_id' => $community->id,
        ]);

        // Invited resident logging in with the invite email must redeem the code first.
        $this->postJson('/api/v1/auth/otp/request', [
            'email' => 'jane.invite@example.com',
            'intent' => 'login',
        ])->assertStatus(202);

        $invitedLogin = $this->postJson('/api/v1/auth/otp/verify', [
            'email' => 'jane.invite@example.com',
            'code' => '123456',
            'intent' => 'login',
        ])->assertOk();

        $this->assertTrue($invitedLogin->json('user.needs_invite_code'));
        $this->assertSame([], $invitedLogin->json('user.memberships') ?? []);

        $email = 'invite.claimant@example.com';

        $this->postJson('/api/v1/auth/otp/request', [
            'email'  => $email,
            'intent' => 'signup',
        ])->assertStatus(202);

        $verify = $this->postJson('/api/v1/auth/otp/verify', [
            'email'  => $email,
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
        $this->assertDatabaseHas('community_memberships', [
            'user_id'          => $claimantId,
            'community_id'     => $community->id,
            'status'           => 'approved',
            'invite_code_used' => $inviteCode,
        ]);

        Sanctum::actingAs($claimant);

        $this->putJson('/api/v1/me', [
                'display_name'   => 'Jane Resident',
                'email'          => 'jane.invite@example.com',
                'unit_number'    => 'Unit 12B',
                'residence_type' => 'tenant',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['utility_bill']);

        $claimant->unsetRelation('profile');
        $claimant->profile()->update(['utility_bill_url' => '/storage/utility-bills/jane.jpg']);
        $claimant->refresh();

        $this->putJson('/api/v1/me', [
                'display_name'   => 'Jane Resident',
                'email'          => 'jane.invite@example.com',
                'unit_number'    => 'Unit 12B',
                'residence_type' => 'tenant',
            ])
            ->assertOk()
            ->assertJsonPath('data.email', 'jane.invite@example.com');
    }

    public function test_community_admin_can_cancel_onboarding_invitation_without_deleting_user(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);
        $billing = app(CommunityBillingService::class);
        $billing->activateManualSubscription($community, 'growth');

        Sanctum::actingAs($admin);

        $inviteResponse = $this->postJson('/api/v1/admin/members/invite', [
            'name'        => 'Onboarding Resident',
            'email'       => 'onboarding.resident@example.com',
            'phone'       => '+12025550999',
            'unit_number' => 'Unit 8',
        ])->assertCreated();

        $inviteCode = $inviteResponse->json('data.invite_code');
        $invitedUserId = (int) $inviteResponse->json('data.id');
        $seatsAfterInvite = $billing->seatsUsed($community->id);

        $invited = $this->getJson('/api/v1/admin/members?status=invitation_sent&role=member')
            ->assertOk();
        $this->assertSame(1, $invited->json('meta.stats.invitation_sent'));
        $this->assertSame(0, $invited->json('meta.stats.onboarding'));
        $this->assertTrue(collect($invited->json('data'))->contains(
            fn ($row) => (int) $row['id'] === $invitedUserId && $row['status'] === 'invitation_sent',
        ));

        $onboarding = $this->getJson('/api/v1/admin/members?status=onboarding&role=member')
            ->assertOk();
        $this->assertSame(0, $onboarding->json('meta.stats.onboarding'));
        $this->assertFalse(collect($onboarding->json('data'))->contains(fn ($row) => (int) $row['id'] === $invitedUserId));

        $this->deleteJson("/api/v1/admin/members/{$invitedUserId}")
            ->assertOk()
            ->assertJsonPath('message', 'Invitation cancelled successfully.');

        $this->assertDatabaseHas('users', [
            'id' => $invitedUserId,
            'email' => 'onboarding.resident@example.com',
            'status' => 'active',
            'deleted_at' => null,
        ]);
        $this->assertSoftDeleted('invite_codes', [
            'code' => $inviteCode,
            'invited_user_id' => $invitedUserId,
            'community_id' => $community->id,
        ]);
        $this->assertDatabaseHas('community_seat_reservations', [
            'community_id' => $community->id,
            'user_id' => $invitedUserId,
            'status' => CommunitySeatReservation::STATUS_RELEASED,
        ]);
        $this->assertLessThan($seatsAfterInvite, $billing->seatsUsed($community->id));

        $after = $this->getJson('/api/v1/admin/members?status=invitation_sent&role=member')
            ->assertOk();
        $this->assertSame(0, $after->json('meta.stats.invitation_sent'));
        $this->assertSame(0, $after->json('meta.stats.onboarding'));
        $this->assertFalse(collect($after->json('data'))->contains(fn ($row) => (int) $row['id'] === $invitedUserId));

        $claimant = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'email' => 'late.claimer@example.com',
        ]);
        Sanctum::actingAs($claimant);

        $this->postJson('/api/v1/communities/join-by-invite', ['invite_code' => $inviteCode])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['invite_code']);

        $this->assertNull(InviteCode::query()->where('code', $inviteCode)->first());
    }

    public function test_invite_status_moves_invitation_sent_to_onboarding_then_active(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);
        app(CommunityBillingService::class)->activateManualSubscription($community, 'growth');
        Sanctum::actingAs($admin);

        $inviteResponse = $this->postJson('/api/v1/admin/members/invite', [
            'name'        => 'Status Resident',
            'email'       => 'status.resident@example.com',
            'phone'       => '+12025550888',
            'unit_number' => 'Unit 3',
        ])->assertCreated();

        $inviteCode = $inviteResponse->json('data.invite_code');
        $invitedUserId = (int) $inviteResponse->json('data.id');

        $afterInvite = $this->getJson('/api/v1/admin/members?role=member')->assertOk();
        $invitedRow = collect($afterInvite->json('data'))->first(fn ($row) => (int) $row['id'] === $invitedUserId);
        $this->assertSame('invitation_sent', $invitedRow['status']);
        $this->assertSame(1, $afterInvite->json('meta.stats.invitation_sent'));
        $this->assertSame(0, $afterInvite->json('meta.stats.onboarding'));

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => 'status.resident@example.com',
            'intent' => 'login',
        ])->assertStatus(202);

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => 'status.resident@example.com',
            'code' => '123456',
            'intent' => 'login',
        ])->assertOk();

        Sanctum::actingAs($admin);
        $afterSignup = $this->getJson('/api/v1/admin/members?role=member')->assertOk();
        $onboardingRow = collect($afterSignup->json('data'))->first(fn ($row) => (int) $row['id'] === $invitedUserId);
        $this->assertSame('onboarding', $onboardingRow['status']);
        $this->assertSame(0, $afterSignup->json('meta.stats.invitation_sent'));
        $this->assertSame(1, $afterSignup->json('meta.stats.onboarding'));

        Sanctum::actingAs(User::query()->findOrFail($invitedUserId));
        $this->postJson('/api/v1/communities/join-by-invite', ['invite_code' => $inviteCode])
            ->assertCreated()
            ->assertJsonPath('data.membership.status', 'approved');

        Sanctum::actingAs($admin);
        $afterJoin = $this->getJson('/api/v1/admin/members?role=member')->assertOk();
        $activeRow = collect($afterJoin->json('data'))->first(fn ($row) => (int) $row['id'] === $invitedUserId);
        $this->assertSame('approved', $activeRow['status']);
        $this->assertSame(0, $afterJoin->json('meta.stats.invitation_sent'));
        $this->assertSame(0, $afterJoin->json('meta.stats.onboarding'));
        $this->assertSame(1, $afterJoin->json('meta.stats.approved'));
    }

    public function test_member_invite_rejects_duplicate_phone_instead_of_server_error(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);
        app(CommunityBillingService::class)->activateManualSubscription($community, 'growth');
        Sanctum::actingAs($admin);

        $existing = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'email'  => 'already.here@example.com',
            'phone'  => '+12345678987',
        ]);
        $existing->delete();

        $this->postJson('/api/v1/admin/members/invite', [
            'name'        => 'Zara Resident',
            'email'       => 'za1@gmail.com',
            'phone'       => '+12345678987',
            'unit_number' => '12',
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'CONTACT_ALREADY_EXISTS')
            ->assertJsonPath('message', ContactIdentityService::DUPLICATE_PHONE_MESSAGE)
            ->assertJsonPath('errors.phone.0', ContactIdentityService::DUPLICATE_PHONE_MESSAGE);

        $this->assertDatabaseMissing('users', [
            'email' => 'za1@gmail.com',
            'deleted_at' => null,
        ]);
    }

    public function test_member_invite_rejects_invalid_name_and_unit(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);
        app(CommunityBillingService::class)->activateManualSubscription($community, 'growth');
        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/admin/members/invite', [
            'name'        => 'Jane 2',
            'email'       => 'jane.invalid@example.com',
            'phone'       => '+12025550123',
            'unit_number' => 'B-12',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name']);

        $this->postJson('/api/v1/admin/members/invite', [
            'name'        => 'Jane Resident',
            'email'       => 'jane.invalid.unit@example.com',
            'phone'       => '+12025550124',
            'unit_number' => 'B21+[',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['unit_number'])
            ->assertJsonPath('errors.unit_number.0', 'Please enter a valid Unit / Apartment number.');

        $this->postJson('/api/v1/admin/members/invite', [
            'name'        => str_repeat('A', 26),
            'email'       => 'jane.long@example.com',
            'phone'       => '+12025550125',
            'unit_number' => str_repeat('B', 21),
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'unit_number']);
    }
}
