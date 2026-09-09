<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Region extends Model
{
    use SoftDeletes;
    protected $fillable = [
        'title',
        'area',
        'state',
        'state_id',
        'users_label',
        'sort_order',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
        ];
    }

    public function stateRecord(): BelongsTo
    {
        return $this->belongsTo(State::class, 'state_id');
    }

    public function profiles(): HasMany
    {
        return $this->hasMany(Profile::class);
    }

    public function communities(): HasMany
    {
        return $this->hasMany(Community::class);
    }

    public function communityTimezone(): string
    {
        $this->loadMissing('stateRecord.country');
        $countryCode = $this->stateRecord?->country?->code;

        if ($countryCode === 'PK') {
            return 'Asia/Karachi';
        }

        return match ($this->stateRecord?->name ?? $this->state) {
            'California', 'Washington', 'Nevada' => 'America/Los_Angeles',
            'Texas', 'Illinois' => 'America/Chicago',
            'Arizona' => 'America/Phoenix',
            'Colorado' => 'America/Denver',
            default => 'America/New_York',
        };
    }
}
