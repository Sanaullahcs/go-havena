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

class CommunityIsolationTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{communityA: Community, communityB: Community, residentA: User, residentB: User, sellerB: User} */
    private function seedTwoCommunities(): array
    {
        $region = Region::query()->create([
            'title'       => 'Metro',
            'area'        => 'Metro',
            'users_label' => '0 users',
            'sort_order'  => 1,
            'status'      => 'active',
        ]);

        $communityA = Community::query()->create([
            'name'          => 'Oak Valley',
            'region_id'     => $region->id,
            'region'        => $region->title,
            'status'        => 'active',
            'review_status' => 'approved',
        ]);

        $communityB = Community::query()->create([
            'name'          => 'Pine Ridge',
            'region_id'     => $region->id,
            'region'        => $region->title,
            'status'        => 'active',
            'review_status' => 'approved',
        ]);

        $residentA = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000101',
            'name'   => 'Resident A',
        ]);

        $residentB = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000102',
            'name'   => 'Resident B',
        ]);

        $sellerB = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000103',
            'name'   => 'Seller B',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $residentA->id,
            'community_id' => $communityA->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $residentB->id,
            'community_id' => $communityB->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $sellerB->id,
            'community_id' => $communityB->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        return compact('communityA', 'communityB', 'residentA', 'residentB', 'sellerB');
    }

    private function createApprovedListing(int $communityId, int $userId, string $title = 'Cross Community Item'): int
    {
        return DB::table('listings')->insertGetId([
            'community_id' => $communityId,
            'user_id'      => $userId,
            'type'         => 'for_sale',
            'category'     => 'Furniture',
            'condition'    => 'Good',
            'title'        => $title,
            'price'        => 99,
            'description'  => 'Test listing.',
            'images'       => json_encode(['https://example.com/item.jpg']),
            'status'       => 'approved',
            'approved_by'  => $userId,
            'approved_at'  => now(),
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);
    }

    public function test_listing_index_only_returns_active_community_listings(): void
    {
        [
            'communityA' => $communityA,
            'communityB' => $communityB,
            'residentA'  => $residentA,
            'sellerB'    => $sellerB,
        ] = $this->seedTwoCommunities();

        $this->createApprovedListing($communityA->id, $residentA->id, 'Oak Chair');
        $this->createApprovedListing($communityB->id, $sellerB->id, 'Pine Table');

        Sanctum::actingAs($residentA);

        $response = $this->withHeader('X-Community-Id', (string) $communityA->id)
            ->getJson('/api/v1/listings');

        $response->assertOk();
        $titles = collect($response->json('data'))->pluck('title')->all();

        $this->assertContains('Oak Chair', $titles);
        $this->assertNotContains('Pine Table', $titles);
    }

    public function test_resident_cannot_view_listing_from_other_community_by_id(): void
    {
        [
            'communityB' => $communityB,
            'residentA'  => $residentA,
            'sellerB'    => $sellerB,
        ] = $this->seedTwoCommunities();

        $listingId = $this->createApprovedListing($communityB->id, $sellerB->id, 'Secret Pine Item');

        Sanctum::actingAs($residentA);

        $this->withHeader('X-Community-Id', (string) $communityB->id)
            ->getJson('/api/v1/listings/'.$listingId)
            ->assertNotFound();
    }

    public function test_resident_cannot_save_listing_from_other_community(): void
    {
        [
            'communityB' => $communityB,
            'residentA'  => $residentA,
            'sellerB'    => $sellerB,
        ] = $this->seedTwoCommunities();

        $listingId = $this->createApprovedListing($communityB->id, $sellerB->id);

        Sanctum::actingAs($residentA);

        $this->postJson('/api/v1/listings/'.$listingId.'/save')
            ->assertNotFound();
    }

    public function test_resident_cannot_message_user_from_other_community(): void
    {
        [
            'communityA' => $communityA,
            'residentA'  => $residentA,
            'residentB'  => $residentB,
        ] = $this->seedTwoCommunities();

        Sanctum::actingAs($residentA);

        $this->withHeader('X-Community-Id', (string) $communityA->id)
            ->postJson('/api/v1/conversations', [
                'recipient_id' => $residentB->id,
                'message'      => 'Hello from another community',
            ])
            ->assertForbidden();
    }

    public function test_resident_cannot_start_listing_chat_for_other_community_listing(): void
    {
        [
            'communityA' => $communityA,
            'communityB' => $communityB,
            'residentA'  => $residentA,
            'sellerB'    => $sellerB,
        ] = $this->seedTwoCommunities();

        $listingId = $this->createApprovedListing($communityB->id, $sellerB->id);

        Sanctum::actingAs($residentA);

        $this->withHeader('X-Community-Id', (string) $communityA->id)
            ->postJson('/api/v1/conversations', [
                'recipient_id' => $sellerB->id,
                'listing_id'   => $listingId,
                'message'      => 'Is this available?',
            ])
            ->assertForbidden();
    }

    public function test_community_members_only_lists_active_community_neighbors(): void
    {
        [
            'communityA' => $communityA,
            'communityB' => $communityB,
            'residentA'  => $residentA,
            'residentB'  => $residentB,
            'sellerB'    => $sellerB,
        ] = $this->seedTwoCommunities();

        Sanctum::actingAs($residentA);

        $response = $this->withHeader('X-Community-Id', (string) $communityA->id)
            ->getJson('/api/v1/community-members');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();

        $this->assertNotContains($residentB->id, $ids);
        $this->assertNotContains($sellerB->id, $ids);
    }

    public function test_conversations_list_is_scoped_to_active_community(): void
    {
        [
            'communityA' => $communityA,
            'communityB' => $communityB,
            'residentA'  => $residentA,
            'residentB'  => $residentB,
        ] = $this->seedTwoCommunities();

        $neighborA = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000104',
            'name'   => 'Neighbor A',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $neighborA->id,
            'community_id' => $communityA->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        Sanctum::actingAs($residentA);

        $this->withHeader('X-Community-Id', (string) $communityA->id)
            ->postJson('/api/v1/conversations', [
                'recipient_id' => $neighborA->id,
                'message'      => 'Hi neighbor',
            ])
            ->assertCreated();

        $this->withHeader('X-Community-Id', (string) $communityB->id)
            ->postJson('/api/v1/conversations', [
                'recipient_id' => $residentB->id,
                'message'      => 'Wrong community attempt',
            ])
            ->assertForbidden();

        $convB = DB::table('conversations')->insertGetId([
            'type'       => 'direct',
            'title'      => null,
            'listing_id' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('conversation_participants')->insert([
            ['conversation_id' => $convB, 'user_id' => $residentA->id, 'created_at' => now(), 'updated_at' => now()],
            ['conversation_id' => $convB, 'user_id' => $residentB->id, 'created_at' => now(), 'updated_at' => now()],
        ]);

        $response = $this->withHeader('X-Community-Id', (string) $communityA->id)
            ->getJson('/api/v1/conversations');

        $response->assertOk();
        $otherIds = collect($response->json('data'))->pluck('other_id')->all();

        $this->assertContains($neighborA->id, $otherIds);
        $this->assertNotContains($residentB->id, $otherIds);
    }
}
