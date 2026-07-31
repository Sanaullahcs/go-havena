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

class AmenityOwnershipTest extends TestCase
{
    use RefreshDatabase;

    private function seedCommunity(): array
    {
        $region = Region::query()->create([
            'title'       => 'Test Region',
            'area'        => 'Test Area',
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

        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000061',
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

    private function createAmenity(int $communityId, int $creatorId, array $overrides = []): int
    {
        return DB::table('amenities')->insertGetId(array_merge([
            'community_id'          => $communityId,
            'created_by'            => $creatorId,
            'name'                  => 'Community Pool',
            'description'           => 'Shared pool',
            'status'                => 'bookable',
            'review_status'         => 'approved',
            'capacity'              => 20,
            'floor'                 => 'Ground',
            'hours'                 => '9:00 AM - 6:00 PM',
            'start_time'            => '09:00:00',
            'end_time'              => '18:00:00',
            'slot_duration_minutes' => 60,
            'weekends_available'    => true,
            'created_at'            => now(),
            'updated_at'            => now(),
        ], $overrides));
    }

    public function test_admin_can_update_own_amenity(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id);

        Sanctum::actingAs($admin);

        $this->patchJson("/api/v1/admin/amenities/{$amenityId}", [
            'name' => 'Updated Pool',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Updated Pool');
    }

    public function test_admin_cannot_update_another_users_amenity(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $resident->id, [
            'review_status' => 'pending',
        ]);

        Sanctum::actingAs($admin);

        $this->patchJson("/api/v1/admin/amenities/{$amenityId}", [
            'name' => 'Admin Takeover',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertForbidden();
    }

    public function test_admin_cannot_delete_another_users_amenity(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $resident->id);

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/v1/admin/amenities/{$amenityId}", [], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertForbidden();
    }

    public function test_admin_can_approve_resident_amenity_without_editing_it(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $resident->id, [
            'review_status' => 'pending',
        ]);

        Sanctum::actingAs($admin);

        $this->patchJson("/api/v1/admin/amenities/{$amenityId}/approve", [], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.review_status', 'approved');
    }

    public function test_resident_cannot_book_same_amenity_twice_on_one_date(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();

        Sanctum::actingAs($admin);
        $amenityId = $this->createAmenity($community->id, $admin->id, [
            'status' => 'bookable',
        ]);

        Sanctum::actingAs($resident);

        $payload = [
            'amenity_id' => $amenityId,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '9:00 AM – 10:00 AM',
        ];

        $this->postJson('/api/v1/bookings', $payload)->assertCreated();

        $this->postJson('/api/v1/bookings', [
            ...$payload,
            'time_slot' => '10:00 AM – 11:00 AM',
        ])->assertUnprocessable();
    }

    public function test_amenity_index_marks_user_upcoming_booking(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();

        Sanctum::actingAs($admin);
        $amenityId = $this->createAmenity($community->id, $admin->id);

        Sanctum::actingAs($resident);
        $date = now()->addDays(2)->toDateString();

        DB::table('bookings')->insert([
            'amenity_id' => $amenityId,
            'user_id' => $resident->id,
            'date' => $date,
            'time_slot' => 'Open access',
            'guests' => 1,
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->getJson('/api/v1/amenities')
            ->assertOk()
            ->assertJsonPath("data.0.user_has_upcoming_booking", true)
            ->assertJsonPath("data.0.user_next_booking_date", $date);
    }

    public function test_creator_cannot_book_own_amenity(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id);

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '9:00 AM – 10:00 AM',
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'You cannot book an amenity you created.');
    }

    public function test_booking_guests_cannot_exceed_capacity(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id, ['capacity' => 4]);

        Sanctum::actingAs($resident);

        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '9:00 AM – 10:00 AM',
            'guests' => 8,
        ])->assertUnprocessable();
    }

    public function test_cannot_approve_non_pending_booking(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id);

        $bookingId = DB::table('bookings')->insertGetId([
            'amenity_id' => $amenityId,
            'user_id' => $resident->id,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '9:00 AM – 10:00 AM',
            'guests' => 1,
            'status' => 'confirmed',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($admin);

        $this->patchJson("/api/v1/bookings/{$bookingId}/approve")
            ->assertUnprocessable();
    }

    public function test_cannot_cancel_rejected_booking(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id);

        $bookingId = DB::table('bookings')->insertGetId([
            'amenity_id' => $amenityId,
            'user_id' => $resident->id,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '9:00 AM – 10:00 AM',
            'guests' => 1,
            'status' => 'rejected',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($resident);

        $this->deleteJson("/api/v1/bookings/{$bookingId}")
            ->assertUnprocessable();
    }

    public function test_reject_booking_preserves_requester_notes(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id);

        $bookingId = DB::table('bookings')->insertGetId([
            'amenity_id' => $amenityId,
            'user_id' => $resident->id,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '9:00 AM – 10:00 AM',
            'guests' => 1,
            'status' => 'pending',
            'notes' => 'Birthday party',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($admin);

        $this->patchJson("/api/v1/bookings/{$bookingId}/reject", [
            'reason' => 'Fully booked',
        ])->assertOk();

        $notes = DB::table('bookings')->where('id', $bookingId)->value('notes');
        $this->assertStringContainsString('Birthday party', (string) $notes);
        $this->assertStringContainsString('Fully booked', (string) $notes);
    }

    public function test_resident_amenity_creator_can_approve_own_booking_request(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunity();

        $secondResident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'phone' => '+201700000062',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $secondResident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        $amenityId = $this->createAmenity($community->id, $resident->id);

        $bookingId = DB::table('bookings')->insertGetId([
            'amenity_id' => $amenityId,
            'user_id' => $secondResident->id,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '9:00 AM – 10:00 AM',
            'guests' => 1,
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($resident);

        $this->patchJson("/api/v1/bookings/{$bookingId}/approve")
            ->assertOk();

        $this->assertSame(
            'confirmed',
            DB::table('bookings')->where('id', $bookingId)->value('status'),
        );
    }

    public function test_resident_amenity_starts_pending_and_cannot_be_booked(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();

        Sanctum::actingAs($resident);

        $response = $this->postJson('/api/v1/amenities', [
            'name' => 'Resident Gym',
            'description' => 'Small gym',
            'status' => 'bookable',
            'capacity' => 10,
            'icon_key' => 'gym',
            'hours' => '9:00 AM - 6:00 PM',
            'start_time' => '09:00',
            'end_time' => '18:00',
            'slot_duration_minutes' => 60,
        ])->assertCreated();

        $amenityId = (int) $response->json('data.id');
        $this->assertSame('pending', DB::table('amenities')->where('id', $amenityId)->value('review_status'));

        $secondResident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'phone' => '+201700000063',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $secondResident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        Sanctum::actingAs($secondResident);

        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '9:00 AM – 10:00 AM',
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'This amenity is not available yet.');
    }

    public function test_admin_amenity_is_auto_approved_on_create(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();

        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/v1/admin/amenities', [
            'name' => 'Admin Hall',
            'description' => 'Community hall',
            'status' => 'open',
            'capacity' => 50,
            'icon_key' => 'hall',
            'start_time' => '09:00',
            'end_time' => '18:00',
        ])->assertCreated();

        $this->assertSame('approved', $response->json('data.review_status'));
    }

    public function test_admin_booking_still_requires_creator_approval(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $resident->id);

        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '9:00 AM – 10:00 AM',
        ])->assertCreated();

        $this->assertSame('pending', $response->json('data.status'));

        $adminInbox = $this->getJson('/api/v1/bookings/inbox')->assertOk()->json('data');
        $this->assertCount(0, $adminInbox);

        Sanctum::actingAs($resident);

        $creatorInbox = $this->getJson('/api/v1/bookings/inbox')->assertOk()->json('data');
        $this->assertCount(1, $creatorInbox);
        $this->assertSame('pending', $creatorInbox[0]['status']);
    }

