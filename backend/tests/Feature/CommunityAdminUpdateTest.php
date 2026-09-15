<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Profile;
use App\Models\Region;
use App\Models\User;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CommunityAdminUpdateTest extends TestCase
{
    use RefreshDatabase;

    private function systemAdmin(): User
    {
        $this->seed(SystemAdminSeeder::class);

        return User::query()->where('email', 'admin@havena.app')->firstOrFail();
    }

    private function communityAdmin(): User
    {
        $region = Region::query()->create([
            'title' => 'Test Region',
            'area' => 'Test',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $community = Community::query()->create([
            'name' => 'Test Community',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $admin = User::factory()->create([
            'name' => 'Old Name',
            'email' => 'old.admin@example.com',
            'phone' => '+15555550100',
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
        ]);

        Profile::query()->create([
            'user_id' => $admin->id,
            'display_name' => 'Old Display',
            'unit_number' => 'A-1',
            'residence_type' => 'homeowner',
        ]);

        CommunityMembership::query()->create([
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);

        return $admin;
    }

    public function test_system_admin_can_update_community_admin_profile(): void
    {
        Sanctum::actingAs($this->systemAdmin());
        $admin = $this->communityAdmin();

        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}", [
            'name' => 'Updated Admin',
            'email' => 'updated.admin@example.com',
            'phone' => '+15555550999',
            'display_name' => 'Updated Display',
            'unit_number' => 'B-12',
            'residence_type' => 'tenant',
        ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Updated Admin')
            ->assertJsonPath('data.email', 'updated.admin@example.com')
            ->assertJsonPath('data.phone', '+15555550999')
            ->assertJsonPath('data.profile.display_name', 'Updated Display')
            ->assertJsonPath('data.profile.unit_number', 'B-12')
            ->assertJsonPath('data.profile.residence_type', 'tenant');

        $this->assertDatabaseHas('users', [
            'id' => $admin->id,
            'name' => 'Updated Admin',
            'email' => 'updated.admin@example.com',
            'phone' => '+15555550999',
        ]);
    }

    public function test_update_rejects_duplicate_email(): void
    {
        Sanctum::actingAs($this->systemAdmin());
        $admin = $this->communityAdmin();

        User::factory()->create([
            'email' => 'taken@example.com',
            'role' => 'resident',
        ]);

        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}", [
            'email' => 'taken@example.com',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_non_system_admin_cannot_update_community_admin(): void
    {
        $admin = $this->communityAdmin();
        Sanctum::actingAs($admin);

        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}", [
            'name' => 'Hacker',
        ])->assertForbidden();
    }
}
