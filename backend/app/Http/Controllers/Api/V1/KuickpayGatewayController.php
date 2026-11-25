<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\PaymentAttempt;
use App\Services\Kuickpay\CheckoutStatus;
use App\Services\Kuickpay\KuickpayGateway;
use App\Services\Kuickpay\KuickpaySandboxGateway;
use App\Services\Payments\OnlinePaymentPresenter;
use App\Services\Payments\PaymentOrchestrator;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\Response as BaseResponse;

/**
 * Browser-facing KuickPay endpoints: launching a checkout, KuickPay's return
 * redirect, and (sandbox mode only) the simulated hosted payment page.
 */
class KuickpayGatewayController extends Controller
{
    private const SANDBOX_ERRORS = [
        'wallet_mobile' => 'Enter your 11-digit mobile account number, for example 03001234567.',
        'wallet_pin' => 'Enter your 4 or 5 digit MPIN.',
        'card_number' => 'Enter a valid 16-digit card number.',
        'card_expiry' => 'Enter the card expiry as MM/YY.',
        'card_cvv' => 'Enter the 3 digit security code on the back of your card.',
        'bank_account' => 'Enter your account number or IBAN.',
        'raast_id' => 'Enter your Raast ID (mobile number) or IBAN.',
        'method' => 'Choose a payment method.',
    ];

    public function __construct(
        private readonly PaymentOrchestrator $orchestrator,
        private readonly OnlinePaymentPresenter $presenter,
        private readonly KuickpayGateway $gateway,
    ) {
    }

    /** GET /v1/payments/kuickpay/launch/{token} */
    public function launch(string $token): BaseResponse
    {
        $attempt = PaymentAttempt::query()->where('launch_token', $token)->first();
        if (! $attempt) {
            return $this->statusPage(null, 'This payment link has expired', 'Open the bill in Havena and tap Pay Now to start again. You have not been charged.');
        }

        $attempt = $this->orchestrator->refresh($attempt);
        $redirect = (string) data_get($attempt->meta, 'redirect_url', '');
        if (! $attempt->isAwaitingAuthorization() || $attempt->hasExpired() || $redirect === '') {
            return $this->statusPage($attempt);
        }

        return redirect()->away($redirect);
    }

    /** GET|POST /v1/payments/kuickpay/return/{payment} */
    public function handleReturn(Request $request, string $payment): BaseResponse
    {
        $params = array_map(
            static fn ($value) => is_scalar($value) ? (string) $value : '',
            array_merge($request->query(), $request->post()),
        );

        $attempt = $this->orchestrator->handleReturn($payment, $params);
        if (! $attempt) {
            return $this->statusPage(null, 'Payment not found', 'Return to Havena to check your bill.');
        }

        return $this->backToHavena($attempt);
    }

    /** GET /v1/payments/kuickpay/sandbox/{session} */
    public function sandbox(Request $request, string $session): BaseResponse
    {
        $sandbox = $this->sandboxGateway();
        $data = $sandbox->session($session);
        if (! $data) {
            return $this->statusPage(null, 'Checkout session expired', 'Return to Havena and tap Pay Now to start again.');
        }

        $attempt = PaymentAttempt::query()->with('community:id,name')->where('public_id', $data['payment_id'])->first();
        if (! $attempt || ! $attempt->isAwaitingAuthorization() || ($data['status'] ?? null) !== CheckoutStatus::PENDING) {
            return $attempt ? $this->backToHavena($attempt) : $this->statusPage(null, 'Checkout session expired', 'Return to Havena to check your bill.');
        }

        return response()->view('payments.kuickpay-sandbox', [
            'session' => $data,
            'attempt' => $attempt,
            'merchant' => $attempt->community?->name ?? 'Havena',
            'methods' => (array) config('kuickpay.methods', []),
            'error' => self::SANDBOX_ERRORS[(string) $request->query('error', '')] ?? null,
            'selectedMethod' => (string) $request->query('method', 'easypaisa'),
        ])->header('Cache-Control', 'no-store');
    }

