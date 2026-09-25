<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunityPlaidConnection;
use App\Models\CommunitySubscription;
use App\Models\PlaidTransfer;
use App\Models\Region;
use App\Models\ResidentPlaidConnection;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PlaidAchPaymentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'plaid.client_id' => 'test-client',
            'plaid.secret' => 'test-secret',
            'plaid.environment' => 'sandbox',
            'plaid.transfer.enabled' => true,
            'plaid.transfer.simulate' => true,
            'plaid.supported_country_codes' => ['US'],
        ]);
    }

    public function test_resident_can_pay_pool_weekend_booking_by_bank(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedReadyBanks();
        $poolId = $this->createAmenity($community->id, $admin->id, 25, 'Resort pool', 'Weekend guest swim');

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $poolId,
            'date' => now()->addDay()->toDateString(),
            'payment_method' => 'bank_ach',
        ])
            ->assertCreated()
            ->assertJsonPath('data.payment_method', 'bank_ach')
            ->assertJsonPath('data.payment_verification_status', 'accepted');

        $this->assertDatabaseHas('plaid_transfers', [
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'purpose' => PlaidTransfer::PURPOSE_BOOKING_FEE,
            'status' => PlaidTransfer::STATUS_POSTED,
            'amount' => '25.00',
        ]);

        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/plaid/payments')
            ->assertOk()
            ->assertJsonPath('data.0.purpose', PlaidTransfer::PURPOSE_BOOKING_FEE)
            ->assertJsonPath('data.0.purpose_label', 'Resort pool booking fee');
    }

    public function test_clubhouse_event_booking_debits_resident_and_credits_community(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedReadyBanks();
        $clubhouseId = $this->createAmenity($community->id, $admin->id, 150, 'Clubhouse', 'Private event hall');

        Sanctum::actingAs($resident);
        $bookingId = $this->postJson('/api/v1/bookings', [
            'amenity_id' => $clubhouseId,
            'date' => now()->addDays(3)->toDateString(),
            'payment_method' => 'bank_ach',
            'notes' => 'Birthday party for 20 guests',
        ])->assertCreated()->json('data.id');

        $this->assertDatabaseHas('bookings', [
            'id' => $bookingId,
            'payment_method' => 'bank_ach',
            'payment_verification_status' => 'accepted',
            'ach_status' => PlaidTransfer::STATUS_POSTED,
        ]);

        $transfer = PlaidTransfer::query()->where('payable_id', $bookingId)->first();
        $this->assertNotNull($transfer);
        $this->assertSame('150.00', $transfer->amount);
        $this->assertSame('9876', $transfer->source_account_mask);
        $this->assertSame('4321', $transfer->destination_account_mask);
        $this->assertSame('Clubhouse', $transfer->meta['amenity_name']);
    }

    public function test_tennis_court_booking_is_rolled_back_without_community_bank(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedUsers();
        $this->connectResident($resident, $community);
        $courtId = $this->createAmenity($community->id, $admin->id, 40, 'Tennis court', 'Lighted court');

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $courtId,
            'date' => now()->addDay()->toDateString(),
            'payment_method' => 'bank_ach',
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'PLAID_COMMUNITY_BANK_REQUIRED');

        $this->assertDatabaseMissing('bookings', ['amenity_id' => $courtId]);
        $this->assertSame(0, PlaidTransfer::query()->where('user_id', $resident->id)->count());
    }

    public function test_gym_monthly_shared_bill_can_be_paid_by_bank(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedReadyBanks();
        $gymId = $this->createAmenity($community->id, $admin->id, 0, 'Fitness center', 'Shared gym');
        $billId = $this->createSharedBill(
            $gymId,
            $community->id,
            $resident->id,
            45,
            'October gym dues',
            now()->startOfMonth()->toDateString(),
        );

        Sanctum::actingAs($resident);
        $this->postJson("/api/v1/amenities/{$gymId}/bills/{$billId}/pay-bank")
            ->assertCreated()
            ->assertJsonPath('data.transfer.purpose', PlaidTransfer::PURPOSE_SHARED_BILL)
            ->assertJsonPath('data.transfer.amount', 45)
            ->assertJsonPath('data.bill.status', 'paid')
            ->assertJsonPath('data.bill.payment_method', 'bank_ach');

        $this->assertDatabaseHas('amenity_resident_bills', [
            'id' => $billId,
            'status' => 'paid',
            'payment_method' => 'bank_ach',
            'ach_status' => PlaidTransfer::STATUS_POSTED,
        ]);

        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/plaid/payments')
            ->assertOk()
            ->assertJsonPath('data.0.purpose_label', 'Fitness center bill · '.now()->startOfMonth()->toDateString());
    }

    public function test_pool_chemicals_bill_cannot_be_paid_twice(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedReadyBanks();
        $poolId = $this->createAmenity($community->id, $admin->id, 0, 'Resort pool', 'Shared pool');
        $billId = $this->createSharedBill(
            $poolId,
            $community->id,
            $resident->id,
            18.50,
            'September pool chemicals',
            now()->startOfMonth()->toDateString(),
        );

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/plaid/payments/shared-bill', [
            'amenity_id' => $poolId,
            'resident_bill_id' => $billId,
        ])->assertCreated();

        $this->postJson('/api/v1/plaid/payments/shared-bill', [
            'amenity_id' => $poolId,
            'resident_bill_id' => $billId,
        ])
            ->assertStatus(409)
            ->assertJsonPath('code', 'PLAID_PAYMENT_SETTLED');

        $this->assertSame(1, PlaidTransfer::query()->where('user_id', $resident->id)->count());
    }

    public function test_cancelled_pool_booking_refunds_ach(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedReadyBanks();
        $poolId = $this->createAmenity($community->id, $admin->id, 25, 'Resort pool', 'Weekend swim');

        Sanctum::actingAs($resident);
        $bookingId = $this->postJson('/api/v1/bookings', [
            'amenity_id' => $poolId,
            'date' => now()->addDays(2)->toDateString(),
            'payment_method' => 'bank_ach',
        ])->assertCreated()->json('data.id');

        $this->deleteJson("/api/v1/bookings/{$bookingId}")
            ->assertOk()
            ->assertJsonPath('message', 'Booking cancelled');

        $this->assertDatabaseHas('plaid_transfers', [
            'payable_type' => PlaidTransfer::PAYABLE_BOOKING,
            'payable_id' => $bookingId,
            'status' => PlaidTransfer::STATUS_REFUNDED,
        ]);
        $this->assertDatabaseHas('bookings', [
            'id' => $bookingId,
            'status' => 'cancelled',
            'ach_status' => PlaidTransfer::STATUS_REFUNDED,
        ]);
    }

    public function test_admin_reject_clubhouse_booking_refunds_ach(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedReadyBanks();
        $clubhouseId = $this->createAmenity($community->id, $admin->id, 150, 'Clubhouse', 'Event hall');

        Sanctum::actingAs($resident);
        $bookingId = $this->postJson('/api/v1/bookings', [
            'amenity_id' => $clubhouseId,
            'date' => now()->addDays(5)->toDateString(),
            'payment_method' => 'bank_ach',
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/bookings/{$bookingId}/reject", [
            'reason' => 'Date conflicts with HOA meeting',
        ])->assertOk();

        $this->assertDatabaseHas('plaid_transfers', [
            'payable_id' => $bookingId,
            'status' => PlaidTransfer::STATUS_REFUNDED,
        ]);
        $this->assertDatabaseHas('bookings', [
            'id' => $bookingId,
            'status' => 'rejected',
            'ach_status' => PlaidTransfer::STATUS_REFUNDED,
        ]);
    }

    public function test_resident_capability_and_connection_status(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedReadyBanks();

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/plaid/resident/capability')
            ->assertOk()
            ->assertJsonPath('data.can_pay_with_bank', true)
            ->assertJsonPath('data.community.bank_connected', true)
            ->assertJsonPath('data.resident.connected', true)
            ->assertJsonPath('data.transfer_mode', 'simulated')
            ->assertJsonPath('data.live_transfer_ready', false);

        $this->getJson('/api/v1/plaid/resident/connection')
            ->assertOk()
            ->assertJsonPath('data.connected', true)
            ->assertJsonMissingPath('data.plaid_access_token');
    }

    public function test_capability_is_false_until_community_bank_is_linked(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedUsers();
        $this->connectResident($resident, $community);

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/plaid/resident/capability')
            ->assertOk()
            ->assertJsonPath('data.can_pay_with_bank', false)
            ->assertJsonPath('data.community.bank_connected', false)
            ->assertJsonPath('data.resident.connected', true);
    }

    public function test_proof_booking_still_requires_file(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedReadyBanks();
        $amenityId = $this->createAmenity($community->id, $admin->id, 20, 'Guest suite', 'Overnight stay');

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => now()->addDay()->toDateString(),
        ])->assertStatus(422);
    }

    /**
     * @return array{community: Community, admin: User, resident: User}
     */
    private function seedReadyBanks(): array
    {
        $seeded = $this->seedUsers();
        $this->connectCommunity($seeded['admin'], $seeded['community']);
        $this->connectResident($seeded['resident'], $seeded['community']);

        return $seeded;
    }

    /**
     * @return array{community: Community, admin: User, resident: User}
     */
    private function seedUsers(): array
    {
        $token = (string) random_int(10000, 99999);
        $region = Region::query()->create([
            'title' => 'Florida '.$token,
            'area' => 'Test Area '.$token,
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $community = Community::query()->create([
            'name' => 'Florida Main Street '.$token,
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'phone' => '+1555'.str_pad((string) random_int(1000000, 9999999), 7, '0', STR_PAD_LEFT),
        ]);
        $resident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'name' => 'Sarah Resident',
            'phone' => '+1555'.str_pad((string) random_int(1000000, 9999999), 7, '0', STR_PAD_LEFT),
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
            'meta' => ['card_on_file' => true],
        ]);

        return compact('community', 'admin', 'resident');
    }

    private function connectCommunity(User $admin, Community $community): void
    {
        CommunityPlaidConnection::query()->create([
            'community_id' => $community->id,
            'connected_by_user_id' => $admin->id,
            'plaid_item_id' => 'item-community-'.$community->id,
            'plaid_access_token' => 'access-community',
            'institution_name' => 'Community Bank',
            'account_id' => 'acc-community',
            'account_name' => 'Operating',
            'account_mask' => '4321',
            'status' => CommunityPlaidConnection::STATUS_CONNECTED,
        ]);
    }

    private function connectResident(User $resident, Community $community): void
    {
        ResidentPlaidConnection::query()->create([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'plaid_item_id' => 'item-resident-'.$resident->id,
            'plaid_access_token' => 'access-resident',
            'institution_name' => 'Chase',
            'account_id' => 'acc-resident',
            'account_name' => 'Checking',
            'account_mask' => '9876',
            'status' => ResidentPlaidConnection::STATUS_CONNECTED,
        ]);
    }

    private function createAmenity(int $communityId, int $creatorId, float $fee, string $name = 'Pool', string $description = 'Shared pool'): int
    {
        return (int) DB::table('amenities')->insertGetId([
            'community_id' => $communityId,
            'created_by' => $creatorId,
            'name' => $name,
            'description' => $description,
            'status' => 'open',
            'review_status' => 'approved',
            'capacity' => 10,
            'hours' => 'Open access',
            'weekends_available' => true,
            'booking_fee' => $fee,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function createSharedBill(
        int $amenityId,
        int $communityId,
        int $userId,
        float $amount,
        string $title,
        string $billingMonth,
    ): int {
        $monthlyId = DB::table('amenity_monthly_bills')->insertGetId([
            'amenity_id' => $amenityId,
            'community_id' => $communityId,
            'billing_month' => $billingMonth,
            'title' => $title,
            'description' => $title,
            'amount_per_resident' => $amount,
            'due_date' => now()->addDays(10)->toDateString(),
            'status' => 'published',
            'published_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return (int) DB::table('amenity_resident_bills')->insertGetId([
            'monthly_bill_id' => $monthlyId,
            'amenity_id' => $amenityId,
            'community_id' => $communityId,
            'user_id' => $userId,
            'amount' => $amount,
            'status' => 'unpaid',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
