<?php

namespace App\Services\Payments;

use App\Models\CommunityPaymentProfile;
use App\Services\PlaidEligibilityService;
use App\Services\RegionBillingPolicy;

/**
 * Picks the payment rail for a community: KuickPay for Pakistan, Plaid ACH for
 * the US. A community never sees both.
 */
class PaymentRouting
{
    public const KUICKPAY = 'kuickpay';

    public const PLAID = 'plaid';

    /** @var array<int, ?string> */
    private array $countryCache = [];

    /** @var array<int, CommunityPaymentProfile> */
    private array $profileCache = [];

    public function __construct(
        private readonly RegionBillingPolicy $regions,
        private readonly PlaidEligibilityService $plaid,
    ) {
    }

    public function provider(?int $communityId): ?string
    {
        if (! $communityId) {
            return null;
        }

        if ($this->isKuickpayCountry($communityId)) {
            return $this->kuickpayOperational() ? self::KUICKPAY : null;
        }

        return $this->plaid->isCommunityEligible($communityId) ? self::PLAID : null;
    }

    public function kuickpayOperational(): bool
    {
        if (! config('kuickpay.enabled', true)) {
            return false;
        }

        $live = in_array(config('kuickpay.mode'), ['uat', 'live'], true);

        return $live || ! app()->environment('production') || (bool) config('kuickpay.allow_sandbox_in_production', false);
    }

    public function isKuickpayCountry(int $communityId): bool
    {
        $code = $this->countryCode($communityId);

        return $code !== null && in_array($code, (array) config('kuickpay.country_codes', ['PK']), true);
    }

    public function kuickpayEnabled(?int $communityId): bool
    {
        if (! $communityId || $this->provider($communityId) !== self::KUICKPAY) {
            return false;
        }

        return $this->profile($communityId)->payments_enabled;
    }

    public function utilitiesEnabled(?int $communityId): bool
    {
        if (! $this->kuickpayEnabled($communityId)) {
            return false;
        }

        return $this->profile((int) $communityId)->utilities_enabled;
    }

    public function profile(int $communityId): CommunityPaymentProfile
    {
        return $this->profileCache[$communityId] ??= CommunityPaymentProfile::forCommunity($communityId);
    }

    public function forgetProfile(int $communityId): void
    {
        unset($this->profileCache[$communityId]);
    }

    private function countryCode(int $communityId): ?string
    {
        if (! array_key_exists($communityId, $this->countryCache)) {
            $code = $this->regions->countryCodeForCommunity($communityId);
            $this->countryCache[$communityId] = $code ? strtoupper($code) : null;
        }

        return $this->countryCache[$communityId];
    }
}
