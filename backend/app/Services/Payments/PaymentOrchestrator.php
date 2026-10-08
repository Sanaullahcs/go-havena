<?php

namespace App\Services\Payments;

use App\Models\PaymentAttempt;
use App\Models\PaymentEvent;
use App\Models\User;
use App\Models\UtilityBill;
use App\Services\ActivityLogService;
use App\Services\Kuickpay\BillPaymentResult;
use App\Services\Kuickpay\CheckoutStatus;
use App\Services\Kuickpay\KuickpayException;
use App\Services\Kuickpay\KuickpayFormat;
use App\Services\Kuickpay\KuickpayGateway;
use App\Services\NotificationService;
use App\Services\Utilities\UtilityBillService;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Single entry point for KuickPay payments. Bills are only marked paid from
 * server-verified provider results — never from the app or a bare redirect.
 */
class PaymentOrchestrator
{
    public function __construct(
        private readonly KuickpayGateway $gateway,
        private readonly PayableResolver $payables,
        private readonly PaymentRouting $routing,
        private readonly OnlinePaymentPresenter $presenter,
        private readonly UtilityBillService $utilities,
    ) {
    }

    /**
     * Pay Now. Returns one of:
     *   outcome=redirect      open next_action.url (new or resumed checkout)
     *   outcome=processing    an earlier payment is still confirming; do not pay again
     *   outcome=already_paid  the bill is settled; nothing was charged
     *
     * @param  array{channel?: string, app_return_url?: ?string, expected_amount_paisa?: ?int}  $options
     * @return array<string, mixed>
     */
    public function pay(User $user, string $type, int $id, array $options = []): array
    {
        $payable = $this->payables->resolveForUser($type, $id, (int) $user->id);
        if (! $this->routing->kuickpayEnabled($payable->communityId)) {
            throw KuickpayException::notAvailable();
        }

        try {
            return Cache::lock('payments:pay:'.$type.':'.$id, 30)->block(10, function () use ($user, $type, $id, $payable, $options) {
                return $this->payLocked($user, $type, $id, $payable, $options);
            });
        } catch (LockTimeoutException) {
            throw KuickpayException::inProgress();
        }
    }

    /** @return array<string, mixed> */
    private function payLocked(User $user, string $type, int $id, Payable $payable, array $options): array
    {
        $existing = $this->activeAttemptFor($type, $id);
        if ($existing && $existing->isInFlight()) {
            return $this->result('processing', $existing);
        }

        if ($type === PaymentAttempt::PAYABLE_UTILITY_BILL) {
            // The utility is the source of truth: re-check status and amount right now.
            $this->utilities->refreshForPayment($id);
            $payable = $this->payables->resolveForUser($type, $id, (int) $user->id);
        }

        if ($payable->state === Payable::STATE_PAID) {
            if ($existing) {
                $this->transition($existing, PaymentAttempt::STATUS_CANCELLED, ['cancelled_at' => now()], 'superseded_bill_paid');
            }

            return ['outcome' => 'already_paid', 'payment' => null, 'next_action' => null, 'message' => 'This bill has already been paid.'];
        }
        if ($payable->state === Payable::STATE_PAYABLE && $payable->amountPaisa <= 0) {
            throw new KuickpayException('nothing_due', 'This bill has no amount due.');
        }
        if (! $payable->isPayable()) {
            throw new KuickpayException('not_payable', $payable->blockedMessage());
        }

        $expected = $options['expected_amount_paisa'] ?? null;
        if ($expected !== null && (int) $expected !== $payable->amountPaisa) {
            throw new KuickpayException(
                'amount_changed',
                'The amount due is now '.\App\Support\Currency::format($payable->amountPaisa / 100, 'PKR').'. Please review it before paying.',
                409,
                ['amount_paisa' => $payable->amountPaisa, 'amount' => round($payable->amountPaisa / 100, 2)],
            );
        }

        if ($existing) {
            $sameCheckout = (int) $existing->user_id === (int) $user->id
                && (int) $existing->amount_paisa === $payable->amountPaisa
                && $existing->provider_session_id !== null;
            if ($sameCheckout) {
                $this->event($existing, 'checkout_resumed', null, null, 'resident', (int) $user->id);

                return $this->result('redirect', $existing);
            }
            if ((int) $existing->user_id !== (int) $user->id) {
                throw new KuickpayException(
                    'payment_in_progress',
                    'Another resident of your unit started paying this bill a moment ago. Please check again in a few minutes.',
                    409,
                );
            }

            $this->transition($existing, PaymentAttempt::STATUS_CANCELLED, ['cancelled_at' => now()], 'superseded_amount_changed');
        }

        $attempt = $this->createAttempt($user, $payable, $options);

        try {
            $session = $this->gateway->createCheckoutSession($attempt, $this->returnUrl($attempt));
        } catch (KuickpayException $e) {
            $this->transition($attempt, PaymentAttempt::STATUS_FAILED, [
                'failed_at' => now(),
                'failure_code' => $e->codeKey,
                'failure_message' => $e->getMessage(),
            ], 'checkout_failed');

            throw $e;
        } catch (\Throwable $e) {
            Log::error('KuickPay checkout could not start', ['payment' => $attempt->public_id, 'error' => $e->getMessage()]);
            $this->transition($attempt, PaymentAttempt::STATUS_FAILED, [
                'failed_at' => now(),
                'failure_code' => 'checkout_unavailable',
                'failure_message' => 'We could not open KuickPay right now. You have not been charged.',
            ], 'checkout_failed');

            throw KuickpayException::unreachable();
        }

        $meta = (array) ($attempt->meta ?? []);
        $meta['redirect_url'] = $session->redirectUrl;
        $this->transition($attempt, PaymentAttempt::STATUS_AWAITING_AUTHORIZATION, [
            'provider_session_id' => $session->sessionId,
            'initiated_at' => now(),
            'meta' => $meta,
        ], 'checkout_started');

        return $this->result('redirect', $attempt->refresh());
    }

