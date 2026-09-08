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

class AdminCommunityCrudTest extends TestCase
{
    use RefreshDatabase;

    private function systemAdmin(): User
    {
        $this->seed(SystemAdminSeeder::class);

        return User::query()->where('email', 'admin@havena.app')->firstOrFail();
    }

    private function approvedCommunity(): Community
    {
        $region = Region::query()->create([
            'title'       => 'Cairo Metro',
            'area'        => 'Cairo',
            'users_label' => '0 users',
            'sort_order'  => 1,
            'status'      => 'active',
        ]);

        return Community::query()->create([
            'name'          => 'Oak Valley',
            'region_id'     => $region->id,
            'region'        => $region->title,
            'address'       => '123 Main St',
            'description'   => 'A quiet neighborhood',
            'status'        => 'active',
            'review_status' => 'approved',
        ]);
    }

    public function test_system_admin_can_update_community(): void
    {
        Sanctum::actingAs($this->systemAdmin());

        $community = $this->approvedCommunity();
        $newRegion = Region::query()->create([
            'title'       => 'Giza',
            'area'        => 'Giza',
            'users_label' => '0 users',
            'sort_order'  => 2,
            'status'      => 'active',
        ]);

        $response = $this->putJson("/api/v1/admin/communities/{$community->id}", [
            'name'        => 'Oak Valley Residences',
            'region_id'   => $newRegion->id,
            'address'     => '456 Oak Ave',
            'description' => 'Updated notes',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.name', 'Oak Valley Residences')
            ->assertJsonPath('data.region_id', $newRegion->id)
            ->assertJsonPath('data.region_title', 'Giza')
            ->assertJsonPath('data.address', '456 Oak Ave')
            ->assertJsonPath('data.description', 'Updated notes');

        $this->assertDatabaseHas('communities', [
            'id'     => $community->id,
            'name'   => 'Oak Valley Residences',
            'region' => 'Giza',
        ]);
    }

    public function test_system_admin_can_delete_community(): void
    {
        Sanctum::actingAs($this->systemAdmin());

        $community = $this->approvedCommunity();

        $response = $this->deleteJson("/api/v1/admin/communities/{$community->id}");

        $response->assertOk()
            ->assertJsonPath('message', 'Community deleted.');

        $this->assertSoftDeleted('communities', ['id' => $community->id]);
    }

    public function test_cannot_delete_pending_community_request(): void
    {
        Sanctum::actingAs($this->systemAdmin());

        $region = Region::query()->create([
            'title'       => 'Cairo Metro',
            'area'        => 'Cairo',
            'users_label' => '0 users',
            'sort_order'  => 1,
            'status'      => 'active',
        ]);

        $community = Community::query()->create([
            'name'          => 'Pending Place',
            'region_id'     => $region->id,
            'region'        => $region->title,
            'status'        => 'inactive',
            'review_status' => 'pending',
        ]);

        $response = $this->deleteJson("/api/v1/admin/communities/{$community->id}");

        $response->assertStatus(422);
        $this->assertDatabaseHas('communities', ['id' => $community->id]);
    }

    public function test_cannot_edit_pending_community_request(): void
    {
        Sanctum::actingAs($this->systemAdmin());

        $region = Region::query()->create([
            'title'       => 'Cairo Metro',
            'area'        => 'Cairo',
            'users_label' => '0 users',
            'sort_order'  => 1,
            'status'      => 'active',
        ]);

        $community = Community::query()->create([
            'name'          => 'Pending Place',
            'region_id'     => $region->id,
            'region'        => $region->title,
            'status'        => 'inactive',
            'review_status' => 'pending',
        ]);

        $response = $this->putJson("/api/v1/admin/communities/{$community->id}", [
            'name' => 'Should Not Update',
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseHas('communities', [
            'id'   => $community->id,
            'name' => 'Pending Place',
        ]);
    }

    public function test_communities_list_includes_residents_count_per_community(): void
    {
        Sanctum::actingAs($this->systemAdmin());

        $community = $this->approvedCommunity();

        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $resident->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        $response = $this->getJson('/api/v1/admin/communities?per_page=15&page=1');

        $response->assertOk()
            ->assertJsonPath('data.0.id', $community->id)
            ->assertJsonPath('data.0.residents_count', 1)
            ->assertJsonPath('data.0.has_admin', false);
    }
}
