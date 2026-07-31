<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Demo amenities (+ sample bookings) for the primary active community.
 * Idempotent: inserts missing amenities by name; tops up sample bookings.
 *
 * Run: php artisan db:seed --class=Database\\Seeders\\AmenitySeeder
 */
class AmenitySeeder extends Seeder
{
    public function run(): void
    {
        $community = DB::table('communities')
            ->where('status', 'active')
            ->orderBy('id')
            ->first();

        if (! $community) {
            $this->command?->warn('AmenitySeeder: no active community found.');

            return;
        }

        $communityId = (int) $community->id;

        $creatorId = DB::table('community_memberships as cm')
            ->join('users as u', 'u.id', '=', 'cm.user_id')
            ->where('cm.community_id', $communityId)
            ->where('cm.status', 'approved')
            ->whereIn('cm.role', ['admin'])
            ->orderBy('u.id')
            ->value('u.id');

        if (! $creatorId) {
            $creatorId = DB::table('community_memberships')
                ->where('community_id', $communityId)
                ->where('status', 'approved')
                ->orderBy('user_id')
                ->value('user_id');
        }

        $residentIds = DB::table('community_memberships')
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->where('role', 'member')
            ->orderBy('user_id')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();

        $now = now();

        $rows = [
            [
                'name' => 'Swimming Pool',
                'description' => 'Heated outdoor pool with loungers and a shallow end for families.',
                'status' => 'bookable',
                'review_status' => 'approved',
                'capacity' => 30,
                'floor' => 'Ground level',
                'hours' => '6:00 AM – 10:00 PM',
                'start_time' => '06:00:00',
                'end_time' => '22:00:00',
                'weekends_available' => true,
                'slot_duration_minutes' => 60,
                'icon_key' => 'pool',
            ],
            [
                'name' => 'Fitness Center',
                'description' => 'Cardio machines, free weights, and a stretching area.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 20,
                'floor' => 'Level 2',
                'hours' => '5:00 AM – 11:00 PM',
                'start_time' => '05:00:00',
                'end_time' => '23:00:00',
                'weekends_available' => true,
                'slot_duration_minutes' => null,
                'icon_key' => 'gym',
            ],
            [
                'name' => 'Community Hall',
                'description' => 'Indoor space for meetings, parties, and resident events.',
                'status' => 'bookable',
                'review_status' => 'approved',
                'capacity' => 80,
                'floor' => 'Ground floor',
                'hours' => '8:00 AM – 9:00 PM',
                'start_time' => '08:00:00',
                'end_time' => '21:00:00',
                'weekends_available' => true,
                'slot_duration_minutes' => 120,
                'icon_key' => 'hall',
            ],
            [
                'name' => 'Tennis Court',
                'description' => 'Lighted hard court available for singles and doubles play.',
                'status' => 'bookable',
                'review_status' => 'approved',
                'capacity' => 4,
                'floor' => 'Outdoor area',
                'hours' => '7:00 AM – 8:00 PM',
                'start_time' => '07:00:00',
                'end_time' => '20:00:00',
                'weekends_available' => true,
                'slot_duration_minutes' => 60,
                'icon_key' => 'sports',
            ],
            [
                'name' => 'BBQ Terrace',
                'description' => 'Rooftop grilling stations with seating for small gatherings.',
                'status' => 'bookable',
                'review_status' => 'approved',
                'capacity' => 15,
                'floor' => 'Rooftop',
                'hours' => '10:00 AM – 9:00 PM',
                'start_time' => '10:00:00',
                'end_time' => '21:00:00',
                'weekends_available' => true,
                'slot_duration_minutes' => 90,
                'icon_key' => 'dining',
            ],
            [
                'name' => 'Kids Playground',
                'description' => 'Shaded play area with swings, slides, and soft flooring.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 25,
                'floor' => 'Garden level',
                'hours' => '8:00 AM – 7:00 PM',
                'start_time' => '08:00:00',
                'end_time' => '19:00:00',
                'weekends_available' => true,
                'slot_duration_minutes' => null,
                'icon_key' => 'playground',
            ],
            [
                'name' => 'Meeting Room',
                'description' => 'Quiet room with Wi‑Fi, whiteboard, and seating for 12.',
                'status' => 'bookable',
                'review_status' => 'approved',
                'capacity' => 12,
                'floor' => 'Level 1',
                'hours' => '9:00 AM – 6:00 PM',
                'start_time' => '09:00:00',
                'end_time' => '18:00:00',
                'weekends_available' => false,
                'slot_duration_minutes' => 60,
                'icon_key' => 'meeting',
            ],
            [
                'name' => 'Residents Lounge',
                'description' => 'Comfortable lounge with reading nook and coffee station.',
                'status' => 'closed',
                'review_status' => 'approved',
                'capacity' => 18,
                'floor' => 'Lobby',
                'hours' => '9:00 AM – 5:00 PM',
                'start_time' => '09:00:00',
                'end_time' => '17:00:00',
                'weekends_available' => false,
                'slot_duration_minutes' => null,
                'icon_key' => 'building',
            ],
            // Pending amenity submissions for admin Approval queue testing
            [
                'name' => 'Yoga Studio (Pending)',
                'description' => 'Mirrored studio with mats and sound system. Awaiting admin review.',
                'status' => 'bookable',
                'review_status' => 'pending',
                'capacity' => 16,
                'floor' => 'Level 3',
                'hours' => '7:00 AM – 8:00 PM',
                'start_time' => '07:00:00',
                'end_time' => '20:00:00',
                'weekends_available' => true,
                'slot_duration_minutes' => 60,
                'icon_key' => 'spa',
            ],
            [
                'name' => 'Guest Parking Bay (Pending)',
                'description' => 'Reserved overnight guest parking spots near the lobby.',
                'status' => 'bookable',
                'review_status' => 'pending',
                'capacity' => 6,
                'floor' => 'P1',
                'hours' => '12:00 AM – 11:59 PM',
                'start_time' => '00:00:00',
                'end_time' => '23:59:00',
                'weekends_available' => true,
                'slot_duration_minutes' => 120,
                'icon_key' => 'parking',
            ],
        ];

        $inserted = 0;
        $amenityIdsByName = [];

        foreach ($rows as $row) {
            $existingId = DB::table('amenities')
                ->where('community_id', $communityId)
                ->where('name', $row['name'])
                ->value('id');

            if ($existingId) {
                $amenityIdsByName[$row['name']] = (int) $existingId;
                continue;
            }

            // Match loosely on "swimming pool" vs "Swimming Pool"
            $fuzzyId = DB::table('amenities')
                ->where('community_id', $communityId)
                ->whereRaw('LOWER(name) = ?', [strtolower($row['name'])])
                ->value('id');

            if ($fuzzyId) {
                DB::table('amenities')->where('id', $fuzzyId)->update([
                    'description' => $row['description'],
                    'status' => $row['status'],
                    'review_status' => $row['review_status'],
                    'capacity' => $row['capacity'],
                    'floor' => $row['floor'],
                    'hours' => $row['hours'],
                    'start_time' => $row['start_time'],
                    'end_time' => $row['end_time'],
                    'weekends_available' => $row['weekends_available'],
                    'slot_duration_minutes' => $row['slot_duration_minutes'],
                    'icon_key' => $row['icon_key'],
                    'updated_at' => $now,
                ]);
                $amenityIdsByName[$row['name']] = (int) $fuzzyId;
                continue;
            }

            $id = DB::table('amenities')->insertGetId([
                'community_id' => $communityId,
                'created_by' => $creatorId,
                'name' => $row['name'],
                'description' => $row['description'],
                'status' => $row['status'],
                'review_status' => $row['review_status'],
                'capacity' => $row['capacity'],
                'floor' => $row['floor'],
                'hours' => $row['hours'],
                'start_time' => $row['start_time'],
                'end_time' => $row['end_time'],
                'weekends_available' => $row['weekends_available'],
                'slot_duration_minutes' => $row['slot_duration_minutes'],
                'image_url' => null,
                'icon_key' => $row['icon_key'],
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $amenityIdsByName[$row['name']] = (int) $id;
            $inserted++;
        }

        $bookingsAdded = $this->seedSampleBookings(
            $communityId,
            $amenityIdsByName,
            $residentIds,
            $now,
        );

        $total = DB::table('amenities')->where('community_id', $communityId)->count();
        $pending = DB::table('amenities')
            ->where('community_id', $communityId)
            ->where('review_status', 'pending')
            ->count();

        $this->command?->info(
            "AmenitySeeder: community #{$communityId} — inserted {$inserted} amenities ".
            "(total {$total}, pending reviews {$pending}), sample bookings +{$bookingsAdded}."
        );
    }

    /**
     * @param  array<string, int>  $amenityIdsByName
     * @param  list<int>  $residentIds
     */
    private function seedSampleBookings(
        int $communityId,
        array $amenityIdsByName,
        array $residentIds,
        $now,
    ): int {
        if ($residentIds === []) {
            return 0;
        }

        $poolId = $amenityIdsByName['Swimming Pool']
            ?? DB::table('amenities')
                ->where('community_id', $communityId)
                ->where('review_status', 'approved')
                ->where('status', 'bookable')
                ->orderBy('id')
                ->value('id');

        $hallId = $amenityIdsByName['Community Hall'] ?? null;
        $tennisId = $amenityIdsByName['Tennis Court'] ?? null;

        $tomorrow = now()->addDay()->toDateString();
        $dayAfter = now()->addDays(2)->toDateString();
        $nextWeek = now()->addDays(5)->toDateString();

        $samples = array_values(array_filter([
            $poolId ? [
                'amenity_id' => (int) $poolId,
                'user_id' => $residentIds[0],
                'date' => $tomorrow,
                'time_slot' => '10:00 AM - 11:00 AM',
                'guests' => 2,
                'status' => 'pending',
                'notes' => 'Family swim — please keep shallow end clear.',
            ] : null,
            $poolId && isset($residentIds[1]) ? [
                'amenity_id' => (int) $poolId,
                'user_id' => $residentIds[1],
                'date' => $dayAfter,
                'time_slot' => '04:00 PM - 05:00 PM',
                'guests' => 1,
                'status' => 'confirmed',
                'notes' => null,
            ] : null,
            $hallId && isset($residentIds[2]) ? [
                'amenity_id' => (int) $hallId,
                'user_id' => $residentIds[2],
                'date' => $nextWeek,
                'time_slot' => '02:00 PM - 04:00 PM',
                'guests' => 20,
                'status' => 'pending',
                'notes' => 'Birthday gathering — need tables set up.',
            ] : null,
            $tennisId ? [
                'amenity_id' => (int) $tennisId,
                'user_id' => $residentIds[0],
                'date' => $dayAfter,
                'time_slot' => '08:00 AM - 09:00 AM',
                'guests' => 2,
                'status' => 'pending',
                'notes' => 'Doubles practice.',
            ] : null,
        ]));

        $added = 0;
        foreach ($samples as $sample) {
            $exists = DB::table('bookings')
                ->where('amenity_id', $sample['amenity_id'])
                ->where('user_id', $sample['user_id'])
                ->where('date', $sample['date'])
                ->where('time_slot', $sample['time_slot'])
                ->exists();

            if ($exists) {
                continue;
            }

            DB::table('bookings')->insert([
                ...$sample,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $added++;
        }

        return $added;
    }
}
