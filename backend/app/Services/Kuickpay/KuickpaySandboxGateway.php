<?php

namespace App\Services\Kuickpay;

use App\Models\PaymentAttempt;
use App\Models\UtilityBiller;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Built-in KuickPay simulator used until UAT credentials are issued.
 *
 * It speaks the same contract as the live client, signs returns the same way,
 * and serves a hosted checkout page from Havena's own API so the full
 * resident journey (leave app, pay, come back) runs end to end.
 *
 * Utility consumer numbers ending in these digits trigger edge cases:
 *   0000  consumer not found        9999  account blocked
 *   1111  already paid elsewhere    2222  past due (late amount applies)
 *   3333  payment outcome unknown   4444  amount changes after first look
 *   5555  biller rejects payment    8888  provider error on inquiry
 */
class KuickpaySandboxGateway implements KuickpayGateway
{
    private const TTL_SECONDS = 86400;

    private const NAMES = [
        'MUHAMMAD ALI', 'AYESHA KHAN', 'USMAN TARIQ', 'FATIMA NOOR', 'HAMZA SHEIKH',
        'ZAINAB HAIDER', 'BILAL AHMED', 'SANA IQBAL', 'IMRAN CHAUDHRY', 'MARIAM RAZA',
    ];

    public function isSimulated(): bool
    {
        return true;
    }

    public static function secret(): string
    {
        return (string) config('kuickpay.sandbox_secret', 'havena-kuickpay-sandbox');
    }

    public function createCheckoutSession(PaymentAttempt $attempt, string $returnUrl): CheckoutSession
    {
        $sessionId = (string) Str::uuid();
        Cache::put($this->sessionKey($sessionId), [
            'session_id' => $sessionId,
            'payment_id' => $attempt->public_id,
            'order_id' => (string) $attempt->provider_order_id,
            'amount' => KuickpayFormat::rupees($attempt->amount_paisa),
            'amount_paisa' => $attempt->amount_paisa,
            'title' => $attempt->title,
            'subtitle' => $attempt->subtitle,
            'return_url' => $returnUrl,
            'status' => CheckoutStatus::PENDING,
            'created_at' => now()->toIso8601String(),
        ], self::TTL_SECONDS);

        $base = rtrim((string) config('kuickpay.public_api_url'), '/');

        return new CheckoutSession($sessionId, $base.'/api/v1/payments/kuickpay/sandbox/'.$sessionId, true);
    }

    /** @return array<string, mixed>|null */
    public function session(string $sessionId): ?array
    {
        $session = Cache::get($this->sessionKey($sessionId));

        return is_array($session) ? $session : null;
    }

    /**
     * Records what the resident chose on the sandbox page and builds the signed
     * return URL exactly as KuickPay would.
     */
    public function complete(string $sessionId, string $status, ?string $method): ?string
    {
        $session = $this->session($sessionId);
        if (! $session) {
            return null;
        }

        $status = in_array($status, [CheckoutStatus::SUCCESS, CheckoutStatus::FAILED, CheckoutStatus::CANCELLED], true)
            ? $status
            : CheckoutStatus::FAILED;

        $params = [
            'orderid' => (string) $session['order_id'],
            'transactionid' => $status === CheckoutStatus::CANCELLED ? '' : 'KPSBX'.now()->format('ymdHis').random_int(100, 999),
            'amount' => (string) $session['amount'],
            'status' => $status,
            'responsecode' => $status === CheckoutStatus::SUCCESS ? '00' : ($status === CheckoutStatus::CANCELLED ? '17' : '51'),
            'method' => (string) ($method ?? ''),
        ];
        $params['signature'] = KuickpaySignature::forReturn($params, self::secret());

        $session['status'] = $status;
        $session['transaction_id'] = $params['transactionid'];
        $session['response_code'] = $params['responsecode'];
        $session['method'] = $method;
        Cache::put($this->sessionKey($sessionId), $session, self::TTL_SECONDS);

        $separator = str_contains((string) $session['return_url'], '?') ? '&' : '?';

        return $session['return_url'].$separator.http_build_query($params);
    }

    public function verifyReturn(array $params): bool
    {
        return KuickpaySignature::verifyReturn($params, self::secret());
    }

    public function checkoutStatus(PaymentAttempt $attempt): CheckoutStatus
    {
        $session = $attempt->provider_session_id ? $this->session((string) $attempt->provider_session_id) : null;
        if (! $session) {
            return new CheckoutStatus(CheckoutStatus::PENDING);
        }

        return new CheckoutStatus(
            (string) ($session['status'] ?? CheckoutStatus::PENDING),
            filled($session['transaction_id'] ?? null) ? (string) $session['transaction_id'] : null,
            (int) ($session['amount_paisa'] ?? 0),
            $session['response_code'] ?? null,
            $session['method'] ?? null,
        );
    }

    public function getBillers(): array
    {
        return array_map(static fn (array $row) => [
            'mnemonic' => $row['mnemonic'],
            'name' => $row['name'],
            'category' => $row['service_type'],
            'biller_id' => $row['biller_id'] ?? null,
        ], UtilityBillerCatalog::defaults());
    }

