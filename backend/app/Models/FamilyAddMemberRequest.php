<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FamilyAddMemberRequest extends Model
{
    public const STATUS_PENDING_ADMIN = 'pending_admin';

    public const STATUS_AWAITING_HEAD = 'awaiting_head';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_REJECTED = 'rejected';

    public const STATUS_CANCELLED = 'cancelled';

    protected $fillable = [
        'family_id',
        'requested_by_user_id',
        'candidate_user_id',
        'family_join_request_id',
        'first_name',
        'last_name',
        'email',
        'phone',
        'age',
        'unit_number',
        'status',
        'rejection_reason',
        'reviewed_by_user_id',
        'reviewed_at',
        'admin_reviewed_by_user_id',
        'admin_reviewed_at',
        'admin_rejection_reason',
    ];

    protected function casts(): array
    {
        return [
            'age'               => 'integer',
            'reviewed_at'       => 'datetime',
            'admin_reviewed_at' => 'datetime',
        ];
    }

    public function family(): BelongsTo
    {
        return $this->belongsTo(Family::class);
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by_user_id');
    }

    public function candidate(): BelongsTo
    {
        return $this->belongsTo(User::class, 'candidate_user_id');
    }

    public function joinRequest(): BelongsTo
    {
        return $this->belongsTo(FamilyJoinRequest::class, 'family_join_request_id');
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by_user_id');
    }

    public function adminReviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'admin_reviewed_by_user_id');
    }

    public function isAwaitingCommunityAdmin(): bool
    {
        return in_array($this->status, [self::STATUS_PENDING_ADMIN, 'pending'], true);
    }
}
