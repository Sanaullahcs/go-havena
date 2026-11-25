<?php

namespace App\Services;

use App\Exceptions\BillingException;
use App\Models\SubscriptionCoupon;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Stripe\Exception\ApiErrorException;

class SubscriptionCouponAdminService
{
    public function __construct(private readonly CommunityBillingService $billing)
    {
    }

    /** @return array<string, mixed> */
    public function transform(SubscriptionCoupon $coupon): array
    {
        return [
            'id' => $coupon->id,
            'code' => $coupon->code,
            'name' => $coupon->name,
            'description' => $coupon->description,
            'discount_type' => $coupon->discount_type,
            'percent_off' => $coupon->percent_off,
            'amount_off_cents' => $coupon->amount_off_cents,
            'currency' => $coupon->currency,
            'discount_duration' => $coupon->discount_duration,
            'discount_months' => $coupon->discount_months,
            'valid_from' => $coupon->valid_from?->toIso8601String(),
            'valid_until' => $coupon->valid_until?->toIso8601String(),
            'max_redemptions' => $coupon->max_redemptions,
            'redemption_count' => $coupon->redemption_count,
            'reserved_redemptions' => $coupon->reservedRedemptionCount(),
            'applicable_plan_slugs' => $coupon->applicable_plan_slugs,
            'stripe_coupon_id' => $coupon->stripe_coupon_id,
            'stripe_promotion_code_id' => $coupon->stripe_promotion_code_id,
            'is_active' => (bool) $coupon->is_active,
            'has_stripe_coupon' => filled($coupon->stripe_coupon_id),
            'created_at' => $coupon->created_at?->toIso8601String(),
            'updated_at' => $coupon->updated_at?->toIso8601String(),
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(array $data, ?User $actor = null): SubscriptionCoupon
    {
        $coupon = new SubscriptionCoupon([
            'code' => $this->normalizeCode((string) $data['code']),
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'discount_type' => $data['discount_type'],
            'percent_off' => $data['discount_type'] === SubscriptionCoupon::TYPE_PERCENT
                ? (int) $data['percent_off']
                : null,
            'amount_off_cents' => $data['discount_type'] === SubscriptionCoupon::TYPE_FIXED
                ? (int) $data['amount_off_cents']
                : null,
            'currency' => strtolower((string) ($data['currency'] ?? config('billing.currency', 'usd'))),
            'discount_duration' => $data['discount_duration'],
            'discount_months' => $data['discount_duration'] === SubscriptionCoupon::DURATION_REPEATING
                ? (int) $data['discount_months']
                : null,
            'valid_from' => $data['valid_from'] ?? null,
            'valid_until' => $data['valid_until'] ?? null,
            'max_redemptions' => array_key_exists('max_redemptions', $data) && $data['max_redemptions'] !== null
                ? (int) $data['max_redemptions']
                : null,
            'applicable_plan_slugs' => $this->normalizePlanSlugs($data['applicable_plan_slugs'] ?? null),
            'is_active' => array_key_exists('is_active', $data) ? (bool) $data['is_active'] : true,
            'created_by' => $actor?->id,
        ]);

        $this->assertDiscountShape($coupon);
        $this->assertUniqueCode($coupon->code);

        return DB::transaction(function () use ($coupon) {
            $coupon->save();
            $this->syncStripeCoupon($coupon);
            $coupon->save();

            return $coupon->fresh();
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(SubscriptionCoupon $coupon, array $data): SubscriptionCoupon
    {
        $next = clone $coupon;
        $next->fill([
            'code' => array_key_exists('code', $data) ? $this->normalizeCode((string) $data['code']) : $coupon->code,
            'name' => $data['name'] ?? $coupon->name,
            'description' => array_key_exists('description', $data) ? $data['description'] : $coupon->description,
            'discount_type' => $data['discount_type'] ?? $coupon->discount_type,
            'percent_off' => ($data['discount_type'] ?? $coupon->discount_type) === SubscriptionCoupon::TYPE_PERCENT
                ? (int) ($data['percent_off'] ?? $coupon->percent_off)
                : null,
            'amount_off_cents' => ($data['discount_type'] ?? $coupon->discount_type) === SubscriptionCoupon::TYPE_FIXED
                ? (int) ($data['amount_off_cents'] ?? $coupon->amount_off_cents)
                : null,
            'currency' => strtolower((string) ($data['currency'] ?? $coupon->currency)),
            'discount_duration' => $data['discount_duration'] ?? $coupon->discount_duration,
            'discount_months' => ($data['discount_duration'] ?? $coupon->discount_duration) === SubscriptionCoupon::DURATION_REPEATING
                ? (int) ($data['discount_months'] ?? $coupon->discount_months)
                : null,
            'valid_from' => array_key_exists('valid_from', $data) ? $data['valid_from'] : $coupon->valid_from,
            'valid_until' => array_key_exists('valid_until', $data) ? $data['valid_until'] : $coupon->valid_until,
            'max_redemptions' => array_key_exists('max_redemptions', $data)
                ? ($data['max_redemptions'] !== null ? (int) $data['max_redemptions'] : null)
                : $coupon->max_redemptions,
            'applicable_plan_slugs' => array_key_exists('applicable_plan_slugs', $data)
                ? $this->normalizePlanSlugs($data['applicable_plan_slugs'])
                : $coupon->applicable_plan_slugs,
            'is_active' => array_key_exists('is_active', $data) ? (bool) $data['is_active'] : $coupon->is_active,
        ]);

        $this->assertDiscountShape($next);
        $this->assertUniqueCode($next->code, $coupon->id);

        $discountChanged = $this->discountTermsChanged($coupon, $next);
        $codeChanged = $next->code !== $coupon->code;

        if ($discountChanged || $codeChanged) {
            $this->deactivateStripePromotionCode($coupon);
            $coupon->fill($next->getAttributes());
            $this->syncStripeCoupon($coupon, forceNew: true);
        } else {
            $coupon->fill($next->getAttributes());
            $this->syncStripePromotionCodeMetadata($coupon);
        }

        $coupon->save();

        return $coupon->fresh();
    }

    public function setActive(SubscriptionCoupon $coupon, bool $active): SubscriptionCoupon
    {
        $coupon->is_active = $active;
        if (! $active) {
            $this->deactivateStripePromotionCode($coupon);
        } elseif ($this->billing->stripeConfigured() && filled($coupon->stripe_coupon_id) && ! filled($coupon->stripe_promotion_code_id)) {
            $this->syncStripeCoupon($coupon, forceNew: true);
        } elseif ($this->billing->stripeConfigured() && filled($coupon->stripe_promotion_code_id)) {
            try {
                $this->billing->stripe()->promotionCodes->update($coupon->stripe_promotion_code_id, [
                    'active' => true,
                ]);
            } catch (ApiErrorException) {
                $this->syncStripeCoupon($coupon, forceNew: true);
            }
        }

        $coupon->save();

        return $coupon->fresh();
    }

    protected function discountTermsChanged(SubscriptionCoupon $before, SubscriptionCoupon $after): bool
    {
        return $before->discount_type !== $after->discount_type
            || (int) $before->percent_off !== (int) $after->percent_off
            || (int) $before->amount_off_cents !== (int) $after->amount_off_cents
            || $before->currency !== $after->currency
            || $before->discount_duration !== $after->discount_duration
            || (int) $before->discount_months !== (int) $after->discount_months;
    }

    protected function normalizeCode(string $code): string
    {
        $normalized = strtoupper(trim($code));
        if ($normalized === '' || ! preg_match('/^[A-Z0-9_-]{3,40}$/', $normalized)) {
            throw new BillingException(
                'Coupon code must be 3–40 characters and use letters, numbers, underscores, or hyphens.',
                'COUPON_CODE_INVALID',
            );
        }

        return $normalized;
    }

    protected function assertUniqueCode(string $code, ?int $ignoreId = null): void
    {
        $exists = SubscriptionCoupon::query()
            ->where('code', $code)
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw new BillingException('A coupon with this code already exists.', 'COUPON_CODE_TAKEN');
        }
    }

    /** @param  array<int, string>|null  $plans */
    protected function normalizePlanSlugs(?array $plans): ?array
    {
        if ($plans === null) {
            return null;
        }

        $normalized = collect($plans)
            ->map(fn ($slug) => strtolower(trim((string) $slug)))
            ->filter()
            ->unique()
            ->values()
            ->all();

        return $normalized === [] ? null : $normalized;
    }

    protected function assertDiscountShape(SubscriptionCoupon $coupon): void
    {
        if ($coupon->discount_type === SubscriptionCoupon::TYPE_PERCENT) {
            if ($coupon->percent_off === null || $coupon->percent_off < 1 || $coupon->percent_off > 100) {
                throw new BillingException('Percent coupons must be between 1 and 100.', 'COUPON_INVALID');
            }

            return;
        }

        if ($coupon->discount_type === SubscriptionCoupon::TYPE_FIXED) {
            if ($coupon->amount_off_cents === null || $coupon->amount_off_cents < 1) {
                throw new BillingException('Fixed coupons must have an amount greater than zero.', 'COUPON_INVALID');
            }

            return;
        }

        throw new BillingException('Unsupported coupon discount type.', 'COUPON_INVALID');
    }

    protected function syncStripeCoupon(SubscriptionCoupon $coupon, bool $forceNew = false): void
    {
        if (! $this->billing->stripeConfigured()) {
            if (! filled($coupon->stripe_coupon_id)) {
                $coupon->stripe_coupon_id = 'coupon_manual_'.$coupon->id;
                $coupon->stripe_promotion_code_id = 'promo_manual_'.$coupon->id;
            }

            return;
        }

        if (! $forceNew && filled($coupon->stripe_coupon_id) && filled($coupon->stripe_promotion_code_id)) {
            $this->syncStripePromotionCodeMetadata($coupon);

            return;
        }

        $stripe = $this->billing->stripe();
        $payload = [
            'duration' => $coupon->discount_duration,
            'name' => Str::limit($coupon->name, 40, ''),
            'metadata' => [
                'havena_coupon_id' => (string) ($coupon->id ?? 'new'),
                'code' => $coupon->code,
            ],
        ];

        if ($coupon->discount_type === SubscriptionCoupon::TYPE_PERCENT) {
            // Stripe expects a numeric percent (integer preferred); avoid empty/null payloads.
            $payload['percent_off'] = (int) round((float) $coupon->percent_off);
        } else {
            $payload['amount_off'] = (int) $coupon->amount_off_cents;
            $payload['currency'] = strtolower((string) $coupon->currency);
        }

        if ($coupon->discount_duration === SubscriptionCoupon::DURATION_REPEATING) {
            $payload['duration_in_months'] = max(1, (int) $coupon->discount_months);
        }

        try {
            $stripeCoupon = $stripe->coupons->create($payload);
            $coupon->stripe_coupon_id = (string) $stripeCoupon->id;

            if (filled($coupon->stripe_promotion_code_id)) {
                $this->deactivateStripePromotionCode($coupon);
            }

            $promoPayload = [
                'coupon' => $coupon->stripe_coupon_id,
                'code' => $coupon->code,
                'active' => (bool) $coupon->is_active,
                'metadata' => [
                    'havena_coupon_id' => (string) ($coupon->id ?? 'new'),
                ],
            ];
            if ($coupon->max_redemptions !== null && (int) $coupon->max_redemptions > 0) {
                $promoPayload['max_redemptions'] = (int) $coupon->max_redemptions;
            }

            $promo = $stripe->promotionCodes->create($promoPayload);
            $coupon->stripe_promotion_code_id = (string) $promo->id;
        } catch (ApiErrorException $e) {
            throw new BillingException(
                'Unable to sync coupon with Stripe: '.$e->getMessage(),
                'STRIPE_COUPON_SYNC_FAILED',
                502,
            );
        }
    }

    protected function syncStripePromotionCodeMetadata(SubscriptionCoupon $coupon): void
    {
        if (! $this->billing->stripeConfigured() || ! filled($coupon->stripe_promotion_code_id)) {
            return;
        }

        try {
            $payload = [
                'active' => (bool) $coupon->is_active,
            ];
            // Stripe rejects null/empty for max_redemptions — only send a positive int.
            // Unlimited coupons omit the field (Stripe keeps existing limit if already set).
            if ($coupon->max_redemptions !== null && (int) $coupon->max_redemptions > 0) {
                $payload['max_redemptions'] = (int) $coupon->max_redemptions;
            }

            $this->billing->stripe()->promotionCodes->update($coupon->stripe_promotion_code_id, $payload);
        } catch (ApiErrorException) {
            // Non-fatal — Havena still validates locally.
        }
    }

    protected function deactivateStripePromotionCode(SubscriptionCoupon $coupon): void
    {
        if (! $this->billing->stripeConfigured() || ! filled($coupon->stripe_promotion_code_id)) {
            return;
        }

        try {
            $this->billing->stripe()->promotionCodes->update($coupon->stripe_promotion_code_id, [
                'active' => false,
            ]);
        } catch (ApiErrorException) {
            // Ignore stale Stripe ids during tests/local edits.
        }
    }
}
