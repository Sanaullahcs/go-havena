<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminDashboardStatsTest extends TestCase
{
    use RefreshDatabase;

    public function test_dashboard_resident_counts_exclude_community_admin_memberships(): void
    {
        $this->seed(SystemAdminSeeder::class);
        Sanctum::actingAs(User::query()->where('email', 'admin@havena.app')->firstOrFail());

        $region = Region::query()->create([
            'title'       => 'Cairo Metro',
            'area'        => 'Cairo',
            'state'       => 'EG',
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

        $communityAdmin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
        ]);

        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $communityAdmin->id,
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

        $response = $this->getJson('/api/v1/admin/dashboard/stats');

        $response->assertOk();
        $stats = $response->json('data.stats');

        $this->assertSame(1, $stats['total_members']);
        $this->assertSame(1, $stats['approved_community_admins']);
        $this->assertIsArray($response->json('data.top_communities_by_members'));
    }

    public function test_dashboard_shows_zero_residents_when_only_community_admins_exist(): void
    {
        $this->seed(SystemAdminSeeder::class);
        Sanctum::actingAs(User::query()->where('email', 'admin@havena.app')->firstOrFail());

        $region = Region::query()->create([
            'title'       => 'Cairo Metro',
            'area'        => 'Cairo',
            'state'       => 'EG',
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

        $communityAdmin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $communityAdmin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        $response = $this->getJson('/api/v1/admin/dashboard/stats');

        $response->assertOk();
        $stats = $response->json('data.stats');

        $this->assertSame(0, $stats['total_members']);
        $this->assertSame(0, $stats['pending_members']);
        $this->assertSame(1, $stats['approved_community_admins']);
    }

    public function test_dashboard_published_notices_excludes_events_and_alerts(): void
    {
        $this->seed(SystemAdminSeeder::class);
        Sanctum::actingAs(User::query()->where('email', 'admin@havena.app')->firstOrFail());

        $region = Region::query()->create([
            'title'       => 'Cairo Metro',
            'area'        => 'Cairo',
            'state'       => 'EG',
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
            'role'   => 'community_admin',
            'status' => 'active',
        ]);

        $now = now();

        \Illuminate\Support\Facades\DB::table('notices')->insert([
            [
                'community_id'  => $community->id,
                'author_id'     => $admin->id,
                'title'         => 'Pool hours',
                'body'          => 'Opens at 8 AM',
                'category'      => 'general',
                'status'        => 'published',
                'review_status' => 'approved',
                'published_at'  => $now,
                'created_at'    => $now,
                'updated_at'    => $now,
            ],
            [
                'community_id'  => $community->id,
                'author_id'     => $admin->id,
                'title'         => 'Finance reminder',
                'body'          => 'Pay dues',
                'category'      => 'finance',
                'status'        => 'published',
                'review_status' => 'approved',
                'published_at'  => $now,
                'created_at'    => $now,
                'updated_at'    => $now,
            ],
            [
                'community_id'  => $community->id,
                'author_id'     => $admin->id,
                'title'         => 'Block party',
                'body'          => 'Bring snacks',
                'category'      => 'event',
                'status'        => 'published',
                'review_status' => 'approved',
                'published_at'  => $now,
                'created_at'    => $now,
                'updated_at'    => $now,
            ],
            [
                'community_id'  => $community->id,
                'author_id'     => $admin->id,
                'title'         => 'Power outage',
                'body'          => 'Stay indoors',
                'category'      => 'emergency',
                'status'        => 'published',
                'review_status' => 'approved',
                'published_at'  => $now,
                'created_at'    => $now,
                'updated_at'    => $now,
            ],
        ]);

        $response = $this->getJson('/api/v1/admin/dashboard/stats');

        $response->assertOk();
        $this->assertSame(2, $response->json('data.stats.published_notices'));
    }

    public function test_mobile_dashboard_returns_lightweight_payload(): void
    {
        $this->seed(SystemAdminSeeder::class);
        Sanctum::actingAs(User::query()->where('email', 'admin@havena.app')->firstOrFail());

        $response = $this->getJson('/api/v1/admin/dashboard/stats?mobile=1');

        $response->assertOk();
        $response->assertJsonStructure([
            'data' => [
                'scope' => ['community_id', 'label'],
                'stats' => [
                    'total_members',
                    'pending_members',
                    'active_listings',
                    'pending_listings',
                    'pending_bookings',
                    'pending_businesses',
                    'pending_approval_total',
                ],
                'pending_actions',
                'generated_at',
            ],
        ]);

        $this->assertArrayNotHasKey('activity_chart', $response->json('data'));
        $this->assertArrayNotHasKey('top_communities_by_members', $response->json('data'));
    }
}