    /**
     * Handles KuickPay's redirect back to Havena. Never trusts the query string
     * without a valid signature; replays and late returns are harmless.
     *
     * @param  array<string, mixed>  $params
     */
    public function handleReturn(string $publicId, array $params): ?PaymentAttempt
    {
        $attempt = PaymentAttempt::query()->where('public_id', $publicId)->first();
        if (! $attempt) {
            return null;
        }

        $redacted = array_intersect_key($params, array_flip(['orderid', 'transactionid', 'amount', 'status', 'responsecode', 'method']));

        if ((string) ($params['orderid'] ?? '') !== (string) $attempt->provider_order_id) {
            $this->event($attempt, 'return_order_mismatch', null, null, 'provider', null, $redacted);

            return $attempt;
        }
        if (! $this->gateway->verifyReturn($params)) {
            Log::warning('KuickPay return signature rejected', ['payment' => $attempt->public_id]);
            $this->event($attempt, 'return_signature_invalid', null, null, 'provider', null, $redacted);

            return $attempt;
        }

        try {
            return Cache::lock('payments:attempt:'.$attempt->id, 60)->block(30, fn () => $this->applyReturn($attempt, $params, $redacted));
        } catch (LockTimeoutException) {
            Log::warning('KuickPay return waited too long for the attempt lock', ['payment' => $attempt->public_id]);
            $this->event($attempt, 'return_lock_timeout', null, null, 'provider', null, $redacted);

            return $attempt->refresh();
        }
    }

    /** @param  array<string, mixed>  $redacted */
    private function applyReturn(PaymentAttempt $attempt, array $params, array $redacted): PaymentAttempt
    {
        $attempt->refresh();
        $status = strtoupper(trim((string) ($params['status'] ?? '')));
        $code = (string) ($params['responsecode'] ?? '');
        $method = $this->normalizeMethod($params['method'] ?? null);
        $charged = $status === CheckoutStatus::SUCCESS && $code === '00';

        if (! $attempt->isAwaitingAuthorization()) {
            // A signed success can arrive after Havena closed the attempt, or after a signed failure (out of order).
            $lateCharge = $charged && in_array($attempt->status, [
                PaymentAttempt::STATUS_CANCELLED,
                PaymentAttempt::STATUS_EXPIRED,
                PaymentAttempt::STATUS_FAILED,
            ], true);
            if (! $lateCharge) {
                $this->event($attempt, 'return_replayed', null, null, 'provider', null, $redacted);

                return $attempt;
            }

            // KuickPay took the money after Havena had given up on this checkout.
            $this->settleLateCharge($attempt, (string) ($params['transactionid'] ?? ''), $method, $redacted);

            return $attempt->refresh();
        }

        if ($charged) {
            $this->authorize(
                $attempt,
                (string) ($params['transactionid'] ?? ''),
                KuickpayFormat::rupeesToPaisa($params['amount'] ?? null),
                $method,
                $redacted,
            );
        } elseif ($status === CheckoutStatus::CANCELLED) {
            $this->transition($attempt, PaymentAttempt::STATUS_CANCELLED, [
                'cancelled_at' => now(),
                'provider_response_code' => $code ?: null,
            ], 'checkout_cancelled', $redacted, 'provider');
        } elseif ($status === CheckoutStatus::FAILED) {
            $this->transition($attempt, PaymentAttempt::STATUS_FAILED, [
                'failed_at' => now(),
                'method' => $method,
                'provider_response_code' => $code ?: null,
                'failure_code' => 'checkout_declined',
                'failure_message' => 'Your payment was declined. You have not been charged and the bill is still unpaid.',
            ], 'checkout_failed', $redacted, 'provider');
        } else {
            $this->toPending($attempt, 'return_unrecognised', $redacted);
        }

        return $attempt->refresh();
    }

