<?php

namespace Tests\Unit;

use App\Models\PaymentAttempt;
use App\Models\UtilityBiller;
use App\Services\Kuickpay\BillInquiryResult;
use App\Services\Kuickpay\BillPaymentResult;
use App\Services\Kuickpay\KuickpayException;
use App\Services\Kuickpay\KuickpayHttpGateway;
use App\Services\Kuickpay\KuickpaySignature;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Live KuickPay client against fixtures copied from developers.kuickpay.com
 * (Checkout Create Session, Bill Initiator V3). Mocked HTTP — no network.
 */
class KuickpayHttpGatewayTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config([
            'kuickpay.mode' => 'uat',
            'kuickpay.checkout.base_url' => 'https://sandbox-api.kuickpay.com',
            'kuickpay.checkout.session_path' => '/checkout/api/session',
            'kuickpay.checkout.company_id' => '01234',
            'kuickpay.checkout.secured_key' => 'secret-key',
            'kuickpay.bill_initiator.base_url' => 'https://sandbox-kpcore.kuickpay.com',
            'kuickpay.bill_initiator.api_key' => 'api-key',
            'kuickpay.bill_initiator.initiator_id' => 'IN123',
        ]);
    }

    public function test_tc_c09_create_session_is_signed_and_parses_documented_response(): void
    {
        $this->fakeOnly(['sandbox-api.kuickpay.com/checkout/api/session' => Http::response(['responseData' => [
            'responseCode' => '00', 'responseDescription' => 'Session started successfully', 'status' => 'success',
            'checkoutToken' => 'eyJ...', 'companyID' => '01234', 'countryCode' => '92', 'defaultGateway' => 'APPSCARD',
            'sessionID' => 'cacaa5d8-f4d7-4ee9-8674-19673618492b',
            'redirectURL' => 'https://uatpayments.kuickpay.com/cardinfo/cacaa5d8-f4d7-4ee9-8674-19673618492b',
        ]])]);

        $session = (new KuickpayHttpGateway)->createCheckoutSession($this->attempt(125000), 'https://apis.gohavena.com/return/x');

        $this->assertSame('cacaa5d8-f4d7-4ee9-8674-19673618492b', $session->sessionId);
        $this->assertStringStartsWith('https://uatpayments.kuickpay.com/', $session->redirectUrl);
        Http::assertSent(function (Request $request) {
            $body = $request->data();
            $expected = KuickpaySignature::session('01234', 'HVN-TEST-1', '1250.00', '1250.00', $body['timestamp'], 'secret-key');

            return $request->hasHeader('Authorization', 'Basic '.base64_encode('01234:secret-key'))
                && $body['amount'] === '1250.00'
                && $body['amountPayable'] === '1250.00'
                && $body['orderid'] === 'HVN-TEST-1'
                && $body['signature'] === $expected
                && ! array_key_exists('method', $body)
                && preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/', $body['timestamp']) === 1;
        });
    }

    public function test_tc_c10_create_session_failures_are_resident_safe(): void
    {
        $cases = [
            'auth' => [Http::response(['message' => 'Unauthorized'], 401), 'payments_unavailable'],
            'malformed' => [Http::response('<html>gateway error</html>', 502), 'checkout_unavailable'],
            'declined' => [Http::response(['responseData' => ['responseCode' => '05', 'responseDescription' => 'x']]), 'checkout_unavailable'],
            'rate_limit' => [Http::response(['message' => 'Too many'], 429), 'checkout_unavailable'],
        ];

        foreach ($cases as $name => [$response, $code]) {
            $this->fakeOnly(['*' => $response]);
            try {
                (new KuickpayHttpGateway)->createCheckoutSession($this->attempt(100000), 'https://x/return');
                $this->fail("{$name}: expected an exception");
            } catch (KuickpayException $e) {
                $this->assertSame($code, $e->codeKey, $name);
                $this->assertStringNotContainsString('secret-key', $e->getMessage());
            }
        }

        $this->fakeOnly(fn () => throw new ConnectionException('timed out'));
        try {
            (new KuickpayHttpGateway)->createCheckoutSession($this->attempt(100000), 'https://x/return');
            $this->fail('timeout: expected an exception');
        } catch (KuickpayException $e) {
            $this->assertSame('provider_unavailable', $e->codeKey);
        }
    }

    public function test_tc_c09_missing_credentials_never_call_kuickpay(): void
    {
        config(['kuickpay.checkout.secured_key' => '']);
        $this->fakeOnly();
        $this->expectException(KuickpayException::class);
        try {
            (new KuickpayHttpGateway)->createCheckoutSession($this->attempt(100000), 'https://x/return');
        } finally {
            Http::assertNothingSent();
        }
    }

    public function test_tc_d01_return_signature_verification(): void
    {
        $params = ['orderid' => 'HVN-1', 'transactionid' => 'KP1', 'amount' => '1250.00', 'status' => 'SUCCESS', 'responsecode' => '00'];
        $params['signature'] = KuickpaySignature::forReturn($params, 'secret-key');
        $gateway = new KuickpayHttpGateway;

        $this->assertTrue($gateway->verifyReturn($params));
        $this->assertFalse($gateway->verifyReturn(['amount' => '1.00'] + $params));
        $this->assertFalse($gateway->verifyReturn(['signature' => ''] + $params));
        config(['kuickpay.checkout.secured_key' => '']);
        $this->assertFalse($gateway->verifyReturn($params));
    }

    public function test_tc_u01_bill_inquiry_maps_both_documented_shapes(): void
    {
        // Bill Inquiry V3 page: AN14 amounts, YYMM month, consumer_detail.
        $this->fakeOnly(['*' => Http::response([
            'response_Code' => '00', 'consumer_detail' => 'JOHN DOE', 'bill_status' => 'U', 'due_date' => '20250630',
            'amount_within_due_date' => '0000000250000+', 'amount_after_due_date' => '0000000265000+', 'billing_month' => '2506',
            'tran_auth_id' => '',
        ])]);
        $an14 = (new KuickpayHttpGateway)->billInquiry($this->biller(), '1234567890');
        $this->assertSame(BillInquiryResult::FOUND, $an14->outcome);
        $this->assertSame(250000, $an14->amountWithinDuePaisa);
        $this->assertSame(265000, $an14->amountAfterDuePaisa);
        $this->assertSame('2025-06', $an14->billingMonth);
        $this->assertSame('JOHN DOE', $an14->consumerName);

        // Bill Initiators overview page: plain paisa, MMYY month, consumer_name, tran_auth_id.
        $this->fakeOnly(['*' => Http::response([
            'response_Code' => '00', 'consumer_name' => 'MUHAMMAD ALI', 'bill_status' => 'U', 'due_date' => '20250531',
            'amount_within_due_date' => '25000', 'amount_after_due_date' => '27500', 'billing_month' => '0525', 'tran_auth_id' => '698243',
        ])]);
        $plain = (new KuickpayHttpGateway)->billInquiry($this->biller(), '1234567890');
        $this->assertSame(25000, $plain->amountWithinDuePaisa);
        $this->assertSame('2025-05', $plain->billingMonth);
        $this->assertSame('698243', $plain->tranAuthId);
        Http::assertSent(fn (Request $r) => $r->hasHeader('X-API-KEY', 'api-key') && $r->hasHeader('IN-ID', 'IN123') && $r['bank_mnemonic'] === 'LESCO');
    }

    public function test_tc_u02_bill_inquiry_response_codes(): void
    {
        $map = [
            ['01', null, BillInquiryResult::NOT_FOUND],
            ['02', null, BillInquiryResult::BLOCKED],
            ['06', 'P', BillInquiryResult::PAID],
            ['00', 'P', BillInquiryResult::PAID],
            ['00', 'B', BillInquiryResult::BLOCKED],
            ['05', null, BillInquiryResult::ERROR],
            ['04', null, BillInquiryResult::ERROR],
        ];
        foreach ($map as [$code, $status, $expected]) {
            $this->fakeOnly(['*' => Http::response(array_filter(['response_Code' => $code, 'bill_status' => $status]))]);
            $this->assertSame($expected, (new KuickpayHttpGateway)->billInquiry($this->biller(), '1')->outcome, "code {$code}/{$status}");
        }

        $this->fakeOnly(['*' => Http::response([], 401)]);
        $this->assertSame(BillInquiryResult::ERROR, (new KuickpayHttpGateway)->billInquiry($this->biller(), '1')->outcome);
        $this->fakeOnly(['*' => Http::response('not json', 200)]);
        $this->assertSame(BillInquiryResult::ERROR, (new KuickpayHttpGateway)->billInquiry($this->biller(), '1')->outcome);
        $this->fakeOnly(fn () => throw new ConnectionException('timeout'));
        $this->assertSame(BillInquiryResult::ERROR, (new KuickpayHttpGateway)->billInquiry($this->biller(), '1')->outcome);
    }

    public function test_tc_e09_bill_payment_timeout_or_05_is_unknown_never_failure(): void
    {
        $map = [
            ['00', BillPaymentResult::SUCCESS],
            ['06', BillPaymentResult::ALREADY_PAID],
            ['01', BillPaymentResult::REJECTED],
            ['02', BillPaymentResult::REJECTED],
            ['04', BillPaymentResult::REJECTED],
            ['03', BillPaymentResult::UNKNOWN],
            ['05', BillPaymentResult::UNKNOWN],
        ];
        foreach ($map as [$code, $expected]) {
            $this->fakeOnly(['*' => Http::response(['response_Code' => $code, 'receipt_id' => 'KP20250507001234'])]);
            $this->assertSame($expected, (new KuickpayHttpGateway)->billPayment($this->biller(), '1', '698243', 25000, '2025-05')->outcome, "code {$code}");
        }

        $this->fakeOnly(fn () => throw new ConnectionException('read timeout'));
        $this->assertSame(BillPaymentResult::UNKNOWN, (new KuickpayHttpGateway)->billPayment($this->biller(), '1', '698243', 25000, '2025-05')->outcome);

        $this->fakeOnly(['*' => Http::response(['response_Code' => '00', 'tran_auth_id' => '698243', 'receipt_id' => 'R1'])]);
        (new KuickpayHttpGateway)->billPayment($this->biller(), '1234567890', '698243', 25000, '2025-05');
        Http::assertSent(fn (Request $r) => $r['paid_amount'] === '25000' && $r['billing_month'] === '0525'
            && $r['tran_auth_id'] === '698243' && preg_match('/^\d{8}$/', $r['tran_date']) && preg_match('/^\d{6}$/', $r['tran_time']));
    }

    public function test_tc_u03_payment_status_display_mapping(): void
    {
        $expected = [
            'created' => 'awaiting_payment', 'awaiting_authorization' => 'awaiting_payment', 'authorized' => 'processing',
            'submitted_to_biller' => 'processing', 'pending_confirmation' => 'processing', 'succeeded' => 'succeeded',
            'failed' => 'failed', 'cancelled' => 'cancelled', 'expired' => 'expired', 'refund_pending' => 'refund_pending',
            'refunded' => 'refunded', 'reversed' => 'reversed',
        ];
        foreach ($expected as $status => $display) {
            $this->assertSame($display, (new PaymentAttempt(['status' => $status]))->displayStatus(), $status);
        }
        $this->assertFalse((new PaymentAttempt(['status' => 'succeeded']))->isActive());
        $this->assertTrue((new PaymentAttempt(['status' => 'pending_confirmation']))->isInFlight());
        $this->assertFalse((new PaymentAttempt(['status' => 'awaiting_authorization']))->isInFlight());
    }

    /** Http::fake() appends stubs; each scenario needs only its own response. */
    private function fakeOnly(mixed $stub = null): void
    {
        Http::swap(new \Illuminate\Http\Client\Factory);
        Http::fake($stub);
    }

    private function attempt(int $paisa): PaymentAttempt
    {
        $attempt = new PaymentAttempt([
            'public_id' => 'p-1', 'provider_order_id' => 'HVN-TEST-1', 'title' => 'Maintenance', 'amount_paisa' => $paisa,
        ]);
        $attempt->provider_session_id = 'cacaa5d8-f4d7-4ee9-8674-19673618492b';

        return $attempt;
    }

    private function biller(): UtilityBiller
    {
        return new UtilityBiller(['mnemonic' => 'LESCO', 'short_name' => 'LESCO', 'service_type' => 'electricity']);
    }
}
