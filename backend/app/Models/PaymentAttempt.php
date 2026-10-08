<?php

namespace App\Models;

use App\Support\Currency;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PaymentAttempt extends Model
{
    public const PROVIDER_KUICKPAY = 'kuickpay';

    public const PAYABLE_SERVICE_BILL = 'unit_service_bill';

    public const PAYABLE_AMENITY_BILL = 'amenity_resident_bill';

    public const PAYABLE_UTILITY_BILL = 'utility_bill';

    public const PAYABLE_TYPES = [
        self::PAYABLE_SERVICE_BILL,
        self::PAYABLE_AMENITY_BILL,
        self::PAYABLE_UTILITY_BILL,
    ];

    public const STATUS_CREATED = 'created';

    public const STATUS_AWAITING_AUTHORIZATION = 'awaiting_authorization';

    public const STATUS_AUTHORIZED = 'authorized';

    public const STATUS_SUBMITTED = 'submitted_to_biller';

    public const STATUS_PENDING_CONFIRMATION = 'pending_confirmation';

    public const STATUS_SUCCEEDED = 'succeeded';

    public const STATUS_FAILED = 'failed';

    public const STATUS_CANCELLED = 'cancelled';

    public const STATUS_EXPIRED = 'expired';

    /** Money was collected but the biller refused the payment, so it must go back to the resident. */
    public const STATUS_REFUND_PENDING = 'refund_pending';

    public const STATUS_REFUNDED = 'refunded';

    public const STATUS_REVERSED = 'reversed';

    public const ACTIVE_STATUSES = [
        self::STATUS_CREATED,
        self::STATUS_AWAITING_AUTHORIZATION,
        self::STATUS_AUTHORIZED,
        self::STATUS_SUBMITTED,
        self::STATUS_PENDING_CONFIRMATION,
    ];

    /** Statuses where the resident may already have been charged; never offer Pay Now again. */
    public const IN_FLIGHT_STATUSES = [
        self::STATUS_AUTHORIZED,
        self::STATUS_SUBMITTED,
        self::STATUS_PENDING_CONFIRMATION,
    ];

    public const CHANNEL_MOBILE = 'mobile';

    public const CHANNEL_WEB = 'web';

    /** KuickPay collected the money through its own channels (bank app, ATM, wallet). */
    public const CHANNEL_KUICKPAY = 'kuickpay';

    protected $fillable = [
        'public_id',
        'reference',
        'community_id',
        'user_id',
        'unit_id',
        'provider',
        'payable_type',
        'payable_id',
        'title',
        'subtitle',
        'amount_paisa',
        'currency',
        'status',
        'idempotency_key',
        'active_lock',
        'channel',
        'method',
        'app_return_url',
        'launch_token',
        'provider_order_id',
        'provider_session_id',
        'provider_transaction_id',
        'provider_auth_id',
        'provider_receipt_id',
        'provider_response_code',
        'failure_code',
        'failure_message',
        'simulated',
        'reconcile_attempts',
        'next_reconcile_at',
        'needs_attention',
        'initiated_at',
        'authorized_at',
        'submitted_at',
        'confirmed_at',
        'failed_at',
        'cancelled_at',
        'expires_at',
        'meta',
    ];

    protected $casts = [
        'amount_paisa' => 'integer',
        'simulated' => 'boolean',
        'needs_attention' => 'boolean',
        'reconcile_attempts' => 'integer',
        'next_reconcile_at' => 'datetime',
        'initiated_at' => 'datetime',
        'authorized_at' => 'datetime',
        'submitted_at' => 'datetime',
        'confirmed_at' => 'datetime',
        'failed_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'expires_at' => 'datetime',
        'meta' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function community(): BelongsTo
    {
        return $this->belongsTo(Community::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(PaymentEvent::class)->orderBy('id');
    }

    public function isActive(): bool
    {
        return in_array($this->status, self::ACTIVE_STATUSES, true);
    }

    public function isInFlight(): bool
    {
        return in_array($this->status, self::IN_FLIGHT_STATUSES, true);
    }

    public function isSucceeded(): bool
    {
        return $this->status === self::STATUS_SUCCEEDED;
    }

    public function isTerminal(): bool
    {
        return ! $this->isActive();
    }

    public function isAwaitingAuthorization(): bool
    {
        return in_array($this->status, [self::STATUS_CREATED, self::STATUS_AWAITING_AUTHORIZATION], true);
    }

    public function hasExpired(): bool
    {
        return $this->isAwaitingAuthorization()
            && $this->expires_at !== null
            && $this->expires_at->isPast();
    }

    public function lockKey(): string
    {
        return $this->payable_type.':'.$this->payable_id;
    }

    public function amountRupees(): float
    {
        return round($this->amount_paisa / 100, 2);
    }

    public function formattedAmount(): string
    {
        return Currency::format($this->amountRupees(), $this->currency ?: 'PKR');
    }

    /** Resident-facing status, deliberately free of provider codes. */
    public function displayStatus(): string
    {
        return match ($this->status) {
            self::STATUS_CREATED, self::STATUS_AWAITING_AUTHORIZATION => 'awaiting_payment',
            self::STATUS_AUTHORIZED, self::STATUS_SUBMITTED, self::STATUS_PENDING_CONFIRMATION => 'processing',
            self::STATUS_SUCCEEDED => 'succeeded',
            self::STATUS_CANCELLED => 'cancelled',
            self::STATUS_EXPIRED => 'expired',
            self::STATUS_REFUND_PENDING => 'refund_pending',
            self::STATUS_REFUNDED => 'refunded',
            self::STATUS_REVERSED => 'reversed',
            default => 'failed',
        };
    }

    public function methodLabel(): ?string
    {
        if (! $this->method) {
            return null;
        }

        foreach ((array) config('kuickpay.methods', []) as $method) {
            if (($method['id'] ?? null) === $this->method) {
                return (string) $method['label'];
            }
        }

        return ucfirst($this->method);
    }
}
