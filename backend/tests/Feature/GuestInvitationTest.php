<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\GuestInvitation;
use App\Models\Region;
use App\Models\User;
use App\Services\GuestAccessService;
use App\Services\OtpService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class GuestInvitationTest extends TestCase
{
    use RefreshDatabase;

    private function seedCommunityAdmin(): array
    {
        $region = Region::query()->create([
            'title'       => 'Test Region',
            'area'        => 'Test Area',
            'users_label' => '0 users',
            'sort_order'  => 1,
            'status'      => 'active',
        ]);

        $community = Community::query()->create([
            'name'          => 'Test Community',
            'region_id'     => $region->id,
            'region'        => $region->title,
            'status'        => 'active',
            'review_status' => 'approved',
        ]);

        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'phone'                  => '+12015555555',
            'phone_verified_at'      => now(),
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        return [$community, $admin];
    }

    private function seedResident(Community $community): User
    {
        $resident = User::factory()->create([
            'role'              => 'resident',
            'phone'             => '+12018888888',
            'phone_verified_at' => now(),
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $resident->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        return $resident;
    }

    public function test_admin_can_invite_guest(): void
    {
        [$community, $admin] = $this->seedCommunityAdmin();
        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/v1/admin/guests/invite', [
            'guest_name'  => 'Jane Guest',
            'guest_email' => 'jane@example.com',
            'guest_phone' => '+15551234567',
            'starts_at'   => now()->addHour()->toIso8601String(),
            'ends_at'     => now()->addDay()->toIso8601String(),
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.guest_name', 'Jane Guest')
            ->assertJsonPath('data.invitation_type', 'admin')
            ->assertJsonPath('data.status', 'pending_verification');

        $this->assertDatabaseHas('guest_invitations', [
            'community_id'    => $community->id,
            'guest_name'      => 'Jane Guest',
            'invitation_type' => 'admin',
        ]);
    }

    public function test_resident_can_invite_guest(): void
    {
        [$community, $admin] = $this->seedCommunityAdmin();
        $resident = $this->seedResident($community);
        Sanctum::actingAs($resident);

        $response = $this->postJson('/api/v1/guest-invitations', [
            'guest_name'  => 'Bob Visitor',
            'guest_phone' => '+15559876543',
            'starts_at'   => now()->addHour()->toIso8601String(),
            'ends_at'     => now()->addDays(2)->toIso8601String(),
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.invitation_type', 'resident');

        $this->assertDatabaseHas('guest_invitations', [
            'invited_by_user_id' => $resident->id,
            'invitation_type'    => 'resident',
        ]);
    }

    public function test_admin_can_invite_guest_for_one_hour_window(): void
    {
        [$community, $admin] = $this->seedCommunityAdmin();
        Sanctum::actingAs($admin);

        $startsAt = now()->addMinutes(5);
        $endsAt = $startsAt->copy()->addHour();

        $response = $this->postJson('/api/v1/admin/guests/invite', [
            'guest_name'  => 'One Hour Guest',
            'guest_email' => 'onehour@example.com',
            'guest_phone' => '+15550001111',
            'starts_at'   => $startsAt->toIso8601String(),
            'ends_at'     => $endsAt->toIso8601String(),
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.guest_name', 'One Hour Guest');

        $this->assertDatabaseHas('guest_invitations', [
            'community_id' => $community->id,
            'guest_name'   => 'One Hour Guest',
            'guest_phone'  => '+15550001111',
        ]);
    }

    public function test_guest_verify_flow_admin_invite_requires_admin_approval(): void
    {
        [$community, $admin] = $this->seedCommunityAdmin();
        Sanctum::actingAs($admin);

        $create = $this->postJson('/api/v1/admin/guests/invite', [
            'guest_name'  => 'Active Guest',
            'guest_email' => 'activeguest@example.com',
            'guest_phone' => '+15551112222',
            'starts_at'   => now()->subHour()->toIso8601String(),
            'ends_at'     => now()->addDay()->toIso8601String(),
        ])->json('data');

        app(OtpService::class)->send('+15551112222');

        $verify = $this->postJson('/api/v1/auth/guest/verify-invite', [
            'phone'       => '+15551112222',
            'code'        => '123456',
            'invite_code' => $create['invite_code'],
        ]);

        $verify->assertOk()
            ->assertJsonPath('invitation_status', 'pending_approval')
            ->assertJsonPath('user.guest_access.status', 'pending_approval')
            ->assertJsonPath('user.guest_access.can_access_dashboard', false)
            ->assertJsonStructure(['token', 'user']);

        Sanctum::actingAs($admin);

        $invitation = GuestInvitation::query()->where('invite_code', $create['invite_code'])->firstOrFail();
        $this->patchJson("/api/v1/admin/guests/{$invitation->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'active');

        $guest = User::query()->where('phone', '+15551112222')->firstOrFail();
        Sanctum::actingAs($guest);

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.guest_access.status', 'active')
            ->assertJsonPath('data.guest_access.can_access_dashboard', true);

        $this->assertDatabaseHas('guest_invitations', [
            'invite_code' => $create['invite_code'],
            'status'      => 'active',
        ]);

        $this->assertDatabaseHas('users', [
            'phone' => '+15551112222',
            'role'  => 'guest',
        ]);
    }

    public function test_resident_invite_requires_approval(): void
    {
        [$community, $admin] = $this->seedCommunityAdmin();
        $resident = $this->seedResident($community);
        Sanctum::actingAs($resident);

        $create = $this->postJson('/api/v1/guest-invitations', [
            'guest_name'  => 'Pending Guest',
            'guest_phone' => '+15553334444',
            'starts_at'   => now()->subHour()->toIso8601String(),
            'ends_at'     => now()->addDay()->toIso8601String(),
        ])->json('data');

        app(OtpService::class)->send('+15553334444');

        $verify = $this->postJson('/api/v1/auth/guest/verify-invite', [
            'phone'       => '+15553334444',
            'code'        => '123456',
            'invite_code' => $create['invite_code'],
        ]);

        $verify->assertOk()
            ->assertJsonPath('invitation_status', 'pending_approval');

        Sanctum::actingAs($resident);

        $invitation = GuestInvitation::query()->where('invite_code', $create['invite_code'])->first();
        $approve = $this->patchJson("/api/v1/guest-invitations/{$invitation->id}/approve");
        $approve->assertOk()->assertJsonPath('data.status', 'active');
    }

    public function test_guest_two_step_verify_then_invite(): void
    {
        [$community, $admin] = $this->seedCommunityAdmin();
        Sanctum::actingAs($admin);

        $create = $this->postJson('/api/v1/admin/guests/invite', [
            'guest_name'  => 'Two Step Guest',
            'guest_email' => 'twostep@example.com',
            'guest_phone' => '+15554443333',
            'starts_at'   => now()->subHour()->toIso8601String(),
            'ends_at'     => now()->addDay()->toIso8601String(),
        ])->json('data');

        app(OtpService::class)->send('+15554443333');

        $this->postJson('/api/v1/auth/guest/otp/verify', [
            'phone' => '+15554443333',
            'code'  => '123456',
        ])
            ->assertOk()
            ->assertJsonPath('needs_invite_code', true);

        $verify = $this->postJson('/api/v1/auth/guest/verify-invite', [
            'phone'       => '+15554443333',
            'code'        => '123456',
            'invite_code' => $create['invite_code'],
        ]);

        $verify->assertOk()
            ->assertJsonPath('invitation_status', 'pending_approval')
            ->assertJsonStructure(['token', 'user']);

        Sanctum::actingAs($admin);

        $invitation = GuestInvitation::query()->where('invite_code', $create['invite_code'])->firstOrFail();
        $this->patchJson("/api/v1/admin/guests/{$invitation->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'active');
    }

    public function test_admin_invite_with_future_start_blocks_login_until_window(): void
    {
        [$community, $admin] = $this->seedCommunityAdmin();
        Sanctum::actingAs($admin);

        $create = $this->postJson('/api/v1/admin/guests/invite', [
            'guest_name'  => 'Scheduled Guest',
            'guest_email' => 'scheduled@example.com',
            'guest_phone' => '+15551230123',
            'starts_at'   => now()->addHour()->toIso8601String(),
            'ends_at'     => now()->addDay()->toIso8601String(),
        ])->json('data');

        app(OtpService::class)->send('+15551230123');

        $this->postJson('/api/v1/auth/guest/otp/request', [
            'phone' => '+15551230123',
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'ACCESS_NOT_STARTED');

        $this->postJson('/api/v1/auth/guest/verify-invite', [
            'phone'       => '+15551230123',
            'code'        => '123456',
            'invite_code' => $create['invite_code'],
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'ACCESS_NOT_STARTED');

        $this->travel(2)->hours();
        app(OtpService::class)->send('+15551230123');

        $this->postJson('/api/v1/auth/guest/verify-invite', [
            'phone'       => '+15551230123',
            'code'        => '123456',
            'invite_code' => $create['invite_code'],
        ])->assertOk()->assertJsonPath('invitation_status', 'pending_approval');

        $invitation = GuestInvitation::query()->where('invite_code', $create['invite_code'])->firstOrFail();
        $this->patchJson("/api/v1/admin/guests/{$invitation->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'active');

        $guest = User::query()->where('phone', '+15551230123')->firstOrFail();
        Sanctum::actingAs($guest);

        $this->getJson('/api/v1/feed')
            ->assertOk();

        $this->assertDatabaseHas('guest_invitations', [
            'invite_code' => $create['invite_code'],
            'status'      => 'active',
        ]);
    }

    public function test_guest_login_blocked_after_access_window_ends(): void
    {
        [$community, $admin] = $this->seedCommunityAdmin();
        Sanctum::actingAs($admin);

        $create = $this->postJson('/api/v1/admin/guests/invite', [
            'guest_name'  => 'Expired Window Guest',
            'guest_email' => 'expiredwindow@example.com',
            'guest_phone' => '+15551230999',
            'starts_at'   => now()->subHours(2)->toIso8601String(),
            'ends_at'     => now()->subHour()->toIso8601String(),
        ])->json('data');

        app(OtpService::class)->send('+15551230999');

        $this->postJson('/api/v1/auth/guest/otp/request', [
            'phone' => '+15551230999',
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'GUEST_ACCESS_EXPIRED')
            ->assertJsonPath('message', GuestAccessService::MSG_ACCESS_EXPIRED);
    }

    public function test_admin_revoke_guest_invalidates_mobile_session(): void
    {
        [$community, $admin] = $this->seedCommunityAdmin();
        Sanctum::actingAs($admin);

        $create = $this->postJson('/api/v1/admin/guests/invite', [
            'guest_name'  => 'Revoked Guest',
            'guest_email' => 'revoked@example.com',
            'guest_phone' => '+15551230555',
            'starts_at'   => now()->subHour()->toIso8601String(),
            'ends_at'     => now()->addDay()->toIso8601String(),
        ])->json('data');

        app(OtpService::class)->send('+15551230555');
        $this->postJson('/api/v1/auth/guest/verify-invite', [
            'phone'       => '+15551230555',
            'code'        => '123456',
            'invite_code' => $create['invite_code'],
        ])->assertOk();

        $invitation = GuestInvitation::query()->where('invite_code', $create['invite_code'])->firstOrFail();
        $this->patchJson("/api/v1/admin/guests/{$invitation->id}/approve")->assertOk();

        $guest = User::query()->where('phone', '+15551230555')->firstOrFail();
        $guest->createToken('mobile');

        Sanctum::actingAs($guest);
        $this->getJson('/api/v1/feed')->assertOk();

        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/admin/guests/{$invitation->id}/revoke")
            ->assertOk()
            ->assertJsonPath('data.status', 'revoked');

        $this->assertDatabaseMissing('personal_access_tokens', [
            'tokenable_id'   => $guest->id,
            'tokenable_type' => User::class,
        ]);

        Sanctum::actingAs($guest);
        $this->getJson('/api/v1/feed')
            ->assertForbidden()
            ->assertJsonPath('code', 'GUEST_ACCESS_REVOKED')
            ->assertJsonPath('message', GuestAccessService::MSG_ACCESS_REVOKED);
    }

    public function test_revoked_guest_cannot_log_in_again(): void
    {
        [$community, $admin] = $this->seedCommunityAdmin();
        Sanctum::actingAs($admin);

        $create = $this->postJson('/api/v1/admin/guests/invite', [
            'guest_name'  => 'No Re-login Guest',
            'guest_email' => 'norelogin@example.com',
            'guest_phone' => '+15551230666',
            'starts_at'   => now()->subHour()->toIso8601String(),
            'ends_at'     => now()->addDay()->toIso8601String(),
        ])->json('data');

        app(OtpService::class)->send('+15551230666');
        $this->postJson('/api/v1/auth/guest/verify-invite', [
            'phone'       => '+15551230666',
            'code'        => '123456',
            'invite_code' => $create['invite_code'],
        ])->assertOk();

        $invitation = GuestInvitation::query()->where('invite_code', $create['invite_code'])->firstOrFail();
        $this->patchJson("/api/v1/admin/guests/{$invitation->id}/approve")->assertOk();
        $this->patchJson("/api/v1/admin/guests/{$invitation->id}/revoke")->assertOk();

        $this->postJson('/api/v1/auth/guest/otp/request', [
            'phone' => '+15551230666',
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'GUEST_ACCESS_REVOKED')
            ->assertJsonPath('message', GuestAccessService::MSG_ACCESS_REVOKED);

        app(OtpService::class)->send('+15551230666');
        $this->postJson('/api/v1/auth/guest/otp/verify', [
            'phone' => '+15551230666',
            'code'  => '123456',
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'GUEST_ACCESS_REVOKED');

        app(OtpService::class)->send('+15551230666');
        $this->postJson('/api/v1/auth/guest/verify-invite', [
            'phone'       => '+15551230666',
            'code'        => '123456',
            'invite_code' => $create['invite_code'],
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'GUEST_ACCESS_REVOKED');
    }

    public function test_active_guest_api_access_revoked_after_end_time(): void
    {
        [$community, $admin] = $this->seedCommunityAdmin();
        Sanctum::actingAs($admin);

        $create = $this->postJson('/api/v1/admin/guests/invite', [
            'guest_name'  => 'Timed Guest',
            'guest_email' => 'timed@example.com',
            'guest_phone' => '+15551230444',
            'starts_at'   => now()->subHour()->toIso8601String(),
            'ends_at'     => now()->addHour()->toIso8601String(),
        ])->json('data');

        app(OtpService::class)->send('+15551230444');
        $verify = $this->postJson('/api/v1/auth/guest/verify-invite', [
            'phone'       => '+15551230444',
            'code'        => '123456',
            'invite_code' => $create['invite_code'],
        ])->assertOk();

        $invitation = GuestInvitation::query()->where('invite_code', $create['invite_code'])->firstOrFail();
        $this->patchJson("/api/v1/admin/guests/{$invitation->id}/approve")->assertOk();

        $guest = User::query()->where('phone', '+15551230444')->firstOrFail();
        Sanctum::actingAs($guest);

        $this->getJson('/api/v1/feed')->assertOk();

        $this->travel(2)->hours();

        $this->getJson('/api/v1/feed')
            ->assertForbidden()
            ->assertJsonPath('code', 'GUEST_ACCESS_EXPIRED')
            ->assertJsonPath('message', GuestAccessService::MSG_ACCESS_EXPIRED);
    }

    public function test_admin_cannot_invite_guest_with_existing_resident_email(): void
    {
        [$community, $admin] = $this->seedCommunityAdmin();

        User::factory()->create([
            'role'  => 'resident',
            'email' => 'existing@example.com',
            'phone' => null,
        ]);

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/admin/guests/invite', [
            'guest_name'  => 'Email Conflict Guest',
            'guest_email' => 'existing@example.com',
            'guest_phone' => '+15559998888',
            'starts_at'   => now()->subHour()->toIso8601String(),
            'ends_at'     => now()->addDay()->toIso8601String(),
        ])
            ->assertStatus(422)
            ->assertJsonPath('message', \App\Services\ContactIdentityService::DUPLICATE_EMAIL_MESSAGE);
    }

    public function test_admin_cannot_invite_guest_with_existing_user_phone(): void
    {
        [$community, $admin] = $this->seedCommunityAdmin();

        User::factory()->create([
            'role'              => 'resident',
            'email'             => 'resident@example.com',
            'phone'             => '+15551230001',
            'phone_verified_at' => now(),
        ]);

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/admin/guests/invite', [
            'guest_name'  => 'Phone Conflict Guest',
            'guest_email' => 'newguest@example.com',
            'guest_phone' => '+15551230001',
            'starts_at'   => now()->subHour()->toIso8601String(),
            'ends_at'     => now()->addDay()->toIso8601String(),
        ])
            ->assertStatus(422)
            ->assertJsonPath('message', \App\Services\ContactIdentityService::DUPLICATE_PHONE_MESSAGE);
    }

    public function test_admin_cannot_invite_guest_with_duplicate_active_invite_phone(): void
    {
        [$community, $admin] = $this->seedCommunityAdmin();
        Sanctum::actingAs($admin);

        $payload = [
            'guest_name'  => 'First Guest',
            'guest_email' => 'first@example.com',
            'guest_phone' => '+15551230002',
            'starts_at'   => now()->subHour()->toIso8601String(),
            'ends_at'     => now()->addDay()->toIso8601String(),
        ];

        $this->postJson('/api/v1/admin/guests/invite', $payload)->assertCreated();

        $this->postJson('/api/v1/admin/guests/invite', [
            ...$payload,
            'guest_name'  => 'Second Guest',
            'guest_email' => 'second@example.com',
        ])
            ->assertStatus(422)
            ->assertJsonPath('message', \App\Services\ContactIdentityService::DUPLICATE_PHONE_MESSAGE);
    }

    public function test_admin_cannot_approve_resident_guest_they_did_not_invite(): void
    {
        [$community, $admin] = $this->seedCommunityAdmin();
        $resident = $this->seedResident($community);
        Sanctum::actingAs($resident);

        $create = $this->postJson('/api/v1/guest-invitations', [
            'guest_name'  => 'Admin Approves Me',
            'guest_phone' => '+15556667777',
            'starts_at'   => now()->subHour()->toIso8601String(),
            'ends_at'     => now()->addDay()->toIso8601String(),
        ])->json('data');

        app(OtpService::class)->send('+15556667777');
        $this->postJson('/api/v1/auth/guest/verify-invite', [
            'phone'       => '+15556667777',
            'code'        => '123456',
            'invite_code' => $create['invite_code'],
        ])->assertOk()->assertJsonPath('invitation_status', 'pending_approval');

        Sanctum::actingAs($admin);

        $invitation = GuestInvitation::query()->where('invite_code', $create['invite_code'])->firstOrFail();
        $this->patchJson("/api/v1/admin/guests/{$invitation->id}/approve")
            ->assertForbidden();
    }

    public function test_other_resident_cannot_approve_guest(): void
    {
        [$community, $admin] = $this->seedCommunityAdmin();
        $inviter = $this->seedResident($community);
        $otherResident = User::factory()->create([
            'role'              => 'resident',
            'phone'             => '+12017777777',
            'phone_verified_at' => now(),
        ]);
        CommunityMembership::query()->create([
            'user_id'      => $otherResident->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        Sanctum::actingAs($inviter);

        $create = $this->postJson('/api/v1/guest-invitations', [
            'guest_name'  => 'Not Your Guest',
            'guest_phone' => '+15558889999',
            'starts_at'   => now()->subHour()->toIso8601String(),
            'ends_at'     => now()->addDay()->toIso8601String(),
        ])->json('data');

        app(OtpService::class)->send('+15558889999');
        $this->postJson('/api/v1/auth/guest/verify-invite', [
            'phone'       => '+15558889999',
            'code'        => '123456',
            'invite_code' => $create['invite_code'],
        ])->assertOk()->assertJsonPath('invitation_status', 'pending_approval');

        Sanctum::actingAs($otherResident);

        $invitation = GuestInvitation::query()->where('invite_code', $create['invite_code'])->firstOrFail();
        $this->patchJson("/api/v1/guest-invitations/{$invitation->id}/approve")
            ->assertNotFound();
    }

    public function test_inviter_can_reject_pending_guest(): void
    {
        [$community, $admin] = $this->seedCommunityAdmin();
        $resident = $this->seedResident($community);
        Sanctum::actingAs($resident);

        $create = $this->postJson('/api/v1/guest-invitations', [
            'guest_name'  => 'Admin Rejects Me',
            'guest_phone' => '+15558889999',
            'starts_at'   => now()->subHour()->toIso8601String(),
            'ends_at'     => now()->addDay()->toIso8601String(),
        ])->json('data');

        app(OtpService::class)->send('+15558889999');
        $this->postJson('/api/v1/auth/guest/verify-invite', [
            'phone'       => '+15558889999',
            'code'        => '123456',
            'invite_code' => $create['invite_code'],
        ])->assertOk()->assertJsonPath('invitation_status', 'pending_approval');

        Sanctum::actingAs($resident);

        $invitation = GuestInvitation::query()->where('invite_code', $create['invite_code'])->firstOrFail();
        $reject = $this->patchJson("/api/v1/guest-invitations/{$invitation->id}/reject", [
            'reason' => 'Not authorized for this visit',
        ]);
        $reject->assertOk()->assertJsonPath('data.status', 'rejected');
    }

    public function test_guest_cannot_create_post(): void
    {
        [$community, $admin] = $this->seedCommunityAdmin();
        Sanctum::actingAs($admin);

        $create = $this->postJson('/api/v1/admin/guests/invite', [
            'guest_name'  => 'Readonly Guest',
            'guest_email' => 'readonly@example.com',
            'guest_phone' => '+15557778888',
            'starts_at'   => now()->subHour()->toIso8601String(),
            'ends_at'     => now()->addDay()->toIso8601String(),
        ])->json('data');

        app(OtpService::class)->send('+15557778888');
        $login = $this->postJson('/api/v1/auth/guest/verify-invite', [
            'phone'       => '+15557778888',
            'code'        => '123456',
            'invite_code' => $create['invite_code'],
        ]);

        $guest = User::query()->where('phone', '+15557778888')->firstOrFail();
        $this->assertSame('guest', $guest->role);

        Sanctum::actingAs($guest);

        $this->postJson('/api/v1/feed', ['body' => 'Guest post attempt'])
            ->assertForbidden();
    }

    public function test_wrong_invite_code_does_not_consume_otp(): void
    {
        [$community, $admin] = $this->seedCommunityAdmin();
        Sanctum::actingAs($admin);

        $create = $this->postJson('/api/v1/admin/guests/invite', [
            'guest_name'  => 'Retry Guest',
            'guest_email' => 'retry@example.com',
            'guest_phone' => '+15556667777',
            'starts_at'   => now()->subHour()->toIso8601String(),
            'ends_at'     => now()->addDay()->toIso8601String(),
        ])->json('data');

        app(OtpService::class)->send('+15556667777');

        $this->postJson('/api/v1/auth/guest/verify-invite', [
            'phone'       => '+15556667777',
            'code'        => '123456',
            'invite_code' => 'GST-WRONG-0000',
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'INVALID_INVITE');

        $this->postJson('/api/v1/auth/guest/verify-invite', [
            'phone'       => '+15556667777',
            'code'        => '123456',
            'invite_code' => $create['invite_code'],
        ])
            ->assertOk()
            ->assertJsonPath('invitation_status', 'pending_approval');
    }

    public function test_verify_invite_accepts_spaced_invite_code(): void
    {
        [$community, $admin] = $this->seedCommunityAdmin();
        Sanctum::actingAs($admin);

        $create = $this->postJson('/api/v1/admin/guests/invite', [
            'guest_name'  => 'Spaced Code Guest',
            'guest_email' => 'spaced@example.com',
            'guest_phone' => '+15556668888',
            'starts_at'   => now()->subHour()->toIso8601String(),
            'ends_at'     => now()->addDay()->toIso8601String(),
        ])->json('data');

        app(OtpService::class)->send('+15556668888');

        $spacedCode = str_replace('-', ' - ', $create['invite_code']);

        $this->postJson('/api/v1/auth/guest/verify-invite', [
            'phone'       => '+15556668888',
            'code'        => '123456',
            'invite_code' => $spacedCode,
        ])
            ->assertOk()
            ->assertJsonPath('invitation_status', 'pending_approval');
    }
}
