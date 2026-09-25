<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ResidentPlaidConnection extends Model
{
    public const STATUS_CONNECTED = 'connected';

    public const STATUS_DISCONNECTED = 'disconnected';

    public const STATUS_ERROR = 'error';

    public const STATUS_NEEDS_ATTENTION = 'needs_attention';

    protected $fillable = [
        'user_id',
        'community_id',
        'plaid_item_id',
        'plaid_access_token',
        'institution_id',
        'institution_name',
        'account_id',
        'account_name',
        'account_official_name',
        'account_type',
        'account_subtype',
        'account_mask',
        'ach_account',
        'ach_routing',
        'status',
        'error_code',
        'error_message',
        'last_webhook_code',
        'last_webhook_at',
        'disconnected_at',
    ];

    protected function casts(): array
    {
        return [
            'plaid_access_token' => 'encrypted',
            'ach_account' => 'encrypted',
            'ach_routing' => 'encrypted',
            'last_webhook_at' => 'datetime',
            'disconnected_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function community(): BelongsTo
    {
        return $this->belongsTo(Community::class);
    }

    public function isConnected(): bool
    {
        return ($this->status ?? '') === self::STATUS_CONNECTED && $this->hasAccessToken();
    }

    public function needsReconnect(): bool
    {
        return in_array($this->status, [self::STATUS_NEEDS_ATTENTION, self::STATUS_ERROR], true);
    }

    public function hasAccessToken(): bool
    {
        return filled($this->plaid_access_token);
    }

    /**
     * @return array<string, mixed>
     */
    public function toPublicPayload(): array
    {
        return [
            'connected' => $this->isConnected(),
            'status' => $this->status ?: self::STATUS_DISCONNECTED,
            'needs_reconnect' => $this->needsReconnect(),
            'item_id' => $this->plaid_item_id,
            'institution_name' => $this->institution_name,
            'institution_id' => $this->institution_id,
            'account' => [
                'name' => $this->account_name,
                'official_name' => $this->account_official_name,
                'type' => $this->account_type,
                'subtype' => $this->account_subtype,
                'mask' => $this->account_mask,
            ],
            'error_code' => $this->error_code,
            'error_message' => $this->error_message,
            'last_webhook_code' => $this->last_webhook_code,
            'last_webhook_at' => $this->last_webhook_at?->toIso8601String(),
            'connected_at' => $this->updated_at?->toIso8601String(),
            'disconnected_at' => $this->disconnected_at?->toIso8601String(),
        ];
    }
}
