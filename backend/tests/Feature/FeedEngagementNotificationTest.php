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

class FeedEngagementNotificationTest extends TestCase
{
    use RefreshDatabase;

    private function seedCommunity(): array
    {
        $region = Region::query()->create([
            'title'       => 'Test Region',
            'area'        => 'Area',
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

        $author = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000040',
            'name'   => 'Post Author',
        ]);

        $neighbor = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000041',
            'name'   => 'Neighbor One',
        ]);

        $otherNeighbor = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000042',
            'name'   => 'Neighbor Two',
        ]);

        foreach ([$author, $neighbor, $otherNeighbor] as $user) {
            CommunityMembership::query()->create([
                'user_id'      => $user->id,
                'community_id' => $community->id,
                'role'         => 'member',
                'status'       => 'approved',
            ]);
        }

        return compact('community', 'author', 'neighbor', 'otherNeighbor');
    }

    private function createApprovedPost(int $communityId, int $userId, string $body = 'Hello neighbors!'): int
    {
        return (int) DB::table('posts')->insertGetId([
            'community_id'   => $communityId,
            'user_id'        => $userId,
            'body'           => $body,
            'category'       => 'general',
            'status'         => 'approved',
            'approved_by'    => $userId,
            'approved_at'    => now(),
            'likes_count'    => 0,
            'comments_count' => 0,
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);
    }

    public function test_like_notifies_post_author(): void
    {
        ['community' => $community, 'author' => $author, 'neighbor' => $neighbor] = $this->seedCommunity();
        $postId = $this->createApprovedPost($community->id, $author->id);

        Sanctum::actingAs($neighbor);

        $this->postJson("/api/v1/feed/{$postId}/like", [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk()->assertJsonPath('liked', true);

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $author->id,
            'title'   => 'Post reaction',
            'body'    => 'Neighbor One liked your post.',
        ]);

        $notification = DB::table('app_notifications')
            ->where('user_id', $author->id)
            ->where('title', 'Post reaction')
            ->first();

        $this->assertSame("/screens/community-feed/comments?postId={$postId}", $notification->action_url);
    }

    public function test_self_like_does_not_notify(): void
    {
        ['community' => $community, 'author' => $author] = $this->seedCommunity();
        $postId = $this->createApprovedPost($community->id, $author->id);

        Sanctum::actingAs($author);

        $this->postJson("/api/v1/feed/{$postId}/like", [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk();

        $this->assertDatabaseMissing('app_notifications', [
            'user_id' => $author->id,
            'title'   => 'Post reaction',
        ]);
    }

    public function test_multiple_likes_aggregate_into_one_notification(): void
    {
        ['community' => $community, 'author' => $author, 'neighbor' => $neighbor, 'otherNeighbor' => $otherNeighbor] = $this->seedCommunity();
        $postId = $this->createApprovedPost($community->id, $author->id);

        Sanctum::actingAs($neighbor);
        $this->postJson("/api/v1/feed/{$postId}/like", [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk();

        Sanctum::actingAs($otherNeighbor);
        $this->postJson("/api/v1/feed/{$postId}/like", [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk();

        $this->assertSame(1, DB::table('app_notifications')
            ->where('user_id', $author->id)
            ->where('title', 'Post reaction')
            ->count());

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $author->id,
            'title'   => 'Post reaction',
            'body'    => 'Neighbor One and Neighbor Two liked your post.',
        ]);
    }

    public function test_comment_notifies_post_author_with_snippet(): void
    {
        ['community' => $community, 'author' => $author, 'neighbor' => $neighbor] = $this->seedCommunity();
        $postId = $this->createApprovedPost($community->id, $author->id);

        Sanctum::actingAs($neighbor);

        $this->postJson("/api/v1/feed/{$postId}/comments", [
            'body' => 'This is a great update!',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $author->id,
            'title'   => 'New comment',
            'body'    => 'Neighbor One commented on your post: "This is a great update!"',
        ]);
    }

    public function test_self_comment_does_not_notify(): void
    {
        ['community' => $community, 'author' => $author] = $this->seedCommunity();
        $postId = $this->createApprovedPost($community->id, $author->id);

        Sanctum::actingAs($author);

        $this->postJson("/api/v1/feed/{$postId}/comments", [
            'body' => 'My own note',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        $this->assertDatabaseMissing('app_notifications', [
            'user_id' => $author->id,
            'title'   => 'New comment',
        ]);
    }

    public function test_comment_like_notifies_comment_author(): void
    {
        ['community' => $community, 'author' => $author, 'neighbor' => $neighbor, 'otherNeighbor' => $otherNeighbor] = $this->seedCommunity();
        $postId = $this->createApprovedPost($community->id, $author->id);

        Sanctum::actingAs($neighbor);
        $commentResponse = $this->postJson("/api/v1/feed/{$postId}/comments", [
            'body' => 'Nice post!',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();
        $commentId = (int) $commentResponse->json('data.id');

        Sanctum::actingAs($otherNeighbor);
        $this->postJson("/api/v1/feed/{$postId}/comments/{$commentId}/like", [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk()->assertJsonPath('liked', true);

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $neighbor->id,
            'title'   => 'Comment reaction',
            'body'    => 'Neighbor Two liked your comment.',
        ]);
    }

    public function test_self_comment_like_does_not_notify(): void
    {
        ['community' => $community, 'author' => $author, 'neighbor' => $neighbor] = $this->seedCommunity();
        $postId = $this->createApprovedPost($community->id, $author->id);

        Sanctum::actingAs($neighbor);
        $commentResponse = $this->postJson("/api/v1/feed/{$postId}/comments", [
            'body' => 'Nice post!',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();
        $commentId = (int) $commentResponse->json('data.id');

        Sanctum::actingAs($neighbor);
        $this->postJson("/api/v1/feed/{$postId}/comments/{$commentId}/like", [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk();

        $this->assertDatabaseMissing('app_notifications', [
            'user_id' => $neighbor->id,
            'title'   => 'Comment reaction',
        ]);
    }

    public function test_author_sees_like_notification_in_api(): void
    {
        ['community' => $community, 'author' => $author, 'neighbor' => $neighbor] = $this->seedCommunity();
        $postId = $this->createApprovedPost($community->id, $author->id);

        Sanctum::actingAs($neighbor);
        $this->postJson("/api/v1/feed/{$postId}/like", [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk();

        Sanctum::actingAs($author);

        $listed = $this->getJson('/api/v1/notifications?per_page=50')->assertOk();
        $latest = collect($listed->json('data'))->firstWhere('title', 'Post reaction');

        $this->assertNotNull($latest);
        $this->assertStringContainsString('liked your post', $latest['body']);
        $this->assertSame("/screens/community-feed/comments?postId={$postId}", $latest['action_url']);
        $this->assertGreaterThanOrEqual(1, (int) $listed->json('unread'));
    }

    public function test_author_sees_comment_notification_in_api(): void
    {
        ['community' => $community, 'author' => $author, 'neighbor' => $neighbor] = $this->seedCommunity();
        $postId = $this->createApprovedPost($community->id, $author->id);

        Sanctum::actingAs($neighbor);
        $this->postJson("/api/v1/feed/{$postId}/comments", [
            'body' => 'Nice post!',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        Sanctum::actingAs($author);

        $listed = $this->getJson('/api/v1/notifications?per_page=50')->assertOk();
        $latest = collect($listed->json('data'))->firstWhere('title', 'New comment');

        $this->assertNotNull($latest);
        $this->assertStringContainsString('commented on your post', $latest['body']);
        $this->assertSame("/screens/community-feed/comments?postId={$postId}", $latest['action_url']);
    }

    public function test_creating_post_notifies_other_community_members(): void
    {
        ['community' => $community, 'author' => $author, 'neighbor' => $neighbor, 'otherNeighbor' => $otherNeighbor] = $this->seedCommunity();

        Sanctum::actingAs($author);

        $create = $this->postJson('/api/v1/feed', [
            'body' => 'Block party this weekend!',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        $postId = (int) $create->json('data.id');

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $neighbor->id,
            'title'   => 'New community post',
            'body'    => 'Post Author shared a new post: "Block party this weekend!"',
        ]);

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $otherNeighbor->id,
            'title'   => 'New community post',
        ]);

        $this->assertDatabaseMissing('app_notifications', [
            'user_id' => $author->id,
            'title'   => 'New community post',
        ]);

        $notification = DB::table('app_notifications')
            ->where('user_id', $neighbor->id)
            ->where('title', 'New community post')
            ->first();

        $this->assertSame("/screens/community-feed/comments?postId={$postId}", $notification->action_url);
        $data = json_decode($notification->data ?? '{}', true);
        $this->assertSame('post_created', $data['kind'] ?? null);
        $this->assertSame($postId, (int) ($data['post_id'] ?? 0));
    }

    public function test_comment_also_notifies_prior_commenters(): void
    {
        ['community' => $community, 'author' => $author, 'neighbor' => $neighbor, 'otherNeighbor' => $otherNeighbor] = $this->seedCommunity();
        $postId = $this->createApprovedPost($community->id, $author->id);

        Sanctum::actingAs($neighbor);
        $this->postJson("/api/v1/feed/{$postId}/comments", [
            'body' => 'First reply',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        Sanctum::actingAs($otherNeighbor);
        $this->postJson("/api/v1/feed/{$postId}/comments", [
            'body' => 'Second reply',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $author->id,
            'title'   => 'New comment',
            'body'    => 'Neighbor Two commented on your post: "Second reply"',
        ]);

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $neighbor->id,
            'title'   => 'New comment',
            'body'    => 'Neighbor Two also commented: "Second reply"',
        ]);
    }

    public function test_reply_nests_under_parent_and_notifies_parent_author(): void
    {
        ['community' => $community, 'author' => $author, 'neighbor' => $neighbor, 'otherNeighbor' => $otherNeighbor] = $this->seedCommunity();
        $postId = $this->createApprovedPost($community->id, $author->id);

        Sanctum::actingAs($neighbor);
        $parent = $this->postJson("/api/v1/feed/{$postId}/comments", [
            'body' => 'Parent thought',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        $parentId = (int) $parent->json('data.id');

        Sanctum::actingAs($otherNeighbor);
        $reply = $this->postJson("/api/v1/feed/{$postId}/comments", [
            'body'      => 'Nested reply here',
            'parent_id' => $parentId,
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        $this->assertSame($parentId, $reply->json('data.parent_id'));
        $this->assertSame(1, $reply->json('data.depth'));
        $this->assertSame('Neighbor One', $reply->json('data.parent_author_name'));

        $listed = $this->getJson("/api/v1/feed/{$postId}/comments", [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk()->json('data');

        $this->assertSame($parentId, $listed[0]['id']);
        $this->assertSame($reply->json('data.id'), $listed[1]['id']);
        $this->assertSame(1, $listed[1]['depth']);

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $neighbor->id,
            'title'   => 'New reply',
            'body'    => 'Neighbor Two replied to your comment: "Nested reply here"',
        ]);

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $author->id,
            'title'   => 'New comment',
            'body'    => 'Neighbor Two replied on your post: "Nested reply here"',
        ]);
    }

    public function test_deep_reply_is_capped_at_max_depth(): void
    {
        ['community' => $community, 'author' => $author, 'neighbor' => $neighbor, 'otherNeighbor' => $otherNeighbor] = $this->seedCommunity();
        $postId = $this->createApprovedPost($community->id, $author->id);

        Sanctum::actingAs($neighbor);
        $level0 = (int) $this->postJson("/api/v1/feed/{$postId}/comments", [
            'body' => 'Level 0',
        ], ['X-Community-Id' => (string) $community->id])->json('data.id');

        Sanctum::actingAs($otherNeighbor);
        $level1 = (int) $this->postJson("/api/v1/feed/{$postId}/comments", [
            'body' => 'Level 1',
            'parent_id' => $level0,
        ], ['X-Community-Id' => (string) $community->id])->json('data.id');

        Sanctum::actingAs($neighbor);
        $level2 = (int) $this->postJson("/api/v1/feed/{$postId}/comments", [
            'body' => 'Level 2',
            'parent_id' => $level1,
        ], ['X-Community-Id' => (string) $community->id])->json('data.id');

        Sanctum::actingAs($otherNeighbor);
        $capped = $this->postJson("/api/v1/feed/{$postId}/comments", [
            'body' => 'Would be level 3',
            'parent_id' => $level2,
        ], ['X-Community-Id' => (string) $community->id])->assertCreated();

        $this->assertSame($level1, $capped->json('data.parent_id'));
        $this->assertLessThanOrEqual(2, (int) $capped->json('data.depth'));
    }
}
