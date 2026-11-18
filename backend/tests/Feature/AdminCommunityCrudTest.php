<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Country;
use App\Models\Region;
use App\Models\State;
use App\Models\User;
use App\Services\LocationCatalog;
use App\Support\RegionHierarchy;
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

    private function cityRegion(string $city = 'Cairo'): Region
    {
        $country = Country::query()->firstOrCreate(
            ['code' => 'EG'],
            ['name' => 'Egypt', 'billing_policy' => 'required', 'sort_order' => 1, 'status' => 'active'],
        );
        $state = State::query()->firstOrCreate(
            ['country_id' => $country->id, 'name' => 'Cairo Governorate'],
            ['status' => 'active'],
        );

        return app(LocationCatalog::class)->ensureCityRegion($state, $city);
    }

    private function approvedCommunity(): Community
    {
        $region = $this->cityRegion();

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

    public function test_creating_community_keeps_description_separate_from_address(): void
    {
        Sanctum::actingAs($this->systemAdmin());

        $region = $this->cityRegion();

        $this->postJson('/api/v1/admin/communities', [
            'name'        => 'Oak Valley Residences',
            'region_id'   => $region->id,
            'address'     => 'West Pinnacle Peak Road, Phoenix, AZ',
            'description' => 'Quiet hillside community.',
        ])->assertCreated()
            ->assertJsonPath('data.address', 'West Pinnacle Peak Road, Phoenix, AZ')
            ->assertJsonPath('data.description', 'Quiet hillside community.');

        $this->assertDatabaseHas('communities', [
            'name'        => 'Oak Valley Residences',
            'address'     => 'West Pinnacle Peak Road, Phoenix, AZ',
            'description' => 'Quiet hillside community.',
        ]);
    }

    public function test_creating_community_requires_address(): void
    {
        Sanctum::actingAs($this->systemAdmin());

        $region = $this->cityRegion();

        $this->postJson('/api/v1/admin/communities', [
            'name'      => 'No Address Place',
            'region_id' => $region->id,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['address']);
    }

    public function test_system_admin_can_update_community(): void
    {
        Sanctum::actingAs($this->systemAdmin());

        $community = $this->approvedCommunity();
        $newRegion = $this->cityRegion('Giza');

        $response = $this->putJson("/api/v1/admin/communities/{$community->id}", [
            'name'        => 'Oak Valley Residences',
            'region_id'   => $newRegion->id,
            'address'     => '456 Oak Ave',
            'description' => 'Updated notes',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.name', 'Oak Valley Residences')
            ->assertJsonPath('data.region_id', $newRegion->id)
            ->assertJsonPath('data.region_title', RegionHierarchy::hierarchyLabel($newRegion))
            ->assertJsonPath('data.address', '456 Oak Ave')
            ->assertJsonPath('data.description', 'Updated notes');

        $this->assertDatabaseHas('communities', [
            'id'     => $community->id,
            'name'   => 'Oak Valley Residences',
            'region' => $newRegion->title,
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

    public function test_community_lists_follow_approval_assignment_and_active_status(): void
    {
        Sanctum::actingAs($this->systemAdmin());

        $unassigned = $this->approvedCommunity();
        $regionId = $unassigned->region_id;

        $assigned = Community::query()->create([
            'name'          => 'Assigned Heights',
            'region_id'     => $regionId,
            'region'        => $unassigned->region,
            'address'       => '9 Palm Road',
            'status'        => 'active',
            'review_status' => 'approved',
        ]);

        $admin = User::factory()->create([
            'name'                   => 'Assigned Admin',
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $assigned->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        $inactive = Community::query()->create([
            'name'          => 'Quiet Court',
            'region_id'     => $regionId,
            'region'        => $unassigned->region,
            'address'       => '4 Quiet Lane',
            'status'        => 'inactive',
            'review_status' => 'approved',
        ]);

        $inactiveAdmin = User::factory()->create([
            'name'                   => 'Inactive Admin',
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $inactiveAdmin->id,
            'community_id' => $inactive->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        $pending = Community::query()->create([
            'name'          => 'Pending Court',
            'region_id'     => $regionId,
            'region'        => $unassigned->region,
            'address'       => '2 Request Road',
            'status'        => 'inactive',
            'review_status' => 'pending',
        ]);

        $rejected = Community::query()->create([
            'name'             => 'Rejected Court',
            'region_id'        => $regionId,
            'region'           => $unassigned->region,
            'address'          => '8 Closed Road',
            'status'           => 'inactive',
            'review_status'    => 'rejected',
            'rejection_reason' => 'Incomplete documents',
        ]);

        $ids = fn (string $url) => collect($this->getJson($url)->assertOk()->json('data'))->pluck('id');

        $all = $ids('/api/v1/admin/communities?per_page=50&page=1');
        $this->assertTrue($all->contains($unassigned->id));
        $this->assertTrue($all->contains($assigned->id));
        $this->assertTrue($all->contains($inactive->id));
        $this->assertFalse($all->contains($pending->id));
        $this->assertFalse($all->contains($rejected->id));

        $assignedIds = $ids('/api/v1/admin/communities?per_page=50&page=1&status=active&assignment=assigned');
        $this->assertEqualsCanonicalizing([$assigned->id], $assignedIds->all());

        $unassignedIds = $ids('/api/v1/admin/communities?per_page=50&page=1&status=active&assignment=unassigned');
        $this->assertEqualsCanonicalizing([$unassigned->id], $unassignedIds->all());

        $inactiveIds = $ids('/api/v1/admin/communities?per_page=50&page=1&status=inactive');
        $this->assertEqualsCanonicalizing([$inactive->id], $inactiveIds->all());

        $pendingResponse = $this->getJson('/api/v1/admin/community-requests?per_page=50&page=1');
        $pendingResponse->assertOk()
            ->assertJsonPath('meta.stats.assigned', 1)
            ->assertJsonPath('meta.stats.unassigned', 1)
            ->assertJsonPath('meta.stats.inactive', 1)
            ->assertJsonPath('meta.stats.pending', 1)
            ->assertJsonPath('meta.stats.rejected', 1);
        $this->assertEqualsCanonicalizing(
            [$pending->id],
            collect($pendingResponse->json('data'))->pluck('id')->all(),
        );

        $rejectedResponse = $this->getJson('/api/v1/admin/community-requests?per_page=50&page=1&review_status=rejected');
        $rejectedResponse->assertOk()
            ->assertJsonPath('data.0.id', $rejected->id)
            ->assertJsonPath('data.0.review_status', 'rejected')
            ->assertJsonPath('data.0.rejection_reason', 'Incomplete documents');
    }
}
