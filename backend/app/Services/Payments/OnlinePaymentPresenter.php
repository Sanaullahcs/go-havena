<?php

namespace App\Services\Payments;

use App\Models\PaymentAttempt;
use App\Models\UtilityBill;
use App\Models\UtilityBiller;
use App\Services\Kuickpay\KuickpayGateway;
use Illuminate\Validation\ValidationException;

class OnlinePaymentPresenter
{
    public function __construct(
        private readonly PaymentRouting $routing,
        private readonly KuickpayGateway $gateway,
    ) {
    }

    /** Online-payment block attached to every resident bill payload. */
    public function forPayable(string $type, int $id, int $communityId): array
    {
        $provider = $this->routing->provider($communityId ?: null);
        if ($provider !== PaymentRouting::KUICKPAY || ! $this->routing->kuickpayEnabled($communityId)) {
            return ['available' => false, 'provider' => $provider];
        }

        $active = $this->activeAttempt($type, $id);
        $lastPaid = PaymentAttempt::query()
            ->where('payable_type', $type)
            ->where('payable_id', $id)
            ->where('status', PaymentAttempt::STATUS_SUCCEEDED)
            ->latest('id')
            ->first();
        $voucher = HavenaConsumerNumber::encode($type, $id);

        return [
            'available' => true,
            'provider' => PaymentRouting::KUICKPAY,
            'test_mode' => $this->gateway->isSimulated(),
            'active_payment' => $active ? $this->summary($active) : null,
            'last_payment' => $lastPaid ? $this->summary($lastPaid) : null,
            'voucher' => $voucher ? [
                'consumer_number' => $voucher,
                'display' => HavenaConsumerNumber::display($voucher),
            ] : null,
        ];
    }

    public function activeAttempt(string $type, int $id): ?PaymentAttempt
    {
        $attempt = PaymentAttempt::query()
            ->where('payable_type', $type)
            ->where('payable_id', $id)
            ->whereIn('status', PaymentAttempt::ACTIVE_STATUSES)
            ->latest('id')
            ->first();

        return $attempt && ! $attempt->hasExpired() ? $attempt : null;
    }

    /** Proof uploads and online payments must never both settle one bill. */
    public function assertNoPaymentInFlight(string $type, int $id): void
    {
        $attempt = $this->activeAttempt($type, $id);
        if ($attempt && $attempt->isInFlight()) {
            throw ValidationException::withMessages([
                'file' => 'A KuickPay payment for this bill is being processed. Please wait for it to finish before uploading proof.',
            ]);
        }
    }

    public function summary(PaymentAttempt $attempt): array
    {
        return [
            'id' => $attempt->public_id,
            'reference' => $attempt->reference,
            'status' => $attempt->displayStatus(),
            'status_label' => $this->statusLabel($attempt),
            'amount' => $attempt->amountRupees(),
            'formatted_amount' => $attempt->formattedAmount(),
            'method_label' => $attempt->methodLabel(),
            'confirmed_at' => $attempt->confirmed_at?->toIso8601String(),
            'created_at' => $attempt->created_at?->toIso8601String(),
        ];
    }

    private function billerFor(PaymentAttempt $attempt): ?UtilityBiller
    {
        if ($attempt->payable_type !== PaymentAttempt::PAYABLE_UTILITY_BILL) {
            return null;
        }

        return UtilityBill::query()->with('account.biller')->find($attempt->payable_id)?->account?->biller;
    }

