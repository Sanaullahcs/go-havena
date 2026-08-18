<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SubscriptionCouponRedemption extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_APPLIED = 'applied';

    public const STATUS_REMOVED = 'removed';

    public const STATUS_EXPIRED = 'expired';

    protected $fillable = [
        'subscription_coupon_id',
        'community_id',
        'community_subscription_id',
        'code',
        'discount_type',
        'percent_off',
        'amount_off_cents',
        'currency',
        'discount_duration',
        'discount_months',
        'plan_slug',
        'billing_interval',
        'stripe_coupon_id',
        'stripe_promotion_code_id',
        'status',
        'redeemed_at',
        'applied_at',
    ];

    protected function casts(): array
    {
        return [
            'percent_off' => 'integer',
            'amount_off_cents' => 'integer',
            'discount_months' => 'integer',
            'redeemed_at' => 'datetime',
            'applied_at' => 'datetime',
        ];
    }

    public function coupon(): BelongsTo
    {
        return $this->belongsTo(SubscriptionCoupon::class, 'subscription_coupon_id');
    }

    public function community(): BelongsTo
    {
        return $this->belongsTo(Community::class);
    }

    public function subscription(): BelongsTo
    {
        return $this->belongsTo(CommunitySubscription::class, 'community_subscription_id');
    }

    public function discountedPriceCents(int $priceCents): int
    {
        if ($this->discount_type === SubscriptionCoupon::TYPE_PERCENT) {
            $percent = max(0, min(100, (int) $this->percent_off));

            return max(0, (int) round($priceCents * (100 - $percent) / 100));
        }

        $off = max(0, (int) $this->amount_off_cents);

        return max(0, $priceCents - $off);
    }

    /** @return array<string, mixed> */
    public function toSummaryArray(int $priceCents): array
    {
        $discounted = $this->discountedPriceCents($priceCents);

        return [
            'id' => $this->id,
            'code' => $this->code,
            'discount_type' => $this->discount_type,
            'percent_off' => $this->percent_off,
            'amount_off_cents' => $this->amount_off_cents,
            'currency' => $this->currency,
            'discount_duration' => $this->discount_duration,
            'discount_months' => $this->discount_months,
            'plan_slug' => $this->plan_slug,
            'billing_interval' => $this->billing_interval,
            'status' => $this->status,
            'original_price_cents' => $priceCents,
            'discounted_price_cents' => $discounted,
            'savings_cents' => max(0, $priceCents - $discounted),
            'redeemed_at' => $this->redeemed_at?->toIso8601String(),
            'applied_at' => $this->applied_at?->toIso8601String(),
        ];
    }
}
