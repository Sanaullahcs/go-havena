<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use App\Services\CommunityLifecycleService;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuthAccountBlockTest extends TestCase
{
    use RefreshDatabase;

    private function seedCommunity(): Community
    {
        $region = Region::query()->create([
            'title'       => 'Test Region',
            'area'        => 'Test',
            'users_label' => '0 users',
            'sort_order'  => 1,
            'status'      => 'active',
        ]);

        return Community::query()->create([
            'name'          => 'Test Community',
            'region_id'     => $region->id,
            'region'        => $region->title,
            'status'        => 'active',
            'review_status' => 'approved',
        ]);
    }

    public function test_suspended_resident_login_returns_block_details(): void
    {
        $community = $this->seedCommunity();

        $resident = User::factory()->create([
            'role'              => 'resident',
            'email'             => 'blocked@example.com',
            'password'          => 'password',
            'status'            => 'suspended',
            'suspension_reason' => CommunityLifecycleService::REASON_MEMBER_SUSPENDED,
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $resident->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email'    => 'blocked@example.com',
            'password' => 'password',
        ])
            ->assertStatus(403)
            ->assertJsonPath('code', 'ACCOUNT_SUSPENDED')
            ->assertJsonPath('status', 'suspended')
            ->assertJsonPath('rejected_by', 'community_admin');
    }

    public function test_rejected_membership_blocks_resident_login_with_reason(): void
    {
        $community = $this->seedCommunity();

        $resident = User::factory()->create([
            'role'              => 'resident',
            'email'             => 'rejected@example.com',
            'password'          => 'password',
            'phone'             => '+201700000088',
            'phone_verified_at' => now(),
        ]);

        CommunityMembership::query()->create([
            'user_id'          => $resident->id,
            'community_id'     => $community->id,
            'role'             => 'member',
            'status'           => 'rejected',
            'rejection_reason' => 'Incomplete profile details',
            'rejected_by'      => 'community_admin',
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email'    => 'rejected@example.com',
            'password' => 'password',
        ])
            ->assertStatus(403)
            ->assertJsonPath('code', 'MEMBERSHIP_REJECTED')
            ->assertJsonPath('status', 'rejected')
            ->assertJsonPath('reason', 'Incomplete profile details')
            ->assertJsonPath('rejected_by', 'community_admin');
    }

    public function test_rejected_membership_can_still_read_profile_for_status_screen(): void
    {
        $community = $this->seedCommunity();

        $resident = User::factory()->create([
            'role'              => 'resident',
            'email'             => 'rejected-status@example.com',
            'password'          => 'password',
            'phone'             => '+201700000089',
            'phone_verified_at' => now(),
        ]);

        CommunityMembership::query()->create([
            'user_id'          => $resident->id,
            'community_id'     => $community->id,
            'role'             => 'member',
            'status'           => 'rejected',
            'rejection_reason' => 'Incomplete profile details',
            'rejected_by'      => 'community_admin',
        ]);

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.memberships.0.status', 'rejected')
            ->assertJsonPath('data.memberships.0.rejection_reason', 'Incomplete profile details')
            ->assertJsonPath('data.memberships.0.rejected_by', 'community_admin');

        $this->getJson('/api/v1/me/membership-review')
            ->assertOk()
            ->assertJsonPath('data.status', 'rejected')
            ->assertJsonPath('data.kind', 'membership_approval')
            ->assertJsonPath('data.rejection_reason', 'Incomplete profile details')
            ->assertJsonPath('data.rejected_by', 'community_admin')
            ->assertJsonPath('data.community.name', 'Test Community');
    }

    public function test_rejected_community_admin_otp_returns_block_details(): void
    {
        $admin = User::factory()->create([
            'role'                             => 'community_admin',
            'community_admin_status'           => 'rejected',
            'community_admin_rejection_reason' => 'Insufficient experience',
            'phone'                            => '+201700000077',
            'phone_verified_at'                => now(),
        ]);

        $this->postJson('/api/v1/auth/otp/request', [
            'email'  => $admin->email,
            'intent' => 'login',
            'portal' => 'community_admin_dashboard',
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'COMMUNITY_ADMIN_REJECTED')
            ->assertJsonPath('status', 'rejected')
            ->assertJsonPath('reason', 'Insufficient experience')
            ->assertJsonPath('rejected_by', 'system_admin');
    }

    public function test_revoked_community_admin_otp_explains_access_was_revoked(): void
    {
        $community = $this->seedCommunity();
        $admin = User::factory()->create([
            'role'                             => 'community_admin',
            'community_admin_status'           => 'rejected',
            'community_admin_rejection_reason' => 'Policy violation',
            'phone'                            => '+201700000079',
            'phone_verified_at'                => now(),
        ]);
        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        $this->postJson('/api/v1/auth/otp/request', [
            'email'  => $admin->email,
            'intent' => 'login',
            'portal' => 'community_admin_dashboard',
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'COMMUNITY_ADMIN_REVOKED')
            ->assertJsonPath('message', 'Your community admin access was revoked. Your subscription has been canceled and you will not be charged again. Contact support if you have questions.');
    }

    public function test_pending_community_admin_otp_returns_block_details(): void
    {
        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'pending',
            'phone'                  => '+201700000078',
            'phone_verified_at'      => now(),
        ]);

        $this->postJson('/api/v1/auth/otp/request', [
            'email'  => $admin->email,
            'intent' => 'login',
            'portal' => 'community_admin_dashboard',
        ])
            ->assertStatus(202)
            ->assertJsonPath('data.email', $admin->email);
    }

    public function test_rejected_community_admin_can_be_reapproved(): void
    {
        $this->seed(SystemAdminSeeder::class);

        $community = $this->seedCommunity();

        $admin = User::factory()->create([
            'role'                             => 'community_admin',
            'community_admin_status'           => 'rejected',
            'community_admin_rejection_reason' => 'Incomplete documentation',
            'phone'                            => '+201700000079',
            'phone_verified_at'                => now(),
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'pending',
        ]);

        $systemAdmin = User::query()->where('email', 'admin@havena.app')->firstOrFail();

        $this->actingAs($systemAdmin)
            ->patchJson("/api/v1/admin/community-admins/{$admin->id}/reapprove")
            ->assertOk()
            ->assertJsonPath('message', 'Community admin re-approved');

        $admin->refresh();
        $this->assertSame('approved', $admin->community_admin_status);
        $this->assertNull($admin->community_admin_rejection_reason);
    }

    public function test_reject_community_admin_persists_reason(): void
    {
        $this->seed(SystemAdminSeeder::class);

        $community = $this->seedCommunity();

        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'pending',
            'phone'                  => '+201700000066',
            'phone_verified_at'      => now(),
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'pending',
        ]);

        $systemAdmin = User::query()->where('email', 'admin@havena.app')->firstOrFail();

        $this->actingAs($systemAdmin)
            ->patchJson("/api/v1/admin/community-admins/{$admin->id}/reject", [
                'reason' => 'Does not meet requirements',
            ])
            ->assertOk();

        $this->assertSame(
            'Does not meet requirements',
            $admin->fresh()->community_admin_rejection_reason,
        );
    }
}
