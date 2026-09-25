<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CommunityAdminLifecycleActionsTest extends TestCase
{
    use RefreshDatabase;

    private function seedRegion(): Region
    {
        return Region::query()->create([
            'title' => 'Cairo Metro',
            'area' => 'Cairo',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);
    }

    private function seedCommunity(Region $region, string $name = 'Palm Heights'): Community
    {
        return Community::query()->create([
            'name' => $name,
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);
    }

    private function seedAdmin(array $overrides = [], ?Community $community = null, string $membershipStatus = 'approved'): User
    {
        $admin = User::factory()->create(array_merge([
            'name' => 'Lifecycle Admin',
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'email' => 'lifecycle.admin@example.com',
            'phone' => '+201555000111',
        ], $overrides));

        if ($community) {
            CommunityMembership::query()->create([
                'user_id' => $admin->id,
                'community_id' => $community->id,
                'role' => 'admin',
                'status' => $membershipStatus,
            ]);
        }

        return $admin;
    }

    private function systemAdmin(): User
    {
        $this->seed(SystemAdminSeeder::class);

        return User::query()->where('email', 'admin@havena.app')->firstOrFail();
    }

    public function test_pending_shows_only_pending_actions_and_approves_to_active(): void
    {
        $region = $this->seedRegion();
        $community = $this->seedCommunity($region);
        $admin = $this->seedAdmin([
            'community_admin_status' => 'pending',
            'email' => 'pending.admin@example.com',
        ], $community, 'pending');
        Sanctum::actingAs($this->systemAdmin());

        $row = collect($this->getJson('/api/v1/admin/community-admins?status=pending')->json('data'))
            ->firstWhere('id', $admin->id);

        $this->assertSame('pending', $row['lifecycle_status']);
        $this->assertSame(['view', 'approve', 'reject'], $row['allowed_actions']);

        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}/suspend")->assertStatus(422);
        $this->postJson("/api/v1/admin/community-admins/{$admin->id}/release")->assertStatus(422);
        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}", ['name' => 'Nope'])->assertStatus(422);
        $this->deleteJson("/api/v1/admin/community-admins/{$admin->id}", ['confirmation' => 'DELETE'])->assertStatus(422);

        $this->postJson("/api/v1/admin/community-admins/{$admin->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.lifecycle_status', 'active');

        $this->assertSame('approved', $admin->fresh()->community_admin_status);
        $this->getJson('/api/v1/admin/community-admins?status=approved')
            ->assertOk()
            ->assertJsonPath('meta.stats.active', 1);
    }

    public function test_pending_reject_moves_record_to_rejected(): void
    {
        $region = $this->seedRegion();
        $community = $this->seedCommunity($region);
        $admin = $this->seedAdmin([
            'community_admin_status' => 'pending',
            'email' => 'reject.me@example.com',
        ], $community, 'pending');
        Sanctum::actingAs($this->systemAdmin());

        $this->postJson("/api/v1/admin/community-admins/{$admin->id}/reject", [
            'reason' => 'Incomplete documents',
        ])->assertOk();

        $this->assertSame('rejected', $admin->fresh()->community_admin_status);

        $rejected = $this->getJson('/api/v1/admin/community-admins?status=rejected')
            ->assertOk()
            ->assertJsonPath('meta.stats.rejected', 1)
            ->json('data');

        $this->assertSame($admin->id, $rejected[0]['id']);
        $this->assertSame(['view', 'approve', 'delete_record'], $rejected[0]['allowed_actions']);
    }

    public function test_active_release_moves_admin_to_reassign_without_deleting_accounts(): void
    {
        $region = $this->seedRegion();
        $community = $this->seedCommunity($region);
        $admin = $this->seedAdmin([], $community);
        Sanctum::actingAs($this->systemAdmin());

        $active = collect($this->getJson('/api/v1/admin/community-admins?status=approved')->json('data'))
            ->firstWhere('id', $admin->id);
        $this->assertSame('active', $active['lifecycle_status']);
        $this->assertSame(['view', 'edit', 'release', 'suspend', 'delete'], $active['allowed_actions']);

        $this->postJson("/api/v1/admin/community-admins/{$admin->id}/approve")->assertStatus(422);
        $this->postJson("/api/v1/admin/community-admins/{$admin->id}/reactivate")->assertStatus(422);
        $this->postJson("/api/v1/admin/community-admins/{$admin->id}/assign-community", [
            'community_id' => $community->id,
        ])->assertStatus(422);

        $this->postJson("/api/v1/admin/community-admins/{$admin->id}/release")
            ->assertOk()
            ->assertJsonPath('data.lifecycle_status', 'reassign');

        $this->assertSame('active', $admin->fresh()->status);
        $this->assertSame('approved', $admin->fresh()->community_admin_status);
        $this->assertSame('active', $community->fresh()->status);
        $this->assertDatabaseMissing('community_memberships', [
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);

        $this->getJson('/api/v1/admin/community-admins?status=approved')
            ->assertOk()
            ->assertJsonPath('meta.stats.active', 0)
            ->assertJsonCount(0, 'data');

        $reassign = $this->getJson('/api/v1/admin/community-admins?status=reassign')
            ->assertOk()
            ->assertJsonPath('meta.stats.needs_reassign', 1)
            ->json('data');

        $this->assertSame($admin->id, $reassign[0]['id']);
        $this->assertSame(['view', 'edit', 'assign_community', 'delete'], $reassign[0]['allowed_actions']);
    }

    public function test_active_suspend_then_reactivate_restores_active_assignment(): void
    {
        $region = $this->seedRegion();
        $community = $this->seedCommunity($region);
        $admin = $this->seedAdmin([], $community);
        Sanctum::actingAs($this->systemAdmin());

        $this->postJson("/api/v1/admin/community-admins/{$admin->id}/suspend")
            ->assertOk()
            ->assertJsonPath('data.lifecycle_status', 'suspended');

        $this->assertSame('suspended', $admin->fresh()->status);
        $this->assertDatabaseHas('community_memberships', [
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);

        $suspended = $this->getJson('/api/v1/admin/community-admins?status=suspended')
            ->assertOk()
            ->assertJsonPath('meta.stats.suspended', 1)
            ->json('data');
        $this->assertSame(['view', 'edit', 'reactivate', 'delete'], $suspended[0]['allowed_actions']);

        $this->postJson("/api/v1/admin/community-admins/{$admin->id}/release")->assertStatus(422);
        $this->postJson("/api/v1/admin/community-admins/{$admin->id}/approve")->assertStatus(422);

        $this->postJson("/api/v1/admin/community-admins/{$admin->id}/reactivate")
            ->assertOk()
            ->assertJsonPath('data.lifecycle_status', 'active');

        $this->assertSame('active', $admin->fresh()->status);
        $this->assertNull($admin->fresh()->suspension_reason);
        $this->getJson('/api/v1/admin/community-admins?status=approved')
            ->assertOk()
            ->assertJsonPath('meta.stats.active', 1)
            ->assertJsonPath('meta.stats.suspended', 0);
    }

    public function test_reassign_assign_community_returns_admin_to_active(): void
    {
        $region = $this->seedRegion();
        $previous = $this->seedCommunity($region, 'Old Grove');
        $next = $this->seedCommunity($region, 'New Harbor');
        $admin = $this->seedAdmin(['email' => 'reassign.admin@example.com'], $previous);
        Sanctum::actingAs($this->systemAdmin());

        $this->postJson("/api/v1/admin/community-admins/{$admin->id}/release")->assertOk();

        $this->postJson("/api/v1/admin/community-admins/{$admin->id}/suspend")->assertStatus(422);
        $this->postJson("/api/v1/admin/community-admins/{$admin->id}/reject")->assertStatus(422);

        $this->postJson("/api/v1/admin/community-admins/{$admin->id}/assign-community", [
            'community_id' => $next->id,
        ])->assertOk()
            ->assertJsonPath('data.lifecycle_status', 'active')
            ->assertJsonPath('data.community_request.id', $next->id);

        $this->assertDatabaseHas('community_memberships', [
            'user_id' => $admin->id,
            'community_id' => $next->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);
        $this->getJson('/api/v1/admin/community-admins?status=reassign')
            ->assertOk()
            ->assertJsonPath('meta.stats.needs_reassign', 0);
        $this->getJson('/api/v1/admin/community-admins?status=approved')
            ->assertOk()
            ->assertJsonPath('meta.stats.active', 1);
    }

    public function test_rejected_can_be_approved_or_have_record_deleted(): void
    {
        $region = $this->seedRegion();
        $community = $this->seedCommunity($region);
        $admin = $this->seedAdmin([
            'community_admin_status' => 'rejected',
            'community_admin_rejection_reason' => 'Incomplete',
            'email' => 'rejected.admin@example.com',
        ], $community, 'pending');
        Sanctum::actingAs($this->systemAdmin());

        $row = collect($this->getJson('/api/v1/admin/community-admins?status=rejected')->json('data'))
            ->firstWhere('id', $admin->id);
        $this->assertSame(['view', 'approve', 'delete_record'], $row['allowed_actions']);

        $this->postJson("/api/v1/admin/community-admins/{$admin->id}/reject")->assertStatus(422);
        $this->postJson("/api/v1/admin/community-admins/{$admin->id}/suspend")->assertStatus(422);
        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}", ['name' => 'Nope'])->assertStatus(422);

        $this->postJson("/api/v1/admin/community-admins/{$admin->id}/reapprove")
            ->assertOk()
            ->assertJsonPath('data.lifecycle_status', 'active');

        $this->assertSame('approved', $admin->fresh()->community_admin_status);

        $other = $this->seedAdmin([
            'name' => 'Rejected Record',
            'community_admin_status' => 'rejected',
            'email' => 'rejected.record@example.com',
            'phone' => '+201555000222',
        ]);

        $this->deleteJson("/api/v1/admin/community-admins/{$other->id}", [
            'confirmation' => 'DELETE',
        ])->assertOk()
            ->assertJsonPath('message', 'Rejected record deleted successfully.');

        $this->assertSoftDeleted('users', ['id' => $other->id]);
        $this->assertDatabaseHas('communities', ['id' => $community->id, 'status' => 'active']);
    }

    public function test_unassigned_communities_are_not_listed_as_reassign_admin_records(): void
    {
        $region = $this->seedRegion();
        $this->seedCommunity($region, 'Open Ridge');
        Sanctum::actingAs($this->systemAdmin());

        $this->getJson('/api/v1/admin/community-admins?status=reassign')
            ->assertOk()
            ->assertJsonPath('meta.stats.needs_reassign', 0)
            ->assertJsonCount(0, 'data');
    }
}
