<?php

namespace App\Support;

use App\Models\Community;
use App\Services\OsmGeocodingService;

class CommunityLocation
{
    /** @return array<string, list<string>> */
    public static function coordinateRules(): array
    {
        return [
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
        ];
    }

    public static function hasPin(mixed $latitude, mixed $longitude): bool
    {
        return $latitude !== null && $latitude !== ''
            && $longitude !== null && $longitude !== '';
    }

    /**
     * Prefer an explicit map pin. Otherwise geocode the typed address once.
     *
     * @return array{latitude: float|null, longitude: float|null}
     */
    public static function resolve(?string $address, mixed $latitude, mixed $longitude, OsmGeocodingService $geocoder): array
    {
        if (self::hasPin($latitude, $longitude)) {
            return [
                'latitude' => round((float) $latitude, 7),
                'longitude' => round((float) $longitude, 7),
            ];
        }

        if (is_string($address) && trim($address) !== '') {
            $coords = $geocoder->geocode($address);
            if ($coords) {
                return $coords;
            }
        }

        return ['latitude' => null, 'longitude' => null];
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public static function applyOnCreate(array $validated, OsmGeocodingService $geocoder, string $addressKey = 'address'): array
    {
        $coords = self::resolve(
            isset($validated[$addressKey]) ? (string) $validated[$addressKey] : null,
            $validated['latitude'] ?? null,
            $validated['longitude'] ?? null,
            $geocoder,
        );

        $validated['latitude'] = $coords['latitude'];
        $validated['longitude'] = $coords['longitude'];

        return $validated;
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public static function applyOnUpdate(Community $community, array $validated, OsmGeocodingService $geocoder): array
    {
        $hasPin = array_key_exists('latitude', $validated)
            && array_key_exists('longitude', $validated)
            && self::hasPin($validated['latitude'], $validated['longitude']);

        if ($hasPin) {
            $validated['latitude'] = round((float) $validated['latitude'], 7);
            $validated['longitude'] = round((float) $validated['longitude'], 7);

            return $validated;
        }

        $addressChanged = array_key_exists('address', $validated)
            && trim((string) $validated['address']) !== trim((string) $community->address);

        if ($addressChanged && filled($validated['address'] ?? null)) {
            $coords = $geocoder->geocode((string) $validated['address']);
            if ($coords) {
                $validated['latitude'] = $coords['latitude'];
                $validated['longitude'] = $coords['longitude'];

                return $validated;
            }
        }

        unset($validated['latitude'], $validated['longitude']);

        return $validated;
    }
}