    /** Status read used by the apps. Settles stale attempts so the answer is current. */
    public function refresh(PaymentAttempt $attempt, bool $sync = false): PaymentAttempt
    {
        if (! $attempt->isActive()) {
            return $attempt;
        }

        $due = $attempt->hasExpired()
            || ($attempt->next_reconcile_at && $attempt->next_reconcile_at->isPast())
            || ($sync && Cache::add('payments:sync:'.$attempt->id, 1, 5));

        return $due ? $this->reconcile($attempt) : $attempt;
    }

    public function cancel(PaymentAttempt $attempt, User $user): PaymentAttempt
    {
        if ((int) $attempt->user_id !== (int) $user->id) {
            throw KuickpayException::notYourBill();
        }

        return Cache::lock('payments:attempt:'.$attempt->id, 30)->block(10, function () use ($attempt, $user) {
            $attempt->refresh();
            if (! $attempt->isAwaitingAuthorization()) {
                return $attempt;
            }

            // The resident may have paid on KuickPay a second before tapping cancel.
            $status = $this->gateway->checkoutStatus($attempt);
            if ($status->status === CheckoutStatus::SUCCESS) {
                $this->authorize($attempt, (string) $status->transactionId, $status->amountPaisa, $status->method, ['source' => 'status_on_cancel']);

                return $attempt->refresh();
            }

            $this->transition($attempt, PaymentAttempt::STATUS_CANCELLED, ['cancelled_at' => now()], 'cancelled_by_resident', [], 'resident', (int) $user->id);

            return $attempt->refresh();
        });
    }

    /** Brings one attempt as close to final as the provider allows. Safe to call repeatedly. */
    public function reconcile(PaymentAttempt $attempt): PaymentAttempt
    {
        try {
            return Cache::lock('payments:attempt:'.$attempt->id, 60)->block(5, fn () => $this->reconcileLocked($attempt->refresh()));
        } catch (LockTimeoutException) {
            return $attempt->refresh();
        }
    }

    private function reconcileLocked(PaymentAttempt $attempt): PaymentAttempt
    {
        if (! $attempt->isActive()) {
            return $attempt;
        }

        if ($attempt->isAwaitingAuthorization()) {
            $status = $this->gateway->checkoutStatus($attempt);
            if ($status->status === CheckoutStatus::SUCCESS) {
                $this->authorize($attempt, (string) $status->transactionId, $status->amountPaisa, $status->method, ['source' => 'reconcile']);
            } elseif ($status->status === CheckoutStatus::FAILED) {
                $this->transition($attempt, PaymentAttempt::STATUS_FAILED, [
                    'failed_at' => now(),
                    'failure_code' => 'checkout_declined',
                    'failure_message' => 'Your payment was declined. You have not been charged and the bill is still unpaid.',
                ], 'checkout_failed_reconciled');
            } elseif ($status->status === CheckoutStatus::CANCELLED) {
                $this->transition($attempt, PaymentAttempt::STATUS_CANCELLED, ['cancelled_at' => now()], 'checkout_cancelled_reconciled');
            } elseif ($attempt->hasExpired()) {
                $this->transition($attempt, PaymentAttempt::STATUS_EXPIRED, ['cancelled_at' => now()], 'expired');
            }

            return $attempt->refresh();
        }

        if ($attempt->status === PaymentAttempt::STATUS_AUTHORIZED) {
            $this->finalize($attempt);

            return $attempt->refresh();
        }

        // submitted_to_biller / pending_confirmation
        if ($attempt->payable_type === PaymentAttempt::PAYABLE_UTILITY_BILL) {
            $this->reconcileUtility($attempt);
        } else {
            $status = $this->gateway->checkoutStatus($attempt);
            if ($status->status === CheckoutStatus::SUCCESS && ($status->amountPaisa === null || $status->amountPaisa === (int) $attempt->amount_paisa)) {
                $attempt->forceFill(['needs_attention' => false])->save();
                $this->succeed($attempt, ['source' => 'reconcile']);
            } elseif (in_array($status->status, [CheckoutStatus::FAILED, CheckoutStatus::CANCELLED], true)) {
                $this->transition($attempt, PaymentAttempt::STATUS_FAILED, [
                    'failed_at' => now(),
                    'failure_code' => 'checkout_declined',
                    'failure_message' => 'Your payment was not completed. You have not been charged.',
                ], 'pending_resolved_failed');
            } else {
                $this->scheduleNext($attempt);
            }
        }

        return $attempt->refresh();
    }

