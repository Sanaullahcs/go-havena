<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReferralReward extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_CREDITED = 'credited';

    public const STATUS_FAILED = 'failed';

    public const STATUS_REVERSED = 'reversed';

    protected $fillable = [
        'referral_attribution_id',
        'referrer_user_id',
        'referee_community_id',
        'reward_type',
        'reward_percent',
        'reward_fixed_cents',
        'invoice_subtotal_cents',
        'reward_amount_cents',
        'currency',
        'stripe_invoice_id',
        'stripe_balance_transaction_id',
        'referrer_stripe_customer_id',
        'status',
        'qualified_at',
        'credited_at',
        'failure_reason',
    ];

    protected function casts(): array
    {
        return [
            'reward_percent' => 'float',
            'reward_fixed_cents' => 'integer',
            'invoice_subtotal_cents' => 'integer',
            'reward_amount_cents' => 'integer',
            'qualified_at' => 'datetime',
            'credited_at' => 'datetime',
        ];
    }

    public function attribution(): BelongsTo
    {
        return $this->belongsTo(ReferralAttribution::class, 'referral_attribution_id');
    }

    public function referrer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'referrer_user_id');
    }

    public function refereeCommunity(): BelongsTo
    {
        return $this->belongsTo(Community::class, 'referee_community_id');
    }
}