    public function test_non_creator_admin_cannot_approve_booking(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $resident->id);

        $otherAdmin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'phone' => '+201700000064',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $otherAdmin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);

        $secondResident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'phone' => '+201700000065',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $secondResident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        $bookingId = DB::table('bookings')->insertGetId([
            'amenity_id' => $amenityId,
            'user_id' => $secondResident->id,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '9:00 AM – 10:00 AM',
            'guests' => 1,
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($otherAdmin);

        $this->patchJson("/api/v1/bookings/{$bookingId}/approve")
            ->assertForbidden();
    }

    public function test_booking_inbox_only_shows_amenities_created_by_user(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $adminAmenityId = $this->createAmenity($community->id, $admin->id);
        $residentAmenityId = $this->createAmenity($community->id, $resident->id, ['name' => 'Resident Pool']);

        $secondResident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'phone' => '+201700000066',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $secondResident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        DB::table('bookings')->insert([
            'amenity_id' => $adminAmenityId,
            'user_id' => $secondResident->id,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '9:00 AM – 10:00 AM',
            'guests' => 1,
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('bookings')->insert([
            'amenity_id' => $residentAmenityId,
            'user_id' => $secondResident->id,
            'date' => now()->addDays(2)->toDateString(),
            'time_slot' => '9:00 AM – 10:00 AM',
            'guests' => 1,
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($admin);

        $inbox = $this->getJson('/api/v1/bookings/inbox')->assertOk()->json('data');
        $this->assertCount(1, $inbox);
        $this->assertSame($adminAmenityId, (int) $inbox[0]['amenity_id']);
    }
}
