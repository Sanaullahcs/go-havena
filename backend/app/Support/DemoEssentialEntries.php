<?php

namespace App\Support;

use Database\Seeders\TgiCommunitySeeder;
use Illuminate\Support\Facades\DB;

/**
 * Curated Local Essentials listings for the TGI demo community.
 */
class DemoEssentialEntries
{
    /** @return list<array<string, mixed>> */
    public static function catalog(): array
    {
        return [
            [
                'section' => 'health',
                'title' => 'TGI Resident Clinic',
                'body' => 'On-site nurse desk and first-aid support for residents.',
                'description' => 'Weekdays 9:00 AM – 6:00 PM. Call ahead for home visits.',
                'phone' => '+92 42 3578 1101',
                'address' => 'Clubhouse, TGI, DHA Phase 5, Lahore',
                'latitude' => 31.47580,
                'longitude' => 74.40190,
                'nearby_category' => 'hospitals',
                'verified' => true,
            ],
            [
                'section' => 'health',
                'title' => 'Sehat Plus Pharmacy',
                'body' => 'Prescriptions, vaccines, and over-the-counter medicine.',
                'description' => 'Delivery to TGI gate on request.',
                'phone' => '+92 300 765 4321',
                'address' => 'Block C, DHA Phase 5, Lahore',
                'latitude' => 31.47480,
                'longitude' => 74.40310,
                'nearby_category' => 'pharmacies',
                'verified' => true,
            ],
            [
                'section' => 'burial',
                'title' => 'Janazah Coordination Desk',
                'body' => 'Community focal point for burial paperwork and transport.',
                'description' => 'Available 24/7 — call the duty line first.',
                'phone' => '+92 42 3578 2200',
                'address' => 'Management Office, TGI, Lahore',
                'latitude' => 31.47550,
                'longitude' => 74.40120,
                'nearby_category' => 'burial_places',
                'verified' => true,
            ],
            [
                'section' => 'burial',
                'title' => 'Miani Sahib Liaison',
                'body' => 'Graveyard coordination for DHA residents.',
                'description' => 'Helps with plot availability and ghusl arrangements.',
                'phone' => '+92 321 880 4411',
                'address' => 'Miani Sahib Graveyard, Lahore',
                'latitude' => 31.56820,
                'longitude' => 74.31240,
                'nearby_category' => 'burial_places',
                'verified' => true,
            ],
            [
                'section' => 'parking',
                'title' => 'Main Gate Visitor Parking',
                'body' => 'Short-stay bays for guests at the primary gate.',
                'description' => 'Show visitor pass at the barrier.',
                'phone' => '+92 42 3578 3301',
                'address' => 'TGI Main Gate, DHA Phase 5, Lahore',
                'latitude' => 31.47510,
                'longitude' => 74.40080,
                'nearby_category' => 'parking',
                'verified' => true,
            ],
            [
                'section' => 'parking',
                'title' => 'Clubhouse Overflow Lot',
                'body' => 'Additional parking during events and Friday prayers.',
                'description' => 'Opens when the main lot is full.',
                'phone' => '+92 42 3578 3302',
                'address' => 'Street 8, TGI, DHA Phase 5, Lahore',
                'latitude' => 31.47600,
                'longitude' => 74.40220,
                'nearby_category' => 'parking',
                'verified' => true,
            ],
            [
                'section' => 'clubs',
                'title' => 'TGI Community Club',
                'body' => 'Member lounge, pool, and event hall bookings.',
                'description' => 'Residents book through the amenities calendar.',
                'phone' => '+92 42 3578 4400',
                'address' => 'Clubhouse, TGI, DHA Phase 5, Lahore',
                'latitude' => 31.47570,
                'longitude' => 74.40170,
                'nearby_category' => 'clubs',
                'verified' => true,
            ],
            [
                'section' => 'clubs',
                'title' => 'DHA Sports Society',
                'body' => 'Tennis, squash, and weekend coaching for families.',
                'description' => 'Partner facility — mention TGI membership.',
                'phone' => '+92 300 222 8899',
                'address' => 'Sports Complex, DHA Phase 5, Lahore',
                'latitude' => 31.47720,
                'longitude' => 74.40350,
                'nearby_category' => 'clubs',
                'verified' => true,
            ],
            [
                'section' => 'food',
                'title' => 'DHA Grill & Karahi',
                'body' => 'Community-approved catering and dine-in karahi.',
                'description' => 'Family platters and BBQ — call for reservations.',
                'phone' => '+92 300 111 2233',
                'address' => 'Street 10, DHA Phase 5, Lahore',
                'latitude' => 31.47660,
                'longitude' => 74.40280,
                'nearby_category' => 'restaurants',
                'verified' => true,
            ],
            [
                'section' => 'food',
                'title' => 'TGI Home Kitchen',
                'body' => 'Daily home-style meals and iftar trays for residents.',
                'description' => 'Order by 4 PM for same-evening delivery to your unit.',
                'phone' => '+92 321 555 7788',
                'address' => 'Block B, TGI, DHA Phase 5, Lahore',
                'latitude' => 31.47490,
                'longitude' => 74.40140,
                'nearby_category' => 'restaurants',
                'verified' => true,
            ],
        ];
    }

    public static function syncForCommunity(int $communityId, ?int $createdBy = null): void
    {
        if (! DemoNearbyPlaces::isDemoCommunity($communityId)) {
            return;
        }

        $now = now();
        foreach (self::catalog() as $row) {
            $match = [
                'community_id' => $communityId,
                'section' => $row['section'],
                'title' => $row['title'],
            ];

            $existing = DB::table('community_essential_entries')->where($match)->first();
            $payload = [
                'body' => $row['body'],
                'description' => $row['description'],
                'phone' => $row['phone'],
                'address' => $row['address'],
                'latitude' => $row['latitude'],
                'longitude' => $row['longitude'],
                'nearby_category' => $row['nearby_category'],
                'verified' => (bool) $row['verified'],
                'updated_at' => $now,
            ];

            if ($existing) {
                DB::table('community_essential_entries')->where('id', $existing->id)->update($payload);
            } else {
                DB::table('community_essential_entries')->insert([
                    ...$match,
                    ...$payload,
                    'created_by' => $createdBy,
                    'created_at' => $now,
                ]);
            }
        }
    }

    public static function syncForTgiCommunity(): void
    {
        $communityId = (int) DB::table('communities')
            ->where('name', TgiCommunitySeeder::COMMUNITY_NAME)
            ->value('id');

        if ($communityId < 1) {
            return;
        }

        $createdBy = (int) (DB::table('users')
            ->where('email', TgiCommunitySeeder::ADMIN_EMAIL)
            ->value('id') ?: 0);

        self::syncForCommunity($communityId, $createdBy > 0 ? $createdBy : null);
    }
}
