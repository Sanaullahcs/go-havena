<?php

namespace App\Services;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\ReferralAttribution;
use App\Models\ReferralCode;
use App\Models\ReferralProgramSetting;
use App\Models\ReferralReward;
use App\Models\User;
use App\Support\PhoneNormalizer;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Stripe\Exception\ApiErrorException;

class ReferralService
{
    public function __construct(private readonly CommunityBillingService $billing)
    {
    }

    public function ensureReferralCode(User $user): ReferralCode
    {
        $existing = ReferralCode::query()->where('user_id', $user->id)->first();
        if ($existing) {
            return $existing;
        }

        return ReferralCode::query()->create([
            'user_id' => $user->id,
            'code' => $this->generateUniqueCode(),
            'is_active' => true,
        ]);
    }

    public function findCode(string $code): ?ReferralCode
    {
        $normalized = strtoupper(trim($code));
        if ($normalized === '') {
            return null;
        }

        return ReferralCode::query()
            ->where('code', $normalized)
            ->where('is_active', true)
            ->first();
    }

    /**
     * Lock referral attribution at community-admin signup.
     */
    public function lockAtSignup(
        User $referee,
        ?string $referralCode,
        string $source = 'web_link',
        ?string $referralToken = null,
    ): ?ReferralAttribution {
        if ($referee->role !== 'community_admin') {
            return null;
        }

        $code = $this->findCode((string) $referralCode);
        if (! $code) {
            return null;
        }

        if (! ReferralProgramSetting::current()->is_active) {
            return null;
        }

        $referrer = $code->user;
        if (! $this->isApprovedCommunityAdmin($referrer)) {
            return null;
        }

        if ($referrer->id === $referee->id) {
            return null;
        }

        if ($this->phonesMatch($referrer, $referee)) {
            return null;
        }

        if (ReferralAttribution::query()->where('referee_user_id', $referee->id)->exists()) {
            return null;
        }

        $settings = ReferralProgramSetting::current();
        $fraudFlags = $this->buildSignupFraudFlags($referrer, $referee);

        return ReferralAttribution::query()->create([
            'referral_code_id' => $code->id,
            'referrer_user_id' => $referrer->id,
            'referee_user_id' => $referee->id,
            'reward_type' => $settings->reward_type ?? ReferralProgramSetting::REWARD_TYPE_PERCENT,
            'reward_percent' => $settings->reward_percent,
            'reward_fixed_cents' => $settings->reward_fixed_cents,
            'status' => ReferralAttribution::STATUS_LOCKED,
            'referral_source' => $source,
            'referral_token' => $referralToken ? strtoupper(trim($referralToken)) : $code->code,
            'locked_at' => now(),
            'fraud_flags' => $fraudFlags,
            'fraud_review_status' => in_array('same_phone_as_referrer', $fraudFlags, true)
                ? ReferralAttribution::FRAUD_FLAGGED
                : ReferralAttribution::FRAUD_NONE,
        ]);
    }

    public function linkCommunity(User $referee, Community $community): void
    {
        $attribution = ReferralAttribution::query()
            ->where('referee_user_id', $referee->id)
            ->where('status', '!=', ReferralAttribution::STATUS_DISQUALIFIED)
            ->first();

        if (! $attribution) {
            return;
        }

        if ($attribution->referee_community_id && $attribution->referee_community_id !== $community->id) {
            return;
        }

        $referrerCommunityId = $this->primaryCommunityIdForUser($attribution->referrer_user_id);
        if ($referrerCommunityId && $referrerCommunityId === $community->id) {
            $this->disqualify($attribution, 'Referral cannot target the referrer’s own community.');

            return;
        }

        $attribution->update([
            'referee_community_id' => $community->id,
            'status' => ReferralAttribution::STATUS_PENDING_QUALIFICATION,
        ]);
    }

    public function markBillingStarted(int $refereeUserId): void
    {
        $attribution = ReferralAttribution::query()
            ->where('referee_user_id', $refereeUserId)
            ->whereIn('status', [
                ReferralAttribution::STATUS_LOCKED,
                ReferralAttribution::STATUS_PENDING_QUALIFICATION,
            ])
            ->first();

        if (! $attribution || ! $attribution->referee_community_id) {
            return;
        }

        if ($attribution->status === ReferralAttribution::STATUS_LOCKED) {
            $attribution->update(['status' => ReferralAttribution::STATUS_PENDING_QUALIFICATION]);
        }
    }

