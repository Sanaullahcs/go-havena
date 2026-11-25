<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use App\Services\CommunityBillingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ResidentInviteLookupTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array{region: Region, communityA: Community, communityB: Community, adminB: User, resident: User}
     */
    private function seedWorld(): array
    {
        $region = Region::query()->create([
            'title' => 'Test Region',
            'area' => 'Area',
            'users_label' => '0',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $communityA = Community::query()->create([
            'name' => 'Community A',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $communityB = Community::query()->create([
            'name' => 'Community B',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $adminB = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'phone' => '+14155552601',
        ]);

        CommunityMembership::query()->create([
            'user_id' => $adminB->id,
            'community_id' => $communityB->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);

        app(CommunityBillingService::class)->activateManualSubscription($communityB, 'growth');

        $resident = User::factory()->create([
            'role' => 'resident',
            'name' => 'Jordan Resident',
            'email' => 'jordan@example.com',
            'phone' => '+14155552602',
        ]);

        \Illuminate\Support\Facades\DB::table('profiles')->insert([
            'user_id' => $resident->id,
            'display_name' => 'Jordan Resident',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $communityA->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        return compact('region', 'communityA', 'communityB', 'adminB', 'resident');
    }

    public function test_lookup_returns_auto_fill_for_resident_in_another_community(): void
    {
        $world = $this->seedWorld();
        Sanctum::actingAs($world['adminB']);

        $this->getJson('/api/v1/admin/members/invite-lookup?'.http_build_query([
            'email' => 'jordan@example.com',
            'community_id' => $world['communityB']->id,
        ]))
            ->assertOk()
            ->assertJsonPath('data.found', true)
            ->assertJsonPath('data.enrolled', true)
            ->assertJsonPath('data.auto_fill', true)
            ->assertJsonPath('data.invitable', true)
            ->assertJsonPath('data.name', 'Jordan Resident')
            ->assertJsonPath('data.phone', '+14155552602')
            ->assertJsonPath('data.user_id', $world['resident']->id);
    }

    public function test_lookup_blocks_when_already_in_target_community(): void
    {
        $world = $this->seedWorld();
        $world['resident']->refresh();

        CommunityMembership::query()->create([
            'user_id' => $world['resident']->id,
            'community_id' => $world['communityB']->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        Sanctum::actingAs($world['adminB']);

        $this->getJson('/api/v1/admin/members/invite-lookup?'.http_build_query([
            'email' => 'jordan@example.com',
            'community_id' => $world['communityB']->id,
        ]))
            ->assertOk()
            ->assertJsonPath('data.invitable', false)
            ->assertJsonPath('data.message', 'This resident already belongs to this community.');
    }

    public function test_lookup_unknown_email_returns_not_found(): void
    {
        $world = $this->seedWorld();
        Sanctum::actingAs($world['adminB']);

        $this->getJson('/api/v1/admin/members/invite-lookup?'.http_build_query([
            'email' => 'new-person@example.com',
            'community_id' => $world['communityB']->id,
        ]))
            ->assertOk()
            ->assertJsonPath('data.found', false)
            ->assertJsonPath('data.auto_fill', false);
    }
}
