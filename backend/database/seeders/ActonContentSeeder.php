<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Content for Acton, MA — the town as one community.
 *
 * Every place, address, phone number, service, transit detail and public event
 * referenced below is real and verifiable:
 *
 *   NARA Park, 25 Ledge Rock Way — 40 acres, opened 1999, renamed 2012 for
 *     Nathaniel Allen, Acton's Civil War Medal of Honor recipient.
 *   Acton Arboretum, off Taylor Road — 65 acres, glacial esker, bog, gardens.
 *   South Acton station, 10 Central Street — MBTA Fitchburg Line, zone 6,
 *     287 parking spaces, 100 bicycle spaces.
 *   Transfer Station & Recycling Center, 193 Massachusetts Avenue —
 *     Tue–Sat 7:00 AM–3:00 PM, (978) 929-7742, SMART pay-as-you-throw.
 *   Acton Town Hall & Memorial Library, 472 / 486 Main Street.
 *   West Acton Oktoberfest — Sat 26 Sep 2026, Gardner Field, 530 Mass Ave.
 *   Acton-Boxborough Farmers Market — Sundays to 11 Oct 2026, 19 Elm Street.
 *
 * Residents and their posts are fictional. Run via ActonCommunitySeeder.
 */
class ActonContentSeeder extends Seeder
{
    public ?int $communityId = null;

    private int $cid;

    private int $adminId;

    /** @var array<string, int> email => user id */
    private array $people = [];

    public function run(): void
    {
        $community = $this->communityId
            ? DB::table('communities')->where('id', $this->communityId)->first()
            : ActonCommunitySeeder::communityQuery()->first();

        if (! $community) {
            $this->command?->error('ActonContentSeeder: run ActonCommunitySeeder first.');

            return;
        }

        $this->cid = (int) $community->id;
        $this->people = $this->resolvePeople();
        $this->adminId = (int) ($this->people[ActonCommunitySeeder::ADMIN_EMAIL] ?? 0);

        if ($this->adminId === 0) {
            $this->command?->error('ActonContentSeeder: community admin not found.');

            return;
        }

        $this->resetSeededContent();

        $amenities = $this->seedAmenities();
        $this->seedBookings($amenities);
        $this->seedSharedBills($amenities);
        $this->seedNotices();
        $this->seedEvents();
        $this->seedAlert();
        $this->seedFeed();
        $this->seedListings();
        $this->seedBusinessesAndDeals();
        $this->seedRules();
        $this->seedDocuments();

        $this->command?->info('  Acton content ready for community #'.$this->cid.'.');
    }

    /* ─────────────────────────── helpers ─────────────────────────── */

    /**
     * Prefer the Acton photo set, fall back to the shared seed images.
     * See scripts/download-acton-photos.php.
     */
    private function img(string $key): string
    {
        static $acton = null;

        if ($acton === null) {
            $acton = [];
            foreach (glob(storage_path('app/public/seed/acton/*.jpg')) ?: [] as $path) {
                $acton[basename($path, '.jpg')] = true;
            }
        }

        return isset($acton[$key])
            ? "/storage/seed/acton/{$key}.jpg"
            : "/storage/seed/{$key}.jpg";
    }