    public function disqualifyByRefereeUser(int $refereeUserId, string $reason): void
    {
        $attribution = ReferralAttribution::query()->where('referee_user_id', $refereeUserId)->first();
        if ($attribution) {
            $this->disqualify($attribution, $reason);
        }
    }

    public function handleInvoicePaid(object|array $invoice): void
    {
        $invoiceId = (string) data_get($invoice, 'id', '');
        $subscriptionId = (string) data_get($invoice, 'subscription', '');
        $amountPaid = (int) data_get($invoice, 'amount_paid', 0);
        $subtotal = (int) data_get($invoice, 'subtotal', 0);
        $billingReason = (string) data_get($invoice, 'billing_reason', '');

        if ($invoiceId === '' || $subscriptionId === '' || $amountPaid <= 0) {
            return;
        }

        if (! in_array($billingReason, ['subscription_cycle', 'subscription_create'], true)) {
            return;
        }

        if (ReferralReward::query()->where('stripe_invoice_id', $invoiceId)->exists()) {
            return;
        }

        $subscription = CommunitySubscription::query()
            ->where('stripe_subscription_id', $subscriptionId)
            ->first();

        if (! $subscription) {
            return;
        }

        $attribution = ReferralAttribution::query()
            ->where('referee_community_id', $subscription->community_id)
            ->whereNotIn('status', [ReferralAttribution::STATUS_DISQUALIFIED])
            ->first();

        if (! $attribution || ! $attribution->isEligibleForReward()) {
            return;
        }

        if (ReferralReward::query()->where('referee_community_id', $subscription->community_id)->exists()) {
            return;
        }

        $baseCents = max(0, $subtotal > 0 ? $subtotal : $this->invoiceSubtotalExTax($invoice));
        if ($baseCents <= 0) {
            return;
        }

        $rewardCents = $attribution->calculateRewardCents($baseCents);
        if ($rewardCents <= 0) {
            return;
        }

        DB::transaction(function () use ($attribution, $subscription, $invoice, $invoiceId, $baseCents, $rewardCents) {
            $attribution->refresh();
            if (! $attribution->isEligibleForReward()) {
                return;
            }

            $referrerCustomerId = $this->resolveReferrerStripeCustomerId($attribution->referrer_user_id);
            if ($referrerCustomerId === '') {
                ReferralReward::query()->create([
                    'referral_attribution_id' => $attribution->id,
                    'referrer_user_id' => $attribution->referrer_user_id,
                    'referee_community_id' => (int) $attribution->referee_community_id,
                    'reward_type' => $attribution->reward_type,
                    'reward_percent' => $attribution->reward_percent,
                    'reward_fixed_cents' => $attribution->reward_fixed_cents,
                    'invoice_subtotal_cents' => $baseCents,
                    'reward_amount_cents' => $rewardCents,
                    'currency' => strtolower((string) data_get($invoice, 'currency', 'usd')),
                    'stripe_invoice_id' => $invoiceId,
                    'status' => ReferralReward::STATUS_PENDING,
                    'qualified_at' => now(),
                    'failure_reason' => 'Referrer has no Stripe customer yet.',
                ]);

                return;
            }

            $reward = ReferralReward::query()->create([
                'referral_attribution_id' => $attribution->id,
                'referrer_user_id' => $attribution->referrer_user_id,
                'referee_community_id' => (int) $attribution->referee_community_id,
                'reward_type' => $attribution->reward_type,
                'reward_percent' => $attribution->reward_percent,
                'reward_fixed_cents' => $attribution->reward_fixed_cents,
                'invoice_subtotal_cents' => $baseCents,
                'reward_amount_cents' => $rewardCents,
                'currency' => strtolower((string) data_get($invoice, 'currency', 'usd')),
                'stripe_invoice_id' => $invoiceId,
                'referrer_stripe_customer_id' => $referrerCustomerId,
                'status' => ReferralReward::STATUS_PENDING,
                'qualified_at' => now(),
            ]);

            $this->creditReferrer($reward, $attribution);
        });
    }

