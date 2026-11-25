<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class NotificationModuleFilterTest extends TestCase
{
    use RefreshDatabase;

    public function test_notifications_index_supports_module_filters_and_counts(): void
    {
        $user = User::factory()->create();

        DB::table('app_notifications')->insert([
            [
                'user_id' => $user->id,
                'type' => 'info',
                'title' => 'New Event',
                'body' => 'Pool party tonight',
                'action_url' => '/notices/1',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'user_id' => $user->id,
                'type' => 'info',
                'title' => 'New Notice',
                'body' => 'Elevator maintenance',
                'action_url' => '/notices/2',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'user_id' => $user->id,
                'type' => 'success',
                'title' => 'Reservation approved',
                'body' => 'Your booking for Gym on Monday is confirmed.',
                'action_url' => '/screens/admin-bookings',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'user_id' => $user->id,
                'type' => 'info',
                'title' => 'Community membership',
                'body' => 'You have been added to the community.',
                'action_url' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/notifications?module=events')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.title', 'New Event');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/notifications?module=amenities')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.title', 'Reservation approved');

        $all = $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/notifications')
            ->assertOk()
            ->json('meta');

        $this->assertSame(4, $all['total_all']);
        $this->assertSame(1, $all['events']);
        $this->assertSame(1, $all['notices']);
        $this->assertSame(1, $all['amenities']);
        $this->assertGreaterThanOrEqual(1, $all['others']);
    }
}
