<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\PaymentAttempt;
use App\Services\Kuickpay\KuickpayFormat;
use App\Services\Payments\HavenaConsumerNumber;
use App\Services\Payments\OnlinePaymentPresenter;
use App\Services\Payments\Payable;
use App\Services\Payments\PayableResolver;
use App\Services\Payments\PaymentOrchestrator;
use App\Services\Payments\PaymentRouting;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * KuickPay Institution End-to-End. KuickPay calls these when a resident pays a
 * Havena bill from any bank, wallet or ATM using the bill's 18-digit consumer
 * number. Responses follow KuickPay's documented codes exactly.
 */
class KuickpayInstitutionController extends Controller
{
    public function __construct(
        private readonly PayableResolver $payables,
        private readonly PaymentOrchestrator $orchestrator,
        private readonly OnlinePaymentPresenter $presenter,
        private readonly PaymentRouting $routing,
    ) {
    }

    /** POST /v1/integrations/kuickpay/bill-inquiry */
    public function inquiry(Request $request): JsonResponse
    {
        if (! $this->authorized($request)) {
            return $this->code('04', 'Invalid data');
        }

        $consumer = KuickpayFormat::digits((string) $request->input('consumer_number'));
        $payable = $this->lookup($consumer);
        if (! $payable) {
            return $this->code('01', 'Consumer number not found.');
        }

        try {
            $active = $this->presenter->activeAttempt($payable->type, $payable->id);
            $status = match (true) {
                $payable->state === Payable::STATE_PAID => 'P',
                in_array($payable->state, [Payable::STATE_BLOCKED, Payable::STATE_INACTIVE], true) => 'B',
                $active !== null && $active->isInFlight() => 'B',
                default => 'U',
            };

            $paid = $status === 'P' ? $this->settledAttempt($payable) : null;
            $dueDate = $payable->dueDate ? Carbon::parse($payable->dueDate) : now();
            $month = $payable->billingMonth ?: now()->format('Y-m');

            $response = [
                'response_Code' => $status === 'B' ? '02' : '00',
                'response_description' => match ($status) {
                    'P' => 'Bill already paid',
                    'B' => $active ? 'Payment in progress' : 'Voucher is blocked or inactive',
                    default => 'Success',
                },
                'consumer_detail' => KuickpayFormat::consumerDetail($payable->consumerName),
                'bill_status' => $status,
                'due_date' => $dueDate->format('Ymd'),
                'amount_within_due_date' => KuickpayFormat::an14($payable->amountPaisa),
                'amount_after_due_date' => KuickpayFormat::an14($payable->amountAfterDuePaisa ?: $payable->amountPaisa),
                'billing_month' => KuickpayFormat::yymm($month),
                'date_paid' => $paid?->confirmed_at?->timezone('Asia/Karachi')->format('Ymd') ?? '',
                'amount_paid' => $paid ? (string) $paid->amount_paisa : '',
                'tran_auth_id' => $paid?->provider_auth_id ?? '',
                'contact_number' => mb_substr(KuickpayFormat::digits((string) $payable->contactNumber), 0, 15),
                'email' => mb_substr((string) $payable->email, 0, 100),
                'reserved' => '',
                'institution_id' => (string) config('kuickpay.institution.id', ''),
                'institution_name' => mb_substr((string) config('kuickpay.institution.name', 'Havena'), 0, 50),
            ];

            return response()->json($response);
        } catch (\Throwable $e) {
            Log::error('KuickPay institution inquiry failed', ['error' => $e->getMessage()]);

            return $this->code('05', 'Service failure');
        }
    }

