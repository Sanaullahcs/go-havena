<?php

namespace App\Services;

use App\Exceptions\PlaidException;

class PlaidEligibilityService
{
    public function __construct(
        private readonly RegionBillingPolicy $regions,
    ) {
    }

    /** @return list<string> */
    public function supportedCountryCodes(): array
    {
        $codes = config('plaid.supported_country_codes', ['US']);

        return array_values(array_filter(array_map(
            static fn ($code) => strtoupper(trim((string) $code)),
            is_array($codes) ? $codes : ['US'],
        )));
    }

    public function countryCodeForCommunity(?int $communityId): ?string
    {
        $code = $this->regions->countryCodeForCommunity($communityId);

        return $code ? strtoupper($code) : null;
    }

    public function isCountrySupported(?string $countryCode): bool
    {
        $code = strtoupper(trim((string) $countryCode));
        if ($code === '' || $code === 'PK') {
            return false;
        }

        return in_array($code, $this->supportedCountryCodes(), true);
    }

    public function isCommunityEligible(?int $communityId): bool
    {
        if (! $communityId) {
            return false;
        }

        if ($this->regions->isBillingExempt($communityId)) {
            return false;
        }

        $countryCode = $this->countryCodeForCommunity($communityId);
        if ($countryCode === 'PK') {
            return false;
        }

        if ($countryCode === null) {
            return true;
        }

        return $this->isCountrySupported($countryCode);
    }

    public function assertCommunityEligible(?int $communityId): void
    {
        if (! $this->isCommunityEligible($communityId)) {
            throw PlaidException::notAvailable();
        }
    }
}
