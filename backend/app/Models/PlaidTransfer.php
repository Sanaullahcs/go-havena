<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlaidTransfer extends Model
{
    public const PURPOSE_BOOKING_FEE = 'booking_fee';

    public const PURPOSE_SHARED_BILL = 'shared_bill';

    public const PURPOSE_COMMUNITY_CHARGE = 'community_charge';

    public const PURPOSE_REFUND = 'refund';

    public const STATUS_AUTHORIZING = 'authorizing';

    public const STATUS_AUTHORIZED = 'authorized';

    public const STATUS_PROCESSING = 'processing';

    public const STATUS_POSTED = 'posted';

    public const STATUS_SETTLED = 'settled';

    public const STATUS_FAILED = 'failed';

    public const STATUS_RETURNED = 'returned';

    public const STATUS_NEEDS_PAYOUT = 'needs_payout';

    public const STATUS_REFUNDED = 'refunded';

    public const STATUS_CANCELLED = 'cancelled';

    public const PAYABLE_BOOKING = 'booking';

    public const PAYABLE_SHARED_BILL = 'amenity_resident_bill';

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
        'provider',
        'simulated',
        'description',
        'idempotency_key',
        'debit_authorization_id',
        'debit_transfer_id',
        'credit_authorization_id',
        'credit_transfer_id',
        'refund_transfer_id',
        'source_institution',
        'source_account_mask',
        'destination_institution',
        'destination_account_mask',
        'failure_code',
        'failure_message',
        'authorized_at',
        'posted_at',
        'settled_at',
        'failed_at',
        'refunded_at',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'simulated' => 'boolean',
            'meta' => 'array',
            'authorized_at' => 'datetime',
            'posted_at' => 'datetime',
            'settled_at' => 'datetime',
            'failed_at' => 'datetime',
            'refunded_at' => 'datetime',
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

    public function isSuccessful(): bool
    {
        return in_array($this->status, [self::STATUS_POSTED, self::STATUS_SETTLED], true);
    }

    public function isPending(): bool
    {
        return in_array($this->status, [
            self::STATUS_AUTHORIZING,
            self::STATUS_AUTHORIZED,
            self::STATUS_PROCESSING,
            self::STATUS_NEEDS_PAYOUT,
        ], true);
    }

    public function isFailed(): bool
    {
        return in_array($this->status, [self::STATUS_FAILED, self::STATUS_RETURNED, self::STATUS_CANCELLED], true);
    }

    public function canRefund(): bool
    {
        return $this->isSuccessful() && ! filled($this->refund_transfer_id);
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
            'debit_transfer_id' => $this->debit_transfer_id,
            'credit_transfer_id' => $this->credit_transfer_id,
            'provider' => $this->provider,
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
        return match ($this->status) {
            self::STATUS_AUTHORIZING => 'Authorizing',
            self::STATUS_AUTHORIZED => 'Authorized',
            self::STATUS_PROCESSING => 'Processing',
            self::STATUS_POSTED => 'Posted',
            self::STATUS_SETTLED => 'Settled',
            self::STATUS_FAILED => 'Failed',
            self::STATUS_RETURNED => 'Returned',
            self::STATUS_NEEDS_PAYOUT => 'Needs payout',
            self::STATUS_REFUNDED => 'Refunded',
            self::STATUS_CANCELLED => 'Cancelled',
            default => ucfirst(str_replace('_', ' ', (string) $this->status)),
        };
    }
}
