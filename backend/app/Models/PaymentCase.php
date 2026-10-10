<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Internal dispute, refund request, or reversal. Havena records the outcome; it does not move money at KuickPay. */
class PaymentCase extends Model
{
    public const KIND_DISPUTE = 'dispute';

    public const KIND_REFUND = 'refund_request';

    public const KIND_REVERSAL = 'reversal';

    public const KINDS = [self::KIND_DISPUTE, self::KIND_REFUND, self::KIND_REVERSAL];

    public const STATUS_OPEN = 'open';

    public const STATUS_NEEDS_INFORMATION = 'needs_information';

    public const STATUS_REJECTED = 'rejected';

    public const STATUS_RECORDED = 'recorded';

    public const OPEN_STATUSES = [self::STATUS_OPEN, self::STATUS_NEEDS_INFORMATION];

    protected $fillable = [
        'public_id',
        'community_id',
        'payment_attempt_id',
        'payable_type',
        'payable_id',
        'kind',
        'status',
        'reason',
        'details',
        'amount_paisa',
        'opened_by',
        'reviewed_by',
        'resolution_note',
        'reopened_bill',
        'resolved_at',
    ];

    protected $casts = [
        'amount_paisa' => 'integer',
        'reopened_bill' => 'boolean',
        'resolved_at' => 'datetime',
    ];

    public function attempt(): BelongsTo
    {
        return $this->belongsTo(PaymentAttempt::class, 'payment_attempt_id');
    }

    public function isOpen(): bool
    {
        return in_array($this->status, self::OPEN_STATUSES, true);
    }
}
