<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunityPlaidConnection;
use App\Models\CommunitySubscription;
use App\Models\PlaidTransfer;
use App\Models\PlaidTransferEvent;
use App\Models\Region;
use App\Models\ResidentPlaidConnection;
use App\Models\User;
use App\Services\PlaidAchService;
use App\Services\PlaidHttpClient;
use App\Services\PlaidService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Real Plaid Sandbox round trip. Opt-in: PLAID_SANDBOX_E2E=1 with sandbox keys in backend/.env.
 * Sandbox never moves real money.
 */
class PlaidSandboxE2ETest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        if (getenv('PLAID_SANDBOX_E2E') !== '1') {
            $this->markTestSkipped('Set PLAID_SANDBOX_E2E=1 to run against Plaid Sandbox.');
        }
        if (config('plaid.environment') !== 'sandbox' || ! filled(config('plaid.client_id'))) {
            $this->markTestSkipped('Sandbox credentials are not configured.');
        }

        config(['plaid.transfer.simulate' => false, 'plaid.transfer.enabled' => true]);
    }

    public function test_sandbox_debit_post_settle_refund_and_return_lifecycle(): void
    {
        $http = app(PlaidHttpClient::class);
        $ach = app(PlaidAchService::class);
        ['community' => $community, 'resident' => $resident] = $this->seedWithSandboxItems($http);

        // Settled payment, then refund.
        $billA = $this->sharedBill($community, $resident, 12.34);
        $a = $ach->paySharedBill($resident, $this->amenityOf($billA), $billA, ['ip_address' => '127.0.0.1', 'user_agent' => 'phpunit']);
        fwrite(STDERR, "\n[A] status={$a->status} debit={$a->debit_transfer_id} credit_status={$a->credit_status} exception={$a->exception_code}\n");
        $this->assertSame(PlaidTransfer::STATUS_PROCESSING, $a->status);
        $this->assertNotEmpty($a->debit_transfer_id);
        $this->assertDatabaseHas('amenity_resident_bills', ['id' => $billA, 'status' => 'pending_verification']);

        $http->post('/sandbox/transfer/simulate', ['transfer_id' => $a->debit_transfer_id, 'event_type' => 'posted']);
        $a = $ach->refreshFromProvider($a);
        $this->assertSame(PlaidTransfer::STATUS_POSTED, $a->status);
        $this->assertDatabaseHas('amenity_resident_bills', ['id' => $billA, 'status' => 'paid']);

        $http->post('/sandbox/transfer/simulate', ['transfer_id' => $a->debit_transfer_id, 'event_type' => 'settled']);
        $a = $ach->refreshFromProvider($a);
        $this->assertSame(PlaidTransfer::STATUS_SETTLED, $a->status);

        $a = $ach->refund($a, $resident, 'sandbox e2e');
        fwrite(STDERR, "[A refund] refund_status={$a->refund_status} refund_id={$a->refund_transfer_id} exception={$a->exception_code} msg={$a->refund_failure_message}\n");
        $this->assertNotNull($a->refund_status);
        $this->assertNotSame(PlaidTransfer::REFUND_SETTLED, $a->refund_status, 'A new refund must not be reported as settled immediately.');

        // Returned payment, observed through /transfer/event/sync from a seeded cursor.
        $billB = $this->sharedBill($community, $resident, 7.5);
        $b = $ach->paySharedBill($resident, $this->amenityOf($billB), $billB);
        $this->assertNotEmpty($b->debit_transfer_id);
        $http->post('/sandbox/transfer/simulate', ['transfer_id' => $b->debit_transfer_id, 'event_type' => 'posted']);
        $http->post('/sandbox/transfer/simulate', [
            'transfer_id' => $b->debit_transfer_id,
            'event_type' => 'returned',
            'failure_reason' => ['failure_code' => 'R01', 'description' => 'Insufficient funds'],
        ]);

        $ours = $http->post('/transfer/event/list', ['transfer_id' => $b->debit_transfer_id, 'count' => 25]);
        $ids = array_map(fn ($e) => (int) $e['event_id'], $ours['transfer_events'] ?? []);
        $this->assertNotEmpty($ids, 'Plaid listed no events for the returned transfer.');
        PlaidTransferEvent::query()->create(['event_id' => min($ids) - 1, 'event_type' => 'cursor_seed', 'matched' => false, 'outcome' => 'seed']);

        $result = $ach->syncEvents(5);
        fwrite(STDERR, '[B sync] '.json_encode($result)."\n");
        $b->refresh();
        $this->assertSame(PlaidTransfer::STATUS_RETURNED, $b->status);
        $this->assertSame('R01', $b->return_code);
        $this->assertDatabaseHas('amenity_resident_bills', ['id' => $billB, 'status' => 'unpaid']);

        // NSF: sandbox declines when the amount exceeds the available balance.
        $billC = $this->sharedBill($community, $resident, 9000);
        try {
            $ach->paySharedBill($resident, $this->amenityOf($billC), $billC);
            $this->fail('Expected an NSF decline.');
        } catch (\App\Exceptions\PlaidException $e) {
            fwrite(STDERR, "[C] {$e->codeKey}: {$e->getMessage()}\n");
        }
        $this->assertDatabaseHas('plaid_transfers', ['payable_id' => $billC, 'status' => PlaidTransfer::STATUS_FAILED, 'authorization_decision' => 'declined']);
        $this->assertDatabaseHas('amenity_resident_bills', ['id' => $billC, 'status' => 'unpaid']);
    }

    /**
     * @return array{community: Community, resident: User}
     */
    private function seedWithSandboxItems(PlaidHttpClient $http): array
    {
        $plaid = app(PlaidService::class);
        $item = function () use ($http, $plaid): array {
            $public = $http->post('/sandbox/public_token/create', ['institution_id' => 'ins_109508', 'initial_products' => ['auth', 'transfer']]);
            $exchange = $plaid->exchangePublicToken((string) $public['public_token']);
            $accounts = $http->post('/accounts/get', ['access_token' => $exchange['access_token']]);
            $checking = collect($accounts['accounts'])->firstWhere('subtype', 'checking');

            return $exchange + ['account_id' => $checking['account_id'], 'mask' => $checking['mask']];
        };

        $region = Region::query()->create(['title' => 'Sandbox FL', 'area' => 'Sandbox', 'users_label' => '0', 'sort_order' => 1, 'status' => 'active']);
        $community = Community::query()->create(['name' => 'Sandbox Community', 'region_id' => $region->id, 'region' => $region->title, 'status' => 'active', 'review_status' => 'approved']);
        $admin = User::factory()->create(['role' => 'community_admin', 'community_admin_status' => 'approved', 'status' => 'active']);
        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active', 'name' => 'Sandbox Resident']);
        CommunityMembership::query()->create(['user_id' => $admin->id, 'community_id' => $community->id, 'role' => 'admin', 'status' => 'approved']);
        CommunityMembership::query()->create(['user_id' => $resident->id, 'community_id' => $community->id, 'role' => 'member', 'status' => 'approved']);
        CommunitySubscription::query()->create(['community_id' => $community->id, 'plan_slug' => 'starter', 'billing_interval' => 'month', 'status' => CommunitySubscription::STATUS_ACTIVE, 'seat_limit' => 100, 'meta' => []]);

        $c = $item();
        CommunityPlaidConnection::query()->create([
            'community_id' => $community->id, 'connected_by_user_id' => $admin->id, 'plaid_item_id' => $c['item_id'],
            'plaid_access_token' => $c['access_token'], 'account_id' => $c['account_id'], 'account_mask' => $c['mask'],
            'institution_name' => 'First Platypus Bank', 'status' => CommunityPlaidConnection::STATUS_CONNECTED,
        ]);
        $r = $item();
        ResidentPlaidConnection::query()->create([
            'user_id' => $resident->id, 'community_id' => $community->id, 'plaid_item_id' => $r['item_id'],
            'plaid_access_token' => $r['access_token'], 'account_id' => $r['account_id'], 'account_mask' => $r['mask'],
            'institution_name' => 'First Platypus Bank', 'status' => ResidentPlaidConnection::STATUS_CONNECTED,
        ]);

        return compact('community', 'resident');
    }

    private function amenityOf(int $billId): int
    {
        return (int) DB::table('amenity_resident_bills')->where('id', $billId)->value('amenity_id');
    }

    private function sharedBill(Community $community, User $resident, float $amount): int
    {
        $amenityId = (int) DB::table('amenities')->insertGetId([
            'community_id' => $community->id, 'created_by' => $resident->id, 'name' => 'Gym', 'description' => 'Gym',
            'status' => 'open', 'review_status' => 'approved', 'capacity' => 10, 'hours' => 'Open', 'weekends_available' => true,
            'booking_fee' => 0, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $monthlyId = DB::table('amenity_monthly_bills')->insertGetId([
            'amenity_id' => $amenityId, 'community_id' => $community->id, 'billing_month' => now()->startOfMonth()->toDateString(),
            'title' => 'Dues', 'description' => 'Dues', 'amount_per_resident' => $amount, 'due_date' => now()->addDays(10)->toDateString(),
            'status' => 'published', 'published_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);

        return (int) DB::table('amenity_resident_bills')->insertGetId([
            'monthly_bill_id' => $monthlyId, 'amenity_id' => $amenityId, 'community_id' => $community->id, 'user_id' => $resident->id,
            'amount' => $amount, 'status' => 'unpaid', 'created_at' => now(), 'updated_at' => now(),
        ]);
    }
}
