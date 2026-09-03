<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\Region;
use App\Models\User;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminUserCreationTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsSystemAdmin(): User
    {
        $this->seed(SystemAdminSeeder::class);
        $admin = User::query()->where('email', 'admin@havena.app')->firstOrFail();
        Sanctum::actingAs($admin);

        return $admin;
    }

    public function test_system_admin_can_create_community_admin_with_new_community(): void
    {
        $this->actingAsSystemAdmin();

        $region = Region::query()->create([
            'title' => 'Cairo Metro',
            'area' => 'Cairo',
            'state' => 'EG',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $response = $this->postJson('/api/v1/admin/users', [
            'type' => 'community_admin',
            'name' => 'Ahmed Admin',
            'email' => 'ahmed.admin@example.com',
            'phone' => '+2017777777',
            'region_id' => $region->id,
            'community_name' => 'Nile Gardens',
            'community_address' => '123 Nile St',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.role', 'community_admin')
            ->assertJsonPath('data.phone', '+2017777777')
            ->assertJsonPath('data.community.name', 'Nile Gardens');

        $this->assertDatabaseHas('users', [
            'email' => 'ahmed.admin@example.com',
            'phone' => '+2017777777',
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
        ]);

        $this->assertDatabaseHas('communities', [
            'name' => 'Nile Gardens',
            'region_id' => $region->id,
            'review_status' => 'approved',
        ]);
    }

    public function test_invited_community_admin_must_complete_profile_before_billing(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $this->actingAsSystemAdmin();

        $region = Region::query()->create([
            'title' => 'Cairo Metro',
            'area' => 'Cairo',
            'state' => 'EG',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $this->postJson('/api/v1/admin/users', [
            'type' => 'community_admin',
            'name' => 'Ahmed Admin',
            'email' => 'ahmed.login@example.com',
            'region_id' => $region->id,
            'community_name' => 'Nile Gardens',
        ])->assertCreated();

        $admin = User::query()->where('email', 'ahmed.login@example.com')->firstOrFail();
        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.next_step', 'complete_profile')
            ->assertJsonPath('data.access.profile_complete', false)
            ->assertJsonPath('data.access.can_use_mobile_app', false);

        $this->putJson('/api/v1/me', [
            'display_name' => 'Ahmed Admin',
            'email' => 'ahmed.login@example.com',
            'unit_number' => 'Office',
        ])->assertOk();

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.profile_complete', true)
            ->assertJsonPath('data.access.next_step', 'complete_billing_web');
    }

    public function test_system_admin_can_create_resident_in_existing_community(): void
    {
        $this->actingAsSystemAdmin();

        $region = Region::query()->create([
            'title' => 'Cairo Metro',
            'area' => 'Cairo',
            'state' => 'EG',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $community = Community::query()->create([
            'name' => 'Existing Towers',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $response = $this->postJson('/api/v1/admin/users', [
            'type' => 'resident',
            'name' => 'Sara Resident',
            'email' => 'sara.resident@example.com',
            'phone' => '+201700000001',
            'region_id' => $region->id,
            'community_id' => $community->id,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.role', 'resident')
            ->assertJsonPath('data.community.id', $community->id);

        $this->assertDatabaseHas('users', [
            'email' => 'sara.resident@example.com',
            'role' => 'resident',
        ]);

        $this->assertDatabaseHas('community_memberships', [
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);
    }

    public function test_resident_creation_rejects_community_outside_region(): void
    {
        $this->actingAsSystemAdmin();

        $regionA = Region::query()->create([
            'title' => 'Region A',
            'area' => 'A',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $regionB = Region::query()->create([
            'title' => 'Region B',
            'area' => 'B',
            'users_label' => '0 users',
            'sort_order' => 2,
            'status' => 'active',
        ]);

        $community = Community::query()->create([
            'name' => 'Region B Community',
            'region_id' => $regionB->id,
            'region' => $regionB->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $this->postJson('/api/v1/admin/users', [
            'type' => 'resident',
            'name' => 'Wrong Region',
            'email' => 'wrong@example.com',
            'phone' => '+201700000002',
            'region_id' => $regionA->id,
            'community_id' => $community->id,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['community_id']);
    }

    public function test_system_admin_can_reprovision_deleted_resident_with_same_phone(): void
    {
        $this->actingAsSystemAdmin();

        $region = Region::query()->create([
            'title' => 'Cairo Metro',
            'area' => 'Cairo',
            'state' => 'EG',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $community = Community::query()->create([
            'name' => 'Existing Towers',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $payload = [
            'type' => 'resident',
            'name' => 'Sara Resident',
            'email' => 'sara.resident@example.com',
            'phone' => '+201700000001',
            'region_id' => $region->id,
            'community_id' => $community->id,
        ];

        $this->postJson('/api/v1/admin/users', $payload)->assertCreated();

        $userId = User::query()->where('email', $payload['email'])->value('id');

        $this->deleteJson("/api/v1/admin/members/{$userId}?community_id={$community->id}")
            ->assertOk();

        $this->postJson('/api/v1/admin/users', $payload)
            ->assertCreated()
            ->assertJsonPath('data.phone', $payload['phone'])
            ->assertJsonPath('data.community.id', $community->id);

        $this->assertDatabaseHas('users', [
            'id' => $userId,
            'phone' => $payload['phone'],
            'status' => 'active',
            'deleted_at' => null,
        ]);

        $this->assertDatabaseHas('community_memberships', [
            'user_id' => $userId,
            'community_id' => $community->id,
            'status' => 'approved',
        ]);
    }
}
