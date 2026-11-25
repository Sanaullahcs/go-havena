<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CommunityMembership extends Model
{
    protected $fillable = [
        'user_id',
        'community_id',
        'role',
        'status',
        'rejection_reason',
        'rejected_by',
        'status_before_deactivation',
        'deactivation_source',
        'invite_code_used',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function community(): BelongsTo
    {
        return $this->belongsTo(Community::class);
    }
}
