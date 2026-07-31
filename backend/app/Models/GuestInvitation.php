<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GuestInvitation extends Model
{
    protected $fillable = [
        'community_id',
        'invited_by_user_id',
        'invitation_type',
        'guest_name',
        'guest_email',
        'guest_phone',
        'invite_code',
        'starts_at',
        'ends_at',
        'permissions',
        'status',
        'guest_user_id',
        'approved_by_user_id',
        'approved_at',
        'rejected_at',
        'rejection_reason',
        'revoked_at',
        'revoked_by_user_id',
        'last_activity_at',
    ];

    protected function casts(): array
    {
        return [
            'starts_at'        => 'datetime',
            'ends_at'          => 'datetime',
            'permissions'      => 'array',
            'approved_at'      => 'datetime',
            'rejected_at'      => 'datetime',
            'revoked_at'       => 'datetime',
            'last_activity_at' => 'datetime',
        ];
    }

    public function community(): BelongsTo
    {
        return $this->belongsTo(Community::class);
    }

    public function invitedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by_user_id');
    }

    public function guestUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'guest_user_id');
    }

    public function activityLogs(): HasMany
    {
        return $this->hasMany(GuestActivityLog::class);
    }

    public function isAccessWindowActive(): bool
    {
        $now = now();

        return $now->gte($this->starts_at) && $now->lte($this->ends_at);
    }
}
