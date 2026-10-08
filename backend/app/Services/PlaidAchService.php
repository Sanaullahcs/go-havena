<?php

namespace App\Services;

use App\Exceptions\PlaidException;
use App\Models\Community;
use App\Models\CommunityPlaidConnection;
use App\Models\PlaidTransfer;
use App\Models\PlaidTransferEvent;
use App\Models\ResidentPlaidConnection;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Plaid Transfer money movement: resident debit into the Havena Plaid Ledger,
 * then a credit from the ledger to the community bank.
 *
 * Status truth comes only from Plaid (`/transfer/event/sync`, `/transfer/get`).
 */
class PlaidAchService
{
    public const READY = 'ready';

    private const DEBIT_STATUS_MAP = [
        'pending' => PlaidTransfer::STATUS_PROCESSING,
        'posted' => PlaidTransfer::STATUS_POSTED,
        'settled' => PlaidTransfer::STATUS_SETTLED,
        'funds_available' => PlaidTransfer::STATUS_SETTLED,
        'failed' => PlaidTransfer::STATUS_FAILED,
        'cancelled' => PlaidTransfer::STATUS_CANCELLED,
        'returned' => PlaidTransfer::STATUS_RETURNED,
    ];

    private const REFUND_RANK = [
        PlaidTransfer::REFUND_PENDING => 0,
        PlaidTransfer::REFUND_POSTED => 1,
        PlaidTransfer::REFUND_SETTLED => 2,
    ];

    private const REFUND_TERMINAL = [
        PlaidTransfer::REFUND_FAILED,
        PlaidTransfer::REFUND_CANCELLED,
        PlaidTransfer::REFUND_RETURNED,
    ];

    public function __construct(
        private readonly PlaidService $plaid,
        private readonly PlaidResidentService $residents,
        private readonly PlaidEligibilityService $eligibility,
        private readonly PlaidHttpClient $http,
        private readonly AmenitySharedBillService $bills,
    ) {
    }

    /**
     * Why a community can or cannot start new bank payments right now.
     *
     * @return array{ready: bool, reason: string, message: string}
     */
    public function readiness(int $communityId): array
    {
        $fail = fn (string $reason, string $message) => ['ready' => false, 'reason' => $reason, 'message' => $message];

        if (! $this->eligibility->isCommunityEligible($communityId)) {
            return $fail('not_eligible', 'US bank payments are not available for this community.');
        }
        $communityStatus = (string) (Community::query()->whereKey($communityId)->value('status') ?? 'active');
        if ($communityStatus !== 'active') {
            return $fail('community_inactive', 'This community is not active, so new bank payments are paused.');
        }
        if (! $this->plaid->configured()) {
            return $fail('not_configured', 'Bank payments are not configured on the server.');
        }
        if (! (bool) config('plaid.transfer.enabled', true)) {
            return $fail('disabled_globally', 'Bank payments are turned off right now.');
        }
        if ($this->sandboxBlockedInProduction()) {
            return $fail('sandbox_in_production', 'Bank payments are in test mode and cannot be used on the live site.');
        }

        $bank = CommunityPlaidConnection::query()->where('community_id', $communityId)->first();
        if ($bank?->paymentsPaused()) {
            return $fail('paused', 'Bank payments are paused for this community.');
        }
        if (! $bank || ! $bank->isConnected()) {
            return $fail(
                $bank?->needsReconnect() ? 'community_bank_needs_attention' : 'community_bank_missing',
                'This community has not connected a receiving bank yet. Upload payment proof instead.',
            );
        }

        return ['ready' => true, 'reason' => self::READY, 'message' => 'Ready'];
    }

    /**
     * @return array<string, mixed>
     */
    public function capability(User $user, ?int $communityId = null): array
    {
        $communityId = $this->residents->resolveCommunityId($user, $communityId);
        $community = Community::query()->find($communityId);
        $communityBank = CommunityPlaidConnection::query()->where('community_id', $communityId)->first();
        $residentBank = $this->residents->findActive($user->id, $communityId);
        $eligible = $this->eligibility->isCommunityEligible($communityId);
        $readiness = $this->readiness($communityId);
        $communityReady = $communityBank?->isConnected() === true;

        return [
            'plaid_available' => $eligible,
            'ach_enabled' => $readiness['ready'],
            'readiness' => $readiness,
            'community' => [
                'id' => $communityId,
                'name' => $community?->name,
                'bank_connected' => $communityReady,
                'payments_paused' => $communityBank?->paymentsPaused() ?? false,
                'institution_name' => $communityBank?->institution_name,
                'account_mask' => $communityBank?->account_mask,
                'needs_reconnect' => $communityBank?->needsReconnect() ?? false,
            ],
            'resident' => $residentBank
                ? $residentBank->toPublicPayload()
                : [
                    'connected' => false,
                    'status' => 'not_connected',
                    'needs_reconnect' => false,
                ],
            'can_pay_with_bank' => $readiness['ready'] && $residentBank?->isConnected() === true,
            'requires_resident_link' => $readiness['ready'] && $residentBank?->isConnected() !== true,
            'fallback_proof' => true,
            'environment' => $this->plaid->environment(),
            'transfer_mode' => $this->forceSimulate() ? 'simulated' : 'live',
            'live_transfer_ready' => $readiness['ready'] && ! $this->forceSimulate(),
        ];
    }

    /**
     * @param  array<string, mixed>  $context  ip_address / user_agent of the initiating request
     */
    public function payBooking(User $user, int $bookingId, array $context = []): PlaidTransfer
    {
        $booking = DB::table('bookings')
            ->join('amenities', 'amenities.id', '=', 'bookings.amenity_id')
            ->where('bookings.id', $bookingId)
            ->where('bookings.user_id', $user->id)
            ->select('bookings.*', 'amenities.community_id', 'amenities.name as amenity_name')
            ->first();

        if (! $booking) {
            throw PlaidException::transferFailed('Booking not found.');
        }

        if (! in_array((string) $booking->status, ['pending', 'awaiting_payment', 'confirmed'], true)) {
            throw PlaidException::chargeNotPayable('This reservation is no longer active, so it cannot be paid.');
        }

        $amount = round((float) ($booking->booking_fee ?? 0), 2);
        if ($amount <= 0) {
            throw PlaidException::transferFailed('This booking does not have a fee to collect.');
        }

        return $this->collect(
            $user,
            (int) $booking->community_id,
            $amount,
            PlaidTransfer::PURPOSE_BOOKING_FEE,
            PlaidTransfer::PAYABLE_BOOKING,
            (int) $booking->id,
            trim((string) ($booking->amenity_name ?: 'Amenity')).' fee',
            ['amenity_name' => $booking->amenity_name],
            $context,
        );
    }

