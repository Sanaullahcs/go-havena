<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Region extends Model
{
    use SoftDeletes;

    protected static function booted(): void
    {
        static::saving(function (Region $region) {
            if (! $region->state_id) {
                return;
            }

            $state = $region->relationLoaded('stateRecord')
                ? $region->stateRecord
                : State::query()->find($region->state_id);

            if ($state) {
                $region->state = $state->name;
            }
        });
    }

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

    public function scopeCityLevel(Builder $query): Builder
    {
        return $query
            ->join('states as city_level_states', 'city_level_states.id', '=', 'regions.state_id')
            ->whereNotNull('regions.area')
            ->where('regions.area', '!=', '')
            ->whereRaw('LOWER(TRIM(regions.area)) <> LOWER(TRIM(city_level_states.name))')
            ->select('regions.*');
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