    /** POST /v1/integrations/kuickpay/bill-payment */
    public function payment(Request $request): JsonResponse
    {
        if (! $this->authorized($request)) {
            return $this->paymentCode('04', 'Invalid data');
        }

        $consumer = KuickpayFormat::digits((string) $request->input('consumer_number'));
        $tranAuthId = KuickpayFormat::digits((string) $request->input('tran_auth_id'));
        $paidPaisa = KuickpayFormat::parsePaisa($request->input('paid_amount'));
        $tranDate = (string) $request->input('tran_date');
        $tranTime = (string) $request->input('tran_time');
        $bank = mb_substr(trim((string) $request->input('bank_mnemonic', '')), 0, 10) ?: null;

        if ($consumer === '' || strlen($consumer) > 18 || $tranAuthId === '' || strlen($tranAuthId) > 6
            || $paidPaisa === null || $paidPaisa <= 0
            || ! preg_match('/^\d{8}$/', $tranDate) || ! preg_match('/^\d{6}$/', $tranTime)) {
            return $this->paymentCode('04', 'Invalid data');
        }

        $decoded = HavenaConsumerNumber::decode($consumer);
        if (! $decoded) {
            return $this->paymentCode('01', 'Invalid voucher number');
        }

        try {
            return Cache::lock('payments:pay:'.$decoded[0].':'.$decoded[1], 30)->block(10, function () use ($consumer, $tranAuthId, $paidPaisa, $tranDate, $tranTime, $bank, $decoded) {
                $duplicate = DB::table('kuickpay_inbound_payments')
                    ->where('tran_auth_id', $tranAuthId)
                    ->where('consumer_number', $consumer)
                    ->first();
                if ($duplicate) {
                    return $this->paymentCode('03', 'Already paid', (string) $duplicate->identification_parameter);
                }

                $payable = $this->payables->resolve($decoded[0], $decoded[1]);
                if (! $payable || ! $this->routing->kuickpayEnabled($payable->communityId)) {
                    return $this->paymentCode('01', 'Invalid voucher number');
                }
                if ($payable->state === Payable::STATE_PAID) {
                    return $this->paymentCode('03', 'Already paid', (string) ($this->settledAttempt($payable)?->reference ?? ''));
                }
                if (in_array($payable->state, [Payable::STATE_BLOCKED, Payable::STATE_INACTIVE], true)) {
                    return $this->paymentCode('02', 'Voucher is blocked');
                }

                $active = $this->presenter->activeAttempt($payable->type, $payable->id);
                if ($active && $active->isInFlight()) {
                    return $this->paymentCode('02', 'Payment in progress');
                }
                if ($paidPaisa !== $payable->amountPaisa) {
                    return $this->paymentCode('04', 'Amount mismatch');
                }
                if ($active) {
                    // The resident started an in-app checkout but paid at their bank instead.
                    $active->forceFill([
                        'status' => PaymentAttempt::STATUS_CANCELLED,
                        'cancelled_at' => now(),
                        'active_lock' => null,
                        'launch_token' => null,
                    ])->save();
                }

                $attempt = $this->orchestrator->recordChannelPayment($payable, $tranAuthId, $paidPaisa, $bank);
                DB::table('kuickpay_inbound_payments')->insert([
                    'tran_auth_id' => $tranAuthId,
                    'consumer_number' => $consumer,
                    'bank_mnemonic' => $bank,
                    'payable_type' => $payable->type,
                    'payable_id' => $payable->id,
                    'paid_amount_paisa' => $paidPaisa,
                    'tran_date' => $tranDate,
                    'tran_time' => $tranTime,
                    'identification_parameter' => $attempt->reference,
                    'response_code' => '00',
                    'payment_attempt_id' => $attempt->id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                return $this->paymentCode('00', 'Bill payment successful', $attempt->reference);
            });
        } catch (LockTimeoutException) {
            return $this->paymentCode('05', 'Service failure');
        } catch (\Throwable $e) {
            Log::error('KuickPay institution payment failed', ['error' => $e->getMessage()]);

            return $this->paymentCode('05', 'Service failure');
        }
    }

    private function lookup(string $consumer): ?Payable
    {
        $decoded = HavenaConsumerNumber::decode($consumer);
        if (! $decoded) {
            return null;
        }

        $payable = $this->payables->resolve($decoded[0], $decoded[1]);

        return $payable && $this->routing->kuickpayEnabled($payable->communityId) ? $payable : null;
    }

    private function settledAttempt(Payable $payable): ?PaymentAttempt
    {
        return PaymentAttempt::query()
            ->where('payable_type', $payable->type)
            ->where('payable_id', $payable->id)
            ->where('status', PaymentAttempt::STATUS_SUCCEEDED)
            ->latest('id')
            ->first();
    }

    private function authorized(Request $request): bool
    {
        $username = (string) config('kuickpay.institution.username', '');
        $password = (string) config('kuickpay.institution.password', '');
        if ($username === '' || $password === '') {
            return false;
        }

        $givenUser = (string) ($request->header('username') ?? $request->input('username', ''));
        $givenPass = (string) ($request->header('password') ?? $request->input('password', ''));

        return hash_equals($username, $givenUser) && hash_equals($password, $givenPass);
    }

    private function code(string $code, string $description): JsonResponse
    {
        return response()->json(['response_Code' => $code, 'response_description' => $description]);
    }

    private function paymentCode(string $code, string $description, string $identification = ''): JsonResponse
    {
        return response()->json([
            'response_Code' => $code,
            'response_description' => $description,
            'Identification_parameter' => $identification,
            'reserved' => '',
        ]);
    }
}