    /** Expires abandoned checkouts and re-checks unresolved ones. Returns how many attempts were looked at. */
    public function reconcileDue(int $limit = 100): int
    {
        $ids = PaymentAttempt::query()
            ->whereIn('status', PaymentAttempt::ACTIVE_STATUSES)
            ->where(function ($query) {
                $query->where(function ($q) {
                    $q->whereIn('status', [PaymentAttempt::STATUS_CREATED, PaymentAttempt::STATUS_AWAITING_AUTHORIZATION])
                        ->where('expires_at', '<=', now());
                })->orWhere(function ($q) {
                    $q->whereNotNull('next_reconcile_at')->where('next_reconcile_at', '<=', now());
                })->orWhere(function ($q) {
                    $q->where('status', PaymentAttempt::STATUS_AUTHORIZED)->where('updated_at', '<=', now()->subMinute());
                });
            })
            ->orderBy('id')
            ->limit($limit)
            ->pluck('id');

        foreach ($ids as $id) {
            $attempt = PaymentAttempt::query()->find($id);
            if ($attempt) {
                $this->reconcile($attempt);
            }
        }

        return $ids->count();
    }

    /** Admin marks a refund_pending attempt as refunded once KuickPay confirms the refund. */
    public function markRefunded(PaymentAttempt $attempt, User $admin, ?string $note = null): PaymentAttempt
    {
        if ($attempt->status !== PaymentAttempt::STATUS_REFUND_PENDING) {
            throw new KuickpayException('not_refundable', 'Only payments waiting for a refund can be marked refunded.');
        }

        $this->transition($attempt, PaymentAttempt::STATUS_REFUNDED, ['needs_attention' => false], 'refund_recorded', ['note' => $note], 'admin', (int) $admin->id);
        NotificationService::send(
            (int) $attempt->user_id,
            'info',
            'Payment refunded',
            'Your '.$attempt->formattedAmount().' payment for '.$attempt->title.' has been refunded.',
            $this->appPath($attempt),
            ['kind' => 'payment_refunded', 'payment_id' => $attempt->public_id],
        );
        app(\App\Services\PaymentMailService::class)->onlinePayment($attempt, 'refunded');

        return $attempt->refresh();
    }

    /**
     * Records a payment KuickPay collected through its own channels (bank app,
     * ATM, wallet) for a Havena bill. Used by the Institution bill-payment endpoint.
     */
    public function recordChannelPayment(Payable $payable, string $tranAuthId, int $paidPaisa, ?string $bankMnemonic): PaymentAttempt
    {
        $payerId = $payable->payerIds[0] ?? null;
        abort_if(! $payerId, 422, 'Bill has no payer.');

        $attempt = PaymentAttempt::query()->create([
            'public_id' => (string) Str::uuid(),
            'reference' => $this->newReference(),
            'community_id' => $payable->communityId,
            'user_id' => $payerId,
            'unit_id' => $payable->unitId,
            'provider' => PaymentAttempt::PROVIDER_KUICKPAY,
            'payable_type' => $payable->type,
            'payable_id' => $payable->id,
            'title' => $payable->title,
            'subtitle' => $payable->subtitle,
            'amount_paisa' => $paidPaisa,
            'currency' => 'PKR',
            'status' => PaymentAttempt::STATUS_AUTHORIZED,
            'idempotency_key' => 'kp-'.$tranAuthId.'-'.Str::lower(Str::random(10)),
            'channel' => PaymentAttempt::CHANNEL_KUICKPAY,
            'method' => $bankMnemonic ? 'bank' : null,
            'provider_auth_id' => $tranAuthId,
            'provider_transaction_id' => $tranAuthId,
            'simulated' => $this->gateway->isSimulated(),
            'initiated_at' => now(),
            'authorized_at' => now(),
            'meta' => ['bank_mnemonic' => $bankMnemonic],
        ]);
        $this->event($attempt, 'channel_payment_received', null, PaymentAttempt::STATUS_AUTHORIZED, 'provider', null, [
            'bank_mnemonic' => $bankMnemonic,
            'tran_auth_id' => $tranAuthId,
        ]);

        $this->succeed($attempt, ['source' => 'institution']);

        return $attempt->refresh();
    }

    // ─── internals ────────────────────────────────────────────────────────────

