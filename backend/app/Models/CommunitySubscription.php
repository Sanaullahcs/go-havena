<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CommunitySubscription extends Model
{
    public const STATUS_INCOMPLETE = 'incomplete';
    public const STATUS_PENDING_TRIAL = 'pending_trial';
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
        if ($this->grantsPaidAccess()) {
            return true;
        }

        if ($this->status === self::STATUS_GRACE || $this->status === self::STATUS_PAST_DUE) {
            return $this->grace_ends_at === null || $this->grace_ends_at->isFuture();
        }

        return false;
    }

    public function isAdminTransition(): bool
    {
        return (bool) data_get($this->meta, 'admin_transition', false);
    }

    /** Remaining paid/trial days after the previous admin was suspended. */
    public function hasLeftoverService(): bool
    {
        if (! $this->isAdminTransition()) {
            return false;
        }

        $ends = $this->leftoverEndsAt();

        return $ends !== null && $ends->isFuture();
    }

    public function leftoverEndsAt(): ?\Illuminate\Support\Carbon
    {
        if (! $this->isAdminTransition()) {
            return null;
        }

        return $this->grace_ends_at ?? $this->current_period_end;
    }

    public function isInGrace(): bool
    {
        if ($this->hasLeftoverService()) {
            return true;
        }

        return in_array($this->status, [self::STATUS_GRACE, self::STATUS_PAST_DUE], true)
            && ($this->grace_ends_at === null || $this->grace_ends_at->isFuture());
    }

    public function isManualGrant(): bool
    {
        return (data_get($this->meta, 'activated_via') === 'manual');
    }

    /** Whether this community has already used its one-time free trial. */
    public function hasConsumedTrial(): bool
    {
        if ((bool) data_get($this->meta, 'trial_consumed', false)) {
            return true;
        }

        // Legacy rows that started a trial before trial_consumed was persisted.
        return filled(data_get($this->meta, 'trial_started_on_approval'));
    }

    /** Card captured via Stripe, or a system-admin grant (no card collected). */
    public function hasCardOnFile(): bool
    {
        if ($this->isManualGrant() && in_array($this->status, [self::STATUS_TRIALING, self::STATUS_ACTIVE], true)) {
            return true;
        }

        if (! (bool) data_get($this->meta, 'card_on_file', false)) {
            return false;
        }

        return in_array($this->status, [
            self::STATUS_PENDING_TRIAL,
            self::STATUS_TRIALING,
            self::STATUS_ACTIVE,
        ], true);
    }

    /** Card is saved but the 30-day trial has not started yet (waiting for platform approval). */
    public function isPendingTrial(): bool
    {
        return $this->status === self::STATUS_PENDING_TRIAL && $this->hasCardOnFile();
    }

    /** Trial/active access that can unlock the dashboard after platform approval. */
    public function grantsPaidAccess(): bool
    {
        if ($this->hasLeftoverService()) {
            return true;
        }

        if ($this->isManualGrant()) {
            return in_array($this->status, [self::STATUS_TRIALING, self::STATUS_ACTIVE], true);
        }

        return in_array($this->status, [self::STATUS_TRIALING, self::STATUS_ACTIVE], true)
            && (bool) data_get($this->meta, 'card_on_file', false);
    }
}
