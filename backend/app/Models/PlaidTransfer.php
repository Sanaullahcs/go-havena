<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PlaidTransfer extends Model
{
    public const PURPOSE_BOOKING_FEE = 'booking_fee';

    public const PURPOSE_SHARED_BILL = 'shared_bill';

    public const PURPOSE_COMMUNITY_CHARGE = 'community_charge';

    public const PURPOSE_REFUND = 'refund';

    public const STATUS_AUTHORIZING = 'authorizing';

    /** Authorization approved; the debit may or may not exist at Plaid (outcome unknown). */
    public const STATUS_AUTHORIZED = 'authorized';

    /** Plaid `pending`: debit created, not yet submitted to the network. */
    public const STATUS_PROCESSING = 'processing';

    public const STATUS_POSTED = 'posted';

    /** Plaid `settled` or `funds_available`. */
    public const STATUS_SETTLED = 'settled';

    public const STATUS_FAILED = 'failed';

    public const STATUS_RETURNED = 'returned';

    /** Legacy rows only: debit taken but community payout was not sent. New rows use credit_status + exception_code. */
    public const STATUS_NEEDS_PAYOUT = 'needs_payout';

    /** Legacy rows only. Refunds are tracked in refund_status. */
    public const STATUS_REFUNDED = 'refunded';

    public const STATUS_CANCELLED = 'cancelled';

    public const PAYABLE_BOOKING = 'booking';

    public const PAYABLE_SHARED_BILL = 'amenity_resident_bill';

    public const REFUND_PENDING = 'pending';

    public const REFUND_POSTED = 'posted';

    public const REFUND_SETTLED = 'settled';

    public const REFUND_FAILED = 'failed';

    public const REFUND_CANCELLED = 'cancelled';

    public const REFUND_RETURNED = 'returned';

    public const EXCEPTION_OUTCOME_UNKNOWN = 'outcome_unknown';

    public const EXCEPTION_PAYOUT_FAILED = 'payout_failed';

    public const EXCEPTION_PAYOUT_RECOVERY = 'payout_recovery_required';

    public const EXCEPTION_REFUND_FAILED = 'refund_failed';

    public const EXCEPTION_REFUND_UNKNOWN = 'refund_outcome_unknown';

    public const EXCEPTION_REFUND_REQUIRED = 'refund_required';

    public const EXCEPTION_RETURN_AFTER_REFUND = 'returned_while_refunded';

    public const EXCEPTION_DUPLICATE_COLLECTION = 'duplicate_collection';

    public const TERMINAL_STATUSES = [self::STATUS_FAILED, self::STATUS_CANCELLED, self::STATUS_RETURNED];

    private const PROGRESS_RANK = [
        self::STATUS_AUTHORIZING => 0,
        self::STATUS_AUTHORIZED => 1,
        self::STATUS_PROCESSING => 2,
        self::STATUS_NEEDS_PAYOUT => 3,
        self::STATUS_POSTED => 3,
        self::STATUS_SETTLED => 4,
    ];

    protected $fillable = [
        'public_id',
        'community_id',
        'user_id',
        'purpose',
        'payable_type',
        'payable_id',
        'amount',
        'currency',
        'status',
        'provider_status',
        'credit_status',
        'provider',
        'simulated',
        'description',
        'idempotency_key',
        'debit_authorization_id',
        'authorization_decision',
        'authorization_rationale',
        'debit_transfer_id',
        'credit_authorization_id',
        'credit_transfer_id',
        'refund_transfer_id',
        'refund_status',
        'refund_amount',
        'refund_reason',
        'refund_requested_by',
        'refund_requested_at',
        'refund_failure_message',
        'source_institution',
        'source_account_mask',
        'destination_institution',
        'destination_account_mask',
        'failure_code',
        'failure_message',
        'return_code',
        'authorized_at',
        'posted_at',
        'settled_at',
        'failed_at',
        'returned_at',
        'cancelled_at',
        'refunded_at',
        'exception_code',
        'exception_message',
        'exception_at',
        'exception_resolved_at',
        'last_event_id',
        'last_synced_at',
        'notified_status',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'refund_amount' => 'decimal:2',
            'simulated' => 'boolean',
            'meta' => 'array',
            'authorized_at' => 'datetime',
            'posted_at' => 'datetime',
            'settled_at' => 'datetime',
            'failed_at' => 'datetime',
            'returned_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'refunded_at' => 'datetime',
            'refund_requested_at' => 'datetime',
            'exception_at' => 'datetime',
            'exception_resolved_at' => 'datetime',
            'last_synced_at' => 'datetime',
            'last_event_id' => 'integer',
        ];
    }

    public function community(): BelongsTo
    {
        return $this->belongsTo(Community::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(PlaidTransferEvent::class)->orderBy('event_id');
    }

    /** The resident's debit reached the network. Does not account for refunds. */
    public function isSuccessful(): bool
    {
        return in_array($this->status, [self::STATUS_POSTED, self::STATUS_SETTLED], true)
            || ($this->status === self::STATUS_NEEDS_PAYOUT && filled($this->debit_transfer_id));
    }

    /** Collected and not (being) refunded: the charge it pays for is covered. */
    public function coversCharge(): bool
    {
        return $this->isSuccessful() && ! $this->refundActive() && $this->status !== self::STATUS_REFUNDED;
    }

    public function refundActive(): bool
    {
        return in_array($this->refund_status, [self::REFUND_PENDING, self::REFUND_POSTED, self::REFUND_SETTLED], true)
            || $this->exception_code === self::EXCEPTION_REFUND_UNKNOWN;
    }

    public function isPending(): bool
    {
        return in_array($this->status, [
            self::STATUS_AUTHORIZING,
            self::STATUS_AUTHORIZED,
            self::STATUS_PROCESSING,
        ], true);
    }

    public function isFailed(): bool
    {
        return in_array($this->status, self::TERMINAL_STATUSES, true);
    }

    public function isTerminal(): bool
    {
        return $this->isFailed();
    }

    public function canRefund(): bool
    {
        return $this->isSuccessful()
            && $this->refund_status === null
            && ! filled($this->refund_transfer_id)
            && $this->status !== self::STATUS_REFUNDED
            && $this->exception_code !== self::EXCEPTION_REFUND_UNKNOWN;
    }

    public function canCancel(): bool
    {
        return $this->status === self::STATUS_PROCESSING && filled($this->debit_transfer_id);
    }

    public function hasOpenException(): bool
    {
        return filled($this->exception_code) && $this->exception_resolved_at === null;
    }

    public static function progressRank(string $status): ?int
    {
        return self::PROGRESS_RANK[$status] ?? null;
    }

    /**
     * @return array<string, mixed>
     */
    public function toPublicPayload(): array
    {
        return [
            'id' => $this->public_id,
            'purpose' => $this->purpose,
            'purpose_label' => $this->purposeLabel(),
            'amount' => (float) $this->amount,
            'currency' => $this->currency,
            'status' => $this->status,
            'status_label' => $this->statusLabel(),
            'refund_status' => $this->refund_status,
            'refund_amount' => $this->refund_amount !== null ? (float) $this->refund_amount : null,
            'return_code' => $this->return_code,
            'simulated' => (bool) $this->simulated,
            'description' => $this->description,
            'source' => [
                'institution_name' => $this->source_institution,
                'mask' => $this->source_account_mask,
            ],
            'destination' => [
                'institution_name' => $this->destination_institution,
                'mask' => $this->destination_account_mask,
            ],
            'payable_type' => $this->payable_type,
            'payable_id' => $this->payable_id,
            'failure_message' => $this->failure_message,
            'authorized_at' => $this->authorized_at?->toIso8601String(),
            'posted_at' => $this->posted_at?->toIso8601String(),
            'settled_at' => $this->settled_at?->toIso8601String(),
            'failed_at' => $this->failed_at?->toIso8601String(),
            'returned_at' => $this->returned_at?->toIso8601String(),
            'cancelled_at' => $this->cancelled_at?->toIso8601String(),
            'refunded_at' => $this->refunded_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toAdminPayload(): array
    {
        return array_merge($this->toPublicPayload(), [
            'user_id' => $this->user_id,
            'user_name' => $this->user?->name,
            'community_id' => $this->community_id,
            'community_name' => $this->relationLoaded('community') ? $this->community?->name : null,
            'debit_transfer_id' => $this->debit_transfer_id,
            'credit_transfer_id' => $this->credit_transfer_id,
            'refund_transfer_id' => $this->refund_transfer_id,
            'provider' => $this->provider,
            'provider_status' => $this->provider_status,
            'credit_status' => $this->credit_status,
            'authorization_decision' => $this->authorization_decision,
            'refund_reason' => $this->refund_reason,
            'refund_failure_message' => $this->refund_failure_message,
            'exception_code' => $this->exception_code,
            'exception_message' => $this->exception_message,
            'exception_open' => $this->hasOpenException(),
            'last_synced_at' => $this->last_synced_at?->toIso8601String(),
        ]);
    }

    public function purposeLabel(): string
    {
        $amenity = trim((string) data_get($this->meta, 'amenity_name', ''));
        $month = trim((string) data_get($this->meta, 'billing_month', ''));

        return match ($this->purpose) {
            self::PURPOSE_BOOKING_FEE => $amenity !== '' ? $amenity.' booking fee' : 'Amenity booking fee',
            self::PURPOSE_SHARED_BILL => $amenity !== ''
                ? ($month !== '' ? $amenity.' bill · '.$month : $amenity.' shared bill')
                : 'Shared amenity bill',
            self::PURPOSE_COMMUNITY_CHARGE => 'Community charge',
            self::PURPOSE_REFUND => 'Refund',
            default => ucfirst(str_replace('_', ' ', (string) $this->purpose)),
        };
    }

    public function statusLabel(): string
    {
        if ($this->status === self::STATUS_RETURNED) {
            return $this->return_code ? 'Returned ('.$this->return_code.')' : 'Returned';
        }

        if ($this->refund_status !== null || $this->exception_code === self::EXCEPTION_REFUND_UNKNOWN) {
            return match ($this->refund_status) {
                self::REFUND_SETTLED => 'Refunded',
                self::REFUND_FAILED => 'Refund failed',
                self::REFUND_CANCELLED => 'Refund cancelled',
                self::REFUND_RETURNED => 'Refund returned',
                default => 'Refund pending',
            };
        }

        return match ($this->status) {
            self::STATUS_AUTHORIZING => 'Authorizing',
            self::STATUS_AUTHORIZED => 'Awaiting confirmation',
            self::STATUS_PROCESSING => 'Processing',
            self::STATUS_POSTED => 'Posted',
            self::STATUS_SETTLED => 'Settled',
            self::STATUS_FAILED => 'Failed',
            self::STATUS_NEEDS_PAYOUT => 'Needs payout',
            self::STATUS_REFUNDED => 'Refunded',
            self::STATUS_CANCELLED => 'Cancelled',
            default => ucfirst(str_replace('_', ' ', (string) $this->status)),
        };
    }
}
