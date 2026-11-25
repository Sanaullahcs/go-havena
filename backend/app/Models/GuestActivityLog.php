<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GuestActivityLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'guest_invitation_id',
        'guest_user_id',
        'community_id',
        'action',
        'description',
        'meta',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'meta'       => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function invitation(): BelongsTo
    {
        return $this->belongsTo(GuestInvitation::class, 'guest_invitation_id');
    }

    public function guestUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'guest_user_id');
    }
}
