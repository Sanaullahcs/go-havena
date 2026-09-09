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

class UserBlockTest extends TestCase
{
    use RefreshDatabase;

    private function seedCommunityWithTwoResidents(): array
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
            'phone'                  => '+201700000040',
        ]);

        $blocker = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000041',
        ]);

        $blocked = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000042',
        ]);

        foreach ([$admin, $blocker, $blocked] as $user) {
            CommunityMembership::query()->create([
                'user_id'      => $user->id,
                'community_id' => $community->id,
                'role'         => $user->id === $admin->id ? 'admin' : 'member',
                'status'       => 'approved',
            ]);
        }

        return compact('community', 'admin', 'blocker', 'blocked');
    }

    public function test_user_cannot_block_themselves(): void
    {
        ['community' => $community, 'blocker' => $blocker] = $this->seedCommunityWithTwoResidents();

        Sanctum::actingAs($blocker);

        $this->postJson("/api/v1/users/{$blocker->id}/block", [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertStatus(422);
    }

    public function test_block_hides_posts_creates_moderation_record_and_blocks_messages(): void
    {
        ['community' => $community, 'admin' => $admin, 'blocker' => $blocker, 'blocked' => $blocked] = $this->seedCommunityWithTwoResidents();

        Sanctum::actingAs($blocked);
        $this->postJson('/api/v1/feed', [
            'body' => 'Please hide this after block.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        Sanctum::actingAs($blocker);
        $this->getJson('/api/v1/feed?community_id='.$community->id)
            ->assertOk()
            ->assertJsonPath('data.0.body', 'Please hide this after block.');

        $this->postJson("/api/v1/users/{$blocked->id}/block", [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk()
            ->assertJsonPath('message', 'User blocked successfully.');

        $this->assertDatabaseHas('user_blocks', [
            'blocker_id'      => $blocker->id,
            'blocked_user_id' => $blocked->id,
        ]);

        $this->assertDatabaseHas('reports', [
            'reporter_id'      => $blocker->id,
            'reported_user_id' => $blocked->id,
            'title'            => 'User blocked',
            'status'           => 'open',
        ]);

        $this->getJson('/api/v1/feed?community_id='.$community->id)
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->postJson('/api/v1/conversations', [
            'recipient_id' => $blocked->id,
            'message'      => 'Should not send',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertStatus(422);

        $this->getJson('/api/v1/users/blocked')
            ->assertOk()
            ->assertJsonPath('data.0.id', $blocked->id);

        $this->deleteJson("/api/v1/users/{$blocked->id}/block")
            ->assertOk();

        $this->assertDatabaseMissing('user_blocks', [
            'blocker_id'      => $blocker->id,
            'blocked_user_id' => $blocked->id,
        ]);

        $this->getJson('/api/v1/feed?community_id='.$community->id)
            ->assertOk()
            ->assertJsonPath('data.0.body', 'Please hide this after block.');
    }

    public function test_resident_cannot_block_a_community(): void
    {
        ['community' => $community, 'blocker' => $blocker] = $this->seedCommunityWithTwoResidents();

        do {
            $communityOnly = Community::query()->create([
                'name'          => 'Not A User '.$community->id.uniqid(),
                'region_id'     => $community->region_id,
                'region'        => $community->region,
                'status'        => 'active',
                'review_status' => 'approved',
            ]);
        } while (User::query()->whereKey($communityOnly->id)->exists());

        Sanctum::actingAs($blocker);

        $this->postJson("/api/v1/users/{$communityOnly->id}/block", [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertStatus(422)
            ->assertJsonPath('message', 'You can only block another user.');
    }

    public function test_resident_cannot_block_a_system_admin(): void
    {
        ['community' => $community, 'blocker' => $blocker] = $this->seedCommunityWithTwoResidents();

        $systemAdmin = User::factory()->create([
            'role'   => 'system_admin',
            'status' => 'active',
            'phone'  => '+201700000099',
        ]);

        Sanctum::actingAs($blocker);

        $this->postJson("/api/v1/users/{$systemAdmin->id}/block", [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertStatus(422)
            ->assertJsonPath('message', 'You can only block another resident.');
    }

    public function test_resident_cannot_block_community_admin(): void
    {
        ['community' => $community, 'admin' => $admin, 'blocker' => $blocker] = $this->seedCommunityWithTwoResidents();

        Sanctum::actingAs($blocker);

        $this->postJson("/api/v1/users/{$admin->id}/block", [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertStatus(422)
            ->assertJsonPath('message', 'You can only block another resident.');

        $this->getJson("/api/v1/neighbors/{$admin->id}", [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk()
            ->assertJsonPath('data.can_block', false)
            ->assertJsonPath('data.account_role', 'community_admin');
    }

    public function test_feed_can_block_only_other_residents(): void
    {
        ['community' => $community, 'admin' => $admin, 'blocker' => $blocker, 'blocked' => $blocked] = $this->seedCommunityWithTwoResidents();

        Sanctum::actingAs($admin);
        $adminPost = $this->postJson('/api/v1/feed', [
            'body' => 'Official community update.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated()->json('data');

        Sanctum::actingAs($blocked);
        $residentPost = $this->postJson('/api/v1/feed', [
            'body' => 'Hello neighbors.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated()->json('data');

        Sanctum::actingAs($blocker);
        $ownPost = $this->postJson('/api/v1/feed', [
            'body' => 'My own post.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated()->json('data');

        $this->getJson('/api/v1/feed/'.$adminPost['id'], [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk()
            ->assertJsonPath('data.author_role', 'community_admin')
            ->assertJsonPath('data.can_block', false);

        $this->getJson('/api/v1/feed/'.$residentPost['id'], [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk()
            ->assertJsonPath('data.author_role', 'resident')
            ->assertJsonPath('data.can_block', true);

        $this->getJson('/api/v1/feed/'.$ownPost['id'], [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk()
            ->assertJsonPath('data.is_mine', true)
            ->assertJsonPath('data.can_block', false);

        $this->getJson("/api/v1/neighbors/{$blocked->id}", [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk()
            ->assertJsonPath('data.can_block', true)
            ->assertJsonPath('data.account_role', 'resident');
    }
}
