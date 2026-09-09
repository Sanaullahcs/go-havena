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

        if ($this->isRegionBillingExempt($community->regionRecord)) {
            return true;
        }

        return $this->textLooksLikeExemptCountry(implode(' ', array_filter([
            $community->region,
            $community->regionRecord?->title,
            $community->regionRecord?->state,
            $community->regionRecord?->area,
        ])));
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

        return $this->textLooksLikeExemptCountry(implode(' ', array_filter([
            $region->title,
            $region->state,
            $region->area,
        ])));
    }

    /** Fallback when state_id is missing (legacy rows). Only Pakistan is exempt. */
    private function textLooksLikeExemptCountry(string $text): bool
    {
        $haystack = mb_strtolower(trim($text));
        if ($haystack === '') {
            return false;
        }

        if (! in_array('PK', $this->exemptCountryCodes(), true)) {
            return false;
        }

        return str_contains($haystack, 'pakistan')
            || str_starts_with(trim($text), 'Pakistan -');
    }

    /** @return list<string> */
    public function exemptCountryCodes(): array
    {
        return CountriesData::exemptCodes();
    }
}