    public function creditReferrer(ReferralReward $reward, ?ReferralAttribution $attribution = null): ReferralReward
    {
        $attribution ??= $reward->attribution;
        if ($reward->status === ReferralReward::STATUS_CREDITED) {
            return $reward;
        }

        if (! $this->billing->stripeConfigured() || ! filled($reward->referrer_stripe_customer_id)) {
            $reward->update([
                'status' => ReferralReward::STATUS_FAILED,
                'failure_reason' => 'Stripe is not configured or referrer customer is missing.',
            ]);

            return $reward->fresh();
        }

        try {
            $txn = $this->billing->stripe()->customers->createBalanceTransaction(
                $reward->referrer_stripe_customer_id,
                [
                    'amount' => -1 * (int) $reward->reward_amount_cents,
                    'currency' => $reward->currency,
                    'description' => $this->rewardDescription($reward, $attribution),
                    'metadata' => [
                        'referral_reward_id' => (string) $reward->id,
                        'referral_attribution_id' => (string) $reward->referral_attribution_id,
                        'referee_community_id' => (string) $reward->referee_community_id,
                    ],
                ],
            );

            $reward->update([
                'stripe_balance_transaction_id' => (string) data_get($txn, 'id'),
                'status' => ReferralReward::STATUS_CREDITED,
                'credited_at' => now(),
                'failure_reason' => null,
            ]);

            $attribution?->update(['status' => ReferralAttribution::STATUS_QUALIFIED]);
        } catch (ApiErrorException $e) {
            Log::error('Referral Stripe credit failed', [
                'reward_id' => $reward->id,
                'error' => $e->getMessage(),
            ]);
            $reward->update([
                'status' => ReferralReward::STATUS_FAILED,
                'failure_reason' => $e->getMessage(),
            ]);
        }

        return $reward->fresh();
    }

    /** @return array<string, mixed> */
    public function dashboardForUser(User $user): array
    {
        $settings = ReferralProgramSetting::current();
        $code = $this->isApprovedCommunityAdmin($user)
            ? $this->ensureReferralCode($user)
            : null;

        $attributions = ReferralAttribution::query()
            ->where('referrer_user_id', $user->id)
            ->with(['referee', 'refereeCommunity', 'reward'])
            ->orderByDesc('id')
            ->get();

        $successful = $attributions->filter(fn (ReferralAttribution $a) => $a->reward?->status === ReferralReward::STATUS_CREDITED);
        $pending = $attributions->filter(fn (ReferralAttribution $a) => in_array($a->status, [
            ReferralAttribution::STATUS_LOCKED,
            ReferralAttribution::STATUS_PENDING_QUALIFICATION,
        ], true) && $a->status !== ReferralAttribution::STATUS_DISQUALIFIED);

        $webOrigin = rtrim((string) config('app.frontend_url', config('app.url', 'http://localhost:3000')), '/');

        return [
            'program_active' => (bool) $settings->is_active,
            'reward_type' => (string) ($settings->reward_type ?? ReferralProgramSetting::REWARD_TYPE_PERCENT),
            'reward_percent' => (float) $settings->reward_percent,
            'reward_fixed_cents' => $settings->reward_fixed_cents !== null ? (int) $settings->reward_fixed_cents : null,
            'reward_label' => $this->formatRewardLabel(
                (string) ($settings->reward_type ?? ReferralProgramSetting::REWARD_TYPE_PERCENT),
                (float) $settings->reward_percent,
                $settings->reward_fixed_cents !== null ? (int) $settings->reward_fixed_cents : null,
            ),
            'referral_code' => $code?->code,
            'referral_link' => $code ? $webOrigin.'/register?ref='.urlencode($code->code) : null,
            'stats' => [
                'total_referrals' => $attributions->count(),
                'pending_referrals' => $pending->count(),
                'successful_referrals' => $successful->count(),
                'disqualified_referrals' => $attributions->where('status', ReferralAttribution::STATUS_DISQUALIFIED)->count(),
                'total_credit_earned_cents' => (int) $successful->sum(fn (ReferralAttribution $a) => $a->reward?->reward_amount_cents ?? 0),
            ],
            'history' => $attributions->take(50)->map(fn (ReferralAttribution $a) => $this->transformAttribution($a))->values()->all(),
        ];
    }

