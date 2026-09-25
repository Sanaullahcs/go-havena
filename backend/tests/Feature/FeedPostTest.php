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

class FeedPostTest extends TestCase
{
    use RefreshDatabase;

    private function seedCommunityWithAdmin(): array
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
            'phone'                  => '+201700000030',
        ]);

        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000031',
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

    public function test_resident_post_is_published_immediately_without_approval(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($resident);

        $create = $this->postJson('/api/v1/feed', [
            'body' => 'Hello neighbors!',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        $this->assertSame('approved', $create->json('data.status'));
        $this->assertSame('Hello neighbors!', $create->json('data.body'));
        $this->assertSame('Post published to your community feed.', $create->json('message'));

        $this->getJson('/api/v1/feed?community_id='.$community->id)
            ->assertOk()
            ->assertJsonPath('data.0.body', 'Hello neighbors!')
            ->assertJsonPath('data.0.status', 'approved');
    }

    public function test_community_admin_post_is_published_immediately(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $create = $this->postJson('/api/v1/feed', [
            'body' => 'Admin update for everyone.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        $this->assertSame('approved', $create->json('data.status'));
        $this->assertSame('Admin update for everyone.', $create->json('data.body'));
    }

    public function test_community_admin_can_delete_published_post(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($resident);

        $create = $this->postJson('/api/v1/feed', [
            'body' => 'Posted before moderation review.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        $postId = $create->json('data.id');

        $this->getJson('/api/v1/feed?community_id='.$community->id)
            ->assertOk()
            ->assertJsonPath('data.0.id', $postId);

        Sanctum::actingAs($admin);

        $this->deleteJson('/api/v1/admin/posts/'.$postId)
            ->assertOk()
            ->assertJsonPath('message', 'Post deleted from the community feed');

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/feed?community_id='.$community->id)
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_community_admin_can_view_post_detail_with_live_engagement(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($resident);

        $postId = $this->postJson('/api/v1/feed', [
            'body' => 'Post with engagement',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated()->json('data.id');

        DB::table('post_likes')->insert([
            'user_id'    => $admin->id,
            'post_id'    => $postId,
            'created_at' => now(),
        ]);

        DB::table('post_comments')->insert([
            'post_id'    => $postId,
            'user_id'    => $admin->id,
            'body'       => 'Nice post!',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/admin/posts/'.$postId)
            ->assertOk()
            ->assertJsonPath('data.likes_count', 1)
            ->assertJsonPath('data.comments_count', 1)
            ->assertJsonCount(1, 'comments');
    }

    public function test_community_admin_can_report_post_and_residents_see_sensitive_content(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($resident);

        $postId = $this->postJson('/api/v1/feed', [
            'body' => 'Inappropriate community post content.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/admin/posts/'.$postId.'/report', [
            'reason' => 'Violates community guidelines.',
        ])
            ->assertOk()
            ->assertJsonPath('data.is_sensitive', true)
            ->assertJsonPath('data.report_status', 'sensitive')
            ->assertJsonPath('data.reports_count', 1);

        $this->getJson('/api/v1/admin/posts')
            ->assertOk()
            ->assertJsonPath('data.0.report_status', 'sensitive')
            ->assertJsonPath('data.0.is_sensitive', true);

        $this->getJson('/api/v1/admin/posts/'.$postId.'/reports')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.source', 'admin')
            ->assertJsonPath('data.0.reason', 'Violates community guidelines.');

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/feed?community_id='.$community->id, [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.0.is_sensitive', true)
            ->assertJsonPath('data.0.body', null)
            ->assertJsonPath('data.0.sensitive_message', 'This post has been reported and hidden due to community guidelines.');
    }

    public function test_resident_report_marks_post_as_reported_not_sensitive(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        $author = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000032',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $author->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        Sanctum::actingAs($author);

        $postId = $this->postJson('/api/v1/feed', [
            'body' => 'Post that a neighbor will report.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($resident);

        $this->postJson('/api/v1/feed/'.$postId.'/report', [
            'type'        => 'spam',
            'description' => 'This looks like spam to me.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.report_status', 'reported')
            ->assertJsonPath('data.is_sensitive', false);

        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/admin/posts')
            ->assertOk()
            ->assertJsonPath('data.0.id', $postId)
            ->assertJsonPath('data.0.report_status', 'reported')
            ->assertJsonPath('data.0.is_sensitive', false)
            ->assertJsonPath('data.0.resident_reports_count', 1);

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/feed?community_id='.$community->id, [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.0.id', $postId)
            ->assertJsonPath('data.0.is_sensitive', false)
            ->assertJsonPath('data.0.body', 'Post that a neighbor will report.');
    }

    public function test_resident_can_report_another_residents_comment(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        $author = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000033',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $author->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        Sanctum::actingAs($author);
        $postId = $this->postJson('/api/v1/feed', [
            'body' => 'A post neighbors can comment on.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated()->json('data.id');

        $commentId = $this->postJson('/api/v1/feed/'.$postId.'/comments', [
            'body' => 'This comment should be reportable.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/feed/'.$postId.'/comments/'.$commentId.'/report', [
            'type'        => 'harassment',
            'description' => 'This comment is abusive toward neighbors.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.comment_id', $commentId)
            ->assertJsonPath('data.reported_user_id', $author->id);

        $this->assertDatabaseHas('post_reports', [
            'post_id'          => $postId,
            'comment_id'       => $commentId,
            'reporter_id'      => $resident->id,
            'reported_user_id' => $author->id,
            'source'           => 'resident',
            'type'             => 'harassment',
        ]);

        $systemAdmin = User::factory()->create([
            'role'   => 'system_admin',
            'status' => 'active',
            'phone'  => '+201700000034',
        ]);

        Sanctum::actingAs($systemAdmin);
        $this->getJson('/api/v1/admin/posts/'.$postId.'/reports')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.target', 'comment')
            ->assertJsonPath('data.0.comment_id', $commentId)
            ->assertJsonPath('data.0.reporter_id', $resident->id)
            ->assertJsonPath('data.0.reported_user_id', $author->id)
            ->assertJsonPath('data.0.comment_body', 'This comment should be reportable.');
    }

    public function test_resident_cannot_report_own_comment(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($resident);
        $postId = $this->postJson('/api/v1/feed', [
            'body' => 'My post.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated()->json('data.id');

        $commentId = $this->postJson('/api/v1/feed/'.$postId.'/comments', [
            'body' => 'My own comment.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated()->json('data.id');

        $this->postJson('/api/v1/feed/'.$postId.'/comments/'.$commentId.'/report', [
            'type' => 'spam',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'You cannot report your own comment');
    }

    public function test_resident_can_report_community_admin_comment(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);
        $postId = $this->postJson('/api/v1/feed', [
            'body' => 'Official update.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated()->json('data.id');

        $commentId = $this->postJson('/api/v1/feed/'.$postId.'/comments', [
            'body' => 'Admin-written comment that is still UGC.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/feed/'.$postId.'/comments/'.$commentId.'/report', [
            'type' => 'other',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.comment_id', $commentId);
    }

    public function test_community_admin_poll_accepts_one_vote_and_then_closes(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/feed', [
            'category' => 'poll',
            'poll' => [
                'question' => 'Should guest parking be limited?',
                'duration_days' => 3,
                'options' => ['Yes', 'No'],
            ],
        ], ['X-Community-Id' => (string) $community->id])->assertForbidden();

        Sanctum::actingAs($admin);
        $create = $this->postJson('/api/v1/feed', [
            'category' => 'poll',
            'poll' => [
                'question' => 'Should guest parking be limited to 4 hours after 8 PM?',
                'description' => 'A quick pulse check before we decide.',
                'duration_days' => 3,
                'options' => ['Yes', 'No', 'Keep the current rule'],
            ],
        ], ['X-Community-Id' => (string) $community->id])->assertCreated();

        $create->assertJsonPath('data.category', 'poll');
        $create->assertJsonPath('data.poll.results_visible', false);
        $create->assertJsonPath('data.poll.closed', false);
        $this->assertCount(3, $create->json('data.poll.options'));
        $postId = $create->json('data.id');
        $yesId = $create->json('data.poll.options.0.id');

        Sanctum::actingAs($resident);
        $vote = $this->postJson('/api/v1/feed/'.$postId.'/vote', [
            'option_id' => $yesId,
        ], ['X-Community-Id' => (string) $community->id])->assertOk();

        $vote->assertJsonPath('data.poll.voted_option_id', $yesId);
        $vote->assertJsonPath('data.poll.total_votes', 1);
        $vote->assertJsonPath('data.poll.options.0.percent', 100);
        $vote->assertJsonPath('message', 'Vote recorded.');

        $this->postJson('/api/v1/feed/'.$postId.'/vote', [
            'option_id' => $create->json('data.poll.options.1.id'),
        ], ['X-Community-Id' => (string) $community->id])
            ->assertStatus(422)
            ->assertJsonPath('message', 'You have already voted in this poll.');

        $this->assertSame(1, DB::table('poll_votes')->where('user_id', $resident->id)->count());

        DB::table('polls')->where('post_id', $postId)->update([
            'ends_at' => now()->subMinute(),
        ]);

        Sanctum::actingAs($admin);
        $closed = $this->getJson('/api/v1/feed/'.$postId, [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk();
        $closed->assertJsonPath('data.poll.closed', true);
        $closed->assertJsonPath('data.poll.results_visible', true);
        $closed->assertJsonPath('data.poll.total_votes', 1);

        $this->postJson('/api/v1/feed/'.$postId.'/vote', [
            'option_id' => $yesId,
        ], ['X-Community-Id' => (string) $community->id])
            ->assertStatus(422)
            ->assertJsonPath('message', 'This poll is closed.');

        $this->postJson('/api/v1/feed/'.$postId.'/comments', [
            'body' => 'Four hours is enough overnight.',
        ], ['X-Community-Id' => (string) $community->id])->assertCreated();
    }
}
