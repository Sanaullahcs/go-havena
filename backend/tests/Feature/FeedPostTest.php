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

        app(\App\Services\CommunityBillingService::class)->activateManualSubscription($community, 'growth');

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
            ->assertJsonPath('data.0.body', 'Inappropriate community post content.')
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

        app(\App\Services\CommunityBillingService::class)->activateManualSubscription($community, 'growth');

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
            ->assertJsonCount(0, 'data');

        $this->getJson('/api/v1/feed/'.$postId, [
            'X-Community-Id' => (string) $community->id,
        ])->assertNotFound();

        Sanctum::actingAs($author);

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

    public function test_poll_description_is_optional_and_capped_at_500_characters(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);
        $headers = ['X-Community-Id' => (string) $community->id];

        $this->postJson('/api/v1/feed', [
            'category' => 'poll',
            'poll' => [
                'question' => 'Should we add a weekend market?',
                'description' => str_repeat('a', 501),
                'duration_days' => 3,
                'options' => ['Yes', 'No'],
            ],
        ], $headers)
            ->assertStatus(422)
            ->assertJsonValidationErrors([
                'poll.description' => 'Short description must be 500 characters or fewer.',
            ]);

        $this->assertSame(0, DB::table('polls')->count());

        $description = str_repeat('b', 500);
        $this->postJson('/api/v1/feed', [
            'category' => 'poll',
            'poll' => [
                'question' => 'Should we add a weekend market?',
                'description' => $description,
                'duration_days' => 3,
                'options' => ['Yes', 'No'],
            ],
        ], $headers)
            ->assertCreated()
            ->assertJsonPath('data.poll.description', $description);

        app(\App\Services\CommunityBillingService::class)->activateManualSubscription($community, 'growth');

        $this->postJson('/api/v1/feed', [
            'body' => 'Community update from the admin.',
            'category' => 'announcement',
        ], $headers)
            ->assertCreated()
            ->assertJsonPath('data.category', 'announcement')
            ->assertJsonPath('data.body', 'Community update from the admin.')
            ->assertJsonPath('message', 'Post published to your community feed.');

        $this->getJson('/api/v1/admin/posts')
            ->assertOk()
            ->assertJsonPath('data.0.category', 'announcement')
            ->assertJsonPath('data.0.body', 'Community update from the admin.')
            ->assertJsonPath('data.1.category', 'poll')
            ->assertJsonPath('data.1.poll.question', 'Should we add a weekend market?')
            ->assertJsonPath('data.1.poll.description', $description);
    }

    public function test_resident_and_admin_can_create_polls_and_vote_once(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($resident);
        $residentCreate = $this->postJson('/api/v1/feed', [
            'category' => 'poll',
            'poll' => [
                'question' => 'Should guest parking be limited?',
                'duration_days' => 3,
                'options' => ['Yes', 'No'],
            ],
        ], ['X-Community-Id' => (string) $community->id])->assertCreated();

        $residentCreate->assertJsonPath('data.category', 'poll');
        $residentCreate->assertJsonPath('data.poll.closed', false);
        $this->assertCount(2, $residentCreate->json('data.poll.options'));

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

        $noId = $create->json('data.poll.options.1.id');
        $changed = $this->postJson('/api/v1/feed/'.$postId.'/vote', [
            'option_id' => $noId,
        ], ['X-Community-Id' => (string) $community->id])->assertOk();

        $changed->assertJsonPath('message', 'Vote updated.');
        $changed->assertJsonPath('data.poll.voted_option_id', $noId);
        $changed->assertJsonPath('data.poll.total_votes', 1);
        $changed->assertJsonPath('data.poll.options.0.votes', 0);
        $changed->assertJsonPath('data.poll.options.0.percent', 0);
        $changed->assertJsonPath('data.poll.options.1.votes', 1);
        $changed->assertJsonPath('data.poll.options.1.percent', 100);
        $this->assertSame(1, DB::table('poll_votes')->where('user_id', $resident->id)->count());
        $this->assertSame((int) $noId, (int) DB::table('poll_votes')->where('user_id', $resident->id)->value('option_id'));

        $this->postJson('/api/v1/feed/'.$postId.'/vote', [
            'option_id' => $yesId,
        ], ['X-Community-Id' => (string) $community->id])
            ->assertOk()
            ->assertJsonPath('data.poll.voted_option_id', $yesId)
            ->assertJsonPath('data.poll.total_votes', 1)
            ->assertJsonPath('data.poll.options.0.percent', 100)
            ->assertJsonPath('data.poll.options.1.percent', 0);

        $this->getJson('/api/v1/feed/'.$postId, [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.poll.voted_option_id', $yesId)
            ->assertJsonPath('data.poll.total_votes', 1);

        $this->assertSame(1, DB::table('poll_votes')->where('user_id', $resident->id)->count());

        Sanctum::actingAs($admin);
        $adminVote = $this->postJson('/api/v1/feed/'.$postId.'/vote', [
            'option_id' => $create->json('data.poll.options.1.id'),
        ], ['X-Community-Id' => (string) $community->id])->assertOk();
        $adminVote->assertJsonPath('data.poll.total_votes', 2);

        DB::table('polls')->where('post_id', $postId)->update([
            'ends_at' => now()->subMinute(),
        ]);

        Sanctum::actingAs($admin);
        $closed = $this->getJson('/api/v1/feed/'.$postId, [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk();
        $closed->assertJsonPath('data.poll.closed', true);
        $closed->assertJsonPath('data.poll.results_visible', true);
        $closed->assertJsonPath('data.poll.total_votes', 2);

        $this->postJson('/api/v1/feed/'.$postId.'/vote', [
            'option_id' => $yesId,
        ], ['X-Community-Id' => (string) $community->id])
            ->assertStatus(422)
            ->assertJsonPath('message', 'This poll is closed.');

        $this->postJson('/api/v1/feed/'.$postId.'/comments', [
            'body' => 'Four hours is enough overnight.',
        ], ['X-Community-Id' => (string) $community->id])->assertCreated();
    }

    public function test_resident_report_stays_pending_until_an_admin_resolves_it(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        $author = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000041',
        ]);
        CommunityMembership::query()->create([
            'user_id'      => $author->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        Sanctum::actingAs($author);
        $postId = $this->postJson('/api/v1/feed', [
            'body' => 'A neighbor post that needs review.',
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
            ->assertJsonPath('data.status', 'pending_review')
            ->assertJsonPath('data.review_queue', 'community_admin')
            ->assertJsonPath('data.is_sensitive', false);

        $this->assertDatabaseHas('post_reports', [
            'post_id'      => $postId,
            'reporter_id'  => $resident->id,
            'status'       => 'pending_review',
            'review_queue' => 'community_admin',
        ]);
        $this->assertDatabaseHas('posts', [
            'id'           => $postId,
            'status'       => 'approved',
            'is_sensitive' => false,
            'deleted_at'   => null,
        ]);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $admin->id,
            'title'   => 'Post reported',
        ]);
        $this->assertDatabaseMissing('app_notifications', [
            'user_id' => $author->id,
            'title'   => 'Post reported',
        ]);
        $this->assertDatabaseHas('activity_logs', [
            'action'      => 'post_reported_by_resident',
            'entity_type' => 'Post',
            'entity_id'   => $postId,
        ]);

        app(\App\Services\CommunityBillingService::class)->activateManualSubscription($community, 'growth');
        Sanctum::actingAs($admin);

        $reportId = $this->getJson('/api/v1/admin/posts/'.$postId.'/reports')
            ->assertOk()
            ->assertJsonPath('data.0.status', 'pending_review')
            ->assertJsonPath('data.0.reporter_name', $resident->name)
            ->json('data.0.id');

        $this->postJson('/api/v1/admin/posts/'.$postId.'/reports/'.$reportId.'/dismiss')
            ->assertOk()
            ->assertJsonPath('data.status', 'dismissed')
            ->assertJsonPath('data.is_sensitive', false);

        $this->assertDatabaseHas('posts', [
            'id'           => $postId,
            'status'       => 'approved',
            'is_sensitive' => false,
        ]);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $resident->id,
            'title'   => 'Report reviewed',
        ]);
        $this->assertDatabaseMissing('app_notifications', [
            'user_id' => $author->id,
            'title'   => 'Post marked as sensitive',
        ]);

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/feed/'.$postId.'/report', [
            'type'        => 'spam',
            'description' => 'Reporting it again after review.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertStatus(422);

        $second = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000042',
        ]);
        CommunityMembership::query()->create([
            'user_id'      => $second->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);
        Sanctum::actingAs($second);
        $this->postJson('/api/v1/feed/'.$postId.'/report', [
            'type'        => 'harassment',
            'description' => 'This post targets a neighbor.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/admin/posts/'.$postId.'/report', [
            'reason' => 'Violates community guidelines.',
        ])->assertOk()->assertJsonPath('data.is_sensitive', true);

        $this->assertDatabaseHas('posts', [
            'id'           => $postId,
            'status'       => 'approved',
            'is_sensitive' => true,
        ]);
        $this->assertDatabaseHas('post_reports', [
            'post_id'     => $postId,
            'reporter_id' => $second->id,
            'status'      => 'resolved',
            'resolution'  => 'marked_sensitive',
        ]);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $author->id,
            'title'   => 'Post marked as sensitive',
        ]);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $second->id,
            'title'   => 'Report reviewed',
        ]);
        $this->assertDatabaseHas('activity_logs', [
            'action' => 'post_reported',
        ]);
    }

    public function test_resident_cannot_report_community_admin_post(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);
        $postId = $this->postJson('/api/v1/feed', [
            'body' => 'A community admin post.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/feed?community_id='.$community->id, [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.0.id', $postId)
            ->assertJsonPath('data.0.can_report', false)
            ->assertJsonPath('data.0.can_block', false);

        $this->postJson('/api/v1/feed/'.$postId.'/report', [
            'type'        => 'spam',
            'description' => 'Trying to report an admin post.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'You cannot report posts from community admins.');

        $this->assertDatabaseMissing('post_reports', [
            'post_id'     => $postId,
            'reporter_id' => $resident->id,
            'source'      => 'resident',
        ]);
    }
}
