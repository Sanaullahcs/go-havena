<?php

namespace App\Services;

use App\Models\Region;
use App\Models\State;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class LocationCatalog
{
    /** Countries that get a statewide region created during sync (others are created on demand). */
    public const PRIORITY_COUNTRY_CODES = ['US', 'PK', 'GB', 'CA', 'AE', 'SA', 'IN'];

    public function ensureStateRegion(State $state): Region
    {
        $state->loadMissing('country');
        $title = $this->stateRegionTitle($state);

        return Region::query()->updateOrCreate(
            [
                'state_id' => $state->id,
                'title' => $title,
            ],
            [
                'area' => $state->name,
                'state' => $state->name,
                'users_label' => 'Open',
                'sort_order' => 400 + (int) $state->sort_order,
                'status' => 'active',
            ],
        );
    }

    public function ensureCityRegion(State $state, string $cityName): Region
    {
        $cityName = trim($cityName);
        if ($cityName === '') {
            return $this->ensureStateRegion($state);
        }

        $state->loadMissing('country');
        $title = $state->name.' - '.$cityName;

        return Region::query()->updateOrCreate(
            [
                'state_id' => $state->id,
                'title' => $title,
            ],
            [
                'area' => $cityName,
                'state' => $state->name,
                'users_label' => 'Open',
                'sort_order' => 280,
                'status' => 'active',
            ],
        );
    }

    public function resolve(?int $countryId, int $stateId, ?string $cityName = null): Region
    {
        $state = State::query()
            ->where('status', 'active')
            ->with('country')
            ->findOrFail($stateId);

        if ($countryId && (int) $state->country_id !== $countryId) {
            throw ValidationException::withMessages([
                'state_id' => ['State does not belong to the selected country.'],
            ]);
        }

        if (filled($cityName)) {
            return $this->ensureCityRegion($state, $cityName);
        }

        return $this->ensureStateRegion($state);
    }

    public function syncPriorityStateRegions(): int
    {
        $created = 0;
        $states = State::query()
            ->where('status', 'active')
            ->whereHas('country', fn ($country) => $country
                ->where('status', 'active')
                ->whereIn('code', self::PRIORITY_COUNTRY_CODES))
            ->with('country')
            ->orderBy('country_id')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        foreach ($states as $state) {
            $this->ensureStateRegion($state);
            $created++;
        }

        return $created;
    }

    private function stateRegionTitle(State $state): string
    {
        $country = $state->country;
        if ($country?->code === 'US') {
            return $state->name;
        }

        $countryName = $country?->name ?: 'Worldwide';

        return Str::limit($countryName.' - '.$state->name, 150, '');
    }
}
