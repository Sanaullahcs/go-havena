<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CommunityPaymentProfile extends Model
{
    protected $fillable = [
        'community_id',
        'provider',
        'onboarding_status',
        'payments_enabled',
        'utilities_enabled',
        'residents_can_link_utilities',
        'provider_institution_id',
        'settlement_account_title',
        'settlement_bank',
        'settlement_account_last4',
    ];

    protected $casts = [
        'payments_enabled' => 'boolean',
        'utilities_enabled' => 'boolean',
        'residents_can_link_utilities' => 'boolean',
    ];

    public static function forCommunity(int $communityId): self
    {
        return self::query()->firstOrCreate(
            ['community_id' => $communityId],
            [
                'provider' => PaymentAttempt::PROVIDER_KUICKPAY,
                'onboarding_status' => config('kuickpay.mode') === 'live' ? 'pending' : 'sandbox',
                'payments_enabled' => true,
                'utilities_enabled' => true,
                'residents_can_link_utilities' => true,
            ],
        );
    }

    public function toPayload(): array
    {
        return [
            'provider' => $this->provider,
            'onboarding_status' => $this->onboarding_status,
            'payments_enabled' => (bool) $this->payments_enabled,
            'utilities_enabled' => (bool) $this->utilities_enabled,
            'residents_can_link_utilities' => (bool) $this->residents_can_link_utilities,
            'provider_institution_id' => $this->provider_institution_id,
            'settlement_account_title' => $this->settlement_account_title,
            'settlement_bank' => $this->settlement_bank,
            'settlement_account_last4' => $this->settlement_account_last4,
        ];
    }
}