    /** @param  array<string, mixed>  $data */
    private function settleLateCharge(PaymentAttempt $attempt, string $transactionId, ?string $method, array $data): void
    {
        $payable = $this->payables->resolve($attempt->payable_type, (int) $attempt->payable_id);
        $other = $this->presenter->activeAttempt($attempt->payable_type, (int) $attempt->payable_id);
        $attempt->forceFill([
            'provider_transaction_id' => $transactionId ?: $attempt->provider_transaction_id,
            'method' => $method ?? $attempt->method,
        ])->save();

        if ($payable && $payable->isPayable() && ! $other) {
            $this->transition($attempt, PaymentAttempt::STATUS_AUTHORIZED, [
                'authorized_at' => now(),
                'active_lock' => $attempt->lockKey(),
            ], 'late_charge_applied', $data, 'provider');
            $this->finalize($attempt->refresh());

            return;
        }

        $this->refundPending($attempt, 'late_charge', 'This payment arrived after the checkout had closed and the bill was already settled.');
    }

    /** @param  array<string, mixed>  $data */
    private function authorize(PaymentAttempt $attempt, string $transactionId, ?int $amountPaisa, ?string $method, array $data): void
    {
        if ($amountPaisa !== null && $amountPaisa !== (int) $attempt->amount_paisa) {
            // Charged a different amount than the bill: hold for review rather than settle.
            $attempt->forceFill([
                'needs_attention' => true,
                'provider_transaction_id' => $transactionId ?: null,
                'failure_code' => 'amount_mismatch',
                'failure_message' => 'KuickPay reported '.KuickpayFormat::rupees($amountPaisa).' instead of '.KuickpayFormat::rupees((int) $attempt->amount_paisa).'.',
            ])->save();
            $this->toPending($attempt, 'amount_mismatch', $data);
            $this->notifyAdmins($attempt, 'Payment needs review', $attempt->title.' was paid with an unexpected amount. Open Payments to review it.');

            return;
        }

        $this->transition($attempt, PaymentAttempt::STATUS_AUTHORIZED, [
            'authorized_at' => now(),
            'provider_transaction_id' => $transactionId ?: $attempt->provider_transaction_id,
            'method' => $method ?? $attempt->method,
        ], 'checkout_authorized', $data, 'provider');

        $this->finalize($attempt->refresh());
    }

    /** Customer money is authorised; settle the bill. Utilities additionally need the biller's confirmation. */
    private function finalize(PaymentAttempt $attempt): void
    {
        if ($attempt->payable_type !== PaymentAttempt::PAYABLE_UTILITY_BILL) {
            $this->succeed($attempt, []);

            return;
        }

        $bill = UtilityBill::query()->with('account.biller')->find($attempt->payable_id);
        $account = $bill?->account;
        $biller = $account?->biller;
        if (! $bill || ! $account || ! $biller) {
            $this->refundPending($attempt, 'utility_missing', 'This utility account was removed before the payment could be applied.');

            return;
        }

        $tranAuthId = $attempt->provider_auth_id
            ?: ($bill->provider_tran_auth_id ?: str_pad((string) ($attempt->id % 1000000), 6, '0', STR_PAD_LEFT));

        $this->transition($attempt, PaymentAttempt::STATUS_SUBMITTED, [
            'submitted_at' => now(),
            'provider_auth_id' => $tranAuthId,
        ], 'biller_payment_submitted');

        try {
            $result = $this->gateway->billPayment(
                $biller,
                $account->reference(),
                $tranAuthId,
                (int) $attempt->amount_paisa,
                (string) $bill->billing_month,
            );
        } catch (\Throwable $e) {
            Log::error('KuickPay bill payment threw', ['payment' => $attempt->public_id, 'error' => $e->getMessage()]);
            $result = new BillPaymentResult(BillPaymentResult::UNKNOWN, message: 'exception');
        }

        match ($result->outcome) {
            BillPaymentResult::SUCCESS => $this->succeed($attempt, ['receipt_id' => $result->receiptId, 'response_code' => $result->responseCode]),
            BillPaymentResult::ALREADY_PAID => $this->handleBillerAlreadyPaid($attempt, $bill),
            BillPaymentResult::REJECTED => $this->refundPending($attempt, 'biller_rejected', 'The biller did not accept this payment.', $result->responseCode),
            default => $this->toPending($attempt, 'biller_outcome_unknown', ['response_code' => $result->responseCode]),
        };
    }

    private function handleBillerAlreadyPaid(PaymentAttempt $attempt, UtilityBill $bill): void
    {
        $this->utilities->refreshForPayment((int) $bill->id);
        $this->refundPending($attempt, 'bill_already_paid', 'This bill was already paid elsewhere before your payment reached the biller.');
    }

