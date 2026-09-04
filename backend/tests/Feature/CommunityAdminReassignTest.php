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

    public function test_suspend_shows_admin_in_suspended_and_community_in_reassign(): void
    {
        $region = $this->seedRegion();
        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithAdmin($region);
        Sanctum::actingAs($this->systemAdmin());

        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}/suspend")
            ->assertOk()
            ->assertJsonPath('data.status', 'suspended');

        $suspended = $this->getJson('/api/v1/admin/community-admins?status=suspended')
            ->assertOk()
            ->assertJsonPath('meta.stats.suspended', 1)
            ->json('data');

        $this->assertSame($admin->id, $suspended[0]['id']);
        $this->assertTrue($suspended[0]['needs_reassign']);

        $reassign = $this->getJson('/api/v1/admin/community-admins?status=reassign')
            ->assertOk()
            ->assertJsonPath('meta.stats.needs_reassign', 1)
            ->json('data');

        $row = collect($reassign)->firstWhere('community_request.id', $community->id);
        $this->assertNotNull($row);
        $this->assertSame(0, $row['id']);
        $this->assertTrue($row['needs_reassign']);
        $this->assertSame('previous_admin_suspended', $row['reassign_reason']);
        $this->assertSame($community->name, $row['name']);
        $this->assertSame($admin->id, $row['previous_admin']['id']);
    }

    public function test_inactive_community_without_admin_appears_in_reassign_list(): void
    {
        $region = $this->seedRegion();
        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithAdmin($region);
        Sanctum::actingAs($this->systemAdmin());

        app(\App\Services\CommunityLifecycleService::class)->deactivateCommunity($community->fresh());

        $response = $this->getJson('/api/v1/admin/community-admins?status=reassign')
            ->assertOk()
            ->assertJsonPath('meta.stats.needs_reassign', 1);

        $row = collect($response->json('data'))->firstWhere('community_request.id', $community->id);
        $this->assertNotNull($row);
        $this->assertSame('community_inactive', $row['reassign_reason']);
        $this->assertSame($community->name, $row['name']);
        $this->assertSame($admin->id, $row['previous_admin']['id']);
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
        $this->getJson('/api/v1/admin/community-admins?status=reassign')
            ->assertOk()
            ->assertJsonPath('meta.stats.needs_reassign', 0);
    }

    public function test_unassigned_community_appears_in_reassign_list(): void
    {
        $region = $this->seedRegion();
        $community = Community::query()->create([
            'name'          => 'Open Ridge',
            'region_id'     => $region->id,
            'region'        => $region->title,
            'status'        => 'active',
            'review_status' => 'approved',
        ]);

        Sanctum::actingAs($this->systemAdmin());

        $response = $this->getJson('/api/v1/admin/community-admins?status=reassign')
            ->assertOk()
            ->assertJsonPath('meta.stats.needs_reassign', 1);

        $row = collect($response->json('data'))->firstWhere('community_request.id', $community->id);
        $this->assertNotNull($row);
        $this->assertSame('missing_admin', $row['reassign_reason']);
        $this->assertSame($community->name, $row['name']);
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

        $this->getJson('/api/v1/admin/community-admins?status=reassign')
            ->assertOk()
            ->assertJsonPath('meta.stats.needs_reassign', 1);
    }

    public function test_assign_new_admin_removes_community_from_reassign_but_keeps_suspended_admin(): void
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

        $this->getJson('/api/v1/admin/community-admins?status=reassign')
            ->assertOk()
            ->assertJsonPath('meta.stats.needs_reassign', 0)
            ->assertJsonCount(0, 'data');

        $suspended = $this->getJson('/api/v1/admin/community-admins?status=suspended')
            ->assertOk()
            ->assertJsonPath('meta.stats.suspended', 1)
            ->json('data');

        $this->assertSame($admin->id, $suspended[0]['id']);
        $this->assertFalse($suspended[0]['needs_reassign']);
    }

    public function test_pending_community_admin_does_not_appear_in_reassign_after_community_approval(): void
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
    }
}