    /** @return array<string, int> */
    private function resolvePeople(): array
    {
        $emails = array_merge(
            [ActonCommunitySeeder::ADMIN_EMAIL, ActonCommunitySeeder::RESIDENT_EMAIL],
            array_column(ActonCommunitySeeder::neighbours(), 'email'),
        );

        return DB::table('users')
            ->whereIn('email', $emails)
            ->pluck('id', 'email')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    private function uid(string $email): ?int
    {
        return $this->people[$email] ?? null;
    }

    /**
     * Drop previous village/HOA rows for this community so a re-seed does not
     * leave "Nagog Woods Clubhouse" sitting next to Town Hall.
     */
    private function resetSeededContent(): void
    {
        $amenityIds = DB::table('amenities')->where('community_id', $this->cid)->pluck('id');
        if ($amenityIds->isNotEmpty()) {
            DB::table('bookings')->whereIn('amenity_id', $amenityIds)->delete();
            if (Schema::hasTable('amenity_monthly_bills')) {
                $monthlyIds = DB::table('amenity_monthly_bills')->where('community_id', $this->cid)->pluck('id');
                if ($monthlyIds->isNotEmpty() && Schema::hasTable('amenity_resident_bills')) {
                    DB::table('amenity_resident_bills')->whereIn('monthly_bill_id', $monthlyIds)->delete();
                }
                DB::table('amenity_monthly_bills')->where('community_id', $this->cid)->delete();
            }
            DB::table('amenities')->where('community_id', $this->cid)->delete();
        }

        $noticeIds = DB::table('notices')->where('community_id', $this->cid)->pluck('id');
        if ($noticeIds->isNotEmpty()) {
            if (Schema::hasTable('event_rsvps')) {
                DB::table('event_rsvps')->whereIn('notice_id', $noticeIds)->delete();
            }
            if (Schema::hasTable('notice_recipients')) {
                DB::table('notice_recipients')->whereIn('notice_id', $noticeIds)->delete();
            }
            if (Schema::hasTable('app_notifications')) {
                foreach ($noticeIds as $noticeId) {
                    DB::table('app_notifications')->where('action_url', '/notices/'.$noticeId)->delete();
                }
            }
            DB::table('notices')->where('community_id', $this->cid)->delete();
        }

        $postIds = DB::table('posts')->where('community_id', $this->cid)->pluck('id');
        if ($postIds->isNotEmpty()) {
            DB::table('post_comments')->whereIn('post_id', $postIds)->delete();
            DB::table('post_likes')->whereIn('post_id', $postIds)->delete();
            DB::table('posts')->where('community_id', $this->cid)->delete();
        }

        DB::table('listings')->where('community_id', $this->cid)->delete();
        if (Schema::hasTable('deals')) {
            DB::table('deals')->where('community_id', $this->cid)->delete();
        }
        if (Schema::hasTable('businesses')) {
            DB::table('businesses')->where('community_id', $this->cid)->delete();
        }

        $ruleIds = DB::table('community_rules')->where('community_id', $this->cid)->pluck('id');
        if ($ruleIds->isNotEmpty()) {
            if (Schema::hasTable('rule_acknowledgments')) {
                DB::table('rule_acknowledgments')->whereIn('rule_id', $ruleIds)->delete();
            }
            DB::table('community_rules')->where('community_id', $this->cid)->delete();
        }

        if (Schema::hasTable('community_documents')) {
            DB::table('community_documents')->where('community_id', $this->cid)->delete();
        }
    }

    /** Approved members only, in join order — used for RSVPs, likes, and bills. */
    private function approvedResidentIds(): array
    {
        return DB::table('community_memberships')
            ->where('community_id', $this->cid)
            ->where('status', 'approved')
            ->whereIn('role', ['member', 'moderator'])
            ->orderBy('user_id')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /* ─────────────────────────── amenities ─────────────────────────── */

    /** @return array<string, int> amenity name => id */
    private function seedAmenities(): array
    {
        $now = now();

        $rows = [
            [
                'name' => 'Acton Town Hall',
                'description' => 'Town offices at 472 Main Street in Acton Centre. Select Board, Town Manager, and resident services. Main number (978) 929-6600.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 80,
                'floor' => '472 Main Street',
                'hours' => 'Mon–Thu 8:00 AM – 5:00 PM',
                'start_time' => '08:00:00',
                'end_time' => '17:00:00',
                'slot_duration_minutes' => 60,
                'icon_key' => 'hall',
                'image' => 'acton-town-hall',
            ],
            [
                'name' => 'Acton Memorial Library',
                'description' => 'The town library at 486 Main Street, next to Town Hall. Minuteman card holders can use Libby, Hoopla, and Kanopy. (978) 929-6655.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 60,
                'floor' => '486 Main Street',
                'hours' => 'See actonmemoriallibrary.org',
                'start_time' => '09:00:00',
                'end_time' => '21:00:00',
                'slot_duration_minutes' => 60,
                'icon_key' => 'building',
                'image' => 'acton-memorial-library',
            ],
            [
                'name' => "West Acton Citizens' Library",
                'description' => 'A small neighborhood library at 21 Windsor Avenue in West Acton Village. (978) 929-6654.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 20,
                'floor' => '21 Windsor Avenue',
                'hours' => 'See actonmemoriallibrary.org',
                'start_time' => '10:00:00',
                'end_time' => '17:00:00',
                'slot_duration_minutes' => null,
                'icon_key' => 'building',
                'image' => 'west-acton-library',
            ],
            [
                'name' => 'NARA Park',
                'description' => 'Nathaniel Allen Recreation Area at 25 Ledge Rock Way: 40 acres with a swimming pond and beach (Memorial Day through late August), playground, walking trail, fields, amphitheater, and the Joseph Lalli Miracle Field. Open dawn to dusk year-round. Recreation office: 50 Audubon Drive, recreation@actonma.gov.',
                'status' => 'bookable',
                'review_status' => 'approved',
                'capacity' => 400,
                'floor' => '25 Ledge Rock Way',
                'hours' => 'Dawn – dusk',
                'start_time' => '06:00:00',
                'end_time' => '20:00:00',
                'slot_duration_minutes' => 120,
                'icon_key' => 'playground',
                'image' => 'acton-fall-woods',
            ],
            [
                'name' => 'Acton Arboretum',
                'description' => 'About 65 acres of gardens, glacial esker, and bog off Taylor Road. Pedestrian entrance at 2 Taylor Road. Dawn to dusk.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 120,
                'floor' => '2 Taylor Road',
                'hours' => 'Dawn – dusk',
                'start_time' => '06:00:00',
                'end_time' => '20:00:00',
                'slot_duration_minutes' => null,
                'icon_key' => 'terrace',
                'image' => 'acton-wetlands',
            ],
            [
                'name' => 'Great Hill Conservation Land',
                'description' => 'Town conservation land with woodland trails, an athletic field, a brook crossing, and a skating pond in winter. Open dawn to dusk.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 150,
                'floor' => 'Great Hill',
                'hours' => 'Dawn – dusk',
                'start_time' => '06:00:00',
                'end_time' => '20:00:00',
                'slot_duration_minutes' => null,
                'icon_key' => 'sports',
                'image' => 'great-hill-trail',
            ],
            [
                'name' => 'South Acton Station',
                'description' => 'MBTA Fitchburg Line stop at 10 Central Street, fare zone 6. 287 town parking spaces and 100 bicycle spaces. The Assabet River Rail Trail runs past the station. The lot is often full by 7:30 AM on weekdays.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 287,
                'floor' => '10 Central Street',
                'hours' => 'Daily service',
                'start_time' => '05:00:00',
                'end_time' => '23:59:00',
                'slot_duration_minutes' => null,
                'icon_key' => 'parking',
                'image' => 'south-acton-station',
            ],
            [
                'name' => 'Bruce Freeman Rail Trail',
                'description' => 'Paved multi-use trail through Acton, including the bridge over Route 2A. Connects toward Concord and Westford. Bikes, walkers, and strollers.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 200,
                'floor' => 'Route 2A crossing',
                'hours' => 'Dawn – dusk',
                'start_time' => '06:00:00',
                'end_time' => '20:00:00',
                'slot_duration_minutes' => null,
                'icon_key' => 'sports',
                'image' => 'rail-trail-bridge',
            ],
            [
                'name' => 'Assabet River Rail Trail',
                'description' => 'Rail trail through South Acton, passing South Acton station. A flat ride or walk toward Maynard.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 150,
                'floor' => 'South Acton',
                'hours' => 'Dawn – dusk',
                'start_time' => '06:00:00',
                'end_time' => '20:00:00',
                'slot_duration_minutes' => null,
                'icon_key' => 'sports',
                'image' => 'assabet-rail-trail',
            ],
            [
                'name' => 'Gardner Field',
                'description' => 'Town playground and field at 530 Massachusetts Avenue in West Acton, across from Villageworks. Host of the West Acton Village Oktoberfest.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 300,
                'floor' => '530 Massachusetts Avenue',
                'hours' => 'Dawn – dusk',
                'start_time' => '07:00:00',
                'end_time' => '20:00:00',
                'slot_duration_minutes' => null,
                'icon_key' => 'playground',
                'image' => 'east-acton-green',
            ],
            [
                'name' => 'Elm Street Playground',
                'description' => 'Town playground at 19 Elm Street. Home of the Acton-Boxborough Farmers Market, Sundays 10:00 AM – 1:00 PM from mid-June through mid-October.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 200,
                'floor' => '19 Elm Street',
                'hours' => 'Dawn – dusk',
                'start_time' => '07:00:00',
                'end_time' => '20:00:00',
                'slot_duration_minutes' => null,
                'icon_key' => 'playground',
                'image' => 'farm-stand',
            ],
            [
                'name' => 'Transfer Station & Recycling Center',
                'description' => 'Town drop-off at about 193 Massachusetts Avenue (Route 2 westbound entrance). Tuesday–Saturday 7:00 AM – 3:00 PM; closed Sunday and Monday. Sticker or per-trip fee required. SMART orange Acton bags for trash. (978) 929-7742.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 80,
                'floor' => '193 Massachusetts Avenue',
                'hours' => 'Tue–Sat 7:00 AM – 3:00 PM',
                'start_time' => '07:00:00',
                'end_time' => '15:00:00',
                'slot_duration_minutes' => null,
                'icon_key' => 'building',
                'image' => 'acton-plaza',
            ],
            [
                'name' => 'Faulkner Homestead',
                'description' => 'The 1707 Faulkner Homestead in South Acton, one of the oldest houses in town, on the historic Line of March of the Acton Minutemen.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 40,
                'floor' => 'South Acton',
                'hours' => 'Grounds dawn – dusk',
                'start_time' => '08:00:00',
                'end_time' => '18:00:00',
                'slot_duration_minutes' => null,
                'icon_key' => 'building',
                'image' => 'faulkner-homestead',
            ],
            [
                'name' => 'Acton Centre Firehouse',
                'description' => 'Acton Fire Department District 1 station in Acton Centre, on the historic town green near Town Hall and Memorial Library.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 20,
                'floor' => 'Acton Centre',
                'hours' => 'Staffed station',
                'start_time' => '00:00:00',
                'end_time' => '23:59:00',
                'slot_duration_minutes' => null,
                'icon_key' => 'building',
                'image' => 'acton-firehouse',
            ],
            [
                'name' => 'Main Street, Acton Centre',
                'description' => 'Route 27 through Acton Centre: Town Hall, Memorial Library, the town green, and the Line of March of the Acton Minutemen.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 100,
                'floor' => 'Main Street',
                'hours' => 'Public street',
                'start_time' => '00:00:00',
                'end_time' => '23:59:00',
                'slot_duration_minutes' => null,
                'icon_key' => 'building',
                'image' => 'acton-main-street',
            ],
            [
                'name' => 'Recreation Office',
                'description' => 'Acton Recreation Department at 50 Audubon Drive. Monday–Thursday 9:00 AM – 3:00 PM, Friday 9:00 AM – 12:00 PM. NARA beach memberships, field reservations, and summer programs. recreation@actonma.gov.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 12,
                'floor' => '50 Audubon Drive',
                'hours' => 'Mon–Thu 9:00 AM – 3:00 PM · Fri 9:00 AM – 12:00 PM',
                'start_time' => '09:00:00',
                'end_time' => '15:00:00',
                'slot_duration_minutes' => 60,
                'icon_key' => 'hall',
                'image' => 'great-hill-field',
            ],
            [
                'name' => 'Nashoba Brook',
                'description' => 'The brook through Acton, with public access and a trail crossing on Great Hill Conservation Land. Stay on marked paths after rain — the banks get slick.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 40,
                'floor' => 'Great Hill / Nashoba Brook',
                'hours' => 'Dawn – dusk',
                'start_time' => '06:00:00',
                'end_time' => '20:00:00',
                'slot_duration_minutes' => null,
                'icon_key' => 'building',
                'image' => 'nashoba-brook',
            ],
            [
                'name' => 'Great Hill Athletic Field',
                'description' => 'Open athletic field on Great Hill Conservation Land. Informal soccer and pickup games; no lights. Dawn to dusk.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 80,
                'floor' => 'Great Hill',
                'hours' => 'Dawn – dusk',
                'start_time' => '07:00:00',
                'end_time' => '19:30:00',
                'slot_duration_minutes' => 90,
                'icon_key' => 'sports',
                'image' => 'great-hill-field',
            ],
            [
                'name' => 'Great Hill Skating Pond',
                'description' => 'Seasonal skating pond on Great Hill Conservation Land. Ice is not monitored — only go on when the town or conservation commission posts that it is safe.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 50,
                'floor' => 'Great Hill',
                'hours' => 'Daylight, when posted safe',
                'start_time' => '09:00:00',
                'end_time' => '16:00:00',
                'slot_duration_minutes' => null,
                'icon_key' => 'pool',
                'image' => 'skating-pond',
            ],
            [
                'name' => 'East Acton Village Green',
                'description' => 'The small historic green in East Acton, at the old village crossroads. A quiet stop on a bike loop of town.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 40,
                'floor' => 'East Acton',
                'hours' => 'Dawn – dusk',
                'start_time' => '06:00:00',
                'end_time' => '20:00:00',
                'slot_duration_minutes' => null,
                'icon_key' => 'terrace',
                'image' => 'east-acton-green',
            ],
            [
                'name' => 'Acton Plaza',
                'description' => 'Shopping plaza on Great Road (Route 2A) with groceries and everyday errands. Busy on weekday evenings and Saturday mornings.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 200,
                'floor' => 'Great Road',
                'hours' => 'Store hours vary',
                'start_time' => '07:00:00',
                'end_time' => '22:00:00',
                'slot_duration_minutes' => null,
                'icon_key' => 'building',
                'image' => 'acton-plaza',
            ],
            [
                'name' => 'Little Free Library, West Acton',
                'description' => 'Street-side Little Free Library in West Acton Village. Take a book, leave a book. Silver Unicorn Bookstore on Spruce Street is the shop if you want to buy one new.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 8,
                'floor' => 'West Acton',
                'hours' => 'Always open',
                'start_time' => '00:00:00',
                'end_time' => '23:59:00',
                'slot_duration_minutes' => null,
                'icon_key' => 'building',
                'image' => 'little-free-library',
            ],
            [
                'name' => 'Line of March of the Acton Minutemen',
                'description' => 'The historic Line of March along Route 27, marked in Acton Centre. The Acton Minutemen still walk this route on Patriots’ Day.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 80,
                'floor' => 'Route 27 / Main Street',
                'hours' => 'Public way',
                'start_time' => '00:00:00',
                'end_time' => '23:59:00',
                'slot_duration_minutes' => null,
                'icon_key' => 'building',
                'image' => 'acton-minutemen',
            ],
        ];

        $ids = [];

        foreach ($rows as $row) {
            $payload = [
                'community_id' => $this->cid,
                'created_by' => $this->adminId,
                'name' => $row['name'],
                'description' => $row['description'],
                'status' => $row['status'],
                'review_status' => $row['review_status'],
                'capacity' => $row['capacity'],
                'floor' => $row['floor'],
                'hours' => $row['hours'],
                'start_time' => $row['start_time'],
                'end_time' => $row['end_time'],
                'weekends_available' => true,
                'slot_duration_minutes' => $row['slot_duration_minutes'],
                'icon_key' => $row['icon_key'],
                'image_url' => $this->img($row['image']),
                'booking_fee' => $row['booking_fee'] ?? 0,
                'shared_billing_enabled' => isset($row['shared_billing']),
                'shared_billing_type' => isset($row['shared_billing']) ? 'all_residents' : null,
                'shared_billing_frequency' => isset($row['shared_billing']) ? 'monthly' : null,
                'shared_billing_amount' => $row['shared_billing']['amount'] ?? null,
                'shared_billing_due_day' => $row['shared_billing']['due_day'] ?? null,
                'updated_at' => $now,
            ];

            $existing = DB::table('amenities')
                ->where('community_id', $this->cid)
                ->where('name', $row['name'])
                ->value('id');

            if ($existing) {
                DB::table('amenities')->where('id', $existing)->update($payload);
                $ids[$row['name']] = (int) $existing;

                continue;
            }

            $ids[$row['name']] = (int) DB::table('amenities')->insertGetId(
                $payload + ['created_at' => now()->subMonths(18)]
            );
        }

        $this->command?->info('  Amenities ready: '.count($ids));

        return $ids;
    }

    /** @param array<string, int> $amenities */
    private function seedBookings(array $amenities): void
    {
        $residents = $this->approvedResidentIds();
        if ($residents === []) {
            return;
        }

        $ananya = $this->uid(ActonCommunitySeeder::RESIDENT_EMAIL) ?? $residents[0];
        $weilin = $this->uid('weilin.nagog@havena.app') ?? $residents[0];
        $meera = $this->uid('meera.nagog@havena.app') ?? $residents[0];
        $rosa = $this->uid('rosa.nagog@havena.app') ?? $residents[0];
        $tom = $this->uid('tom.nagog@havena.app') ?? $residents[0];

        $rows = [
            [
                'amenity' => 'NARA Park',
                'user_id' => $meera,
                'date' => now()->addDays(4)->toDateString(),
                'time_slot' => '10:00 AM - 12:00 PM',
                'guests' => 12,
                'status' => 'confirmed',
                'booking_fee' => 0,
                'payment_verification_status' => 'not_required',
                'notes' => 'Picnic pavilion — birthday, rain plan is the covered bathhouse pavilion.',
            ],
            [
                'amenity' => 'Acton Memorial Library',
                'user_id' => $ananya,
                'date' => now()->addDays(6)->toDateString(),
                'time_slot' => '10:00 AM - 11:00 AM',
                'guests' => 8,
                'status' => 'confirmed',
                'booking_fee' => 0,
                'payment_verification_status' => 'not_required',
                'notes' => 'Study tables, Main Street side.',
            ],
            [
                'amenity' => 'Great Hill Athletic Field',
                'user_id' => $weilin,
                'date' => now()->addDays(3)->toDateString(),
                'time_slot' => '09:00 AM - 10:30 AM',
                'guests' => 10,
                'status' => 'confirmed',
                'booking_fee' => 0,
                'payment_verification_status' => 'not_required',
                'notes' => 'Pickup soccer. Cleats, no lights.',
            ],
            [
                'amenity' => 'Recreation Office',
                'user_id' => $rosa,
                'date' => now()->addDays(2)->toDateString(),
                'time_slot' => '09:00 AM - 10:00 AM',
                'guests' => 1,
                'status' => 'pending',
                'booking_fee' => 0,
                'payment_verification_status' => 'not_required',
                'notes' => 'Ask about 2026 NARA beach memberships.',
            ],
            [
                'amenity' => 'Acton Town Hall',
                'user_id' => $tom,
                'date' => now()->addDays(9)->toDateString(),
                'time_slot' => '06:00 PM - 08:00 PM',
                'guests' => 2,
                'status' => 'confirmed',
                'booking_fee' => 0,
                'payment_verification_status' => 'not_required',
                'notes' => 'Select Board night — public comment.',
            ],
        ];

        $added = 0;

        foreach ($rows as $row) {
            $amenityId = $amenities[$row['amenity']] ?? null;
            if (! $amenityId || ! $row['user_id']) {
                continue;
            }

            $exists = DB::table('bookings')
                ->where('amenity_id', $amenityId)
                ->where('user_id', $row['user_id'])
                ->where('date', $row['date'])
                ->where('time_slot', $row['time_slot'])
                ->exists();

            if ($exists) {
                continue;
            }

            unset($row['amenity']);
            DB::table('bookings')->insert($row + [
                'amenity_id' => $amenityId,
                'created_at' => now()->subDays(6),
                'updated_at' => now()->subDays(2),
            ]);
            $added++;
        }

        $this->command?->info('  Bookings added: '.$added);
    }

    /**
     * Town amenities do not carry HOA-style monthly assessments.
     *
     * @param  array<string, int>  $amenities
     */
    private function seedSharedBills(array $amenities): void
    {
        unset($amenities);

        $this->command?->info('  Shared billing skipped — town amenities have no assessments.');
    }

    /* ─────────────────────────── notices ─────────────────────────── */

    private function seedNotices(): void
    {
        // [title, category, body, image, daysAgo, pinned, scheduleOffsetDays]
        $rows = [
            [
                'Welcome to Acton, MA',
                'general',
                "Welcome. This community is the Town of Acton — West Acton, South Acton, Acton Centre, and the neighborhoods around Nagog Hill — not a single subdivision.\n\nUse this app for town notices, the public-place calendar, civic documents, the neighbour marketplace, and messages with the community office at Town Hall, 472 Main Street. The Town Hall switchboard is (978) 929-6600.\n\nA few things worth knowing in your first week: household trash and recycling go to the Transfer Station at 193 Massachusetts Avenue (sticker or per-trip fee; SMART orange bags required), South Acton at 10 Central Street is the only MBTA stop in town (Fitchburg Line, zone 6), and the Recreation office at 50 Audubon Drive handles NARA beach memberships — recreation@actonma.gov.",
                'acton-town-hall',
                1,
                true,
                3,
            ],
            [
                'Transfer Station Stickers and SMART Bags',
                'general',
                "Acton has no municipal curbside pickup. Household trash and recycling go to the Transfer Station & Recycling Center at 193 Massachusetts Avenue, open Tuesday to Saturday, 7:00 AM to 3:00 PM. Closed Sunday and Monday.\n\nYou need either an annual sticker or a per-trip fee to get in. Acton runs a SMART pay-as-you-throw programme — trash must be in official orange Acton bags, sold at grocery and hardware retailers around town. Recycling itself is free.\n\nConstruction debris is not accepted. Questions on fees or accepted items: (978) 929-7742.",
                'acton-plaza',
                2,
                true,
                21,
            ],
            [
                'Fitchburg Line and South Acton Parking',
                'general',
                "South Acton station at 10 Central Street is Acton's only active rail stop — MBTA Fitchburg Line, fare zone 6, 287 town-owned parking spaces and 100 bicycle spaces. The lot is routinely full by 7:30 AM on weekdays.\n\nThe Assabet River Rail Trail runs right past the station if you would rather ride than fight for a space. The free Cross-Acton Transit bus serves the station Monday to Friday, 8:15 AM to 4:15 PM.\n\nTimetables shift a few times a year. Check the MBTA app the Sunday night before you rely on a familiar inbound.",
                'south-acton-station',
                3,
                false,
                8,
            ],
            [
                'Acton Water District Hydrant Flushing',
                'maintenance',
                "The Acton Water District flushes hydrants through town and the Route 2A corridor this month, generally between 8:00 AM and 3:00 PM.\n\nExpect brief pressure drops and discoloured water. It is not harmful, but hold off on laundry until it runs clear — iron and manganese sediment will stain whites. Run a cold tap at the lowest fixture for a few minutes before you use hot water.\n\nIf discolouration lasts more than a few hours after the crew has left your street, call Town Hall at (978) 929-6600 and ask to be logged with the District.",
                'fire-hydrant',
                3,
                false,
                12,
            ],
            [
                'Town Leaf Collection and Storm Drains',
                'maintenance',
                "Please keep leaves out of the street. Leaves in the gutter block the storm drains that feed Nashoba Brook, and the town is responsible for what reaches the brook.\n\nRake to the lawn edge, not into the roadway, and do not bag leaves in plastic if you are taking them to the Transfer Station. Brush and yard waste accepted at 193 Massachusetts Avenue follow the posted rules — (978) 929-7742 if you are unsure.\n\nThe wet crossings on the Great Hill and Arboretum loops get slick once the leaves are down. Boots rather than trainers if you are walking this month.",
                'leaf-collection',
                4,
                false,
                18,
            ],
            [
                'Winter Parking on Town Ways',
                'maintenance',
                "Acton's winter parking ban on town ways typically runs from 1 November through mid-April. Once a storm is named or two inches are forecast, vehicles left on posted streets can be ticketed or towed so the plows can get through.\n\nUse your driveway or a legal off-street space. Do not shovel snow into the roadway — that is how the second pass misses your block.\n\nEversource outages should be reported directly to them. Town Hall can confirm warming-centre openings if a long outage is declared: (978) 929-6600.",
                'amenity-winter-lot',
                5,
                true,
                40,
            ],
            [
                'Tick and Mosquito Advisory — Trails and Woods',
                'general',
                "Central Middlesex has had a wet late summer. The state often lists our area at elevated risk for both EEE and West Nile into early autumn, and deer-tick activity picks up again through October.\n\nStay on the blazed trails at Great Hill, the Arboretum, NARA, and the Nashoba Brook loops. Treat footwear and socks, and check yourself, children, and dogs after every walk. Dusk and dawn are the worst windows for mosquitoes.\n\nReport standing water on town land through Town Hall so it can be drained.",
                'great-hill-trail',
                6,
                false,
                7,
            ],
            [
                'NARA Park Hours and Beach Season',
                'general',
                "NARA Park at 25 Ledge Rock Way is open dawn to dusk year-round — forty acres, an amphitheatre, playgrounds, and the only Miracle Field in Massachusetts.\n\nThe pond beach is staffed from Memorial Day weekend through late August. Day fees and season passes are sold through Recreation at 50 Audubon Drive, Monday to Thursday 9:00 AM to 3:00 PM and Friday 9:00 AM to noon. Email recreation@actonma.gov.\n\nDogs are not allowed on the beach. The rest of the park is a good autumn walk once the swimming season closes.",
                'acton-fall-woods',
                4,
                false,
                15,
            ],
            [
                'Acton Memorial Library Hours',
                'general',
                "Acton Memorial Library is at 486 Main Street, next to Town Hall. The switchboard is (978) 929-6655.\n\nThe building is the civic living room of Acton Centre — stacks, study tables, children's room, and a regular programme calendar posted at the desk. If you have not been in since you moved here, start there.\n\nReturns can go in the outdoor slot when the building is closed. Museum passes, including the Discovery Museum, are reserved at the desk.",
                'acton-memorial-library',
                7,
                false,
                5,
            ],
            [
                "West Acton Citizens' Library",
                'general',
                "The West Acton Citizens' Library at 21 Windsor Avenue is the smaller, volunteer-rooted branch in the village — (978) 929-6654.\n\nIt is the right stop if you live west of the tracks and do not want to drive into Centre for a picture book or a hold. Hours are posted on the door and change with the volunteer roster, so check before you make a special trip.\n\nThe Little Free Library on the West Acton side is a good overflow if the branch is closed.",
                'west-acton-library',
                8,
                false,
                11,
            ],
            [
                'Cross-Acton Transit',
                'general',
                "The free Cross-Acton Transit bus runs Monday to Friday, 8:15 AM to 4:15 PM, and serves South Acton station, the Kelley's Corner / Route 2A corridor, and stops around town.\n\nIt is the useful option if the South Acton lot is full or you would rather not drive to a medical appointment on Mass Ave. Flag the bus at marked stops; the driver will wait if they see you coming.\n\nWeekend service is not offered. For Fitchburg Line trips outside those hours, plan on the station lot, a bicycle, or a lift.",
                'fitchburg-train',
                8,
                false,
                16,
            ],
            [
                'Recreation Office and 2026 Programmes',
                'general',
                "The Recreation Department sits at 50 Audubon Drive, Monday to Thursday 9:00 AM to 3:00 PM and Friday 9:00 AM to noon. Email recreation@actonma.gov.\n\nThey handle NARA beach memberships, field permits, and the town programme brochure. If you want a pavilion at NARA or a slot on the Great Hill athletic field for a larger group, start here rather than just showing up.\n\nAutumn and winter programme registration typically opens before the current season ends. Ask at the desk for the current brochure rather than trusting last year's dates.",
                'great-hill-field',
                9,
                false,
                22,
            ],
            [
                'Acton-Boxborough Farmers Market — Sundays through 11 October',
                'general',
                "The Acton-Boxborough Farmers Market runs Sundays, 10:00 AM to 1:00 PM, at Elm Street Playground, 19 Elm Street, through 11 October 2026. The season opened 14 June.\n\nLate squash, apples, cider, bread, and the cheese stall that sells out by eleven. The market takes SNAP/EBT with HIP matching, plus WIC and Senior FMNP coupons.\n\nBring a proper bag. Parking on Elm fills early; the walk from Acton Centre or the Bruce Freeman is nicer anyway.",
                'farm-stand',
                2,
                true,
                2,
            ],
            [
                'West Acton Oktoberfest — Saturday 26 September',
                'general',
                "The West Acton Village Merchants Association runs Oktoberfest on Gardner Field this Saturday, 26 September 2026, 10:00 AM to 3:00 PM. Rain date is 3 October.\n\nBeer garden, local food, visiting vendors, raffles, and plenty for the kids, at 530 Massachusetts Avenue. Village parking around 525 Mass Ave fills early; the free lot behind and beneath Villageworks is your best bet, entered from Mass Ave or from Spruce Street behind the old church.\n\nRSVP on the Events tab if you want to walk over with neighbours.",
                'east-acton-green',
                1,
                true,
                1,
            ],
            [
                'Select Board and Town Hall',
                'general',
                "Town Hall is at 472 Main Street in Acton Centre. The switchboard is (978) 929-6600.\n\nSelect Board meetings are posted on the town calendar — typically Monday evenings. Agendas go up in advance; public comment is taken on posted items. If you have never been, it is worth one evening just to see how the town actually runs.\n\nClerk, assessor, and health-department counters keep posted weekday hours. Do not assume a Saturday window.",
                'acton-town-hall',
                10,
                false,
                28,
            ],
            [
                'Acton Arboretum and Great Hill',
                'general',
                "The Acton Arboretum off Taylor Road is sixty-five acres of glacial esker, bog, and gardens, with an accessible loop if you want something flat and paved. Great Hill Conservation Land is the steeper option — woods, a pond that ices in a cold winter, and the athletic field at the bottom.\n\nBoth are dawn-to-dusk, dogs on lead, and genuinely good in the two weeks when the maples turn. Stay on the blazed trails; the side paths get wet and the ticks stay active through October.\n\nParking at both lots fills on weekend mornings in foliage season. Go early or go on a weekday.",
                'acton-wetlands',
                5,
                false,
                9,
            ],
            [
                'Bruce Freeman and Assabet Rail Trails',
                'general',
                "The Bruce Freeman Rail Trail crosses Acton on a paved, nearly flat alignment with a parking access behind Pedal Power at 176 Great Road. The Assabet River Rail Trail runs past South Acton station and is the useful commute-to-the-train option.\n\nBoth are town-scale infrastructure, not a subdivision path. Lights help after 5:30 once the evenings draw in. The Route 2A bridge deck can be slick after rain.\n\nPedal Power does tune-ups and has a public restroom during shop hours — (978) 263-3197.",
                'rail-trail-bridge',
                6,
                false,
                13,
            ],
            [
                'Discovery Museum and Theater III',
                'general',
                "The Discovery Museum at 177 Main Street (Route 27) is three floors of hands-on science plus the outdoor Discovery Woods treehouse. Bessie the dinosaur is out front. Four-tenths of a mile from South Acton station. Hours are typically Wednesday to Sunday, 9:00 AM to 4:30 PM — (978) 264-4200.\n\nTheater III, Acton's community theatre since the 1950s, is at 250 Central Street. Box office (978) 263-2668. A small house, staffed and staged by volunteers from around the Nashoba Valley.\n\nMemorial Library reserves museum passes at the desk, 486 Main Street.",
                'science-museum',
                11,
                false,
                19,
            ],
            [
                'Acton Food Pantry Collections',
                'general',
                "The Acton Food Pantry takes tinned goods, rice, pasta, peanut butter, and hygiene items year-round. Collection points rotate — watch this board and the barrels at Memorial Library and Town Hall.\n\nIf you can give, the weeks before Thanksgiving and the February school break are when the shelves run lowest. If you need to use the pantry, you do not need to explain yourself to anyone on this app.\n\nCash donations are accepted through the pantry's posted channels. Please do not leave bags of food on a porch overnight.",
                'acton-main-street',
                12,
                false,
                30,
            ],
            [
                'Nagog Pond Is a Public Water Supply',
                'general',
                "Nagog Pond is an active drinking-water reservoir. Swimming, wading, and dogs in the water are prohibited at the shoreline the west-side trails reach.\n\nHulls that go in must arrive clean and dry. Nothing goes in the water that has been in another lake without being washed down first — milfoil is one careless launch away.\n\nIf you want to swim, NARA Park at 25 Ledge Rock Way has a proper beach with a lifeguard from Memorial Day weekend through late August.",
                'skating-pond',
                13,
                false,
                17,
            ],
        ];

                foreach ($rows as [$title, $category, $body, $image, $daysAgo, $pinned, $scheduleOffset]) {
            $schedule = now()->startOfDay()->addDays($scheduleOffset);

            DB::table('notices')->updateOrInsert(
                ['community_id' => $this->cid, 'title' => $title],
                [
                    'author_id' => $this->adminId,
                    'category' => $category,
                    'body' => $body,
                    'image_url' => $this->img($image),
                    'event_date' => $schedule->toDateString(),
                    'event_time' => '09:00',
                    'event_time_end' => '17:00',
                    'is_pinned' => $pinned,
                    'status' => 'published',
                    'review_status' => 'approved',
                    'is_global' => false,
                    'approved_by' => $this->adminId,
                    'approved_at' => now()->subDays($daysAgo),
                    'published_at' => now()->subDays($daysAgo),
                    'updated_at' => now()->subDays($daysAgo),
                    'created_at' => now()->subDays($daysAgo),
                ]
            );
        }

        $this->command?->info('  Notices ready: '.count($rows));
    }

    /* ─────────────────────────── events ─────────────────────────── */

    private function seedEvents(): void
    {
        // [title, body, image, date, start, end, capacity, location, pinned]
        $rows = [
            [
                'West Acton Oktoberfest',
                "The West Acton Village Merchants Association runs Oktoberfest on Gardner Field this Saturday, 10:00 AM to 3:00 PM — beer garden, local food, visiting vendors, raffles, and plenty for the kids.\n\nRain date is Saturday 3 October. Village parking around 525 Massachusetts Avenue fills early; the free lot behind and beneath Villageworks is your best bet, entered from Mass Ave or from Spruce Street behind the old church.\n\nRSVP here if you would like to walk over as a group. We will meet at the East Acton Village Green end of Mass Ave at 9:40 and go the last stretch together.",
                'east-acton-green',
                '2026-09-26',
                '10:00',
                '15:00',
                220,
                'Gardner Field Playground, 530 Massachusetts Avenue, Acton',
                true,
            ],
            [
                'Acton-Boxborough Farmers Market — 27 September',
                "Sunday market at Elm Street Playground, 19 Elm Street, 10:00 AM to 1:00 PM. This is a remaining Sunday in the 2026 season, which runs 14 June through 11 October.\n\nLate squash, apples, cider, bread, and the cheese stall that sells out by eleven. SNAP/EBT with HIP matching, WIC and Senior FMNP coupons accepted.\n\nRSVP if you want to walk or carpool from Acton Centre. Bring a proper bag.",
                'farm-stand',
                '2026-09-27',
                '10:00',
                '13:00',
                180,
                'Elm Street Playground, 19 Elm Street, Acton',
                true,
            ],
            [
                'Acton-Boxborough Farmers Market — 4 October',
                "Sunday market at Elm Street Playground, 19 Elm Street, 10:00 AM to 1:00 PM — two weeks left in the 2026 season after this one.\n\nApples and cider are the reason to go now. The cheese stall still sells out by eleven. SNAP/EBT with HIP matching, WIC and Senior FMNP coupons accepted.\n\nIf you went last week, go again; the stalls rotate.",
                'farm-stand',
                '2026-10-04',
                '10:00',
                '13:00',
                180,
                'Elm Street Playground, 19 Elm Street, Acton',
                false,
            ],
            [
                'Acton-Boxborough Farmers Market: Closing Sunday',
                "Last market of the 2026 season, which opened 14 June. Elm Street Playground, 19 Elm Street, 10:00 AM to 1:00 PM.\n\nLate squash, apples, cider, bread, and whatever the farms still have in the ground. SNAP/EBT with HIP matching, WIC and Senior FMNP coupons accepted.\n\nAfter this Sunday the next local produce stop is Idylwilde on Central Street, closed Tuesdays.",
                'farm-stand',
                '2026-10-11',
                '10:00',
                '13:00',
                180,
                'Elm Street Playground, 19 Elm Street, Acton',
                true,
            ],
            [
                'Arboretum Foliage Walk',
                "A neighbour-led walk through the Acton Arboretum off Taylor Road — sixty-five acres of glacial esker, bog, and gardens, at a conversational pace with plenty of stops.\n\nThe accessible paved loop is the default; anyone who wants the dirt paths can peel off and rejoin at the bog boardwalk. Boots rather than trainers if it has rained.\n\nDogs on leads. Meet at the Taylor Road lot. This is not a town-staffed programme — just neighbours who would rather walk together than alone.",
                'acton-wetlands',
                '2026-10-03',
                '09:30',
                '11:30',
                40,
                'Acton Arboretum, Taylor Road, Acton',
                false,
            ],
            [
                'West Acton Coffee Before the Market',
                "Meet at Acton Coffee House, 525 Massachusetts Avenue, before the Sunday market. Organically grown, fairly traded coffee roasted in Massachusetts, and a patio that takes dogs.\n\nWe will walk or drive over to Elm Street Playground around 10:00. If you only want coffee, come anyway.\n\nThe house number for the shop is (978) 263-3700. Parking behind Villageworks.",
                'acton-main-street',
                '2026-10-04',
                '08:45',
                '09:50',
                24,
                'Acton Coffee House, 525 Massachusetts Avenue, Acton',
                false,
            ],
            [
                'Great Hill Conservation Walk',
                "Neighbour-led loop on Great Hill — woods, the pond overlook, and back down past the athletic field. About two miles at a conversational pace.\n\nThe maples on the west slope are the reason to go this week. One wet crossing; boots rather than trainers. Dogs on leads. Ticks are still active, so treat socks.\n\nMeet at the Great Hill parking area. Not a town-staffed hike.",
                'great-hill-trail',
                '2026-10-10',
                '09:00',
                '11:00',
                36,
                'Great Hill Conservation Land, Acton',
                false,
            ],
            [
                'NARA Autumn Park Walk',
                "An easy loop around NARA Park after the beach season — playgrounds, the amphitheatre, the Miracle Field, and the woods at the back of the forty acres.\n\nDawn-to-dusk park, 25 Ledge Rock Way. Strollers are fine on the main paths. The pond is not a swimming beach after late August.\n\nMeet at the main lot. Bring a snack if you have kids; there is no concession once the beach closes.",
                'acton-fall-woods',
                '2026-10-10',
                '14:00',
                '15:30',
                50,
                'NARA Park, 25 Ledge Rock Way, Acton',
                false,
            ],
            [
                'Bruce Freeman Saturday Ride',
                "An easy Saturday ride on the Bruce Freeman from the Pedal Power access at 176 Great Road, out through Concord and back at a chatty pace.\n\nPavement is clear this time of year and the trail is quiet before ten. Lights are useful in the underpasses. We will wait at the Route 2A bridge for anyone rolling up late.\n\nLoaner-rack space at Pedal Power if you need a once-over before we roll — (978) 263-3197.",
                'rail-trail-bridge',
                '2026-10-17',
                '08:30',
                '11:00',
                28,
                'Bruce Freeman trail access, 176 Great Road, Acton',
                false,
            ],
            [
                'Assabet Trail to the Station',
                "A short neighbour ride or walk along the Assabet River Rail Trail to South Acton station and back — useful if you have been meaning to try commuting by bike.\n\nThe trail runs right past 10 Central Street. One hundred bicycle spaces at the station if you want to lock up and ride the Fitchburg Line in afterwards.\n\nMeet at the South Acton station bike racks. Helmets, lights, and a lock.",
                'assabet-rail-trail',
                '2026-10-18',
                '09:00',
                '10:30',
                24,
                'South Acton Station, 10 Central Street, Acton',
                false,
            ],
            [
                'Family Morning at the Discovery Museum',
                "Neighbours meeting at the Discovery Museum, 177 Main Street — three floors of hands-on exhibits plus Discovery Woods. Bessie the dinosaur is out front.\n\nThis is a group visit, not a private booking. Buy your own tickets at the desk or use a Memorial Library museum pass. The building is typically open Wednesday to Sunday, 9:00 AM to 4:30 PM — (978) 264-4200.\n\nFour-tenths of a mile from South Acton station if you would rather come by train. RSVP so we know how many picnic tables to claim out back.",
                'science-museum',
                '2026-10-24',
                '10:00',
                '13:00',
                45,
                'Discovery Museum, 177 Main Street, Acton',
                false,
            ],
            [
                'Nashoba Brook Afternoon Walk',
                "A slow walk along Nashoba Brook — water, stone walls, and the kind of autumn light that makes you stay out twenty minutes longer than you meant to.\n\nWet in places after rain. Boots. Dogs on leads. This is conservation land, not a playground, so keep to the path.\n\nMeet at the Nashoba Brook trailhead. We will be back in about ninety minutes.",
                'nashoba-brook',
                '2026-10-25',
                '14:00',
                '15:30',
                30,
                'Nashoba Brook Conservation Land, Acton',
                false,
            ],
            [
                'Acton Centre Saturday Stroll',
                "An easy Saturday in Acton Centre: Town Hall, Memorial Library, the firehouse, and Main Street, at walking pace with no agenda beyond looking at the town you live in.\n\nMeet on the Town Hall lawn, 472 Main Street. We will cut through to the library and finish at Main Street. Strollers fine.\n\nIf the library is open, go in — 486 Main Street, (978) 929-6655.",
                'acton-main-street',
                '2026-10-31',
                '10:00',
                '11:30',
                40,
                'Acton Town Hall, 472 Main Street, Acton',
                false,
            ],
            [
                'Faulkner Homestead Grounds Walk',
                "A neighbour walk around the Faulkner Homestead grounds — one of the oldest houses in Acton, and the reason Centre looks the way it does.\n\nThis is a grounds walk, not a private interior tour. Stay on the public paths and treat the building as someone's care, not a backdrop.\n\nMeet at the homestead. Pair it with the library if you want a longer morning.",
                'faulkner-homestead',
                '2026-11-07',
                '10:30',
                '12:00',
                32,
                'Faulkner Homestead, Acton Centre',
                false,
            ],
            [
                'Line of March of the Acton Minutemen',
                "A historical walk along the Line of March — the route Acton's militia took toward Concord in April 1775.\n\nConversational pace, a few stops, and no costumes required. This is neighbours walking a real road, not a re-enactment.\n\nMeet at the Minutemen marker. Wear something you can walk two miles in.",
                'acton-minutemen',
                '2026-11-08',
                '09:30',
                '11:30',
                36,
                'Line of March marker, Acton',
                false,
            ],
            [
                'Theater III Neighbour Night',
                "A block of seats at Theater III, 250 Central Street — Acton's community theatre, running since the 1950s. Small house, volunteers from around the Nashoba Valley, and you can actually hear everything.\n\nBuy your own tickets through the box office, (978) 263-2668, and RSVP here so we can sit together. A few of us will eat at Twin Seafood on Massachusetts Avenue beforehand — (978) 635-0010 — say the word and we will book a bigger table.\n\nThis is a neighbour outing, not a town-sponsored performance.",
                'theater-stage',
                '2026-11-13',
                '19:30',
                '22:00',
                28,
                'Theater III, 250 Central Street, Acton',
                false,
            ],
            [
                'Food Pantry Collection at Town Hall',
                "Drop tinned goods, rice, pasta, peanut butter, and hygiene items at Town Hall, 472 Main Street, for the Acton Food Pantry.\n\nThe weeks before Thanksgiving are when the shelves run lowest. If you can give, come by in the morning window. If you need the pantry, you do not need to RSVP or explain yourself.\n\nTown Hall switchboard: (978) 929-6600.",
                'acton-town-hall',
                '2026-11-21',
                '09:00',
                '12:00',
                80,
                'Acton Town Hall, 472 Main Street, Acton',
                true,
            ],
            [
                'Great Hill Skating Pond — Ice Check',
                "A neighbour meet at the Great Hill skating pond to see whether the ice is in. Do not go on the ice unless it has been checked and posted — this RSVP is a walk to the shore, not a skate night.\n\nDress for a still, cold afternoon. The field parking is the usual lot. Thermos optional and encouraged.\n\nIf the ice is in later in the month we will post a second, separate skate.",
                'skating-pond',
                '2026-12-12',
                '14:00',
                '15:30',
                40,
                'Great Hill Skating Pond, Acton',
                false,
            ],
            [
                'Memorial Library Saturday Morning',
                "Neighbours at Acton Memorial Library, 486 Main Street — stacks, the children's room, and coffee afterwards on Main Street.\n\nThis is not a library programme. Come read, come browse, come return the stack you have been meaning to bring back. Switchboard (978) 929-6655.\n\nMeet just inside the Main Street doors. Kids welcome.",
                'acton-memorial-library',
                '2026-10-17',
                '10:00',
                '11:30',
                30,
                'Acton Memorial Library, 486 Main Street, Acton',
                false,
            ],
        ];

                foreach ($rows as [$title, $body, $image, $date, $start, $end, $capacity, $location, $pinned]) {
            DB::table('notices')->updateOrInsert(
                ['community_id' => $this->cid, 'title' => $title],
                [
                    'author_id' => $this->adminId,
                    'category' => 'event',
                    'body' => $body,
                    'location' => $location,
                    'image_url' => $this->img($image),
                    'event_date' => $date,
                    'event_time' => $start,
                    'event_time_end' => $end,
                    'event_capacity' => $capacity,
                    'requires_rsvp' => true,
                    'is_pinned' => $pinned,
                    'status' => 'published',
                    'review_status' => 'approved',
                    'is_global' => false,
                    'approved_by' => $this->adminId,
                    'approved_at' => now()->subDays(4),
                    'published_at' => now()->subDays(4),
                    'updated_at' => now()->subDays(4),
                    'created_at' => now()->subDays(4),
                ]
            );
        }

        $this->seedRsvps(array_column($rows, 0));

        $this->command?->info('  Events ready: '.count($rows));
    }

    /** @param list<string> $titles */
    private function seedRsvps(array $titles): void
    {
        $residents = $this->approvedResidentIds();
        if ($residents === []) {
            return;
        }

        $pattern = ['going', 'going', 'going', 'maybe', 'going', 'not_going', 'going', 'going', 'maybe', 'going', 'going', 'maybe'];

        foreach ($titles as $eventIndex => $title) {
            $noticeId = DB::table('notices')
                ->where('community_id', $this->cid)
                ->where('title', $title)
                ->value('id');

            if (! $noticeId) {
                continue;
            }

            foreach ($residents as $index => $userId) {
                DB::table('event_rsvps')->updateOrInsert(
                    ['notice_id' => $noticeId, 'user_id' => $userId],
                    [
                        'status' => $pattern[($index + $eventIndex) % count($pattern)],
                        'updated_at' => now(),
                        'created_at' => now()->subDays(($index % 3) + 1),
                    ]
                );
            }
        }
    }

    private function seedAlert(): void
    {
        DB::table('notices')->updateOrInsert(
            ['community_id' => $this->cid, 'title' => 'High Wind Warning: Nor\'easter Thursday Night'],
            [
                'author_id' => $this->adminId,
                'category' => 'emergency',
                'body' => "A high wind warning is in effect for Middlesex County from Thursday evening through Friday morning, with gusts forecast to 55 mph and two to three inches of rain. Leaves are still on the trees, which is what turns a wind event into an outage event.\n\nBefore Thursday afternoon: bring in deck furniture, grills, planters, and anything on a balcony rail; charge phones and any medical-equipment batteries; and do not park under the large roadside oaks if you have anywhere else to put the car.\n\nEversource outages should be reported directly to them — the town cannot see your meter. Town Hall will post here if a warming or charging space opens after a long outage: (978) 929-6600.\n\nIf a limb comes down on a town way, photograph it, keep clear, and tell the town. Do not go near anything touching a wire.",
                'image_url' => $this->img('noreaster-storm'),
                'status' => 'published',
                'review_status' => 'approved',
                'is_global' => false,
                'is_pinned' => true,
                'approved_by' => $this->adminId,
                'approved_at' => now()->subHours(9),
                'published_at' => now()->subHours(9),
                'updated_at' => now()->subHours(9),
                'created_at' => now()->subHours(9),
            ]
        );
    }

    /* ─────────────────────────── feed ─────────────────────────── */

    private function seedFeed(): void
    {
        // [email, category, body, image, daysAgo]
        $posts = [
            [
                ActonCommunitySeeder::RESIDENT_EMAIL,
                'general',
                "The maples on Great Hill turned over the weekend and the pond overlook is about as good as it gets right now. If you have been meaning to walk that loop this autumn, this is the week.",
                'autumn-foliage',
                0,
            ],
            [
                'linda.nagog@havena.app',
                'event',
                "Foliage walk is on for Saturday the 10th, 9:00 from the Great Hill lot. About two miles, plenty of stops, and I promise to talk about buckthorn for no more than four minutes. Boots — there is one wet crossing.",
                'great-hill-trail',
                1,
            ],
            [
                'tom.nagog@havena.app',
                'general',
                "Rode the Bruce Freeman from the Route 2A bridge down through Concord and back this morning. Pavement is clear, the bridge deck was dry, and there is almost nobody on it before eight. Happy to have company at a chatty pace next Saturday.",
                'rail-trail-bridge',
                1,
            ],
            [
                'kavita.nagog@havena.app',
                'general',
                "Idylwilde on Central Street has the cider doughnuts out. They are in their hundredth year as a family business and I would like it on record that I have personally funded a meaningful share of that. Closed Tuesdays, open eight to seven the rest of the week.",
                'cider-donuts',
                2,
            ],
            [
                'michael.nagog@havena.app',
                'announcement',
                "Snow-shovel call list is open for the season. If you cannot clear your own walk — surgery, a bad back, travelling for work, whatever the reason — message me and you go on the list. No charge, no fuss, and you do not need to explain yourself. We have eleven households on it so far and six of us with shovels.",
                'amenity-winter-lot',
                2,
            ],
            [
                'weilin.nagog@havena.app',
                'event',
                "Pickup soccer at the Great Hill athletic field Saturday at nine if anyone wants in. Cleats, no lights, and we will be off the grass before the next group shows up. All standards, including people who have not played since high school.",
                'great-hill-field',
                3,
            ],
            [
                'grace.nagog@havena.app',
                'help',
                "Does anyone have a plumber they actually trust in Acton? Slow drain in the downstairs bath and I would rather not be the person who finds out the hard way how a 1920s stack is joined together.",
                'notice-maintenance',
                3,
            ],
            [
                'patrick.nagog@havena.app',
                'update',
                "Following up on Grace's question — whoever you call, ask whether they have worked on older Acton houses, not just the new construction off 2A. Half the outfits quote for PVC and then discover the stack on the day.",
                'amenity-woodshop',
                2,
            ],
            [
                'meera.nagog@havena.app',
                'event',
                "Oktoberfest is Saturday on Gardner Field, 10 to 3. I am walking over from the Villageworks lot at 9:40 if anyone wants company. Rain date is the 3rd of October.",
                'east-acton-green',
                1,
            ],
            [
                'yuki.nagog@havena.app',
                'general',
                "I have a stack of leftover build-a-bridge kits from the Discovery Museum. If anyone wants to make an enormous mess at a kitchen table some rainy Saturday, I have about twenty sets and no shelf space.",
                'science-museum',
                4,
            ],
            [
                'rosa.nagog@havena.app',
                'general',
                "Pulled the last of the tomatoes and there is a crate of green ones I will leave at the Elm Street market Sunday if anyone wants them. They ripen on a windowsill in a week, and they make excellent chutney if you cannot wait.",
                'farm-stand',
                5,
            ],
            [
                'daniel.nagog@havena.app',
                'event',
                "A few of us are going to Theater III on the 13th, 250 Central Street. Company has been going since the fifties and the house is small enough that you can actually hear everything. Buy your own ticket — (978) 263-2668 — and RSVP on the event so we can sit together. Twin Seafood beforehand if you want supper.",
                'theater-stage',
                5,
            ],
            [
                ActonCommunitySeeder::ADMIN_EMAIL,
                'announcement',
                "Transfer Station reminder before the weekend: 193 Massachusetts Avenue, Tuesday to Saturday 7:00 to 3:00, closed Sunday and Monday. SMART orange bags for trash, recycling is free, sticker or per-trip fee at the gate. (978) 929-7742 if you are unsure what they will take.",
                'acton-plaza',
                6,
            ],
            [
                'michael.nagog@havena.app',
                'update',
                "Storm drain at the low corner near Nashoba Brook was blocked with leaves again this morning. Cleared it, but that is the third time this month. Please rake to the lawn edge, not into the street — the town is responsible for what reaches the brook.",
                'leaf-collection',
                6,
            ],
            [
                ActonCommunitySeeder::RESIDENT_EMAIL,
                'general',
                "Heads up that the Fitchburg timetable can shift without much warning and several morning inbounds from South Acton have moved by five to ten minutes before. I found out the hard way. The lot at 10 Central Street was full by 7:25 today, so give yourself the extra few minutes or ride down the Assabet trail.",
                'fitchburg-train',
                7,
            ],
            [
                'grace.nagog@havena.app',
                'general',
                "Someone left a very good pair of gardening gloves and a trowel on the bench by Elm Street Playground. They are on the shelf inside the West Acton library now. Also a child's blue fleece, size six-ish, which has been there a fortnight.",
                'west-acton-library',
                8,
            ],
            [
                'kavita.nagog@havena.app',
                'general',
                "Silver Unicorn on Spruce Street has the new releases in and the owner will order anything they do not have, usually in two days. It is Acton's only independent bookshop and worth walking into rather than tapping a button. (978) 274-2757.",
                'feed-books',
                9,
            ],
            [
                'tom.nagog@havena.app',
                'help',
                "Anyone know what the deal is with the wild turkeys on the Great Hill access road? There were nine of them blocking the lane this morning and one of them looked me directly in the eye. I reversed. I am not proud of it.",
                'acton-wetlands',
                10,
            ],
            [
                'linda.nagog@havena.app',
                'general',
                "The Arboretum bog boardwalk is dry enough this week and the winterberry is starting. If you want something flat and paved rather than Great Hill, this is the better walk. Taylor Road lot fills by ten on Saturdays.",
                'acton-wetlands',
                4,
            ],
            [
                'weilin.nagog@havena.app',
                'general',
                "Pedal Power behind the Bruce Freeman access has Saturday morning tune-up slots again. Get it done before the salt goes down. 176 Great Road, (978) 263-3197.",
                'business-bike',
                8,
            ],
        ];

                foreach ($posts as [$email, $category, $body, $image, $daysAgo]) {
            $userId = $this->uid($email);
            if (! $userId) {
                continue;
            }

            $at = now()->subDays($daysAgo)->subMinutes(($daysAgo + 1) * 23);

            DB::table('posts')->updateOrInsert(
                ['community_id' => $this->cid, 'user_id' => $userId, 'body' => $body],
                [
                    'category' => $category,
                    'image_url' => $this->img($image),
                    'status' => 'approved',
                    'approved_at' => $at,
                    'likes_count' => 0,
                    'comments_count' => 0,
                    'updated_at' => $at,
                    'created_at' => $at,
                ]
            );
        }

        $this->seedComments();
        $this->recountEngagement();

        $this->command?->info('  Feed posts ready: '.count($posts));
    }

    private function seedComments(): void
    {
        $groups = [
            'The maples on Great Hill turned over the weekend%' => [
                ['linda.nagog@havena.app', 'The overlook peaks about now every year. Come Saturday and I will show you the wet crossing before you find it the hard way.'],
                ['tom.nagog@havena.app', 'Walked it at dusk yesterday. Worth it even in the last of the light.'],
                ['yuki.nagog@havena.app', 'Took the kids up after school. They have decided the pond is haunted, which is fine by me.'],
            ],
            'Foliage walk is on for Saturday the 10th%' => [
                [ActonCommunitySeeder::RESIDENT_EMAIL, 'In. Four minutes of buckthorn is a bargain for that view.'],
                ['meera.nagog@havena.app', 'Bringing both kids. Is the wet crossing manageable for a seven-year-old?'],
                ['linda.nagog@havena.app', 'Very — there are stepping stones. Boots not wellies and she will be fine.'],
            ],
            'Rode the Bruce Freeman from the Route 2A bridge%' => [
                ['weilin.nagog@havena.app', 'I would join but I have soccer at Great Hill that morning. Next week?'],
                [ActonCommunitySeeder::RESIDENT_EMAIL, 'Chatty pace is my only pace. Count me in for Saturday.'],
            ],
            'Idylwilde on Central Street has the cider doughnuts out%' => [
                ['rosa.nagog@havena.app', 'Their produce buying is genuinely better than anywhere else in town. I source half my catering there.'],
                ['daniel.nagog@havena.app', 'Closed Tuesdays is a fact I relearn every single autumn.'],
                ['grace.nagog@havena.app', 'Picked some up on the way home from a night shift. Correct decision.'],
            ],
            'Snow-shovel call list is open for the season%' => [
                ['grace.nagog@havena.app', 'Michael, you are the reason I could keep working nights through last February. Thank you.'],
                ['patrick.nagog@havena.app', 'Put me down with a shovel. I am slower than I was but I still turn up.'],
                ['linda.nagog@havena.app', 'Sharing this with two households on my street who are not on the app yet.'],
                [ActonCommunitySeeder::ADMIN_EMAIL, 'Town Hall will post if a warming centre opens after a long outage. Keep Michael\'s list anyway — the town cannot shovel every walk.'],
            ],
            'Pickup soccer at the Great Hill athletic field%' => [
                [ActonCommunitySeeder::RESIDENT_EMAIL, 'In, and I will pretend I remember how to pass.'],
                ['kavita.nagog@havena.app', 'Coming to watch, not to play. Someone has to hold the water bottles.'],
                ['tom.nagog@havena.app', 'I have a bag of balls in the boot. Probably fine.'],
            ],
            'Does anyone have a plumber they actually trust%' => [
                ['patrick.nagog@havena.app', 'Ask whoever you call whether they have worked on older Acton houses. If they hesitate, call someone else.'],
                ['michael.nagog@havena.app', 'Two outfits I have used on South Acton houses are on the vendor list in Documents.'],
                [ActonCommunitySeeder::ADMIN_EMAIL, 'Vendor list is in the Documents tab under Forms, Grace. Both are local.'],
            ],
            'Following up on Grace%' => [
                ['grace.nagog@havena.app', 'Noted. And I have never pressure-washed anything in my life, for the record.'],
                ['linda.nagog@havena.app', 'Patrick is right and this should honestly be in the welcome notice.'],
            ],
            'Oktoberfest is Saturday on Gardner Field%' => [
                [ActonCommunitySeeder::RESIDENT_EMAIL, 'Walking from Villageworks with you. 9:40.'],
                ['rosa.nagog@havena.app', 'I will be on the food side from ten. Come say hello.'],
                ['daniel.nagog@havena.app', 'Rain date is the 3rd if Saturday goes sideways.'],
            ],
            'I have a stack of leftover build-a-bridge kits%' => [
                ['kavita.nagog@havena.app', 'Yes. Name a rainy Saturday and I will bring both of mine and a flask of coffee.'],
                ['meera.nagog@havena.app', 'Mine too. This is a much better plan than another afternoon of screens.'],
            ],
            'Pulled the last of the tomatoes%' => [
                ['linda.nagog@havena.app', 'I will take four green ones at the market. Thank you, Rosa.'],
                ['yuki.nagog@havena.app', 'Chutney recipe, please. I have never made it and I now have six tomatoes.'],
            ],
            'A few of us are going to Theater III%' => [
                ['grace.nagog@havena.app', 'Two for me if any seats are left in the block. Off shift that night for once.'],
                ['kavita.nagog@havena.app', 'In for supper at Twin Seafood beforehand. Their lobster roll is the best thing on Mass Ave.'],
            ],
            'Transfer Station reminder before the weekend%' => [
                ['patrick.nagog@havena.app', 'The orange bags at Idylwilde are usually in stock. Do not show up with supermarket whites.'],
                ['michael.nagog@havena.app', 'Closed Sunday and Monday is the one people forget every single week.'],
            ],
            'Storm drain at the low corner near Nashoba Brook%' => [
                ['linda.nagog@havena.app', 'Thank you for clearing it. I will mention it at the next conservation walk.'],
                [ActonCommunitySeeder::ADMIN_EMAIL, 'Logged with the town. Keep raking to the lawn edge, please.'],
            ],
            'Heads up that the Fitchburg timetable can shift%' => [
                ['weilin.nagog@havena.app', 'This bit me last time they adjusted. Now I check the app on the Sunday night.'],
                ['tom.nagog@havena.app', 'Or ride down the Assabet trail and skip the parking entirely.'],
                ['daniel.nagog@havena.app', 'The Cross-Acton bus serves the station too, and it is free. Eight fifteen to four fifteen, weekdays.'],
            ],
            'Someone left a very good pair of gardening gloves%' => [
                ['rosa.nagog@havena.app', 'The trowel is mine. Collecting it with appropriate embarrassment.'],
            ],
            'Silver Unicorn on Spruce Street has the new releases in%' => [
                ['daniel.nagog@havena.app', 'They ordered a score for me in two days flat. Genuinely good shop.'],
                ['yuki.nagog@havena.app', 'Their children\'s section is better than anything at the mall.'],
            ],
            'Anyone know what the deal is with the wild turkeys%' => [
                ['michael.nagog@havena.app', 'Reversing was the correct call. They have been on that lane for years and they are not moving for you.'],
                ['patrick.nagog@havena.app', 'One of them went after my wing mirror in the spring. I am with Tom.'],
                ['grace.nagog@havena.app', 'Nine is a lot of turkey. I would also have reversed.'],
            ],
            'The Arboretum bog boardwalk is dry enough this week%' => [
                [ActonCommunitySeeder::RESIDENT_EMAIL, 'This is the right walk if Great Hill feels like a bit much with kids.'],
                ['yuki.nagog@havena.app', 'Winterberry is the whole reason we go in October.'],
            ],
            'Pedal Power behind the Bruce Freeman access%' => [
                ['tom.nagog@havena.app', 'Booked for Saturday. Get there when they open or you wait.'],
            ],
        ];

        foreach ($groups as $like => $comments) {
            $postId = DB::table('posts')
                ->where('community_id', $this->cid)
                ->where('body', 'like', $like)
                ->value('id');

            if (! $postId) {
                continue;
            }

            $hours = 2;
            foreach ($comments as [$email, $body]) {
                $userId = $this->uid($email);
                if (! $userId) {
                    continue;
                }

                DB::table('post_comments')->updateOrInsert(
                    ['post_id' => $postId, 'user_id' => $userId, 'body' => $body],
                    [
                        'updated_at' => now()->subHours($hours),
                        'created_at' => now()->subHours($hours),
                    ]
                );
                $hours += 4;
            }
        }
    }

    private function recountEngagement(): void
    {
        $residents = $this->approvedResidentIds();
        $postIds = DB::table('posts')
            ->where('community_id', $this->cid)
            ->whereNull('deleted_at')
            ->orderBy('id')
            ->pluck('id');

        foreach ($postIds as $index => $postId) {
            $take = 4 + ($index % 8);
            foreach (array_slice($residents, 0, $take) as $userId) {
                DB::table('post_likes')->updateOrInsert(
                    ['user_id' => $userId, 'post_id' => $postId],
                    []
                );
            }
        }

        foreach ($postIds as $postId) {
            DB::table('posts')->where('id', $postId)->update([
                'likes_count' => DB::table('post_likes')->where('post_id', $postId)->count(),
                'comments_count' => DB::table('post_comments')
                    ->where('post_id', $postId)
                    ->whereNull('deleted_at')
                    ->count(),
            ]);
        }
    }

    /* ─────────────────────────── marketplace ─────────────────────────── */

    private function seedListings(): void
    {
        // [email, type, category, condition, title, price, description, images, daysAgo]
        $rows = [
            [
                'patrick.nagog@havena.app',
                'service',
                'Services',
                null,
                'Carpentry and Small Interior Jobs',
                65.00,
                "Semi-retired carpenter in South Acton. Trim, decks, shelves, and the small interior jobs the big outfits will not come out for. Hourly, materials at cost, and I will tell you honestly if a job does not need doing.",
                ['amenity-woodshop'],
                4,
            ],
            [
                'rosa.nagog@havena.app',
                'service',
                'Food & Catering',
                null,
                'Small-Event Catering (Acton & Concord)',
                225.00,
                "Drop-off catering for showers, memorials, and backyard parties — twenty to sixty covers. Produce from Idylwilde, fish from Twin Seafood. Neighbour rate below, vegetarian and nut-free menus as standard rather than an afterthought.",
                ['chili-pot'],
                6,
            ],
            [
                'daniel.nagog@havena.app',
                'service',
                'Lessons',
                null,
                'Cello and Violin Lessons (Beginner to Grade 8)',
                45.00,
                "I teach orchestra at Acton-Boxborough and take a small number of private students at home in West Acton. Half-hour and hour slots after school and Saturday mornings. First lesson free so we can see whether we get on.",
                ['theater-stage'],
                8,
            ],
            [
                'weilin.nagog@havena.app',
                'for_sale',
                'Sports',
                'Like new',
                'Two Tennis Racquets and a Ball Hopper',
                85.00,
                "Wilson Clash 100 and a Babolat Pure Drive, both restrung this spring, plus a wire hopper and about forty balls. Upgrading, not giving up. Collect in West Acton.",
                ['amenity-tennis'],
                3,
            ],
            [
                'tom.nagog@havena.app',
                'for_sale',
                'Sports',
                'Good',
                'Trek Hybrid Bike with Rear Rack and Panniers',
                240.00,
                "Trek FX 3, medium frame, tuned in August with new tyres and brake pads. Rack and a pair of Ortlieb panniers included — it has done a lot of Bruce Freeman miles and has the scuffs to show it. Collect near South Acton station.",
                ['listing-bike'],
                5,
            ],
            [
                'yuki.nagog@havena.app',
                'for_sale',
                'Baby & Kids',
                'Good',
                'Kids Snow Gear Bundle, Ages 5–8',
                55.00,
                "Two snowsuits, three pairs of mittens, a pair of Bogs in size 12, and a helmet. All clean, all outgrown before it wore out. Someone is going to need this in about six weeks.",
                ['amenity-winter-lot'],
                2,
            ],
            [
                'linda.nagog@havena.app',
                'for_sale',
                'Home & Garden',
                'New',
                'Native Perennial Divisions — Bee Balm, Coneflower, Aster',
                12.00,
                "Divisions from my own beds, potted up and labelled. All native, all good for pollinators, all happy in dry New England shade. Twelve dollars a pot or three for thirty, and the money goes to the Arboretum.",
                ['acton-wetlands'],
                7,
            ],
            [
                'michael.nagog@havena.app',
                'for_sale',
                'Tools',
                'Good',
                'Two-Stage Snow Blower, 24 inch',
                380.00,
                "Ariens 24-inch two-stage, serviced every autumn, starts first pull. Selling because I have moved to a smaller machine, not because this one is tired. It will handle the end-of-driveway berm the plow leaves you.",
                ['amenity-winter-lot'],
                9,
            ],
            [
                'grace.nagog@havena.app',
                'wanted',
                'Home & Garden',
                null,
                'Wanted: Blackout Curtains for a Night-Shift Bedroom',
                null,
                "Looking for proper blackout curtains or a blackout blind, any neutral colour, to fit a window about 90cm wide. Working nights and the morning light on the east side of town is relentless. Happy to pay or to trade a batch of baking.",
                [],
                1,
            ],
            [
                'kavita.nagog@havena.app',
                'for_sale',
                'Furniture',
                'Like new',
                'Solid Oak Dining Table, Seats Six',
                320.00,
                "Round oak table, 120cm, with a leaf that takes it to eight. Two small marks on the top that a coaster hides. It is heavy — bring a second pair of hands. Collect in West Acton Village.",
                ['listing-desk'],
                11,
            ],
            [
                'meera.nagog@havena.app',
                'for_sale',
                'Home & Garden',
                'Good',
                'Kids Wagon and a Folding Picnic Blanket',
                35.00,
                "Radio Flyer-style wagon and a decent picnic blanket, both used at NARA and the farmers market all summer. Wagon pulls straight. Collect in Acton Centre.",
                ['east-acton-green'],
                3,
            ],
            [
                'tom.nagog@havena.app',
                'for_sale',
                'Sports',
                'Like new',
                "Ice Skates, Men's 10 and Women's 8",
                40.00,
                "Two pairs, sharpened last winter, barely used. Waiting on the Great Hill pond to freeze properly. Take them now and you will be ready when it does.",
                ['skating-pond'],
                12,
            ],
        ];
        foreach ($rows as [$email, $type, $category, $condition, $title, $price, $description, $images, $daysAgo]) {
            $userId = $this->uid($email);
            if (! $userId) {
                continue;
            }

            DB::table('listings')->updateOrInsert(
                ['community_id' => $this->cid, 'user_id' => $userId, 'title' => $title],
                [
                    'type' => $type,
                    'category' => $category,
                    'condition' => $condition,
                    'price' => $price,
                    'description' => $description,
                    'location' => 'Acton, MA',
                    'images' => json_encode(array_map(fn ($key) => $this->img($key), $images)),
                    'status' => 'approved',
                    'is_verified' => true,
                    'approved_at' => now()->subDays($daysAgo),
                    'updated_at' => now()->subDays($daysAgo),
                    'created_at' => now()->subDays($daysAgo),
                ]
            );
        }

        $this->command?->info('  Listings ready: '.count($rows));
    }

    /* ─────────────────── local businesses and deals ─────────────────── */

    private function seedBusinessesAndDeals(): void
    {
        $hasWebsite = Schema::hasColumn('businesses', 'website');

        $shops = [
            [
                'name' => 'Acton Coffee House',
                'category' => 'Cafe',
                'description' => 'A family-owned coffee house in West Acton Village, trading since 2011, pouring organically grown and fairly traded coffee roasted here in Massachusetts. A genuine meeting place rather than a chain with sofas — and a patio that takes dogs.',
                'address' => '525 Massachusetts Avenue, Acton, MA 01720',
                'phone' => '(978) 263-3700',
                'hours' => 'Mon–Fri 7:00 AM – 4:30 PM · Sat 7:00 AM – 5:00 PM · Sun 7:30 AM – 4:30 PM',
                'amenities' => 'Fair-trade coffee, Outdoor seating, Dog friendly, Free WiFi',
                'website' => 'https://www.actoncoffee.com/',
                'image' => 'business-cafe',
                'owner' => 'kavita.nagog@havena.app',
                'deal' => [
                    'title' => 'Neighbour Rate: 20% Off Any Pour-Over',
                    'description' => 'Show this in the shop for twenty percent off any pour-over or cold brew. One per visit, all day, every day.',
                    'type' => 'coupon',
                    'label' => '20% OFF',
                    'original' => 5.25,
                    'discounted' => 4.20,
                    'promo' => 'ACTON20',
                    'image' => 'deal-coffee',
                    'endDays' => 45,
                ],
            ],
            [
                'name' => 'Idylwilde Farm',
                'category' => 'Grocery & Farm Market',
                'description' => 'A hundred-year-old family market on Central Street, run by the fourth generation of the Napoli family from the post-and-beam building they put up in 1983. Produce is hand-picked, hand-trimmed and hand-packed, and it lasts noticeably longer than the supermarket equivalent. Closed Tuesdays.',
                'address' => '366 Central Street, Acton, MA 01720',
                'phone' => '(978) 263-5943',
                'hours' => 'Wed–Mon 8:00 AM – 7:00 PM · Closed Tuesdays',
                'amenities' => 'Local produce, Prepared foods, Holiday catering, Specialty grocery',
                'website' => 'https://idylwildefarm.com/',
                'image' => 'farm-stand',
                'owner' => 'rosa.nagog@havena.app',
                'deal' => [
                    'title' => 'Half Dozen Cider Doughnuts, $2 Off',
                    'description' => 'Two dollars off a half dozen cider doughnuts through the autumn. They come out warm mid-morning and they do not last.',
                    'type' => 'deal',
                    'label' => '$2 OFF',
                    'original' => 9.50,
                    'discounted' => 7.50,
                    'image' => 'cider-donuts',
                    'featured' => true,
                    'endDays' => 40,
                ],
            ],
            [
                'name' => 'True West Brewery',
                'category' => 'Brewpub',
                'description' => 'West Acton\'s brewpub, in the Villageworks building on Massachusetts Avenue. Small-batch beer brewed on site, a proper kitchen rather than an afterthought, and bicycle parking directly outside the front doors. Free parking behind and beneath Villageworks.',
                'address' => '525 Massachusetts Avenue, Acton, MA 01720',
                'phone' => '(978) 206-1600',
                'hours' => 'Tue–Thu 4:00 PM – 10:00 PM · Fri–Sat 12:00 PM – 11:00 PM · Sun 12:00 PM – 9:00 PM',
                'amenities' => 'Brewed on site, Full kitchen, Bike parking, Takeaway cans',
                'website' => 'https://www.brewtruewest.com/',
                'image' => 'taproom',
                'owner' => 'tom.nagog@havena.app',
                'deal' => [
                    'title' => 'Oktoberfest Weekend: Flight and a Pretzel, $12',
                    'description' => 'Four-glass flight and a warm pretzel for twelve dollars across Oktoberfest weekend. Walk over from Gardner Field.',
                    'type' => 'offer',
                    'label' => '$12 FLIGHT',
                    'original' => 17.00,
                    'discounted' => 12.00,
                    'image' => 'taproom',
                    'endDays' => 10,
                ],
            ],
            [
                'name' => 'Twin Seafood',
                'category' => 'Seafood & Restaurant',
                'description' => 'Fresh fish counter and a dine-in and takeaway grill on Massachusetts Avenue, open in Acton since 2011 with a sister shop in Concord. They cater, they do a clambake menu, and the brothers who run it have a cooking show on Acton TV.',
                'address' => '541 Massachusetts Avenue, Acton, MA 01720',
                'phone' => '(978) 635-0010',
                'hours' => 'Mon–Sat 10:00 AM – 8:00 PM · Sun 9:00 AM – 7:00 PM',
                'amenities' => 'Fresh fish counter, Dine-in, Takeaway, Catering, Clambakes',
                'website' => 'https://twinsseafood.com/',
                'image' => 'lobster-roll',
                'owner' => 'daniel.nagog@havena.app',
                'deal' => [
                    'title' => 'Lobster Roll and Chowder, $24',
                    'description' => 'A lobster roll and a cup of chowder for twenty-four dollars, Monday to Thursday. Dine in or take away.',
                    'type' => 'deal',
                    'label' => 'SET $24',
                    'original' => 30.00,
                    'discounted' => 24.00,
                    'image' => 'lobster-roll',
                    'featured' => true,
                    'endDays' => 35,
                ],
            ],
            [
                'name' => 'The Silver Unicorn Bookstore',
                'category' => 'Bookshop',
                'description' => "Acton's independent bookshop, in the heart of West Acton Village on Spruce Street. Curated rather than exhaustive, and they will order anything they do not have, usually within two days. Strong children's and young-adult sections and a regular author-event programme.",
                'address' => '12 Spruce Street, Acton, MA 01720',
                'phone' => '(978) 274-2757',
                'hours' => 'Mon–Sat 10:00 AM – 6:00 PM · Sun 11:00 AM – 4:00 PM',
                'amenities' => 'Special orders, Author events, Book club picks, Gift wrapping',
                'website' => 'https://silverunicornbooks.com/',
                'image' => 'feed-books',
                'owner' => 'yuki.nagog@havena.app',
                'deal' => [
                    'title' => 'Book Club Pick: 15% Off for Neighbours',
                    'description' => 'Fifteen percent off the current book club pick when you mention the app. Ask at the counter.',
                    'type' => 'coupon',
                    'label' => '15% OFF',
                    'promo' => 'ACTONREADS',
                    'image' => 'little-free-library',
                    'endDays' => 60,
                ],
            ],
            [
                'name' => 'West Side Creamery',
                'category' => 'Ice Cream',
                'description' => 'Ice cream, frappes and sundaes on Massachusetts Avenue in West Acton Village, next door to the seafood grill. Open through the autumn — New Englanders do not stop eating ice cream when it gets cold.',
                'address' => '537 Massachusetts Avenue, Acton, MA 01720',
                'phone' => '(978) 263-0011',
                'hours' => 'Daily 12:00 PM – 9:00 PM (seasonal hours)',
                'amenities' => 'Hard and soft serve, Frappes, Dairy-free options, Outdoor seating',
                'website' => null,
                'image' => 'business-icecream',
                'owner' => 'meera.nagog@havena.app',
                'deal' => [
                    'title' => 'Kids Scoop Free with Two Adult Cones',
                    'description' => 'Buy two adult cones and the kids scoop is free. After the farmers market on a Sunday is the right time.',
                    'type' => 'offer',
                    'label' => 'KIDS FREE',
                    'image' => 'business-icecream',
                    'endDays' => 28,
                ],
            ],
            [
                'name' => 'Acton Pharmacy',
                'category' => 'Pharmacy',
                'description' => 'The independent community pharmacy in West Acton Village. Compounding, immunisations, home medical equipment, and a pharmacist who will actually come out from behind the counter to answer a question.',
                'address' => '563 Massachusetts Avenue, Acton, MA 01720',
                'phone' => '(978) 263-3901',
                'hours' => 'Mon–Fri 8:30 AM – 7:00 PM · Sat 9:00 AM – 3:00 PM · Sun Closed',
                'amenities' => 'Compounding, Immunisations, Home delivery, Medical equipment',
                'website' => null,
                'image' => 'business-pharmacy',
                'owner' => 'grace.nagog@havena.app',
                'deal' => [
                    'title' => 'Free Flu Shot Clinic, Saturday Mornings',
                    'description' => 'Walk-in flu shots on Saturday mornings through November, most insurance accepted. No appointment needed.',
                    'type' => 'offer',
                    'label' => 'FREE CLINIC',
                    'image' => 'business-pharmacy',
                    'endDays' => 55,
                ],
            ],
            [
                'name' => 'Pedal Power Bike and Ski',
                'category' => 'Bike & Ski Shop',
                'description' => 'Bike shop on Great Road, and the obvious stop if you ride the Bruce Freeman — the trail has a parking access point directly behind the store, and there is a public restroom during shop hours. Ski service through the winter.',
                'address' => '176 Great Road, Acton, MA 01720',
                'phone' => '(978) 263-3197',
                'hours' => 'Tue–Fri 10:00 AM – 6:00 PM · Sat 9:00 AM – 5:00 PM · Sun 12:00 PM – 4:00 PM',
                'amenities' => 'Trail-side access, Tune-ups, Ski service, Rentals',
                'website' => null,
                'image' => 'business-bike',
                'owner' => 'tom.nagog@havena.app',
                'deal' => [
                    'title' => 'Autumn Tune-Up, $20 Off',
                    'description' => 'Twenty dollars off a full tune-up booked before the end of October. Get it done before the salt goes down.',
                    'type' => 'deal',
                    'label' => '$20 OFF',
                    'original' => 95.00,
                    'discounted' => 75.00,
                    'promo' => 'TRAILREADY',
                    'image' => 'business-bike',
                    'endDays' => 38,
                ],
            ],
            [
                'name' => 'Discovery Museum',
                'category' => 'Family & Museum',
                'description' => 'Three floors of hands-on science and nature exhibits on Route 27, plus the outdoor Discovery Woods treehouse and trail. Bessie the dinosaur is out front. Four-tenths of a mile from South Acton station, so you can come by train.',
                'address' => '177 Main Street, Acton, MA 01720',
                'phone' => '(978) 264-4200',
                'hours' => 'Wed–Sun 9:00 AM – 4:30 PM · Closed Mon–Tue',
                'amenities' => 'Hands-on exhibits, Discovery Woods, Open Door programme, Group rates',
                'website' => 'https://www.discoveryacton.org/',
                'image' => 'science-museum',
                'owner' => 'yuki.nagog@havena.app',
                'deal' => [
                    'title' => 'Neighbour Group Rate: $4 Off Admission',
                    'description' => 'Four dollars off each admission for neighbour groups of ten or more. Ask at the museum desk.',
                    'type' => 'deal',
                    'label' => '$4 OFF',
                    'original' => 19.50,
                    'discounted' => 15.50,
                    'image' => 'science-museum',
                    'endDays' => 70,
                ],
            ],
            [
                'name' => 'Theater III',
                'category' => 'Arts & Theatre',
                'description' => "Acton's community theatre on Central Street, running since the 1950s. A small house where you can hear everything, staffed and staged entirely by volunteers from around the Nashoba Valley.",
                'address' => '250 Central Street, Acton, MA 01720',
                'phone' => '(978) 263-2668',
                'hours' => 'Box office Thu–Sat 5:00 PM – 8:00 PM · Performance nights Fri–Sun',
                'amenities' => 'Community theatre, Season tickets, Group rates, Volunteer opportunities',
                'website' => null,
                'image' => 'theater-stage',
                'owner' => 'daniel.nagog@havena.app',
                'deal' => [
                    'title' => 'Opening Night Group Rate, $18 a Seat',
                    'description' => 'Eighteen dollars a seat for neighbour groups of ten or more. Book through the Theater III box office.',
                    'type' => 'deal',
                    'label' => '$18 SEATS',
                    'original' => 26.00,
                    'discounted' => 18.00,
                    'image' => 'theater-stage',
                    'endDays' => 52,
                ],
            ],
            [
                'name' => 'Revolution Community Yoga',
                'category' => 'Fitness & Wellness',
                'description' => 'A community yoga studio spread across the Villageworks buildings on Massachusetts Avenue, with a stated commitment to keeping classes affordable. Beginner, restorative, prenatal and family classes alongside the stronger stuff.',
                'address' => '525 Massachusetts Avenue, Acton, MA 01720',
                'phone' => '(978) 274-7078',
                'hours' => 'Mon–Fri 6:00 AM – 8:30 PM · Sat–Sun 8:00 AM – 12:00 PM',
                'amenities' => 'Beginner classes, Family yoga, Sliding scale, Mats provided',
                'website' => null,
                'image' => 'business-yoga',
                'owner' => 'linda.nagog@havena.app',
                'deal' => [
                    'title' => 'First Class Free, Then $60 for Five',
                    'description' => 'Your first class is free and a five-class card is sixty dollars. Mats provided if you do not have one.',
                    'type' => 'offer',
                    'label' => 'FREE TRIAL',
                    'original' => 90.00,
                    'discounted' => 60.00,
                    'image' => 'business-yoga',
                    'endDays' => 50,
                ],
            ],
            [
                'name' => 'Acton Town Hall',
                'category' => 'Civic',
                'description' => 'Town offices in Acton Centre. Select Board, clerk, assessor, and health department counters keep posted weekday hours. Switchboard (978) 929-6600.',
                'address' => '472 Main Street, Acton, MA 01720',
                'phone' => '(978) 929-6600',
                'hours' => 'Weekday counters — check the posted Town Hall calendar',
                'amenities' => 'Select Board, Clerk, Assessor, Public comment nights',
                'website' => 'https://www.actonma.gov/',
                'image' => 'acton-town-hall',
                'owner' => ActonCommunitySeeder::ADMIN_EMAIL,
                'deal' => null,
            ],
            [
                'name' => 'Acton Memorial Library',
                'category' => 'Civic',
                'description' => "The town library on Main Street, next to Town Hall. Stacks, study tables, children's room, and museum-pass reservations including the Discovery Museum.",
                'address' => '486 Main Street, Acton, MA 01720',
                'phone' => '(978) 929-6655',
                'hours' => 'Posted at the desk and on the library site',
                'amenities' => 'Museum passes, Children\'s room, Holds, Outdoor return slot',
                'website' => 'https://www.actonmemoriallibrary.org/',
                'image' => 'acton-memorial-library',
                'owner' => ActonCommunitySeeder::ADMIN_EMAIL,
                'deal' => null,
            ],
            [
                'name' => "West Acton Citizens' Library",
                'category' => 'Civic',
                'description' => 'The smaller West Acton branch at 21 Windsor Avenue. Hours follow the volunteer roster — check the door before a special trip.',
                'address' => '21 Windsor Avenue, Acton, MA 01720',
                'phone' => '(978) 929-6654',
                'hours' => 'Posted on the door',
                'amenities' => 'Holds, Children\'s shelves, Volunteer-run hours',
                'website' => null,
                'image' => 'west-acton-library',
                'owner' => ActonCommunitySeeder::ADMIN_EMAIL,
                'deal' => null,
            ],
            [
                'name' => 'Transfer Station & Recycling Center',
                'category' => 'Civic',
                'description' => 'Acton\'s SMART pay-as-you-throw transfer station. No curbside pickup in town. Official orange bags required for trash; recycling is free.',
                'address' => '193 Massachusetts Avenue, Acton, MA 01720',
                'phone' => '(978) 929-7742',
                'hours' => 'Tue–Sat 7:00 AM – 3:00 PM · Closed Sun–Mon',
                'amenities' => 'SMART bags, Recycling, Yard waste, Stickers and per-trip fees',
                'website' => 'https://www.actonma.gov/',
                'image' => 'acton-plaza',
                'owner' => ActonCommunitySeeder::ADMIN_EMAIL,
                'deal' => null,
            ],
        ];


        foreach ($shops as $shop) {
            $ownerId = $this->uid($shop['owner']) ?? $this->adminId;

            $payload = [
                'owner_id' => $ownerId,
                'category' => $shop['category'],
                'description' => $shop['description'],
                'address' => $shop['address'],
                'phone' => $shop['phone'],
                'hours' => $shop['hours'],
                'amenities' => $shop['amenities'],
                'image_url' => $this->img($shop['image']),
                'status' => 'approved',
                'approved_at' => now()->subMonths(6),
                'approved_by' => $this->adminId,
                'updated_at' => now()->subDays(14),
                'created_at' => now()->subMonths(8),
            ];

            if ($hasWebsite) {
                $payload['website'] = $shop['website'];
            }

            DB::table('businesses')->updateOrInsert(
                ['community_id' => $this->cid, 'name' => $shop['name']],
                $payload
            );

            $businessId = (int) DB::table('businesses')
                ->where('community_id', $this->cid)
                ->where('name', $shop['name'])
                ->value('id');

            if (! $businessId || empty($shop['deal'])) {
                continue;
            }

            $deal = $shop['deal'];

            DB::table('deals')->updateOrInsert(
                ['community_id' => $this->cid, 'title' => $deal['title']],
                [
                    'created_by' => $ownerId,
                    'business_id' => $businessId,
                    'vendor' => $shop['name'],
                    'description' => $deal['description'],
                    'type' => $deal['type'] ?? 'deal',
                    'discount_label' => $deal['label'] ?? null,
                    'original_price' => $deal['original'] ?? null,
                    'discounted_price' => $deal['discounted'] ?? null,
                    'promo_code' => $deal['promo'] ?? null,
                    'category' => $shop['category'],
                    'location' => 'Acton, MA',
                    'image_url' => $this->img($deal['image'] ?? $shop['image']),
                    'is_featured' => (bool) ($deal['featured'] ?? false),
                    'status' => 'active',
                    'starts_at' => now()->subDays(10),
                    'ends_at' => now()->addDays((int) ($deal['endDays'] ?? 40)),
                    'updated_at' => now()->subDays(10),
                    'created_at' => now()->subDays(10),
                ]
            );
        }

        $this->command?->info('  Businesses and deals ready: '.count($shops));
    }

    /* ─────────────────────────── rules ─────────────────────────── */

    private function seedRules(): void
    {
        $rows = [
            [
                'Quiet Hours and Outdoor Equipment',
                'Noise',
                "Acton's general bylaw quiet hours run from 10:00 PM to 7:00 AM. Keep music, power tools, and late gatherings inside those windows, especially in the closer-built parts of West and South Acton.\n\nOutdoor power equipment is not a dawn activity. Leaf blowers, mowers, and pressure washers should wait until 8:00 AM on weekdays and 9:00 AM at weekends. Contractors on your property are your responsibility.",
                'important',
                true,
            ],
            [
                'Winter Parking on Town Ways',
                'Parking',
                "From 1 November through mid-April, vehicles left on posted town ways once a storm is named or two inches are forecast can be ticketed or towed so the plows can get through.\n\nUse your driveway or a legal off-street space. Do not shovel snow into the roadway. Guests are covered by the same rule — you are responsible for where your visitors park.",
                'important',
                true,
            ],
            [
                'Conservation Land and Trails',
                'Grounds',
                "Great Hill, the Arboretum, NARA woods, Nashoba Brook, and the rail trails are dawn-to-dusk public land. Stay on blazed trails, take your rubbish out, and do not cut, plant, or prune on conservation land.\n\nThe side paths get wet after rain and ticks stay active through October. Treat socks, and check children and dogs after every walk.",
                'standard',
                true,
            ],
            [
                'NARA Park and Town Fields',
                'Amenities',
                "NARA Park at 25 Ledge Rock Way is open dawn to dusk. The pond beach is staffed Memorial Day weekend through late August; day fees and season passes are through Recreation at 50 Audubon Drive.\n\nDogs are not allowed on the beach. Larger groups that want a pavilion or a field slot should ask Recreation first — recreation@actonma.gov — rather than just showing up on a Saturday.",
                'standard',
                true,
            ],
            [
                'Pets, Wildlife and Drinking Water',
                'Pets',
                "Dogs must be leashed on town conservation land and the rail trails, and you must pick up.\n\nNagog Pond is an active public drinking-water reservoir. No swimming, wading, or dogs in the water. Do not feed wildlife, including the turkeys and the deer. Keep bird feeders down in bear season — Middlesex County has an established black bear population, and a fed bear becomes everybody's problem.",
                'standard',
                true,
            ],
            [
                'Trash, Recycling and the Transfer Station',
                'Sanitation',
                "Acton has no municipal curbside collection. Household trash and recycling go to the Transfer Station & Recycling Center at 193 Massachusetts Avenue, Tuesday to Saturday, 7:00 AM to 3:00 PM.\n\nYou need a sticker or a per-trip fee. Trash must be in official SMART orange Acton bags. Recycling is free. Construction debris is not accepted. Questions: (978) 929-7742.",
                'important',
                true,
            ],
            [
                'Town Hall and Civic Business',
                'Governance',
                "Town Hall is at 472 Main Street, switchboard (978) 929-6600. Select Board meetings are posted on the town calendar; public comment is taken on posted items.\n\nClerk, assessor, and health-department counters keep posted weekday hours. Do not assume a Saturday window. If a long outage opens a warming centre, it will be posted here and at Town Hall.",
                'info',
                false,
            ],
            [
                'Rail Trails and South Acton Station',
                'Transit',
                "The Bruce Freeman and Assabet River Rail Trails are paved town-scale paths, not a subdivision loop. Lights help after 5:30 once the evenings draw in. The Route 2A bridge deck can be slick after rain.\n\nSouth Acton at 10 Central Street is the only MBTA stop in town (Fitchburg Line, zone 6). The 287-space lot fills by 7:30 AM on weekdays. Do not leave a car overnight without checking posted rules.",
                'standard',
                false,
            ],
        ];

                foreach ($rows as [$title, $category, $description, $severity, $requiresAck]) {
            DB::table('community_rules')->updateOrInsert(
                ['community_id' => $this->cid, 'title' => $title],
                [
                    'created_by' => $this->adminId,
                    'category' => $category,
                    'description' => $description,
                    'severity' => $severity,
                    'requires_acknowledgment' => $requiresAck,
                    'status' => 'active',
                    'updated_at' => now()->subMonths(5),
                    'created_at' => now()->subMonths(14),
                ]
            );
        }

        $ackRuleIds = DB::table('community_rules')
            ->where('community_id', $this->cid)
            ->where('requires_acknowledgment', true)
            ->pluck('id');

        $residents = $this->approvedResidentIds();

        foreach ($ackRuleIds as $ruleIndex => $ruleId) {
            foreach ($residents as $index => $userId) {
                // Leave a realistic tail of residents who have not acknowledged yet.
                if (($index + $ruleIndex) % 5 === 4) {
                    continue;
                }

                DB::table('rule_acknowledgments')->updateOrInsert(
                    ['rule_id' => $ruleId, 'user_id' => $userId],
                    ['acknowledged_at' => now()->subDays((($index * 7) % 90) + 3)]
                );
            }
        }

        $this->command?->info('  Rules ready: '.count($rows));
    }

    /* ─────────────────────────── documents ─────────────────────────── */

    private function seedDocuments(): void
    {
        $dir = storage_path('app/public/documents/'.$this->cid);
        if (! is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }

        $docs = [
            ['New Resident Guide 2026', 'Policies', 'Town Hall, Transfer Station, libraries, NARA, South Acton station, and who to call. Start here if you are new to Acton.', 'acton-new-resident-guide-2026'],
            ['Transfer Station and SMART Bag Guide', 'Sanitation', 'Hours, stickers, per-trip fees, accepted items, and where to buy official orange Acton bags. 193 Massachusetts Avenue, (978) 929-7742.', 'acton-transfer-station-guide'],
            ['Recreation Programme Brochure', 'Recreation', 'NARA beach memberships, field permits, and the current town programme list from 50 Audubon Drive. Confirm dates with recreation@actonma.gov.', 'acton-recreation-brochure'],
            ['Library Card and Museum Pass Guide', 'Civic', 'Acton Memorial Library at 486 Main Street and the West Acton Citizens\' Library at 21 Windsor Avenue, plus how to reserve a Discovery Museum pass.', 'acton-library-guide'],
            ['Fitchburg Line and Cross-Acton Transit', 'Transit', 'South Acton station (zone 6), parking, bicycle spaces, and the free weekday Cross-Acton Transit bus window.', 'acton-transit-guide'],
            ['Conservation Land Map Notes', 'Grounds', 'Great Hill, the Arboretum, Nashoba Brook, NARA woods, and the two rail trails — parking, dogs, and dawn-to-dusk rules.', 'acton-conservation-map-notes'],
            ['Approved Local Vendor List', 'Forms', 'Plumbers, carpenters, and landscapers neighbours have actually used in Acton. Not a town endorsement — a starting point.', 'acton-approved-vendor-list'],
            ['Winter Storm and Outage Notes', 'Safety', 'Winter parking on town ways, Eversource outage reporting, and how Town Hall posts a warming-centre opening.', 'acton-winter-storm-notes'],
            ['Emergency Preparedness Guide', 'Safety', 'Nor\'easter and hurricane checklists, shutoff basics, and the Town Hall switchboard: (978) 929-6600.', 'acton-emergency-preparedness-guide'],
        ];

        foreach ($docs as $index => [$title, $category, $description, $slug]) {
            $fileName = $slug.'.pdf';
            $absolute = $dir.'/'.$fileName;

            if (! is_file($absolute)) {
                file_put_contents($absolute, $this->placeholderPdf($title));
            }

            DB::table('community_documents')->updateOrInsert(
                ['community_id' => $this->cid, 'title' => $title],
                [
                    'created_by' => $this->adminId,
                    'category' => $category,
                    'description' => $description,
                    'file_path' => "/storage/documents/{$this->cid}/{$fileName}",
                    'file_name' => $fileName,
                    'file_size' => is_file($absolute) ? filesize($absolute) : 0,
                    'mime_type' => 'application/pdf',
                    'download_count' => 12 + ($index * 9),
                    'status' => 'active',
                    'updated_at' => now()->subDays(($index * 11) + 4),
                    'created_at' => now()->subDays(($index * 24) + 30),
                ]
            );
        }

        $this->command?->info('  Documents ready: '.count($docs));
    }

    private function placeholderPdf(string $title): string
    {
        $lines = [
            'Acton, MA',
            str_replace(['(', ')'], '', $title),
            'Placeholder document for the Acton seed data.',
        ];

        $content = "BT /F1 16 Tf 72 720 Td 20 TL\n";
        foreach ($lines as $line) {
            $content .= '('.$line.') Tj T*'."\n";
        }
        $content .= 'ET';
        $length = strlen($content);

        return "%PDF-1.4\n"
            ."1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
            ."2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
            ."3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
            ."4 0 obj<</Length {$length}>>stream\n{$content}\nendstream endobj\n"
            ."5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
            ."trailer<</Root 1 0 R>>\n%%EOF";
    }
}
