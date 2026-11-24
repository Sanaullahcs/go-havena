<?php

namespace App\Support;

use App\Models\Region;
use App\Models\State;
use App\Services\LocationCatalog;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class RegionHierarchy
{
    public static function isStateLevelRegion(Region $region): bool
    {
        $region->loadMissing('stateRecord');
        $stateName = mb_strtolower(trim($region->stateRecord?->name ?? $region->state ?? ''));
        $area = mb_strtolower(trim($region->area ?? ''));

        if ($area === '') {
            return true;
        }

        if ($stateName === '') {
            return false;
        }

        return $area === $stateName;
    }

    public static function isCityLevelRegion(Region $region): bool
    {
        return ! self::isStateLevelRegion($region);
    }

    /**
     * City name implied by a region row (e.g. Dubai emirate where area and state share the name
     * but the title is Country - State - City).
     */
    public static function inferredCityFromRegion(Region $region): ?string
    {
        $area = trim((string) $region->area);
        if ($area === '') {
            return null;
        }

        if (self::isCityLevelRegion($region)) {
            return $area;
        }

        $parts = array_map('trim', explode(' - ', trim($region->title ?? '')));
        if (count($parts) >= 3 && mb_strtolower((string) end($parts)) === mb_strtolower($area)) {
            return $area;
        }

        return null;
    }

    public static function hierarchyLabel(Region $region): string
    {
        $region->loadMissing('stateRecord.country');
        $state = $region->stateRecord;
        $countryName = $state?->country?->name;
        $stateName = $state?->name ?? $region->state;
        $city = trim($region->area ?? '');

        if ($countryName && $stateName && $city && self::isCityLevelRegion($region)) {
            return Str::limit("{$countryName} - {$stateName} - {$city}", 150, '');
        }

        if ($countryName && $stateName && self::isStateLevelRegion($region)) {
            return Str::limit("{$countryName} - {$stateName}", 150, '');
        }

        return trim($region->title ?? '') ?: ($city ?: ($stateName ?? 'Unknown'));
    }

    public static function assertCityLevelForCommunity(Region $region, string $field = 'region_id'): void
    {
        if (self::isCityLevelRegion($region)) {
            return;
        }

        throw ValidationException::withMessages([
            $field => ['Communities must be linked to a city. Select country, state/province, and city — not a state or country alone.'],
        ]);
    }

    /** True when the denormalized `state` label matches the linked states row. */
    public static function isRegionStateLinkConsistent(Region $region): bool
    {
        $region->loadMissing('stateRecord');
        $label = mb_strtolower(trim($region->state ?? ''));
        $actual = mb_strtolower(trim($region->stateRecord?->name ?? ''));

        if ($actual === '') {
            return $label === '';
        }

        if ($label === '') {
            return true;
        }

        return $label === $actual;
    }

    /**
     * Resolve the city-level region used when creating or updating a community.
     */
    public static function assignRegionForCommunity(Region $region, ?string $cityName, LocationCatalog $catalog): Region
    {
        $region->loadMissing('stateRecord');
        if (! $region->state_id) {
            throw ValidationException::withMessages([
                'region_id' => ['Region must belong to a state or province.'],
            ]);
        }

        /** @var State $state */
        $state = $region->stateRecord ?? State::query()->findOrFail($region->state_id);

        $inferred = self::inferredCityFromRegion($region);
        if ($inferred !== null) {
            return $catalog->ensureCityRegion($state, $inferred);
        }

        $cityName = trim((string) $cityName);
        if ($cityName === '') {
            throw ValidationException::withMessages([
                'city' => ['City is required. Communities must be associated with a city.'],
                'region_id' => ['Select a city-level region or provide a city name.'],
            ]);
        }

        return $catalog->ensureCityRegion($state, $cityName);
    }
}