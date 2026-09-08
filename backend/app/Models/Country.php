<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Country extends Model
{
    public const BILLING_REQUIRED = 'required';

    public const BILLING_EXEMPT = 'exempt';

    protected $fillable = [
        'code',
        'name',
        'billing_policy',
        'sort_order',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
        ];
    }

    public function states(): HasMany
    {
        return $this->hasMany(State::class)->orderBy('sort_order')->orderBy('name');
    }

    public function isBillingExempt(): bool
    {
        return $this->billing_policy === self::BILLING_EXEMPT;
    }
}
