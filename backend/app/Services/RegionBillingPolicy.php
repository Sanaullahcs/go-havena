<?php

namespace App\Services;

use App\Models\Community;
use App\Models\Region;
use App\Support\CountriesData;

class RegionBillingPolicy
{
    public function requiresBilling(?int $communityId): bool
    {
        return ! $this->isBillingExempt($communityId);
    }

    public function isBillingExempt(?int $communityId): bool
    {
        if (! $communityId) {
            return false;
        }

        $community = Community::query()
            ->with('regionRecord.stateRecord.country')
            ->find($communityId);

        if (! $community) {
            return false;
        }

        return $this->isRegionBillingExempt($community->regionRecord);
    }

    public function isRegionBillingExempt(?Region $region): bool
    {
        if (! $region) {
            return false;
        }

        $region->loadMissing('stateRecord.country');

        $country = $region->stateRecord?->country;
        if ($country) {
            return $country->isBillingExempt();
        }

        return $this->legacyTitleIsPakistan($region->title);
    }

    /** Fallback when state_id is not set yet (legacy rows). */
    private function legacyTitleIsPakistan(string $title): bool
    {
        return str_starts_with(trim($title), 'Pakistan -');
    }

    /** @return list<string> */
    public function exemptCountryCodes(): array
    {
        return CountriesData::exemptCodes();
    }
}