    /** POST /v1/payments/kuickpay/sandbox/{session} */
    public function sandboxSubmit(Request $request, string $session): BaseResponse
    {
        $sandbox = $this->sandboxGateway();
        $data = $sandbox->session($session);
        if (! $data || ($data['status'] ?? null) !== CheckoutStatus::PENDING) {
            return $this->statusPage(null, 'Checkout already completed', 'Return to Havena to see the result.');
        }

        $action = (string) $request->input('action', 'pay');
        if ($action === 'cancel') {
            return redirect()->away((string) $sandbox->complete($session, CheckoutStatus::CANCELLED, null));
        }

        $method = (string) $request->input('method', 'easypaisa');
        $declined = false;
        $error = null;

        if (in_array($method, ['easypaisa', 'jazzcash'], true)) {
            $mobile = preg_replace('/\D+/', '', (string) $request->input('wallet_mobile'));
            $pin = preg_replace('/\D+/', '', (string) $request->input('wallet_pin'));
            if (! preg_match('/^03\d{9}$/', (string) $mobile)) {
                $error = 'wallet_mobile';
            } elseif (strlen((string) $pin) < 4 || strlen((string) $pin) > 5) {
                $error = 'wallet_pin';
            }
            $declined = str_ends_with((string) $mobile, '0000') || $pin === '00000';
        } elseif ($method === 'card') {
            $number = preg_replace('/\D+/', '', (string) $request->input('card_number'));
            if (strlen((string) $number) < 15 || strlen((string) $number) > 16) {
                $error = 'card_number';
            } elseif (! preg_match('/^(0[1-9]|1[0-2])\s*\/\s*\d{2}$/', (string) $request->input('card_expiry'))) {
                $error = 'card_expiry';
            } elseif (! preg_match('/^\d{3,4}$/', (string) $request->input('card_cvv'))) {
                $error = 'card_cvv';
            }
            $declined = str_starts_with((string) $number, '4000000000000002');
        } elseif (in_array($method, ['bank', 'raast'], true)) {
            $account = trim((string) $request->input('bank_account'));
            if (strlen($account) < 6) {
                $error = $method === 'raast' ? 'raast_id' : 'bank_account';
            }
            $declined = str_ends_with(preg_replace('/\D+/', '', $account) ?? '', '0000');
        } else {
            $error = 'method';
        }

        if ($error) {
            // The API has no session middleware, so the error code rides on the URL. Inputs are never echoed back.
            return redirect()->to($request->url().'?'.http_build_query(['error' => $error, 'method' => $method]));
        }

        $url = $sandbox->complete($session, $declined ? CheckoutStatus::FAILED : CheckoutStatus::SUCCESS, $method);

        return redirect()->away((string) $url);
    }

    private function backToHavena(PaymentAttempt $attempt): BaseResponse
    {
        $target = $this->targetUrl($attempt);

        return response()->view('payments.kuickpay-return', [
            'attempt' => $attempt,
            'payload' => $this->presenter->attempt($attempt),
            'target' => $target,
        ])->header('Cache-Control', 'no-store');
    }

    private function targetUrl(PaymentAttempt $attempt): string
    {
        $query = http_build_query(['id' => $attempt->public_id, 'status' => $attempt->displayStatus()]);

        if ($attempt->channel === PaymentAttempt::CHANNEL_MOBILE && $attempt->app_return_url) {
            $base = $attempt->app_return_url;

            return $base.(str_contains($base, '?') ? '&' : '?').$query;
        }

        return rtrim((string) config('kuickpay.web_url'), '/').'/payments/'.$attempt->public_id;
    }

    private function statusPage(?PaymentAttempt $attempt, ?string $title = null, ?string $body = null): Response
    {
        return response()->view('payments.kuickpay-return', [
            'attempt' => $attempt,
            'payload' => $attempt ? $this->presenter->attempt($attempt) : null,
            'target' => $attempt ? $this->targetUrl($attempt) : null,
            'title' => $title,
            'body' => $body,
        ], $attempt ? 200 : 404)->header('Cache-Control', 'no-store');
    }

    private function sandboxGateway(): KuickpaySandboxGateway
    {
        abort_unless(
            $this->gateway instanceof KuickpaySandboxGateway
                && app(\App\Services\Payments\PaymentRouting::class)->kuickpayOperational(),
            404,
        );

        return $this->gateway;
    }
}
