<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReferralProgramSetting extends Model
{
    public const REWARD_TYPE_PERCENT = 'percent';

    public const REWARD_TYPE_FIXED = 'fixed';

    protected $fillable = [
        'reward_type',
        'reward_percent',
        'reward_fixed_cents',
        'is_active',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'reward_percent' => 'float',
            'reward_fixed_cents' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public static function current(): self
    {
        $settings = self::query()->first();
        if ($settings) {
            return $settings;
        }

        return self::query()->create([
            'reward_type' => self::REWARD_TYPE_PERCENT,
            'reward_percent' => 5,
            'reward_fixed_cents' => 5000,
            'is_active' => true,
        ]);
    }

    public function isFixedReward(): bool
    {
        return ($this->reward_type ?? self::REWARD_TYPE_PERCENT) === self::REWARD_TYPE_FIXED;
    }

    public function calculateRewardCents(int $invoiceSubtotalCents): int
    {
        if ($this->isFixedReward()) {
            return max(0, (int) ($this->reward_fixed_cents ?? 0));
        }

        return (int) floor($invoiceSubtotalCents * ((float) $this->reward_percent / 100));
    }
}