    /** @return array<string, mixed> */
    public function transformAttribution(ReferralAttribution $attribution): array
    {
        return [
            'id' => $attribution->id,
            'status' => $attribution->status,
            'reward_type' => (string) ($attribution->reward_type ?? ReferralProgramSetting::REWARD_TYPE_PERCENT),
            'reward_percent' => (float) $attribution->reward_percent,
            'reward_fixed_cents' => $attribution->reward_fixed_cents !== null ? (int) $attribution->reward_fixed_cents : null,
            'reward_label' => $this->formatRewardLabel(
                (string) ($attribution->reward_type ?? ReferralProgramSetting::REWARD_TYPE_PERCENT),
                (float) $attribution->reward_percent,
                $attribution->reward_fixed_cents !== null ? (int) $attribution->reward_fixed_cents : null,
            ),
            'referral_code' => $attribution->referralCode?->code,
            'referrer' => [
                'id' => $attribution->referrer_user_id,
                'name' => $attribution->referrer?->name,
                'phone' => $attribution->referrer?->phone,
            ],
            'referee' => [
                'id' => $attribution->referee_user_id,
                'name' => $attribution->referee?->name,
                'phone' => $attribution->referee?->phone,
            ],
            'referee_community' => $attribution->refereeCommunity ? [
                'id' => $attribution->refereeCommunity->id,
                'name' => $attribution->refereeCommunity->name,
            ] : null,
            'reward' => $attribution->reward ? [
                'id' => $attribution->reward->id,
                'amount_cents' => $attribution->reward->reward_amount_cents,
                'invoice_subtotal_cents' => $attribution->reward->invoice_subtotal_cents,
                'status' => $attribution->reward->status,
                'credited_at' => $attribution->reward->credited_at?->toIso8601String(),
            ] : null,
            'fraud_flags' => $attribution->fraud_flags ?? [],
            'fraud_review_status' => $attribution->fraud_review_status,
            'locked_at' => $attribution->locked_at?->toIso8601String(),
            'disqualified_at' => $attribution->disqualified_at?->toIso8601String(),
            'disqualify_reason' => $attribution->disqualify_reason,
        ];
    }

    protected function generateUniqueCode(): string
    {
        for ($i = 0; $i < 20; $i++) {
            $code = Str::upper(Str::random(8));
            if (! ReferralCode::query()->where('code', $code)->exists()) {
                return $code;
            }
        }

        return Str::upper(Str::random(12));
    }

    protected function isApprovedCommunityAdmin(User $user): bool
    {
        return $user->role === 'community_admin'
            && ($user->community_admin_status ?? '') === 'approved'
            && ($user->status ?? '') === 'active';
    }

    protected function phonesMatch(User $a, User $b): bool
    {
        $phoneA = PhoneNormalizer::normalize((string) $a->phone);
        $phoneB = PhoneNormalizer::normalize((string) $b->phone);

        return filled($phoneA) && $phoneA === $phoneB;
    }

    /** @return list<string> */
    protected function buildSignupFraudFlags(User $referrer, User $referee): array
    {
        $flags = [];
        if ($this->phonesMatch($referrer, $referee)) {
            $flags[] = 'same_phone_as_referrer';
        }

        return $flags;
    }

    protected function primaryCommunityIdForUser(int $userId): ?int
    {
        return CommunityMembership::query()
            ->where('user_id', $userId)
            ->where('role', 'admin')
            ->where('status', 'approved')
            ->orderByDesc('id')
            ->value('community_id');
    }

    public function resolveReferrerStripeCustomerId(int $referrerUserId): string
    {
        $communityId = $this->primaryCommunityIdForUser($referrerUserId);
        if (! $communityId) {
            return '';
        }

        return (string) ($this->billing->getSubscription($communityId)?->stripe_customer_id ?? '');
    }

    protected function invoiceSubtotalExTax(object|array $invoice): int
    {
        $amountPaid = (int) data_get($invoice, 'amount_paid', 0);
        $tax = collect(data_get($invoice, 'total_tax_amounts', []))
            ->sum(fn ($row) => (int) data_get($row, 'amount', 0));

        return max(0, $amountPaid - $tax);
    }

    protected function disqualify(ReferralAttribution $attribution, string $reason): void
    {
        $attribution->update([
            'status' => ReferralAttribution::STATUS_DISQUALIFIED,
            'disqualified_at' => now(),
            'disqualify_reason' => $reason,
        ]);
    }

    protected function formatRewardLabel(string $rewardType, float $rewardPercent, ?int $rewardFixedCents): string
    {
        if ($rewardType === ReferralProgramSetting::REWARD_TYPE_FIXED && $rewardFixedCents !== null) {
            return '$'.number_format($rewardFixedCents / 100, 2, '.', '');
        }

        return rtrim(rtrim(number_format($rewardPercent, 2, '.', ''), '0'), '.').'%';
    }

    protected function rewardDescription(ReferralReward $reward, ?ReferralAttribution $attribution): string
    {
        $label = $this->formatRewardLabel(
            (string) ($reward->reward_type ?? ReferralProgramSetting::REWARD_TYPE_PERCENT),
            (float) $reward->reward_percent,
            $reward->reward_fixed_cents !== null ? (int) $reward->reward_fixed_cents : null,
        );

        return sprintf(
            'Referral reward (%s) for community #%d',
            $label,
            $reward->referee_community_id,
        );
    }
}
