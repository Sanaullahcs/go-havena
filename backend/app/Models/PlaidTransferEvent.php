<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Append-only copy of Plaid `/transfer/event/sync` events. */
class PlaidTransferEvent extends Model
{
    protected $fillable = [
        'event_id',
        'plaid_transfer_id',
        'event_type',
        'transfer_id',
        'transfer_type',
        'refund_id',
        'sweep_id',
        'amount',
        'failure_code',
        'failure_description',
        'occurred_at',
        'matched',
        'outcome',
        'payload',
    ];

    protected function casts(): array
    {
        return [
            'event_id' => 'integer',
            'matched' => 'boolean',
            'payload' => 'array',
            'occurred_at' => 'datetime',
        ];
    }

    public function transfer(): BelongsTo
    {
        return $this->belongsTo(PlaidTransfer::class, 'plaid_transfer_id');
    }

    /**
     * @return array<string, mixed>
     */
    public function toAdminPayload(): array
    {
        return [
            'event_id' => $this->event_id,
            'event_type' => $this->event_type,
            'transfer_type' => $this->transfer_type,
            'transfer_id' => $this->transfer_id,
            'refund_id' => $this->refund_id,
            'amount' => $this->amount,
            'failure_code' => $this->failure_code,
            'failure_description' => $this->failure_description,
            'occurred_at' => $this->occurred_at?->toIso8601String(),
            'matched' => $this->matched,
            'outcome' => $this->outcome,
        ];
    }
}
