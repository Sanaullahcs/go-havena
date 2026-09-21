<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use App\Services\ActivityLogService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MemberActivityLogTest extends TestCase
{
    use RefreshDatabase;

    private function seedCommunityWithAdminAndResident(): array
    {
        $region = Region::query()->create([
            'title'       => 'Test Region',
            'area'        => 'Test',
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

        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
        ]);

        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
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

    public function test_community_admin_can_view_resident_activity_logs(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdminAndResident();

        Sanctum::actingAs($resident);
        ActivityLogService::user('post_created', 'Published a community post', 'Post', 12, 'info', (int) $resident->id, [
            'related_item' => 'Hello neighbors',
        ]);
        ActivityLogService::user('login', 'Signed in to Havena', null, null, 'info', (int) $resident->id);

        Sanctum::actingAs($admin);

        $response = $this->getJson("/api/v1/admin/members/{$resident->id}/activity-logs")
            ->assertOk()
            ->assertJsonPath('meta.member.id', $resident->id);

        $actions = collect($response->json('data'))->pluck('action')->all();
        $this->assertContains('login', $actions);
        $this->assertContains('post_created', $actions);

        $postLog = collect($response->json('data'))->firstWhere('action', 'post_created');
        $this->assertSame('Created a post', $postLog['activity_name']);
        $this->assertSame('Hello neighbors', $postLog['related_item']);
    }

    public function test_resident_cannot_view_other_member_activity_logs(): void
    {
        ['resident' => $resident] = $this->seedCommunityWithAdminAndResident();

        $other = User::factory()->create(['role' => 'resident', 'status' => 'active']);

        Sanctum::actingAs($resident);

        $this->getJson("/api/v1/admin/members/{$other->id}/activity-logs")
            ->assertForbidden();
    }

    public function test_activity_logs_support_search_and_date_filters(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdminAndResident();

        Sanctum::actingAs($resident);
        ActivityLogService::user('deal_created', 'Created deal: "Pizza Night"', 'Deal', 3, 'info', (int) $resident->id, [
            'status' => 'active',
            'related_item' => 'Pizza Night',
        ]);

        Sanctum::actingAs($admin);

        $this->getJson("/api/v1/admin/members/{$resident->id}/activity-logs?search=pizza")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.action', 'deal_created')
            ->assertJsonPath('data.0.status', 'active');

        $today = now()->toDateString();

        $this->getJson("/api/v1/admin/members/{$resident->id}/activity-logs?date={$today}")
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_activity_logs_show_live_listing_status_after_approval(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdminAndResident();

        $listingId = \Illuminate\Support\Facades\DB::table('listings')->insertGetId([
            'community_id' => \App\Models\CommunityMembership::query()->where('user_id', $resident->id)->value('community_id'),
            'user_id'      => $resident->id,
            'type'         => 'for_sale',
            'category'     => 'general',
            'title'        => 'Spaceship',
            'price'        => 100,
            'description'  => 'Test item',
            'images'       => '[]',
            'status'       => 'approved',
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);

        Sanctum::actingAs($resident);
        ActivityLogService::user(
            'listing_created',
            'Created marketplace listing: "Spaceship"',
            'Listing',
            $listingId,
            'info',
            (int) $resident->id,
            ['status' => 'pending', 'related_item' => 'Spaceship'],
        );

        Sanctum::actingAs($admin);

        $this->getJson("/api/v1/admin/members/{$resident->id}/activity-logs?search=Spaceship")
            ->assertOk()
            ->assertJsonPath('data.0.status', 'approved');
    }
}
