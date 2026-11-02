<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class InviteCode extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'community_id',
        'code',
        'created_by',
        'invited_user_id',
        'max_uses',
        'used_count',
        'expires_at',
        'rejected_at',
    ];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'rejected_at' => 'datetime',
        ];
    }

    public function community(): BelongsTo
    {
        return $this->belongsTo(Community::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function invitedUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_user_id');
    }

    public function isValid(): bool
    {
        if ($this->rejected_at) {
            return false;
        }

        if ($this->expires_at && $this->expires_at->isPast()) {
            return false;
        }

        if ($this->max_uses !== null && $this->used_count >= $this->max_uses) {
            return false;
        }

        return true;
    }

    public function isRejected(): bool
    {
        return $this->rejected_at !== null;
    }

    /** Unused invite still assigned to this placeholder resident. */
    public function scopePendingForUser($query, int $userId)
    {
        return $query
            ->where('invited_user_id', $userId)
            ->whereNull('rejected_at')
            ->where(function ($q) {
                $q->whereNull('max_uses')
                    ->orWhereColumn('used_count', '<', 'max_uses');
            })
            ->where(function ($q) {
                $q->whereNull('expires_at')
                    ->orWhere('expires_at', '>', now());
            });
    }
}