    /** @param  array<string, mixed>  $data */
    private function succeed(PaymentAttempt $attempt, array $data): void
    {
        $applied = false;
        $transitioned = false;
        DB::transaction(function () use ($attempt, $data, &$applied, &$transitioned) {
            $locked = PaymentAttempt::query()->whereKey($attempt->id)->lockForUpdate()->first();
            if (! $locked || $locked->status === PaymentAttempt::STATUS_SUCCEEDED) {
                return;
            }

            $transitioned = true;
            $applied = $this->payables->markPaid($locked);
            $this->transition($locked, PaymentAttempt::STATUS_SUCCEEDED, [
                'confirmed_at' => now(),
                'provider_receipt_id' => $data['receipt_id'] ?? $locked->provider_receipt_id,
                'provider_response_code' => $data['response_code'] ?? $locked->provider_response_code,
                'needs_attention' => ! $applied,
                'failure_code' => $applied ? null : 'bill_already_settled',
                'failure_message' => $applied ? null : 'The bill was already settled when this payment arrived; refund may be needed.',
                'next_reconcile_at' => null,
            ], 'succeeded', $data);
        });

        $attempt->refresh();
        if (! $transitioned || ! $attempt->isSucceeded()) {
            // Another worker already confirmed this payment and sent its notifications.
            return;
        }

        try {
            $this->announceSuccess($attempt, $applied);
        } catch (\Throwable $e) {
            // The payment is committed; a notification or audit-log failure must not surface as a payment error.
            Log::error('KuickPay success follow-up failed', ['payment' => $attempt->public_id, 'error' => $e->getMessage()]);
        }
    }

    private function announceSuccess(PaymentAttempt $attempt, bool $applied): void
    {
        NotificationService::send(
            (int) $attempt->user_id,
            'success',
            'Payment successful',
            'You paid '.$attempt->formattedAmount().' for '.$attempt->title.'. Reference '.$attempt->reference.'.',
            $this->appPath($attempt),
            ['kind' => 'payment_succeeded', 'payment_id' => $attempt->public_id],
        );
        app(\App\Services\PaymentMailService::class)->onlinePayment($attempt, 'succeeded');
        $payer = $attempt->user?->name ?: 'A resident';
        $this->notifyAdmins(
            $attempt,
            $applied ? 'Payment received' : 'Duplicate payment received',
            $applied
                ? $payer.' paid '.$attempt->formattedAmount().' for '.$attempt->title.' with KuickPay.'
                : $payer.' paid '.$attempt->formattedAmount().' for '.$attempt->title.', but it was already settled. A refund may be needed.',
        );
        ActivityLogService::user(
            'kuickpay_payment_succeeded',
            $payer.' paid '.$attempt->formattedAmount().' · '.$attempt->title,
            PaymentAttempt::class,
            (int) $attempt->id,
            'info',
            (int) $attempt->user_id,
            ['community_id' => $attempt->community_id, 'related_item' => $attempt->reference],
        );
    }

    private function refundPending(PaymentAttempt $attempt, string $code, string $reason, ?string $responseCode = null): void
    {
        $this->transition($attempt, PaymentAttempt::STATUS_REFUND_PENDING, [
            'failed_at' => now(),
            'needs_attention' => true,
            'failure_code' => $code,
            'failure_message' => $reason,
            'provider_response_code' => $responseCode,
            'next_reconcile_at' => null,
        ], 'refund_pending', ['reason' => $code]);

        NotificationService::send(
            (int) $attempt->user_id,
            'warning',
            'Payment will be refunded',
            $reason.' Your '.$attempt->formattedAmount().' will be returned to your account. Your bill is still unpaid.',
            $this->appPath($attempt),
            ['kind' => 'payment_refund_pending', 'payment_id' => $attempt->public_id],
        );
        app(\App\Services\PaymentMailService::class)->onlinePayment($attempt, 'refund_pending');
        $this->notifyAdmins($attempt, 'Payment needs a refund', $attempt->title.': '.$reason);
    }

    /** @param  array<string, mixed>  $data */
    private function toPending(PaymentAttempt $attempt, string $event, array $data = []): void
    {
        $this->transition($attempt, PaymentAttempt::STATUS_PENDING_CONFIRMATION, [
            'next_reconcile_at' => now()->addMinutes($this->backoff(0)),
        ], $event, $data);
    }

