<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SubscriptionPlanPrice extends Model
{
    protected $fillable = [
        'subscription_plan_id',
        'interval',
        'amount_cents',
        'stripe_price_id',
        'is_current',
    ];

    protected function casts(): array
    {
        return [
            'amount_cents' => 'integer',
            'is_current' => 'boolean',
        ];
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(SubscriptionPlan::class, 'subscription_plan_id');
    }
}
