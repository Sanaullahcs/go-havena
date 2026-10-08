<?php

namespace Tests\Feature;

use App\Exceptions\PlaidException;
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
use App\Services\PlaidEligibilityService;
use App\Services\PlaidHttpClient;
use App\Services\PlaidService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\Support\FakePlaidHttp;
use Tests\TestCase;

/**
 * Plaid Transfer lifecycle against a recording fake of the Plaid HTTP API.
 * Test ids (TC-xx) map to docs/payments/plaid-test-cases.md.
 */
class PlaidTransferLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private FakePlaidHttp $plaid;

    /** @var list<array<string, mixed>> */
    private array $events = [];

    /** @var array<string, array<string, mixed>> */
    private array $remote = [];

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'plaid.client_id' => 'test-client',
            'plaid.secret' => 'test-secret',
            'plaid.environment' => 'sandbox',
            'plaid.transfer.enabled' => true,
            'plaid.transfer.simulate' => false,
            'plaid.transfer.allow_sandbox_in_production' => false,
            'plaid.verify_webhooks' => false,
            'plaid.supported_country_codes' => ['US'],
        ]);

        $this->plaid = $this->livePlaid();
        $this->app->instance(PlaidHttpClient::class, $this->plaid);
    }

    // ── E. Initiation ─────────────────────────────────────────────

    public function test_tc_e01_live_debit_sends_idempotency_key_only_on_authorizations(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedReadyBanks();
        $billId = $this->sharedBill($community, $resident, 45);

        Sanctum::actingAs($resident);
        $this->payBill($billId)->assertCreated()->assertJsonPath('data.status', PlaidTransfer::STATUS_PROCESSING);

        $auths = $this->plaid->payloads('/transfer/authorization/create');
        $this->assertCount(2, $auths);
        $this->assertSame('debit', $auths[0]['type']);
        $this->assertSame('credit', $auths[1]['type']);
        foreach ($auths as $auth) {
            $this->assertNotEmpty($auth['idempotency_key']);
            $this->assertLessThanOrEqual(50, strlen($auth['idempotency_key']));
        }
        $this->assertNotSame($auths[0]['idempotency_key'], $auths[1]['idempotency_key']);
        $this->assertSame('45.00', $auths[0]['amount']);
        $this->assertTrue($auths[0]['user_present']);
        foreach ($this->plaid->payloads('/transfer/create') as $create) {
            $this->assertArrayNotHasKey('idempotency_key', $create);
        }
    }

    public function test_tc_e11_accepted_debit_is_processing_not_paid(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedReadyBanks();
        $billId = $this->sharedBill($community, $resident, 30);

        Sanctum::actingAs($resident);
        $this->payBill($billId)->assertCreated();

        $this->assertDatabaseHas('amenity_resident_bills', ['id' => $billId, 'status' => 'pending_verification', 'ach_status' => 'processing']);
        $this->assertSame(0, DB::table('app_notifications')->where('user_id', $resident->id)->where('title', 'Bank payment sent')->count());
    }

    public function test_tc_e02_nsf_decline_fails_without_keeping_the_reservation(): void
    {
        $this->plaid->on('/transfer/authorization/create', fn () => [
            'authorization' => ['id' => 'auth-nsf', 'decision' => 'declined', 'decision_rationale' => ['code' => 'NSF', 'description' => 'nsf']],
        ]);
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedReadyBanks();
        $poolId = $this->amenity($community, $admin, 25);

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/bookings', ['amenity_id' => $poolId, 'date' => now()->addDay()->toDateString(), 'payment_method' => 'bank_ach'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'PLAID_TRANSFER_FAILED')
            ->assertJsonPath('message', 'Your bank account does not have enough available funds for this payment. You have not been charged.');

        $this->assertDatabaseMissing('bookings', ['amenity_id' => $poolId]);
        $this->assertSame(0, $this->plaid->count('/transfer/create'));
        $this->assertDatabaseHas('plaid_transfers', ['user_id' => $resident->id, 'status' => PlaidTransfer::STATUS_FAILED, 'authorization_decision' => 'declined']);
    }

    public function test_tc_e03_missing_authorization_decision_is_not_treated_as_approved(): void
    {
        $this->plaid->on('/transfer/authorization/create', fn () => ['authorization' => ['id' => 'auth-x']]);
        ['community' => $community, 'resident' => $resident] = $this->seedReadyBanks();
        $billId = $this->sharedBill($community, $resident, 20);

        Sanctum::actingAs($resident);
        $this->payBill($billId)->assertStatus(422);

        $this->assertSame(0, $this->plaid->count('/transfer/create'));
        $this->assertDatabaseHas('amenity_resident_bills', ['id' => $billId, 'status' => 'unpaid']);
    }

    public function test_tc_e04_user_action_required_asks_resident_to_reconnect(): void
    {
        $this->plaid->on('/transfer/authorization/create', fn () => ['authorization' => ['id' => 'auth-u', 'decision' => 'user_action_required']]);
        ['community' => $community, 'resident' => $resident] = $this->seedReadyBanks();
        $billId = $this->sharedBill($community, $resident, 20);

        Sanctum::actingAs($resident);
        $this->payBill($billId)->assertStatus(422)->assertJsonPath('code', 'PLAID_USER_ACTION_REQUIRED');

        $this->assertDatabaseHas('resident_plaid_connections', ['user_id' => $resident->id, 'status' => ResidentPlaidConnection::STATUS_NEEDS_ATTENTION]);
        $this->assertSame(0, $this->plaid->count('/transfer/create'));
    }

    public function test_tc_e05_sandbox_transport_failure_fails_instead_of_faking_success(): void
    {
        config(['plaid.transfer.simulate' => null]);
        $this->plaid->on('/transfer/authorization/create', new \RuntimeException('cURL error 60: SSL certificate problem'));
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedReadyBanks();
        $amenityId = $this->amenity($community, $admin, 12);

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/bookings', ['amenity_id' => $amenityId, 'date' => now()->addDay()->toDateString(), 'payment_method' => 'bank_ach'])
            ->assertStatus(422);

        $this->assertDatabaseMissing('bookings', ['amenity_id' => $amenityId]);
        $this->assertDatabaseMissing('plaid_transfers', ['simulated' => 1]);
        $this->assertDatabaseMissing('plaid_transfers', ['status' => PlaidTransfer::STATUS_POSTED]);
    }

    public function test_tc_e06_create_timeout_keeps_booking_and_blocks_blind_retry(): void
    {
        $this->plaid->on('/transfer/create', new \RuntimeException('cURL error 28: Operation timed out'));
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedReadyBanks();
        $amenityId = $this->amenity($community, $admin, 40);

        Sanctum::actingAs($resident);
        $bookingId = $this->postJson('/api/v1/bookings', ['amenity_id' => $amenityId, 'date' => now()->addDay()->toDateString(), 'payment_method' => 'bank_ach'])
            ->assertCreated()
            ->assertJsonPath('data.payment_verification_status', 'pending')
            ->json('data.id');

        $transfer = PlaidTransfer::query()->where('payable_id', $bookingId)->firstOrFail();
        $this->assertSame(PlaidTransfer::STATUS_AUTHORIZED, $transfer->status);
        $this->assertSame(PlaidTransfer::EXCEPTION_OUTCOME_UNKNOWN, $transfer->exception_code);

        $this->postJson('/api/v1/plaid/payments/booking', ['booking_id' => $bookingId])
            ->assertStatus(409)
            ->assertJsonPath('code', 'PLAID_TRANSFER_IN_PROGRESS');
        $this->assertSame(1, $this->plaid->count('/transfer/create'));
    }

    public function test_tc_e07_global_kill_switch_blocks_new_payments(): void
    {
        config(['plaid.transfer.enabled' => false]);
        ['community' => $community, 'resident' => $resident] = $this->seedReadyBanks();
        $billId = $this->sharedBill($community, $resident, 20);

        Sanctum::actingAs($resident);
        $this->payBill($billId)->assertStatus(422)->assertJsonPath('meta.reason', 'disabled_globally');
        $this->getJson('/api/v1/plaid/resident/capability')->assertOk()->assertJsonPath('data.can_pay_with_bank', false);
        $this->assertSame([], $this->plaid->calls);
    }

    public function test_tc_e08_paused_community_blocks_new_payments_but_events_still_apply(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedReadyBanks();
        $billId = $this->sharedBill($community, $resident, 20);
        Sanctum::actingAs($resident);
        $this->payBill($billId)->assertCreated();

        CommunityPlaidConnection::query()->where('community_id', $community->id)->update(['payments_paused_at' => now(), 'payments_pause_reason' => 'Bank change review']);

        $otherBill = $this->sharedBill($community, $resident, 15);
        $this->payBill($otherBill)->assertStatus(422)->assertJsonPath('meta.reason', 'paused');

        $this->pushEvent('debit-1', 'posted');
        app(PlaidAchService::class)->syncEvents();
        $this->assertDatabaseHas('amenity_resident_bills', ['id' => $billId, 'status' => 'paid']);
    }

    public function test_tc_e09_sandbox_is_refused_when_app_env_is_production(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedReadyBanks();
        $billId = $this->sharedBill($community, $resident, 20);
        $this->app['env'] = 'production';

        Sanctum::actingAs($resident);
        $this->payBill($billId)->assertStatus(422)->assertJsonPath('meta.reason', 'sandbox_in_production');

        config(['plaid.transfer.allow_sandbox_in_production' => true]);
        $this->payBill($billId)->assertCreated();
    }

    public function test_tc_e10_in_flight_attempt_blocks_a_second_payment_for_the_same_bill(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedReadyBanks();
        $billId = $this->sharedBill($community, $resident, 20);
        $this->transferRow($community, $resident, PlaidTransfer::PAYABLE_SHARED_BILL, $billId, ['status' => PlaidTransfer::STATUS_AUTHORIZING]);

        Sanctum::actingAs($resident);
        $this->payBill($billId)->assertStatus(409)->assertJsonPath('code', 'PLAID_TRANSFER_IN_PROGRESS');
        $this->assertSame(0, $this->plaid->count('/transfer/authorization/create'));
    }

    public function test_tc_e12_payout_decline_flags_exception_but_keeps_resident_debit(): void
    {
        $this->plaid->on('/transfer/authorization/create', fn (array $p) => [
            'authorization' => ['id' => 'auth-'.$p['type'], 'decision' => $p['type'] === 'credit' ? 'declined' : 'approved'],
        ]);
        ['community' => $community, 'resident' => $resident] = $this->seedReadyBanks();
        $billId = $this->sharedBill($community, $resident, 20);

        Sanctum::actingAs($resident);
        $this->payBill($billId)->assertCreated();

        $transfer = PlaidTransfer::query()->firstOrFail();
        $this->assertSame('debit-1', $transfer->debit_transfer_id);
        $this->assertNull($transfer->credit_transfer_id);
        $this->assertSame(PlaidTransfer::EXCEPTION_PAYOUT_FAILED, $transfer->exception_code);
        $this->assertSame(1, $this->plaid->count('/transfer/create'));
    }

    public function test_tc_d01_cancelled_booking_cannot_be_paid_by_direct_api(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedReadyBanks();
        $amenityId = $this->amenity($community, $admin, 30);
        $bookingId = DB::table('bookings')->insertGetId([
            'amenity_id' => $amenityId, 'user_id' => $resident->id, 'date' => now()->addDay()->toDateString(),
            'guests' => 1, 'booking_fee' => 30, 'status' => 'cancelled', 'created_at' => now(), 'updated_at' => now(),
        ]);

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/plaid/payments/booking', ['booking_id' => $bookingId])
            ->assertStatus(422)
            ->assertJsonPath('code', 'PLAID_CHARGE_NOT_PAYABLE');
        $this->assertSame([], $this->plaid->calls);
    }

    public function test_tc_c01_resident_cannot_pay_another_residents_bill(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedReadyBanks();
        $neighbour = $this->member($community, 'Neighbour Resident');
        $this->connectResident($neighbour, $community);
        $billId = $this->sharedBill($community, $resident, 20);

        Sanctum::actingAs($neighbour);
        $amenityId = (int) DB::table('amenity_resident_bills')->where('id', $billId)->value('amenity_id');
        $this->postJson('/api/v1/plaid/payments/shared-bill', ['amenity_id' => $amenityId, 'resident_bill_id' => $billId])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Bill not found.');
        $this->assertSame([], $this->plaid->calls);
    }

    // ── F. Status, events, webhooks ───────────────────────────────

    public function test_tc_f01_event_sync_settles_and_is_idempotent(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedReadyBanks();
        $billId = $this->sharedBill($community, $resident, 45);
        Sanctum::actingAs($resident);
        $this->payBill($billId)->assertCreated();

        $this->pushEvent('debit-1', 'pending');
        $this->pushEvent('debit-1', 'posted');
        $this->pushEvent('debit-1', 'settled');
        $ach = app(PlaidAchService::class);
        $first = $ach->syncEvents();
        $second = $ach->syncEvents();

        $this->assertSame(3, $first['fetched']);
        $this->assertSame(0, $second['fetched']);
        $this->assertSame(3, $this->plaid->payloads('/transfer/event/sync')[1]['after_id']);
        $this->assertDatabaseHas('plaid_transfers', ['debit_transfer_id' => 'debit-1', 'status' => PlaidTransfer::STATUS_SETTLED]);
        $this->assertDatabaseHas('amenity_resident_bills', ['id' => $billId, 'status' => 'paid']);
        $this->assertSame(1, DB::table('app_notifications')->where('user_id', $resident->id)->where('title', 'Bank payment sent')->count());
        $this->assertSame(3, PlaidTransferEvent::query()->count());
    }

    public function test_tc_f02_older_event_cannot_regress_status(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedReadyBanks();
        $billId = $this->sharedBill($community, $resident, 45);
        Sanctum::actingAs($resident);
        $this->payBill($billId)->assertCreated();

        $this->pushEvent('debit-1', 'settled');
        $this->pushEvent('debit-1', 'posted');
        $this->pushEvent('debit-1', 'pending');
        app(PlaidAchService::class)->syncEvents();

        $this->assertDatabaseHas('plaid_transfers', ['debit_transfer_id' => 'debit-1', 'status' => PlaidTransfer::STATUS_SETTLED]);
        $this->assertSame(2, PlaidTransferEvent::query()->where('outcome', 'stale')->count());
    }

    public function test_tc_f03_return_after_settlement_reopens_bill_and_flags_payout_recovery(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedReadyBanks();
        $billId = $this->sharedBill($community, $resident, 45);
        Sanctum::actingAs($resident);
        $this->payBill($billId)->assertCreated();

        $this->pushEvent('debit-1', 'posted');
        $this->pushEvent('debit-1', 'settled');
        $this->pushEvent('debit-1', 'returned', ['failure_code' => 'R01', 'description' => 'Insufficient funds']);
        app(PlaidAchService::class)->syncEvents();

        $transfer = PlaidTransfer::query()->firstOrFail();
        $this->assertSame(PlaidTransfer::STATUS_RETURNED, $transfer->status);
        $this->assertSame('R01', $transfer->return_code);
        $this->assertSame('Returned (R01)', $transfer->statusLabel());
        $this->assertSame(PlaidTransfer::EXCEPTION_PAYOUT_RECOVERY, $transfer->exception_code);
        $this->assertDatabaseHas('amenity_resident_bills', ['id' => $billId, 'status' => 'unpaid', 'ach_status' => 'returned']);
        $this->assertSame(1, DB::table('app_notifications')->where('user_id', $resident->id)->where('title', 'Bank payment returned')->count());

        $this->payBill($billId)->assertCreated();
        $this->assertSame(2, PlaidTransfer::query()->where('payable_id', $billId)->count());
    }

    public function test_tc_f04_unknown_transfer_events_are_kept_as_unmatched(): void
    {
        $this->pushEvent('foreign-transfer', 'posted');
        $this->events[] = ['event_id' => 99, 'event_type' => 'sweep.settled', 'transfer_id' => '', 'sweep_id' => 'sw-1'];
        $result = app(PlaidAchService::class)->syncEvents();

        $this->assertSame(1, $result['unmatched']);
        $this->assertDatabaseHas('plaid_transfer_events', ['transfer_id' => 'foreign-transfer', 'matched' => 0, 'outcome' => 'unmatched']);
        $this->assertDatabaseHas('plaid_transfer_events', ['event_id' => 99, 'outcome' => 'ledger']);
    }

    public function test_tc_f05_funds_available_counts_as_settled(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedReadyBanks();
        $billId = $this->sharedBill($community, $resident, 45);
        Sanctum::actingAs($resident);
        $this->payBill($billId)->assertCreated();

        $this->pushEvent('debit-1', 'settled');
        $this->pushEvent('debit-1', 'funds_available');
        app(PlaidAchService::class)->syncEvents();

        $this->assertDatabaseHas('plaid_transfers', ['debit_transfer_id' => 'debit-1', 'status' => PlaidTransfer::STATUS_SETTLED, 'provider_status' => 'funds_available']);
    }

    public function test_tc_f06_transfer_events_webhook_syncs_from_stored_cursor(): void
    {
        PlaidTransferEvent::query()->create(['event_id' => 40, 'event_type' => 'posted', 'matched' => false, 'outcome' => 'unmatched']);

        $this->postJson('/api/v1/plaid/webhook', ['webhook_type' => 'TRANSFER', 'webhook_code' => 'TRANSFER_EVENTS_UPDATE', 'environment' => 'sandbox'])
            ->assertOk();

        $this->assertSame(40, $this->plaid->payloads('/transfer/event/sync')[0]['after_id']);
    }

    public function test_tc_f07_signed_webhook_is_accepted_and_forgeries_are_rejected(): void
    {
        config(['plaid.verify_webhooks' => true]);
        $key = $this->ecKey();
        $this->plaid->on('/webhook_verification_key/get', fn (array $p) => ['key' => $key['jwk'] + ['kid' => $p['key_id']]]);

        $body = json_encode(['webhook_type' => 'ITEM', 'webhook_code' => 'WEBHOOK_UPDATE_ACKNOWLEDGED', 'item_id' => 'nobody']);
        $send = fn (string $jwt, string $payload) => $this->call('POST', '/api/v1/plaid/webhook', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_PLAID_VERIFICATION' => $jwt,
        ], $payload);

        $send($this->signJwt($key, ['iat' => time(), 'request_body_sha256' => hash('sha256', $body)]), $body)->assertOk();
        $send($this->signJwt($key, ['iat' => time(), 'request_body_sha256' => hash('sha256', $body)]), $body.' ')->assertStatus(400);
        $send($this->signJwt($key, ['iat' => time() - 600, 'request_body_sha256' => hash('sha256', $body)]), $body)->assertStatus(400);
        $send($this->signJwt($key, ['iat' => time(), 'request_body_sha256' => hash('sha256', $body)], 'HS256'), $body)->assertStatus(400);
        $send($this->signJwt($this->ecKey(), ['iat' => time(), 'request_body_sha256' => hash('sha256', $body)]), $body)->assertStatus(400);
        $send('', $body)->assertStatus(400);
    }

    public function test_tc_f08_reconcile_command_recovers_a_missed_webhook(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedReadyBanks();
        $billId = $this->sharedBill($community, $resident, 45);
        Sanctum::actingAs($resident);
        $this->payBill($billId)->assertCreated();

        $this->remote['debit-1']['status'] = 'posted';
        $this->artisan('plaid:reconcile', ['--older-than' => 1])->assertSuccessful();

        $this->assertDatabaseHas('plaid_transfers', ['debit_transfer_id' => 'debit-1', 'status' => PlaidTransfer::STATUS_POSTED]);
        $this->assertDatabaseHas('amenity_resident_bills', ['id' => $billId, 'status' => 'paid']);
    }

    // ── G. Cancellation, refunds, returns ─────────────────────────

    public function test_tc_g01_cancelling_a_pending_booking_cancels_the_debit_and_payout(): void
    {
        ['bookingId' => $bookingId, 'resident' => $resident] = $this->bookedByBank();

        Sanctum::actingAs($resident);
        $this->deleteJson("/api/v1/bookings/{$bookingId}")->assertOk();

        $this->assertSame(['debit-1', 'credit-2'], array_column($this->plaid->payloads('/transfer/cancel'), 'transfer_id'));
        $this->assertSame(0, $this->plaid->count('/transfer/refund/create'));
        $this->assertDatabaseHas('plaid_transfers', ['payable_id' => $bookingId, 'status' => PlaidTransfer::STATUS_CANCELLED, 'credit_status' => 'cancelled', 'refund_status' => null]);
        $this->assertDatabaseHas('bookings', ['id' => $bookingId, 'status' => 'cancelled', 'payment_verification_status' => 'rejected', 'ach_status' => 'cancelled']);
    }

    public function test_tc_g02_cancelling_a_posted_booking_requests_a_refund_and_waits_for_plaid(): void
    {
        ['bookingId' => $bookingId, 'resident' => $resident] = $this->bookedByBank();
        $this->pushEvent('debit-1', 'posted');
        app(PlaidAchService::class)->syncEvents();
        $this->assertDatabaseHas('bookings', ['id' => $bookingId, 'payment_verification_status' => 'accepted']);

        Sanctum::actingAs($resident);
        $this->deleteJson("/api/v1/bookings/{$bookingId}")->assertOk();

        $refund = $this->plaid->payloads('/transfer/refund/create');
        $this->assertCount(1, $refund);
        $this->assertSame('40.00', $refund[0]['amount']);
        $this->assertNotEmpty($refund[0]['idempotency_key']);
        $transfer = PlaidTransfer::query()->where('payable_id', $bookingId)->firstOrFail();
        $this->assertSame(PlaidTransfer::STATUS_POSTED, $transfer->status);
        $this->assertSame(PlaidTransfer::REFUND_PENDING, $transfer->refund_status);
        $this->assertNull($transfer->refunded_at);
        $this->assertSame('Refund pending', $transfer->statusLabel());
        $this->assertSame(PlaidTransfer::EXCEPTION_PAYOUT_RECOVERY, $transfer->exception_code);
        $this->assertDatabaseHas('bookings', ['id' => $bookingId, 'ach_status' => 'refund_pending', 'payment_verification_status' => 'rejected']);

        $this->events[] = ['event_id' => count($this->events) + 1, 'event_type' => 'refund.settled', 'transfer_id' => 'debit-1', 'refund_id' => 'refund-1'];
        app(PlaidAchService::class)->syncEvents();

        $this->assertDatabaseHas('plaid_transfers', ['id' => $transfer->id, 'refund_status' => PlaidTransfer::REFUND_SETTLED]);
        $this->assertDatabaseHas('bookings', ['id' => $bookingId, 'ach_status' => 'refunded']);
        $this->assertSame(1, DB::table('app_notifications')->where('user_id', $resident->id)->where('title', 'Refund sent')->count());
    }

    public function test_tc_g03_rejected_refund_is_recorded_not_marked_refunded(): void
    {
        $this->plaid->on('/transfer/refund/create', new PlaidException('Not enough ledger balance', 'INSUFFICIENT_FUNDS', 422, ['path' => '/transfer/refund/create']));
        ['bookingId' => $bookingId, 'resident' => $resident] = $this->bookedByBank();
        $this->pushEvent('debit-1', 'posted');
        app(PlaidAchService::class)->syncEvents();

        Sanctum::actingAs($resident);
        $this->deleteJson("/api/v1/bookings/{$bookingId}")->assertOk();

        $this->assertDatabaseHas('plaid_transfers', [
            'payable_id' => $bookingId,
            'refund_status' => PlaidTransfer::REFUND_FAILED,
            'exception_code' => PlaidTransfer::EXCEPTION_REFUND_FAILED,
            'refunded_at' => null,
        ]);
        $this->assertDatabaseHas('bookings', ['id' => $bookingId, 'ach_status' => 'refund_failed']);
    }

    public function test_tc_g04_refund_cannot_be_requested_twice(): void
    {
        ['bookingId' => $bookingId, 'resident' => $resident] = $this->bookedByBank();
        $this->pushEvent('debit-1', 'posted');
        $ach = app(PlaidAchService::class);
        $ach->syncEvents();
        $transfer = PlaidTransfer::query()->where('payable_id', $bookingId)->firstOrFail();

        $ach->refund($transfer, $resident, 'first');
        try {
            $ach->refund($transfer->fresh(), $resident, 'second');
            $this->fail('A second refund must be refused.');
        } catch (PlaidException $e) {
            $this->assertSame('PLAID_TRANSFER_FAILED', $e->codeKey);
        }

        $this->assertSame(1, $this->plaid->count('/transfer/refund/create'));
    }

    public function test_tc_g05_return_while_refund_pending_is_flagged(): void
    {
        ['bookingId' => $bookingId, 'resident' => $resident] = $this->bookedByBank();
        $this->pushEvent('debit-1', 'posted');
        $ach = app(PlaidAchService::class);
        $ach->syncEvents();
        $ach->refund(PlaidTransfer::query()->where('payable_id', $bookingId)->firstOrFail(), $resident, 'cancelled');

        $this->pushEvent('debit-1', 'returned', ['failure_code' => 'R10', 'description' => 'Unauthorized']);
        $ach->syncEvents();

        $this->assertDatabaseHas('plaid_transfers', [
            'payable_id' => $bookingId,
            'status' => PlaidTransfer::STATUS_RETURNED,
            'refund_status' => PlaidTransfer::REFUND_PENDING,
            'exception_code' => PlaidTransfer::EXCEPTION_RETURN_AFTER_REFUND,
        ]);
    }

    public function test_tc_g06_bank_payment_on_a_bill_already_paid_another_way_is_flagged_as_duplicate(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedReadyBanks();
        $billId = $this->sharedBill($community, $resident, 45);
        Sanctum::actingAs($resident);
        $this->payBill($billId)->assertCreated();

        DB::table('amenity_resident_bills')->where('id', $billId)->update(['status' => 'paid', 'payment_method' => 'proof', 'plaid_transfer_id' => null]);
        $this->pushEvent('debit-1', 'posted');
        app(PlaidAchService::class)->syncEvents();

        $this->assertDatabaseHas('amenity_resident_bills', ['id' => $billId, 'status' => 'paid', 'payment_method' => 'proof']);
        $this->assertDatabaseHas('plaid_transfers', ['debit_transfer_id' => 'debit-1', 'exception_code' => PlaidTransfer::EXCEPTION_DUPLICATE_COLLECTION]);
    }

    public function test_tc_g07_return_does_not_reopen_a_bill_covered_by_another_payment(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedReadyBanks();
        $billId = $this->sharedBill($community, $resident, 45);
        Sanctum::actingAs($resident);
        $this->payBill($billId)->assertCreated();
        $this->pushEvent('debit-1', 'posted');
        app(PlaidAchService::class)->syncEvents();

        $other = $this->transferRow($community, $resident, PlaidTransfer::PAYABLE_SHARED_BILL, $billId, ['status' => PlaidTransfer::STATUS_SETTLED, 'debit_transfer_id' => 'debit-other']);
        DB::table('amenity_resident_bills')->where('id', $billId)->update(['plaid_transfer_id' => $other->id]);

        $this->pushEvent('debit-1', 'returned', ['failure_code' => 'R01']);
        app(PlaidAchService::class)->syncEvents();

        $this->assertDatabaseHas('amenity_resident_bills', ['id' => $billId, 'status' => 'paid', 'plaid_transfer_id' => $other->id]);
    }

    // ── B. Community bank linking ─────────────────────────────────

    public function test_tc_b01_failed_replace_keeps_the_working_community_bank(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedReadyBanks();
        $service = $this->partialPlaidService();
        $service->shouldReceive('exchangePublicToken')->andThrow(PlaidException::exchangeFailed('This Plaid connection link expired or is invalid.'));
        $service->shouldNotReceive('removeItemQuietly');

        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/plaid/exchange-token', ['public_token' => 'public-sandbox-bad', 'replace' => true])->assertStatus(422);

        $bank = CommunityPlaidConnection::query()->where('community_id', $community->id)->firstOrFail();
        $this->assertSame(CommunityPlaidConnection::STATUS_CONNECTED, $bank->status);
        $this->assertSame('access-community', $bank->plaid_access_token);
    }

    public function test_tc_b02_replace_clears_stale_payout_token_and_audits_masks(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedReadyBanks();
        CommunityPlaidConnection::query()->where('community_id', $community->id)->first()
            ->forceFill(['transfer_access_token' => 'access-old-migrated', 'transfer_account_id' => 'acc-old'])->save();

        $service = $this->partialPlaidService();
        $service->shouldReceive('exchangePublicToken')->andReturn(['access_token' => 'access-new', 'item_id' => 'item-new']);
        $service->shouldReceive('resolveInstitution')->andReturn(['institution_id' => 'ins_new', 'institution_name' => 'New Bank']);
        $service->shouldReceive('resolveSelectedAccount')->andReturn([
            'account_id' => 'acc-new', 'account_name' => 'Operating 2', 'account_official_name' => null,
            'account_type' => 'depository', 'account_subtype' => 'checking', 'account_mask' => '7777',
        ]);
        $service->shouldReceive('fetchAchNumbers')->andReturn(['account' => null, 'routing' => null]);
        $service->shouldReceive('removeItemQuietly')->once()->with('access-community');

        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/plaid/exchange-token', ['public_token' => 'public-sandbox-new', 'replace' => true, 'reason' => 'Bank changed after audit'])
            ->assertOk()
            ->assertJsonMissingPath('data.plaid_access_token');

        $bank = CommunityPlaidConnection::query()->where('community_id', $community->id)->firstOrFail();
        $this->assertNull($bank->transfer_access_token);
        $this->assertSame('7777', $bank->account_mask);

        $log = DB::table('activity_logs')->where('action', 'plaid_bank_replaced')->first();
        $this->assertNotNull($log);
        $encoded = json_encode($log);
        $this->assertStringContainsString('4321', $encoded);
        $this->assertStringContainsString('7777', $encoded);
        $this->assertStringContainsString('Bank changed after audit', $encoded);
        $this->assertStringNotContainsString('access-new', $encoded);
    }

    public function test_tc_b03_moderator_cannot_change_the_payout_account(): void
    {
        ['community' => $community] = $this->seedReadyBanks();
        $moderator = User::factory()->create(['role' => 'community_admin', 'community_admin_status' => 'approved', 'status' => 'active']);
        CommunityMembership::query()->create(['user_id' => $moderator->id, 'community_id' => $community->id, 'role' => 'moderator', 'status' => 'approved']);

        Sanctum::actingAs($moderator);
        $this->getJson('/api/v1/plaid/connection')->assertOk();
        $this->postJson('/api/v1/plaid/link-token')->assertForbidden();
        $this->postJson('/api/v1/plaid/exchange-token', ['public_token' => 'public-x', 'replace' => true])->assertForbidden();
        $this->postJson('/api/v1/plaid/disconnect')->assertForbidden();

        $this->assertDatabaseHas('community_plaid_connections', ['community_id' => $community->id, 'status' => 'connected']);
    }

    // ── A / I. System Admin and security ──────────────────────────

    public function test_tc_i01_system_admin_plaid_endpoints_are_system_admin_only(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedReadyBanks();
        $this->getJson('/api/v1/admin/plaid/overview')->assertUnauthorized();

        foreach ([$admin, $resident] as $user) {
            Sanctum::actingAs($user);
            $this->getJson('/api/v1/admin/plaid/overview')->assertForbidden();
            $this->getJson('/api/v1/admin/plaid/transfers')->assertForbidden();
            $this->postJson('/api/v1/admin/plaid/sync-events')->assertForbidden();
            $this->patchJson('/api/v1/admin/plaid/communities/1/payments', ['enabled' => false, 'reason' => 'attempt'])->assertForbidden();
        }
    }

    public function test_tc_i02_overview_reports_health_and_readiness_without_secrets(): void
    {
        ['community' => $community] = $this->seedReadyBanks();
        CommunityPlaidConnection::query()->where('community_id', $community->id)->update(['ach_account' => encrypt('1111222233334444', false), 'ach_routing' => encrypt('011401533', false)]);

        Sanctum::actingAs($this->systemAdmin());
        $response = $this->getJson('/api/v1/admin/plaid/overview')
            ->assertOk()
            ->assertJsonPath('data.config.environment', 'sandbox')
            ->assertJsonPath('data.config.secret_set', true)
            ->assertJsonPath('data.config.simulated', false);

        $row = collect($response->json('data.communities'))->firstWhere('id', $community->id);
        $this->assertTrue($row['ready']);
        $this->assertSame('connected', $row['bank']['status']);

        $body = $response->getContent();
        foreach (['test-secret', 'test-client', 'access-community', '1111222233334444', '011401533'] as $secret) {
            $this->assertStringNotContainsString($secret, $body);
        }
    }

    public function test_tc_i03_pause_requires_a_reason_and_is_audited(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedReadyBanks();
        $sysAdmin = $this->systemAdmin();

        Sanctum::actingAs($sysAdmin);
        $this->patchJson("/api/v1/admin/plaid/communities/{$community->id}/payments", ['enabled' => false])->assertStatus(422);
        $this->patchJson("/api/v1/admin/plaid/communities/{$community->id}/payments", ['enabled' => false, 'reason' => 'Payout account under review'])
            ->assertOk()
            ->assertJsonPath('data.readiness.reason', 'paused');
        $this->assertDatabaseHas('activity_logs', ['action' => 'plaid_admin_payments_paused', 'user_id' => $sysAdmin->id]);

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/plaid/resident/capability')->assertJsonPath('data.can_pay_with_bank', false)->assertJsonPath('data.community.payments_paused', true);

        Sanctum::actingAs($sysAdmin);
        $this->patchJson("/api/v1/admin/plaid/communities/{$community->id}/payments", ['enabled' => true, 'reason' => 'Review complete'])->assertOk();
        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/plaid/resident/capability')->assertJsonPath('data.can_pay_with_bank', true);
    }

    public function test_tc_i04_admin_refresh_and_exception_note_never_change_financial_status(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedReadyBanks();
        $billId = $this->sharedBill($community, $resident, 45);
        Sanctum::actingAs($resident);
        $this->payBill($billId)->assertCreated();
        $transfer = PlaidTransfer::query()->firstOrFail();
        app(PlaidAchService::class)->flagException($transfer, PlaidTransfer::EXCEPTION_PAYOUT_FAILED, 'test');

        Sanctum::actingAs($this->systemAdmin());
        $this->postJson("/api/v1/admin/plaid/transfers/{$transfer->public_id}/refresh")->assertOk()->assertJsonPath('data.status', PlaidTransfer::STATUS_PROCESSING);
        $this->postJson("/api/v1/admin/plaid/transfers/{$transfer->public_id}/resolve-exception", [])->assertStatus(422);
        $this->postJson("/api/v1/admin/plaid/transfers/{$transfer->public_id}/resolve-exception", ['note' => 'Payout sent manually from dashboard'])
            ->assertOk()
            ->assertJsonPath('data.status', PlaidTransfer::STATUS_PROCESSING)
            ->assertJsonPath('data.exception_open', false);

        $this->assertDatabaseHas('amenity_resident_bills', ['id' => $billId, 'status' => 'pending_verification']);
        $this->assertDatabaseHas('activity_logs', ['action' => 'plaid_admin_exception_resolved']);
    }

    public function test_tc_i05_transfer_search_by_provider_reference_and_community(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedReadyBanks();
        $billId = $this->sharedBill($community, $resident, 45);
        Sanctum::actingAs($resident);
        $this->payBill($billId)->assertCreated();
        ['community' => $other, 'resident' => $otherResident] = $this->seedReadyBanks();
        $this->transferRow($other, $otherResident, PlaidTransfer::PAYABLE_SHARED_BILL, 999, ['debit_transfer_id' => 'debit-elsewhere']);

        Sanctum::actingAs($this->systemAdmin());
        $this->getJson('/api/v1/admin/plaid/transfers?search=debit-1')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.debit_transfer_id', 'debit-1');
        $this->getJson('/api/v1/admin/plaid/transfers?community_id='.$other->id)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.community_id', $other->id);
        $this->getJson('/api/v1/admin/plaid/transfers?status=pending')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_tc_i06_community_with_payment_history_cannot_be_deleted(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedReadyBanks();
        $this->transferRow($community, $resident, PlaidTransfer::PAYABLE_SHARED_BILL, 1, ['status' => PlaidTransfer::STATUS_SETTLED]);

        Sanctum::actingAs($this->systemAdmin());
        $this->deleteJson("/api/v1/admin/communities/{$community->id}")->assertStatus(422);
        $this->assertDatabaseHas('communities', ['id' => $community->id]);
        $this->assertSame(1, PlaidTransfer::query()->where('community_id', $community->id)->count());
    }

    public function test_tc_i07_provider_error_details_are_not_exposed_to_clients(): void
    {
        $this->plaid->on('/transfer/create', new PlaidException('Account is closed', 'INVALID_ACCOUNT', 422, ['path' => '/transfer/create', 'http_status' => 400, 'error_type' => 'TRANSFER_ERROR']));
        ['community' => $community, 'resident' => $resident] = $this->seedReadyBanks();
        $billId = $this->sharedBill($community, $resident, 20);

        Sanctum::actingAs($resident);
        $response = $this->payBill($billId)->assertStatus(422)->assertJsonPath('code', 'INVALID_ACCOUNT');
        $this->assertStringNotContainsString('/transfer/create', $response->getContent());
        $this->assertDatabaseHas('amenity_resident_bills', ['id' => $billId, 'status' => 'unpaid']);
        $this->assertDatabaseHas('plaid_transfers', ['status' => PlaidTransfer::STATUS_FAILED, 'failure_code' => 'INVALID_ACCOUNT']);
    }

    // ── Fixtures ──────────────────────────────────────────────────

    private function livePlaid(): FakePlaidHttp
    {
        $fake = new FakePlaidHttp();
        $counter = 0;

        $fake->on('/transfer/authorization/create', fn (array $p) => [
            'authorization' => ['id' => 'auth-'.$p['type'].'-'.Str::random(4), 'decision' => 'approved', 'decision_rationale' => null],
        ]);
        $fake->on('/transfer/create', function (array $p) use (&$counter) {
            $counter++;
            $id = (str_contains($p['authorization_id'], 'credit') ? 'credit-' : 'debit-').$counter;
            $this->remote[$id] = ['id' => $id, 'status' => 'pending', 'cancellable' => true];

            return ['transfer' => $this->remote[$id]];
        });
        $fake->on('/transfer/get', fn (array $p) => isset($this->remote[$p['transfer_id']])
            ? ['transfer' => $this->remote[$p['transfer_id']]]
            : new PlaidException('not found', 'TRANSFER_NOT_FOUND', 422));
        $fake->on('/transfer/cancel', function (array $p) {
            $this->remote[$p['transfer_id']]['status'] = 'cancelled';

            return ['request_id' => 'req'];
        });
        $fake->on('/transfer/refund/create', fn (array $p) => ['refund' => ['id' => 'refund-1', 'transfer_id' => $p['transfer_id'], 'amount' => $p['amount'], 'status' => 'pending']]);
        $fake->on('/transfer/event/sync', fn (array $p) => [
            'transfer_events' => array_values(array_filter($this->events, fn (array $e) => $e['event_id'] > $p['after_id'])),
            'has_more' => false,
        ]);

        return $fake;
    }

    /**
     * @param  array<string, mixed>  $failure
     */
    private function pushEvent(string $transferId, string $type, array $failure = []): void
    {
        $this->events[] = [
            'event_id' => count($this->events) + 1,
            'event_type' => $type,
            'transfer_id' => $transferId,
            'transfer_type' => str_starts_with($transferId, 'credit') ? 'credit' : 'debit',
            'transfer_amount' => '45.00',
            'failure_reason' => $failure ?: null,
            'refund_id' => null,
            'timestamp' => now()->toIso8601ZuluString(),
        ];
        if (isset($this->remote[$transferId])) {
            $this->remote[$transferId]['status'] = $type;
            $this->remote[$transferId]['cancellable'] = $type === 'pending';
        }
    }

    /**
     * @return array{bookingId: int, resident: User, community: Community}
     */
    private function bookedByBank(): array
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedReadyBanks();
        $amenityId = $this->amenity($community, $admin, 40);

        Sanctum::actingAs($resident);
        $bookingId = (int) $this->postJson('/api/v1/bookings', ['amenity_id' => $amenityId, 'date' => now()->addDays(2)->toDateString(), 'payment_method' => 'bank_ach'])
            ->assertCreated()
            ->json('data.id');

        return ['bookingId' => $bookingId, 'resident' => $resident, 'community' => $community];
    }

    private function payBill(int $billId): \Illuminate\Testing\TestResponse
    {
        $amenityId = (int) DB::table('amenity_resident_bills')->where('id', $billId)->value('amenity_id');

        return $this->postJson('/api/v1/plaid/payments/shared-bill', ['amenity_id' => $amenityId, 'resident_bill_id' => $billId]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function transferRow(Community $community, User $user, string $type, int $payableId, array $overrides = []): PlaidTransfer
    {
        return PlaidTransfer::query()->create(array_merge([
            'public_id' => (string) Str::uuid(),
            'community_id' => $community->id,
            'user_id' => $user->id,
            'purpose' => PlaidTransfer::PURPOSE_SHARED_BILL,
            'payable_type' => $type,
            'payable_id' => $payableId,
            'amount' => 45,
            'currency' => 'USD',
            'status' => PlaidTransfer::STATUS_PROCESSING,
            'idempotency_key' => (string) Str::uuid(),
        ], $overrides));
    }

    private function partialPlaidService(): \Mockery\MockInterface
    {
        $mock = Mockery::mock(PlaidService::class, [app(PlaidEligibilityService::class)])
            ->makePartial()
            ->shouldAllowMockingProtectedMethods();
        $this->app->instance(PlaidService::class, $mock);

        return $mock;
    }

    /**
     * @return array{community: Community, admin: User, resident: User}
     */
    private function seedReadyBanks(): array
    {
        $token = (string) random_int(10000, 99999);
        $region = Region::query()->create(['title' => 'Florida '.$token, 'area' => 'Area '.$token, 'users_label' => '0 users', 'sort_order' => 1, 'status' => 'active']);
        $community = Community::query()->create(['name' => 'Florida Main Street '.$token, 'region_id' => $region->id, 'region' => $region->title, 'status' => 'active', 'review_status' => 'approved']);

        $admin = User::factory()->create(['role' => 'community_admin', 'community_admin_status' => 'approved', 'status' => 'active']);
        CommunityMembership::query()->create(['user_id' => $admin->id, 'community_id' => $community->id, 'role' => 'admin', 'status' => 'approved']);
        $resident = $this->member($community, 'Sarah Resident');

        CommunitySubscription::query()->create([
            'community_id' => $community->id, 'plan_slug' => 'starter', 'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_ACTIVE, 'seat_limit' => 100, 'meta' => ['card_on_file' => true],
        ]);

        CommunityPlaidConnection::query()->create([
            'community_id' => $community->id, 'connected_by_user_id' => $admin->id, 'plaid_item_id' => 'item-community-'.$community->id,
            'plaid_access_token' => 'access-community', 'institution_name' => 'Community Bank', 'account_id' => 'acc-community',
            'account_name' => 'Operating', 'account_mask' => '4321', 'status' => CommunityPlaidConnection::STATUS_CONNECTED,
        ]);
        $this->connectResident($resident, $community);

        return compact('community', 'admin', 'resident');
    }

    private function member(Community $community, string $name): User
    {
        $user = User::factory()->create(['role' => 'resident', 'status' => 'active', 'name' => $name]);
        CommunityMembership::query()->create(['user_id' => $user->id, 'community_id' => $community->id, 'role' => 'member', 'status' => 'approved']);

        return $user;
    }

    private function connectResident(User $resident, Community $community): void
    {
        ResidentPlaidConnection::query()->create([
            'user_id' => $resident->id, 'community_id' => $community->id, 'plaid_item_id' => 'item-resident-'.$resident->id,
            'plaid_access_token' => 'access-resident-'.$resident->id, 'institution_name' => 'Chase', 'account_id' => 'acc-resident',
            'account_name' => 'Checking', 'account_mask' => '9876', 'status' => ResidentPlaidConnection::STATUS_CONNECTED,
        ]);
    }

    private function systemAdmin(): User
    {
        return User::factory()->create(['role' => 'system_admin', 'status' => 'active']);
    }

    private function amenity(Community $community, User $creator, float $fee): int
    {
        return (int) DB::table('amenities')->insertGetId([
            'community_id' => $community->id, 'created_by' => $creator->id, 'name' => 'Resort pool', 'description' => 'Shared pool',
            'status' => 'open', 'review_status' => 'approved', 'capacity' => 10, 'hours' => 'Open access',
            'weekends_available' => true, 'booking_fee' => $fee, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function sharedBill(Community $community, User $resident, float $amount): int
    {
        $amenityId = (int) DB::table('amenities')->insertGetId([
            'community_id' => $community->id, 'created_by' => $resident->id, 'name' => 'Fitness center', 'description' => 'Shared gym',
            'status' => 'open', 'review_status' => 'approved', 'capacity' => 10, 'hours' => 'Open access',
            'weekends_available' => true, 'booking_fee' => 0, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $monthlyId = DB::table('amenity_monthly_bills')->insertGetId([
            'amenity_id' => $amenityId, 'community_id' => $community->id, 'billing_month' => now()->startOfMonth()->toDateString(),
            'title' => 'Gym dues', 'description' => 'Gym dues', 'amount_per_resident' => $amount, 'due_date' => now()->addDays(10)->toDateString(),
            'status' => 'published', 'published_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);

        return (int) DB::table('amenity_resident_bills')->insertGetId([
            'monthly_bill_id' => $monthlyId, 'amenity_id' => $amenityId, 'community_id' => $community->id, 'user_id' => $resident->id,
            'amount' => $amount, 'status' => 'unpaid', 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    /**
     * @return array{key: \OpenSSLAsymmetricKey, jwk: array<string, mixed>}
     */
    private function ecKey(): array
    {
        $options = ['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1'];
        $key = @openssl_pkey_new($options);
        foreach ([getenv('OPENSSL_CONF') ?: null, dirname(PHP_BINARY).'/extras/ssl/openssl.cnf', dirname(PHP_BINARY).'/extras/openssl/openssl.cnf'] as $cnf) {
            if ($key !== false || ! $cnf || ! is_file($cnf)) {
                continue;
            }
            $key = @openssl_pkey_new($options + ['config' => $cnf]);
        }
        if ($key === false) {
            $this->markTestSkipped('OpenSSL cannot generate EC keys on this machine.');
        }

        $ec = openssl_pkey_get_details($key)['ec'];
        $b64 = fn (string $raw) => rtrim(strtr(base64_encode(str_pad($raw, 32, "\x00", STR_PAD_LEFT)), '+/', '-_'), '=');

        return ['key' => $key, 'jwk' => ['alg' => 'ES256', 'crv' => 'P-256', 'kty' => 'EC', 'use' => 'sig', 'x' => $b64($ec['x']), 'y' => $b64($ec['y']), 'created_at' => time(), 'expired_at' => null]];
    }

    /**
     * @param  array{key: \OpenSSLAsymmetricKey, jwk: array<string, mixed>}  $key
     * @param  array<string, mixed>  $claims
     */
    private function signJwt(array $key, array $claims, string $alg = 'ES256'): string
    {
        $b64 = fn (string $raw) => rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
        $input = $b64(json_encode(['alg' => $alg, 'kid' => 'kid-1', 'typ' => 'JWT'])).'.'.$b64(json_encode($claims));
        openssl_sign($input, $der, $key['key'], OPENSSL_ALGO_SHA256);

        $pos = 2;
        $raw = '';
        for ($i = 0; $i < 2; $i++) {
            $len = ord($der[$pos + 1]);
            $raw .= str_pad(ltrim(substr($der, $pos + 2, $len), "\x00"), 32, "\x00", STR_PAD_LEFT);
            $pos += 2 + $len;
        }

        return $input.'.'.$b64($raw);
    }
}
