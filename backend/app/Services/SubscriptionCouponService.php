<?php

namespace App\Services;

use App\Exceptions\BillingException;
use App\Models\CommunitySubscription;
use App\Models\SubscriptionCoupon;
use App\Models\SubscriptionCouponRedemption;
use Illuminate\Support\Facades\DB;

class SubscriptionCouponService
{
    public function __construct(private readonly CommunityBillingService $billing)
    {
    }

    public function findByCode(string $code): ?SubscriptionCoupon
    {
        $normalized = strtoupper(trim($code));
        if ($normalized === '') {
            return null;
        }

        return SubscriptionCoupon::query()->where('code', $normalized)->first();
    }

    public function getPendingForCommunity(int $communityId): ?SubscriptionCouponRedemption
    {
        return SubscriptionCouponRedemption::query()
            ->where('community_id', $communityId)
            ->where('status', SubscriptionCouponRedemption::STATUS_PENDING)
            ->latest('id')
            ->first();
    }

    public function getAppliedForCommunity(int $communityId): ?SubscriptionCouponRedemption
    {
        return SubscriptionCouponRedemption::query()
            ->where('community_id', $communityId)
            ->where('status', SubscriptionCouponRedemption::STATUS_APPLIED)
            ->latest('id')
            ->first();
    }

    public function applyPending(
        int $communityId,
        string $code,
        string $planSlug,
        string $interval,
        ?CommunitySubscription $subscription = null,
    ): SubscriptionCouponRedemption {
        if ($subscription?->isAdminTransition() && $subscription->hasLeftoverService()) {
            throw new BillingException(
                'Coupons can be applied when billing resumes after the inherited subscription period.',
                'COUPON_NOT_ALLOWED',
            );
        }

        if ($this->getAppliedForCommunity($communityId)) {
            throw new BillingException(
                'This community already has an applied subscription coupon.',
                'COUPON_ALREADY_APPLIED',
            );
        }

        if ($subscription?->grantsPaidAccess() && ! $subscription->isPendingTrial()) {
            throw new BillingException(
                'Coupons can only be applied during initial checkout.',
                'COUPON_NOT_ALLOWED',
            );
        }

        $coupon = $this->findByCode($code);
        if (! $coupon) {
            throw new BillingException('Coupon code not found.', 'COUPON_NOT_FOUND', 404);
        }

        $this->assertRedeemable($coupon, $planSlug);

        return DB::transaction(function () use ($communityId, $coupon, $planSlug, $interval, $subscription) {
            $this->removePending($communityId, decrementCount: false);

            $redemption = SubscriptionCouponRedemption::query()->create([
                'subscription_coupon_id' => $coupon->id,
                'community_id' => $communityId,
                'community_subscription_id' => $subscription?->id,
                'code' => $coupon->code,
                'discount_type' => $coupon->discount_type,
                'percent_off' => $coupon->percent_off,
                'amount_off_cents' => $coupon->amount_off_cents,
                'currency' => $coupon->currency,
                'discount_duration' => $coupon->discount_duration,
                'discount_months' => $coupon->discount_months,
                'plan_slug' => $planSlug,
                'billing_interval' => $interval === 'year' ? 'year' : 'month',
                'stripe_coupon_id' => $coupon->stripe_coupon_id,
                'stripe_promotion_code_id' => $coupon->stripe_promotion_code_id,
                'status' => SubscriptionCouponRedemption::STATUS_PENDING,
                'redeemed_at' => now(),
            ]);

            $coupon->increment('redemption_count');
            $this->attachPendingToSubscriptionMeta($subscription, $redemption);

            return $redemption->fresh();
        });
    }

    public function removePending(int $communityId, bool $decrementCount = true): void
    {
        $pending = $this->getPendingForCommunity($communityId);
        if (! $pending) {
            return;
        }

        DB::transaction(function () use ($pending, $decrementCount) {
            $pending->update(['status' => SubscriptionCouponRedemption::STATUS_REMOVED]);

            if ($decrementCount) {
                SubscriptionCoupon::query()
                    ->where('id', $pending->subscription_coupon_id)
                    ->where('redemption_count', '>', 0)
                    ->decrement('redemption_count');
            }

            $subscription = CommunitySubscription::query()->where('community_id', $pending->community_id)->first();
            if ($subscription) {
                $meta = is_array($subscription->meta) ? $subscription->meta : [];
                unset($meta['pending_coupon_redemption_id']);
                $subscription->update(['meta' => $meta]);
            }
        });
    }

    public function preview(int $priceCents, SubscriptionCouponRedemption $redemption): array
    {
        return $redemption->toSummaryArray($priceCents);
    }

