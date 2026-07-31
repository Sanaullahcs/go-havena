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

class ListingMessageTest extends TestCase
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

        $seller = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000060',
            'name'   => 'Seller User',
        ]);

        $buyer = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000061',
            'name'   => 'Buyer User',
        ]);

        foreach ([$seller, $buyer] as $user) {
            CommunityMembership::query()->create([
                'user_id'      => $user->id,
                'community_id' => $community->id,
                'role'         => 'member',
                'status'       => 'approved',
            ]);
        }

        return compact('community', 'seller', 'buyer');
    }

    private function createApprovedListing(int $communityId, int $userId): int
    {
        return DB::table('listings')->insertGetId([
            'community_id' => $communityId,
            'user_id'      => $userId,
            'type'         => 'for_sale',
            'category'     => 'Furniture',
            'condition'    => 'Good',
            'title'        => 'Vintage Chair',
            'price'        => 120,
            'description'  => 'Comfortable chair.',
            'images'       => json_encode(['https://example.com/chair.jpg']),
            'status'       => 'approved',
            'approved_by'  => $userId,
            'approved_at'  => now(),
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);
    }

    public function test_buyer_can_start_listing_conversation_with_message(): void
    {
        ['community' => $community, 'seller' => $seller, 'buyer' => $buyer] = $this->seedCommunity();
        $listingId = $this->createApprovedListing($community->id, $seller->id);

        Sanctum::actingAs($buyer);

        $response = $this->postJson('/api/v1/conversations', [
            'recipient_id' => $seller->id,
            'listing_id'   => $listingId,
            'message'      => 'Is this still available?',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.conversation_id', fn ($id) => is_int($id))
            ->assertJsonPath('data.listing.title', 'Vintage Chair');

        $convId = $response->json('data.conversation_id');

        $this->assertDatabaseHas('conversations', [
            'id'         => $convId,
            'listing_id' => $listingId,
        ]);

        $this->assertDatabaseHas('messages', [
            'conversation_id' => $convId,
            'sender_id'       => $buyer->id,
            'type'            => 'text',
            'body'            => 'Is this still available?',
        ]);
    }

    public function test_buyer_can_send_offer_on_listing(): void
    {
        ['community' => $community, 'seller' => $seller, 'buyer' => $buyer] = $this->seedCommunity();
        $listingId = $this->createApprovedListing($community->id, $seller->id);

        Sanctum::actingAs($buyer);

        $response = $this->postJson('/api/v1/conversations', [
            'recipient_id' => $seller->id,
            'listing_id'   => $listingId,
            'offer_amount' => 95,
            'message'      => 'Can pick up today.',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.message.type', 'offer')
            ->assertJsonPath('data.message.metadata.offer_amount', 95);

        $this->assertDatabaseHas('messages', [
            'sender_id' => $buyer->id,
            'type'      => 'offer',
        ]);

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $seller->id,
            'title'   => 'New offer received',
        ]);

        $notification = DB::table('app_notifications')
            ->where('user_id', $seller->id)
            ->where('title', 'New offer received')
            ->first();

        $this->assertStringContainsString('/screens/messages/chat?conversationId=', $notification->action_url);
    }

    public function test_reuses_existing_listing_conversation(): void
    {
        ['community' => $community, 'seller' => $seller, 'buyer' => $buyer] = $this->seedCommunity();
        $listingId = $this->createApprovedListing($community->id, $seller->id);

        Sanctum::actingAs($buyer);

        $first = $this->postJson('/api/v1/conversations', [
            'recipient_id' => $seller->id,
            'listing_id'   => $listingId,
            'message'      => 'Hello',
        ])->json('data.conversation_id');

        $second = $this->postJson('/api/v1/conversations', [
            'recipient_id' => $seller->id,
            'listing_id'   => $listingId,
        ])->json('data.conversation_id');

        $this->assertSame($first, $second);
        $this->assertSame(1, DB::table('conversations')->where('listing_id', $listingId)->count());
    }

    public function test_cannot_message_yourself_or_sold_listing(): void
    {
        ['community' => $community, 'seller' => $seller, 'buyer' => $buyer] = $this->seedCommunity();
        $listingId = $this->createApprovedListing($community->id, $seller->id);

        Sanctum::actingAs($seller);

        $this->postJson('/api/v1/conversations', [
            'recipient_id' => $seller->id,
            'listing_id'   => $listingId,
        ])->assertStatus(422);

        DB::table('listings')->where('id', $listingId)->update(['status' => 'sold']);

        Sanctum::actingAs($buyer);

        $this->postJson('/api/v1/conversations', [
            'recipient_id' => $seller->id,
            'listing_id'   => $listingId,
            'message'      => 'Still available?',
        ])->assertStatus(422);
    }

    public function test_resident_can_list_community_members_for_messaging(): void
    {
        ['community' => $community, 'seller' => $seller, 'buyer' => $buyer] = $this->seedCommunity();

        Sanctum::actingAs($buyer);

        $response = $this->getJson('/api/v1/community-members');

        $response->assertOk()
            ->assertJsonFragment(['id' => $seller->id, 'name' => 'Seller User'])
            ->assertJsonMissing(['id' => $buyer->id]);
    }

    public function test_resident_can_start_direct_chat_with_neighbor(): void
    {
        ['community' => $community, 'seller' => $seller, 'buyer' => $buyer] = $this->seedCommunity();

        Sanctum::actingAs($buyer);

        $response = $this->postJson('/api/v1/conversations', [
            'recipient_id' => $seller->id,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.conversation_id', fn ($id) => is_int($id));

        $this->assertDatabaseHas('conversation_participants', [
            'user_id' => $buyer->id,
        ]);
        $this->assertDatabaseHas('conversation_participants', [
            'user_id' => $seller->id,
        ]);
    }
}
