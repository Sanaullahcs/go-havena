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

class UserReportTest extends TestCase
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
            'phone'                  => '+201700000060',
        ]);

        $reporter = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000061',
        ]);

        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000062',
        ]);

        foreach ([$admin, $reporter, $resident] as $user) {
            CommunityMembership::query()->create([
                'user_id'      => $user->id,
                'community_id' => $community->id,
                'role'         => $user->id === $admin->id ? 'admin' : 'member',
                'status'       => 'approved',
            ]);
        }

        return compact('community', 'admin', 'reporter', 'resident');
    }

    private function createApprovedListing(int $communityId, int $userId, string $title = 'Yoga mat'): int
    {
        return DB::table('listings')->insertGetId([
            'community_id' => $communityId,
            'user_id'      => $userId,
            'type'         => 'for_sale',
            'category'     => 'Sports',
            'condition'    => 'Good',
            'title'        => $title,
            'price'        => 25,
            'description'  => 'Lightly used.',
            'images'       => json_encode([]),
            'status'       => 'approved',
            'approved_by'  => $userId,
            'approved_at'  => now(),
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);
    }

    public function test_resident_can_report_another_resident_and_admin_can_review(): void
    {
        ['community' => $community, 'reporter' => $reporter, 'resident' => $resident] = $this->seedCommunityWithTwoResidents();

        Sanctum::actingAs($reporter);

        $this->getJson('/api/v1/neighbors/'.$resident->id, [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.can_report', true)
            ->assertJsonPath('data.is_mine', false);

        $this->getJson('/api/v1/neighbors/'.$reporter->id, [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.can_report', false)
            ->assertJsonPath('data.is_mine', true);

        $this->postJson('/api/v1/reports', [
            'type'             => 'harassment',
            'reported_user_id' => $resident->id,
            'description'      => 'This profile is abusive toward neighbors.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.reported_user_id', $resident->id);

        $this->assertDatabaseHas('reports', [
            'reporter_id'      => $reporter->id,
            'reported_user_id' => $resident->id,
            'type'             => 'harassment',
            'status'           => 'open',
        ]);

        $systemAdmin = User::factory()->create([
            'role'   => 'system_admin',
            'status' => 'active',
            'phone'  => '+201700000063',
        ]);

        Sanctum::actingAs($systemAdmin);
        $this->getJson('/api/v1/admin/reports?community_id='.$community->id)
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.reported_user_id', $resident->id)
            ->assertJsonPath('data.0.reporter_id', $reporter->id);
    }

    public function test_resident_cannot_report_themselves_or_a_community_admin(): void
    {
        ['community' => $community, 'admin' => $admin, 'reporter' => $reporter] = $this->seedCommunityWithTwoResidents();

        Sanctum::actingAs($reporter);

        $this->postJson('/api/v1/reports', [
            'type'             => 'spam',
            'reported_user_id' => $reporter->id,
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertStatus(422);

        $this->getJson('/api/v1/neighbors/'.$admin->id, [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.can_report', false);

        $this->postJson('/api/v1/reports', [
            'type'             => 'spam',
            'reported_user_id' => $admin->id,
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertStatus(422);
    }

    public function test_resident_can_report_another_residents_listing_but_not_their_own(): void
    {
        ['community' => $community, 'admin' => $admin, 'reporter' => $reporter, 'resident' => $resident] = $this->seedCommunityWithTwoResidents();

        $listingId = $this->createApprovedListing($community->id, $resident->id, 'Used bike');
        $ownListingId = $this->createApprovedListing($community->id, $reporter->id, 'My chair');
        $adminListingId = $this->createApprovedListing($community->id, $admin->id, 'Office notice');

        Sanctum::actingAs($reporter);

        $this->getJson('/api/v1/listings/'.$listingId, [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.can_report', true);

        $this->getJson('/api/v1/listings/'.$ownListingId, [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.can_report', false);

        $this->getJson('/api/v1/listings/'.$adminListingId, [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.can_report', false);

        $this->postJson('/api/v1/reports', [
            'type'       => 'spam',
            'listing_id' => $ownListingId,
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertStatus(422);

        $this->postJson('/api/v1/reports', [
            'type'       => 'spam',
            'listing_id' => $adminListingId,
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertStatus(422);

        $this->postJson('/api/v1/reports', [
            'type'        => 'spam',
            'listing_id'  => $listingId,
            'description' => 'Looks like a scam listing.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.listing_id', $listingId)
            ->assertJsonPath('data.reported_user_id', $resident->id);

        $this->assertDatabaseHas('reports', [
            'reporter_id'      => $reporter->id,
            'reported_user_id' => $resident->id,
            'listing_id'       => $listingId,
            'type'             => 'spam',
            'status'           => 'open',
        ]);

        $systemAdmin = User::factory()->create([
            'role'   => 'system_admin',
            'status' => 'active',
            'phone'  => '+201700000064',
        ]);

        Sanctum::actingAs($systemAdmin);
        $this->getJson('/api/v1/admin/reports?community_id='.$community->id)
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.listing_id', $listingId)
            ->assertJsonPath('data.0.listing_title', 'Used bike');
    }

    public function test_resident_can_report_another_residents_event_but_not_their_own(): void
    {
        ['community' => $community, 'admin' => $admin, 'reporter' => $reporter, 'resident' => $resident] = $this->seedCommunityWithTwoResidents();

        $eventId = $this->createPublishedEvent($community->id, $resident->id, 'Yard sale');
        $ownEventId = $this->createPublishedEvent($community->id, $reporter->id, 'My picnic');
        $adminEventId = $this->createPublishedEvent($community->id, $admin->id, 'HOA meeting');

        Sanctum::actingAs($reporter);

        $this->getJson('/api/v1/notices/'.$eventId, [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.can_report', true);

        $this->getJson('/api/v1/notices/'.$ownEventId, [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.can_report', false);

        $this->getJson('/api/v1/notices/'.$adminEventId, [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.can_report', false);

        $this->postJson('/api/v1/reports', [
            'type'      => 'spam',
            'notice_id' => $ownEventId,
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertStatus(422);

        $this->postJson('/api/v1/reports', [
            'type'      => 'spam',
            'notice_id' => $adminEventId,
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertStatus(422);

        $this->postJson('/api/v1/reports', [
            'type'        => 'spam',
            'notice_id'   => $eventId,
            'description' => 'This event looks fake.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.notice_id', $eventId)
            ->assertJsonPath('data.reported_user_id', $resident->id);

        $this->assertDatabaseHas('reports', [
            'reporter_id'      => $reporter->id,
            'reported_user_id' => $resident->id,
            'notice_id'        => $eventId,
            'type'             => 'spam',
            'status'           => 'open',
        ]);

        $systemAdmin = User::factory()->create([
            'role'   => 'system_admin',
            'status' => 'active',
            'phone'  => '+201700000065',
        ]);

        Sanctum::actingAs($systemAdmin);
        $this->getJson('/api/v1/admin/reports?community_id='.$community->id)
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.notice_id', $eventId)
            ->assertJsonPath('data.0.event_title', 'Yard sale');
    }

    private function createPublishedEvent(int $communityId, int $authorId, string $title): int
    {
        return DB::table('notices')->insertGetId([
            'community_id'   => $communityId,
            'author_id'      => $authorId,
            'title'          => $title,
            'body'           => 'Neighborhood event details.',
            'category'       => 'event',
            'status'         => 'published',
            'review_status'  => 'approved',
            'audience_type'  => 'all',
            'event_date'     => now()->addDays(3)->toDateString(),
            'event_time'     => '10:00:00',
            'event_time_end' => '12:00:00',
            'published_at'   => now(),
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);
    }
}
