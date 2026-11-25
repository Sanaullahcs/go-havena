<?php

namespace App\Support;

use App\Services\OsmGeocodingService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class NearbyDiscovery
{
    public const ALLOWED_MILES = [2, 3, 5, 10];

    public static function normalizeRadius(mixed $miles): ?int
    {
        $value = (int) $miles;

        return in_array($value, self::ALLOWED_MILES, true) ? $value : null;
    }

    public static function milesBetween(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $earthMiles = 3958.7613;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return 2 * $earthMiles * asin(min(1, sqrt($a)));
    }

    public static function metersBetween(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        return self::milesBetween($lat1, $lng1, $lat2, $lng2) * 1609.344;
    }

    /** @return array{0: float, 1: float}|null */
    public static function communityCoordinates(int $communityId): ?array
    {
        if (! Schema::hasColumn('communities', 'latitude')) {
            return null;
        }

        $row = DB::table('communities')->where('id', $communityId)->first(['latitude', 'longitude']);
        if (! $row || $row->latitude === null || $row->longitude === null) {
            return null;
        }

        return [(float) $row->latitude, (float) $row->longitude];
    }

    /** Resolve stored pin or geocode the community address once and persist it. */
    public static function resolveCommunityCoordinates(int $communityId, ?OsmGeocodingService $geocoder = null): ?array
    {
        $existing = self::communityCoordinates($communityId);
        if ($existing) {
            return $existing;
        }

        if (! $geocoder) {
            return null;
        }

        $row = DB::table('communities')->where('id', $communityId)->first(['address', 'latitude', 'longitude']);
        if (! $row) {
            return null;
        }

        $coords = CommunityLocation::resolve(
            isset($row->address) ? (string) $row->address : null,
            $row->latitude,
            $row->longitude,
            $geocoder,
        );

        if (! CommunityLocation::hasPin($coords['latitude'], $coords['longitude'])) {
            return null;
        }

        DB::table('communities')->where('id', $communityId)->update([
            'latitude' => $coords['latitude'],
            'longitude' => $coords['longitude'],
            'updated_at' => now(),
        ]);

        return [(float) $coords['latitude'], (float) $coords['longitude']];
    }

    /**
     * Community ids within $radiusMiles of the origin, always including the origin.
     *
     * @return list<int>
     */
    public static function communityIdsWithin(int $originId, int $radiusMiles): array
    {
        $origin = self::communityCoordinates($originId);
        if (! $origin) {
            return [$originId];
        }

        [$lat, $lng] = $origin;
        $query = DB::table('communities')
            ->where('status', 'active')
            ->whereNotNull('latitude')
            ->whereNotNull('longitude');

        if (Schema::hasColumn('communities', 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        $ids = [];
        foreach ($query->get(['id', 'latitude', 'longitude']) as $row) {
            $miles = self::milesBetween($lat, $lng, (float) $row->latitude, (float) $row->longitude);
            if ($miles <= $radiusMiles + 0.08) {
                $ids[] = (int) $row->id;
            }
        }

        if (! in_array($originId, $ids, true)) {
            $ids[] = $originId;
        }

        return $ids;
    }

    public static function distanceFromOrigin(int $originId, int $communityId): ?float
    {
        if ($originId === $communityId) {
            return 0.0;
        }

        $origin = self::communityCoordinates($originId);
        $other = self::communityCoordinates($communityId);
        if (! $origin || ! $other) {
            return null;
        }

        return round(self::milesBetween($origin[0], $origin[1], $other[0], $other[1]), 1);
    }
}
