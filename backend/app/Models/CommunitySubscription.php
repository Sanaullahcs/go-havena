<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CommunitySubscription extends Model
{
    public const STATUS_INCOMPLETE = 'incomplete';
    public const STATUS_ACTIVE = 'active';
    public const STATUS_PAST_DUE = 'past_due';
    public const STATUS_GRACE = 'grace';
    public const STATUS_CANCELED = 'canceled';
    public const STATUS_UNPAID = 'unpaid';
    public const STATUS_TRIALING = 'trialing';

    protected $fillable = [
        'community_id',
        'plan_slug',
        'billing_interval',
        'status',
        'seat_limit',
        'extra_seats',
        'estimated_residents',
        'stripe_customer_id',
        'stripe_subscription_id',
        'stripe_price_id',
        'current_period_start',
        'current_period_end',
        'cancel_at_period_end',
        'grace_ends_at',
        'canceled_at',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'seat_limit' => 'integer',
            'extra_seats' => 'integer',
            'estimated_residents' => 'integer',
            'current_period_start' => 'datetime',
            'current_period_end' => 'datetime',
            'cancel_at_period_end' => 'boolean',
            'grace_ends_at' => 'datetime',
            'canceled_at' => 'datetime',
            'meta' => 'array',
        ];
    }

    public function community(): BelongsTo
    {
        return $this->belongsTo(Community::class);
    }

    public function totalSeatLimit(): int
    {
        return max(0, (int) $this->seat_limit + (int) $this->extra_seats);
    }

    /** Subscription allows inviting/approving residents. */
    public function allowsSeatAllocation(): bool
    {
        if (in_array($this->status, [self::STATUS_ACTIVE, self::STATUS_TRIALING], true)) {
            return true;
        }

        if ($this->status === self::STATUS_GRACE || $this->status === self::STATUS_PAST_DUE) {
            return $this->grace_ends_at === null || $this->grace_ends_at->isFuture();
        }

        return false;
    }

    public function isInGrace(): bool
    {
        return in_array($this->status, [self::STATUS_GRACE, self::STATUS_PAST_DUE], true)
            && ($this->grace_ends_at === null || $this->grace_ends_at->isFuture());
    }
}
