<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CommunityPlaidConnection extends Model
{
    protected $fillable = [
        'community_id',
        'connected_by_user_id',
        'plaid_item_id',
        'plaid_access_token',
        'institution_id',
        'institution_name',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'plaid_access_token' => 'encrypted',
        ];
    }

    public function community(): BelongsTo
    {
        return $this->belongsTo(Community::class);
    }

    public function connectedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'connected_by_user_id');
    }

    public function isConnected(): bool
    {
        return ($this->status ?? '') === 'connected';
    }

    /**
     * @return array{connected: bool, item_id: string, institution_name: string|null, institution_id: string|null}
     */
    public function toPublicPayload(): array
    {
        return [
            'connected' => $this->isConnected(),
            'item_id' => $this->plaid_item_id,
            'institution_name' => $this->institution_name,
            'institution_id' => $this->institution_id,
        ];
    }
}
