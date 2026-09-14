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

    public function test_paid_booking_requires_payment_proof_and_uses_amenity_fee(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id, ['booking_fee' => 25]);

        Sanctum::actingAs($resident);

        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '4:00 PM - 5:00 PM',
            'booking_fee' => 1,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['payment_proof']);

        $response = $this->post('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '4:00 PM - 5:00 PM',
            'booking_fee' => 1,
            'payment_date' => now()->toDateString(),
            'payment_reference' => 'TXN-25',
            'payment_note' => 'Paid at office',
            'payment_proof' => UploadedFile::fake()->image('receipt.jpg'),
        ], [
            'Accept' => 'application/json',
        ])->assertCreated();

        $this->assertSame('pending', $response->json('data.status'));
        $this->assertSame(25.0, (float) $response->json('data.booking_fee'));
        $this->assertSame('pending', $response->json('data.payment_verification_status'));
        $this->assertSame('TXN-25', $response->json('data.payment_proof.payment_reference'));
        $this->assertNotEmpty($response->json('data.payment_proof.file_url'));

        $row = DB::table('bookings')->where('id', $response->json('data.id'))->first();
        $this->assertSame(25.0, (float) $row->booking_fee);
        $this->assertSame('pending', $row->status);
        $this->assertSame('pending', $row->payment_verification_status);
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
        $bookingId = $this->post('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '4:00 PM - 5:00 PM',
            'payment_date' => now()->toDateString(),
            'payment_reference' => 'REF-88',
            'payment_proof' => UploadedFile::fake()->image('proof.png'),
        ], [
            'Accept' => 'application/json',
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($admin);
        $inbox = $this->getJson('/api/v1/bookings/inbox')->assertOk()->json('data.0');
        $this->assertSame($bookingId, $inbox['id']);
        $this->assertSame(25.0, (float) $inbox['booking_fee']);
        $this->assertSame('REF-88', $inbox['payment_proof']['payment_reference']);
        $this->assertNotEmpty($inbox['payment_proof']['file_url']);

        $this->patchJson("/api/v1/bookings/{$bookingId}/approve")->assertOk();

        $row = DB::table('bookings')->where('id', $bookingId)->first();
        $this->assertSame('confirmed', $row->status);
        $this->assertSame('accepted', $row->payment_verification_status);

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/bookings')
            ->assertOk()
            ->assertJsonPath('data.0.status', 'confirmed')
            ->assertJsonPath('data.0.payment_verification_status', 'accepted');
    }

    public function test_reject_paid_booking_frees_slot_and_shows_reason(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id);
        $date = now()->addDay()->toDateString();

        Sanctum::actingAs($resident);
        $bookingId = $this->post('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => $date,
            'time_slot' => '4:00 PM - 5:00 PM',
            'payment_date' => now()->toDateString(),
            'payment_proof' => UploadedFile::fake()->image('proof.jpg'),
        ], [
            'Accept' => 'application/json',
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/bookings/{$bookingId}/reject", [
            'reason' => 'Receipt is unreadable',
        ])->assertOk();

        $row = DB::table('bookings')->where('id', $bookingId)->first();
        $this->assertSame('rejected', $row->status);
        $this->assertSame('rejected', $row->payment_verification_status);
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
        $bookingId = $this->post('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '4:00 PM - 5:00 PM',
            'payment_date' => now()->toDateString(),
            'payment_proof' => UploadedFile::fake()->image('mine.jpg'),
        ], [
            'Accept' => 'application/json',
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($other);
        $this->assertSame(
            $resident->id,
            (int) DB::table('bookings')->where('id', $bookingId)->value('user_id'),
        );
        $this->getJson('/api/v1/bookings')->assertOk()->assertJsonCount(0, 'data');
    }
}
