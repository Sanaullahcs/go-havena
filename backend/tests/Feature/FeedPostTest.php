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
}
