<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Crypt;

class UtilityAccount extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_VERIFIED = 'verified';

    public const STATUS_FAILED = 'failed';

    public const STATUS_DISABLED = 'disabled';

    protected $fillable = [
        'community_id',
        'unit_id',
        'utility_biller_id',
        'service_type',
        'nickname',
        'reference_encrypted',
        'reference_hash',
        'reference_last4',
        'consumer_name',
        'verification_status',
        'verification_message',
        'verified_at',
        'last_inquired_at',
        'created_by',
        'disabled_at',
        'disabled_by',
        'metadata',
    ];

    protected $hidden = ['reference_encrypted', 'reference_hash'];

    protected $casts = [
        'verified_at' => 'datetime',
        'last_inquired_at' => 'datetime',
        'disabled_at' => 'datetime',
        'metadata' => 'array',
    ];

    public static function hashReference(string $mnemonic, string $reference): string
    {
        return hash_hmac('sha256', strtoupper($mnemonic).'|'.$reference, (string) config('app.key'));
    }

    public function biller(): BelongsTo
    {
        return $this->belongsTo(UtilityBiller::class, 'utility_biller_id');
    }

    public function bills(): HasMany
    {
        return $this->hasMany(UtilityBill::class);
    }

    public function reference(): string
    {
        return Crypt::decryptString((string) $this->reference_encrypted);
    }

    public function maskedReference(): string
    {
        return '•••• '.$this->reference_last4;
    }

    public function isActive(): bool
    {
        return $this->disabled_at === null && $this->verification_status !== self::STATUS_DISABLED;
    }
}
