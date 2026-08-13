<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SubscriptionPlan extends Model
{
    protected $fillable = [
        'slug',
        'name',
        'description',
        'seat_limit',
        'price_monthly_cents',
        'price_yearly_cents',
        'trial_period_days',
        'stripe_product_id',
        'stripe_price_monthly',
        'stripe_price_yearly',
        'is_active',
        'is_recommended',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'seat_limit' => 'integer',
            'price_monthly_cents' => 'integer',
            'price_yearly_cents' => 'integer',
            'trial_period_days' => 'integer',
            'is_active' => 'boolean',
            'is_recommended' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function prices(): HasMany
    {
        return $this->hasMany(SubscriptionPlanPrice::class);
    }

    /** @return array<string, mixed> */
    public function toBillingArray(): array
    {
        return [
            'id' => $this->id,
            'slug' => $this->slug,
            'name' => $this->name,
            'description' => $this->description ?? '',
            'seat_limit' => (int) $this->seat_limit,
            'price_monthly_cents' => (int) $this->price_monthly_cents,
            'price_yearly_cents' => (int) $this->price_yearly_cents,
            'trial_period_days' => (int) $this->trial_period_days,
            'stripe_product_id' => $this->stripe_product_id,
            'stripe_price_monthly' => $this->stripe_price_monthly,
            'stripe_price_yearly' => $this->stripe_price_yearly,
            'is_active' => (bool) $this->is_active,
            'recommended' => (bool) $this->is_recommended,
            'sort' => (int) $this->sort_order,
        ];
    }
}
