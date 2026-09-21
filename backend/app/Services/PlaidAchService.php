<?php

namespace App\Services;

use App\Exceptions\PlaidException;
use App\Models\Community;
use App\Models\CommunityPlaidConnection;
use App\Models\PlaidTransfer;
use App\Models\ResidentPlaidConnection;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class PlaidAchService
{
    private const FALLBACK_CODES = [
        'PRODUCT_NOT_READY',
        'PRODUCT_NOT_ENABLED',
        'INVALID_PRODUCT',
        'TRANSFER_NOT_CAPABLE',
        'INSTITUTION_NOT_ENABLED_IN_DASHBOARD',
        'ADDITIONAL_CONSENT_REQUIRED',
        'MISSING_FIELDS',
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
     * @return array<string, mixed>
     */
    public function capability(User $user, ?int $communityId = null): array
    {
        $communityId = $this->residents->resolveCommunityId($user, $communityId);
        $community = Community::query()->find($communityId);
        $communityBank = CommunityPlaidConnection::query()->where('community_id', $communityId)->first();
        $residentBank = $this->residents->findActive($user->id, $communityId);
        $eligible = $this->eligibility->isCommunityEligible($communityId);
        $communityReady = $communityBank?->isConnected() === true;

        return [
            'plaid_available' => $eligible,
            'ach_enabled' => $eligible && (bool) config('plaid.transfer.enabled', true),
            'community' => [
                'id' => $communityId,
                'name' => $community?->name,
                'bank_connected' => $communityReady,
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
            'can_pay_with_bank' => $eligible && $communityReady && $residentBank?->isConnected() === true,
            'requires_resident_link' => $eligible && $communityReady && $residentBank?->isConnected() !== true,
            'fallback_proof' => true,
            'environment' => $this->plaid->environment(),
            'transfer_mode' => $this->forceSimulate() ? 'simulated' : 'live',
            'live_transfer_ready' => (bool) config('plaid.transfer.enabled', true) && ! $this->forceSimulate(),
        ];
    }

    public function payBooking(User $user, int $bookingId, ?int $communityId = null): PlaidTransfer
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
        );
    }

    public function paySharedBill(User $user, int $amenityId, int $residentBillId, ?int $communityId = null): PlaidTransfer
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
        );
    }

    /**
     * @param  array<string, mixed>  $meta
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
    ): PlaidTransfer {
        $this->eligibility->assertCommunityEligible($communityId);
        $this->plaid->assertConfigured();

        if ($amount <= 0) {
            throw PlaidException::transferFailed('Payment amount must be greater than zero.');
        }

        $existing = PlaidTransfer::query()
            ->where('payable_type', $payableType)
            ->where('payable_id', $payableId)
            ->whereIn('status', [
                PlaidTransfer::STATUS_AUTHORIZING,
                PlaidTransfer::STATUS_AUTHORIZED,
                PlaidTransfer::STATUS_PROCESSING,
                PlaidTransfer::STATUS_NEEDS_PAYOUT,
                PlaidTransfer::STATUS_POSTED,
                PlaidTransfer::STATUS_SETTLED,
            ])
            ->latest('id')
            ->first();

        if ($existing?->isSuccessful()) {
            throw PlaidException::paymentAlreadySettled();
        }
        if ($existing?->isPending()) {
            throw PlaidException::transferInProgress();
        }

        $communityBank = CommunityPlaidConnection::query()
            ->where('community_id', $communityId)
            ->first();
        if (! $communityBank || ! $communityBank->isConnected()) {
            throw PlaidException::communityBankRequired();
        }

        $residentBank = $this->residents->findActive($user->id, $communityId);
        if (! $residentBank) {
            throw PlaidException::residentNotConnected();
        }

        $transfer = PlaidTransfer::query()->create([
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
            'meta' => $meta,
        ]);

        try {
            $this->execute($transfer, $residentBank, $communityBank, $user);
        } catch (PlaidException $e) {
            $this->markFailed($transfer, $e->codeKey, $e->getMessage());
            $this->syncPayable($transfer);
            throw $e;
        } catch (\Throwable $e) {
            $this->markFailed($transfer, 'PLAID_TRANSFER_FAILED', $e->getMessage());
            $this->syncPayable($transfer);
            throw PlaidException::transferFailed($e->getMessage());
        }

        $transfer->refresh();
        $this->syncPayable($transfer);
        $this->logTransfer($transfer, $user, 'plaid_ach_initiated');

        return $transfer;
    }

    public function refund(PlaidTransfer $transfer, User $actor): PlaidTransfer
    {
        if (! $transfer->canRefund()) {
            throw PlaidException::transferFailed('This bank payment cannot be refunded.');
        }

        if ($transfer->simulated || $this->forceSimulate()) {
            $transfer->fill([
                'status' => PlaidTransfer::STATUS_REFUNDED,
                'refund_transfer_id' => 'sim_refund_'.Str::lower(Str::random(12)),
                'refunded_at' => now(),
            ])->save();
            $this->syncPayable($transfer);
            $this->logTransfer($transfer, $actor, 'plaid_ach_refunded');

            return $transfer->fresh() ?? $transfer;
        }

        try {
            $payload = $this->http->post('/transfer/refund/create', [
                'transfer_id' => $transfer->debit_transfer_id,
                'amount' => number_format((float) $transfer->amount, 2, '.', ''),
                'idempotency_key' => 'refund-'.$transfer->public_id,
            ]);
            $refundId = (string) data_get($payload, 'refund.id', data_get($payload, 'id', ''));
        } catch (PlaidException $e) {
            if ($this->canFallback($e)) {
                $transfer->fill([
                    'status' => PlaidTransfer::STATUS_REFUNDED,
                    'refund_transfer_id' => 'sim_refund_'.Str::lower(Str::random(12)),
                    'refunded_at' => now(),
                    'simulated' => true,
                ])->save();
                $this->syncPayable($transfer);

                return $transfer->fresh() ?? $transfer;
            }

            throw $e;
        }

        $transfer->fill([
            'status' => PlaidTransfer::STATUS_REFUNDED,
            'refund_transfer_id' => $refundId !== '' ? $refundId : $transfer->refund_transfer_id,
            'refunded_at' => now(),
        ])->save();
        $this->syncPayable($transfer);
        $this->logTransfer($transfer, $actor, 'plaid_ach_refunded');

        return $transfer->fresh() ?? $transfer;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function handleTransferWebhook(array $payload): void
    {
        $ids = array_filter([
            (string) ($payload['transfer_id'] ?? ''),
            (string) data_get($payload, 'transfer.id', ''),
        ]);

        foreach ($ids as $id) {
            $transfer = PlaidTransfer::query()
                ->where('debit_transfer_id', $id)
                ->orWhere('credit_transfer_id', $id)
                ->first();
            if ($transfer) {
                $this->refreshFromProvider($transfer, $id);
            }
        }

        $code = strtoupper((string) ($payload['webhook_code'] ?? ''));
        if ($code === 'TRANSFER_EVENTS_UPDATE') {
            $this->syncEvents();
        }
    }

    public function refreshFromProvider(PlaidTransfer $transfer, ?string $providerId = null): void
    {
        if ($transfer->simulated) {
            return;
        }

        $target = $providerId ?: $transfer->debit_transfer_id;
        if (! filled($target)) {
            return;
        }

        try {
            $payload = $this->http->post('/transfer/get', ['transfer_id' => $target]);
        } catch (PlaidException $e) {
            Log::warning('Plaid transfer refresh failed', [
                'transfer' => $transfer->public_id,
                'code' => $e->codeKey,
            ]);

            return;
        }

        $status = strtolower((string) data_get($payload, 'transfer.status', ''));
        $this->applyProviderStatus($transfer, $status, $payload);
        $this->syncPayable($transfer);
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

    protected function execute(
        PlaidTransfer $transfer,
        ResidentPlaidConnection $residentBank,
        CommunityPlaidConnection $communityBank,
        User $user,
    ): void {
        if ($this->forceSimulate()) {
            $this->simulateSuccess($transfer);

            return;
        }

        try {
            $this->liveDebitAndCredit($transfer, $residentBank, $communityBank, $user);
        } catch (PlaidException $e) {
            if ($this->canFallback($e)) {
                Log::info('Plaid Transfer unavailable; using sandbox ACH ledger', [
                    'code' => $e->codeKey,
                    'transfer' => $transfer->public_id,
                ]);
                $this->simulateSuccess($transfer);

                return;
            }

            throw $e;
        }
    }

    protected function liveDebitAndCredit(
        PlaidTransfer $transfer,
        ResidentPlaidConnection $residentBank,
        CommunityPlaidConnection $communityBank,
        User $user,
    ): void {
        $amount = number_format((float) $transfer->amount, 2, '.', '');
        $debitAuth = $this->http->post('/transfer/authorization/create', [
            'access_token' => $residentBank->plaid_access_token,
            'account_id' => $residentBank->account_id,
            'type' => 'debit',
            'network' => 'ach',
            'amount' => $amount,
            'ach_class' => (string) config('plaid.transfer.ach_class_debit', 'web'),
            'iso_currency_code' => $transfer->currency,
            'user' => [
                'legal_name' => $this->legalName($user),
            ],
        ]);

        $debitAuthId = (string) data_get($debitAuth, 'authorization.id', '');
        $decision = strtolower((string) data_get($debitAuth, 'authorization.decision', 'approved'));
        if ($debitAuthId === '' || ! in_array($decision, ['approved', ''], true)) {
            throw PlaidException::transferFailed(
                (string) data_get($debitAuth, 'authorization.decision_rationale.description', 'The bank declined this ACH debit.')
            );
        }

        $debit = $this->http->post('/transfer/create', [
            'access_token' => $residentBank->plaid_access_token,
            'account_id' => $residentBank->account_id,
            'authorization_id' => $debitAuthId,
            'description' => $transfer->description,
            'idempotency_key' => $transfer->idempotency_key,
        ]);

        $debitId = (string) data_get($debit, 'transfer.id', '');
        $transfer->fill([
            'debit_authorization_id' => $debitAuthId,
            'debit_transfer_id' => $debitId !== '' ? $debitId : null,
            'status' => PlaidTransfer::STATUS_PROCESSING,
            'authorized_at' => now(),
        ])->save();

        $this->creditCommunity($transfer, $communityBank, $amount);
    }

    protected function creditCommunity(PlaidTransfer $transfer, CommunityPlaidConnection $communityBank, string $amount): void
    {
        $destination = $this->ensureCommunityTransferAccount($communityBank);
        $community = $communityBank->community;

        try {
            $creditAuth = $this->http->post('/transfer/authorization/create', [
                'access_token' => $destination['access_token'],
                'account_id' => $destination['account_id'],
                'type' => 'credit',
                'network' => 'ach',
                'amount' => $amount,
                'ach_class' => (string) config('plaid.transfer.ach_class_credit', 'ccd'),
                'iso_currency_code' => $transfer->currency,
                'user' => [
                    'legal_name' => $community?->name ?: 'Community',
                ],
            ]);

            $creditAuthId = (string) data_get($creditAuth, 'authorization.id', '');
            $credit = $this->http->post('/transfer/create', [
                'access_token' => $destination['access_token'],
                'account_id' => $destination['account_id'],
                'authorization_id' => $creditAuthId,
                'description' => $this->achDescription('Payout'),
                'idempotency_key' => 'credit-'.$transfer->public_id,
            ]);

            $creditId = (string) data_get($credit, 'transfer.id', '');
            $status = strtolower((string) data_get($credit, 'transfer.status', PlaidTransfer::STATUS_PROCESSING));

            $transfer->fill([
                'credit_authorization_id' => $creditAuthId !== '' ? $creditAuthId : null,
                'credit_transfer_id' => $creditId !== '' ? $creditId : null,
                'status' => in_array($status, [PlaidTransfer::STATUS_POSTED, PlaidTransfer::STATUS_SETTLED], true)
                    ? $status
                    : PlaidTransfer::STATUS_PROCESSING,
                'posted_at' => in_array($status, [PlaidTransfer::STATUS_POSTED, PlaidTransfer::STATUS_SETTLED], true) ? now() : null,
                'settled_at' => $status === PlaidTransfer::STATUS_SETTLED ? now() : null,
            ])->save();
        } catch (PlaidException $e) {
            $transfer->fill([
                'status' => PlaidTransfer::STATUS_NEEDS_PAYOUT,
                'failure_code' => $e->codeKey,
                'failure_message' => $e->getMessage(),
            ])->save();

            if (! $this->canFallback($e)) {
                throw $e;
            }
        }
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
            'provider' => 'plaid',
            'simulated' => true,
            'debit_authorization_id' => 'sim_auth_'.Str::lower(Str::random(10)),
            'debit_transfer_id' => 'sim_debit_'.Str::lower(Str::random(10)),
            'credit_authorization_id' => 'sim_cauth_'.Str::lower(Str::random(10)),
            'credit_transfer_id' => 'sim_credit_'.Str::lower(Str::random(10)),
            'authorized_at' => now(),
            'posted_at' => now(),
            'failure_code' => null,
            'failure_message' => null,
        ])->save();
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    protected function applyProviderStatus(PlaidTransfer $transfer, string $status, array $payload): void
    {
        $failed = in_array($status, ['failed', 'returned', 'cancelled'], true);
        $posted = in_array($status, ['posted', 'settled'], true);

        $transfer->fill([
            'status' => $failed ? ($status === 'returned' ? PlaidTransfer::STATUS_RETURNED : PlaidTransfer::STATUS_FAILED)
                : ($posted ? ($status === 'settled' ? PlaidTransfer::STATUS_SETTLED : PlaidTransfer::STATUS_POSTED) : PlaidTransfer::STATUS_PROCESSING),
            'posted_at' => $posted ? ($transfer->posted_at ?: now()) : $transfer->posted_at,
            'settled_at' => $status === 'settled' ? now() : $transfer->settled_at,
            'failed_at' => $failed ? now() : $transfer->failed_at,
            'failure_code' => $failed ? (string) data_get($payload, 'transfer.failure_reason.error_type', $status) : null,
            'failure_message' => $failed ? (string) data_get($payload, 'transfer.failure_reason.description', 'Bank payment failed.') : null,
        ])->save();

        if ($failed || $posted) {
            $this->notifyResident($transfer);
        }
    }

    protected function syncPayable(PlaidTransfer $transfer): void
    {
        if ($transfer->payable_type === PlaidTransfer::PAYABLE_BOOKING) {
            $status = $transfer->isSuccessful()
                ? 'accepted'
                : ($transfer->isFailed() || $transfer->status === PlaidTransfer::STATUS_REFUNDED
                    ? 'rejected'
                    : 'pending');

            $bookingUpdate = [
                'payment_method' => 'bank_ach',
                'plaid_transfer_id' => $transfer->id,
                'ach_status' => $transfer->status,
                'payment_verification_status' => $status,
                'payment_reference' => $transfer->public_id,
                'updated_at' => now(),
            ];
            if ($transfer->isSuccessful()) {
                $bookingUpdate['payment_date'] = now()->toDateString();
            }

            DB::table('bookings')->where('id', $transfer->payable_id)->update($bookingUpdate);

            return;
        }

        if ($transfer->payable_type === PlaidTransfer::PAYABLE_SHARED_BILL) {
            $this->bills->applyAchTransfer($transfer);
        }
    }

    protected function markFailed(PlaidTransfer $transfer, string $code, string $message): void
    {
        $transfer->fill([
            'status' => PlaidTransfer::STATUS_FAILED,
            'failure_code' => $code,
            'failure_message' => mb_substr($message, 0, 500),
            'failed_at' => now(),
        ])->save();
    }

    protected function syncEvents(): void
    {
        try {
            $this->http->post('/transfer/event/sync', ['after_id' => 0, 'count' => 25]);
        } catch (\Throwable $e) {
            Log::info('Plaid transfer event sync skipped', ['error' => $e->getMessage()]);
        }
    }

    protected function notifyResident(PlaidTransfer $transfer): void
    {
        $title = $transfer->isSuccessful() ? 'Bank payment received' : 'Bank payment failed';
        $body = $transfer->isSuccessful()
            ? 'Your '.$transfer->purposeLabel().' of $'.number_format((float) $transfer->amount, 2).' was sent to the community bank.'
            : ($transfer->failure_message ?: 'Your bank payment could not be completed.');

        NotificationService::send(
            (int) $transfer->user_id,
            $transfer->isSuccessful() ? 'success' : 'warning',
            $title,
            $body,
            '/property',
        );
    }

    protected function logTransfer(PlaidTransfer $transfer, User $user, string $action): void
    {
        ActivityLogService::user(
            $action,
            $this->legalName($user).' '.$transfer->purposeLabel().' $'.number_format((float) $transfer->amount, 2),
            Community::class,
            (int) $transfer->community_id,
            'info',
            $user->id,
            [
                'community_id' => $transfer->community_id,
                'status' => $transfer->status,
                'amount' => $transfer->amount,
                'related_item' => $transfer->public_id,
            ],
        );
    }

    protected function forceSimulate(): bool
    {
        $value = config('plaid.transfer.simulate');
        if ($value === true || $value === 1 || $value === '1' || $value === 'true') {
            return true;
        }

        return false;
    }

    protected function canFallback(PlaidException $e): bool
    {
        if ((string) config('plaid.environment', 'sandbox') === 'production') {
            return false;
        }

        $forcedOff = config('plaid.transfer.simulate');
        if ($forcedOff === false || $forcedOff === 0 || $forcedOff === '0' || $forcedOff === 'false') {
            return false;
        }

        $message = strtolower($e->getMessage());

        return in_array($e->codeKey, self::FALLBACK_CODES, true)
            || str_contains($message, 'not enabled')
            || str_contains($message, 'not ready')
            || str_contains($message, 'product not');
    }

    protected function achDescription(string $text): string
    {
        $clean = preg_replace('/[^A-Za-z0-9 ]/', '', $text) ?: 'Havena';
        $clean = trim((string) $clean);

        return mb_substr($clean !== '' ? $clean : 'Havena', 0, 15);
    }

    protected function legalName(User $user): string
    {
        $name = trim((string) ($user->name ?? ''));

        return $name !== '' ? $name : 'Havena Resident';
    }
}

