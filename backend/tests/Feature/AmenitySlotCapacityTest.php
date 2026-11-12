<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\Region;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AmenitySlotCapacityTest extends TestCase
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
            'phone' => '+201700000360',
        ]);

        $resident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'phone' => '+201700000361',
            'name' => 'Resident One',
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

    private function createAmenity(int $communityId, int $creatorId, array $overrides = []): int
    {
        return DB::table('amenities')->insertGetId(array_merge([
            'community_id' => $communityId,
            'created_by' => $creatorId,
            'name' => 'Swimming Pool',
            'description' => 'Shared pool',
            'status' => 'bookable',
            'review_status' => 'approved',
            'capacity' => 50,
            'floor' => 'Ground',
            'hours' => '9:00 AM - 6:00 PM',
            'start_time' => '09:00:00',
            'end_time' => '18:00:00',
            'slot_duration_minutes' => 60,
            'weekends_available' => true,
            'booking_fee' => 10,
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));
    }

    private function addResident(Community $community, string $phone): User
    {
        $resident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'phone' => $phone,
        ]);
        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        return $resident;
    }

    public function test_slot_stays_available_until_capacity_is_filled(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id, ['capacity' => 5, 'booking_fee' => 10]);
        $date = now()->addDay()->toDateString();
        $slot = '4:00 PM - 5:00 PM';

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => $date,
            'time_slot' => $slot,
            'guests' => 2,
        ])->assertCreated()
            ->assertJsonPath('data.guests', 2)
            ->assertJsonPath('data.booking_fee', 20);

        $other = $this->addResident($community, '+201700000362');
        Sanctum::actingAs($other);

        $slotRow = collect($this->getJson("/api/v1/amenities/{$amenityId}/slots?date={$date}")
            ->assertOk()
            ->json('data'))
            ->firstWhere('value', $slot);

        $this->assertTrue($slotRow['available']);
        $this->assertSame(2, $slotRow['booked']);
        $this->assertSame(3, $slotRow['remaining']);
        $this->assertSame(5, $slotRow['capacity']);

        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => $date,
            'time_slot' => $slot,
            'guests' => 3,
        ])->assertCreated()
            ->assertJsonPath('data.booking_fee', 30);

        $third = $this->addResident($community, '+201700000363');
        Sanctum::actingAs($third);

        $full = collect($this->getJson("/api/v1/amenities/{$amenityId}/slots?date={$date}")
            ->json('data'))
            ->firstWhere('value', $slot);

        $this->assertNotNull($full);
        $this->assertFalse($full['available']);
        $this->assertSame(0, $full['remaining']);
        $this->assertSame(5, $full['booked']);

        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => $date,
            'time_slot' => $slot,
            'guests' => 1,
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'This time slot is fully booked.');
    }

    public function test_booking_cannot_overflow_past_the_last_slot(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id, ['capacity' => 4]);
        $date = now()->addDay()->toDateString();
        $slot = '5:00 PM - 6:00 PM';

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => $date,
            'time_slot' => $slot,
            'guests' => 3,
        ])->assertCreated();

        $other = $this->addResident($community, '+201700000364');
        Sanctum::actingAs($other);
        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => $date,
            'time_slot' => $slot,
            'guests' => 2,
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'Only 1 spot left from this time slot onward.');
    }

    public function test_per_seat_booking_overflows_into_the_next_slot(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id, [
            'capacity' => 2,
            'capacity_booking_type' => 'per_seat',
        ]);
        $date = now()->addDay()->toDateString();
        $slot = '4:00 PM - 5:00 PM';
        $nextSlot = '5:00 PM - 6:00 PM';

        Sanctum::actingAs($resident);
        $bookingId = $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => $date,
            'time_slot' => $slot,
            'guests' => 3,
        ])->assertCreated()
            ->assertJsonPath('data.guests', 3)
            ->json('data.id');

        $this->assertEqualsCanonicalizing(
            [
                ['time_slot' => $slot, 'seats' => 2],
                ['time_slot' => $nextSlot, 'seats' => 1],
            ],
            DB::table('booking_slot_allocations')
                ->where('booking_id', $bookingId)
                ->orderBy('id')
                ->get(['time_slot', 'seats'])
                ->map(fn ($row) => ['time_slot' => $row->time_slot, 'seats' => (int) $row->seats])
                ->all()
        );

        $other = $this->addResident($community, '+201700000366');
        Sanctum::actingAs($other);
        $slots = collect($this->getJson("/api/v1/amenities/{$amenityId}/slots?date={$date}")
            ->assertOk()
            ->json('data'));

        $current = $slots->firstWhere('value', $slot);
        $next = $slots->firstWhere('value', $nextSlot);
        $this->assertFalse($current['available']);
        $this->assertSame(0, $current['remaining']);
        $this->assertTrue($next['available']);
        $this->assertSame(1, $next['remaining']);
    }

    public function test_full_slot_booking_occupies_the_entire_slot(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id, [
            'capacity' => 12,
            'capacity_booking_type' => 'full_slot',
            'booking_fee' => 25,
        ]);
        $date = now()->addDay()->toDateString();
        $slot = '2:00 PM - 3:00 PM';

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => $date,
            'time_slot' => $slot,
            'guests' => 1,
        ])->assertCreated()
            ->assertJsonPath('data.guests', 1)
            ->assertJsonPath('data.booking_fee', 25);

        $other = $this->addResident($community, '+201700000367');
        Sanctum::actingAs($other);
        $slotRow = collect($this->getJson("/api/v1/amenities/{$amenityId}/slots?date={$date}")
            ->assertOk()
            ->json('data'))
            ->firstWhere('value', $slot);

        $this->assertFalse($slotRow['available']);
        $this->assertSame(0, $slotRow['remaining']);
        $this->assertSame(12, $slotRow['booked']);

        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => $date,
            'time_slot' => $slot,
            'guests' => 1,
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'This time slot is fully booked.');
    }

    public function test_paid_booking_cannot_be_cancelled(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id, ['capacity' => 2]);
        $date = now()->addDay()->toDateString();
        $slot = '4:00 PM - 5:00 PM';

        Sanctum::actingAs($resident);
        $bookingId = $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => $date,
            'time_slot' => $slot,
            'guests' => 1,
        ])->assertCreated()
            ->assertJsonPath('data.can_cancel', true)
            ->json('data.id');

        DB::table('bookings')->where('id', $bookingId)->update([
            'status' => 'confirmed',
            'payment_verification_status' => 'accepted',
            'updated_at' => now(),
        ]);

        $this->deleteJson("/api/v1/bookings/{$bookingId}")
            ->assertUnprocessable()
            ->assertJsonPath('message', 'This reservation can no longer be cancelled after payment.');

        $other = $this->addResident($community, '+201700000369');
        Sanctum::actingAs($other);
        $slotRow = collect($this->getJson("/api/v1/amenities/{$amenityId}/slots?date={$date}")
            ->assertOk()
            ->json('data'))
            ->firstWhere('value', $slot);
        $this->assertNotNull($slotRow);
        $this->assertSame(1, $slotRow['remaining']);
        $this->assertTrue($slotRow['available']);
    }

    public function test_resident_cancel_releases_reserved_capacity(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id, ['capacity' => 2]);
        $date = now()->addDay()->toDateString();
        $slot = '4:00 PM - 5:00 PM';

        Sanctum::actingAs($resident);
        $bookingId = $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => $date,
            'time_slot' => $slot,
            'guests' => 2,
        ])->assertCreated()->json('data.id');

        $this->deleteJson("/api/v1/bookings/{$bookingId}")->assertOk();

        $other = $this->addResident($community, '+201700000368');
        Sanctum::actingAs($other);
        $slotRow = collect($this->getJson("/api/v1/amenities/{$amenityId}/slots?date={$date}")
            ->json('data'))
            ->firstWhere('value', $slot);

        $this->assertTrue($slotRow['available']);
        $this->assertSame(2, $slotRow['remaining']);
    }

    public function test_rejected_booking_releases_slot_capacity(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id, ['capacity' => 2]);
        $date = now()->addDay()->toDateString();
        $slot = '4:00 PM - 5:00 PM';

        Sanctum::actingAs($resident);
        $bookingId = $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => $date,
            'time_slot' => $slot,
            'guests' => 2,
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/bookings/{$bookingId}/reject", [
            'reason' => 'Party too large',
        ])->assertOk();

        $other = $this->addResident($community, '+201700000365');
        Sanctum::actingAs($other);
        $slotRow = collect($this->getJson("/api/v1/amenities/{$amenityId}/slots?date={$date}")
            ->json('data'))
            ->firstWhere('value', $slot);

        $this->assertTrue($slotRow['available']);
        $this->assertSame(2, $slotRow['remaining']);

        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => $date,
            'time_slot' => $slot,
            'guests' => 2,
        ])->assertCreated();
    }

    public function test_amenity_create_stores_capacity_booking_type(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();

        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/admin/amenities', [
            'name' => 'Meeting Room',
            'description' => 'Private room',
            'status' => 'bookable',
            'capacity' => 12,
            'capacity_booking_type' => 'full_slot',
            'icon_key' => 'meeting',
            'start_time' => '09:00',
            'end_time' => '18:00',
            'slot_duration_minutes' => 60,
            'floor' => 'Floor 2',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.capacity_booking_type', 'full_slot')
            ->assertJsonPath('data.capacity', 12);
    }
}
