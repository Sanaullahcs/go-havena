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
            'phone' => '+14155552671',
            'region_id' => $region->id,
            'community_name' => 'Nile Gardens',
            'community_address' => '123 Nile St',
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
            'office_address' => '100 Management Office, Nile Gardens',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['utility_bill']);

        $admin->unsetRelation('profile');
        $admin->profile()->updateOrCreate(
            ['user_id' => $admin->id],
            ['utility_bill_url' => '/storage/utility-bills/ahmed.jpg'],
        );
        $admin->refresh();

        $this->putJson('/api/v1/me', [
            'display_name' => 'Ahmed Admin',
            'email' => 'ahmed.login@example.com',
            'office_address' => '100 Management Office, Nile Gardens',
        ])->assertOk()
            ->assertJsonPath('data.profile.office_address', '100 Management Office, Nile Gardens');

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.profile.office_address', '100 Management Office, Nile Gardens')
            ->assertJsonPath('data.access.profile_complete', true)
            ->assertJsonPath('data.access.next_step', 'complete_billing_web');
    }

    public function test_system_admin_can_assign_community_admin_to_existing_unassigned_community(): void
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
            'name' => 'Sunset Gardens',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $response = $this->postJson('/api/v1/admin/users', [
            'type' => 'community_admin',
            'name' => 'Lina Admin',
            'email' => 'lina.admin@example.com',
            'phone' => '+201700000010',
            'region_id' => $region->id,
            'community_id' => $community->id,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.role', 'community_admin')
            ->assertJsonPath('data.community.id', $community->id)
            ->assertJsonPath('data.community.name', 'Sunset Gardens');

        $this->assertDatabaseHas('community_memberships', [
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);

        $this->assertSame(1, Community::query()->where('name', 'Sunset Gardens')->count());
    }

    public function test_system_admin_cannot_assign_second_admin_to_same_community(): void
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
            'name' => 'Harbor Point',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $existingAdmin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'email' => 'existing.admin@example.com',
            'phone' => '+201700000011',
        ]);

        CommunityMembership::query()->create([
            'user_id' => $existingAdmin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);

        $this->postJson('/api/v1/admin/users', [
            'type' => 'community_admin',
            'name' => 'Second Admin',
            'email' => 'second.admin@example.com',
            'phone' => '+201700000012',
            'region_id' => $region->id,
            'community_id' => $community->id,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['community_id']);
    }

    public function test_community_admin_existing_community_must_match_region(): void
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
            'type' => 'community_admin',
            'name' => 'Wrong Region Admin',
            'email' => 'wrong.admin@example.com',
            'phone' => '+201700000013',
            'region_id' => $regionA->id,
            'community_id' => $community->id,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['community_id']);
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
