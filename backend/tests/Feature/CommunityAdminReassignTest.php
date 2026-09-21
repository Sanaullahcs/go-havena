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

class CommunityAdminReassignTest extends TestCase
{
    use RefreshDatabase;

    private function seedRegion(): Region
    {
        return Region::query()->create([
            'title'       => 'Cairo Metro',
            'area'        => 'Cairo',
            'users_label' => '0 users',
            'sort_order'  => 1,
            'status'      => 'active',
        ]);
    }

    private function seedCommunityWithAdmin(Region $region): array
    {
        $community = Community::query()->create([
            'name'          => 'Palm Heights',
            'region_id'     => $region->id,
            'region'        => $region->title,
            'status'        => 'active',
            'review_status' => 'approved',
        ]);

        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
            'phone'                  => '+201555000111',
            'email'                  => 'admin.palm@example.com',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        return compact('community', 'admin');
    }

    private function systemAdmin(): User
    {
        $this->seed(SystemAdminSeeder::class);

        return User::query()->where('email', 'admin@havena.app')->firstOrFail();
    }

    public function test_suspend_shows_admin_in_suspended_not_reassign(): void
    {
        $region = $this->seedRegion();
        ['admin' => $admin] = $this->seedCommunityWithAdmin($region);
        Sanctum::actingAs($this->systemAdmin());

        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}/suspend")
            ->assertOk()
            ->assertJsonPath('data.status', 'suspended')
            ->assertJsonPath('data.lifecycle_status', 'suspended');

        $suspended = $this->getJson('/api/v1/admin/community-admins?status=suspended')
            ->assertOk()
            ->assertJsonPath('meta.stats.suspended', 1)
            ->json('data');

        $this->assertSame($admin->id, $suspended[0]['id']);
        $this->assertFalse($suspended[0]['needs_reassign']);

        $this->getJson('/api/v1/admin/community-admins?status=reassign')
            ->assertOk()
            ->assertJsonPath('meta.stats.needs_reassign', 0)
            ->assertJsonCount(0, 'data');
    }

    public function test_released_admin_appears_in_reassign_not_active(): void
    {
        $region = $this->seedRegion();
        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithAdmin($region);
        Sanctum::actingAs($this->systemAdmin());

        $this->postJson("/api/v1/admin/community-admins/{$admin->id}/release")->assertOk();

        $this->getJson('/api/v1/admin/community-admins?status=approved')
            ->assertOk()
            ->assertJsonPath('meta.stats.active', 0)
            ->assertJsonCount(0, 'data');

        $reassign = $this->getJson('/api/v1/admin/community-admins?status=reassign')
            ->assertOk()
            ->assertJsonPath('meta.stats.needs_reassign', 1)
            ->json('data');

        $this->assertSame($admin->id, $reassign[0]['id']);
        $this->assertTrue($reassign[0]['needs_reassign']);
        $this->assertSame('reassign', $reassign[0]['lifecycle_status']);
        $this->assertNull($reassign[0]['community_request']);
        $this->assertSame($community->status, 'active');
    }

    public function test_assign_admin_to_inactive_community_reactivates_community(): void
    {
        $region = $this->seedRegion();
        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithAdmin($region);
        Sanctum::actingAs($this->systemAdmin());

        app(\App\Services\CommunityLifecycleService::class)->deactivateCommunity($community->fresh());

        $this->postJson("/api/v1/admin/communities/{$community->id}/assign-admin", [
            'name'  => 'Replacement Admin',
            'email' => 'replacement.admin@example.com',
            'phone' => '+201555000333',
        ])->assertOk();

        $this->assertSame('active', $community->fresh()->status);
        $this->assertDatabaseHas('users', ['id' => $admin->id]);
    }

    public function test_unassigned_community_does_not_appear_as_reassign_admin(): void
    {
        $region = $this->seedRegion();
        Community::query()->create([
            'name'          => 'Open Ridge',
            'region_id'     => $region->id,
            'region'        => $region->title,
            'status'        => 'active',
            'review_status' => 'approved',
        ]);

        Sanctum::actingAs($this->systemAdmin());

        $this->getJson('/api/v1/admin/community-admins?status=reassign')
            ->assertOk()
            ->assertJsonPath('meta.stats.needs_reassign', 0)
            ->assertJsonCount(0, 'data');
    }

    public function test_system_admin_cannot_assign_themselves(): void
    {
        $region = $this->seedRegion();
        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithAdmin($region);
        $systemAdmin = $this->systemAdmin();
        Sanctum::actingAs($systemAdmin);

        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}/suspend")->assertOk();

        $this->postJson("/api/v1/admin/communities/{$community->id}/assign-admin", [
            'assign_self' => true,
        ])->assertStatus(422)
            ->assertJsonPath('message', 'Provide user_id or a new admin email.');

        $this->postJson("/api/v1/admin/communities/{$community->id}/assign-admin", [
            'user_id' => $systemAdmin->id,
        ])->assertStatus(422)
            ->assertJsonPath('message', 'A system administrator cannot be assigned as a community admin. Invite a community admin instead.');
    }

    public function test_assign_new_admin_keeps_suspended_admin_on_suspended_tab(): void
    {
        $region = $this->seedRegion();
        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithAdmin($region);
        Sanctum::actingAs($this->systemAdmin());

        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}/suspend")->assertOk();

        $this->postJson("/api/v1/admin/communities/{$community->id}/assign-admin", [
            'name'  => 'New Admin',
            'email' => 'new.admin@example.com',
            'phone' => '+201555000222',
        ])->assertOk()
            ->assertJsonPath('data.admin.email', 'new.admin@example.com');

        $suspended = $this->getJson('/api/v1/admin/community-admins?status=suspended')
            ->assertOk()
            ->assertJsonPath('meta.stats.suspended', 1)
            ->json('data');

        $this->assertSame($admin->id, $suspended[0]['id']);
        $this->assertFalse($suspended[0]['needs_reassign']);
        $this->assertSame('suspended', $suspended[0]['lifecycle_status']);
    }

    public function test_pending_community_admin_does_not_appear_in_reassign(): void
    {
        $region = $this->seedRegion();

        $applicant = User::factory()->create([
            'name'                   => 'Haider',
            'role'                   => 'community_admin',
            'community_admin_status' => 'pending',
            'status'                 => 'active',
            'phone'                  => '+201555000444',
            'email'                  => 'haider.pending@example.com',
        ]);

        $community = Community::query()->create([
            'name'                 => 'California Hub',
            'region_id'            => $region->id,
            'region'               => $region->title,
            'status'               => 'active',
            'review_status'        => 'approved',
            'requested_by_user_id' => $applicant->id,
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $applicant->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        Sanctum::actingAs($this->systemAdmin());

        $this->getJson('/api/v1/admin/community-admins?status=reassign')
            ->assertOk()
            ->assertJsonPath('meta.stats.needs_reassign', 0)
            ->assertJsonCount(0, 'data');

        $pending = $this->getJson('/api/v1/admin/community-admins?status=pending')
            ->assertOk()
            ->assertJsonPath('meta.stats.pending', 1)
            ->json('data');

        $this->assertSame($applicant->id, $pending[0]['id']);
        $this->assertSame('pending', $pending[0]['community_admin_status']);
        $this->assertSame('pending', $pending[0]['lifecycle_status']);
    }
}
