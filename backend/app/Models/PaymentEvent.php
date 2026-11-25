<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PaymentEvent extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'payment_attempt_id',
        'event',
        'status_from',
        'status_to',
        'actor_type',
        'actor_id',
        'data',
    ];

    protected $casts = [
        'data' => 'array',
    ];

    public function attempt(): BelongsTo
    {
        return $this->belongsTo(PaymentAttempt::class, 'payment_attempt_id');
    }
}