    /**
     * @param  array<string, mixed>  $context
     */
    public function paySharedBill(User $user, int $amenityId, int $residentBillId, array $context = []): PlaidTransfer
    {
        $bill = $this->bills->findOwnedResidentBill($amenityId, $residentBillId, $user->id);
        if (! $bill) {
            throw PlaidException::transferFailed('Bill not found.');
        }

        $this->bills->assertCanPayWithBank((string) ($bill->resident_status ?? ''));

        $amount = round((float) ($bill->resident_amount ?? $bill->amount_per_resident ?? 0), 2);
        if ($amount <= 0) {
            throw PlaidException::transferFailed('This bill does not have an amount to collect.');
        }

        return $this->collect(
            $user,
            (int) $bill->community_id,
            $amount,
            PlaidTransfer::PURPOSE_SHARED_BILL,
            PlaidTransfer::PAYABLE_SHARED_BILL,
            (int) $bill->resident_bill_id,
            trim((string) ($bill->amenity_name ?: 'Amenity')).' bill',
            [
                'amenity_id' => (int) $bill->amenity_id,
                'amenity_name' => $bill->amenity_name ?? null,
                'billing_month' => $bill->billing_month ?? null,
            ],
            $context,
        );
    }

    /**
     * @param  array<string, mixed>  $meta
     * @param  array<string, mixed>  $context
     */
    public function collect(
        User $user,
        int $communityId,
        float $amount,
        string $purpose,
        string $payableType,
        int $payableId,
        string $description,
        array $meta = [],
        array $context = [],
    ): PlaidTransfer {
        $this->plaid->assertConfigured();
        $readiness = $this->readiness($communityId);
        if (! $readiness['ready']) {
            if (in_array($readiness['reason'], ['community_bank_missing', 'community_bank_needs_attention'], true)) {
                throw PlaidException::communityBankRequired();
            }
            if ($readiness['reason'] === 'not_eligible') {
                throw PlaidException::notAvailable();
            }

            throw PlaidException::paymentsUnavailable($readiness['reason'], $readiness['message']);
        }

        $amount = round($amount, 2);
        if ($amount <= 0) {
            throw PlaidException::transferFailed('Payment amount must be greater than zero.');
        }

        $communityBank = CommunityPlaidConnection::query()->where('community_id', $communityId)->firstOrFail();
        $residentBank = $this->residents->findActive($user->id, $communityId);
        if (! $residentBank) {
            throw PlaidException::residentNotConnected();
        }

        $transfer = DB::transaction(function () use (
            $user, $communityId, $amount, $purpose, $payableType, $payableId, $description, $meta, $context,
            $residentBank, $communityBank,
        ) {
            $this->lockPayable($payableType, $payableId);

            $previous = PlaidTransfer::query()
                ->where('payable_type', $payableType)
                ->where('payable_id', $payableId)
                ->whereNotIn('status', PlaidTransfer::TERMINAL_STATUSES)
                ->lockForUpdate()
                ->get();

            foreach ($previous as $existing) {
                if ($existing->coversCharge()) {
                    throw PlaidException::paymentAlreadySettled();
                }
                if ($existing->isPending()) {
                    throw PlaidException::transferInProgress();
                }
            }

            return PlaidTransfer::query()->create([
                'public_id' => (string) Str::uuid(),
                'community_id' => $communityId,
                'user_id' => $user->id,
                'purpose' => $purpose,
                'payable_type' => $payableType,
                'payable_id' => $payableId,
                'amount' => $amount,
                'currency' => (string) config('plaid.transfer.currency', 'USD'),
                'status' => PlaidTransfer::STATUS_AUTHORIZING,
                'provider' => 'plaid',
                'simulated' => false,
                'description' => $this->achDescription($description),
                'idempotency_key' => (string) Str::uuid(),
                'source_institution' => $residentBank->institution_name,
                'source_account_mask' => $residentBank->account_mask,
                'destination_institution' => $communityBank->institution_name,
                'destination_account_mask' => $communityBank->account_mask,
                'meta' => array_merge($meta, array_filter([
                    'initiated_ip' => $context['ip_address'] ?? null,
                    'initiated_user_agent' => isset($context['user_agent']) ? mb_substr((string) $context['user_agent'], 0, 255) : null,
                    'destination_community_bank_id' => $communityBank->id,
                    'destination_item_id' => $communityBank->plaid_item_id,
                ])),
            ]);
        });

        try {
            $this->execute($transfer, $residentBank, $communityBank, $user, $context);
        } catch (PlaidException $e) {
            $message = $this->residentFacingPlaidMessage($e->getMessage());
            $this->markFailed($transfer, $e->codeKey, $message);
            $this->syncPayable($transfer);
            $this->logTransfer($transfer, $user, 'plaid_ach_failed');
            if ($message !== $e->getMessage()) {
                throw PlaidException::transferFailed($message);
            }

            throw $e;
        } catch (\Throwable $e) {
            $message = $this->publicTransferError($e);
            $this->markFailed($transfer, 'PLAID_TRANSFER_FAILED', $message);
            $this->syncPayable($transfer);
            $this->logTransfer($transfer, $user, 'plaid_ach_failed');
            throw PlaidException::transferFailed($message);
        }

        $transfer->refresh();
        $this->syncPayable($transfer);
        $this->logTransfer($transfer, $user, 'plaid_ach_initiated');

        return $transfer;
    }

    /**
     * Undo a resident payment because the charge it paid for was cancelled.
     * Pending debits are cancelled at Plaid; posted/settled debits are refunded.
     * Never changes local state without a matching provider action.
     */
    public function reverseForCancellation(PlaidTransfer $transfer, User $actor, string $reason): PlaidTransfer
    {
        if ($transfer->canCancel()) {
            return $this->cancel($transfer, $actor, $reason);
        }

        if ($transfer->canRefund()) {
            return $this->refund($transfer, $actor, $reason);
        }

        if ($transfer->isPending() || ($transfer->isSuccessful() && ! $transfer->refundActive())) {
            $this->flagException(
                $transfer,
                PlaidTransfer::EXCEPTION_REFUND_REQUIRED,
                'The charge was cancelled ('.$reason.') but this bank payment could not be cancelled or refunded automatically.',
            );
            $this->logTransfer($transfer, $actor, 'plaid_ach_refund_required');
        }

        return $transfer->fresh() ?? $transfer;
    }

    public function cancel(PlaidTransfer $transfer, User $actor, string $reason): PlaidTransfer
    {
        if (! $transfer->canCancel()) {
            throw PlaidException::transferFailed('This bank payment can no longer be cancelled.');
        }

        if ($transfer->simulated) {
            $this->applyDebitStatus($transfer, 'cancelled', [], 'simulated_cancel');
            $this->logTransfer($transfer->fresh(), $actor, 'plaid_ach_cancelled', ['reason' => $reason]);

            return $transfer->fresh() ?? $transfer;
        }

        $current = $this->fetchTransfer((string) $transfer->debit_transfer_id);
        if ($current !== null) {
            $this->applyDebitStatus($transfer, (string) data_get($current, 'status', ''), $this->failureFrom($current), 'refresh');
            $transfer->refresh();
        }

        if ($current === null || ! (bool) data_get($current, 'cancellable', false)) {
            return $transfer->canRefund()
                ? $this->refund($transfer, $actor, $reason)
                : $this->reverseRequiresReview($transfer, $actor, $reason);
        }

        try {
            $this->http->post('/transfer/cancel', ['transfer_id' => $transfer->debit_transfer_id]);
        } catch (PlaidException $e) {
            Log::warning('Plaid transfer cancel rejected', ['transfer' => $transfer->public_id, 'code' => $e->codeKey]);

            return $this->reverseRequiresReview($transfer, $actor, $reason);
        }

        $this->applyDebitStatus($transfer, 'cancelled', [], 'cancel');
        $transfer->refresh();
        $this->cancelCreditIfPossible($transfer);
        $this->logTransfer($transfer->fresh(), $actor, 'plaid_ach_cancelled', ['reason' => $reason]);

        return $transfer->fresh() ?? $transfer;
    }