    public function linkPendingToSubscription(int $communityId, CommunitySubscription $subscription): void
    {
        $pending = $this->getPendingForCommunity($communityId);
        if (! $pending) {
            return;
        }

        if (! $pending->community_subscription_id) {
            $pending->update(['community_subscription_id' => $subscription->id]);
        }

        $this->attachPendingToSubscriptionMeta($subscription, $pending);
    }

    /**
     * @param  array<string, mixed>  $createParams
     * @return array<string, mixed>
     */
    public function appendDiscountToSubscriptionCreate(
        array $createParams,
        CommunitySubscription $subscription,
    ): array {
        $redemption = $this->resolveRedemptionForSubscription($subscription);
        if (! $redemption) {
            return $createParams;
        }

        if (filled($redemption->stripe_promotion_code_id) && ! str_starts_with((string) $redemption->stripe_promotion_code_id, 'promo_manual_')) {
            $createParams['discounts'] = [[
                'promotion_code' => $redemption->stripe_promotion_code_id,
            ]];
        } elseif (filled($redemption->stripe_coupon_id)) {
            $createParams['discounts'] = [[
                'coupon' => $redemption->stripe_coupon_id,
            ]];
        }

        return $createParams;
    }

    public function markApplied(
        CommunitySubscription $subscription,
        ?SubscriptionCouponRedemption $redemption = null,
    ): void {
        $redemption ??= $this->resolveRedemptionForSubscription($subscription);
        if (! $redemption || $redemption->status === SubscriptionCouponRedemption::STATUS_APPLIED) {
            return;
        }

        $redemption->update([
            'status' => SubscriptionCouponRedemption::STATUS_APPLIED,
            'community_subscription_id' => $subscription->id,
            'applied_at' => now(),
        ]);

        $meta = is_array($subscription->meta) ? $subscription->meta : [];
        unset($meta['pending_coupon_redemption_id']);
        $meta['applied_coupon_redemption_id'] = $redemption->id;
        $meta['coupon'] = [
            'code' => $redemption->code,
            'discount_type' => $redemption->discount_type,
            'percent_off' => $redemption->percent_off,
            'amount_off_cents' => $redemption->amount_off_cents,
            'discount_duration' => $redemption->discount_duration,
            'discount_months' => $redemption->discount_months,
            'applied_at' => now()->toIso8601String(),
        ];
        $subscription->update(['meta' => $meta]);
    }

    public function summaryForBilling(
        int $communityId,
        ?CommunitySubscription $subscription,
        ?int $priceCents = null,
    ): ?array {
        $redemption = $this->getAppliedForCommunity($communityId)
            ?? $this->getPendingForCommunity($communityId);

        if (! $redemption) {
            return null;
        }

        if ($priceCents === null && $subscription) {
            $plan = $this->billing->plan($subscription->plan_slug) ?? [];
            $priceCents = $subscription->billing_interval === 'year'
                ? (int) ($plan['price_yearly_cents'] ?? 0)
                : (int) ($plan['price_monthly_cents'] ?? 0);
        }

        $summary = $redemption->toSummaryArray((int) ($priceCents ?? 0));
        $summary['is_pending'] = $redemption->status === SubscriptionCouponRedemption::STATUS_PENDING;

        return $summary;
    }

    protected function assertRedeemable(SubscriptionCoupon $coupon, string $planSlug): void
    {
        if (! $coupon->isCurrentlyValid()) {
            throw new BillingException('This coupon is not currently valid.', 'COUPON_INVALID');
        }

        if (! $coupon->allowsPlan($planSlug)) {
            throw new BillingException('This coupon does not apply to the selected plan.', 'COUPON_PLAN_MISMATCH');
        }

        if (! $coupon->hasCapacity()) {
            throw new BillingException('This coupon has reached its redemption limit.', 'COUPON_MAXED');
        }
    }

    protected function resolveRedemptionForSubscription(CommunitySubscription $subscription): ?SubscriptionCouponRedemption
    {
        $pendingId = (int) data_get($subscription->meta, 'pending_coupon_redemption_id', 0);
        if ($pendingId > 0) {
            $pending = SubscriptionCouponRedemption::query()->find($pendingId);
            if ($pending && $pending->status === SubscriptionCouponRedemption::STATUS_PENDING) {
                return $pending;
            }
        }

        return $this->getPendingForCommunity((int) $subscription->community_id);
    }

    protected function attachPendingToSubscriptionMeta(
        ?CommunitySubscription $subscription,
        SubscriptionCouponRedemption $redemption,
    ): void {
        if (! $subscription) {
            return;
        }

        $meta = is_array($subscription->meta) ? $subscription->meta : [];
        $meta['pending_coupon_redemption_id'] = $redemption->id;
        $subscription->update(['meta' => $meta]);
    }
}