    private function reconcileUtility(PaymentAttempt $attempt): void
    {
        $bill = UtilityBill::query()->with('account.biller')->find($attempt->payable_id);
        if (! $bill || ! $bill->account || ! $bill->account->biller) {
            $this->scheduleNext($attempt);

            return;
        }

        $result = $this->gateway->billInquiry($bill->account->biller, $bill->account->reference());
        $paidSinceAttempt = $result->outcome === \App\Services\Kuickpay\BillInquiryResult::PAID
            && (
                ($result->tranAuthId !== null && $result->tranAuthId === $attempt->provider_auth_id)
                || ($result->amountPaidPaisa === (int) $attempt->amount_paisa
                    && ($result->datePaid === null || $result->datePaid->gte(($attempt->submitted_at ?? $attempt->created_at)->copy()->startOfDay())))
            );

        if ($paidSinceAttempt) {
            $this->succeed($attempt, ['source' => 'reconcile_inquiry']);

            return;
        }

        $age = ($attempt->submitted_at ?? $attempt->created_at)->diffInMinutes(now());
        if ($result->outcome === \App\Services\Kuickpay\BillInquiryResult::FOUND && $attempt->reconcile_attempts >= 3 && $age >= 15) {
            // The biller still shows the bill unpaid long after submission: it never landed.
            $this->refundPending($attempt, 'biller_not_confirmed', 'The biller did not confirm this payment.');

            return;
        }

        $this->scheduleNext($attempt);
    }

    private function scheduleNext(PaymentAttempt $attempt): void
    {
        $tries = (int) $attempt->reconcile_attempts + 1;
        $started = $attempt->submitted_at ?? $attempt->authorized_at ?? $attempt->created_at;
        $maxHours = max(1, (int) config('kuickpay.reconcile_max_hours', 72));

        if ($started->diffInHours(now()) >= $maxHours) {
            $attempt->forceFill([
                'reconcile_attempts' => $tries,
                'next_reconcile_at' => null,
                'needs_attention' => true,
            ])->save();
            $this->event($attempt, 'reconcile_exhausted');
            $this->notifyAdmins($attempt, 'Payment still unconfirmed', $attempt->title.' ('.$attempt->reference.') has not been confirmed by KuickPay. Please follow up.');

            return;
        }

        $attempt->forceFill([
            'reconcile_attempts' => $tries,
            'next_reconcile_at' => now()->addMinutes($this->backoff($tries)),
        ])->save();
        $this->event($attempt, 'reconcile_scheduled', null, null, 'system', null, ['attempt' => $tries]);
    }

    private function backoff(int $tries): int
    {
        $steps = (array) config('kuickpay.reconcile_backoff_minutes', [1, 5, 15, 30, 60]);

        return (int) ($steps[min($tries, count($steps) - 1)] ?? 60);
    }

    private function createAttempt(User $user, Payable $payable, array $options): PaymentAttempt
    {
        $channel = in_array($options['channel'] ?? null, [PaymentAttempt::CHANNEL_WEB, PaymentAttempt::CHANNEL_MOBILE], true)
            ? $options['channel']
            : PaymentAttempt::CHANNEL_MOBILE;

        $attributes = [
            'public_id' => (string) Str::uuid(),
            'community_id' => $payable->communityId,
            'user_id' => (int) $user->id,
            'unit_id' => $payable->unitId,
            'provider' => PaymentAttempt::PROVIDER_KUICKPAY,
            'payable_type' => $payable->type,
            'payable_id' => $payable->id,
            'title' => mb_substr($payable->title, 0, 200),
            'subtitle' => $payable->subtitle ? mb_substr($payable->subtitle, 0, 200) : null,
            'amount_paisa' => $payable->amountPaisa,
            'currency' => 'PKR',
            'status' => PaymentAttempt::STATUS_CREATED,
            'idempotency_key' => (string) Str::uuid(),
            'active_lock' => $payable->type.':'.$payable->id,
            'channel' => $channel,
            'app_return_url' => $this->safeAppReturnUrl($options['app_return_url'] ?? null),
            'launch_token' => Str::random(48),
            'simulated' => $this->gateway->isSimulated(),
            'expires_at' => now()->addMinutes(max(5, (int) config('kuickpay.attempt_ttl_minutes', 30))),
        ];

        for ($try = 0; $try < 3; $try++) {
            $reference = $this->newReference();
            try {
                $attempt = PaymentAttempt::query()->create($attributes + [
                    'reference' => $reference,
                    'provider_order_id' => $reference,
                ]);
                $this->event($attempt, 'created', null, PaymentAttempt::STATUS_CREATED, 'resident', (int) $user->id, [
                    'amount_paisa' => $payable->amountPaisa,
                    'channel' => $channel,
                ]);

                return $attempt;
            } catch (QueryException $e) {
                if (! $this->isUniqueViolation($e)) {
                    throw $e;
                }
                if ($this->activeAttemptFor($payable->type, $payable->id)) {
                    // Another request won the race for this bill.
                    throw KuickpayException::inProgress();
                }
            }
        }

        throw KuickpayException::unreachable();
    }

