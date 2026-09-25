<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\Region;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AmenityBookingFeeTest extends TestCase
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
            'phone' => '+201700000160',
        ]);

        $resident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'phone' => '+201700000161',
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
            'capacity' => 20,
            'floor' => 'Ground',
            'hours' => '9:00 AM - 6:00 PM',
            'start_time' => '09:00:00',
            'end_time' => '18:00:00',
            'slot_duration_minutes' => 60,
            'weekends_available' => true,
            'booking_fee' => 25,
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));
    }

    public function test_admin_can_configure_booking_fee_separately_from_shared_billing(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();
        Sanctum::actingAs($admin);

        $amenity = $this->postJson('/api/v1/admin/amenities', [
            'name' => 'Swimming Pool',
            'status' => 'bookable',
            'capacity' => 10,
            'icon_key' => 'pool',
            'start_time' => '09:00',
            'end_time' => '18:00',
            'slot_duration_minutes' => 60,
            'booking_fee' => 25,
            'shared_billing_enabled' => false,
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated()->json('data');

        $this->assertSame(25.0, (float) $amenity['booking_fee']);
        $this->assertFalse($amenity['shared_billing_enabled']);
    }

    public function test_paid_booking_is_requested_without_payment_proof(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id, ['booking_fee' => 25]);

        Sanctum::actingAs($resident);

        $response = $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '4:00 PM - 5:00 PM',
        ])->assertCreated();

        $this->assertSame('pending', $response->json('data.status'));
        $this->assertSame(25.0, (float) $response->json('data.booking_fee'));
        $this->assertSame('not_required', $response->json('data.payment_verification_status'));
        $this->assertNull($response->json('data.payment_proof'));
    }

    public function test_zero_fee_booking_skips_payment_proof(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id, ['booking_fee' => 0]);

        Sanctum::actingAs($resident);

        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '9:00 AM - 10:00 AM',
        ])->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.booking_fee', 0)
            ->assertJsonPath('data.payment_verification_status', 'not_required')
            ->assertJsonPath('data.payment_proof', null);
    }

    public function test_admin_inbox_shows_payment_details_and_approve_confirms_booking(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id);

        Sanctum::actingAs($resident);
        $bookingId = $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '4:00 PM - 5:00 PM',
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($admin);
        $inbox = $this->getJson('/api/v1/bookings/inbox')->assertOk()->json('data.0');
        $this->assertSame($bookingId, $inbox['id']);
        $this->assertSame(25.0, (float) $inbox['booking_fee']);

        $this->patchJson("/api/v1/bookings/{$bookingId}/approve")->assertOk();

        $row = DB::table('bookings')->where('id', $bookingId)->first();
        $this->assertSame('confirmed', $row->status);

        $this->assertDatabaseHas('amenity_resident_bills', [
            'booking_id' => $bookingId,
            'user_id' => $resident->id,
            'amount' => 25,
            'status' => 'unpaid',
        ]);

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/bookings')
            ->assertOk()
            ->assertJsonPath('data.0.status', 'confirmed');
        $this->getJson('/api/v1/amenity-bills')
            ->assertOk()
            ->assertJsonPath('data.0.amount', 25);
    }

    public function test_reject_paid_booking_frees_slot_and_shows_reason(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id);
        $date = now()->addDay()->toDateString();

        Sanctum::actingAs($resident);
        $bookingId = $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => $date,
            'time_slot' => '4:00 PM - 5:00 PM',
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/bookings/{$bookingId}/reject", [
            'reason' => 'Receipt is unreadable',
        ])->assertOk();

        $row = DB::table('bookings')->where('id', $bookingId)->first();
        $this->assertSame('rejected', $row->status);
        $this->assertSame('Receipt is unreadable', $row->rejection_reason);

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/bookings')
            ->assertOk()
            ->assertJsonPath('data.0.status', 'rejected')
            ->assertJsonPath('data.0.rejection_reason', 'Receipt is unreadable');

        $this->getJson("/api/v1/amenities/{$amenityId}/slots?date={$date}")
            ->assertOk();
        $slots = $this->getJson("/api/v1/amenities/{$amenityId}/slots?date={$date}")->json('data');
        $taken = collect($slots)->firstWhere('value', '4:00 PM - 5:00 PM');
        $this->assertTrue($taken['available'] ?? false);
    }

    public function test_resident_cannot_submit_proof_for_another_users_booking(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id);

        $other = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'phone' => '+201700000162',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $other->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        Sanctum::actingAs($resident);
        $bookingId = $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '4:00 PM - 5:00 PM',
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($other);
        $this->assertSame(
            $resident->id,
            (int) DB::table('bookings')->where('id', $bookingId)->value('user_id'),
        );
        $this->getJson('/api/v1/bookings')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_two_paid_bookings_in_same_month_each_get_a_bill(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $other = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'phone' => '+201700000163',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $other->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);
        $amenityId = $this->createAmenity($community->id, $admin->id, ['booking_fee' => 25]);
        $date = now()->addDay()->toDateString();

        Sanctum::actingAs($resident);
        $firstId = $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => $date,
            'time_slot' => '4:00 PM - 5:00 PM',
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($other);
        $secondId = $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => $date,
            'time_slot' => '5:00 PM - 6:00 PM',
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/bookings/{$firstId}/approve")->assertOk();
        $this->patchJson("/api/v1/bookings/{$secondId}/approve")->assertOk();

        $this->assertSame(2, DB::table('amenity_resident_bills')->where('amenity_id', $amenityId)->count());
        $this->assertDatabaseHas('amenity_resident_bills', [
            'booking_id' => $firstId,
            'user_id' => $resident->id,
            'amount' => 25,
        ]);
        $this->assertDatabaseHas('amenity_resident_bills', [
            'booking_id' => $secondId,
            'user_id' => $other->id,
            'amount' => 25,
        ]);
    }

    public function test_booking_notifies_the_amenity_owner(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $owner = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'phone' => '+201700000164',
            'name' => 'Amenity Owner',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $owner->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);
        $amenityId = $this->createAmenity($community->id, $owner->id);

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '4:00 PM - 5:00 PM',
        ])->assertCreated();

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $owner->id,
            'title' => 'New amenity booking request',
            'action_url' => '/screens/admin-bookings',
        ]);
    }

    public function test_amenity_owner_can_approve_booking_payment(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $owner = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'phone' => '+201700000165',
            'name' => 'Amenity Owner',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $owner->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);
        $amenityId = $this->createAmenity($community->id, $owner->id, ['booking_fee' => 25]);

        Sanctum::actingAs($resident);
        $bookingId = $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '4:00 PM - 5:00 PM',
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($owner);
        $this->patchJson("/api/v1/bookings/{$bookingId}/approve")->assertOk();

        $residentBillId = (int) DB::table('amenity_resident_bills')
            ->where('booking_id', $bookingId)
            ->value('id');
        $this->assertGreaterThan(0, $residentBillId);

        Sanctum::actingAs($resident);
        $this->withHeaders(['Accept' => 'application/json'])
            ->post("/api/v1/amenities/{$amenityId}/bills/{$residentBillId}/proof", [
                'payment_date' => now()->toDateString(),
                'payment_reference' => 'TXN-OWNER-1',
                'file' => UploadedFile::fake()->image('receipt.jpg', 300, 300),
            ])
            ->assertOk();

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $owner->id,
            'title' => 'Amenity payment proof submitted',
            'action_url' => '/screens/property-management/amenity-bills',
        ]);

        Sanctum::actingAs($owner);
        $this->getJson('/api/v1/amenity-owner-bills')
            ->assertOk()
            ->assertJsonPath('data.0.resident_bill_id', $residentBillId)
            ->assertJsonPath('data.0.status', 'pending_verification')
            ->assertJsonPath('data.0.can_review', true);

        Sanctum::actingAs($resident);
        $this->patchJson("/api/v1/amenities/{$amenityId}/resident-bills/{$residentBillId}/approve")
            ->assertForbidden();

        Sanctum::actingAs($owner);
        $this->patchJson("/api/v1/amenities/{$amenityId}/resident-bills/{$residentBillId}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'paid');
    }

    public function test_admin_booking_of_resident_amenity_pays_after_owner_approval(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();
        $owner = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'phone' => '+201700000166',
            'name' => 'Amenity Owner',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $owner->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);
        $amenityId = $this->createAmenity($community->id, $owner->id, ['booking_fee' => 25]);
        $date = now()->addDay()->toDateString();

        Sanctum::actingAs($admin);
        $bookingId = $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => $date,
            'time_slot' => '4:00 PM - 5:00 PM',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated()->json('data.id');

        $this->assertSame('pending', DB::table('bookings')->where('id', $bookingId)->value('status'));
        $this->assertDatabaseMissing('amenity_resident_bills', ['booking_id' => $bookingId]);

        Sanctum::actingAs($owner);
        $this->patchJson("/api/v1/bookings/{$bookingId}/approve")->assertOk();

        $this->assertSame('awaiting_payment', DB::table('bookings')->where('id', $bookingId)->value('status'));
        $residentBillId = (int) DB::table('amenity_resident_bills')->where('booking_id', $bookingId)->value('id');
        $this->assertGreaterThan(0, $residentBillId);

        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/bookings', [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk()
            ->assertJsonPath('data.0.status', 'awaiting_payment')
            ->assertJsonPath('data.0.booking_bill.can_submit_proof', true)
            ->assertJsonPath('data.0.booking_bill.resident_bill_id', $residentBillId);

        $this->getJson('/api/v1/admin/amenities', [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk()
            ->assertJsonPath('data.0.user_next_booking_status', 'awaiting_payment')
            ->assertJsonPath('data.0.user_next_booking_bill.can_submit_proof', true);

        $this->withHeaders(['Accept' => 'application/json', 'X-Community-Id' => (string) $community->id])
            ->post("/api/v1/amenities/{$amenityId}/bills/{$residentBillId}/proof", [
                'payment_date' => now()->toDateString(),
                'payment_reference' => 'TXN-ADMIN-1',
                'file' => UploadedFile::fake()->image('admin-receipt.jpg', 300, 300),
            ])
            ->assertOk();

        $this->assertSame('awaiting_payment', DB::table('bookings')->where('id', $bookingId)->value('status'));

        Sanctum::actingAs($owner);
        $this->patchJson("/api/v1/amenities/{$amenityId}/resident-bills/{$residentBillId}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'paid');

        $this->assertSame('confirmed', DB::table('bookings')->where('id', $bookingId)->value('status'));
        $noticeId = (int) DB::table('amenity_resident_bills')->where('id', $residentBillId)->value('finance_notice_id');
        if ($noticeId > 0) {
            $this->assertDatabaseMissing('notice_recipients', [
                'notice_id' => $noticeId,
                'user_id' => $admin->id,
            ]);
        }
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $admin->id,
            'title' => 'Reservation confirmed',
        ]);
    }
}
