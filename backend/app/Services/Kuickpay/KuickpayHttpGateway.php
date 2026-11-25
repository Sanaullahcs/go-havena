<?php

namespace App\Services\Kuickpay;

use App\Models\PaymentAttempt;
use App\Models\UtilityBiller;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/** KuickPay UAT / production client. Selected when kuickpay.mode is "uat" or "live". */
class KuickpayHttpGateway implements KuickpayGateway
{
    public function isSimulated(): bool
    {
        return false;
    }

    public function createCheckoutSession(PaymentAttempt $attempt, string $returnUrl): CheckoutSession
    {
        $companyId = (string) config('kuickpay.checkout.company_id');
        $securedKey = (string) config('kuickpay.checkout.secured_key');
        if ($companyId === '' || $securedKey === '') {
            Log::critical('KuickPay checkout credentials are missing');
            throw KuickpayException::notAvailable();
        }

        $amount = KuickpayFormat::rupees($attempt->amount_paisa);
        $timestamp = now()->utc()->format('Y-m-d\TH:i:s\Z');
        $orderId = (string) $attempt->provider_order_id;

        $payload = [
            'companyid' => $companyId,
            'orderid' => $orderId,
            'amount' => $amount,
            'amountPayable' => $amount,
            'timestamp' => $timestamp,
            'transactiondescription' => mb_substr($attempt->title, 0, 100),
            'returnurl' => $returnUrl,
            'signature' => KuickpaySignature::session($companyId, $orderId, $amount, $amount, $timestamp, $securedKey),
        ];

        try {
            $response = $this->checkoutClient()
                ->withBasicAuth($companyId, $securedKey)
                ->post((string) config('kuickpay.checkout.session_path'), $payload);
        } catch (ConnectionException $e) {
            $this->logFailure('checkout.session', $attempt, null, $e->getMessage());
            throw KuickpayException::unreachable();
        }

        $data = (array) ($response->json('responseData') ?? []);
        $code = (string) ($data['responseCode'] ?? '');
        $redirect = (string) ($data['redirectURL'] ?? '');
        $session = (string) ($data['sessionID'] ?? '');

        $this->logCall('checkout.session', $attempt, $response, $code);

        if ($response->status() === 401) {
            Log::critical('KuickPay rejected checkout credentials');
            throw KuickpayException::notAvailable();
        }
        if (! $response->successful() || $code !== '00' || $redirect === '') {
            throw new KuickpayException(
                'checkout_unavailable',
                'We could not open KuickPay right now. You have not been charged. Please try again.',
                503,
            );
        }

        return new CheckoutSession($session !== '' ? $session : $orderId, $redirect, false);
    }

    public function verifyReturn(array $params): bool
    {
        return KuickpaySignature::verifyReturn($params, (string) config('kuickpay.checkout.secured_key'));
    }

    public function checkoutStatus(PaymentAttempt $attempt): CheckoutStatus
    {
        $path = (string) config('kuickpay.checkout.status_path', '');
        if ($path === '' || ! $attempt->provider_session_id) {
            return new CheckoutStatus(CheckoutStatus::PENDING);
        }

        try {
            $response = $this->checkoutClient()
                ->withBasicAuth((string) config('kuickpay.checkout.company_id'), (string) config('kuickpay.checkout.secured_key'))
                ->post($path, [
                    'companyid' => (string) config('kuickpay.checkout.company_id'),
                    'orderid' => (string) $attempt->provider_order_id,
                    'sessionID' => (string) $attempt->provider_session_id,
                ]);
        } catch (ConnectionException) {
            return new CheckoutStatus(CheckoutStatus::PENDING);
        }

        $data = (array) ($response->json('responseData') ?? $response->json() ?? []);
        $status = strtoupper((string) ($data['status'] ?? ''));

        return new CheckoutStatus(
            in_array($status, [CheckoutStatus::SUCCESS, CheckoutStatus::FAILED, CheckoutStatus::CANCELLED], true)
                ? $status
                : CheckoutStatus::PENDING,
            isset($data['transactionid']) ? (string) $data['transactionid'] : null,
            KuickpayFormat::rupeesToPaisa($data['amount'] ?? null),
            isset($data['responsecode']) ? (string) $data['responsecode'] : null,
        );
    }

    public function getBillers(): array
    {
        try {
            $response = $this->initiatorClient()->post('/api/GetBillers', ['reserved' => '']);
        } catch (ConnectionException) {
            return [];
        }

        if ((string) $response->json('response_Code') !== '00') {
            return [];
        }

        return array_values(array_filter(array_map(static fn ($row) => is_array($row) ? [
            'mnemonic' => strtoupper(trim((string) ($row['mnemonic'] ?? ''))),
            'name' => trim((string) ($row['name'] ?? '')),
            'category' => (string) ($row['category'] ?? ''),
            'biller_id' => isset($row['biller_id']) ? (string) $row['biller_id'] : null,
        ] : null, (array) $response->json('billers', [])), static fn ($row) => $row && $row['mnemonic'] !== '' && $row['name'] !== ''));
    }

    public function billInquiry(UtilityBiller $biller, string $consumerNumber): BillInquiryResult
    {
        try {
            $response = $this->initiatorClient()->post('/api/BillInquiryV3', array_filter([
                'BillerID' => $biller->biller_id,
                'consumer_number' => $consumerNumber,
                'bank_mnemonic' => $biller->mnemonic,
                'channel' => (string) config('kuickpay.bill_initiator.channel', 'MOBILE'),
                'reserved' => '',
            ], static fn ($value) => $value !== null));
        } catch (ConnectionException) {
            return new BillInquiryResult(BillInquiryResult::ERROR, message: 'timeout');
        }

        $this->logBiller('bill_inquiry', $biller, $response);
        if ($response->status() === 401) {
            Log::critical('KuickPay rejected bill initiator credentials');

            return new BillInquiryResult(BillInquiryResult::ERROR, '401');
        }

        $data = (array) $response->json();
        $code = (string) ($data['response_Code'] ?? '');

        return match ($code) {
            '00', '06' => $this->mapFound($data, $code),
            '01' => new BillInquiryResult(BillInquiryResult::NOT_FOUND, $code),
            '02' => new BillInquiryResult(BillInquiryResult::BLOCKED, $code),
            default => new BillInquiryResult(BillInquiryResult::ERROR, $code !== '' ? $code : (string) $response->status()),
        };
    }

