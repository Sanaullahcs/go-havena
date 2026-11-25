<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

class UtilityBill extends Model
{
    public const STATUS_UNPAID = 'unpaid';

    public const STATUS_PAID = 'paid';

    /** Paid outside Havena (another bank or wallet); never attributed to a Havena payment. */
    public const STATUS_EXTERNALLY_PAID = 'externally_paid';

    public const STATUS_BLOCKED = 'blocked';

    protected $fillable = [
        'utility_account_id',
        'community_id',
        'unit_id',
        'billing_month',
        'consumer_name',
        'amount_within_due_paisa',
        'amount_after_due_paisa',
        'due_date',
        'status',
        'provider_status',
        'provider_tran_auth_id',
        'paid_amount_paisa',
        'paid_at',
        'paid_via',
        'payment_attempt_id',
        'fetched_at',
        'metadata',
    ];

    protected $casts = [
        'amount_within_due_paisa' => 'integer',
        'amount_after_due_paisa' => 'integer',
        'paid_amount_paisa' => 'integer',
        'due_date' => 'date',
        'paid_at' => 'datetime',
        'fetched_at' => 'datetime',
        'metadata' => 'array',
    ];

    public function account(): BelongsTo
    {
        return $this->belongsTo(UtilityAccount::class, 'utility_account_id');
    }

    public function isPaid(): bool
    {
        return in_array($this->status, [self::STATUS_PAID, self::STATUS_EXTERNALLY_PAID], true);
    }

    public function isPastDue(?Carbon $at = null): bool
    {
        if (! $this->due_date) {
            return false;
        }

        return ($at ?? now())->copy()->startOfDay()->gt($this->due_date->copy()->endOfDay()->startOfDay());
    }

    /** Amount the biller will accept right now, including the late amount once the due date passes. */
    public function payablePaisa(?Carbon $at = null): int
    {
        if ($this->isPastDue($at) && $this->amount_after_due_paisa) {
            return (int) $this->amount_after_due_paisa;
        }

        return (int) $this->amount_within_due_paisa;
    }
}
