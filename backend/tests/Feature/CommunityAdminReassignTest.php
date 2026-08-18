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

    public function test_suspend_moves_community_to_reassign_not_suspended_list(): void
    {
        $region = $this->seedRegion();
        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithAdmin($region);
        Sanctum::actingAs($this->systemAdmin());

        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}/suspend")
            ->assertOk()
            ->assertJsonPath('data.status', 'suspended');

        $this->getJson('/api/v1/admin/community-admins?status=suspended')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $reassign = $this->getJson('/api/v1/admin/community-admins?status=reassign')
            ->assertOk()
            ->assertJsonPath('meta.stats.needs_reassign', 1)
            ->json('data');

        $row = collect($reassign)->firstWhere('community_request.id', $community->id);
        $this->assertNotNull($row);
        $this->assertTrue($row['needs_reassign']);
        $this->assertSame('previous_admin_suspended', $row['reassign_reason']);
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
        $this->assertSame('Administrator needed', $row['name']);
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
            ->assertJsonPath('message', 'Provide user_id or new admin contact details.');

        $this->postJson("/api/v1/admin/communities/{$community->id}/assign-admin", [
            'user_id' => $systemAdmin->id,
        ])->assertStatus(422)
            ->assertJsonPath('message', 'A system administrator cannot be assigned as a community admin. Invite a community admin instead.');

        $this->getJson('/api/v1/admin/community-admins?status=reassign')
            ->assertOk()
            ->assertJsonPath('meta.stats.needs_reassign', 1);
    }

    public function test_assign_new_admin_removes_community_from_reassign_and_suspended_lists(): void
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

        $this->getJson('/api/v1/admin/community-admins?status=suspended')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }
}