    public function billInquiry(UtilityBiller $biller, string $consumerNumber): BillInquiryResult
    {
        $scenario = substr($consumerNumber, -4);
        $month = now()->format('Y-m');

        if ($scenario === '0000') {
            return new BillInquiryResult(BillInquiryResult::NOT_FOUND, '01');
        }
        if ($scenario === '9999') {
            return new BillInquiryResult(BillInquiryResult::BLOCKED, '02', $this->name($consumerNumber));
        }
        if ($scenario === '8888') {
            return new BillInquiryResult(BillInquiryResult::ERROR, '05');
        }

        $within = $this->baseAmount($biller, $consumerNumber, $month);
        $lookupKey = $this->lookupKey($biller, $consumerNumber, $month);
        Cache::add($lookupKey, 0, now()->addDays(40));
        $lookups = (int) Cache::increment($lookupKey);
        if ($scenario === '4444' && $lookups > 1) {
            $within += 12000;
        }
        $after = (int) (round($within * 1.1 / 100) * 100);

        $due = $scenario === '2222'
            ? now()->subDays(5)->startOfDay()
            : $this->dueDate();

        $paid = Cache::get($this->paidKey($biller, $consumerNumber, $month));
        if ($scenario === '1111' && ! $paid) {
            $paid = [
                'tran_auth_id' => (string) (100000 + abs(crc32($consumerNumber)) % 899999),
                'amount' => $within,
                'date' => now()->subDays(2)->format('Ymd'),
            ];
        }

        return new BillInquiryResult(
            $paid ? BillInquiryResult::PAID : BillInquiryResult::FOUND,
            '00',
            $this->name($consumerNumber),
            $month,
            $within,
            $after,
            $due,
            $paid ? (string) $paid['tran_auth_id'] : (string) (100000 + random_int(0, 899999)),
            $paid ? (int) $paid['amount'] : null,
            $paid ? Carbon::createFromFormat('Ymd', (string) $paid['date'])->startOfDay() : null,
        );
    }

    public function billPayment(
        UtilityBiller $biller,
        string $consumerNumber,
        string $tranAuthId,
        int $paidPaisa,
        string $billingMonth,
    ): BillPaymentResult {
        $scenario = substr($consumerNumber, -4);
        $paidKey = $this->paidKey($biller, $consumerNumber, $billingMonth);

        if (Cache::has($paidKey)) {
            $existing = (array) Cache::get($paidKey);

            return ($existing['tran_auth_id'] ?? null) === $tranAuthId
                ? new BillPaymentResult(BillPaymentResult::SUCCESS, '03', (string) ($existing['receipt'] ?? ''), $tranAuthId)
                : new BillPaymentResult(BillPaymentResult::ALREADY_PAID, '06');
        }

        if ($scenario === '5555') {
            return new BillPaymentResult(BillPaymentResult::REJECTED, '02', message: 'Biller refused the payment.');
        }

        $receipt = 'KP'.now()->format('YmdHis').random_int(100, 999);
        Cache::put($paidKey, [
            'tran_auth_id' => $tranAuthId,
            'amount' => $paidPaisa,
            'date' => now()->format('Ymd'),
            'receipt' => $receipt,
        ], now()->addDays(60));

        if ($scenario === '3333') {
            // The biller recorded it, but the response never came back.
            return new BillPaymentResult(BillPaymentResult::UNKNOWN, null, message: 'timeout');
        }

        return new BillPaymentResult(BillPaymentResult::SUCCESS, '00', $receipt, $tranAuthId);
    }

    private function baseAmount(UtilityBiller $biller, string $consumerNumber, string $month): int
    {
        [$min, $max] = match ($biller->service_type) {
            'electricity' => [180000, 2400000],
            'gas' => [60000, 650000],
            'water' => [45000, 260000],
            'internet', 'telecom' => [199900, 899900],
            default => [100000, 500000],
        };

        $seed = abs(crc32($biller->mnemonic.'|'.$consumerNumber.'|'.$month));
        $paisa = $min + ($seed % max(1, $max - $min));

        // Utility bills are issued in whole rupees.
        return (int) (round($paisa / 100) * 100);
    }

    private function dueDate(): Carbon
    {
        $due = now()->startOfMonth()->addDays(19);

        return $due->lt(now()->startOfDay()) ? now()->addDays(7)->startOfDay() : $due;
    }

    private function name(string $consumerNumber): string
    {
        return self::NAMES[abs(crc32($consumerNumber)) % count(self::NAMES)];
    }

    private function sessionKey(string $sessionId): string
    {
        return 'kuickpay:sandbox:session:'.$sessionId;
    }

    private function paidKey(UtilityBiller $biller, string $consumerNumber, string $month): string
    {
        return 'kuickpay:sandbox:paid:'.$biller->mnemonic.':'.$consumerNumber.':'.$month;
    }

    private function lookupKey(UtilityBiller $biller, string $consumerNumber, string $month): string
    {
        return 'kuickpay:sandbox:lookups:'.$biller->mnemonic.':'.$consumerNumber.':'.$month;
    }
}
