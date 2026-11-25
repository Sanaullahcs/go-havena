<?php

namespace App\Support;

use Database\Seeders\TgiCommunitySeeder;
use Illuminate\Support\Facades\DB;

/**
 * Curated nearby places for demo communities when Overpass is unavailable.
 */
class DemoNearbyPlaces
{
    /** @return list<array<string, mixed>> */
    public static function forCommunity(?int $communityId, float $originLat, float $originLng, ?int $radiusMeters = null): array
    {
        if (! self::isDemoCommunity($communityId)) {
            return [];
        }

        $radius = $radiusMeters ?? (int) config('osm.radius_meters', 3000);
        $places = [];
        foreach (self::catalog() as $row) {
            $meters = NearbyDiscovery::metersBetween($originLat, $originLng, $row['latitude'], $row['longitude']);
            if ($meters > $radius) {
                continue;
            }

            $places[] = [
                'id' => 'demo-'.$row['slug'],
                'name' => $row['name'],
                'category' => $row['category'],
                'matched_categories' => $row['matched_categories'],
                'address' => $row['address'],
                'phone' => $row['phone'],
                'hours' => $row['hours'],
                'website' => $row['website'],
                'cuisine' => $row['cuisine'] ?? null,
                'brand' => null,
                'operator' => null,
                'email' => null,
                'wheelchair' => null,
                'outdoor_seating' => null,
                'takeaway' => null,
                'delivery' => null,
                'description' => $row['description'] ?? null,
                'facebook' => null,
                'instagram' => null,
                'latitude' => $row['latitude'],
                'longitude' => $row['longitude'],
                'distance_meters' => (int) round($meters),
                'distance_km' => round($meters / 1000, 2),
            ];
        }

        usort($places, static function (array $a, array $b): int {
            $phoneCmp = (int) (trim((string) ($b['phone'] ?? '')) !== '')
                <=> (int) (trim((string) ($a['phone'] ?? '')) !== '');
            if ($phoneCmp !== 0) {
                return $phoneCmp;
            }

            return ($a['distance_meters'] ?? 0) <=> ($b['distance_meters'] ?? 0);
        });

        return $places;
    }

    public static function isDemoCommunity(?int $communityId): bool
    {
        if (! $communityId) {
            return false;
        }

        $name = DB::table('communities')->where('id', $communityId)->value('name');

        return $name === TgiCommunitySeeder::COMMUNITY_NAME;
    }

    /** @return list<array<string, mixed>> */
    private static function catalog(): array
    {
        return [
            [
                'slug' => 'dha-grill',
                'name' => 'DHA Grill & Karahi',
                'category' => 'restaurants',
                'matched_categories' => ['restaurants'],
                'address' => 'Street 10, DHA Phase 5, Lahore',
                'phone' => '+92 300 111 2233',
                'hours' => 'Daily 1:00 PM - 12:00 AM',
                'website' => null,
                'cuisine' => 'pakistani',
                'description' => 'Family dining and BBQ platters walkable from the community.',
                'latitude' => 31.47660,
                'longitude' => 74.40280,
            ],
            [
                'slug' => 'espresso-zone',
                'name' => 'Espresso Zone DHA',
                'category' => 'cafes',
                'matched_categories' => ['cafes'],
                'address' => 'Street 12, DHA Phase 5, Lahore',
                'phone' => '+92 42 3578 1200',
                'hours' => 'Mon-Sun 8:00 AM - 11:00 PM',
                'website' => 'https://example.com/espresso-zone',
                'cuisine' => 'coffee_shop',
                'description' => 'Specialty coffee and pastries near Main Boulevard.',
                'latitude' => 31.47620,
                'longitude' => 74.40190,
            ],
            [
                'slug' => 'packages-mall-food',
                'name' => 'Packages Mall Food Court',
                'category' => 'restaurants',
                'matched_categories' => ['restaurants'],
                'address' => 'Packages Mall, Walton Road, Lahore',
                'phone' => '+92 42 111 696 255',
                'hours' => 'Mon-Sun 11:00 AM - 11:00 PM',
                'website' => null,
                'description' => 'Mall dining with local and international options.',
                'latitude' => 31.47140,
                'longitude' => 74.35580,
            ],
            [
                'slug' => 'dha-pharmacy',
                'name' => 'DHA Family Pharmacy',
                'category' => 'pharmacies',
                'matched_categories' => ['pharmacies'],
                'address' => 'Block C, DHA Phase 5, Lahore',
                'phone' => '+92 300 765 4321',
                'hours' => 'Mon-Sat 9:00 AM - 10:00 PM',
                'website' => null,
                'description' => 'Prescriptions and over-the-counter essentials.',
                'latitude' => 31.47480,
                'longitude' => 74.40310,
            ],
            [
                'slug' => 'gulberg-gym',
                'name' => 'Pulse Fitness Gulberg',
                'category' => 'gyms',
                'matched_categories' => ['gyms'],
                'address' => 'Main Boulevard, Gulberg III, Lahore',
                'phone' => '+92 42 3571 8899',
                'hours' => 'Mon-Sat 6:00 AM - 10:00 PM',
                'website' => 'https://example.com/pulse-fitness',
                'description' => 'Gym and studio classes a short drive from DHA.',
                'latitude' => 31.51240,
                'longitude' => 74.34820,
            ],
            [
                'slug' => 'corner-store',
                'name' => 'Neighborhood Mini Mart',
                'category' => 'supermarkets',
                'matched_categories' => ['supermarkets'],
                'address' => 'Street 5, DHA Phase 5, Lahore',
                'phone' => null,
                'hours' => 'Daily 7:00 AM - 12:00 AM',
                'website' => null,
                'description' => 'Groceries, snacks, and household basics.',
                'latitude' => 31.47590,
                'longitude' => 74.40020,
            ],
            [
                'slug' => 'biryani-house',
                'name' => 'Liberty Biryani House',
                'category' => 'restaurants',
                'matched_categories' => ['restaurants'],
                'address' => 'Liberty Market, Gulberg, Lahore',
                'phone' => '+92 321 555 0101',
                'hours' => 'Daily 12:00 PM - 1:00 AM',
                'website' => null,
                'cuisine' => 'biryani',
                'description' => 'Classic Lahori biryani and karahi.',
                'latitude' => 31.51350,
                'longitude' => 74.34560,
            ],
            [
                'slug' => 'community-bank',
                'name' => 'HBL DHA Branch',
                'category' => 'banks',
                'matched_categories' => ['banks'],
                'address' => 'Commercial Area, DHA Phase 5, Lahore',
                'phone' => '+92 42 3578 4400',
                'hours' => 'Mon-Fri 9:00 AM - 5:00 PM',
                'website' => 'https://www.hbl.com',
                'description' => 'ATM and in-branch services.',
                'latitude' => 31.47680,
                'longitude' => 74.40250,
            ],
            [
                'slug' => 'open-air-cafe',
                'name' => 'Courtyard Tea Stall',
                'category' => 'cafes',
                'matched_categories' => ['cafes'],
                'address' => 'Street 8, DHA Phase 5, Lahore',
                'phone' => null,
                'hours' => 'Daily 6:00 AM - 10:00 PM',
                'website' => null,
                'description' => 'Chai and paratha — walkable from the community gate.',
                'latitude' => 31.47450,
                'longitude' => 74.40120,
            ],
        ];
    }
}
