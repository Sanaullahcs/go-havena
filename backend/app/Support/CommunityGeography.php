<?php

namespace App\Support;

use App\Models\Region;
use App\Services\LocationCatalog;
use App\Services\OsmGeocodingService;
use Illuminate\Validation\ValidationException;

class CommunityGeography
{
    /**
     * Resolve the city region for a community using its address (authoritative) and picker hints.
     */
    public function resolveForCommunity(
        Region $region,
        ?string $city,
        ?string $address,
        mixed $latitude,
        mixed $longitude,
        LocationCatalog $catalog,
        OsmGeocodingService $geocoder,
    ): Region {
        $cityHint = trim((string) ($city ?? ''));
        if ($cityHint === '') {
            $inferred = RegionHierarchy::inferredCityFromRegion($region);
            if ($inferred !== null) {
                $cityHint = $this->normalizeCityHint($inferred, $address);
            }
        }

        $place = $this->resolvePlace($address, $latitude, $longitude, $cityHint, $geocoder);

        if ($place && filled($place['country_code'] ?? null) && filled($place['state_name'] ?? null)) {
            // Country/state from geocoder; city from the picker or catalog (not OSM sub-localities).
            $resolvedCity = $cityHint !== ''
                ? $cityHint
                : trim((string) ($place['city'] ?? ''));
            if ($resolvedCity !== '') {
                $state = $catalog->findActiveState((string) $place['country_code'], (string) $place['state_name']);
                if ($state) {
                    return $catalog->ensureCityRegion($state, $resolvedCity);
                }
            }
        }

        if (! RegionHierarchy::isRegionStateLinkConsistent($region)) {
            $state = $catalog->findActiveStateByLabel(trim((string) $region->state));
            if ($state && $cityHint !== '') {
                return $catalog->ensureCityRegion($state, $cityHint);
            }

            throw ValidationException::withMessages([
                'region_id' => ['This region’s state does not match its country. Pick the city again from Country → State → City, or confirm the address.'],
            ]);
        }

        return RegionHierarchy::assignRegionForCommunity($region, $cityHint ?: null, $catalog);
    }

    /**
     * @return array{country_code?: string, country_name?: string, state_name?: string, city?: string}|null
     */
    public function resolvePlace(
        ?string $address,
        mixed $latitude,
        mixed $longitude,
        ?string $cityHint,
        OsmGeocodingService $geocoder,
    ): ?array {
        $lat = is_numeric($latitude) ? (float) $latitude : null;
        $lng = is_numeric($longitude) ? (float) $longitude : null;

        if ($lat !== null && $lng !== null) {
            $fromCoords = $geocoder->placeFromCoordinates($lat, $lng);
            if ($fromCoords) {
                return $this->mergeCityHint($fromCoords, $cityHint);
            }
        }

        $address = trim((string) ($address ?? ''));
        if ($address !== '') {
            $fromAddress = $geocoder->placeFromAddress($address);
            if ($fromAddress) {
                return $this->mergeCityHint($fromAddress, $cityHint);
            }

            $heuristic = $this->hintsFromAddressText($address, $cityHint);
            if ($heuristic) {
                return $heuristic;
            }
        }

        return null;
    }

    /** @param  array<string, string|null>  $place */
    private function mergeCityHint(array $place, ?string $cityHint): array
    {
        $cityHint = trim((string) ($cityHint ?? ''));
        if ($cityHint !== '' && empty($place['city'])) {
            $place['city'] = $cityHint;
        }

        return $place;
    }

    /**
     * @return array{country_code?: string, state_name?: string, city?: string}|null
     */
    private function hintsFromAddressText(string $address, ?string $cityHint): ?array
    {
        $address = trim($address);
        if ($address === '') {
            return null;
        }

        $countryCode = null;
        if (preg_match('/\bPakistan\b/i', $address) || preg_match('/\bPak\b/i', $address)) {
            $countryCode = 'PK';
        } elseif (preg_match('/\bUnited States\b/i', $address) || preg_match('/\bUSA\b/i', $address) || preg_match('/, [A-Z]{2}\b/', $address)) {
            $countryCode = 'US';
        } elseif (preg_match('/\bUnited Kingdom\b/i', $address) || preg_match('/\bUK\b/i', $address)) {
            $countryCode = 'GB';
        }

        $stateName = null;
        if (preg_match('/\bPunjab\b/i', $address)) {
            $stateName = 'Punjab';
        } elseif (preg_match('/\bSindh\b/i', $address)) {
            $stateName = 'Sindh';
        } elseif (preg_match('/\bCalifornia\b/i', $address)) {
            $stateName = 'California';
        }

        $city = trim((string) ($cityHint ?? ''));

        if ($countryCode || $stateName || $city !== '') {
            return array_filter([
                'country_code' => $countryCode,
                'state_name' => $stateName,
                'city' => $city !== '' ? $city : null,
            ], fn ($v) => filled($v));
        }

        return null;
    }

    private function normalizeCityHint(string $cityHint, ?string $address): string
    {
        $address = trim((string) ($address ?? ''));
        $cityHint = trim($cityHint);

        if ($cityHint === '') {
            return '';
        }

        if ($address !== '' && preg_match('/\b('.preg_quote($cityHint, '/').')\b/i', $address) !== 1) {
            foreach (['Lahore', 'Okara', 'Karachi', 'Islamabad', 'Rawalpindi'] as $major) {
                if (preg_match('/\b'.$major.'\b/i', $address)) {
                    return $major;
                }
            }
        }

        if (preg_match('/\b(Lahore)\b/i', $cityHint) && ! preg_match('/\bCant\b/i', $cityHint)) {
            return 'Lahore';
        }

        if (preg_match('/^Lahore\b/i', $cityHint)) {
            return 'Lahore';
        }

        return $cityHint;
    }
}