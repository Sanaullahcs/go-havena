<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\PaymentAttempt;
use App\Models\Region;
use App\Models\User;
use App\Models\UtilityBill;
use App\Models\UtilityBiller;
use App\Services\Kuickpay\KuickpayFormat;
use App\Services\Kuickpay\KuickpaySignature;
use App\Services\Kuickpay\UtilityBillerCatalog;
use App\Services\Payments\HavenaConsumerNumber;
use App\Services\UnitAssignmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class KuickpayPaymentsTest extends TestCase
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
            'kuickpay.refresh_throttle_seconds' => 0,
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

    // ─── Routing ─────────────────────────────────────────────────────────────

    public function test_pakistan_community_uses_kuickpay_and_us_community_does_not(): void
    {
        ['resident' => $pk] = $this->seedCommunity('Pakistan - Lahore');
        Sanctum::actingAs($pk);
        $this->getJson('/api/v1/payments/capability')
            ->assertOk()
            ->assertJsonPath('data.provider', 'kuickpay')
            ->assertJsonPath('data.kuickpay.enabled', true)
            ->assertJsonPath('data.kuickpay.test_mode', true)
            ->assertJsonPath('data.kuickpay.methods.0.id', 'easypaisa');

        ['resident' => $us, 'community' => $usCommunity] = $this->seedCommunity('Florida', 2);
        $bill = $this->serviceBill($usCommunity, $us, 5000);
        Sanctum::actingAs($us);
        $this->getJson('/api/v1/payments/capability')
            ->assertOk()
            ->assertJsonPath('data.provider', 'plaid')
            ->assertJsonPath('data.kuickpay.enabled', false);
        $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $bill])
            ->assertStatus(422)
            ->assertJsonPath('code', 'payments_unavailable');
    }

    // ─── Havena service bills ────────────────────────────────────────────────

    public function test_service_bill_happy_path_marks_paid_only_after_verified_return(): void
    {
        ['community' => $community, 'resident' => $resident, 'admin' => $admin] = $this->seedCommunity('Pakistan - Lahore');
        $billId = $this->serviceBill($community, $resident, 5000);

        Sanctum::actingAs($resident);
        $start = $this->postJson('/api/v1/payments', [
            'payable_type' => 'unit_service_bill',
            'payable_id' => $billId,
            'app_return_url' => 'havena://screens/payment-result',
        ])->assertCreated()
            ->assertJsonPath('data.outcome', 'redirect')
            ->assertJsonPath('data.payment.status', 'awaiting_payment')
            ->assertJsonPath('data.payment.amount', 5000)
            ->json('data');

        $this->assertDatabaseHas('unit_service_bills', ['id' => $billId, 'status' => 'unpaid']);

        $returnPath = $this->completeSandbox($start['next_action']['url'], [
            'method' => 'easypaisa',
            'wallet_mobile' => '03001234567',
            'wallet_pin' => '12345',
        ]);
        $this->get($returnPath)->assertOk()->assertSee('havena://screens/payment-result?id='.$start['payment']['id'], false);

        $this->assertDatabaseHas('unit_service_bills', [
            'id' => $billId,
            'status' => 'paid',
            'payment_method' => 'kuickpay',
            'payment_reference' => $start['payment']['reference'],
        ]);
        $this->assertDatabaseHas('payment_attempts', [
            'public_id' => $start['payment']['id'],
            'status' => PaymentAttempt::STATUS_SUCCEEDED,
            'method' => 'easypaisa',
            'active_lock' => null,
        ]);
        $this->assertDatabaseHas('app_notifications', ['user_id' => $resident->id, 'title' => 'Payment successful']);
        $this->assertDatabaseHas('app_notifications', ['user_id' => $admin->id, 'title' => 'Payment received']);

        $this->getJson('/api/v1/payments/'.$start['payment']['id'])
            ->assertOk()
            ->assertJsonPath('data.status', 'succeeded')
            ->assertJsonPath('data.receipt.method_label', 'Easypaisa')
            ->assertJsonPath('data.is_final', true);

        $bill = collect($this->getJson('/api/v1/service-bills')->assertOk()->json('data'))->firstWhere('id', $billId);
        $this->assertSame('paid', $bill['status']);
        $this->assertSame('succeeded', $bill['online_payment']['last_payment']['status']);
        $this->assertNull($bill['online_payment']['active_payment']);

        // Paying a settled bill never creates a new charge.
        $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])
            ->assertOk()
            ->assertJsonPath('data.outcome', 'already_paid');
        $this->assertSame(1, PaymentAttempt::query()->count());
    }

    public function test_double_tap_resumes_the_same_checkout(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunity('Pakistan - Lahore');
        $billId = $this->serviceBill($community, $resident, 2500);

        Sanctum::actingAs($resident);
        $first = $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->json('data.payment.id');
        $second = $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])
            ->assertCreated()
            ->assertJsonPath('data.outcome', 'redirect')
            ->json('data.payment.id');

        $this->assertSame($first, $second);
        $this->assertSame(1, PaymentAttempt::query()->count());
        $this->assertDatabaseHas('payment_events', ['event' => 'checkout_resumed']);
    }

    public function test_cancel_and_decline_leave_the_bill_unpaid_and_allow_retry(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunity('Pakistan - Lahore');
        $billId = $this->serviceBill($community, $resident, 3200);
        Sanctum::actingAs($resident);

        $first = $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->json('data');
        $this->get($this->completeSandbox($first['next_action']['url'], ['action' => 'cancel']))->assertOk();
        $this->assertDatabaseHas('payment_attempts', ['public_id' => $first['payment']['id'], 'status' => 'cancelled']);
        $this->assertDatabaseHas('unit_service_bills', ['id' => $billId, 'status' => 'unpaid']);

        $second = $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->json('data');
        $this->assertNotSame($first['payment']['id'], $second['payment']['id']);
        $this->get($this->completeSandbox($second['next_action']['url'], [
            'method' => 'jazzcash',
            'wallet_mobile' => '03001230000',
            'wallet_pin' => '1234',
        ]))->assertOk();
        $this->getJson('/api/v1/payments/'.$second['payment']['id'])
            ->assertJsonPath('data.status', 'failed')
            ->assertJsonPath('data.tone', 'danger');
        $this->assertDatabaseHas('unit_service_bills', ['id' => $billId, 'status' => 'unpaid']);
    }

    public function test_forged_and_replayed_returns_do_not_change_state(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunity('Pakistan - Lahore');
        $billId = $this->serviceBill($community, $resident, 4100);
        Sanctum::actingAs($resident);
        $start = $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->json('data');
        $attempt = PaymentAttempt::query()->where('public_id', $start['payment']['id'])->firstOrFail();

        $forged = [
            'orderid' => $attempt->provider_order_id,
            'transactionid' => 'FAKE1',
            'amount' => '4100.00',
            'status' => 'SUCCESS',
            'responsecode' => '00',
            'signature' => str_repeat('a', 64),
        ];
        $this->get('/api/v1/payments/kuickpay/return/'.$attempt->public_id.'?'.http_build_query($forged))->assertOk();
        $this->assertDatabaseHas('payment_attempts', ['id' => $attempt->id, 'status' => 'awaiting_authorization']);
        $this->assertDatabaseHas('payment_events', ['payment_attempt_id' => $attempt->id, 'event' => 'return_signature_invalid']);
        $this->assertDatabaseHas('unit_service_bills', ['id' => $billId, 'status' => 'unpaid']);

        // A correctly signed return for a different amount is held for review, never settled.
        $wrongAmount = ['orderid' => $attempt->provider_order_id, 'transactionid' => 'KP1', 'amount' => '10.00', 'status' => 'SUCCESS', 'responsecode' => '00'];
        $wrongAmount['signature'] = KuickpaySignature::forReturn($wrongAmount, (string) config('kuickpay.sandbox_secret'));
        $this->get('/api/v1/payments/kuickpay/return/'.$attempt->public_id.'?'.http_build_query($wrongAmount))->assertOk();
        $attempt->refresh();
        $this->assertSame(PaymentAttempt::STATUS_PENDING_CONFIRMATION, $attempt->status);
        $this->assertTrue($attempt->needs_attention);
        $this->assertDatabaseHas('unit_service_bills', ['id' => $billId, 'status' => 'unpaid']);

        // Replaying it changes nothing.
        $this->get('/api/v1/payments/kuickpay/return/'.$attempt->public_id.'?'.http_build_query($wrongAmount))->assertOk();
        $this->assertDatabaseHas('payment_events', ['payment_attempt_id' => $attempt->id, 'event' => 'return_replayed']);
    }

    public function test_other_residents_cannot_see_or_pay_someone_elses_bill(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunity('Pakistan - Lahore');
        $billId = $this->serviceBill($community, $resident, 1500);
        $stranger = $this->addResident($community, 'Stranger', '9Z');

        Sanctum::actingAs($resident);
        $paymentId = $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->json('data.payment.id');

        Sanctum::actingAs($stranger);
        $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])
            ->assertNotFound()
            ->assertJsonPath('code', 'bill_not_found');
        $this->getJson('/api/v1/payments/'.$paymentId)->assertNotFound();
        $this->postJson('/api/v1/payments/'.$paymentId.'/cancel')->assertNotFound();
    }

    public function test_abandoned_checkout_expires_and_proof_upload_is_blocked_while_in_flight(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunity('Pakistan - Lahore');
        $billId = $this->serviceBill($community, $resident, 6000);
        Sanctum::actingAs($resident);

        $paymentId = $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->json('data.payment.id');
        Carbon::setTestNow(now()->addMinutes(31));
        $this->getJson('/api/v1/payments/'.$paymentId)->assertJsonPath('data.status', 'expired');

        $next = $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->assertCreated()->json('data.payment.id');
        $this->assertNotSame($paymentId, $next);

        PaymentAttempt::query()->where('public_id', $next)->update(['status' => PaymentAttempt::STATUS_PENDING_CONFIRMATION]);
        $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])
            ->assertOk()
            ->assertJsonPath('data.outcome', 'processing');
        $this->post("/api/v1/service-bills/{$billId}/proof", [
            'payment_date' => now()->toDateString(),
            'file' => \Illuminate\Http\UploadedFile::fake()->image('receipt.jpg'),
        ], ['Accept' => 'application/json'])->assertStatus(422);
    }

    public function test_amenity_shared_bill_can_be_paid_with_kuickpay(): void
    {
        ['community' => $community, 'resident' => $resident, 'admin' => $admin] = $this->seedCommunity('Pakistan - Lahore');
        $amenityId = (int) DB::table('amenities')->insertGetId([
            'community_id' => $community->id, 'created_by' => $admin->id, 'name' => 'Generator backup', 'description' => 'Shared',
            'status' => 'open', 'review_status' => 'approved', 'capacity' => 0, 'hours' => 'Open access',
            'weekends_available' => true, 'booking_fee' => 0, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $monthlyId = DB::table('amenity_monthly_bills')->insertGetId([
            'amenity_id' => $amenityId, 'community_id' => $community->id, 'billing_month' => '2026-10-01',
            'title' => 'Generator · October', 'description' => 'Fuel share', 'amount_per_resident' => 1800,
            'due_date' => '2026-10-15', 'status' => 'published', 'published_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        $billId = (int) DB::table('amenity_resident_bills')->insertGetId([
            'monthly_bill_id' => $monthlyId, 'amenity_id' => $amenityId, 'community_id' => $community->id,
            'user_id' => $resident->id, 'amount' => 1800, 'status' => 'unpaid', 'created_at' => now(), 'updated_at' => now(),
        ]);

        Sanctum::actingAs($resident);
        $start = $this->postJson('/api/v1/payments', ['payable_type' => 'amenity_resident_bill', 'payable_id' => $billId])->assertCreated()->json('data');
        $this->get($this->completeSandbox($start['next_action']['url'], [
            'method' => 'card', 'card_number' => '4242 4242 4242 4242', 'card_expiry' => '12/30', 'card_cvv' => '123',
        ]))->assertOk();

        $this->assertDatabaseHas('amenity_resident_bills', ['id' => $billId, 'status' => 'paid', 'payment_method' => 'kuickpay']);
        $this->assertDatabaseHas('amenity_resident_bill_reviews', ['resident_bill_id' => $billId, 'action' => 'paid_online']);
    }

    // ─── External utility bills ──────────────────────────────────────────────

    public function test_link_utility_account_validates_and_never_stores_unverified_accounts(): void
    {
        ['resident' => $resident] = $this->seedCommunity('Pakistan - Lahore');
        $lesco = $this->biller('LESCO');
        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/utilities/billers?service_type=gas')
            ->assertOk()
            ->assertJsonFragment(['mnemonic' => 'SNGPL'])
            ->assertJsonMissing(['mnemonic' => 'LESCO']);

        $this->postJson('/api/v1/utilities/accounts', ['utility_biller_id' => $lesco->id, 'reference' => '1234'])
            ->assertStatus(422)->assertJsonValidationErrors('reference');
        $this->postJson('/api/v1/utilities/accounts', ['utility_biller_id' => $lesco->id, 'reference' => '12345678900000'])
            ->assertStatus(422)->assertJsonPath('errors.reference.0', fn ($m) => str_contains($m, 'could not find'));
        $this->postJson('/api/v1/utilities/accounts', ['utility_biller_id' => $lesco->id, 'reference' => '12345678909999'])
            ->assertStatus(422)->assertJsonPath('errors.reference.0', fn ($m) => str_contains($m, 'blocked'));
        $this->assertDatabaseCount('utility_accounts', 0);

        $account = $this->postJson('/api/v1/utilities/accounts', [
            'utility_biller_id' => $lesco->id,
            'reference' => '1234-5678-901234',
            'nickname' => 'Main meter',
        ])->assertCreated()
            ->assertJsonPath('data.masked_reference', '•••• 1234')
            ->assertJsonPath('data.verification_status', 'verified')
            ->assertJsonPath('data.current_bill.status', 'unpaid')
            ->json('data');

        $this->assertNotEmpty($account['consumer_name']);
        $this->assertGreaterThan(0, $account['current_bill']['payable_amount']);
        $this->assertStringNotContainsString('12345678901234', json_encode($account));
        $this->assertStringNotContainsString('12345678901234', (string) DB::table('utility_accounts')->value('reference_encrypted'));

        $this->postJson('/api/v1/utilities/accounts', ['utility_biller_id' => $lesco->id, 'reference' => '12345678901234'])
            ->assertStatus(422)->assertJsonPath('errors.reference.0', 'This account is already linked to your unit.');
    }

    public function test_utility_bill_happy_path_pays_the_biller_after_checkout(): void
    {
        ['resident' => $resident] = $this->seedCommunity('Pakistan - Lahore');
        $bill = $this->linkUtility($resident, 'KE', '0400012345678');

        $start = $this->postJson('/api/v1/payments', [
            'payable_type' => 'utility_bill',
            'payable_id' => $bill['id'],
            'expected_amount_paisa' => $bill['payable_amount_paisa'],
        ])->assertCreated()->json('data');
        $this->get($this->completeSandbox($start['next_action']['url'], [
            'method' => 'bank', 'bank_account' => 'PK36SCBL0000001123456702',
        ]))->assertOk();

        $attempt = PaymentAttempt::query()->where('public_id', $start['payment']['id'])->firstOrFail();
        $this->assertSame(PaymentAttempt::STATUS_SUCCEEDED, $attempt->status);
        $this->assertNotNull($attempt->provider_receipt_id);
        $this->assertDatabaseHas('utility_bills', ['id' => $bill['id'], 'status' => UtilityBill::STATUS_PAID, 'paid_via' => 'havena']);
    }

    public function test_utility_bill_paid_elsewhere_is_synced_without_charging(): void
    {
        ['resident' => $resident] = $this->seedCommunity('Pakistan - Lahore');
        $bill = $this->linkUtility($resident, 'SNGPL', '12345671111');
        $this->assertSame(UtilityBill::STATUS_EXTERNALLY_PAID, $bill['status']);

        $this->postJson('/api/v1/payments', ['payable_type' => 'utility_bill', 'payable_id' => $bill['id']])
            ->assertOk()
            ->assertJsonPath('data.outcome', 'already_paid');
        $this->assertSame(0, PaymentAttempt::query()->count());
    }

    public function test_utility_amount_change_and_late_amount_are_confirmed_before_charging(): void
    {
        ['resident' => $resident] = $this->seedCommunity('Pakistan - Lahore');
        $changing = $this->linkUtility($resident, 'IESCO', '12345678904444');

        $this->postJson('/api/v1/payments', [
            'payable_type' => 'utility_bill',
            'payable_id' => $changing['id'],
            'expected_amount_paisa' => $changing['payable_amount_paisa'],
        ])->assertStatus(409)
            ->assertJsonPath('code', 'amount_changed')
            ->assertJsonPath('meta.amount_paisa', $changing['payable_amount_paisa'] + 12000);
        $this->assertSame(0, PaymentAttempt::query()->count());

        $late = $this->linkUtility($resident, 'FESCO', '12345678902222');
        $this->assertTrue($late['is_past_due']);
        $this->assertSame($late['amount_after_due'], $late['payable_amount']);
    }

    public function test_unknown_biller_outcome_is_reconciled_instead_of_retried(): void
    {
        ['resident' => $resident] = $this->seedCommunity('Pakistan - Lahore');
        $bill = $this->linkUtility($resident, 'LESCO', '12345678903333');
        $start = $this->postJson('/api/v1/payments', ['payable_type' => 'utility_bill', 'payable_id' => $bill['id']])->json('data');
        $this->get($this->completeSandbox($start['next_action']['url'], [
            'method' => 'easypaisa', 'wallet_mobile' => '03211234567', 'wallet_pin' => '12345',
        ]))->assertOk();

        $this->getJson('/api/v1/payments/'.$start['payment']['id'])->assertJsonPath('data.status', 'processing');
        $this->postJson('/api/v1/payments', ['payable_type' => 'utility_bill', 'payable_id' => $bill['id']])
            ->assertOk()
            ->assertJsonPath('data.outcome', 'processing');
        $this->assertDatabaseHas('utility_bills', ['id' => $bill['id'], 'status' => UtilityBill::STATUS_UNPAID]);

        Carbon::setTestNow(now()->addMinutes(2));
        Artisan::call('kuickpay:reconcile');

        $this->getJson('/api/v1/payments/'.$start['payment']['id'])->assertJsonPath('data.status', 'succeeded');
        $this->assertDatabaseHas('utility_bills', ['id' => $bill['id'], 'status' => UtilityBill::STATUS_PAID]);
        $this->assertSame(1, PaymentAttempt::query()->count());
    }

    public function test_biller_rejection_after_charge_goes_to_refund(): void
    {
        ['resident' => $resident, 'admin' => $admin] = $this->seedCommunity('Pakistan - Lahore');
        $bill = $this->linkUtility($resident, 'GEPCO', '12345678905555');
        $start = $this->postJson('/api/v1/payments', ['payable_type' => 'utility_bill', 'payable_id' => $bill['id']])->json('data');
        $this->get($this->completeSandbox($start['next_action']['url'], [
            'method' => 'raast', 'bank_account' => '03001234567',
        ]))->assertOk();

        $this->getJson('/api/v1/payments/'.$start['payment']['id'])->assertJsonPath('data.status', 'refund_pending');
        $this->assertDatabaseHas('utility_bills', ['id' => $bill['id'], 'status' => UtilityBill::STATUS_UNPAID]);
        $this->assertDatabaseHas('app_notifications', ['user_id' => $resident->id, 'title' => 'Payment will be refunded']);

        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/admin/payments?status=attention')
            ->assertOk()
            ->assertJsonPath('data.0.id', $start['payment']['id']);
        $this->postJson('/api/v1/admin/payments/'.$start['payment']['id'].'/refunded', ['note' => 'KuickPay refund KP123'])
            ->assertOk()
            ->assertJsonPath('data.status', 'refunded');
    }

    // ─── KuickPay Institution End-to-End ─────────────────────────────────────

    public function test_institution_inquiry_and_payment_follow_kuickpay_codes(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunity('Pakistan - Lahore');
        $billId = $this->serviceBill($community, $resident, 2500);
        $consumer = HavenaConsumerNumber::encode('unit_service_bill', $billId);
        $headers = ['username' => 'kp-user', 'password' => 'kp-pass'];

        $this->postJson('/api/v1/integrations/kuickpay/bill-inquiry', ['consumer_number' => $consumer], ['username' => 'x', 'password' => 'y'])
            ->assertOk()->assertJsonPath('response_Code', '04');
        $this->postJson('/api/v1/integrations/kuickpay/bill-inquiry', ['consumer_number' => '019991999999999999'], $headers)
            ->assertJsonPath('response_Code', '01')
            ->assertJsonMissingPath('bill_status');

        $this->postJson('/api/v1/integrations/kuickpay/bill-inquiry', ['consumer_number' => $consumer], $headers)
            ->assertJsonPath('response_Code', '00')
            ->assertJsonPath('bill_status', 'U')
            ->assertJsonPath('amount_within_due_date', '0000000250000+')
            ->assertJsonPath('billing_month', '2610')
            ->assertJsonPath('consumer_detail', strtoupper($resident->name));

        $payment = [
            'consumer_number' => $consumer,
            'tran_auth_id' => '123456',
            'paid_amount' => '250000',
            'tran_date' => '20261007',
            'tran_time' => '101500',
            'bank_mnemonic' => 'MCB',
        ];
        $this->postJson('/api/v1/integrations/kuickpay/bill-payment', array_merge($payment, ['paid_amount' => '100']), $headers)
            ->assertJsonPath('response_Code', '04');
        $reference = $this->postJson('/api/v1/integrations/kuickpay/bill-payment', $payment, $headers)
            ->assertJsonPath('response_Code', '00')
            ->json('Identification_parameter');
        $this->assertStringStartsWith('HVN-', $reference);
        $this->assertDatabaseHas('unit_service_bills', ['id' => $billId, 'status' => 'paid', 'payment_method' => 'kuickpay']);

        $this->postJson('/api/v1/integrations/kuickpay/bill-payment', $payment, $headers)
            ->assertJsonPath('response_Code', '03')
            ->assertJsonPath('Identification_parameter', $reference);
        $this->postJson('/api/v1/integrations/kuickpay/bill-inquiry', ['consumer_number' => $consumer], $headers)
            ->assertJsonPath('bill_status', 'P')
            ->assertJsonPath('tran_auth_id', '123456');
        $this->assertSame(1, PaymentAttempt::query()->where('status', 'succeeded')->count());
    }

    public function test_admin_ledger_is_scoped_to_the_admins_community(): void
    {
        ['community' => $community, 'resident' => $resident, 'admin' => $admin] = $this->seedCommunity('Pakistan - Lahore');
        $billId = $this->serviceBill($community, $resident, 900);
        Sanctum::actingAs($resident);
        $start = $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->json('data');
        $this->get($this->completeSandbox($start['next_action']['url'], [
            'method' => 'easypaisa', 'wallet_mobile' => '03001234567', 'wallet_pin' => '1234',
        ]))->assertOk();

        Sanctum::actingAs($admin);
        $this->withHeaders(['X-Community-Id' => (string) $community->id])
            ->getJson('/api/v1/admin/payments/summary')
            ->assertOk()
            ->assertJsonPath('data.collected_this_month', 900)
            ->assertJsonPath('data.collected_count_this_month', 1);
        $this->withHeaders(['X-Community-Id' => (string) $community->id])
            ->getJson('/api/v1/admin/payments/'.$start['payment']['id'])
            ->assertOk()
            ->assertJsonPath('data.status', 'succeeded')
            ->assertJsonPath('data.events.0.event', 'created');

        ['admin' => $otherAdmin, 'community' => $other] = $this->seedCommunity('Pakistan - Karachi', 3);
        Sanctum::actingAs($otherAdmin);
        $this->withHeaders(['X-Community-Id' => (string) $other->id])
            ->getJson('/api/v1/admin/payments/'.$start['payment']['id'])
            ->assertNotFound();
        $this->withHeaders(['X-Community-Id' => (string) $other->id])
            ->getJson('/api/v1/admin/payments')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_formats_handle_both_documented_shapes(): void
    {
        $this->assertSame('0000000250000+', KuickpayFormat::an14(250000));
        $this->assertSame(250000, KuickpayFormat::parsePaisa('0000000250000+'));
        $this->assertSame(25000, KuickpayFormat::parsePaisa('25000'));
        $this->assertSame('2025-06', KuickpayFormat::parseBillingMonth('2506'));
        $this->assertSame('2025-05', KuickpayFormat::parseBillingMonth('0525'));
        $this->assertSame('1250.00', KuickpayFormat::rupees(125000));
        $this->assertSame(
            hash_hmac('sha256', 'COMP001|ORDER-1|1250.00|1250.00|2025-05-06T10:00:00Z', 'key'),
            KuickpaySignature::session('COMP001', 'ORDER-1', '1250.00', '1250.00', '2025-05-06T10:00:00Z', 'key'),
        );
        $consumer = HavenaConsumerNumber::encode('amenity_resident_bill', 42);
        $this->assertSame(18, strlen((string) $consumer));
        $this->assertSame(['amenity_resident_bill', 42], HavenaConsumerNumber::decode((string) $consumer));
    }

    public function test_manual_approval_cannot_settle_a_bill_kuickpay_already_paid(): void
    {
        ['community' => $community, 'resident' => $resident, 'admin' => $admin] = $this->seedCommunity('Pakistan - Lahore');
        $billId = $this->serviceBill($community, $resident, 1500);
        Sanctum::actingAs($resident);
        $start = $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->json('data');
        $this->get($this->completeSandbox($start['next_action']['url'], [
            'method' => 'bank', 'bank_account' => '12345678901234',
        ]))->assertOk();

        DB::table('unit_service_bills')->where('id', $billId)->update(['status' => 'pending_verification']);
        Sanctum::actingAs($admin);
        $this->withHeaders(['X-Community-Id' => (string) $community->id])
            ->patchJson('/api/v1/admin/service-bills/'.$billId.'/approve')
            ->assertStatus(422)
            ->assertJsonPath('errors.bill.0', 'This bill was already paid through KuickPay. Do not approve a second payment.');
        $this->assertSame('pending_verification', DB::table('unit_service_bills')->where('id', $billId)->value('status'));
    }

    public function test_refund_record_does_not_reopen_the_bill_and_cannot_be_repeated(): void
    {
        ['community' => $community, 'resident' => $resident, 'admin' => $admin] = $this->seedCommunity('Pakistan - Lahore');
        $billId = $this->serviceBill($community, $resident, 2200);
        Sanctum::actingAs($resident);
        $start = $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->json('data');
        $this->get($this->completeSandbox($start['next_action']['url'], [
            'method' => 'raast', 'bank_account' => '03001234567',
        ]))->assertOk();
        $case = $this->postJson('/api/v1/payments/'.$start['payment']['id'].'/cases', [
            'kind' => 'refund_request',
            'reason' => 'Charged twice',
        ])->assertCreated()->json('data');

        Sanctum::actingAs($admin);
        $this->withHeaders(['X-Community-Id' => (string) $community->id])
            ->postJson('/api/v1/admin/payments/cases/'.$case['id'].'/resolve', [
                'decision' => 'recorded',
                'note' => 'KuickPay confirmed refund KP-100',
                'reopen_bill' => true,
            ])->assertOk();

        $this->assertSame('paid', DB::table('unit_service_bills')->where('id', $billId)->value('status'));
        $this->assertSame('refunded', PaymentAttempt::query()->where('public_id', $start['payment']['id'])->value('status'));
        $this->withHeaders(['X-Community-Id' => (string) $community->id])
            ->postJson('/api/v1/admin/payments/cases/'.$case['id'].'/resolve', [
                'decision' => 'recorded',
                'note' => 'again',
            ])->assertStatus(422);
    }

    public function test_export_is_scoped_and_reconcile_explains_missing_status_api(): void
    {
        ['community' => $community, 'resident' => $resident, 'admin' => $admin] = $this->seedCommunity('Pakistan - Lahore');
        $billId = $this->serviceBill($community, $resident, 800);
        Sanctum::actingAs($resident);
        $start = $this->postJson('/api/v1/payments', ['payable_type' => 'unit_service_bill', 'payable_id' => $billId])->json('data');
        $reference = $start['payment']['reference'];

        Sanctum::actingAs($admin);
        $this->withHeaders(['X-Community-Id' => (string) $community->id])
            ->postJson('/api/v1/admin/payments/'.$start['payment']['id'].'/reconcile')
            ->assertOk()
            ->assertJsonPath('message', 'KuickPay has not published a checkout status API. This payment stays unpaid until a signed return or an institution payment arrives.');
        $csv = $this->withHeaders(['X-Community-Id' => (string) $community->id])
            ->get('/api/v1/admin/payments/export');
        $csv->assertOk();
        $this->assertStringContainsString($reference, $csv->streamedContent());
        $this->assertStringNotContainsString('kp-pass', $csv->streamedContent());

        ['admin' => $otherAdmin, 'community' => $other] = $this->seedCommunity('Pakistan - Karachi', 4);
        Sanctum::actingAs($otherAdmin);
        $otherCsv = $this->withHeaders(['X-Community-Id' => (string) $other->id])->get('/api/v1/admin/payments/export');
        $this->assertStringNotContainsString($reference, $otherCsv->streamedContent());
    }

    public function test_system_admin_overview_shows_health_without_secrets(): void
    {
        config(['kuickpay.checkout.secured_key' => 'super-secret-key', 'kuickpay.checkout.status_path' => '']);
        ['admin' => $admin] = $this->seedCommunity('Pakistan - Lahore');
        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/admin/kuickpay/overview')->assertForbidden();

        $system = User::factory()->create(['role' => 'system_admin', 'status' => 'active']);
        Sanctum::actingAs($system);
        $response = $this->getJson('/api/v1/admin/kuickpay/overview')->assertOk();
        $response->assertJsonPath('data.checkout_status_api', 'not_published');
        $response->assertJsonPath('data.method_selection', 'hosted_page');
        $response->assertJsonPath('data.credentials.secured_key', true);
        $this->assertStringNotContainsString('super-secret-key', $response->getContent());
    }

    public function test_clarification_returns_the_receipt_to_the_resident(): void
    {
        ['community' => $community, 'resident' => $resident, 'admin' => $admin] = $this->seedCommunity('Pakistan - Lahore');
        $billId = $this->serviceBill($community, $resident, 400);
        DB::table('unit_service_bills')->where('id', $billId)->update(['status' => 'pending_verification']);
        Sanctum::actingAs($admin);
        $this->withHeaders(['X-Community-Id' => (string) $community->id])
            ->patchJson('/api/v1/admin/service-bills/'.$billId.'/clarify', ['message' => 'The amount on the slip is unreadable.'])
            ->assertOk();
        $this->assertSame('rejected', DB::table('unit_service_bills')->where('id', $billId)->value('status'));
        $this->assertSame('clarification_requested', DB::table('unit_service_bill_reviews')->where('bill_id', $billId)->value('action'));
    }

    // ─── helpers ─────────────────────────────────────────────────────────────

    /** Follows launch → sandbox page → submit, returning the signed return path KuickPay would redirect to. */
    private function completeSandbox(string $launchUrl, array $form): string
    {
        $launch = $this->get($this->path($launchUrl))->assertRedirect();
        $sandboxPath = $this->path((string) $launch->headers->get('Location'));
        $this->get($sandboxPath)->assertOk()->assertSee('Secure checkout');

        $submit = $this->post($sandboxPath, $form)->assertRedirect();

        return $this->path((string) $submit->headers->get('Location'));
    }

    private function path(string $url): string
    {
        $parts = parse_url($url);

        return ($parts['path'] ?? '/').(isset($parts['query']) ? '?'.$parts['query'] : '');
    }

    /** @return array<string, mixed> */
    private function linkUtility(User $resident, string $mnemonic, string $reference): array
    {
        Sanctum::actingAs($resident);

        return $this->postJson('/api/v1/utilities/accounts', [
            'utility_biller_id' => $this->biller($mnemonic)->id,
            'reference' => $reference,
        ])->assertCreated()->json('data.current_bill');
    }

    private function biller(string $mnemonic): UtilityBiller
    {
        UtilityBillerCatalog::ensureSeeded();

        return UtilityBiller::query()->where('mnemonic', $mnemonic)->firstOrFail();
    }

    private function serviceBill(Community $community, User $resident, float $amount): int
    {
        $unitId = (int) DB::table('unit_residents')->where('user_id', $resident->id)->value('unit_id');
        $serviceId = DB::table('property_services')->insertGetId([
            'community_id' => $community->id, 'name' => 'Maintenance', 'category' => 'other', 'status' => 'active',
            'application_type' => 'automatic', 'billing_frequency' => 'monthly', 'amount_type' => 'fixed',
            'amount' => $amount, 'due_day' => 15, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return (int) DB::table('unit_service_bills')->insertGetId([
            'community_id' => $community->id, 'service_id' => $serviceId, 'unit_id' => $unitId,
            'billing_contact_user_id' => $resident->id, 'billing_period' => '2026-10-01',
            'title' => 'Maintenance — October 2026', 'amount' => $amount, 'due_date' => '2026-10-15',
            'status' => 'unpaid', 'require_acknowledgement' => false, 'require_payment_proof' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    /** @return array{community: Community, admin: User, resident: User} */
    private function seedCommunity(string $regionTitle, int $seed = 1): array
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
            'phone' => '+92300100'.str_pad((string) $seed, 4, '0', STR_PAD_LEFT),
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
            'phone' => '+92300'.random_int(1000000, 9999999),
        ]);
        $user->profile()->updateOrCreate(['user_id' => $user->id], [
            'display_name' => $name, 'unit_number' => $unit, 'residence_type' => 'homeowner',
        ]);
        CommunityMembership::query()->create(['user_id' => $user->id, 'community_id' => $community->id, 'role' => 'member', 'status' => 'approved']);
        app(UnitAssignmentService::class)->syncUserToCommunity($user->fresh('profile'), $community->id);

        return $user;
    }
}
