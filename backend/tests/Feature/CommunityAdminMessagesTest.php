<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
