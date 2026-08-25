<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunityPlaidConnection;
use App\Models\Region;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PlaidConnectionTest extends TestCase
{
    use RefreshDatabase;

    private function seedCommunity(): Community
    {
        $region = Region::query()->create([
            'title' => 'Plaid Region',
            'area' => 'Test Area',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        return Community::query()->create([
            'name' => 'Plaid Community',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '100 Test Lane',
            'status' => 'active',
            'review_status' => 'approved',
            'estimated_residents' => 50,
        ]);
    }

    private function seedCommunityAdmin(Community $community): User
    {
        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'phone' => '+15555550200',
            'phone_verified_at' => now(),
            'email' => 'test.community.admin@havena.app',
            'status' => 'active',
        ]);

        CommunityMembership::query()->create([
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);

        return $admin;
    }

    public function test_unauthenticated_connection_request_is_rejected(): void
    {
        $this->getJson('/api/v1/plaid/connection')->assertUnauthorized();
    }

    public function test_returns_not_connected_when_no_plaid_item(): void
    {
        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);
        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/plaid/connection')
            ->assertOk()
            ->assertJsonPath('data.connected', false);
    }

    public function test_returns_existing_connection_for_community(): void
    {
        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);
        Sanctum::actingAs($admin);

        CommunityPlaidConnection::query()->create([
            'community_id' => $community->id,
            'connected_by_user_id' => $admin->id,
            'plaid_item_id' => 'item-sandbox-existing',
            'plaid_access_token' => 'access-sandbox-existing',
            'institution_id' => 'ins_tartan',
            'institution_name' => 'Tartan Bank',
            'status' => 'connected',
        ]);

        $this->getJson('/api/v1/plaid/connection')
            ->assertOk()
            ->assertJsonPath('data.connected', true)
            ->assertJsonPath('data.item_id', 'item-sandbox-existing')
            ->assertJsonPath('data.institution_name', 'Tartan Bank')
            ->assertJsonPath('data.institution_id', 'ins_tartan')
            ->assertJsonMissingPath('data.plaid_access_token');
    }

    public function test_resident_cannot_fetch_connection(): void
    {
        $community = $this->seedCommunity();
        $resident = User::factory()->create([
            'role' => 'resident',
            'phone' => '+15555550100',
            'phone_verified_at' => now(),
            'status' => 'active',
        ]);

        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/plaid/connection')->assertForbidden();
    }
}
