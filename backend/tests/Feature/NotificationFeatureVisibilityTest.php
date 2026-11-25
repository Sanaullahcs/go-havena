<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityFeatureFlag;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class NotificationFeatureVisibilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_notifications_for_disabled_features_are_hidden_until_the_feature_is_on(): void
    {
        $community = $this->seedCommunity();
        $resident = $this->seedResident($community);

        $eventId = DB::table('notices')->insertGetId([
            'community_id' => $community->id,
            'author_id' => $resident->id,
            'title' => 'Pool party',
            'category' => 'event',
            'body' => 'Tonight',
            'status' => 'published',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $noticeId = DB::table('notices')->insertGetId([
            'community_id' => $community->id,
            'author_id' => $resident->id,
            'title' => 'Elevator',
            'category' => 'general',
            'body' => 'Out of service',
            'status' => 'published',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('app_notifications')->insert([
            [
                'user_id' => $resident->id,
                'type' => 'info',
                'title' => 'Update',
                'body' => 'A scheduled item changed.',
                'action_url' => "/notices/{$eventId}",
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'user_id' => $resident->id,
                'type' => 'info',
                'title' => 'Update',
                'body' => 'A scheduled item changed.',
                'action_url' => "/notices/{$noticeId}",
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'user_id' => $resident->id,
                'type' => 'success',
                'title' => 'Reservation approved',
                'body' => 'Your booking for Gym on Monday is confirmed.',
                'action_url' => '/screens/admin-bookings',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'user_id' => $resident->id,
                'type' => 'info',
                'title' => 'Service bill due',
                'body' => 'Water for unit 4 is due today.',
                'action_url' => '/screens/property-management/unit-bills',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'user_id' => $resident->id,
                'type' => 'info',
                'title' => 'Community membership',
                'body' => 'You have been added to the community.',
                'action_url' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $this->actingAs($resident, 'sanctum')
            ->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonPath('meta.total', 5)
            ->assertJsonPath('unread', 5);

        CommunityFeatureFlag::query()->create([
            'community_id' => $community->id,
            'feature_key' => 'events',
            'enabled' => false,
            'disabled_by' => 'community_admin',
        ]);
        CommunityFeatureFlag::query()->create([
            'community_id' => $community->id,
            'feature_key' => 'bookings',
            'enabled' => false,
            'disabled_by' => 'community_admin',
        ]);

        $hidden = $this->actingAs($resident, 'sanctum')
            ->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonPath('meta.total', 3)
            ->assertJsonPath('unread', 3)
            ->assertJsonPath('meta.events', 0);

        $titles = collect($hidden->json('data'))->pluck('action_url')->all();
        $this->assertNotContains("/notices/{$eventId}", $titles);
        $this->assertNotContains('/screens/admin-bookings', $titles);
        $this->assertContains("/notices/{$noticeId}", $titles);
        $this->assertContains('/screens/property-management/unit-bills', $titles);

        CommunityFeatureFlag::query()
            ->where('community_id', $community->id)
            ->where('feature_key', 'events')
            ->update(['enabled' => true, 'disabled_by' => null]);

        $restored = $this->actingAs($resident, 'sanctum')
            ->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonPath('meta.total', 4);

        $this->assertContains("/notices/{$eventId}", collect($restored->json('data'))->pluck('action_url')->all());
        $this->assertNotContains('/screens/admin-bookings', collect($restored->json('data'))->pluck('action_url')->all());
    }

    public function test_a_shared_notices_link_follows_the_event_copy_when_events_are_off(): void
    {
        $community = $this->seedCommunity();
        $resident = $this->seedResident($community);

        DB::table('app_notifications')->insert([
            'user_id' => $resident->id,
            'type' => 'warning',
            'title' => 'Event Cancelled',
            'body' => 'Pool party was cancelled.',
            'action_url' => '/screens/notices',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        CommunityFeatureFlag::query()->create([
            'community_id' => $community->id,
            'feature_key' => 'events',
            'enabled' => false,
            'disabled_by' => 'system_admin',
        ]);

        $this->actingAs($resident, 'sanctum')
            ->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonPath('meta.total', 0)
            ->assertJsonPath('unread', 0);
    }

    private function seedCommunity(): Community
    {
        $region = Region::query()->create([
            'title' => 'Visibility Region',
            'area' => 'Test Area',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        return Community::query()->create([
            'name' => 'Visibility Community',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '100 Test Lane',
            'status' => 'active',
            'review_status' => 'approved',
            'estimated_residents' => 40,
        ]);
    }

    private function seedResident(Community $community): User
    {
        $resident = User::factory()->create([
            'name' => 'Resident User',
            'role' => 'resident',
            'status' => 'active',
            'phone' => '+1'.fake()->unique()->numerify('##########'),
            'phone_verified_at' => now(),
        ]);

        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        return $resident;
    }
}
