<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\GuestInvitation;
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

    public function test_guest_cannot_book_amenity(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id);

        $guest = User::factory()->create([
            'role' => 'guest',
            'status' => 'active',
            'phone' => '+15550009999',
        ]);

        CommunityMembership::query()->create([
            'user_id' => $guest->id,
            'community_id' => $community->id,
            'role' => 'guest',
            'status' => 'approved',
        ]);

        GuestInvitation::query()->create([
            'community_id' => $community->id,
            'invited_by_user_id' => $admin->id,
            'invitation_type' => 'admin',
            'guest_name' => 'Pool Guest',
            'guest_phone' => $guest->phone,
            'invite_code' => 'GUESTBOOKTEST01',
            'starts_at' => now()->subHour(),
            'ends_at' => now()->addDay(),
            'status' => 'active',
            'guest_user_id' => $guest->id,
        ]);

        Sanctum::actingAs($guest);

        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '9:00 AM – 10:00 AM',
        ])->assertForbidden();
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
            'time_slot' => '5:00 PM - 6:00 PM',
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

        $row = DB::table('bookings')->where('id', $bookingId)->first();
        $this->assertSame('Birthday party', $row->notes);
        $this->assertSame('Fully booked', $row->rejection_reason);
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
            'description' => 'Small gym area',
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

    public function test_resident_cannot_enable_shared_billing_when_creating_amenity(): void
    {
        ['resident' => $resident] = $this->seedCommunity();
        Sanctum::actingAs($resident);

        $this->postJson('/api/v1/amenities', [
            'name' => 'Resident Pool',
            'status' => 'bookable',
            'capacity' => 10,
            'icon_key' => 'pool',
            'start_time' => '09:00',
            'end_time' => '18:00',
            'slot_duration_minutes' => 60,
            'shared_billing_enabled' => true,
            'shared_billing_amount' => 25,
            'shared_billing_due_day' => 10,
            'shared_billing_frequency' => 'monthly',
        ])
            ->assertCreated()
            ->assertJsonPath('data.shared_billing_enabled', false)
            ->assertJsonPath('data.shared_billing_amount', null);
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

    public function test_community_admin_sees_pending_bookings_for_amenities_they_created(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        Sanctum::actingAs($admin);

        $amenityId = $this->postJson('/api/v1/admin/amenities', [
            'name' => 'Admin Gym',
            'status' => 'bookable',
            'capacity' => 10,
            'icon_key' => 'gym',
            'start_time' => '09:00',
            'end_time' => '18:00',
            'slot_duration_minutes' => 60,
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($resident);

        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '9:00 AM - 10:00 AM',
        ])->assertCreated()->assertJsonPath('data.status', 'pending');

        Sanctum::actingAs($admin);

        $inbox = $this->getJson('/api/v1/bookings/inbox')->assertOk()->json('data');
        $this->assertCount(1, $inbox);
        $this->assertSame($amenityId, (int) $inbox[0]['amenity_id']);
        $this->assertSame('pending', $inbox[0]['status']);
        $this->assertSame($resident->name, $inbox[0]['user_name']);
        $this->assertNotEmpty($inbox[0]['requested_at']);

        $adminInbox = $this->getJson('/api/v1/admin/bookings')->assertOk()->json('data');
        $this->assertCount(1, $adminInbox);
        $this->assertSame($amenityId, (int) $adminInbox[0]['amenity_id']);
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

    public function test_admin_can_create_amenity_with_shared_billing(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();
        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/v1/admin/amenities', [
            'name' => 'Swimming Pool',
            'status' => 'open',
            'capacity' => 20,
            'icon_key' => 'pool',
            'start_time' => '06:00',
            'end_time' => '22:00',
            'shared_billing_enabled' => true,
            'shared_billing_amount' => 25,
            'shared_billing_due_day' => 10,
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        $response
            ->assertJsonPath('data.shared_billing_enabled', true)
            ->assertJsonPath('data.shared_billing_type', 'all_residents')
            ->assertJsonPath('data.shared_billing_frequency', 'monthly')
            ->assertJsonPath('data.shared_billing_amount', 25)
            ->assertJsonPath('data.shared_billing_due_day', 10)
            ->assertJsonPath('data.community_name', 'Oak Valley');

        $this->assertDatabaseHas('amenities', [
            'name' => 'Swimming Pool',
            'community_id' => $community->id,
            'shared_billing_enabled' => 1,
            'shared_billing_type' => 'all_residents',
            'shared_billing_frequency' => 'monthly',
            'shared_billing_due_day' => 10,
        ]);
    }

    public function test_admin_can_create_amenity_with_25_character_location(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();
        Sanctum::actingAs($admin);
        $floor = str_repeat('A', 25);

        $this->postJson('/api/v1/admin/amenities', [
            'name' => 'Clubhouse',
            'status' => 'open',
            'capacity' => 30,
            'floor' => $floor,
            'icon_key' => 'hall',
            'start_time' => '06:00',
            'end_time' => '22:00',
            'shared_billing_enabled' => true,
            'shared_billing_amount' => 25,
            'shared_billing_due_day' => 1,
        ], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.floor', $floor)
            ->assertJsonPath('data.shared_billing_enabled', true);

        $this->postJson('/api/v1/admin/amenities', [
            'name' => 'Too Long Location',
            'status' => 'open',
            'capacity' => 10,
            'floor' => str_repeat('B', 26),
            'icon_key' => 'hall',
            'start_time' => '06:00',
            'end_time' => '22:00',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertUnprocessable()->assertJsonValidationErrors(['floor']);
    }

    public function test_admin_cannot_create_amenity_with_invalid_name_or_location(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();
        Sanctum::actingAs($admin);

        $base = [
            'status' => 'open',
            'capacity' => 10,
            'icon_key' => 'hall',
            'start_time' => '06:00',
            'end_time' => '22:00',
        ];

        $this->postJson('/api/v1/admin/amenities', array_merge($base, [
            'name' => '  Pool & Spa  ',
            'floor' => '  Bldg A, #4  ',
        ]), [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Pool & Spa')
            ->assertJsonPath('data.floor', 'Bldg A, #4');

        $this->postJson('/api/v1/admin/amenities', array_merge($base, [
            'name' => 'Pool?',
            'floor' => 'Ground',
        ]), [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertUnprocessable()
            ->assertJsonPath('errors.name.0', 'Please enter a valid amenity name.');

        $this->postJson('/api/v1/admin/amenities', array_merge($base, [
            'name' => 'Clubhouse',
            'floor' => ', Floor 2',
        ]), [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertUnprocessable()
            ->assertJsonPath('errors.floor.0', 'Please enter a valid location.');

        $this->postJson('/api/v1/admin/amenities', array_merge($base, [
            'name' => 'A',
        ]), [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertUnprocessable()
            ->assertJsonPath('errors.name.0', 'Amenity Name must contain at least 2 characters.');

        $this->postJson('/api/v1/admin/amenities', array_merge($base, [
            'name' => str_repeat('A', 100),
        ]), [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.name', str_repeat('A', 100));

        $this->postJson('/api/v1/admin/amenities', array_merge($base, [
            'name' => str_repeat('B', 101),
        ]), [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertUnprocessable()
            ->assertJsonPath('errors.name.0', 'Amenity Name must not exceed 100 characters.');
    }

    public function test_description_must_be_between_10_and_500_characters_when_provided(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();
        Sanctum::actingAs($admin);

        $base = [
            'name' => 'Clubhouse',
            'status' => 'open',
            'capacity' => 10,
            'icon_key' => 'hall',
            'start_time' => '06:00',
            'end_time' => '22:00',
        ];

        $this->postJson('/api/v1/admin/amenities', array_merge($base, [
            'description' => 'Too short',
        ]), [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertUnprocessable()
            ->assertJsonPath('errors.description.0', 'Description must be at least 10 characters.');

        $this->postJson('/api/v1/admin/amenities', array_merge($base, [
            'description' => str_repeat('A', 501),
        ]), [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertUnprocessable()
            ->assertJsonPath('errors.description.0', 'Description must be 500 characters or fewer.');

        $this->postJson('/api/v1/admin/amenities', array_merge($base, [
            'description' => '  '.str_repeat('B', 10).'  ',
        ]), [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.description', str_repeat('B', 10));
    }

    public function test_capacity_must_be_at_least_one(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();
        Sanctum::actingAs($admin);

        $base = [
            'status' => 'bookable',
            'icon_key' => 'hall',
            'start_time' => '06:00',
            'end_time' => '22:00',
            'slot_duration_minutes' => 60,
        ];

        $this->postJson('/api/v1/admin/amenities', array_merge($base, [
            'name' => 'Zero Capacity Hall',
            'capacity' => 0,
        ]), [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertUnprocessable()
            ->assertJsonPath('errors.capacity.0', 'Capacity must be at least 1.');

        $this->postJson('/api/v1/admin/amenities', array_merge($base, [
            'name' => 'Two Seat Hall',
            'capacity' => 2,
        ]), [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.capacity', 2);
    }

    public function test_shared_billing_defaults_off_when_omitted(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();
        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/admin/amenities', [
            'name' => 'Gym',
            'status' => 'open',
            'capacity' => 10,
            'icon_key' => 'gym',
            'start_time' => '06:00',
            'end_time' => '22:00',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.shared_billing_enabled', false)
            ->assertJsonPath('data.shared_billing_amount', null)
            ->assertJsonPath('data.shared_billing_due_day', null);
    }

    public function test_shared_billing_requires_amount_and_due_day(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();
        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/admin/amenities', [
            'name' => 'Pool',
            'status' => 'open',
            'capacity' => 10,
            'icon_key' => 'pool',
            'start_time' => '06:00',
            'end_time' => '22:00',
            'shared_billing_enabled' => true,
        ], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['shared_billing_amount', 'shared_billing_due_day']);
    }

    public function test_turning_off_shared_billing_clears_config(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id, [
            'shared_billing_enabled' => true,
            'shared_billing_type' => 'all_residents',
            'shared_billing_frequency' => 'monthly',
            'shared_billing_amount' => 25,
            'shared_billing_due_day' => 10,
        ]);

        Sanctum::actingAs($admin);

        $this->patchJson("/api/v1/admin/amenities/{$amenityId}", [
            'shared_billing_enabled' => false,
        ], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.shared_billing_enabled', false)
            ->assertJsonPath('data.shared_billing_amount', null)
            ->assertJsonPath('data.shared_billing_due_day', null);
    }

    public function test_slots_require_capacity_and_open_closed_allow_empty(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();
        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/admin/amenities', [
            'name' => 'Slots Gym',
            'status' => 'bookable',
            'icon_key' => 'gym',
            'start_time' => '09:00',
            'end_time' => '18:00',
            'slot_duration_minutes' => 60,
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertUnprocessable()->assertJsonValidationErrors(['capacity']);

        $open = $this->postJson('/api/v1/admin/amenities', [
            'name' => 'Open Lounge',
            'status' => 'open',
            'capacity' => null,
            'icon_key' => 'hall',
            'start_time' => '09:00',
            'end_time' => '18:00',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();
        $this->assertSame(0, $open->json('data.capacity'));

        $closed = $this->postJson('/api/v1/admin/amenities', [
            'name' => 'Closed Court',
            'status' => 'closed',
            'icon_key' => 'hall',
            'start_time' => '09:00',
            'end_time' => '18:00',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();
        $this->assertSame(0, $closed->json('data.capacity'));
    }
}
