<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
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

    public function test_community_admin_can_reject_published_post_and_reapprove(): void
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

        $this->patchJson('/api/v1/admin/posts/'.$postId.'/reject', [
            'reason' => 'Off-topic content',
        ])->assertOk()
            ->assertJsonPath('message', 'Post removed from the community feed');

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/feed?community_id='.$community->id)
            ->assertOk()
            ->assertJsonCount(0, 'data');

        Sanctum::actingAs($admin);

        $this->patchJson('/api/v1/admin/posts/'.$postId.'/approve')
            ->assertOk()
            ->assertJsonPath('message', 'Post re-approved and published to the community feed');

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/feed?community_id='.$community->id)
            ->assertOk()
            ->assertJsonPath('data.0.id', $postId)
            ->assertJsonPath('data.0.body', 'Posted before moderation review.');
    }
}