    public function billPayment(
        UtilityBiller $biller,
        string $consumerNumber,
        string $tranAuthId,
        int $paidPaisa,
        string $billingMonth,
    ): BillPaymentResult {
        $now = now()->timezone('Asia/Karachi');

        try {
            $response = $this->initiatorClient()->post('/api/BillPaymentV3', array_filter([
                'BillerID' => $biller->biller_id,
                'consumer_number' => $consumerNumber,
                'bank_mnemonic' => $biller->mnemonic,
                'tran_auth_id' => $tranAuthId,
                'paid_amount' => (string) $paidPaisa,
                'billing_month' => KuickpayFormat::mmyy($billingMonth),
                'tran_date' => $now->format('Ymd'),
                'tran_time' => $now->format('His'),
                'reserved' => '',
            ], static fn ($value) => $value !== null));
        } catch (ConnectionException) {
            // The request may have reached the biller. Reconcile, never retry.
            return new BillPaymentResult(BillPaymentResult::UNKNOWN, message: 'timeout');
        }

        $this->logBiller('bill_payment', $biller, $response);
        $data = (array) $response->json();
        $code = (string) ($data['response_Code'] ?? '');
        $receipt = isset($data['receipt_id']) ? (string) $data['receipt_id'] : (isset($data['Identification_parameter']) ? (string) $data['Identification_parameter'] : null);

        return match ($code) {
            '00' => new BillPaymentResult(BillPaymentResult::SUCCESS, $code, $receipt, (string) ($data['tran_auth_id'] ?? $tranAuthId)),
            '06' => new BillPaymentResult(BillPaymentResult::ALREADY_PAID, $code),
            '01', '02', '04' => new BillPaymentResult(BillPaymentResult::REJECTED, $code),
            // "03" is either our own duplicate (already settled) or unknown; reconcile decides.
            default => new BillPaymentResult(BillPaymentResult::UNKNOWN, $code !== '' ? $code : (string) $response->status()),
        };
    }

    /** @param  array<string, mixed>  $data */
    private function mapFound(array $data, string $code): BillInquiryResult
    {
        $status = strtoupper((string) ($data['bill_status'] ?? 'U'));
        $outcome = match (true) {
            $code === '06', $status === 'P' => BillInquiryResult::PAID,
            $status === 'B' => BillInquiryResult::BLOCKED,
            default => BillInquiryResult::FOUND,
        };

        return new BillInquiryResult(
            $outcome,
            $code,
            trim((string) ($data['consumer_name'] ?? $data['consumer_detail'] ?? '')) ?: null,
            KuickpayFormat::parseBillingMonth((string) ($data['billing_month'] ?? ''), 'MMYY'),
            KuickpayFormat::parsePaisa($data['amount_within_due_date'] ?? null),
            KuickpayFormat::parsePaisa($data['amount_after_due_date'] ?? null),
            KuickpayFormat::parseDate((string) ($data['due_date'] ?? '')),
            filled($data['tran_auth_id'] ?? null) ? (string) $data['tran_auth_id'] : null,
            KuickpayFormat::parsePaisa($data['amount_paid'] ?? null),
            KuickpayFormat::parseDate((string) ($data['date_paid'] ?? '')),
        );
    }

    private function checkoutClient(): PendingRequest
    {
        return $this->client((string) config('kuickpay.checkout.base_url'));
    }

    private function initiatorClient(): PendingRequest
    {
        return $this->client((string) config('kuickpay.bill_initiator.base_url'))->withHeaders([
            'X-API-KEY' => (string) config('kuickpay.bill_initiator.api_key'),
            'IN-ID' => (string) config('kuickpay.bill_initiator.initiator_id'),
        ]);
    }

    private function client(string $baseUrl): PendingRequest
    {
        $request = Http::baseUrl(rtrim($baseUrl, '/'))
            ->acceptJson()
            ->asJson()
            ->timeout(max(5, (int) config('kuickpay.timeout_seconds', 20)))
            ->connectTimeout(8);

        $bundle = config('kuickpay.ca_bundle') ?: config('plaid.ca_bundle');
        if ($bundle && is_file((string) $bundle)) {
            $request = $request->withOptions(['verify' => (string) $bundle]);
        }

        return $request;
    }

    private function logCall(string $operation, PaymentAttempt $attempt, Response $response, string $code): void
    {
        Log::info('kuickpay.'.$operation, [
            'payment' => $attempt->public_id,
            'http' => $response->status(),
            'response_code' => $code,
        ]);
    }

    private function logBiller(string $operation, UtilityBiller $biller, Response $response): void
    {
        Log::info('kuickpay.'.$operation, [
            'biller' => $biller->mnemonic,
            'http' => $response->status(),
            'response_code' => (string) $response->json('response_Code'),
        ]);
    }

    private function logFailure(string $operation, PaymentAttempt $attempt, ?int $http, string $error): void
    {
        Log::warning('kuickpay.'.$operation.'.failed', [
            'payment' => $attempt->public_id,
            'http' => $http,
            'error' => mb_substr($error, 0, 200),
        ]);
    }
}
