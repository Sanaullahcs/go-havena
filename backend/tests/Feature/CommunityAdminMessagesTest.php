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

class CommunityAdminMessagesTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{community: Community, admin: User, resident: User} */
    private function seedCommunityAdminInbox(): array
    {
        $region = Region::query()->create([
            'title'       => 'Metro',
            'area'        => 'Metro',
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
            'email'                  => 'admin-inbox-'.uniqid().'@test.com',
        ]);

        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'email'  => 'resident-inbox-'.uniqid().'@test.com',
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

    public function test_community_admin_sees_resident_direct_message(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityAdminInbox();

        Sanctum::actingAs($resident);

        $this->withHeader('X-Community-Id', (string) $community->id)
            ->postJson('/api/v1/conversations', [
                'recipient_id' => $admin->id,
                'message'      => 'Hello from resident',
            ])
            ->assertCreated();

        Sanctum::actingAs($admin);

        $response = $this->withHeader('X-Community-Id', (string) $community->id)
            ->getJson('/api/v1/conversations');

        $response->assertOk();
        $otherIds = collect($response->json('data'))->pluck('other_id')->all();

        $this->assertContains($resident->id, $otherIds);
    }

    public function test_community_admin_sees_resident_message_without_community_header(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityAdminInbox();

        Sanctum::actingAs($resident);

        $this->withHeader('X-Community-Id', (string) $community->id)
            ->postJson('/api/v1/conversations', [
                'recipient_id' => $admin->id,
                'message'      => 'Ping admin',
            ])
            ->assertCreated();

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/conversations');

        $response->assertOk();
        $otherIds = collect($response->json('data'))->pluck('other_id')->all();

        $this->assertContains($resident->id, $otherIds);
    }

    public function test_unread_count_endpoint(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityAdminInbox();

        Sanctum::actingAs($resident);
        $this->withHeader('X-Community-Id', (string) $community->id)
            ->postJson('/api/v1/conversations', [
                'recipient_id' => $admin->id,
                'message'      => 'Hello from resident',
            ])
            ->assertCreated();

        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/conversations/unread-count')
            ->assertOk()
            ->assertJsonPath('data.unread_count', 1);
    }

    public function test_opening_a_conversation_marks_its_message_notifications_read(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityAdminInbox();

        Sanctum::actingAs($resident);
        $first = $this->withHeader('X-Community-Id', (string) $community->id)
            ->postJson('/api/v1/conversations', [
                'recipient_id' => $admin->id,
                'message'      => 'First unread',
            ])
            ->assertCreated();

        $conversationId = (int) $first->json('data.conversation_id');

        $this->withHeader('X-Community-Id', (string) $community->id)
            ->postJson("/api/v1/conversations/{$conversationId}/messages", [
                'body' => 'Second unread',
            ])
            ->assertCreated();

        $otherConversationId = $conversationId + 1000;
        DB::table('app_notifications')->insert([
            'user_id'    => $admin->id,
            'type'       => 'info',
            'title'      => 'New message from someone else',
            'body'       => 'Leave this unread',
            'data'       => json_encode([
                'kind'            => 'message',
                'conversation_id' => $otherConversationId,
            ]),
            'action_url' => '/screens/messages/chat?conversationId='.$otherConversationId,
            'read_at'    => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('app_notifications')->insert([
            'user_id'    => $admin->id,
            'type'       => 'info',
            'title'      => 'Pool closed',
            'body'       => 'Maintenance tonight',
            'data'       => json_encode(['kind' => 'notice']),
            'action_url' => null,
            'read_at'    => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($admin);
        $this->withHeader('X-Community-Id', (string) $community->id)
            ->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonPath('unread', 4)
            ->assertJsonPath('unread_messages', 3);

        $this->withHeader('X-Community-Id', (string) $community->id)
            ->getJson("/api/v1/conversations/{$conversationId}/messages")
            ->assertOk();

        $this->getJson('/api/v1/conversations/unread-count')
            ->assertOk()
            ->assertJsonPath('data.unread_count', 0);

        $opened = DB::table('app_notifications')
            ->where('user_id', $admin->id)
            ->where('action_url', 'like', '%conversationId='.$conversationId.'&%')
            ->get();

        $this->assertCount(2, $opened);
        $this->assertTrue($opened->every(fn ($row) => $row->read_at !== null));

        $other = DB::table('app_notifications')
            ->where('user_id', $admin->id)
            ->where('action_url', '/screens/messages/chat?conversationId='.$otherConversationId)
            ->first();

        $this->assertNotNull($other);
        $this->assertNull($other->read_at);

        $this->withHeader('X-Community-Id', (string) $community->id)
            ->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonPath('unread', 2)
            ->assertJsonPath('unread_messages', 1);
    }

    public function test_message_timestamps_are_returned_as_utc_iso8601(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityAdminInbox();

        Sanctum::actingAs($admin);

        $create = $this->withHeader('X-Community-Id', (string) $community->id)
            ->postJson('/api/v1/conversations', [
                'recipient_id' => $resident->id,
                'message'      => 'Hello from admin',
            ])
            ->assertCreated();

        $conversationId = (int) $create->json('data.conversation_id');
        $createdAt = $create->json('data.message.created_at');

        $this->assertIsString($createdAt);
        $this->assertMatchesRegularExpression(
            '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/',
            $createdAt,
        );

        $list = $this->withHeader('X-Community-Id', (string) $community->id)
            ->getJson('/api/v1/conversations')
            ->assertOk();

        $conversation = collect($list->json('data'))->firstWhere('id', $conversationId);
        $this->assertIsArray($conversation);
        $this->assertMatchesRegularExpression(
            '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/',
            $conversation['last_message_at'],
        );

        $thread = $this->withHeader('X-Community-Id', (string) $community->id)
            ->getJson("/api/v1/conversations/{$conversationId}/messages")
            ->assertOk();

        $messageCreatedAt = $thread->json('data.0.created_at');
        $this->assertIsString($messageCreatedAt);
        $this->assertMatchesRegularExpression(
            '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/',
            $messageCreatedAt,
        );
    }
}
