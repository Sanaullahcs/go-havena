<?php

namespace App\Services\Utilities;

use App\Models\PaymentAttempt;
use App\Models\User;
use App\Models\UtilityAccount;
use App\Models\UtilityBill;
use App\Models\UtilityBiller;
use App\Services\AdminRoleService;
use App\Services\Kuickpay\BillInquiryResult;
use App\Services\Kuickpay\KuickpayException;
use App\Services\Kuickpay\KuickpayFormat;
use App\Services\Kuickpay\KuickpayGateway;
use App\Services\Kuickpay\UtilityBillerCatalog;
use App\Services\Payments\OnlinePaymentPresenter;
use App\Services\Payments\PaymentRouting;
use App\Services\UnitAssignmentService;
use App\Support\Currency;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * External utility bills (K-Electric, LESCO, SNGPL, …) fetched through KuickPay
 * Bill Initiator. The utility is always the source of truth for amount and
 * status; Havena only keeps a synchronised copy for display and history.
 */
class UtilityBillService
{
    public const MAX_ACCOUNTS_PER_UNIT = 12;

    public function __construct(
        private readonly KuickpayGateway $gateway,
        private readonly PaymentRouting $routing,
        private readonly UnitAssignmentService $units,
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function billers(?string $serviceType = null): array
    {
        UtilityBillerCatalog::ensureSeeded();

        return UtilityBiller::query()
            ->where('active', true)
            ->when($serviceType, fn ($query) => $query->where('service_type', $serviceType))
            ->orderBy('sort_order')
            ->get()
            ->map(fn (UtilityBiller $biller) => $biller->toPublicPayload())
            ->all();
    }

    /** @return array{unit: ?object, can_manage: bool} */
    public function context(User $user, int $communityId): array
    {
        $unit = $this->units->findActiveUnitForUser((int) $user->id, $communityId);

        return [
            'unit' => $unit,
            'can_manage' => $unit !== null && $this->canManage($user, $unit),
        ];
    }

    /** @return list<array<string, mixed>> */
    public function accountsForUnit(object $unit): array
    {
        return UtilityAccount::query()
            ->with(['biller', 'bills'])
            ->where('unit_id', $unit->id)
            ->whereNull('disabled_at')
            ->orderBy('service_type')
            ->orderBy('id')
            ->get()
            ->map(fn (UtilityAccount $account) => $this->formatAccount($account))
            ->all();
    }

    public function findAccountForUser(int $accountId, User $user, int $communityId): UtilityAccount
    {
        $unit = $this->units->findActiveUnitForUser((int) $user->id, $communityId);
        $account = UtilityAccount::query()->with('biller')->find($accountId);
        if (! $unit || ! $account || (int) $account->unit_id !== (int) $unit->id || $account->disabled_at !== null) {
            throw new KuickpayException('account_not_found', 'We could not find this utility account.', 404);
        }

        return $account;
    }

    /** Links and verifies a utility account in one step. Nothing is saved unless the utility recognises it. */
    public function link(User $user, int $communityId, int $billerId, string $reference, ?string $nickname): array
    {
        $this->assertUtilitiesEnabled($communityId);
        $unit = $this->units->findActiveUnitForUser((int) $user->id, $communityId);
        if (! $unit) {
            throw new KuickpayException('no_unit', 'Join a unit before adding utility accounts.');
        }
        if (! $this->canManage($user, $unit)) {
            throw new KuickpayException('not_allowed', 'Only your unit billing contact can add utility accounts.', 403);
        }

        $biller = UtilityBiller::query()->where('active', true)->find($billerId);
        if (! $biller) {
            throw ValidationException::withMessages(['utility_biller_id' => 'Choose a supported provider.']);
        }

        $digits = KuickpayFormat::digits($reference);
        $min = (int) $biller->reference_min_length;
        $max = (int) $biller->reference_max_length;
        if ($digits === '' || strlen($digits) < $min || strlen($digits) > $max) {
            throw ValidationException::withMessages([
                'reference' => $min === $max
                    ? "{$biller->reference_label} must be {$min} digits."
                    : "{$biller->reference_label} must be {$min}–{$max} digits.",
            ]);
        }

        $hash = UtilityAccount::hashReference($biller->mnemonic, $digits);
        $duplicate = UtilityAccount::query()
            ->where('unit_id', $unit->id)
            ->where('reference_hash', $hash)
            ->whereNull('disabled_at')
            ->exists();
        if ($duplicate) {
            throw ValidationException::withMessages(['reference' => 'This account is already linked to your unit.']);
        }

        $count = UtilityAccount::query()->where('unit_id', $unit->id)->whereNull('disabled_at')->count();
        if ($count >= self::MAX_ACCOUNTS_PER_UNIT) {
            throw ValidationException::withMessages(['reference' => 'Your unit already has the maximum number of utility accounts.']);
        }

        $result = $this->gateway->billInquiry($biller, $digits);
        if ($result->outcome === BillInquiryResult::NOT_FOUND) {
            throw ValidationException::withMessages([
                'reference' => "{$biller->short_name} could not find this {$biller->reference_label}. Check the number on your bill and try again.",
            ]);
        }
        if ($result->outcome === BillInquiryResult::BLOCKED) {
            throw ValidationException::withMessages([
                'reference' => "This {$biller->short_name} account is blocked or inactive. Contact {$biller->short_name} for help.",
            ]);
        }
        if ($result->outcome === BillInquiryResult::ERROR) {
            throw new KuickpayException('provider_unavailable', "{$biller->short_name} is not responding right now. Please try again in a few minutes.", 503);
        }

        $account = UtilityAccount::query()->create([
            'community_id' => $communityId,
            'unit_id' => (int) $unit->id,
            'utility_biller_id' => $biller->id,
            'service_type' => $biller->service_type,
            'nickname' => $this->cleanNickname($nickname),
            'reference_encrypted' => Crypt::encryptString($digits),
            'reference_hash' => $hash,
            'reference_last4' => substr($digits, -4),
            'consumer_name' => $result->consumerName ? mb_substr($result->consumerName, 0, 80) : null,
            'verification_status' => UtilityAccount::STATUS_VERIFIED,
            'verified_at' => now(),
            'last_inquired_at' => now(),
            'created_by' => (int) $user->id,
        ]);

        $this->upsertFromInquiry($account, $result);

        return $this->formatAccount($account->fresh(['biller', 'bills']));
    }

    public function updateNickname(UtilityAccount $account, User $user, ?string $nickname): array
    {
        $this->assertCanManageAccount($account, $user);
        $account->forceFill(['nickname' => $this->cleanNickname($nickname)])->save();

        return $this->formatAccount($account->fresh(['biller', 'bills']));
    }

    public function remove(UtilityAccount $account, User $user): void
    {
        $this->assertCanManageAccount($account, $user);

        $billIds = $account->bills()->pluck('id');
        $inFlight = PaymentAttempt::query()
            ->where('payable_type', PaymentAttempt::PAYABLE_UTILITY_BILL)
            ->whereIn('payable_id', $billIds)
            ->whereIn('status', PaymentAttempt::IN_FLIGHT_STATUSES)
            ->exists();
        if ($inFlight) {
            throw new KuickpayException('payment_in_progress', 'A payment on this account is still processing. You can remove it once it finishes.', 409);
        }

        $account->forceFill([
            'disabled_at' => now(),
            'disabled_by' => (int) $user->id,
            'verification_status' => UtilityAccount::STATUS_DISABLED,
        ])->save();
    }

    /** Resident-triggered refresh, throttled so repeated taps do not hammer the utility. */
    public function refresh(UtilityAccount $account): array
    {
        $throttle = max(0, (int) config('kuickpay.refresh_throttle_seconds', 30));
        if ($account->last_inquired_at && $account->last_inquired_at->diffInSeconds(now()) < $throttle) {
            return $this->formatAccount($account->fresh(['biller', 'bills']));
        }

        $result = $this->gateway->billInquiry($account->biller, $account->reference());
        $account->forceFill(['last_inquired_at' => now()])->save();
        if ($result->outcome === BillInquiryResult::ERROR) {
            throw new KuickpayException('provider_unavailable', "{$account->biller->short_name} is not responding right now. Showing the last bill we fetched.", 503);
        }

        $this->upsertFromInquiry($account, $result);

        return $this->formatAccount($account->fresh(['biller', 'bills']));
    }

    /** Fresh, unthrottled inquiry immediately before a payment. */
    public function refreshForPayment(int $billId): UtilityBill
    {
        $bill = UtilityBill::query()->with('account.biller')->find($billId);
        if (! $bill || ! $bill->account || ! $bill->account->biller) {
            throw KuickpayException::notYourBill();
        }

        $result = $this->gateway->billInquiry($bill->account->biller, $bill->account->reference());
        $bill->account->forceFill(['last_inquired_at' => now()])->save();
        if ($result->outcome === BillInquiryResult::ERROR) {
            throw new KuickpayException(
                'provider_unavailable',
                "{$bill->account->biller->short_name} is not responding, so we could not confirm the amount due. You have not been charged.",
                503,
            );
        }
        if ($result->outcome === BillInquiryResult::NOT_FOUND) {
            throw new KuickpayException('bill_not_found', 'The utility no longer recognises this account. Please check it in Utility bills.');
        }

        $this->upsertFromInquiry($bill->account, $result, $bill);

        return $bill->refresh();
    }

    public function upsertFromInquiry(UtilityAccount $account, BillInquiryResult $result, ?UtilityBill $current = null): ?UtilityBill
    {
        $month = $result->billingMonth ?: ($current?->billing_month ?? now()->format('Y-m'));
        $bill = UtilityBill::query()->firstOrNew([
            'utility_account_id' => $account->id,
            'billing_month' => $month,
        ]);

        $bill->fill([
            'community_id' => $account->community_id,
            'unit_id' => $account->unit_id,
            'consumer_name' => $result->consumerName ? mb_substr($result->consumerName, 0, 80) : $bill->consumer_name,
            'fetched_at' => now(),
            'provider_status' => match ($result->outcome) {
                BillInquiryResult::PAID => 'P',
                BillInquiryResult::BLOCKED => 'B',
                default => 'U',
            },
        ]);

        if ($result->amountWithinDuePaisa !== null) {
            $bill->amount_within_due_paisa = max(0, $result->amountWithinDuePaisa);
        } elseif (! $bill->exists) {
            $bill->amount_within_due_paisa = 0;
        }
        if ($result->amountAfterDuePaisa !== null) {
            $bill->amount_after_due_paisa = max(0, $result->amountAfterDuePaisa) ?: null;
        }
        if ($result->dueDate) {
            $bill->due_date = $result->dueDate->toDateString();
        }
        if ($result->tranAuthId && $result->outcome === BillInquiryResult::FOUND) {
            $bill->provider_tran_auth_id = $result->tranAuthId;
        }

        if ($result->outcome === BillInquiryResult::PAID) {
            // While a Havena payment is still confirming, "paid" is most likely ours; reconciliation decides.
            $havenaInFlight = $bill->exists && PaymentAttempt::query()
                ->where('payable_type', PaymentAttempt::PAYABLE_UTILITY_BILL)
                ->where('payable_id', $bill->id)
                ->whereIn('status', PaymentAttempt::IN_FLIGHT_STATUSES)
                ->exists();
            if ($bill->status !== UtilityBill::STATUS_PAID && ! $havenaInFlight) {
                // Paid somewhere other than Havena (bank app, branch, another wallet).
                $bill->status = UtilityBill::STATUS_EXTERNALLY_PAID;
                $bill->paid_via = 'external';
                $bill->paid_at = $result->datePaid ?? now();
                $bill->paid_amount_paisa = $result->amountPaidPaisa ?? $bill->amount_within_due_paisa;
            }
        } elseif ($result->outcome === BillInquiryResult::BLOCKED) {
            if (! $bill->isPaid()) {
                $bill->status = UtilityBill::STATUS_BLOCKED;
            }
        } elseif (! $bill->isPaid()) {
            // A bill Havena already settled stays paid even if the utility is slow to reflect it.
            $bill->status = UtilityBill::STATUS_UNPAID;
        }

        if ($result->consumerName && ! $account->consumer_name) {
            $account->forceFill(['consumer_name' => mb_substr($result->consumerName, 0, 80)])->save();
        }

        $bill->save();

        return $bill;
    }

    public function applyHavenaPayment(int $billId, PaymentAttempt $attempt): bool
    {
        return (bool) DB::transaction(function () use ($billId, $attempt) {
            $bill = UtilityBill::query()->whereKey($billId)->lockForUpdate()->first();
            if (! $bill || $bill->status === UtilityBill::STATUS_PAID) {
                return false;
            }

            $wasExternal = $bill->status === UtilityBill::STATUS_EXTERNALLY_PAID;
            $bill->forceFill([
                'status' => UtilityBill::STATUS_PAID,
                'paid_via' => 'havena',
                'paid_at' => now(),
                'paid_amount_paisa' => (int) $attempt->amount_paisa,
                'payment_attempt_id' => (int) $attempt->id,
                'provider_status' => 'P',
            ])->save();

            return ! $wasExternal;
        });
    }

    public function formatAccount(UtilityAccount $account): array
    {
        $bills = $account->relationLoaded('bills') ? $account->bills->sortByDesc('billing_month')->take(6)->values() : collect();
        $current = $bills->first();
        $throttle = max(0, (int) config('kuickpay.refresh_throttle_seconds', 30));

        return [
            'id' => (int) $account->id,
            'service_type' => $account->service_type,
            'nickname' => $account->nickname,
            'display_name' => $account->nickname ?: ($account->biller?->short_name ?? 'Utility'),
            'masked_reference' => $account->maskedReference(),
            'reference_last4' => $account->reference_last4,
            'consumer_name' => $account->consumer_name,
            'verification_status' => $account->verification_status,
            'verified_at' => $account->verified_at?->toIso8601String(),
            'last_refreshed_at' => $account->last_inquired_at?->toIso8601String(),
            'can_refresh_at' => $account->last_inquired_at?->copy()->addSeconds($throttle)->toIso8601String(),
            'biller' => $account->biller?->toPublicPayload(),
            'current_bill' => $current ? $this->formatBill($current, $account) : null,
            'history' => $bills->slice(1)->map(fn (UtilityBill $bill) => $this->formatBill($bill, $account, false))->values()->all(),
        ];
    }

    public function formatBill(UtilityBill $bill, UtilityAccount $account, bool $withPayment = true): array
    {
        $payable = $bill->payablePaisa();
        $month = Carbon::createFromFormat('Y-m', $bill->billing_month);
        $daysToDue = $bill->due_date ? (int) now()->startOfDay()->diffInDays($bill->due_date->copy()->startOfDay(), false) : null;

        return [
            'id' => (int) $bill->id,
            'billing_month' => $bill->billing_month,
            'billing_month_label' => $month->format('F Y'),
            'consumer_name' => $bill->consumer_name,
            'amount_within_due' => round($bill->amount_within_due_paisa / 100, 2),
            'amount_after_due' => $bill->amount_after_due_paisa ? round($bill->amount_after_due_paisa / 100, 2) : null,
            'payable_amount' => round($payable / 100, 2),
            'payable_amount_paisa' => $payable,
            'formatted_payable_amount' => Currency::format($payable / 100, 'PKR'),
            'due_date' => $bill->due_date?->toDateString(),
            'days_until_due' => $daysToDue,
            'is_past_due' => $bill->isPastDue(),
            'status' => $bill->status,
            'status_label' => match ($bill->status) {
                UtilityBill::STATUS_PAID => 'Paid with Havena',
                UtilityBill::STATUS_EXTERNALLY_PAID => 'Paid',
                UtilityBill::STATUS_BLOCKED => 'Unavailable',
                default => $bill->isPastDue() ? 'Overdue' : 'Unpaid',
            },
            'paid_at' => $bill->paid_at?->toIso8601String(),
            'paid_amount' => $bill->paid_amount_paisa ? round($bill->paid_amount_paisa / 100, 2) : null,
            'paid_via' => $bill->paid_via,
            'fetched_at' => $bill->fetched_at?->toIso8601String(),
            'online_payment' => $withPayment
                ? app(OnlinePaymentPresenter::class)->forPayable(PaymentAttempt::PAYABLE_UTILITY_BILL, (int) $bill->id, (int) $account->community_id)
                : null,
        ];
    }

    private function canManage(User $user, object $unit): bool
    {
        if (AdminRoleService::canManageCommunity($user, (int) $unit->community_id)) {
            return true;
        }

        $isContact = $this->units->effectiveBillingContactUserId($unit) === (int) $user->id;
        if (! $isContact) {
            return false;
        }

        return $this->routing->profile((int) $unit->community_id)->residents_can_link_utilities;
    }

    private function assertCanManageAccount(UtilityAccount $account, User $user): void
    {
        $unit = DB::table('units')->find($account->unit_id);
        if (! $unit || ! $this->canManage($user, $unit)) {
            throw new KuickpayException('not_allowed', 'Only your unit billing contact can change utility accounts.', 403);
        }
    }

    private function assertUtilitiesEnabled(int $communityId): void
    {
        if (! $this->routing->utilitiesEnabled($communityId)) {
            throw new KuickpayException('utilities_unavailable', 'Utility bill payments are not available in your community yet.');
        }
    }

    private function cleanNickname(?string $nickname): ?string
    {
        $value = trim((string) preg_replace('/\s+/', ' ', (string) $nickname));

        return $value === '' ? null : mb_substr($value, 0, 60);
    }
}
