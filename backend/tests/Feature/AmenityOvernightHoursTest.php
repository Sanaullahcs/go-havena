<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\Region;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AmenityOvernightHoursTest extends TestCase
{
    use RefreshDatabase;

    private function seedCommunity(): array
    {
        $region = Region::query()->create([
            'title' => 'Test Region',
            'area' => 'Test Area',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $community = Community::query()->create([
            'name' => 'Oak Valley',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'phone' => '+201700000260',
        ]);

        $resident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'phone' => '+201700000261',
        ]);

        CommunityMembership::query()->create([
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);

        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'starter',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_ACTIVE,
            'seat_limit' => 100,
            'meta' => ['card_on_file' => true, 'activated_via' => 'manual'],
        ]);

        return compact('community', 'admin', 'resident');
    }

    public function test_admin_can_create_same_day_and_overnight_hours(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();
        Sanctum::actingAs($admin);

        $sameDay = $this->postJson('/api/v1/admin/amenities', [
            'name' => 'Day Lounge',
            'status' => 'bookable',
            'capacity' => 10,
            'icon_key' => 'hall',
            'start_time' => '08:00',
            'end_time' => '18:00',
            'slot_duration_minutes' => 60,
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated()->json('data');

        $this->assertFalse($sameDay['hours_overnight']);
        $this->assertSame('8:00 AM - 6:00 PM', $sameDay['hours']);

        $noonToMidnight = $this->postJson('/api/v1/admin/amenities', [
            'name' => 'Noon Hall',
            'status' => 'bookable',
            'capacity' => 10,
            'icon_key' => 'hall',
            'start_time' => '12:00',
            'end_time' => '00:00',
            'slot_duration_minutes' => 60,
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated()->json('data');

        $this->assertTrue($noonToMidnight['hours_overnight']);
        $this->assertSame('12:00', $noonToMidnight['start_time']);
        $this->assertSame('00:00', $noonToMidnight['end_time']);
        $this->assertSame('12:00 PM - 12:00 AM', $noonToMidnight['hours']);

        $this->postJson('/api/v1/admin/amenities', [
            'name' => 'Evening Lounge',
            'status' => 'bookable',
            'capacity' => 10,
            'icon_key' => 'hall',
            'start_time' => '20:00',
            'end_time' => '00:00',
            'slot_duration_minutes' => 60,
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated()
            ->assertJsonPath('data.hours', '8:00 PM - 12:00 AM')
            ->assertJsonPath('data.hours_overnight', true);

        $overnight = $this->postJson('/api/v1/admin/amenities', [
            'name' => 'Night Clubhouse',
            'status' => 'bookable',
            'capacity' => 10,
            'icon_key' => 'hall',
            'start_time' => '22:00',
            'end_time' => '02:00',
            'slot_duration_minutes' => 60,
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated()->json('data');

        $this->assertTrue($overnight['hours_overnight']);
        $this->assertSame('10:00 PM - 2:00 AM', $overnight['hours']);
        $this->assertSame([
            '10:00 PM - 11:00 PM',
            '11:00 PM - 12:00 AM',
            '12:00 AM - 1:00 AM',
            '1:00 AM - 2:00 AM',
        ], array_column($overnight['slots'], 'value'));
    }

    public function test_slots_and_bookings_use_session_date_with_next_day_datetimes(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        Sanctum::actingAs($admin);

        $amenityId = $this->postJson('/api/v1/admin/amenities', [
            'name' => 'Night Clubhouse',
            'status' => 'bookable',
            'capacity' => 10,
            'icon_key' => 'hall',
            'start_time' => '22:00',
            'end_time' => '02:00',
            'slot_duration_minutes' => 60,
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated()->json('data.id');

        $sessionDate = now()->addDay()->toDateString();
        $nextDate = \Carbon\Carbon::parse($sessionDate)->addDay()->toDateString();

        Sanctum::actingAs($resident);

        $slots = $this->getJson("/api/v1/amenities/{$amenityId}/slots?date={$sessionDate}")
            ->assertOk()
            ->json('data');

        $this->assertSame([
            '10:00 PM - 11:00 PM',
            '11:00 PM - 12:00 AM',
            '12:00 AM - 1:00 AM',
            '1:00 AM - 2:00 AM',
        ], array_column($slots, 'value'));

        $midnightSlot = collect($slots)->firstWhere('value', '12:00 AM - 1:00 AM');
        $this->assertSame(1, $midnightSlot['start_day_offset']);
        $this->assertSame($nextDate.' 00:00:00', $midnightSlot['starts_at']);
        $this->assertSame($nextDate.' 01:00:00', $midnightSlot['ends_at']);
        $this->assertTrue($midnightSlot['available']);

        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => $sessionDate,
            'time_slot' => '12:00 AM – 1:00 AM',
        ])->assertCreated()
            ->assertJsonPath('data.date', $sessionDate)
            ->assertJsonPath('data.time_slot', '12:00 AM - 1:00 AM');

        $this->assertDatabaseHas('bookings', [
            'amenity_id' => $amenityId,
            'date' => $sessionDate,
            'time_slot' => '12:00 AM - 1:00 AM',
        ]);

        $otherResident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'phone' => '+201700000262',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $otherResident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        Sanctum::actingAs($otherResident);

        $this->getJson("/api/v1/amenities/{$amenityId}/slots?date={$sessionDate}")
            ->assertOk()
            ->assertJsonPath('data.2.available', false);

        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => $sessionDate,
            'time_slot' => '12:00 AM - 1:00 AM',
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'This time slot is already requested or booked.');
    }

    public function test_same_day_morning_hours_still_book_on_the_selected_date(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        Sanctum::actingAs($admin);

        $amenityId = $this->postJson('/api/v1/admin/amenities', [
            'name' => 'Early Gym',
            'status' => 'bookable',
            'capacity' => 8,
            'icon_key' => 'gym',
            'start_time' => '00:00',
            'end_time' => '04:00',
            'slot_duration_minutes' => 60,
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated()
            ->assertJsonPath('data.hours_overnight', false)
            ->json('data.id');

        $sessionDate = now()->addDay()->toDateString();
        Sanctum::actingAs($resident);

        $slots = $this->getJson("/api/v1/amenities/{$amenityId}/slots?date={$sessionDate}")
            ->assertOk()
            ->json('data');

        $this->assertSame('12:00 AM - 1:00 AM', $slots[0]['value']);
        $this->assertSame(0, $slots[0]['start_day_offset']);
        $this->assertSame($sessionDate.' 00:00:00', $slots[0]['starts_at']);
        $this->assertSame($sessionDate.' 01:00:00', $slots[0]['ends_at']);

        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => $sessionDate,
            'time_slot' => '12:00 AM - 1:00 AM',
        ])->assertCreated()
            ->assertJsonPath('data.date', $sessionDate);
    }
}
