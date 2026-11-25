<?php

namespace App\Support;

class OsmPlaceCategories
{
    public const KEYS = [
        'restaurants',
        'cafes',
        'pharmacies',
        'banks',
        'gyms',
        'supermarkets',
        'hospitals',
        'burial_places',
        'sports_clubs',
        'gas_stations',
        'parking',
        'clubs',
        'shopping',
    ];

    /** @return list<array{0: string, 1: string}> */
    public static function overpassFilters(string $category): array
    {
        return match ($category) {
            'restaurants' => [
                ['amenity', 'restaurant'],
                ['amenity', 'fast_food'],
                ['amenity', 'food_court'],
            ],
            'cafes' => [
                ['amenity', 'cafe'],
                ['amenity', 'ice_cream'],
                ['amenity', 'coffee_shop'],
            ],
            'pharmacies' => [
                ['amenity', 'pharmacy'],
                ['healthcare', 'pharmacy'],
                ['shop', 'chemist'],
            ],
            'banks' => [
                ['amenity', 'bank'],
            ],
            'gyms' => [
                ['leisure', 'fitness_centre'],
                ['leisure', 'fitness_center'],
                ['leisure', 'sports_centre'],
                ['amenity', 'gym'],
            ],
            'supermarkets' => [
                ['shop', 'supermarket'],
                ['shop', 'convenience'],
                ['shop', 'grocery'],
                ['shop', 'greengrocer'],
            ],
            'hospitals' => [
                ['amenity', 'hospital'],
                ['healthcare', 'hospital'],
            ],
            'burial_places' => [
                ['amenity', 'grave_yard'],
                ['amenity', 'cemetery'],
                ['landuse', 'cemetery'],
            ],
            'sports_clubs' => [
                ['club', 'sport'],
                ['leisure', 'sports_club'],
            ],
            'gas_stations' => [
                ['amenity', 'fuel'],
            ],
            'parking' => [
                ['amenity', 'parking'],
            ],
            'clubs' => [
                ['club', 'sport'],
                ['leisure', 'sports_club'],
                ['leisure', 'sports_centre'],
            ],
            'shopping' => [
                ['shop', 'mall'],
                ['shop', 'department_store'],
                ['shop', 'supermarket'],
                ['shop', 'convenience'],
                ['shop', 'general'],
                ['shop', 'clothes'],
                ['shop', 'shoes'],
                ['shop', 'fashion'],
                ['shop', 'boutique'],
                ['shop', 'jewelry'],
                ['shop', 'jewellery'],
                ['shop', 'electronics'],
                ['shop', 'mobile_phone'],
                ['shop', 'computer'],
                ['shop', 'furniture'],
                ['shop', 'houseware'],
                ['shop', 'hardware'],
                ['shop', 'doityourself'],
                ['shop', 'cosmetics'],
                ['shop', 'beauty'],
                ['shop', 'optician'],
                ['shop', 'books'],
                ['shop', 'stationery'],
                ['shop', 'toys'],
                ['shop', 'sports'],
                ['shop', 'gift'],
                ['shop', 'variety_store'],
                ['shop', 'fabric'],
                ['shop', 'baby_goods'],
                ['shop', 'bag'],
                ['shop', 'watches'],
                ['shop', 'appliance'],
                ['craft', 'tailor'],
            ],
            default => [
                ['amenity', 'restaurant'],
            ],
        };
    }

    /**
     * Tag-key => regex of values, so Overpass can use a few union statements.
     *
     * @return array<string, string>
     */
    public static function overpassRegexByKey(): array
    {
        $grouped = [];
        foreach (self::uniqueOverpassFilters() as [$key, $value]) {
            $grouped[$key][] = $value;
        }

        $out = [];
        foreach ($grouped as $key => $values) {
            $escaped = array_map(static fn ($value) => preg_quote((string) $value, '/'), array_values(array_unique($values)));
            $out[$key] = '^('.implode('|', $escaped).')$';
        }

        return $out;
    }

    /** @return list<array{0: string, 1: string}> */
    public static function uniqueOverpassFilters(): array
    {
        $seen = [];
        $filters = [];

        foreach (self::KEYS as $category) {
            foreach (self::overpassFilters($category) as $filter) {
                $key = $filter[0].'='.$filter[1];
                if (isset($seen[$key])) {
                    continue;
                }
                $seen[$key] = true;
                $filters[] = $filter;
            }
        }

        return $filters;
    }

    /**
     * @param  array<string, mixed>  $tags
     * @return list<string>
     */
    public static function matchingKeys(array $tags): array
    {
        $matched = [];

        foreach (self::KEYS as $category) {
            foreach (self::overpassFilters($category) as [$key, $value]) {
                if (($tags[$key] ?? null) === $value) {
                    $matched[] = $category;
                    break;
                }
            }
        }

        return $matched;
    }

    public static function isValid(string $category): bool
    {
        return in_array($category, self::KEYS, true);
    }
}