    public function attempt(PaymentAttempt $attempt, bool $forAdmin = false): array
    {
        $display = $attempt->displayStatus();
        $biller = $this->billerFor($attempt);
        $payload = $this->summary($attempt) + [
            'biller' => $biller ? [
                'mnemonic' => $biller->mnemonic,
                'name' => $biller->name,
                'short_name' => $biller->short_name,
                'service_type' => $biller->service_type,
                'brand_color' => $biller->brand_color,
            ] : null,
            'community_name' => $attempt->community?->name,
            'internal_status' => $attempt->status,
            'message' => $this->message($attempt),
            'tone' => $this->tone($display),
            'payable_type' => $attempt->payable_type,
            'payable_id' => (int) $attempt->payable_id,
            'title' => $attempt->title,
            'subtitle' => $attempt->subtitle,
            'amount_paisa' => (int) $attempt->amount_paisa,
            'currency' => $attempt->currency,
            'method' => $attempt->method,
            'channel' => $attempt->channel,
            'provider' => $attempt->provider,
            'test_mode' => (bool) $attempt->simulated,
            'is_final' => $attempt->isTerminal(),
            'can_resume' => $attempt->isAwaitingAuthorization() && ! $attempt->hasExpired(),
            'can_cancel' => $attempt->isAwaitingAuthorization(),
            'resume_url' => $attempt->isAwaitingAuthorization() && ! $attempt->hasExpired() && $attempt->launch_token
                ? $this->launchUrl($attempt)
                : null,
            'expires_at' => $attempt->expires_at?->toIso8601String(),
            'failed_at' => $attempt->failed_at?->toIso8601String(),
            'cancelled_at' => $attempt->cancelled_at?->toIso8601String(),
            'receipt' => $attempt->isSucceeded() ? [
                'reference' => $attempt->reference,
                'transaction_id' => $attempt->provider_transaction_id,
                'receipt_id' => $attempt->provider_receipt_id,
                'paid_at' => $attempt->confirmed_at?->toIso8601String(),
                'paid_to' => $biller?->name ?? $attempt->community?->name,
                'payer' => $attempt->user?->name,
                'method_label' => $attempt->methodLabel() ?? 'KuickPay',
                'channel_label' => match ($attempt->channel) {
                    PaymentAttempt::CHANNEL_KUICKPAY => 'KuickPay voucher',
                    PaymentAttempt::CHANNEL_WEB => 'Havena web',
                    default => 'Havena app',
                },
            ] : null,
        ];

        if ($forAdmin) {
            $payload += [
                'payer' => $attempt->user ? ['id' => (int) $attempt->user->id, 'name' => $attempt->user->name] : null,
                'unit_id' => $attempt->unit_id,
                'provider_transaction_id' => $attempt->provider_transaction_id,
                'provider_auth_id' => $attempt->provider_auth_id,
                'provider_receipt_id' => $attempt->provider_receipt_id,
                'failure_code' => $attempt->failure_code,
                'failure_message' => $attempt->failure_message,
                'needs_attention' => (bool) $attempt->needs_attention,
                'reconcile_attempts' => (int) $attempt->reconcile_attempts,
                'next_reconcile_at' => $attempt->next_reconcile_at?->toIso8601String(),
            ];
        }

        return $payload;
    }

    public function launchUrl(PaymentAttempt $attempt): string
    {
        return rtrim((string) config('kuickpay.public_api_url'), '/').'/api/v1/payments/kuickpay/launch/'.$attempt->launch_token;
    }

    public function statusLabel(PaymentAttempt $attempt): string
    {
        return match ($attempt->displayStatus()) {
            'awaiting_payment' => 'Complete your payment',
            'processing' => 'Payment processing',
            'succeeded' => 'Payment successful',
            'cancelled' => 'Payment cancelled',
            'expired' => 'Payment session expired',
            'refund_pending' => 'Refund in progress',
            'refunded' => 'Payment refunded',
            'reversed' => 'Payment reversed',
            default => 'Payment not completed',
        };
    }

    public function message(PaymentAttempt $attempt): string
    {
        return match ($attempt->displayStatus()) {
            'awaiting_payment' => 'Finish paying on the secure KuickPay page. Your bill updates as soon as KuickPay confirms.',
            'processing' => 'KuickPay is confirming your payment. Please do not pay again — this usually takes under a minute.',
            'succeeded' => 'Your payment was received and the bill is marked paid.',
            'cancelled' => 'This payment was cancelled before KuickPay confirmed it, so the bill is still unpaid. If money left your account, it is matched automatically once KuickPay confirms — keep reference '.$attempt->reference.'.',
            'expired' => 'This payment session closed before KuickPay confirmed a payment, so the bill is still unpaid. If money left your account, it is matched automatically once KuickPay confirms — keep reference '.$attempt->reference.'.',
            'refund_pending' => 'Your money was received but the biller could not apply it. KuickPay will return it to your account. No action is needed.',
            'refunded' => 'This payment was refunded to your account.',
            'reversed' => 'This payment was reversed. Contact your community office if the bill status does not update.',
            default => $attempt->failure_message ?: 'Your payment was not completed. You have not been charged and the bill is still unpaid.',
        };
    }

    private function tone(string $display): string
    {
        return match ($display) {
            'succeeded' => 'success',
            'processing', 'awaiting_payment', 'refund_pending' => 'pending',
            'cancelled', 'expired', 'refunded' => 'muted',
            default => 'danger',
        };
    }
}
