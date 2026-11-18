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

    public function findStateRegion(State $state): ?Region
    {
        $state->loadMissing('country');

        return Region::query()
            ->where('regions.state_id', $state->id)
            ->where('regions.status', 'active')
            ->whereRaw('LOWER(TRIM(regions.area)) = ?', [mb_strtolower($state->name)])
            ->first();
    }

    public function ensureStateRegion(State $state): Region
    {
        $state->loadMissing('country');
        $existing = $this->findStateRegion($state);
        if ($existing) {
            $canonicalTitle = $this->stateRegionTitle($state);
            if ($existing->title !== $canonicalTitle) {
                $existing->update(['title' => $canonicalTitle]);
            }

            return $existing->fresh();
        }

        $title = $this->stateRegionTitle($state);

        return Region::query()->create([
            'state_id' => $state->id,
            'title' => $title,
            'area' => $state->name,
            'state' => $state->name,
            'users_label' => 'Open',
            'sort_order' => 400 + (int) $state->sort_order,
            'status' => 'active',
        ]);
    }

    /** Look up an active city-level region without creating one. */
    public function findCityRegion(State $state, string $cityName): ?Region
    {
        $cityName = trim($cityName);
        if ($cityName === '') {
            return null;
        }

        return Region::query()
            ->where('regions.state_id', $state->id)
            ->where('regions.status', 'active')
            ->whereRaw('LOWER(TRIM(regions.area)) = ?', [mb_strtolower($cityName)])
            ->cityLevel()
            ->orderBy('sort_order')
            ->orderBy('id')
            ->first();
    }

    public function ensureCityRegion(State $state, string $cityName): Region
    {
        $cityName = trim($cityName);
        if ($cityName === '') {
            throw ValidationException::withMessages([
                'city' => ['City is required to create a city region.'],
            ]);
        }

        $state->loadMissing('country');
        $canonicalTitle = $this->cityRegionTitle($state, $cityName);

        $existing = $this->findCityRegion($state, $cityName);

        if ($existing) {
            if ($existing->title !== $canonicalTitle) {
                $existing->update(['title' => $canonicalTitle]);
            }

            return $existing->fresh();
        }

        return Region::query()->create([
            'state_id' => $state->id,
            'title' => $canonicalTitle,
            'area' => $cityName,
            'state' => $state->name,
            'users_label' => 'Open',
            'sort_order' => 280,
            'status' => 'active',
        ]);
    }

    public function resolve(?int $countryId, int $stateId, ?string $cityName = null, bool $requireCity = false): Region
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

        $cityName = trim((string) ($cityName ?? ''));

        if ($requireCity || $cityName !== '') {
            if ($cityName === '') {
                throw ValidationException::withMessages([
                    'city' => ['City is required.'],
                ]);
            }

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

    public function cityRegionTitle(State $state, string $cityName): string
    {
        $state->loadMissing('country');
        $countryName = $state->country?->name ?: 'Worldwide';
        $stateName = $state->name;

        return Str::limit("{$countryName} - {$stateName} - {$cityName}", 150, '');
    }

    public function findActiveState(string $countryCode, string $stateName): ?State
    {
        $countryCode = strtoupper(trim($countryCode));
        $stateName = trim($stateName);
        if ($countryCode === '' || $stateName === '') {
            return null;
        }

        return State::query()
            ->where('status', 'active')
            ->whereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower($stateName)])
            ->whereHas('country', fn ($country) => $country
                ->where('status', 'active')
                ->where('code', $countryCode))
            ->with('country')
            ->first();
    }

    public function findActiveStateByLabel(string $stateLabel): ?State
    {
        $stateLabel = trim($stateLabel);
        if ($stateLabel === '') {
            return null;
        }

        $matches = State::query()
            ->where('status', 'active')
            ->whereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower($stateLabel)])
            ->with('country')
            ->get();

        if ($matches->count() === 1) {
            return $matches->first();
        }

        $priorityCodes = self::PRIORITY_COUNTRY_CODES;
        $preferred = $matches->first(fn (State $state) => in_array($state->country?->code, $priorityCodes, true));

        return $preferred ?? $matches->sortBy(fn (State $s) => $s->country?->sort_order ?? 999)->first();
    }
}
