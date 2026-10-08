<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\PaymentAttempt;
use App\Models\Region;
use App\Models\User;
use App\Services\Kuickpay\KuickpaySignature;
use App\Services\Payments\HavenaConsumerNumber;
use App\Services\Payments\PayableResolver;
use App\Services\Payments\PaymentOrchestrator;
use App\Services\UnitAssignmentService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Review pass over the KuickPay integration (docs/payments/kuickpay-test-cases.md).
 * Each test name carries its test-matrix ID. All provider traffic here is the
 * built-in sandbox simulator (mock), never the real KuickPay sandbox.
 */
class KuickpayPaymentsReviewTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-10-07 10:00:00'));
        config([
            'kuickpay.mode' => 'sandbox',
            'kuickpay.enabled' => true,
            'kuickpay.public_api_url' => 'http://localhost',
            'kuickpay.web_url' => 'http://localhost:3000',
            'kuickpay.institution.username' => 'kp-user',
            'kuickpay.institution.password' => 'kp-pass',
            'kuickpay.institution.prefix' => '01999',
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // ─── Security / configuration ────────────────────────────────────────────

    public function test_tc_c13_sandbox_is_refused_when_app_env_is_production(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunity();
        $billId = $this->serviceBill($community, $resident, 3000);

        $this->app['env'] = 'production';
        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/payments/capability')
            ->assertOk()
            ->assertJsonPath('data.provider', null)
            ->assertJsonPath('data.kuickpay.enabled', false);
        $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])
            ->assertStatus(422)
            ->assertJsonPath('code', 'payments_unavailable');
        $this->get('/api/v1/payments/kuickpay/sandbox/'.Str::uuid())->assertNotFound();

        config(['kuickpay.allow_sandbox_in_production' => true]);
        $this->getJson('/api/v1/payments/capability')->assertJsonPath('data.provider', 'kuickpay');
    }

    public function test_tc_c06_client_supplied_amount_is_ignored(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunity();
        $billId = $this->serviceBill($community, $resident, 5000);

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/payments', [
            'payable_type' => 'unit_service_bill',
            'payable_id' => $billId,
            'amount' => 1,
            'amount_paisa' => 100,
        ])->assertCreated()->assertJsonPath('data.payment.amount_paisa', 500000);

        $this->postJson('/api/v1/payments', [
            'payable_type' => 'unit_service_bill',
            'payable_id' => $billId,
            'expected_amount_paisa' => 100,
        ])->assertStatus(409)->assertJsonPath('code', 'amount_changed')->assertJsonPath('meta.amount_paisa', 500000);
    }

    public function test_tc_b04_cross_community_resident_cannot_pay_or_spoof_community(): void
    {
        ['community' => $a, 'resident' => $resident] = $this->seedCommunity(1);
        $billId = $this->serviceBill($a, $resident, 2000);
        ['community' => $b, 'resident' => $outsider] = $this->seedCommunity(2, 'Pakistan - Karachi');

        Sanctum::actingAs($outsider);
        $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])
            ->assertNotFound();
        $this->getJson('/api/v1/payments?community_id='.$a->id)->assertStatus(422);
        $this->getJson('/api/v1/payments/capability?community_id='.$a->id)->assertStatus(422);
        $this->assertSame(0, PaymentAttempt::query()->count());
    }

    public function test_tc_b05_resident_cannot_pay_another_residents_amenity_bill(): void
    {
        ['community' => $community, 'resident' => $owner, 'admin' => $admin] = $this->seedCommunity();
        $neighbour = $this->addResident($community, 'Neighbour', 'B-202');
        $billId = $this->amenityBill($community, $admin, $owner, 1800);

        Sanctum::actingAs($neighbour);
        $this->postJson('/api/v1/payments', ['payable_type' => 'amenity_resident_bill', 'payable_id' => $billId])
            ->assertNotFound()
            ->assertJsonPath('code', 'bill_not_found');
        $this->postJson('/api/v1/payments', ['payable_type' => 'not_a_type', 'payable_id' => $billId])->assertStatus(422);
    }

    // ─── Callbacks / returns ─────────────────────────────────────────────────

    public function test_tc_d03_unknown_reference_and_malformed_return_change_nothing(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunity();
        $billId = $this->serviceBill($community, $resident, 4100);
        Sanctum::actingAs($resident);
        $paymentId = $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->json('data.payment.id');

        $this->get('/api/v1/payments/kuickpay/return/'.Str::uuid().'?status=SUCCESS')->assertNotFound();
        $this->get('/api/v1/payments/kuickpay/return/'.$paymentId.'?status=SUCCESS&responsecode=00')->assertOk();
        $this->get('/api/v1/payments/kuickpay/return/not-a-uuid')->assertNotFound();

        $this->assertDatabaseHas('payment_attempts', ['public_id' => $paymentId, 'status' => 'awaiting_authorization']);
        $this->assertDatabaseHas('payment_events', ['event' => 'return_order_mismatch']);
        $this->assertDatabaseHas('unit_service_bills', ['id' => $billId, 'status' => 'unpaid']);
    }

    public function test_tc_d05_signed_unsupported_status_is_held_as_uncertain(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunity();
        $billId = $this->serviceBill($community, $resident, 1200);
        Sanctum::actingAs($resident);
        $paymentId = $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->json('data.payment.id');
        $attempt = PaymentAttempt::query()->where('public_id', $paymentId)->firstOrFail();

        $this->signedReturn($attempt, 'PROCESSING', '09', '1200.00')->assertOk();

        $this->assertDatabaseHas('payment_attempts', ['id' => $attempt->id, 'status' => 'pending_confirmation']);
        $this->assertDatabaseHas('unit_service_bills', ['id' => $billId, 'status' => 'unpaid']);
        $this->getJson('/api/v1/payments/'.$paymentId)->assertJsonPath('data.status', 'processing');
    }

    public function test_tc_d07_out_of_order_success_after_failure_still_settles_the_bill(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunity();
        $billId = $this->serviceBill($community, $resident, 2500);
        Sanctum::actingAs($resident);
        $paymentId = $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->json('data.payment.id');
        $attempt = PaymentAttempt::query()->where('public_id', $paymentId)->firstOrFail();

        $this->signedReturn($attempt, 'FAILED', '51', '2500.00')->assertOk();
        $this->assertDatabaseHas('payment_attempts', ['id' => $attempt->id, 'status' => 'failed']);

        $this->signedReturn($attempt, 'SUCCESS', '00', '2500.00', 'KPLATE1')->assertOk();
        $this->assertDatabaseHas('payment_attempts', ['id' => $attempt->id, 'status' => 'succeeded', 'provider_transaction_id' => 'KPLATE1']);
        $this->assertDatabaseHas('unit_service_bills', ['id' => $billId, 'status' => 'paid']);

        // A failure replayed after success cannot undo it.
        $this->signedReturn($attempt, 'FAILED', '51', '2500.00')->assertOk();
        $this->assertDatabaseHas('payment_attempts', ['id' => $attempt->id, 'status' => 'succeeded']);
    }

    public function test_tc_f05_replayed_success_notifies_exactly_once(): void
    {
        ['community' => $community, 'resident' => $resident, 'admin' => $admin] = $this->seedCommunity();
        $billId = $this->serviceBill($community, $resident, 900);
        Sanctum::actingAs($resident);
        $paymentId = $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->json('data.payment.id');
        $attempt = PaymentAttempt::query()->where('public_id', $paymentId)->firstOrFail();

        $this->signedReturn($attempt, 'SUCCESS', '00', '900.00')->assertOk();
        $this->signedReturn($attempt, 'SUCCESS', '00', '900.00')->assertOk();

        // Regression: a second confirmation path (reconcile/channel) re-entering succeed() used to notify again.
        $succeed = new \ReflectionMethod(PaymentOrchestrator::class, 'succeed');
        $succeed->invoke(app(PaymentOrchestrator::class), $attempt->refresh(), ['source' => 'test']);

        $this->assertSame(1, DB::table('app_notifications')->where('user_id', $resident->id)->where('title', 'Payment successful')->count());
        $this->assertSame(1, DB::table('app_notifications')->where('user_id', $admin->id)->where('title', 'Payment received')->count());
        $this->assertSame(1, DB::table('unit_service_bill_reviews')->where('bill_id', $billId)->where('action', 'paid_online')->count());
    }

    // ─── Consistency / recovery ──────────────────────────────────────────────

    public function test_tc_e01_database_failure_during_settlement_is_recovered_by_reconciliation(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunity();
        $billId = $this->serviceBill($community, $resident, 3300);
        Sanctum::actingAs($resident);
        $paymentId = $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->json('data.payment.id');
        $attempt = PaymentAttempt::query()->where('public_id', $paymentId)->firstOrFail();

        $flaky = new class extends PayableResolver
        {
            public bool $fail = true;

            public function markPaid(PaymentAttempt $attempt): bool
            {
                if ($this->fail) {
                    $this->fail = false;
                    throw new \RuntimeException('simulated database outage');
                }

                return parent::markPaid($attempt);
            }
        };
        $this->app->instance(PayableResolver::class, $flaky);
        $this->withoutExceptionHandling();
        try {
            $this->signedReturn($attempt, 'SUCCESS', '00', '3300.00', 'KPDBFAIL');
            $this->fail('The simulated outage should surface to the return request.');
        } catch (\RuntimeException $e) {
            $this->assertSame('simulated database outage', $e->getMessage());
        }
        $this->withExceptionHandling();

        $this->assertDatabaseHas('payment_attempts', ['id' => $attempt->id, 'status' => 'authorized', 'provider_transaction_id' => 'KPDBFAIL']);
        $this->assertDatabaseHas('unit_service_bills', ['id' => $billId, 'status' => 'unpaid']);
        $this->getJson('/api/v1/payments/'.$paymentId)->assertJsonPath('data.status', 'processing');

        Carbon::setTestNow(now()->addMinutes(2));
        Artisan::call('kuickpay:reconcile');

        $this->assertDatabaseHas('payment_attempts', ['id' => $attempt->id, 'status' => 'succeeded']);
        $this->assertDatabaseHas('unit_service_bills', ['id' => $billId, 'status' => 'paid']);
        $this->assertSame(1, DB::table('app_notifications')->where('user_id', $resident->id)->where('title', 'Payment successful')->count());
    }

    public function test_tc_e04_second_successful_charge_is_recorded_and_flagged_not_discarded(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunity();
        $billId = $this->serviceBill($community, $resident, 1500);
        Sanctum::actingAs($resident);

        $first = PaymentAttempt::query()->where('public_id',
            $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->json('data.payment.id'))->firstOrFail();
        $this->postJson('/api/v1/payments/'.$first->public_id.'/cancel')->assertOk()->assertJsonPath('data.status', 'cancelled');

        $second = PaymentAttempt::query()->where('public_id',
            $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->json('data.payment.id'))->firstOrFail();
        $this->signedReturn($second, 'SUCCESS', '00', '1500.00', 'KPSECOND')->assertOk();
        $this->assertDatabaseHas('unit_service_bills', ['id' => $billId, 'status' => 'paid', 'payment_attempt_id' => $second->id]);

        // The cancelled checkout was actually completed at KuickPay as well.
        $this->signedReturn($first, 'SUCCESS', '00', '1500.00', 'KPFIRST')->assertOk();
        $first->refresh();
        $this->assertSame(PaymentAttempt::STATUS_REFUND_PENDING, $first->status);
        $this->assertTrue($first->needs_attention);
        $this->assertSame('KPFIRST', $first->provider_transaction_id);
        $this->assertSame(1, PaymentAttempt::query()->where('status', 'succeeded')->count());
        $this->assertDatabaseHas('unit_service_bills', ['id' => $billId, 'payment_attempt_id' => $second->id]);
    }

    public function test_tc_e05_success_after_local_expiry_is_applied_when_bill_is_still_unpaid(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunity();
        $billId = $this->serviceBill($community, $resident, 700);
        Sanctum::actingAs($resident);
        $paymentId = $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->json('data.payment.id');
        $attempt = PaymentAttempt::query()->where('public_id', $paymentId)->firstOrFail();

        Carbon::setTestNow(now()->addMinutes(31));
        $this->getJson('/api/v1/payments/'.$paymentId)->assertJsonPath('data.status', 'expired')
            ->assertJsonPath('data.message', fn ($m) => ! str_contains($m, 'not been charged'));

        $this->signedReturn($attempt, 'SUCCESS', '00', '700.00')->assertOk();
        $this->assertDatabaseHas('payment_attempts', ['id' => $attempt->id, 'status' => 'succeeded']);
        $this->assertDatabaseHas('unit_service_bills', ['id' => $billId, 'status' => 'paid']);
    }

    public function test_tc_e07_database_refuses_two_active_attempts_for_one_bill(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunity();
        $billId = $this->serviceBill($community, $resident, 100);
        $row = fn () => [
            'public_id' => (string) Str::uuid(), 'reference' => 'HVN-T-'.Str::upper(Str::random(6)),
            'community_id' => $community->id, 'user_id' => $resident->id, 'payable_type' => 'unit_service_bill',
            'payable_id' => $billId, 'title' => 't', 'amount_paisa' => 10000, 'status' => 'awaiting_authorization',
            'idempotency_key' => (string) Str::uuid(), 'active_lock' => 'unit_service_bill:'.$billId,
        ];

        PaymentAttempt::query()->create($row());
        $this->expectException(QueryException::class);
        PaymentAttempt::query()->create($row());
    }

    // ─── Bill lifecycle / eligibility ────────────────────────────────────────

    public function test_tc_a03_duplicate_bill_for_same_service_unit_period_is_not_created(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();
        $serviceId = $this->createServiceViaApi($admin, $community, ['amount' => 2500]);

        $headers = ['X-Community-Id' => (string) $community->id];
        $this->withHeaders($headers)->post("/api/v1/admin/property-services/{$serviceId}/generate-bills", ['billing_period' => '2026-11'], ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonPath('data.created_count', 1);
        $this->withHeaders($headers)->post("/api/v1/admin/property-services/{$serviceId}/generate-bills", ['billing_period' => '2026-11'], ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonPath('data.created_count', 0);
        $this->assertSame(1, DB::table('unit_service_bills')->where('service_id', $serviceId)->where('billing_period', '2026-11-01')->count());
    }

    public function test_tc_a05_amount_boundaries_and_rounding(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();
        Sanctum::actingAs($admin);
        $headers = ['X-Community-Id' => (string) $community->id];
        $base = ['name' => 'Water', 'category' => 'water', 'application_type' => 'automatic', 'due_day' => 10, 'first_billing_month' => '2026-12'];

        foreach ([0, -5, 1000000, 'abc'] as $bad) {
            $this->withHeaders($headers)->postJson('/api/v1/admin/property-services', $base + ['amount' => $bad])
                ->assertStatus(422)->assertJsonValidationErrors('amount');
        }

        $serviceId = $this->withHeaders($headers)->postJson('/api/v1/admin/property-services', $base + ['amount' => 1234.567])
            ->assertCreated()->json('data.id');
        $this->assertSame('1234.57', (string) DB::table('property_services')->where('id', $serviceId)->value('amount'));
    }

    public function test_tc_a08_zero_amount_bill_cannot_be_paid(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunity();
        $billId = $this->serviceBill($community, $resident, 0);
        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])
            ->assertStatus(422)->assertJsonPath('code', 'nothing_due');
    }

    public function test_tc_a09_vacant_unit_bill_is_hidden_then_assigned_to_the_first_resident(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $existing] = $this->seedCommunity();
        $units = app(UnitAssignmentService::class);
        $vacantId = (int) $units->createUnit($community->id, 'C-303')->id;
        $serviceId = $this->createServiceViaApi($admin, $community, ['amount' => 1000, 'first_billing_month' => '2026-10']);

        $vacantBill = DB::table('unit_service_bills')->where('service_id', $serviceId)->where('unit_id', $vacantId)->first();
        $this->assertNotNull($vacantBill, 'Current behaviour: automatic bills are generated for vacant units.');
        $this->assertNull($vacantBill->billing_contact_user_id);

        Sanctum::actingAs($existing);
        $this->assertFalse(collect($this->getJson('/api/v1/service-bills')->json('data'))->contains('id', $vacantBill->id));
        $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $vacantBill->id])->assertNotFound();

        $newcomer = $this->addResident($community, 'New Tenant', 'C-303');
        Sanctum::actingAs($newcomer);
        $this->assertTrue(
            collect($this->getJson('/api/v1/service-bills')->json('data'))->contains('id', $vacantBill->id),
            'Current behaviour: the vacancy bill is deferred to the first billing contact.',
        );
        $this->assertSame($vacantId, (int) $units->findActiveUnitForUser($newcomer->id, $community->id)->id);
    }

    public function test_tc_a11_move_out_does_not_expose_previous_residents_proof_or_payment(): void
    {
        Storage::fake('public');
        ['community' => $community, 'resident' => $alice] = $this->seedCommunity();
        $units = app(UnitAssignmentService::class);
        $pendingId = $this->serviceBill($community, $alice, 4000, '2026-09-01');
        $rejectedId = $this->serviceBill($community, $alice, 4000, '2026-10-01');
        $inflightId = $this->serviceBill($community, $alice, 4000, '2026-11-01');

        Sanctum::actingAs($alice);
        $this->post("/api/v1/service-bills/{$pendingId}/proof", [
            'payment_date' => '2026-10-06', 'payment_reference' => 'ALICE-BANK-REF',
            'file' => UploadedFile::fake()->image('alice.jpg'),
        ], ['Accept' => 'application/json'])->assertOk();
        DB::table('unit_service_bills')->where('id', $rejectedId)->update([
            'status' => 'rejected', 'proof_file_path' => 'proofs/alice-old.jpg', 'payment_reference' => 'ALICE-OLD', 'rejection_reason' => 'Unclear',
        ]);
        $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $inflightId])->assertCreated();
        PaymentAttempt::query()->where('payable_id', $inflightId)->update(['status' => PaymentAttempt::STATUS_PENDING_CONFIRMATION]);

        $unitNumber = (string) DB::table('units')->where('id', DB::table('unit_service_bills')->where('id', $pendingId)->value('unit_id'))->value('unit_number');
        $units->assignUserToUnitNumber($community->id, $alice->id, 'Z-999');
        $bob = $this->addResident($community, 'Bob Next', $unitNumber);

        Sanctum::actingAs($bob);
        $bobBills = collect($this->getJson('/api/v1/service-bills')->assertOk()->json('data'))->keyBy('id');

        $this->assertFalse($bobBills->has($pendingId), "Alice's proof under review must stay with Alice.");
        $this->assertFalse($bobBills->has($inflightId), "A bill Alice is paying online must stay with Alice.");
        $this->assertTrue($bobBills->has($rejectedId));
        $this->assertNull($bobBills[$rejectedId]['payment_proof']);
        $this->assertSame('unpaid', $bobBills[$rejectedId]['status']);
        $this->assertStringNotContainsString('ALICE', json_encode($bobBills->all()));
        $this->getJson('/api/v1/payments')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_tc_a12_service_with_online_payments_cannot_be_deleted(): void
    {
        ['community' => $community, 'resident' => $resident, 'admin' => $admin] = $this->seedCommunity();
        $billId = $this->serviceBill($community, $resident, 800);
        $serviceId = (int) DB::table('unit_service_bills')->where('id', $billId)->value('service_id');
        Sanctum::actingAs($resident);
        $attempt = PaymentAttempt::query()->where('public_id',
            $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->json('data.payment.id'))->firstOrFail();
        $this->signedReturn($attempt, 'SUCCESS', '00', '800.00')->assertOk();

        Sanctum::actingAs($admin);
        $this->withHeaders(['X-Community-Id' => (string) $community->id])
            ->deleteJson("/api/v1/admin/property-services/{$serviceId}")
            ->assertStatus(422)
            ->assertJsonPath('errors.service.0', 'This service has online payments recorded. Set it to inactive instead of deleting it.');
        $this->assertDatabaseHas('unit_service_bills', ['id' => $billId, 'status' => 'paid']);
    }

    // ─── Receipts, history, refunds ──────────────────────────────────────────

    public function test_tc_f01_receipt_only_after_verified_success_and_only_for_owner_or_admin(): void
    {
        ['community' => $community, 'resident' => $resident, 'admin' => $admin] = $this->seedCommunity();
        $neighbour = $this->addResident($community, 'Neighbour', 'B-202');
        $billId = $this->serviceBill($community, $resident, 2100);
        Sanctum::actingAs($resident);
        $paymentId = $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->json('data.payment.id');
        $attempt = PaymentAttempt::query()->where('public_id', $paymentId)->firstOrFail();

        $this->getJson('/api/v1/payments/'.$paymentId)->assertJsonPath('data.receipt', null);
        $this->signedReturn($attempt, 'SUCCESS', '00', '2100.00', 'KPRCPT')->assertOk();
        $receipt = $this->getJson('/api/v1/payments/'.$paymentId)->assertOk()->json('data.receipt');
        $this->assertSame($attempt->reference, $receipt['reference']);
        $this->assertSame('KPRCPT', $receipt['transaction_id']);
        $this->assertSame($community->name, $receipt['paid_to']);
        $this->assertSame($resident->name, $receipt['payer']);

        Sanctum::actingAs($neighbour);
        $this->getJson('/api/v1/payments/'.$paymentId)->assertNotFound();
        Sanctum::actingAs($admin);
        $this->withHeaders(['X-Community-Id' => (string) $community->id])
            ->getJson('/api/v1/admin/payments/'.$paymentId)->assertOk()->assertJsonPath('data.receipt.transaction_id', 'KPRCPT');
    }

    public function test_tc_f03_history_filters_and_pagination(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunity();
        Sanctum::actingAs($resident);
        foreach ([300, 400, 500] as $i => $amount) {
            $billId = $this->serviceBill($community, $resident, $amount, sprintf('2026-%02d-01', 7 + $i));
            $attempt = PaymentAttempt::query()->where('public_id',
                $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->json('data.payment.id'))->firstOrFail();
            if ($i < 2) {
                $this->signedReturn($attempt, 'SUCCESS', '00', number_format($amount, 2, '.', ''))->assertOk();
            }
        }

        $this->getJson('/api/v1/payments')->assertJsonCount(3, 'data')->assertJsonPath('meta.paid_this_month', 700);
        $this->getJson('/api/v1/payments?status=succeeded')->assertJsonCount(2, 'data');
        $this->getJson('/api/v1/payments?status=pending')->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/payments?per_page=5&page=2')->assertJsonCount(0, 'data')->assertJsonPath('meta.total', 3);
    }

    public function test_tc_g02_refund_can_only_be_recorded_for_refund_pending_payments(): void
    {
        ['community' => $community, 'resident' => $resident, 'admin' => $admin] = $this->seedCommunity();
        $billId = $this->serviceBill($community, $resident, 600);
        Sanctum::actingAs($resident);
        $attempt = PaymentAttempt::query()->where('public_id',
            $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->json('data.payment.id'))->firstOrFail();
        $this->signedReturn($attempt, 'SUCCESS', '00', '600.00')->assertOk();

        Sanctum::actingAs($admin);
        $this->withHeaders(['X-Community-Id' => (string) $community->id])
            ->postJson('/api/v1/admin/payments/'.$attempt->public_id.'/refunded')
            ->assertStatus(422)->assertJsonPath('code', 'not_refundable');
        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/admin/payments/'.$attempt->public_id.'/refunded')->assertForbidden();
    }

    // ─── Institution End-to-End ──────────────────────────────────────────────

    public function test_tc_d10_institution_rejects_bad_credentials_and_blocks_bills_with_payment_in_flight(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunity();
        $billId = $this->serviceBill($community, $resident, 2500);
        $consumer = HavenaConsumerNumber::encode('unit_service_bill', $billId);
        $payment = ['consumer_number' => $consumer, 'tran_auth_id' => '654321', 'paid_amount' => '250000', 'tran_date' => '20261007', 'tran_time' => '101500'];

        $this->postJson('/api/v1/integrations/kuickpay/bill-payment', $payment)->assertJsonPath('response_Code', '04');
        $this->postJson('/api/v1/integrations/kuickpay/bill-payment', $payment, ['username' => 'kp-user', 'password' => 'wrong'])->assertJsonPath('response_Code', '04');
        $this->postJson('/api/v1/integrations/kuickpay/bill-payment', array_merge($payment, ['tran_date' => '2026-10-07']), ['username' => 'kp-user', 'password' => 'kp-pass'])
            ->assertJsonPath('response_Code', '04');

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->assertCreated();
        PaymentAttempt::query()->where('payable_id', $billId)->update(['status' => PaymentAttempt::STATUS_PENDING_CONFIRMATION]);

        $headers = ['username' => 'kp-user', 'password' => 'kp-pass'];
        $this->postJson('/api/v1/integrations/kuickpay/bill-inquiry', ['consumer_number' => $consumer], $headers)
            ->assertJsonPath('response_Code', '02')->assertJsonPath('bill_status', 'B');
        $this->postJson('/api/v1/integrations/kuickpay/bill-payment', $payment, $headers)->assertJsonPath('response_Code', '02');
        $this->assertDatabaseHas('unit_service_bills', ['id' => $billId, 'status' => 'unpaid']);
    }

    // ─── helpers ─────────────────────────────────────────────────────────────

    private function signedReturn(PaymentAttempt $attempt, string $status, string $code, string $amount, ?string $transactionId = null)
    {
        $params = [
            'orderid' => (string) $attempt->provider_order_id,
            'transactionid' => $transactionId ?? 'KP'.Str::upper(Str::random(8)),
            'amount' => $amount,
            'status' => $status,
            'responsecode' => $code,
        ];
        $params['signature'] = KuickpaySignature::forReturn($params, (string) config('kuickpay.sandbox_secret'));

        return $this->get('/api/v1/payments/kuickpay/return/'.$attempt->public_id.'?'.http_build_query($params));
    }

    private function createServiceViaApi(User $admin, Community $community, array $overrides = []): int
    {
        Sanctum::actingAs($admin);

        return (int) $this->withHeaders(['X-Community-Id' => (string) $community->id])
            ->postJson('/api/v1/admin/property-services', array_merge([
                'name' => 'Maintenance', 'category' => 'maintenance', 'application_type' => 'automatic',
                'billing_frequency' => 'monthly', 'amount' => 2500, 'due_day' => 15, 'first_billing_month' => '2026-12',
            ], $overrides))
            ->assertCreated()
            ->json('data.id');
    }

    private function serviceBill(Community $community, User $resident, float $amount, string $period = '2026-10-01'): int
    {
        $unitId = (int) DB::table('unit_residents')->where('user_id', $resident->id)->where('status', 'active')->value('unit_id');
        $serviceId = DB::table('property_services')->insertGetId([
            'community_id' => $community->id, 'name' => 'Maintenance', 'category' => 'other', 'status' => 'active',
            'application_type' => 'automatic', 'billing_frequency' => 'monthly', 'amount_type' => 'fixed',
            'amount' => $amount, 'due_day' => 15, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return (int) DB::table('unit_service_bills')->insertGetId([
            'community_id' => $community->id, 'service_id' => $serviceId, 'unit_id' => $unitId,
            'billing_contact_user_id' => $resident->id, 'billing_period' => $period,
            'title' => 'Maintenance — '.$period, 'amount' => $amount, 'due_date' => Carbon::parse($period)->addDays(14)->toDateString(),
            'status' => 'unpaid', 'require_acknowledgement' => false, 'require_payment_proof' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function amenityBill(Community $community, User $admin, User $resident, float $amount): int
    {
        $amenityId = (int) DB::table('amenities')->insertGetId([
            'community_id' => $community->id, 'created_by' => $admin->id, 'name' => 'Generator', 'description' => 'Shared',
            'status' => 'open', 'review_status' => 'approved', 'capacity' => 0, 'hours' => 'Open access',
            'weekends_available' => true, 'booking_fee' => 0, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $monthlyId = DB::table('amenity_monthly_bills')->insertGetId([
            'amenity_id' => $amenityId, 'community_id' => $community->id, 'billing_month' => '2026-10-01',
            'title' => 'Generator · October', 'description' => 'Fuel', 'amount_per_resident' => $amount,
            'due_date' => '2026-10-15', 'status' => 'published', 'published_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);

        return (int) DB::table('amenity_resident_bills')->insertGetId([
            'monthly_bill_id' => $monthlyId, 'amenity_id' => $amenityId, 'community_id' => $community->id,
            'user_id' => $resident->id, 'amount' => $amount, 'status' => 'unpaid', 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    /** @return array{community: Community, admin: User, resident: User} */
    private function seedCommunity(int $seed = 1, string $regionTitle = 'Pakistan - Lahore'): array
    {
        $region = Region::query()->create([
            'title' => $regionTitle.' '.$seed, 'area' => 'Test', 'users_label' => '0 users', 'sort_order' => 1, 'status' => 'active',
        ]);
        $community = Community::query()->create([
            'name' => 'Tower '.$seed, 'region_id' => $region->id, 'region' => $region->title,
            'status' => 'active', 'review_status' => 'approved',
        ]);
        $admin = User::factory()->create([
            'role' => 'community_admin', 'community_admin_status' => 'approved', 'status' => 'active',
            'phone' => '+92300200'.str_pad((string) $seed, 4, '0', STR_PAD_LEFT),
        ]);
        CommunityMembership::query()->create(['user_id' => $admin->id, 'community_id' => $community->id, 'role' => 'admin', 'status' => 'approved']);
        app(UnitAssignmentService::class)->assignUserToUnitNumber($community->id, $admin->id, 'Office', true);

        $resident = $this->addResident($community, 'Zainab Haider', 'A-110'.$seed);

        return compact('community', 'admin', 'resident');
    }

    private function addResident(Community $community, string $name, string $unit): User
    {
        $user = User::factory()->create([
            'role' => 'resident', 'status' => 'active', 'name' => $name,
            'phone' => '+92301'.random_int(1000000, 9999999),
        ]);
        $user->profile()->updateOrCreate(['user_id' => $user->id], [
            'display_name' => $name, 'unit_number' => $unit, 'residence_type' => 'homeowner',
        ]);
        CommunityMembership::query()->create(['user_id' => $user->id, 'community_id' => $community->id, 'role' => 'member', 'status' => 'approved']);
        app(UnitAssignmentService::class)->syncUserToCommunity($user->fresh('profile'), $community->id);

        return $user;
    }
}