    /** Full refund of a collected debit. Refund outcome is tracked in refund_status until Plaid settles it. */
    public function refund(PlaidTransfer $transfer, User $actor, string $reason = 'Charge cancelled'): PlaidTransfer
    {
        $transfer = DB::transaction(function () use ($transfer, $actor, $reason) {
            $locked = PlaidTransfer::query()->lockForUpdate()->findOrFail($transfer->id);
            if (! $locked->canRefund()) {
                throw PlaidException::transferFailed('This bank payment cannot be refunded.');
            }

            $locked->fill([
                'refund_status' => PlaidTransfer::REFUND_PENDING,
                'refund_amount' => $locked->amount,
                'refund_reason' => mb_substr($reason, 0, 255),
                'refund_requested_by' => $actor->id,
                'refund_requested_at' => now(),
            ])->save();

            return $locked;
        });
        $this->syncPayable($transfer);

        if ($transfer->simulated) {
            $transfer->fill(['refund_transfer_id' => 'sim_refund_'.Str::lower(Str::random(12))])->save();
            $this->applyRefundStatus($transfer, PlaidTransfer::REFUND_SETTLED, [], 'simulated_refund');
            $this->logTransfer($transfer->fresh(), $actor, 'plaid_ach_refund_requested', ['reason' => $reason]);

            return $transfer->fresh() ?? $transfer;
        }

        try {
            $payload = $this->http->post('/transfer/refund/create', [
                'transfer_id' => $transfer->debit_transfer_id,
                'amount' => number_format((float) $transfer->amount, 2, '.', ''),
                'idempotency_key' => $this->refundIdempotencyKey($transfer),
            ]);
        } catch (PlaidException $e) {
            if ($e->outcomeUncertain()) {
                $this->flagException($transfer, PlaidTransfer::EXCEPTION_REFUND_UNKNOWN, 'Plaid did not confirm the refund request. Refresh the payment to check.');
            } else {
                $transfer->fill([
                    'refund_status' => PlaidTransfer::REFUND_FAILED,
                    'refund_failure_message' => mb_substr($e->getMessage(), 0, 500),
                ])->save();
                $this->flagException($transfer, PlaidTransfer::EXCEPTION_REFUND_FAILED, 'Plaid rejected the refund: '.$e->getMessage());
                $this->syncPayable($transfer);
            }
            $this->logTransfer($transfer->fresh(), $actor, 'plaid_ach_refund_failed', ['reason' => $reason, 'code' => $e->codeKey]);

            return $transfer->fresh() ?? $transfer;
        } catch (\Throwable $e) {
            Log::error('Plaid refund request failed', ['transfer' => $transfer->public_id, 'error' => $e->getMessage()]);
            $this->flagException($transfer, PlaidTransfer::EXCEPTION_REFUND_UNKNOWN, 'Plaid did not confirm the refund request. Refresh the payment to check.');

            return $transfer->fresh() ?? $transfer;
        }

        $refundId = (string) data_get($payload, 'refund.id', '');
        if ($refundId === '') {
            $this->flagException($transfer, PlaidTransfer::EXCEPTION_REFUND_UNKNOWN, 'Plaid accepted the refund request without a refund ID.');

            return $transfer->fresh() ?? $transfer;
        }

        $transfer->fill(['refund_transfer_id' => $refundId])->save();
        $this->applyRefundStatus($transfer, (string) data_get($payload, 'refund.status', PlaidTransfer::REFUND_PENDING), [], 'refund_create');

        if (filled($transfer->credit_transfer_id) && ! in_array($transfer->credit_status, ['failed', 'cancelled', 'returned'], true)) {
            $this->flagException(
                $transfer->fresh(),
                PlaidTransfer::EXCEPTION_PAYOUT_RECOVERY,
                'The resident was refunded from the Havena ledger but the community payout was already sent.',
            );
        }

        $this->logTransfer($transfer->fresh(), $actor, 'plaid_ach_refund_requested', ['reason' => $reason]);

        return $transfer->fresh() ?? $transfer;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function handleTransferWebhook(array $payload): void
    {
        $code = strtoupper((string) ($payload['webhook_code'] ?? ''));
        if ($code === 'TRANSFER_EVENTS_UPDATE') {
            $this->syncEvents();

            return;
        }

        $id = (string) ($payload['transfer_id'] ?? data_get($payload, 'transfer.id', ''));
        if ($id === '') {
            return;
        }

        $transfer = PlaidTransfer::query()
            ->where('debit_transfer_id', $id)
            ->orWhere('credit_transfer_id', $id)
            ->first();
        if ($transfer) {
            $this->refreshFromProvider($transfer);
        }
    }

    /**
     * Pull every transfer event after the last one stored. Each event is stored once
     * (unique event_id) and applied in order; a failure stops the run so the next run
     * resumes from the same cursor.
     *
     * @return array{skipped: bool, fetched: int, matched: int, unmatched: int, applied: int, cursor: int}
     */
    public function syncEvents(int $maxPages = 20): array
    {
        $result = ['skipped' => false, 'fetched' => 0, 'matched' => 0, 'unmatched' => 0, 'applied' => 0, 'cursor' => 0];

        if ($this->forceSimulate() || ! $this->plaid->configured()) {
            $result['skipped'] = true;

            return $result;
        }

        $lock = Cache::lock('plaid:transfer-event-sync', 300);
        if (! $lock->get()) {
            $result['skipped'] = true;

            return $result;
        }

        try {
            $cursor = (int) (PlaidTransferEvent::query()->max('event_id') ?? 0);

            for ($page = 0; $page < $maxPages; $page++) {
                $payload = $this->http->post('/transfer/event/sync', ['after_id' => $cursor, 'count' => 500]);
                $events = data_get($payload, 'transfer_events');
                if (! is_array($events)) {
                    Log::warning('Plaid transfer event sync returned no event list');
                    break;
                }

                foreach ($events as $event) {
                    if (! is_array($event) || ! is_numeric($event['event_id'] ?? null)) {
                        Log::warning('Plaid transfer event without event_id skipped');

                        continue;
                    }

                    $outcome = $this->storeAndApplyEvent($event);
                    $cursor = max($cursor, (int) $event['event_id']);
                    if ($outcome === null) {
                        continue;
                    }

                    $result['fetched']++;
                    if ($outcome === 'unmatched') {
                        $result['unmatched']++;
                    } elseif ($outcome !== 'ledger') {
                        $result['matched']++;
                    }
                    if (in_array($outcome, ['applied', 'refund_applied'], true)) {
                        $result['applied']++;
                    }
                }

                if (! (bool) data_get($payload, 'has_more', false) || $events === []) {
                    break;
                }
            }

            $result['cursor'] = $cursor;
            Cache::put('plaid:transfer-event-sync:last_run', now()->toIso8601String(), now()->addDays(30));
        } finally {
            $lock->release();
        }

        return $result;
    }

    /**
     * @param  array<string, mixed>  $event
     */
    protected function storeAndApplyEvent(array $event): ?string
    {
        return DB::transaction(function () use ($event) {
            $eventId = (int) $event['event_id'];
            if (PlaidTransferEvent::query()->where('event_id', $eventId)->exists()) {
                return null;
            }

            $type = strtolower((string) ($event['event_type'] ?? ''));
            $transferId = (string) ($event['transfer_id'] ?? '');
            $refundId = (string) ($event['refund_id'] ?? '');
            $failure = is_array($event['failure_reason'] ?? null) ? $event['failure_reason'] : [];

            $transfer = null;
            if ($refundId !== '') {
                $transfer = PlaidTransfer::query()->where('refund_transfer_id', $refundId)->first();
            }
            if (! $transfer && $transferId !== '') {
                $transfer = PlaidTransfer::query()
                    ->where('debit_transfer_id', $transferId)
                    ->orWhere('credit_transfer_id', $transferId)
                    ->first();
            }

            $outcome = 'unmatched';
            if ($transfer) {
                $outcome = 'recorded';
                if (str_starts_with($type, 'refund.')) {
                    $outcome = $this->applyRefundStatus($transfer, substr($type, 7), $failure, 'event', $eventId) ? 'refund_applied' : 'stale';
                } elseif ($transferId !== '' && $transferId === $transfer->credit_transfer_id) {
                    $outcome = $this->applyCreditStatus($transfer, $type, $failure) ? 'applied' : 'recorded';
                } elseif (isset(self::DEBIT_STATUS_MAP[$type])) {
                    $outcome = $this->applyDebitStatus($transfer, $type, $failure, 'event', $eventId) ? 'applied' : 'stale';
                }
            } elseif (str_starts_with($type, 'sweep.') || $transferId === '') {
                $outcome = 'ledger';
            }

            PlaidTransferEvent::query()->create([
                'event_id' => $eventId,
                'plaid_transfer_id' => $transfer?->id,
                'event_type' => mb_substr($type !== '' ? $type : 'unknown', 0, 48),
                'transfer_id' => $transferId !== '' ? $transferId : null,
                'transfer_type' => $event['transfer_type'] ?? null,
                'refund_id' => $refundId !== '' ? $refundId : null,
                'sweep_id' => $event['sweep_id'] ?? null,
                'amount' => isset($event['transfer_amount']) ? (string) $event['transfer_amount'] : null,
                'failure_code' => $this->returnCodeFrom($failure),
                'failure_description' => isset($failure['description']) ? mb_substr((string) $failure['description'], 0, 500) : null,
                'occurred_at' => $this->parseTime($event['timestamp'] ?? null),
                'matched' => $transfer !== null,
                'outcome' => $outcome,
                'payload' => $event,
            ]);

            return $outcome;
        });
    }

    /** Safe read-only refresh from `/transfer/get` for the debit, refund and payout legs. */
    public function refreshFromProvider(PlaidTransfer $transfer): PlaidTransfer
    {
        if ($transfer->simulated || ! filled($transfer->debit_transfer_id)) {
            return $transfer;
        }

        $debit = $this->fetchTransfer((string) $transfer->debit_transfer_id);
        if ($debit !== null) {
            $this->applyDebitStatus($transfer, (string) data_get($debit, 'status', ''), $this->failureFrom($debit), 'refresh');
            $transfer->refresh();
            $this->adoptRefundFromTransfer($transfer, $debit);
        }

        if (filled($transfer->credit_transfer_id)) {
            $credit = $this->fetchTransfer((string) $transfer->credit_transfer_id);
            if ($credit !== null) {
                $this->applyCreditStatus($transfer, (string) data_get($credit, 'status', ''), $this->failureFrom($credit));
            }
        }

        $transfer->forceFill(['last_synced_at' => now()])->save();

        return $transfer->fresh() ?? $transfer;
    }

    /**
     * Apply a Plaid debit status. Older or unknown statuses never overwrite newer
     * state; returns are accepted after posted/settled.
     *
     * @param  array<string, mixed>  $failure
     */
    public function applyDebitStatus(PlaidTransfer $transfer, string $providerStatus, array $failure, string $source, ?int $eventId = null): bool
    {
        $providerStatus = strtolower(trim($providerStatus));
        $mapped = self::DEBIT_STATUS_MAP[$providerStatus] ?? null;
        if ($mapped === null) {
            if ($providerStatus !== '') {
                Log::info('Plaid transfer status ignored', ['transfer' => $transfer->public_id, 'status' => $providerStatus]);
            }

            return false;
        }

        $changed = DB::transaction(function () use ($transfer, $providerStatus, $mapped, $failure, $eventId) {
            $locked = PlaidTransfer::query()->lockForUpdate()->find($transfer->id);
            if (! $locked) {
                return false;
            }

            $current = (string) $locked->status;
            if (in_array($current, PlaidTransfer::TERMINAL_STATUSES, true)) {
                return false;
            }

            $updates = ['provider_status' => $providerStatus];
            if ($eventId !== null) {
                $updates['last_event_id'] = max((int) $locked->last_event_id, $eventId);
            }

            $terminal = in_array($mapped, PlaidTransfer::TERMINAL_STATUSES, true);
            if (! $terminal) {
                $currentRank = PlaidTransfer::progressRank($current) ?? 0;
                $newRank = PlaidTransfer::progressRank($mapped) ?? 0;
                if ($newRank <= $currentRank) {
                    if ($newRank === $currentRank) {
                        $locked->fill($updates)->save();
                    }

                    return false;
                }
            }

            $now = now();
            $updates['status'] = $mapped;
            if (in_array($mapped, [PlaidTransfer::STATUS_POSTED, PlaidTransfer::STATUS_SETTLED], true)) {
                $updates['posted_at'] = $locked->posted_at ?? $now;
            }
            if ($mapped === PlaidTransfer::STATUS_SETTLED) {
                $updates['settled_at'] = $locked->settled_at ?? $now;
            }
            if ($mapped === PlaidTransfer::STATUS_FAILED) {
                $updates['failed_at'] = $now;
            }
            if ($mapped === PlaidTransfer::STATUS_CANCELLED) {
                $updates['cancelled_at'] = $now;
            }
            if ($mapped === PlaidTransfer::STATUS_RETURNED) {
                $updates['returned_at'] = $now;
                $updates['return_code'] = $this->returnCodeFrom($failure);
            }
            if ($terminal) {
                $updates['failure_code'] = mb_substr((string) ($this->returnCodeFrom($failure) ?? $providerStatus), 0, 64);
                $updates['failure_message'] = mb_substr((string) ($failure['description'] ?? match ($mapped) {
                    PlaidTransfer::STATUS_RETURNED => 'The bank returned this payment.',
                    PlaidTransfer::STATUS_CANCELLED => 'This bank payment was cancelled.',
                    default => 'Bank payment failed.',
                }), 0, 500);
            }
            if ($locked->exception_code === PlaidTransfer::EXCEPTION_OUTCOME_UNKNOWN) {
                $updates['exception_resolved_at'] = $now;
            }

            $locked->fill($updates)->save();

            if ($mapped === PlaidTransfer::STATUS_RETURNED) {
                if ($locked->refundActive()) {
                    $this->flagException($locked, PlaidTransfer::EXCEPTION_RETURN_AFTER_REFUND, 'The original debit was returned while a refund exists. The resident may be credited twice.');
                } elseif (filled($locked->credit_transfer_id) && ! in_array($locked->credit_status, ['failed', 'cancelled', 'returned'], true)) {
                    $this->flagException($locked, PlaidTransfer::EXCEPTION_PAYOUT_RECOVERY, 'The resident debit was returned after the community payout was sent.');
                }
            }

            return true;
        });

        $transfer->refresh();
        if ($changed) {
            $this->syncPayable($transfer);
            $this->notifyResident($transfer);
        }

        return $changed;
    }

    /**
     * @param  array<string, mixed>  $failure
     */
    public function applyRefundStatus(PlaidTransfer $transfer, string $status, array $failure, string $source, ?int $eventId = null): bool
    {
        $status = strtolower(trim($status));
        if (! isset(self::REFUND_RANK[$status]) && ! in_array($status, self::REFUND_TERMINAL, true)) {
            return false;
        }

        $changed = DB::transaction(function () use ($transfer, $status, $failure) {
            $locked = PlaidTransfer::query()->lockForUpdate()->find($transfer->id);
            if (! $locked) {
                return false;
            }

            $current = $locked->refund_status;
            if ($current !== null && in_array($current, self::REFUND_TERMINAL, true)) {
                return false;
            }
            if ($current !== null && isset(self::REFUND_RANK[$status], self::REFUND_RANK[$current])
                && self::REFUND_RANK[$status] <= self::REFUND_RANK[$current]) {
                return false;
            }
            $updates = ['refund_status' => $status];
            if ($status === PlaidTransfer::REFUND_SETTLED) {
                $updates['refunded_at'] = now();
            }
            if (in_array($status, self::REFUND_TERMINAL, true)) {
                $updates['refund_failure_message'] = mb_substr((string) ($failure['description'] ?? 'The refund did not complete.'), 0, 500);
            }
            if ($locked->exception_code === PlaidTransfer::EXCEPTION_REFUND_UNKNOWN) {
                $updates['exception_resolved_at'] = now();
            }
            $locked->fill($updates)->save();

            if (in_array($status, [PlaidTransfer::REFUND_FAILED, PlaidTransfer::REFUND_RETURNED], true)) {
                $this->flagException($locked, PlaidTransfer::EXCEPTION_REFUND_FAILED, 'Refund '.$status.': '.($updates['refund_failure_message'] ?? ''));
            }

            return true;
        });

        $transfer->refresh();
        if ($changed) {
            $this->syncPayable($transfer);
            $this->notifyResident($transfer);
        }

        return $changed;
    }

    /**
     * @param  array<string, mixed>  $failure
     */
    protected function applyCreditStatus(PlaidTransfer $transfer, string $status, array $failure): bool
    {
        $status = strtolower(trim($status));
        if (! isset(self::DEBIT_STATUS_MAP[$status]) || $transfer->credit_status === $status) {
            return false;
        }
        if (in_array($transfer->credit_status, ['failed', 'cancelled', 'returned'], true)) {
            return false;
        }

        $transfer->fill(['credit_status' => $status])->save();
        if (in_array($status, ['failed', 'returned'], true)) {
            $this->flagException(
                $transfer,
                PlaidTransfer::EXCEPTION_PAYOUT_FAILED,
                'Community payout '.$status.': '.((string) ($failure['description'] ?? 'no reason given')),
            );
        }

        return true;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function listForCommunity(int $communityId, int $limit = 50): array
    {
        return PlaidTransfer::query()
            ->with('user:id,name')
            ->where('community_id', $communityId)
            ->latest('id')
            ->limit($limit)
            ->get()
            ->map(fn (PlaidTransfer $transfer) => $transfer->toAdminPayload())
            ->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function listForResident(User $user, int $communityId): array
    {
        return PlaidTransfer::query()
            ->where('community_id', $communityId)
            ->where('user_id', $user->id)
            ->latest('id')
            ->limit(50)
            ->get()
            ->map(fn (PlaidTransfer $transfer) => $transfer->toPublicPayload())
            ->all();
    }

    public function flagException(PlaidTransfer $transfer, string $code, string $message): void
    {
        $transfer->forceFill([
            'exception_code' => $code,
            'exception_message' => mb_substr($message, 0, 500),
            'exception_at' => now(),
            'exception_resolved_at' => null,
        ])->save();

        Log::warning('Plaid transfer needs review', ['transfer' => $transfer->public_id, 'exception' => $code]);
    }

    public function forceSimulate(): bool
    {
        return config('plaid.transfer.simulate') === true
            && (string) config('plaid.environment', 'sandbox') !== 'production';
    }

    public function sandboxBlockedInProduction(): bool
    {
        if (! app()->environment('production')) {
            return false;
        }

        $sandbox = (string) config('plaid.environment', 'sandbox') !== 'production' || $this->forceSimulate();

        return $sandbox && ! (bool) config('plaid.transfer.allow_sandbox_in_production', false);
    }

    /**
     * @param  array<string, mixed>  $context
     */
    protected function execute(
        PlaidTransfer $transfer,
        ResidentPlaidConnection $residentBank,
        CommunityPlaidConnection $communityBank,
        User $user,
        array $context,
    ): void {
        if ($this->forceSimulate()) {
            $this->simulateSuccess($transfer);

            return;
        }

        $this->liveDebitAndCredit($transfer, $residentBank, $communityBank, $user, $context);
    }

    /**
     * @param  array<string, mixed>  $context
     */
    protected function liveDebitAndCredit(
        PlaidTransfer $transfer,
        ResidentPlaidConnection $residentBank,
        CommunityPlaidConnection $communityBank,
        User $user,
        array $context,
    ): void {
        $amount = number_format((float) $transfer->amount, 2, '.', '');
        $device = array_filter([
            'ip_address' => $context['ip_address'] ?? null,
            'user_agent' => isset($context['user_agent']) ? mb_substr((string) $context['user_agent'], 0, 255) : null,
        ]);

        $debitAuth = $this->http->post('/transfer/authorization/create', array_filter([
            'access_token' => $residentBank->plaid_access_token,
            'account_id' => $residentBank->account_id,
            'type' => 'debit',
            'network' => 'ach',
            'amount' => $amount,
            'ach_class' => (string) config('plaid.transfer.ach_class_debit', 'web'),
            'iso_currency_code' => $transfer->currency,
            'user' => ['legal_name' => $this->legalName($user)],
            'device' => $device !== [] ? $device : null,
            'user_present' => true,
            'idempotency_key' => $this->debitIdempotencyKey($transfer),
        ], static fn ($value) => $value !== null));

        $debitAuthId = (string) data_get($debitAuth, 'authorization.id', '');
        $decision = strtolower((string) data_get($debitAuth, 'authorization.decision', ''));
        $rationale = data_get($debitAuth, 'authorization.decision_rationale.code');

        $transfer->fill([
            'debit_authorization_id' => $debitAuthId !== '' ? $debitAuthId : null,
            'authorization_decision' => $decision !== '' ? mb_substr($decision, 0, 32) : null,
            'authorization_rationale' => is_string($rationale) ? mb_substr($rationale, 0, 64) : null,
        ])->save();

        if ($debitAuthId === '' || $decision === '') {
            throw PlaidException::transferFailed('The bank network returned an unexpected answer. You have not been charged.');
        }
        if ($decision === 'user_action_required') {
            $this->residents->applyItemError($residentBank, 'ITEM_LOGIN_REQUIRED', 'Your bank needs you to sign in again.');
            throw PlaidException::userActionRequired();
        }
        if ($decision !== 'approved') {
            throw PlaidException::transferFailed($this->declineMessage(is_string($rationale) ? $rationale : null, $debitAuth));
        }

        $transfer->fill([
            'status' => PlaidTransfer::STATUS_AUTHORIZED,
            'authorized_at' => now(),
        ])->save();

        try {
            $debit = $this->http->post('/transfer/create', [
                'access_token' => $residentBank->plaid_access_token,
                'account_id' => $residentBank->account_id,
                'authorization_id' => $debitAuthId,
                'description' => $transfer->description,
            ]);
        } catch (PlaidException $e) {
            if (! $e->outcomeUncertain()) {
                throw $e;
            }
            $this->markOutcomeUnknown($transfer, $e->getMessage());

            return;
        } catch (\Throwable $e) {
            $this->markOutcomeUnknown($transfer, $e->getMessage());

            return;
        }

        $debitId = (string) data_get($debit, 'transfer.id', '');
        if ($debitId === '') {
            $this->markOutcomeUnknown($transfer, 'Plaid response did not include a transfer id.');

            return;
        }

        $transfer->fill([
            'debit_transfer_id' => $debitId,
            'status' => PlaidTransfer::STATUS_PROCESSING,
            'provider_status' => 'pending',
        ])->save();

        $initial = strtolower((string) data_get($debit, 'transfer.status', 'pending'));
        if ($initial !== 'pending') {
            $this->applyDebitStatus($transfer, $initial, $this->failureFrom((array) data_get($debit, 'transfer', [])), 'create');
            $transfer->refresh();
        }

        if (! $transfer->isFailed()) {
            $this->creditCommunity($transfer, $communityBank, $amount);
        }
    }

    protected function creditCommunity(PlaidTransfer $transfer, CommunityPlaidConnection $communityBank, string $amount): void
    {
        $community = $communityBank->community;

        try {
            $destination = $this->ensureCommunityTransferAccount($communityBank);
            $creditAuth = $this->http->post('/transfer/authorization/create', [
                'access_token' => $destination['access_token'],
                'account_id' => $destination['account_id'],
                'type' => 'credit',
                'network' => 'ach',
                'amount' => $amount,
                'ach_class' => (string) config('plaid.transfer.ach_class_credit', 'ccd'),
                'iso_currency_code' => $transfer->currency,
                'user' => ['legal_name' => $community?->name ?: 'Community'],
                'idempotency_key' => 'cr-'.$transfer->public_id,
            ]);

            $creditAuthId = (string) data_get($creditAuth, 'authorization.id', '');
            $decision = strtolower((string) data_get($creditAuth, 'authorization.decision', ''));
            $transfer->fill(['credit_authorization_id' => $creditAuthId !== '' ? $creditAuthId : null])->save();
            if ($creditAuthId === '' || $decision !== 'approved') {
                $transfer->fill(['credit_status' => 'declined'])->save();
                $this->flagException($transfer, PlaidTransfer::EXCEPTION_PAYOUT_FAILED, 'Community payout authorization was '.($decision ?: 'not returned').'.');

                return;
            }

            $credit = $this->http->post('/transfer/create', [
                'access_token' => $destination['access_token'],
                'account_id' => $destination['account_id'],
                'authorization_id' => $creditAuthId,
                'description' => $this->achDescription('Payout'),
            ]);
        } catch (\Throwable $e) {
            $code = $e instanceof PlaidException ? $e->codeKey : 'PLAID_PAYOUT_FAILED';
            Log::warning('Community payout was not sent', ['transfer' => $transfer->public_id, 'code' => $code]);
            $transfer->fill(['credit_status' => 'not_sent'])->save();
            $this->flagException(
                $transfer,
                PlaidTransfer::EXCEPTION_PAYOUT_FAILED,
                ($e instanceof PlaidException && $e->outcomeUncertain()) || ! $e instanceof PlaidException
                    ? 'Community payout outcome is unknown. Check the Plaid dashboard before sending it again.'
                    : 'Community payout was not sent: '.$e->getMessage(),
            );

            return;
        }

        $creditId = (string) data_get($credit, 'transfer.id', '');
        $transfer->fill([
            'credit_transfer_id' => $creditId !== '' ? $creditId : null,
            'credit_status' => strtolower((string) data_get($credit, 'transfer.status', 'pending')) ?: 'pending',
        ])->save();
    }

    /**
     * @return array{access_token: string, account_id: string}
     */
    protected function ensureCommunityTransferAccount(CommunityPlaidConnection $communityBank): array
    {
        if (filled($communityBank->transfer_access_token) && filled($communityBank->transfer_account_id)) {
            return [
                'access_token' => (string) $communityBank->transfer_access_token,
                'account_id' => (string) $communityBank->transfer_account_id,
            ];
        }

        if (filled($communityBank->plaid_access_token) && filled($communityBank->account_id)) {
            return [
                'access_token' => (string) $communityBank->plaid_access_token,
                'account_id' => (string) $communityBank->account_id,
            ];
        }

        if (! filled($communityBank->ach_account) || ! filled($communityBank->ach_routing)) {
            throw PlaidException::communityBankRequired();
        }

        $migrated = $this->http->post('/transfer/migrate_account', [
            'account_number' => $communityBank->ach_account,
            'routing_number' => $communityBank->ach_routing,
            'account_type' => $communityBank->account_subtype ?: 'checking',
        ]);

        $accessToken = (string) ($migrated['access_token'] ?? '');
        $accountId = (string) ($migrated['account_id'] ?? '');
        if ($accessToken === '' || $accountId === '') {
            throw PlaidException::transferFailed('Unable to register the community bank for ACH payouts.');
        }

        $communityBank->fill([
            'transfer_access_token' => $accessToken,
            'transfer_account_id' => $accountId,
        ])->save();

        return [
            'access_token' => $accessToken,
            'account_id' => $accountId,
        ];
    }

    protected function simulateSuccess(PlaidTransfer $transfer): void
    {
        $transfer->fill([
            'status' => PlaidTransfer::STATUS_POSTED,
            'provider_status' => 'posted',
            'credit_status' => 'posted',
            'provider' => 'plaid',
            'simulated' => true,
            'authorization_decision' => 'approved',
            'debit_authorization_id' => 'sim_auth_'.Str::lower(Str::random(10)),
            'debit_transfer_id' => 'sim_debit_'.Str::lower(Str::random(10)),
            'credit_authorization_id' => 'sim_cauth_'.Str::lower(Str::random(10)),
            'credit_transfer_id' => 'sim_credit_'.Str::lower(Str::random(10)),
            'authorized_at' => now(),
            'posted_at' => now(),
            'failure_code' => null,
            'failure_message' => null,
        ])->save();
        $this->notifyResident($transfer);
    }

    protected function markOutcomeUnknown(PlaidTransfer $transfer, string $detail): void
    {
        Log::error('Plaid debit outcome unknown', ['transfer' => $transfer->public_id, 'error' => $detail]);
        $transfer->fill(['status' => PlaidTransfer::STATUS_AUTHORIZED])->save();
        $this->flagException(
            $transfer,
            PlaidTransfer::EXCEPTION_OUTCOME_UNKNOWN,
            'Plaid approved the debit but did not confirm it was created. Do not retry; check the Plaid dashboard or wait for transfer events.',
        );
    }

    protected function reverseRequiresReview(PlaidTransfer $transfer, User $actor, string $reason): PlaidTransfer
    {
        $this->flagException(
            $transfer,
            PlaidTransfer::EXCEPTION_REFUND_REQUIRED,
            'The charge was cancelled ('.$reason.') but Plaid would not cancel the pending debit. Refund it once it posts.',
        );
        $this->logTransfer($transfer->fresh(), $actor, 'plaid_ach_refund_required', ['reason' => $reason]);

        return $transfer->fresh() ?? $transfer;
    }

    protected function cancelCreditIfPossible(PlaidTransfer $transfer): void
    {
        if (! filled($transfer->credit_transfer_id) || in_array($transfer->credit_status, ['failed', 'cancelled', 'returned'], true)) {
            return;
        }

        $credit = $this->fetchTransfer((string) $transfer->credit_transfer_id);
        if ($credit !== null && (bool) data_get($credit, 'cancellable', false)) {
            try {
                $this->http->post('/transfer/cancel', ['transfer_id' => $transfer->credit_transfer_id]);
                $transfer->fill(['credit_status' => 'cancelled'])->save();

                return;
            } catch (PlaidException $e) {
                Log::warning('Plaid payout cancel rejected', ['transfer' => $transfer->public_id, 'code' => $e->codeKey]);
            }
        }

        $this->flagException(
            $transfer,
            PlaidTransfer::EXCEPTION_PAYOUT_RECOVERY,
            'The resident debit was cancelled but the community payout could not be cancelled.',
        );
    }

    /**
     * @param  array<string, mixed>  $debit
     */
    protected function adoptRefundFromTransfer(PlaidTransfer $transfer, array $debit): void
    {
        $refunds = data_get($debit, 'refunds');
        if (! is_array($refunds) || $refunds === []) {
            return;
        }

        foreach ($refunds as $refund) {
            if (! is_array($refund)) {
                continue;
            }
            $refundId = (string) ($refund['id'] ?? '');
            if ($refundId === '') {
                continue;
            }
            if (filled($transfer->refund_transfer_id) && $transfer->refund_transfer_id !== $refundId) {
                continue;
            }
            if (! filled($transfer->refund_transfer_id)) {
                $transfer->fill(['refund_transfer_id' => $refundId])->save();
            }
            $this->applyRefundStatus($transfer, (string) ($refund['status'] ?? ''), is_array($refund['failure_reason'] ?? null) ? $refund['failure_reason'] : [], 'refresh');

            return;
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    protected function fetchTransfer(string $transferId): ?array
    {
        try {
            $payload = $this->http->post('/transfer/get', ['transfer_id' => $transferId]);
        } catch (\Throwable $e) {
            Log::warning('Plaid transfer refresh failed', [
                'transfer_id' => $transferId,
                'code' => $e instanceof PlaidException ? $e->codeKey : $e::class,
            ]);

            return null;
        }

        $transfer = data_get($payload, 'transfer');

        return is_array($transfer) ? $transfer : null;
    }

    /**
     * @param  array<string, mixed>  $transfer
     * @return array<string, mixed>
     */
    protected function failureFrom(array $transfer): array
    {
        $failure = $transfer['failure_reason'] ?? null;

        return is_array($failure) ? $failure : [];
    }

    /**
     * @param  array<string, mixed>  $failure
     */
    protected function returnCodeFrom(array $failure): ?string
    {
        $code = (string) ($failure['failure_code'] ?? $failure['ach_return_code'] ?? '');

        return $code !== '' ? mb_substr($code, 0, 16) : null;
    }

    protected function lockPayable(string $payableType, int $payableId): void
    {
        $table = match ($payableType) {
            PlaidTransfer::PAYABLE_BOOKING => 'bookings',
            PlaidTransfer::PAYABLE_SHARED_BILL => 'amenity_resident_bills',
            default => null,
        };

        if ($table !== null) {
            DB::table($table)->where('id', $payableId)->lockForUpdate()->first();
        }
    }

    protected function syncPayable(PlaidTransfer $transfer): void
    {
        if ($transfer->payable_type === PlaidTransfer::PAYABLE_BOOKING) {
            $booking = DB::table('bookings')->where('id', $transfer->payable_id)->first();
            if (! $booking) {
                return;
            }
            if (! empty($booking->plaid_transfer_id) && (int) $booking->plaid_transfer_id !== (int) $transfer->id) {
                $owner = PlaidTransfer::query()->find((int) $booking->plaid_transfer_id);
                if ($owner && ! $owner->isFailed()) {
                    if ($transfer->coversCharge()) {
                        $this->flagException($transfer, PlaidTransfer::EXCEPTION_DUPLICATE_COLLECTION, 'Another bank payment already covers this booking.');
                    }

                    return;
                }
            }

            $residentPaid = $transfer->coversCharge();
            $status = $residentPaid
                ? 'accepted'
                : ($transfer->isFailed() || $transfer->refundActive() || $transfer->status === PlaidTransfer::STATUS_REFUNDED
                    ? 'rejected'
                    : 'pending');

            $bookingUpdate = [
                'payment_method' => 'bank_ach',
                'plaid_transfer_id' => $transfer->id,
                'ach_status' => $this->achStatusFor($transfer),
                'payment_verification_status' => $status,
                'payment_reference' => $transfer->public_id,
                'updated_at' => now(),
            ];
            if ($residentPaid && empty($booking->payment_date)) {
                $bookingUpdate['payment_date'] = now()->toDateString();
            }

            DB::table('bookings')->where('id', $transfer->payable_id)->update($bookingUpdate);

            return;
        }

        if ($transfer->payable_type === PlaidTransfer::PAYABLE_SHARED_BILL) {
            $outcome = $this->bills->applyAchTransfer($transfer, $this->achStatusFor($transfer));
            if ($outcome === PlaidTransfer::EXCEPTION_DUPLICATE_COLLECTION) {
                $this->flagException($transfer, PlaidTransfer::EXCEPTION_DUPLICATE_COLLECTION, 'This bill was already paid another way when this bank payment went through.');
            }
        }
    }

    public function achStatusFor(PlaidTransfer $transfer): string
    {
        return match ($transfer->refund_status) {
            PlaidTransfer::REFUND_SETTLED => 'refunded',
            PlaidTransfer::REFUND_PENDING, PlaidTransfer::REFUND_POSTED => 'refund_pending',
            PlaidTransfer::REFUND_FAILED, PlaidTransfer::REFUND_RETURNED => 'refund_failed',
            default => (string) $transfer->status,
        };
    }

    protected function markFailed(PlaidTransfer $transfer, string $code, string $message): void
    {
        $transfer->fill([
            'status' => PlaidTransfer::STATUS_FAILED,
            'failure_code' => mb_substr($code, 0, 64),
            'failure_message' => mb_substr($message, 0, 500),
            'failed_at' => now(),
        ])->save();
    }

    /** One notification per distinct outcome, however many times Plaid reports it. */
    protected function notifyResident(PlaidTransfer $transfer): void
    {
        $key = match (true) {
            $transfer->refund_status === PlaidTransfer::REFUND_SETTLED => 'refunded',
            $transfer->status === PlaidTransfer::STATUS_RETURNED => 'returned',
            $transfer->status === PlaidTransfer::STATUS_FAILED => 'failed',
            $transfer->status === PlaidTransfer::STATUS_CANCELLED => 'cancelled',
            $transfer->isSuccessful() && $transfer->refund_status === null => 'paid',
            default => null,
        };

        if ($key === null || $transfer->notified_status === $key || ! $transfer->user_id) {
            return;
        }

        $updated = PlaidTransfer::query()
            ->where('id', $transfer->id)
            ->where(fn ($q) => $q->whereNull('notified_status')->orWhere('notified_status', '!=', $key))
            ->update(['notified_status' => $key]);
        if ($updated === 0) {
            return;
        }
        $transfer->notified_status = $key;

        $amount = '$'.number_format((float) $transfer->amount, 2);
        [$type, $title, $body] = match ($key) {
            'paid' => ['success', 'Bank payment sent', 'Your '.$transfer->purposeLabel().' of '.$amount.' was submitted from your bank. ACH payments can still be returned by your bank.'],
            'returned' => ['warning', 'Bank payment returned', 'Your bank returned your '.$transfer->purposeLabel().' payment of '.$amount.'. The charge is unpaid again.'],
            'failed' => ['warning', 'Bank payment failed', $transfer->failure_message ?: 'Your bank payment could not be completed.'],
            'cancelled' => ['info', 'Bank payment cancelled', 'Your '.$transfer->purposeLabel().' payment of '.$amount.' was cancelled before it left your bank.'],
            'refunded' => ['success', 'Refund sent', 'Your refund of '.$amount.' for '.$transfer->purposeLabel().' has been sent to your bank.'],
        };

        try {
            NotificationService::send((int) $transfer->user_id, $type, $title, $body, '/property');
        } catch (\Throwable $e) {
            Log::warning('Plaid payment notification failed', ['transfer' => $transfer->public_id, 'error' => $e->getMessage()]);
        }
        app(PaymentMailService::class)->bankPayment($transfer, $key);
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    public function logTransfer(?PlaidTransfer $transfer, User $user, string $action, array $extra = []): void
    {
        if (! $transfer) {
            return;
        }

        try {
            ActivityLogService::user(
                $action,
                $this->legalName($user).' '.$transfer->purposeLabel().' $'.number_format((float) $transfer->amount, 2),
                Community::class,
                (int) $transfer->community_id,
                in_array($action, ['plaid_ach_failed', 'plaid_ach_refund_failed', 'plaid_ach_refund_required'], true) ? 'warning' : 'info',
                $user->id,
                array_merge([
                    'community_id' => $transfer->community_id,
                    'status' => $transfer->status,
                    'refund_status' => $transfer->refund_status,
                    'amount' => $transfer->amount,
                    'related_item' => $transfer->public_id,
                ], $extra),
            );
        } catch (\Throwable $e) {
            Log::warning('Plaid activity log failed', ['transfer' => $transfer->public_id, 'error' => $e->getMessage()]);
        }
    }

    protected function debitIdempotencyKey(PlaidTransfer $transfer): string
    {
        return mb_substr('db-'.$transfer->idempotency_key, 0, 50);
    }

    protected function refundIdempotencyKey(PlaidTransfer $transfer): string
    {
        return mb_substr('rf-'.$transfer->public_id, 0, 50);
    }

    /**
     * @param  array<string, mixed>  $authorization
     */
    protected function declineMessage(?string $rationale, array $authorization): string
    {
        return match (strtoupper((string) $rationale)) {
            'NSF' => 'Your bank account does not have enough available funds for this payment. You have not been charged.',
            'RISK' => 'This bank payment was declined by the bank network risk check. You have not been charged.',
            'TRANSFER_LIMIT_REACHED' => 'This payment is over the bank transfer limit. You have not been charged.',
            default => (string) data_get($authorization, 'authorization.decision_rationale.description', 'The bank declined this ACH debit. You have not been charged.'),
        };
    }

    protected function residentFacingPlaidMessage(string $message): string
    {
        if (preg_match('/not recognized by this endpoint|idempotency_key|UNKNOWN_FIELDS/i', $message)) {
            Log::error('Plaid rejected the transfer request', ['error' => $message]);

            return 'Unable to send this bank payment. Please try again.';
        }

        return $message;
    }

    protected function publicTransferError(\Throwable $exception): string
    {
        Log::error('Plaid transfer could not be sent', [
            'error' => $exception->getMessage(),
            'exception' => $exception::class,
        ]);

        return 'Unable to send this bank payment. Please try again.';
    }

    protected function achDescription(string $text): string
    {
        $clean = preg_replace('/[^A-Za-z0-9 ]/', '', $text) ?: 'Havena';
        $clean = trim((string) $clean);

        return mb_substr($clean !== '' ? $clean : 'Havena', 0, 10);
    }

    protected function legalName(User $user): string
    {
        $name = trim((string) ($user->name ?? ''));

        return $name !== '' ? $name : 'Havena Resident';
    }

    protected function parseTime(mixed $value): ?Carbon
    {
        if (! is_string($value) || $value === '') {
            return null;
        }

        try {
            return Carbon::parse($value);
        } catch (\Throwable) {
            return null;
        }
    }
}
