<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ListingModerationTest extends TestCase
{
    use RefreshDatabase;

    private function seedCommunity(): array
    {
        $region = Region::query()->create([
            'title'       => 'Cairo Metro',
            'area'        => 'Cairo',
            'users_label' => '0 users',
            'sort_order'  => 1,
            'status'      => 'active',
        ]);

        $community = Community::query()->create([
            'name'          => 'Oak Valley',
            'region_id'     => $region->id,
            'region'        => $region->title,
            'status'        => 'active',
            'review_status' => 'approved',
        ]);

        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
            'phone'                  => '+201700000050',
        ]);

        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000051',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $resident->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        return compact('community', 'admin', 'resident');
    }

    private function createApprovedListing(int $communityId, int $userId, string $title = 'Test Item'): int
    {
        return DB::table('listings')->insertGetId([
            'community_id' => $communityId,
            'user_id'      => $userId,
            'type'         => 'for_sale',
            'category'     => 'Furniture',
            'condition'    => 'Good',
            'title'        => $title,
            'price'        => 100,
            'description'  => 'A nice item.',
            'images'       => json_encode([]),
            'status'       => 'approved',
            'approved_by'  => $userId,
            'approved_at'  => now(),
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);
    }

    public function test_resident_edit_resets_listing_to_pending_and_hides_from_feed(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();

        $listingId = $this->createApprovedListing($community->id, $resident->id);

        Sanctum::actingAs($resident);

        $this->patchJson('/api/v1/listings/'.$listingId, [
            'title' => 'Updated Title',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'pending');

        $this->assertSame('pending', DB::table('listings')->where('id', $listingId)->value('status'));

        $this->getJson('/api/v1/listings', [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonCount(0, 'data');

        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/listings?status=pending', [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.0.id', $listingId);
    }

    public function test_community_admin_edit_own_listing_stays_approved(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();

        $listingId = $this->createApprovedListing($community->id, $admin->id, 'Admin Item');

        Sanctum::actingAs($admin);

        $this->patchJson('/api/v1/listings/'.$listingId, [
            'title' => 'Admin Updated Title',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'approved');

        $this->assertSame('approved', DB::table('listings')->where('id', $listingId)->value('status'));

        $this->getJson('/api/v1/listings', [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.0.title', 'Admin Updated Title');
    }

    public function test_owner_can_mark_listing_as_sold(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunity();

        $listingId = $this->createApprovedListing($community->id, $resident->id);

        Sanctum::actingAs($resident);

        $this->patchJson('/api/v1/listings/'.$listingId.'/mark-sold', [], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'sold');

        $this->assertSame('sold', DB::table('listings')->where('id', $listingId)->value('status'));
    }

    public function test_only_owner_can_delete_listing(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();

        $listingId = $this->createApprovedListing($community->id, $resident->id);

        Sanctum::actingAs($admin);

        $this->deleteJson('/api/v1/listings/'.$listingId, [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertStatus(404);

        Sanctum::actingAs($resident);

        $this->deleteJson('/api/v1/listings/'.$listingId, [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk();

        $this->assertNotNull(DB::table('listings')->where('id', $listingId)->value('deleted_at'));
    }

    public function test_community_admin_can_approve_listing_via_admin_route(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();

        $listingId = DB::table('listings')->insertGetId([
            'community_id' => $community->id,
            'user_id'      => $resident->id,
            'type'         => 'for_sale',
            'category'     => 'Vehicles',
            'condition'    => 'Good',
            'title'        => 'Bugati',
            'price'        => 5000,
            'description'  => 'Pending listing.',
            'images'       => json_encode([]),
            'status'       => 'pending',
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);

        Sanctum::actingAs($admin);

        $this->patchJson('/api/v1/admin/listings/'.$listingId.'/approve', [], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('message', 'Listing approved');

        $this->assertSame('approved', DB::table('listings')->where('id', $listingId)->value('status'));
    }

    public function test_community_admin_can_reapprove_rejected_listing(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();

        $listingId = DB::table('listings')->insertGetId([
            'community_id' => $community->id,
            'user_id'      => $resident->id,
            'type'         => 'for_sale',
            'category'     => 'Electronics',
            'condition'    => 'Good',
            'title'        => 'Used laptop',
            'price'        => 250,
            'description'  => 'Rejected listing.',
            'images'       => json_encode([]),
            'status'       => 'rejected',
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);

        Sanctum::actingAs($admin);

        $this->patchJson('/api/v1/admin/listings/'.$listingId.'/approve', [], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('message', 'Listing re-approved');

        $this->assertSame('approved', DB::table('listings')->where('id', $listingId)->value('status'));

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/listings', [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.0.id', $listingId)
            ->assertJsonPath('data.0.title', 'Used laptop');
    }

    public function test_mine_filter_returns_all_owner_statuses(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunity();

        $this->createApprovedListing($community->id, $resident->id, 'Approved Item');

        DB::table('listings')->insert([
            'community_id' => $community->id,
            'user_id'      => $resident->id,
            'type'         => 'for_sale',
            'category'     => 'Other',
            'condition'    => 'Good',
            'title'        => 'Pending Item',
            'price'        => 50,
            'description'  => 'Waiting for review.',
            'images'       => json_encode([]),
            'status'       => 'pending',
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/listings?mine=1', [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }
}