    private function activeAttemptFor(string $type, int $id): ?PaymentAttempt
    {
        $attempt = PaymentAttempt::query()
            ->where('payable_type', $type)
            ->where('payable_id', $id)
            ->whereIn('status', PaymentAttempt::ACTIVE_STATUSES)
            ->latest('id')
            ->first();

        if ($attempt && $attempt->hasExpired()) {
            $this->reconcileLocked($attempt);
            $attempt->refresh();

            return $attempt->isActive() ? $attempt : null;
        }

        return $attempt;
    }

    /** @return array<string, mixed> */
    private function result(string $outcome, PaymentAttempt $attempt): array
    {
        $payload = $this->presenter->attempt($attempt);

        return [
            'outcome' => $outcome,
            'payment' => $payload,
            'next_action' => $outcome === 'redirect' && $payload['resume_url']
                ? ['type' => 'redirect', 'url' => $payload['resume_url'], 'expires_at' => $payload['expires_at']]
                : null,
            'message' => $outcome === 'processing'
                ? 'A payment for this bill is already being processed. Please do not pay again.'
                : null,
        ];
    }

    /**
     * @param  array<string, mixed>  $attributes
     * @param  array<string, mixed>  $data
     */
    private function transition(
        PaymentAttempt $attempt,
        string $to,
        array $attributes,
        string $event,
        array $data = [],
        string $actorType = 'system',
        ?int $actorId = null,
    ): void {
        $from = $attempt->status;
        $attempt->fill($attributes);
        $attempt->status = $to;
        if (! in_array($to, PaymentAttempt::ACTIVE_STATUSES, true)) {
            $attempt->active_lock = null;
            $attempt->launch_token = null;
            if (! in_array($to, [PaymentAttempt::STATUS_REFUND_PENDING], true)) {
                $attempt->next_reconcile_at = null;
            }
        }
        $attempt->save();
        $this->event($attempt, $event, $from, $to, $actorType, $actorId, $data);
    }

    /** @param  array<string, mixed>  $data */
    private function event(
        PaymentAttempt $attempt,
        string $event,
        ?string $from = null,
        ?string $to = null,
        string $actorType = 'system',
        ?int $actorId = null,
        array $data = [],
    ): void {
        PaymentEvent::query()->create([
            'payment_attempt_id' => $attempt->id,
            'event' => $event,
            'status_from' => $from,
            'status_to' => $to,
            'actor_type' => $actorType,
            'actor_id' => $actorId,
            'data' => $data !== [] ? $data : null,
        ]);
    }

    private function notifyAdmins(PaymentAttempt $attempt, string $title, string $body): void
    {
        $adminIds = DB::table('community_memberships as cm')
            ->join('users', 'users.id', '=', 'cm.user_id')
            ->where('cm.community_id', $attempt->community_id)
            ->where('cm.role', 'admin')
            ->where('cm.status', 'approved')
            ->where('users.status', '!=', 'deleted')
            ->pluck('users.id');

        foreach ($adminIds as $adminId) {
            NotificationService::send(
                (int) $adminId,
                $title === 'Payment received' ? 'success' : 'warning',
                $title,
                $body,
                '/screens/admin-payments',
                ['kind' => 'admin_payment', 'payment_id' => $attempt->public_id],
            );
        }
    }

    private function returnUrl(PaymentAttempt $attempt): string
    {
        return rtrim((string) config('kuickpay.public_api_url'), '/').'/api/v1/payments/kuickpay/return/'.$attempt->public_id;
    }

    private function appPath(PaymentAttempt $attempt): string
    {
        return '/screens/payment-result?id='.$attempt->public_id;
    }

    private function safeAppReturnUrl(?string $url): ?string
    {
        $url = trim((string) $url);
        if ($url === '' || strlen($url) > 500) {
            return null;
        }

        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));

        return in_array($scheme, (array) config('kuickpay.app_return_schemes', ['havena']), true) ? $url : null;
    }

    private function normalizeMethod(mixed $method): ?string
    {
        $value = strtolower(trim((string) $method));
        $allowed = array_column((array) config('kuickpay.methods', []), 'id');

        return in_array($value, $allowed, true) ? $value : null;
    }

    private function newReference(): string
    {
        return 'HVN-'.now()->format('ymd').'-'.strtoupper(Str::random(6));
    }

    private function isUniqueViolation(QueryException $e): bool
    {
        $code = (string) ($e->errorInfo[0] ?? $e->getCode());

        return $code === '23000' || $code === '23505' || str_contains(strtolower($e->getMessage()), 'unique');
    }
}
