<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Community extends Model
{
    use SoftDeletes;
    protected $fillable = [
        'name',
        'region',
        'region_id',
        'description',
        'address',
        'latitude',
        'longitude',
        'timezone',
        'currency',
        'settings',
        'estimated_residents',
        'status',
        'review_status',
        'rejection_reason',
        'reviewed_at',
        'resident_features_configured_at',
        'requested_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'settings'             => 'array',
            'estimated_residents'  => 'integer',
            'reviewed_at'          => 'datetime',
            'resident_features_configured_at' => 'datetime',
            'latitude'             => 'float',
            'longitude'            => 'float',
        ];
    }

    protected static function booted(): void
    {
        // Every creation path (API, admin, seeders) should land with a currency
        // set, derived from the region's country unless one was passed in.
        static::creating(function (Community $community) {
            $name = \App\Support\CommunityNameUniqueness::trim((string) $community->name);
            if ($name !== '') {
                \App\Support\CommunityNameUniqueness::assertUnique($name, field: 'name');
                $community->name = $name;
            }

            if (\App\Support\Currency::isSupported($community->currency)) {
                $community->currency = \App\Support\Currency::normalize($community->currency);

                return;
            }

            $region = $community->region_id
                ? Region::query()->with('stateRecord.country')->find($community->region_id)
                : null;

            $community->currency = app(\App\Services\CommunityCurrencyService::class)->forRegion($region);
        });
    }

    public function featureFlags(): HasMany
    {
        return $this->hasMany(CommunityFeatureFlag::class);
    }

    public function memberships(): HasMany
    {
        return $this->hasMany(CommunityMembership::class);
    }

    public function subscription(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(CommunitySubscription::class);
    }

    public function plaidConnection(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(CommunityPlaidConnection::class);
    }

    public function inviteCodes(): HasMany
    {
        return $this->hasMany(InviteCode::class);
    }

    public function regionRecord(): BelongsTo
    {
        return $this->belongsTo(Region::class, 'region_id');
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by_user_id');
    }

    public function isActiveForResidents(): bool
    {
        return $this->status === 'active'
            && ($this->review_status === null || $this->review_status === 'approved');
    }

    /** Communities with no active or pending community-admin assignment. */
    public function scopeWithoutAssignedAdmin($query)
    {
        return $query->whereDoesntHave('memberships', function ($membership) {
            $membership->where('role', 'admin')
                ->whereIn('status', ['approved', 'pending'])
                ->whereHas('user', function ($user) {
                    $user->where('role', 'community_admin')
                        ->where('status', '!=', 'deleted')
                        ->whereIn('community_admin_status', ['approved', 'pending']);
                });
        });
    }
}
