<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ReferralAttribution extends Model
{
    public const STATUS_LOCKED = 'locked';

    public const STATUS_PENDING_QUALIFICATION = 'pending_qualification';

    public const STATUS_QUALIFIED = 'qualified';

    public const STATUS_DISQUALIFIED = 'disqualified';

    public const FRAUD_NONE = 'none';

    public const FRAUD_FLAGGED = 'flagged';

    public const FRAUD_APPROVED = 'approved';

    public const FRAUD_REJECTED = 'rejected';

    protected $fillable = [
        'referral_code_id',
        'referrer_user_id',
        'referee_user_id',
        'referee_community_id',
        'reward_type',
        'reward_percent',
        'reward_fixed_cents',
        'status',
        'referral_source',
        'referral_token',
        'locked_at',
        'disqualified_at',
        'disqualify_reason',
        'fraud_flags',
        'fraud_review_status',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'reward_percent' => 'float',
            'reward_fixed_cents' => 'integer',
            'locked_at' => 'datetime',
            'disqualified_at' => 'datetime',
            'fraud_flags' => 'array',
            'meta' => 'array',
        ];
    }

    public function referralCode(): BelongsTo
    {
        return $this->belongsTo(ReferralCode::class);
    }

    public function referrer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'referrer_user_id');
    }

    public function referee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'referee_user_id');
    }

    public function refereeCommunity(): BelongsTo
    {
        return $this->belongsTo(Community::class, 'referee_community_id');
    }

    public function reward(): HasOne
    {
        return $this->hasOne(ReferralReward::class);
    }

    public function isEligibleForReward(): bool
    {
        if ($this->status === self::STATUS_DISQUALIFIED) {
            return false;
        }

        if ($this->fraud_review_status === self::FRAUD_FLAGGED) {
            return false;
        }

        if ($this->fraud_review_status === self::FRAUD_REJECTED) {
            return false;
        }

        if ($this->reward?->status === ReferralReward::STATUS_CREDITED) {
            return false;
        }

        return true;
    }

    public function isFixedReward(): bool
    {
        return ($this->reward_type ?? ReferralProgramSetting::REWARD_TYPE_PERCENT) === ReferralProgramSetting::REWARD_TYPE_FIXED;
    }

    public function calculateRewardCents(int $invoiceSubtotalCents): int
    {
        if ($this->isFixedReward()) {
            return max(0, (int) ($this->reward_fixed_cents ?? 0));
        }

        return (int) floor($invoiceSubtotalCents * ((float) $this->reward_percent / 100));
    }
}
