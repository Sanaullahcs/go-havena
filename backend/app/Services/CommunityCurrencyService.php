<?php

namespace App\Services;

use App\Models\Community;
use App\Models\Region;
use App\Models\User;
use App\Support\Currency;

/**
 * Resolves the currency a community's money should be displayed in.
 *
 * Order of preference: the explicit `communities.currency` override, then the
 * currency of the region's country, then USD. Results are memoised per request
 * because the resident dashboard asks for the same community many times.
 */
class CommunityCurrencyService
{
    /** @var array<int, string> */
    private array $memo = [];

    public function __construct(private readonly RegionBillingPolicy $regionBilling) {}

    public function forCommunity(?Community $community): string
    {
        if (! $community) {
            return Currency::DEFAULT;
        }

        $id = (int) $community->id;
        if (isset($this->memo[$id])) {
            return $this->memo[$id];
        }

        if (Currency::isSupported($community->currency)) {
            return $this->memo[$id] = Currency::normalize($community->currency);
        }

        $community->loadMissing('regionRecord.stateRecord.country');

        return $this->memo[$id] = Currency::forCountry(
            $this->regionBilling->countryCodeForRegion($community->regionRecord),
        );
    }

    public function forCommunityId(?int $communityId): string
    {
        if (! $communityId) {
            return Currency::DEFAULT;
        }

        if (isset($this->memo[$communityId])) {
            return $this->memo[$communityId];
        }

        $community = Community::query()
            ->with('regionRecord.stateRecord.country')
            ->find($communityId);

        return $this->forCommunity($community);
    }

    /** Currency of the community the user is currently acting in. */
    public function forUser(?User $user): string
    {
        if (! $user) {
            return Currency::DEFAULT;
        }

        return $this->forCommunityId(
            app(CommunityFeatureService::class)->communityIdForUser($user),
        );
    }

    public function forRegion(?Region $region): string
    {
        return Currency::forCountry($this->regionBilling->countryCodeForRegion($region));
    }

    /** @return array{code: string, symbol: string, decimals: int} */
    public function describeForCommunity(?Community $community): array
    {
        return Currency::describe($this->forCommunity($community));
    }

    /** @return array{code: string, symbol: string, decimals: int} */
    public function describeForCommunityId(?int $communityId): array
    {
        return Currency::describe($this->forCommunityId($communityId));
    }
}
