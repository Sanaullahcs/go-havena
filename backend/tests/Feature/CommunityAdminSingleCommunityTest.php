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

class CommunityAdminSingleCommunityTest extends TestCase
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

    private function seedCommunity(Region $region, string $name): Community
    {
        return Community::query()->create([
            'name'          => $name,
            'region_id'     => $region->id,
            'region'        => $region->title,
            'status'        => 'active',
            'review_status' => 'approved',
        ]);
    }

    private function seedCommunityAdminFor(Community $community): User
    {
        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
            'phone'                  => '+201700000'.random_int(100, 999),
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        return $admin;
    }

    public function test_community_admin_cannot_join_second_community(): void
    {
        $region = $this->seedRegion();
        $first = $this->seedCommunity($region, 'First Community');
        $second = $this->seedCommunity($region, 'Second Community');
        $admin = $this->seedCommunityAdminFor($first);

        Sanctum::actingAs($admin);

        $this->postJson("/api/v1/communities/{$second->id}/join")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['phone']);
    }

    public function test_cannot_assign_phone_already_linked_to_another_community(): void
    {
        $region = $this->seedRegion();
        $linked = $this->seedCommunity($region, 'Linked Community');
        $open = $this->seedCommunity($region, 'Open Community');
        $admin = $this->seedCommunityAdminFor($linked);

        $this->seed(SystemAdminSeeder::class);
        Sanctum::actingAs(User::query()->where('email', 'admin@neighborlink.app')->firstOrFail());

        $this->postJson("/api/v1/admin/communities/{$open->id}/assign-admin", [
            'name'  => 'Duplicate Admin',
            'email' => 'other@example.com',
            'phone' => $admin->phone,
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['phone']);
    }

    public function test_assign_admin_revokes_previous_community_when_moving_same_user(): void
    {
        $region = $this->seedRegion();
        $oldCommunity = $this->seedCommunity($region, 'Old Community');
        $newCommunity = $this->seedCommunity($region, 'New Community');
        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
            'phone'                  => '+201700000888',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $oldCommunity->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        $this->seed(SystemAdminSeeder::class);
        Sanctum::actingAs(User::query()->where('email', 'admin@neighborlink.app')->firstOrFail());

        $this->postJson("/api/v1/admin/communities/{$newCommunity->id}/assign-admin", [
            'name'  => $admin->name,
            'email' => 'move@example.com',
            'phone' => $admin->phone,
        ])->assertStatus(422);
    }

    public function test_cannot_submit_second_community_request_with_same_phone(): void
    {
        $region = $this->seedRegion();
        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'pending',
            'status'                 => 'active',
            'phone'                  => '+2017777777',
        ]);

        Community::query()->create([
            'name'                 => 'First Request',
            'region_id'            => $region->id,
            'region'               => $region->title,
            'status'               => 'inactive',
            'review_status'        => 'pending',
            'requested_by_user_id' => $admin->id,
        ]);

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/communities/request', [
            'community_name' => 'Second Request',
            'address'        => '456 Other St, City, ST 12345',
            'region_id'      => $region->id,
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['community_name']);
    }

    public function test_cannot_request_when_pending_request_exists_without_membership(): void
    {
        $region = $this->seedRegion();
        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'pending',
            'status'                 => 'active',
            'phone'                  => '+2017777777',
        ]);

        // Seeder-style row: requested_by set but no membership yet.
        Community::query()->create([
            'name'                 => 'Seeded Pending',
            'region_id'            => $region->id,
            'region'               => $region->title,
            'status'               => 'inactive',
            'review_status'        => 'pending',
            'requested_by_user_id' => $admin->id,
        ]);

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/communities/request', [
            'community_name' => 'Another Request',
            'address'        => '789 Third Ave, City, ST 12345',
            'region_id'      => $region->id,
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['community_name']);
    }

    public function test_dedupe_rejects_duplicate_pending_requests_for_same_phone(): void
    {
        $region = $this->seedRegion();
        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
            'phone'                  => '+2017777777',
        ]);

        foreach (['Alpha Villas', 'Beta Estates', 'Gamma Towers'] as $name) {
            Community::query()->create([
                'name'                 => $name,
                'region_id'            => $region->id,
                'region'               => $region->title,
                'status'               => 'inactive',
                'review_status'        => 'pending',
                'requested_by_user_id' => $admin->id,
            ]);
        }

        $rejected = app(\App\Services\CommunityLifecycleService::class)->dedupePendingCommunityRequests();

        $this->assertSame(2, $rejected);
        $this->assertSame(1, Community::query()->where('review_status', 'pending')->count());
        $this->assertSame(2, Community::query()->where('review_status', 'rejected')->count());
    }
}
