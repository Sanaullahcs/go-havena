<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SubscriptionCoupon extends Model
{
    public const TYPE_PERCENT = 'percent';

    public const TYPE_FIXED = 'fixed';

    public const DURATION_ONCE = 'once';

    public const DURATION_REPEATING = 'repeating';

    public const DURATION_FOREVER = 'forever';

    protected $fillable = [
        'code',
        'name',
        'description',
        'discount_type',
        'percent_off',
        'amount_off_cents',
        'currency',
        'discount_duration',
        'discount_months',
        'valid_from',
        'valid_until',
        'max_redemptions',
        'redemption_count',
        'applicable_plan_slugs',
        'stripe_coupon_id',
        'stripe_promotion_code_id',
        'is_active',
        'superseded_by_id',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'percent_off' => 'integer',
            'amount_off_cents' => 'integer',
            'discount_months' => 'integer',
            'max_redemptions' => 'integer',
            'redemption_count' => 'integer',
            'applicable_plan_slugs' => 'array',
            'valid_from' => 'datetime',
            'valid_until' => 'datetime',
            'is_active' => 'boolean',
        ];
    }

    public function redemptions(): HasMany
    {
        return $this->hasMany(SubscriptionCouponRedemption::class);
    }

    public function supersededBy(): BelongsTo
    {
        return $this->belongsTo(self::class, 'superseded_by_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function normalizedCode(): string
    {
        return strtoupper(trim($this->code));
    }

    public function isCurrentlyValid(): bool
    {
        if (! $this->is_active) {
            return false;
        }

        $now = now();

        if ($this->valid_from !== null && $this->valid_from->isFuture()) {
            return false;
        }

        if ($this->valid_until !== null && $this->valid_until->isPast()) {
            return false;
        }

        return true;
    }

    public function allowsPlan(string $planSlug): bool
    {
        $plans = $this->applicable_plan_slugs;

        if ($plans === null || $plans === []) {
            return true;
        }

        return in_array($planSlug, $plans, true);
    }

    public function reservedRedemptionCount(): int
    {
        return $this->redemptions()
            ->whereIn('status', [
                SubscriptionCouponRedemption::STATUS_PENDING,
                SubscriptionCouponRedemption::STATUS_APPLIED,
            ])
            ->count();
    }

    public function hasCapacity(): bool
    {
        if ($this->max_redemptions === null) {
            return true;
        }

        return $this->reservedRedemptionCount() < $this->max_redemptions;
    }
}
