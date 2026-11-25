<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UtilityBiller extends Model
{
    public const SERVICE_TYPES = ['electricity', 'gas', 'water', 'internet', 'telecom', 'other'];

    protected $fillable = [
        'mnemonic',
        'biller_id',
        'name',
        'short_name',
        'service_type',
        'region',
        'reference_label',
        'reference_hint',
        'reference_min_length',
        'reference_max_length',
        'brand_color',
        'active',
        'sort_order',
        'synced_at',
    ];

    protected $casts = [
        'active' => 'boolean',
        'reference_min_length' => 'integer',
        'reference_max_length' => 'integer',
        'sort_order' => 'integer',
        'synced_at' => 'datetime',
    ];

    public function toPublicPayload(): array
    {
        return [
            'id' => (int) $this->id,
            'mnemonic' => $this->mnemonic,
            'name' => $this->name,
            'short_name' => $this->short_name,
            'service_type' => $this->service_type,
            'region' => $this->region,
            'reference_label' => $this->reference_label,
            'reference_hint' => $this->reference_hint,
            'reference_min_length' => $this->reference_min_length,
            'reference_max_length' => $this->reference_max_length,
            'brand_color' => $this->brand_color,
        ];
    }
}
