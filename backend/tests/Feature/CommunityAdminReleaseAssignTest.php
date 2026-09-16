<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CommunityAdminReleaseAssignTest extends TestCase
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
            'name'                   => 'Palm Admin',
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

    public function test_system_admin_can_release_assigned_admin_without_deleting_accounts(): void
    {
        $region = $this->seedRegion();
        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithAdmin($region);
        $actor = $this->systemAdmin();
        Sanctum::actingAs($actor);

        $response = $this->postJson("/api/v1/admin/communities/{$community->id}/release-admin");

        $response->assertOk()
            ->assertJsonPath('message', 'Community Admin released successfully.')
            ->assertJsonPath('data.community.id', $community->id)
            ->assertJsonPath('data.community.status', 'active')
            ->assertJsonPath('data.community.admin_user', null)
            ->assertJsonPath('data.community.has_admin', false)
            ->assertJsonPath('data.released_admin.id', $admin->id);

        $this->assertSame('active', $community->fresh()->status);
        $this->assertSame('active', $admin->fresh()->status);
        $this->assertSame('community_admin', $admin->fresh()->role);
        $this->assertSame('approved', $admin->fresh()->community_admin_status);
        $this->assertDatabaseHas('users', ['id' => $admin->id, 'status' => 'active']);
        $this->assertDatabaseHas('communities', ['id' => $community->id, 'status' => 'active']);
        $this->assertDatabaseMissing('community_memberships', [
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);

        $log = DB::table('activity_logs')
            ->where('action', 'community_admin_released')
            ->where('entity_id', $community->id)
            ->first();
        $this->assertNotNull($log);
        $this->assertSame($actor->id, $log->user_id);
        $meta = json_decode($log->meta, true);
        $this->assertSame($community->id, $meta['community_id']);
        $this->assertSame($admin->id, $meta['previous_admin']['id']);
        $this->assertNull($meta['new_admin']);
        $this->assertSame($actor->id, $meta['performed_by']['id']);
        $this->assertNotEmpty($meta['performed_at']);
    }

    public function test_system_admin_can_assign_admin_after_release(): void
    {
        $region = $this->seedRegion();
        ['community' => $community, 'admin' => $previous] = $this->seedCommunityWithAdmin($region);
        $replacement = User::factory()->create([
            'name'                   => 'New Heights Admin',
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
            'phone'                  => '+201555000222',
            'email'                  => 'new.heights@example.com',
        ]);
        $actor = $this->systemAdmin();
        Sanctum::actingAs($actor);

        $this->postJson("/api/v1/admin/communities/{$community->id}/release-admin")->assertOk();

        $response = $this->postJson("/api/v1/admin/communities/{$community->id}/assign-admin", [
            'user_id' => $replacement->id,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.community.admin_user.id', $replacement->id)
            ->assertJsonPath('data.community.has_admin', true)
            ->assertJsonPath('data.community.status', 'active');

        $this->assertDatabaseHas('community_memberships', [
            'user_id' => $replacement->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);
        $this->assertSame('active', $previous->fresh()->status);

        $log = DB::table('activity_logs')
            ->where('action', 'community_admin_assigned')
            ->where('entity_id', $community->id)
            ->orderByDesc('id')
            ->first();
        $this->assertNotNull($log);
        $this->assertSame($actor->id, $log->user_id);
        $meta = json_decode($log->meta, true);
        $this->assertSame($community->id, $meta['community_id']);
        $this->assertSame($replacement->id, $meta['new_admin']['id']);
        $this->assertSame($actor->id, $meta['performed_by']['id']);
        $this->assertNotEmpty($meta['performed_at']);
    }

    public function test_released_admin_appears_as_eligible_for_reassignment(): void
    {
        $region = $this->seedRegion();
        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithAdmin($region);
        Sanctum::actingAs($this->systemAdmin());

        $this->postJson("/api/v1/admin/communities/{$community->id}/release-admin")->assertOk();

        $approved = $this->getJson('/api/v1/admin/community-admins?status=approved')
            ->assertOk()
            ->json('data');

        $row = collect($approved)->firstWhere('id', $admin->id);
        $this->assertNotNull($row);
        $this->assertNull($row['community_request']);
        $this->assertSame('active', $row['status']);
        $this->assertSame('approved', $row['community_admin_status']);
    }

    public function test_community_admin_cannot_release_or_assign_admin(): void
    {
        $region = $this->seedRegion();
        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithAdmin($region);
        Sanctum::actingAs($admin);

        $this->postJson("/api/v1/admin/communities/{$community->id}/release-admin")
            ->assertForbidden();

        $this->postJson("/api/v1/admin/communities/{$community->id}/assign-admin", [
            'name'  => 'Intruder',
            'email' => 'intruder@example.com',
        ])->assertForbidden();

        $this->assertDatabaseHas('community_memberships', [
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);
    }

    public function test_guest_cannot_release_or_assign_admin(): void
    {
        $region = $this->seedRegion();
        ['community' => $community] = $this->seedCommunityWithAdmin($region);

        $this->postJson("/api/v1/admin/communities/{$community->id}/release-admin")
            ->assertUnauthorized();
        $this->postJson("/api/v1/admin/communities/{$community->id}/assign-admin", [
            'user_id' => 1,
        ])->assertUnauthorized();
    }

    public function test_release_fails_when_community_has_no_admin(): void
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

        $this->postJson("/api/v1/admin/communities/{$community->id}/release-admin")
            ->assertUnprocessable()
            ->assertJsonPath('message', 'This community does not have an assigned Community Admin.');
    }
}
