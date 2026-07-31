<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use App\Services\ContactIdentityService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ContactIdentityTest extends TestCase
{
    use RefreshDatabase;

    private function seedCommunityAdmin(): array
    {
        $region = Region::query()->create([
            'title'       => 'Test Region',
            'area'        => 'Test Area',
            'users_label' => '0 users',
            'sort_order'  => 1,
            'status'      => 'active',
        ]);

        $community = Community::query()->create([
            'name'          => 'Test Community',
            'region_id'     => $region->id,
            'region'        => $region->title,
            'status'        => 'active',
            'review_status' => 'approved',
        ]);

        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'phone'                  => '+12015555555',
            'phone_verified_at'      => now(),
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        return [$community, $admin, $region];
    }

    public function test_provision_resident_rejects_duplicate_phone(): void
    {
        [$community, $admin, $region] = $this->seedCommunityAdmin();

        User::factory()->create([
            'role'              => 'resident',
            'email'             => 'taken@example.com',
            'phone'             => '+15551239999',
            'phone_verified_at' => now(),
        ]);

        $systemAdmin = User::factory()->create([
            'role'  => 'system_admin',
            'email' => 'sysadmin@example.com',
            'phone' => '+12019999999',
        ]);

        Sanctum::actingAs($systemAdmin);

        $this->postJson('/api/v1/admin/users', [
            'type'         => 'resident',
            'name'         => 'New Resident',
            'email'        => 'new@example.com',
            'phone'        => '+15551239999',
            'region_id'    => $region->id,
            'community_id' => $community->id,
        ])
            ->assertStatus(422)
            ->assertJsonPath('message', ContactIdentityService::DUPLICATE_PHONE_MESSAGE);
    }

    public function test_provision_resident_rejects_duplicate_email(): void
    {
        [$community, $admin, $region] = $this->seedCommunityAdmin();

        User::factory()->create([
            'role'  => 'resident',
            'email' => 'taken@example.com',
            'phone' => '+15551238888',
        ]);

        $systemAdmin = User::factory()->create([
            'role'  => 'system_admin',
            'email' => 'sysadmin@example.com',
            'phone' => '+12019999999',
        ]);

        Sanctum::actingAs($systemAdmin);

        $this->postJson('/api/v1/admin/users', [
            'type'         => 'resident',
            'name'         => 'New Resident',
            'email'        => 'taken@example.com',
            'phone'        => '+15551237777',
            'region_id'    => $region->id,
            'community_id' => $community->id,
        ])
            ->assertStatus(422)
            ->assertJsonPath('message', ContactIdentityService::DUPLICATE_EMAIL_MESSAGE);
    }
}
