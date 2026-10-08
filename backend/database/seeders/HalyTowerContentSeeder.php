<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Content for Haly Tower, DHA Phase 2, Lahore.
 *
 * The households are fictional. Everything around them is real and checkable:
 *
 *   DHA Phase 2 sector layout, the Phase 2 commercial market, Jamia Masjid,
 *     and the DHA maintenance / sticker regime.
 *   LESCO load-shedding and protective relay trips, SNGPL winter gas pressure,
 *     WASA water and sewerage charges.
 *   Ghazi Road interchange onto Lahore Ring Road, Walton Road, Bedian Road,
 *     Allama Iqbal International Airport, the Orange Line at Ghazi Chowk.
 *   Restaurants that actually trade in and around DHA Phase 2: Chaaye Khana,
 *     Saudi Broast, California Pizza, Ping Pong, Pret Brasserie, FoodGuy,
 *     Cuisine By Ayesha Kamil, Saadi Di Sajji, Paradise, KAFI, Majnoon,
 *     Chips & Chopsticks, Rax Foods, Kruncheese, Khas Samosa.
 *   Rupee amounts are 2026 Lahore market rates, not converted dollars.
 *
 * Run via HalyTowerCommunitySeeder.
 */
class HalyTowerContentSeeder extends Seeder
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
            : DB::table('communities')->where('id', HalyTowerCommunitySeeder::seededCommunityId())->first();

        if (! $community) {
            $this->command?->error('HalyTowerContentSeeder: run HalyTowerCommunitySeeder first.');

            return;
        }

        $this->cid = (int) $community->id;
        $this->people = $this->resolvePeople();
        $this->adminId = (int) ($this->people[HalyTowerCommunitySeeder::ADMIN_EMAIL] ?? 0);

        if ($this->adminId === 0) {
            $this->command?->error('HalyTowerContentSeeder: community admin not found.');

            return;
        }

        $this->resetSeededContent();

        $this->seedCategories();
        $amenities = $this->seedAmenities();
        $this->seedBookings($amenities);
        $this->seedSharedBills($amenities);
        $this->seedPropertyServices();
        $this->seedNotices();
        $this->seedEvents();
        $this->seedAlert();
        $this->seedFeed();
        $this->seedListings();
        $this->seedBusinessesAndDeals();
        $this->seedRules();
        $this->seedDocuments();
        $this->seedConversations();
        $this->seedPoints();
        $this->seedWellnessProgress();
        $this->seedGuestInvitations();
        $this->seedNotifications();

        $this->command?->info('  Haly Tower content ready for community #'.$this->cid.'.');
    }

    /* ─────────────────────────── helpers ─────────────────────────── */

    /**
     * Prefer the Lahore photo set, then a sensible Lahore stand-in, then the
     * shared seed images. See .tmp/fetch-haly-photos.py and seed/haly/CREDITS.txt.
     */
    private function img(string $key, ?string $fallback = null): string
    {
        static $haly = null;

        if ($haly === null) {
            $haly = [];
            foreach (glob(storage_path('app/public/seed/haly/*.jpg')) ?: [] as $path) {
                $haly[basename($path, '.jpg')] = true;
            }
        }

        if (isset($haly[$key])) {
            return "/storage/seed/haly/{$key}.jpg";
        }

        if ($fallback !== null && isset($haly[$fallback])) {
            return "/storage/seed/haly/{$fallback}.jpg";
        }

        return "/storage/seed/{$key}.jpg";
    }

    /** @return array<string, int> */
    private function resolvePeople(): array
    {
        $emails = array_merge(
            [HalyTowerCommunitySeeder::ADMIN_EMAIL, HalyTowerCommunitySeeder::RESIDENT_EMAIL],
            array_column(HalyTowerCommunitySeeder::neighbours(), 'email'),
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

    /** @return array<string, int> unit_number => unit id */
    private function unitsByNumber(): array
    {
        return DB::table('units')
            ->where('community_id', $this->cid)
            ->where('kind', 'residential')
            ->pluck('id', 'unit_number')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /**
     * Clear anything a previous run of this seeder left behind, so re-seeding
     * never stacks a second set of amenities or bills on the same community.
     */
    private function resetSeededContent(): void
    {
        $amenityIds = DB::table('amenities')->where('community_id', $this->cid)->pluck('id');
        if ($amenityIds->isNotEmpty()) {
            $bookingIds = DB::table('bookings')->whereIn('amenity_id', $amenityIds)->pluck('id');
            if ($bookingIds->isNotEmpty() && Schema::hasTable('booking_slot_allocations')) {
                DB::table('booking_slot_allocations')->whereIn('booking_id', $bookingIds)->delete();
            }
            DB::table('bookings')->whereIn('amenity_id', $amenityIds)->delete();

            if (Schema::hasTable('amenity_monthly_bills')) {
                $monthlyIds = DB::table('amenity_monthly_bills')->where('community_id', $this->cid)->pluck('id');
                if ($monthlyIds->isNotEmpty()) {
                    foreach (['amenity_resident_bill_reviews', 'amenity_resident_bill_notifications'] as $table) {
                        if (! Schema::hasTable($table)) {
                            continue;
                        }
                        $residentBillIds = DB::table('amenity_resident_bills')
                            ->whereIn('monthly_bill_id', $monthlyIds)
                            ->pluck('id');
                        if ($residentBillIds->isNotEmpty()) {
                            DB::table($table)->whereIn('resident_bill_id', $residentBillIds)->delete();
                        }
                    }
                    DB::table('amenity_resident_bills')->whereIn('monthly_bill_id', $monthlyIds)->delete();
                }
                DB::table('amenity_monthly_bills')->where('community_id', $this->cid)->delete();
            }

            DB::table('amenities')->where('community_id', $this->cid)->delete();
        }

        if (Schema::hasTable('property_services')) {
            if (Schema::hasTable('unit_service_bills')) {
                $billIds = DB::table('unit_service_bills')->where('community_id', $this->cid)->pluck('id');
                foreach (['unit_service_bill_reviews', 'unit_service_bill_notifications'] as $table) {
                    if ($billIds->isNotEmpty() && Schema::hasTable($table)) {
                        DB::table($table)->whereIn('bill_id', $billIds)->delete();
                    }
                }
                DB::table('unit_service_bills')->where('community_id', $this->cid)->delete();
            }
            if (Schema::hasTable('unit_service_subscriptions')) {
                DB::table('unit_service_subscriptions')->where('community_id', $this->cid)->delete();
            }
            DB::table('property_services')->where('community_id', $this->cid)->delete();
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
            if (Schema::hasTable('polls')) {
                $pollIds = DB::table('polls')->whereIn('post_id', $postIds)->pluck('id');
                if ($pollIds->isNotEmpty()) {
                    DB::table('poll_votes')->whereIn('poll_id', $pollIds)->delete();
                    DB::table('poll_options')->whereIn('poll_id', $pollIds)->delete();
                    DB::table('polls')->whereIn('id', $pollIds)->delete();
                }
            }
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

        if (Schema::hasTable('guest_invitations')) {
            DB::table('guest_invitations')->where('community_id', $this->cid)->delete();
        }

        if (Schema::hasTable('point_transactions')) {
            DB::table('point_transactions')->where('community_id', $this->cid)->delete();
        }

        $this->resetConversations();
    }

    private function resetConversations(): void
    {
        $userIds = array_values($this->people);
        if ($userIds === [] || ! Schema::hasTable('conversations')) {
            return;
        }

        $conversationIds = DB::table('conversation_participants')
            ->whereIn('user_id', $userIds)
            ->distinct()
            ->pluck('conversation_id');

        if ($conversationIds->isEmpty()) {
            return;
        }

        DB::table('messages')->whereIn('conversation_id', $conversationIds)->delete();
        DB::table('conversation_participants')->whereIn('conversation_id', $conversationIds)->delete();
        DB::table('conversations')->whereIn('id', $conversationIds)->delete();
    }

    /** Category pickers in the admin UI read from these tables. */
    private function seedCategories(): void
    {
        $ruleCategories = ['Noise', 'Parking', 'Security', 'Common Areas', 'Utilities', 'Pets', 'Tenancy'];
        $docCategories = ['Policies', 'Billing', 'Forms', 'Safety', 'Utilities', 'Civic', 'Grounds'];

        foreach ($ruleCategories as $name) {
            DB::table('community_rule_categories')->updateOrInsert(
                ['community_id' => $this->cid, 'name' => $name],
                ['updated_at' => now(), 'created_at' => now()->subMonths(20)],
            );
        }

        foreach ($docCategories as $name) {
            DB::table('community_document_categories')->updateOrInsert(
                ['community_id' => $this->cid, 'name' => $name],
                ['updated_at' => now(), 'created_at' => now()->subMonths(20)],
            );
        }
    }

    /* ─────────────────────────── amenities ─────────────────────────── */

    /** @return array<string, int> amenity name => id */
    private function seedAmenities(): array
    {
        $now = now();

        $rows = [
            [
                'name' => 'Community Hall',
                'description' => 'Ground-floor hall behind the B-wing lobby, seats 180 for a sit-down dinner or 240 standing. Stage, three ceiling-mounted ACs on the generator circuit, a service pantry with its own entrance so caterers never cross the lobby, and a separate ladies entrance for mehndi and milad bookings. Chairs and round tables are stored on site; crockery is not.',
                'status' => 'bookable',
                'capacity' => 180,
                'floor' => 'Ground Floor, B Wing',
                'hours' => 'Daily 9:00 AM – 11:30 PM',
                'start_time' => '09:00:00',
                'end_time' => '23:30:00',
                'slot' => 180,
                'icon' => 'users',
                'image' => 'amenity-banquet-hall',
                'fee' => 25000,
            ],
            [
                'name' => 'Rooftop Terrace & BBQ Deck',
                'description' => 'Sixteenth-floor deck over the A-wing core, looking north across the Cantt towards the city. Two built-in charcoal grills, shaded seating for about sixty, and string lighting on the generator circuit. The best spot in the building between November and March; genuinely unusable between noon and 5pm in June.',
                'status' => 'bookable',
                'capacity' => 60,
                'floor' => '16th Floor, A Wing',
                'hours' => 'Daily 4:00 PM – 11:00 PM',
                'start_time' => '16:00:00',
                'end_time' => '23:00:00',
                'slot' => 120,
                'icon' => 'sun',
                'image' => 'amenity-rooftop-terrace',
                'fee' => 6000,
            ],
            [
                'name' => 'Padel Court',
                'description' => 'Glass-backed padel court on the podium level, resurfaced in 2025. Floodlit until 11pm. Four players, bring your own rackets — the two sets in the management office are for guests and they are both warped. Court shoes only; the surface marks under street soles.',
                'status' => 'bookable',
                'capacity' => 4,
                'floor' => 'Podium Level',
                'hours' => 'Daily 6:00 AM – 11:00 PM',
                'start_time' => '06:00:00',
                'end_time' => '23:00:00',
                'slot' => 60,
                'icon' => 'activity',
                'image' => 'amenity-padel-court',
                'fee' => 2500,
            ],
            [
                'name' => 'Badminton Court',
                'description' => 'Indoor wooden court on the podium level, shared with the yoga class on Tuesday and Thursday mornings. Net and posts are permanent; shuttles are sold at the mini mart downstairs. Ceiling is just high enough for a proper clear, which is more than most Lahore apartment courts manage.',
                'status' => 'bookable',
                'capacity' => 4,
                'floor' => 'Podium Level',
                'hours' => 'Daily 6:00 AM – 10:00 PM',
                'start_time' => '06:00:00',
                'end_time' => '22:00:00',
                'slot' => 60,
                'icon' => 'activity',
                'image' => 'amenity-badminton',
                'fee' => 1200,
            ],
            [
                'name' => 'Cricket Practice Net',
                'description' => 'Single turf-matting net along the rear boundary wall, with a bowling machine the residents committee bought in 2024. Hard ball allowed only with a helmet and only after 5pm, when the car park below has emptied out. Tape ball any time.',
                'status' => 'bookable',
                'capacity' => 10,
                'floor' => 'Rear Compound',
                'hours' => 'Daily 7:00 AM – 9:30 PM',
                'start_time' => '07:00:00',
                'end_time' => '21:30:00',
                'slot' => 60,
                'icon' => 'activity',
                'image' => 'amenity-cricket-net',
                'fee' => 1500,
            ],
            [
                'name' => 'Snooker & Games Room',
                'description' => 'Full-size snooker table, a table-tennis table, and a carrom board in the basement next to the gym. Re-clothed in March 2026, so please chalk properly and keep tea outside the room. Under-16s with an adult only.',
                'status' => 'bookable',
                'capacity' => 8,
                'floor' => 'Basement 1',
                'hours' => 'Daily 10:00 AM – 12:00 AM',
                'start_time' => '10:00:00',
                'end_time' => '23:59:00',
                'slot' => 60,
                'icon' => 'target',
                'image' => 'amenity-snooker',
                'fee' => 800,
            ],
            [
                'name' => 'Rooftop Swimming Pool',
                'description' => 'Twelve-metre pool on the fifteenth-floor podium, heated November to February. Ladies-only hours are Monday, Wednesday and Saturday 9am to 12pm, screens drawn. No lifeguard on duty — children under twelve must have an adult in the water with them, not on a lounger.',
                'status' => 'bookable',
                'capacity' => 30,
                'floor' => '15th Floor Podium',
                'hours' => 'Daily 6:00 AM – 10:00 PM',
                'start_time' => '06:00:00',
                'end_time' => '22:00:00',
                'slot' => 60,
                'icon' => 'droplet',
                'image' => 'amenity-pool',
                'fee' => 1000,
                'shared_billing' => ['amount' => 2200, 'due_day' => 10],
            ],
            [
                'name' => 'Gymnasium',
                'description' => 'Basement gym, open to all residents at no charge, on the generator circuit so it keeps running through load-shedding. Treadmills, two cross-trainers, a cable stack, dumbbells to 40kg and a squat rack. Wipe the benches down — in a Lahore summer this is not optional.',
                'status' => 'open',
                'capacity' => 25,
                'floor' => 'Basement 1',
                'hours' => 'Daily 5:00 AM – 12:00 AM',
                'start_time' => '05:00:00',
                'end_time' => '23:59:00',
                'slot' => 60,
                'icon' => 'activity',
                'image' => 'amenity-gym',
                'fee' => 0,
            ],
            [
                'name' => 'Jamia Masjid Prayer Hall',
                'description' => 'Ground-floor prayer hall with a separate ladies section and wudu area, capacity about ninety. Jamaat for all five prayers; Imam Sahib lives in the staff quarters at the rear. Jumma khutba starts at 1:15pm in summer and 12:45pm in winter — the board by the A-wing lift carries the current timings.',
                'status' => 'open',
                'capacity' => 90,
                'floor' => 'Ground Floor',
                'hours' => 'Daily, all prayer times',
                'start_time' => '04:00:00',
                'end_time' => '22:30:00',
                'slot' => 60,
                'icon' => 'home',
                'image' => 'amenity-prayer-hall',
                'fee' => 0,
            ],
            [
                'name' => 'Kids Play Area',
                'description' => 'Shaded play area in the side compound — swings, a slide, a climbing frame, and rubber matting replaced in 2025. Gate self-latches but does not lock; a parent or helper must be present for under-sevens. Busiest between 5:30 and 7pm once the heat drops.',
                'status' => 'open',
                'capacity' => 20,
                'floor' => 'Side Compound',
                'hours' => 'Daily 7:00 AM – 9:00 PM',
                'start_time' => '07:00:00',
                'end_time' => '21:00:00',
                'slot' => 60,
                'icon' => 'users',
                'image' => 'feed-children-park',
                'fee' => 0,
            ],
            [
                'name' => 'Residents Library & Study Room',
                'description' => 'Quiet room on the mezzanine with eight study desks, Wi-Fi on the backup line, and a few hundred donated books in Urdu and English. Bookable in two-hour slots during exam season, otherwise first come first served. Phones on silent; this is the only genuinely quiet room in the building.',
                'status' => 'bookable',
                'capacity' => 8,
                'floor' => 'Mezzanine',
                'hours' => 'Daily 8:00 AM – 11:00 PM',
                'start_time' => '08:00:00',
                'end_time' => '23:00:00',
                'slot' => 120,
                'icon' => 'book',
                'image' => 'amenity-clubhouse',
                'fee' => 500,
            ],
            [
                'name' => 'Mini Mart',
                'description' => 'Ground-floor shop on the A-wing side — milk, bread, eggs, cold drinks, phone load, shuttles, and charcoal for the rooftop grills. Runs a monthly tab for residents who ask. Closed for Jumma between 1 and 2:30pm.',
                'status' => 'open',
                'capacity' => 10,
                'floor' => 'Ground Floor, A Wing',
                'hours' => 'Daily 8:00 AM – 11:30 PM',
                'start_time' => '08:00:00',
                'end_time' => '23:30:00',
                'slot' => 60,
                'icon' => 'shopping-bag',
                'image' => 'amenity-mini-mart',
                'fee' => 0,
            ],
            [
                'name' => 'Laundry & Ironing Service',
                'description' => 'Counter beside the mini mart, run by the dhobi the building has used since 2019. Drop before 10am for same-day press, next-day for wash and press. Rates are posted on the wall and have not changed since January. Suits and shalwar kameez only — he does not do leather or heavy drapes.',
                'status' => 'open',
                'capacity' => 6,
                'floor' => 'Ground Floor, A Wing',
                'hours' => 'Mon–Sat 8:00 AM – 8:00 PM',
                'start_time' => '08:00:00',
                'end_time' => '20:00:00',
                'slot' => 60,
                'icon' => 'home',
                'image' => 'business-laundry',
                'fee' => 0,
            ],
            [
                'name' => 'Salon & Barber',
                'description' => 'Two chairs on the mezzanine — gents barber all week, ladies salon by appointment on Tuesday, Thursday and Sunday with the shutter down. Books out completely in the fortnight before Eid, so put your name down early.',
                'status' => 'open',
                'capacity' => 4,
                'floor' => 'Mezzanine',
                'hours' => 'Tue–Sun 11:00 AM – 9:00 PM',
                'start_time' => '11:00:00',
                'end_time' => '21:00:00',
                'slot' => 60,
                'icon' => 'users',
                'image' => 'business-salon',
                'fee' => 0,
            ],
            [
                'name' => 'Basement Car Park',
                'description' => 'Two basement levels, 118 bays. One bay per apartment is on your title; extras are allotted by the management office against a monthly charge. Visitor bays 101 to 112 are on the ramp level and are capped at four hours. Fire lanes are painted red for a reason — a blocked lane is towed, not warned.',
                'status' => 'open',
                'capacity' => 118,
                'floor' => 'Basement 1 & 2',
                'hours' => '24 hours',
                'start_time' => '00:00:00',
                'end_time' => '23:59:00',
                'slot' => 60,
                'icon' => 'car',
                'image' => 'dha-residential-tower',
                'fee' => 0,
            ],
            [
                'name' => 'Generator & Backup Power Plant',
                'description' => 'Two 500 kVA diesel sets in the rear plant room with an automatic changeover panel. They carry the lifts, lobbies, corridors, water pumps, gym and the deck lighting, plus 2 kW per apartment. Air conditioners are not on the backup circuit — if you run one on generator the relay will trip your whole floor.',
                'status' => 'open',
                'capacity' => 0,
                'floor' => 'Rear Plant Room',
                'hours' => 'Automatic on LESCO outage',
                'start_time' => '00:00:00',
                'end_time' => '23:59:00',
                'slot' => 60,
                'icon' => 'zap',
                'image' => 'amenity-generator',
                'fee' => 0,
                'shared_billing' => ['amount' => 4500, 'due_day' => 10],
            ],
            [
                'name' => 'Passenger Lifts (A & B Wings)',
                'description' => 'Two passenger lifts and one service lift per wing, under an annual maintenance contract with quarterly visits. The service lift is the only one that takes furniture — book it through the office so the guards can put the pads up. Annual third-party rope inspection is in September.',
                'status' => 'open',
                'capacity' => 0,
                'floor' => 'A & B Wing Cores',
                'hours' => '24 hours',
                'start_time' => '00:00:00',
                'end_time' => '23:59:00',
                'slot' => 60,
                'icon' => 'wrench',
                'image' => 'dha-street',
                'fee' => 0,
                'shared_billing' => ['amount' => 1800, 'due_day' => 10],
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
                'review_status' => 'approved',
                'capacity' => $row['capacity'],
                'floor' => $row['floor'],
                'hours' => $row['hours'],
                'start_time' => $row['start_time'],
                'end_time' => $row['end_time'],
                'weekends_available' => true,
                'slot_duration_minutes' => $row['slot'],
                'icon_key' => $row['icon'],
                'image_url' => $this->img($row['image']),
                'booking_fee' => $row['fee'],
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
                $payload + ['created_at' => now()->subMonths(26)]
            );
        }

        $this->command?->info('  Amenities ready: '.count($rows));

        return $ids;
    }

    /** @param array<string, int> $amenities */
    private function seedBookings(array $amenities): void
    {
        $resident = $this->uid(HalyTowerCommunitySeeder::RESIDENT_EMAIL);
        $nadia = $this->uid('nadia.haly@havena.app');
        $usman = $this->uid('usman.haly@havena.app');
        $kamran = $this->uid('kamran.haly@havena.app');
        $rabia = $this->uid('rabia.haly@havena.app');
        $faisal = $this->uid('faisal.haly@havena.app');
        $hina = $this->uid('hina.haly@havena.app');
        $bilal = $this->uid('bilal.haly@havena.app');
        $zeeshan = $this->uid('zeeshan.haly@havena.app');

        $rows = [
            [
                'amenity' => 'Community Hall',
                'user_id' => $nadia,
                'date' => now()->addDays(11)->toDateString(),
                'time_slot' => '07:00 PM - 10:00 PM',
                'guests' => 140,
                'status' => 'confirmed',
                'booking_fee' => 25000,
                'payment_verification_status' => 'approved',
                'payment_method' => 'manual',
                'payment_date' => now()->subDays(3)->toDateString(),
                'payment_reference' => 'HALL-26-0418',
                'payment_note' => 'Transferred to the maintenance account, screenshot shared on WhatsApp.',
                'notes' => 'Mehndi for my niece. Caterer is using the pantry entrance, not the lobby. Ladies entrance to be kept open.',
            ],
            [
                'amenity' => 'Community Hall',
                'user_id' => $kamran,
                'date' => now()->addDays(25)->toDateString(),
                'time_slot' => '08:00 PM - 11:00 PM',
                'guests' => 90,
                'status' => 'pending',
                'booking_fee' => 25000,
                'payment_verification_status' => 'pending',
                'notes' => 'Walima dinner. Will confirm the headcount by the 20th.',
            ],
            [
                'amenity' => 'Rooftop Terrace & BBQ Deck',
                'user_id' => $resident,
                'date' => now()->addDays(4)->toDateString(),
                'time_slot' => '07:00 PM - 09:00 PM',
                'guests' => 22,
                'status' => 'confirmed',
                'booking_fee' => 6000,
                'payment_verification_status' => 'approved',
                'payment_method' => 'manual',
                'payment_date' => now()->subDays(2)->toDateString(),
                'payment_reference' => 'DECK-26-0233',
                'payment_note' => 'Paid at the office in cash, receipt 0233.',
                'notes' => 'Welfare committee barbecue. Bringing our own charcoal, grills just need cleaning beforehand.',
            ],
            [
                'amenity' => 'Rooftop Terrace & BBQ Deck',
                'user_id' => $hina,
                'date' => now()->subDays(9)->toDateString(),
                'time_slot' => '06:00 PM - 08:00 PM',
                'guests' => 16,
                'status' => 'confirmed',
                'booking_fee' => 6000,
                'payment_verification_status' => 'approved',
                'payment_method' => 'manual',
                'payment_date' => now()->subDays(12)->toDateString(),
                'payment_reference' => 'DECK-26-0219',
                'payment_note' => 'Online transfer, cleared same day.',
                'notes' => 'Birthday for the children on my floor. Finished and cleared by 8:15.',
            ],
            [
                'amenity' => 'Padel Court',
                'user_id' => $usman,
                'date' => now()->addDays(1)->toDateString(),
                'time_slot' => '08:00 PM - 09:00 PM',
                'guests' => 4,
                'status' => 'confirmed',
                'booking_fee' => 2500,
                'payment_verification_status' => 'approved',
                'payment_method' => 'manual',
                'payment_date' => now()->subDay()->toDateString(),
                'payment_reference' => 'PAD-26-1187',
                'payment_note' => 'Split four ways, paid as one transfer.',
                'notes' => 'Weekly doubles. Floodlights on from 7:45 please.',
            ],
            [
                'amenity' => 'Padel Court',
                'user_id' => $zeeshan,
                'date' => now()->addDays(3)->toDateString(),
                'time_slot' => '09:00 PM - 10:00 PM',
                'guests' => 4,
                'status' => 'awaiting_payment',
                'booking_fee' => 2500,
                'payment_verification_status' => 'pending',
                'notes' => 'Will pay at the office tomorrow morning.',
            ],
            [
                'amenity' => 'Badminton Court',
                'user_id' => $rabia,
                'date' => now()->addDays(2)->toDateString(),
                'time_slot' => '07:00 AM - 08:00 AM',
                'guests' => 2,
                'status' => 'confirmed',
                'booking_fee' => 1200,
                'payment_verification_status' => 'approved',
                'payment_method' => 'manual',
                'payment_date' => now()->subDays(4)->toDateString(),
                'payment_reference' => 'BAD-26-0771',
                'payment_note' => 'Monthly block paid in advance.',
                'notes' => 'Singles before the LUMS run. Out by 8:05 for the yoga class.',
            ],
            [
                'amenity' => 'Cricket Practice Net',
                'user_id' => $faisal,
                'date' => now()->addDays(5)->toDateString(),
                'time_slot' => '06:00 PM - 07:00 PM',
                'guests' => 8,
                'status' => 'confirmed',
                'booking_fee' => 1500,
                'payment_verification_status' => 'approved',
                'payment_method' => 'manual',
                'payment_date' => now()->subDays(5)->toDateString(),
                'payment_reference' => 'NET-26-0342',
                'payment_note' => 'Paid by the boys collectively.',
                'notes' => 'Hard ball, helmets on. Bowling machine needs the key from the guard room.',
            ],
            [
                'amenity' => 'Snooker & Games Room',
                'user_id' => $bilal,
                'date' => now()->addDays(2)->toDateString(),
                'time_slot' => '10:00 PM - 11:00 PM',
                'guests' => 4,
                'status' => 'confirmed',
                'booking_fee' => 800,
                'payment_verification_status' => 'approved',
                'payment_method' => 'manual',
                'payment_date' => now()->subDay()->toDateString(),
                'payment_reference' => 'SNK-26-0905',
                'payment_note' => 'Cash at the counter.',
                'notes' => 'Frames after Isha. No tea in the room, understood.',
            ],
            [
                'amenity' => 'Rooftop Swimming Pool',
                'user_id' => $resident,
                'date' => now()->addDays(6)->toDateString(),
                'time_slot' => '09:00 AM - 10:00 AM',
                'guests' => 2,
                'status' => 'confirmed',
                'booking_fee' => 1000,
                'payment_verification_status' => 'approved',
                'payment_method' => 'manual',
                'payment_date' => now()->subDays(2)->toDateString(),
                'payment_reference' => 'POOL-26-0588',
                'payment_note' => 'Guest fee for two, paid online.',
                'notes' => 'Ladies-only slot. Two guests from Phase 5, screens drawn please.',
            ],
            [
                'amenity' => 'Rooftop Swimming Pool',
                'user_id' => $usman,
                'date' => now()->subDays(6)->toDateString(),
                'time_slot' => '07:00 PM - 08:00 PM',
                'guests' => 1,
                'status' => 'cancelled',
                'booking_fee' => 1000,
                'payment_verification_status' => 'not_required',
                'notes' => 'Cancelled — pool was closed for backwashing that evening.',
            ],
            [
                'amenity' => 'Residents Library & Study Room',
                'user_id' => $rabia,
                'date' => now()->addDays(7)->toDateString(),
                'time_slot' => '06:00 PM - 08:00 PM',
                'guests' => 3,
                'status' => 'confirmed',
                'booking_fee' => 500,
                'payment_verification_status' => 'approved',
                'payment_method' => 'manual',
                'payment_date' => now()->subDays(3)->toDateString(),
                'payment_reference' => 'LIB-26-0144',
                'payment_note' => 'Paid at the office.',
                'notes' => 'O-level study group for three of the children. Quiet, and they clear up after.',
            ],
            [
                'amenity' => 'Residents Library & Study Room',
                'user_id' => $hina,
                'date' => now()->addDays(9)->toDateString(),
                'time_slot' => '04:00 PM - 06:00 PM',
                'guests' => 2,
                'status' => 'pending',
                'booking_fee' => 500,
                'payment_verification_status' => 'pending',
                'notes' => 'Parent-teacher catch-up with two families from the building.',
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
                'created_at' => now()->subDays(7),
                'updated_at' => now()->subDays(2),
            ]);
            $added++;
        }

        $this->command?->info('  Bookings added: '.$added);
    }

    /**
     * Shared monthly charges split across every approved resident — the
     * generator, the lifts, and the pool. Three months of history, the most
     * recent one still part-collected.
     *
     * @param  array<string, int>  $amenities
     */
    private function seedSharedBills(array $amenities): void
    {
        if (! Schema::hasTable('amenity_monthly_bills') || ! Schema::hasTable('amenity_resident_bills')) {
            return;
        }

        $residents = $this->approvedResidentIds();
        if ($residents === []) {
            return;
        }

        $charges = [
            [
                'amenity' => 'Generator & Backup Power Plant',
                'amount' => 4500,
                'title' => 'Generator & Backup Power — %s',
                'description' => "Diesel, oil changes and the AMC visit for the two 500 kVA sets, divided equally across all apartments. Diesel was Rs 281 a litre this month.\n\nPay into the maintenance account by the 10th and send the screenshot, or pay at the office against a numbered receipt.",
            ],
            [
                'amenity' => 'Passenger Lifts (A & B Wings)',
                'amount' => 1800,
                'title' => 'Lift Maintenance — %s',
                'description' => "Quarterly AMC visit, lubrication, door-sensor calibration and the annual rope inspection fund for six lifts across both wings.\n\nThis month includes the B-wing door operator that was replaced after the 4th-floor stoppage.",
            ],
            [
                'amenity' => 'Rooftop Swimming Pool',
                'amount' => 2200,
                'title' => 'Pool Upkeep — %s',
                'description' => "Filtration, chlorine and pH chemicals, weekly vacuuming, and the gas heater run from November through February.\n\nSplit across all apartments whether or not you swim — the plant runs regardless.",
            ],
        ];

        $created = 0;

        foreach ($charges as $charge) {
            $amenityId = $amenities[$charge['amenity']] ?? null;
            if (! $amenityId) {
                continue;
            }

            // Three billing months: two fully settled, the current one in progress.
            for ($monthsBack = 2; $monthsBack >= 0; $monthsBack--) {
                $month = now()->startOfMonth()->subMonths($monthsBack);
                $label = $month->format('F Y');
                $dueDate = $month->copy()->day(10);
                $publishedAt = $month->copy()->day(1)->setTime(9, 30);

                $monthlyId = DB::table('amenity_monthly_bills')
                    ->where('amenity_id', $amenityId)
                    ->where('billing_month', $month->toDateString())
                    ->value('id');

                $monthlyPayload = [
                    'amenity_id' => $amenityId,
                    'community_id' => $this->cid,
                    'billing_month' => $month->toDateString(),
                    'title' => sprintf($charge['title'], $label),
                    'description' => $charge['description'],
                    'amount_per_resident' => $charge['amount'],
                    'due_date' => $dueDate->toDateString(),
                    'status' => 'published',
                    'created_by' => $this->adminId,
                    'published_at' => $publishedAt,
                    'updated_at' => now(),
                ];

                if ($monthlyId) {
                    DB::table('amenity_monthly_bills')->where('id', $monthlyId)->update($monthlyPayload);
                } else {
                    $monthlyId = DB::table('amenity_monthly_bills')->insertGetId(
                        $monthlyPayload + ['created_at' => $publishedAt]
                    );
                    $created++;
                }

                foreach ($residents as $index => $userId) {
                    // Older months are settled. The current month still has a
                    // tail of unpaid and one submission waiting on review.
                    if ($monthsBack > 0) {
                        $state = 'paid';
                    } else {
                        $state = match ($index % 5) {
                            0, 1, 2 => 'paid',
                            3 => 'pending_verification',
                            default => 'unpaid',
                        };
                    }

                    $row = [
                        'monthly_bill_id' => $monthlyId,
                        'amenity_id' => $amenityId,
                        'community_id' => $this->cid,
                        'user_id' => $userId,
                        'amount' => $charge['amount'],
                        'status' => $state,
                        'updated_at' => now(),
                    ];

                    if ($state === 'paid') {
                        $paidOn = $dueDate->copy()->subDays(($index % 6) + 1);
                        $row += [
                            'payment_reference' => 'HT-'.$month->format('ym').'-'.str_pad((string) (400 + $index), 4, '0', STR_PAD_LEFT),
                            'payment_date' => $paidOn->toDateString(),
                            'payment_note' => $index % 3 === 0
                                ? 'Paid at the management office against a numbered receipt.'
                                : 'IBAN transfer to the maintenance account, screenshot attached.',
                            'approved_by' => $this->adminId,
                            'approved_at' => $paidOn->copy()->addDay(),
                        ];
                        if (Schema::hasColumn('amenity_resident_bills', 'payment_method')) {
                            $row['payment_method'] = $index % 3 === 0 ? 'cash' : 'bank_transfer';
                        }
                    } elseif ($state === 'pending_verification') {
                        $row += [
                            'payment_reference' => 'HT-'.$month->format('ym').'-'.str_pad((string) (900 + $index), 4, '0', STR_PAD_LEFT),
                            'payment_date' => now()->subDay()->toDateString(),
                            'payment_note' => 'Transfer sent last night, waiting for the office to confirm.',
                        ];
                        if (Schema::hasColumn('amenity_resident_bills', 'payment_method')) {
                            $row['payment_method'] = 'bank_transfer';
                        }
                    }

                    $existing = DB::table('amenity_resident_bills')
                        ->where('monthly_bill_id', $monthlyId)
                        ->where('user_id', $userId)
                        ->value('id');

                    if ($existing) {
                        DB::table('amenity_resident_bills')->where('id', $existing)->update($row);
                    } else {
                        DB::table('amenity_resident_bills')->insert($row + ['created_at' => $publishedAt]);
                    }
                }
            }
        }

        $this->command?->info('  Shared bills ready: '.$created.' monthly charges across '.count($residents).' residents');
    }

    /* ─────────────────── unit-level property services ─────────────────── */

    private function seedPropertyServices(): void
    {
        if (! Schema::hasTable('property_services')) {
            return;
        }

        $units = $this->unitsByNumber();
        if ($units === []) {
            $this->command?->warn('  Property services skipped — no units found.');

            return;
        }

        $services = [
            [
                'name' => 'Building Maintenance Charge',
                'category' => 'security',
                'icon' => 'shield',
                'type' => 'automatic',
                'frequency' => 'monthly',
                'amount' => 12500,
                'due_day' => 10,
                'description' => 'The standing monthly charge every apartment pays: guards on both gates round the clock, CCTV and the DVR contract, lobby and corridor cleaning, horticulture in the compound, the water pumps, and the sinking fund for external paint.',
                'instructions' => "Transfer to Haly Tower Maintenance Account, Account title: Haly Tower RWA. Quote your apartment number as the reference, then upload the screenshot here.\n\nCash is accepted at the management office until 6pm on working days against a numbered receipt. Do not hand cash to the guards.",
            ],
            [
                'name' => 'WASA Water & Sewerage',
                'category' => 'water',
                'icon' => 'droplet',
                'type' => 'automatic',
                'frequency' => 'monthly',
                'amount' => 1600,
                'due_day' => 15,
                'description' => 'WASA water and sewerage charge for the building connection, divided per apartment, plus the boring and submersible pump maintenance that tops the overhead tanks when mains pressure drops.',
                'instructions' => "Billed through the building rather than directly by WASA. Pay with your maintenance charge if you prefer — reference the apartment number and the office will allocate it.",
            ],
            [
                'name' => 'SNGPL Gas Riser Maintenance',
                'category' => 'other',
                'custom_category' => 'Gas',
                'icon' => 'wrench',
                'type' => 'automatic',
                'frequency' => 'monthly',
                'amount' => 900,
                'due_day' => 15,
                'description' => 'Riser and regulator maintenance for the gas column, the annual leak test, and the compressor the building runs through winter when SNGPL pressure drops below usable in the mornings.',
                'instructions' => 'Pay with the maintenance charge. Report any smell of gas to the office immediately and do not operate the lift on that floor.',
            ],
            [
                'name' => 'Reserved Basement Parking Bay',
                'category' => 'parking',
                'icon' => 'car',
                'type' => 'optional',
                'frequency' => 'monthly',
                'amount' => 3500,
                'due_day' => 10,
                'description' => 'A second numbered bay in Basement 1 or 2 beyond the one that comes with your apartment. Allotted in order of request; eleven bays were free as of this month. Bay number is painted and logged against your apartment with the guards.',
                'instructions' => 'Request here and the office will confirm your bay number within two working days. Billed from the month the bay is allotted.',
                'requires_approval' => true,
                'max_subscribers' => 18,
            ],
            [
                'name' => 'Haly Net Fibre — 50 Mbps',
                'category' => 'internet',
                'icon' => 'wifi',
                'type' => 'optional',
                'frequency' => 'monthly',
                'amount' => 4200,
                'due_day' => 5,
                'description' => 'Fibre to the apartment over the building riser, 50 Mbps down and 25 up, with the ONT on the backup power circuit so it rides through load-shedding. Router is included on a refundable deposit.',
                'instructions' => 'Subscribe here and the technician will call to book an installation slot, usually within three working days. First month is pro-rated.',
                'requires_approval' => true,
            ],
            [
                'name' => 'Water Tanker Top-Up',
                'category' => 'water',
                'icon' => 'droplet',
                'type' => 'optional',
                'frequency' => 'monthly',
                'amount' => 2500,
                'due_day' => 20,
                'description' => 'Standing arrangement for tanker deliveries to your apartment tank in May, June and July, when the boring cannot keep both overhead tanks full through the afternoon peak. Two deliveries a month included.',
                'instructions' => 'Opt in before the end of April so the office can book the tanker schedule. Extra deliveries beyond two are charged separately.',
            ],
            [
                'name' => 'Apartment Deep Cleaning',
                'category' => 'house_cleaning',
                'icon' => 'home',
                'type' => 'optional',
                'frequency' => 'monthly',
                'amount' => 6500,
                'due_day' => 25,
                'description' => 'Monthly deep clean by the building housekeeping team — kitchen degreasing, bathrooms, windows inside and out where reachable, fans and AC filters. Two staff, roughly four hours for a three-bedroom.',
                'instructions' => 'Subscribe and the office will fix a recurring day and time with you. You or a trusted adult must be present; staff are not given keys.',
                'max_subscribers' => 25,
            ],
            [
                'name' => 'Pest Control & Fumigation',
                'category' => 'pest_control',
                'icon' => 'shield',
                'type' => 'optional',
                'frequency' => 'monthly',
                'amount' => 3000,
                'due_day' => 20,
                'description' => 'Gel and spray treatment for cockroaches and ants in the kitchen and bathrooms, plus mosquito fogging of the compound and basements in the monsoon months. Child and pet safe formulation.',
                'instructions' => 'Opt in here. The team works floor by floor, so your slot will fall on the same day as your neighbours — the office posts the schedule a week in advance.',
            ],
        ];

        $serviceIds = [];

        foreach ($services as $service) {
            $payload = [
                'community_id' => $this->cid,
                'created_by' => $this->adminId,
                'name' => $service['name'],
                'category' => $service['category'],
                'custom_category' => $service['custom_category'] ?? null,
                'description' => $service['description'],
                'icon_key' => $service['icon'],
                'status' => 'active',
                'application_type' => $service['type'],
                'billing_frequency' => $service['frequency'],
                'amount_type' => 'fixed',
                'amount' => $service['amount'],
                'due_day' => $service['due_day'],
                'first_billing_month' => now()->startOfMonth()->subMonths(2)->toDateString(),
                'payment_instructions' => $service['instructions'],
                'require_payment_proof' => true,
                'require_acknowledgement' => $service['type'] === 'automatic',
                'auto_generate_bills' => false,
                'send_notice' => false,
                'send_notification' => false,
                'requires_admin_approval' => (bool) ($service['requires_approval'] ?? false),
                'max_subscribers' => $service['max_subscribers'] ?? null,
                'unsubscribe_mode' => 'end_of_period',
                'updated_at' => now(),
            ];

            $existing = DB::table('property_services')
                ->where('community_id', $this->cid)
                ->where('name', $service['name'])
                ->value('id');

            if ($existing) {
                DB::table('property_services')->where('id', $existing)->update($payload);
                $serviceIds[$service['name']] = (int) $existing;
            } else {
                $serviceIds[$service['name']] = (int) DB::table('property_services')->insertGetId(
                    $payload + ['created_at' => now()->subMonths(24)]
                );
            }
        }

        $this->seedServiceSubscriptionsAndBills($services, $serviceIds, $units);

        $this->command?->info('  Property services ready: '.count($services));
    }

    /**
     * @param  list<array<string, mixed>>  $services
     * @param  array<string, int>  $serviceIds
     * @param  array<string, int>  $units
     */
    private function seedServiceSubscriptionsAndBills(array $services, array $serviceIds, array $units): void
    {
        if (! Schema::hasTable('unit_service_subscriptions') || ! Schema::hasTable('unit_service_bills')) {
            return;
        }

        // Optional services opted into by specific apartments, so the resident
        // and admin screens both have a mix of active, pending and rejected.
        $optIns = [
            'Reserved Basement Parking Bay' => [
                'A-1104' => 'active',
                'B-1208' => 'active',
                'B-604' => 'active',
                'A-304' => 'pending',
            ],
            'Haly Net Fibre — 50 Mbps' => [
                'A-1104' => 'active',
                'A-706' => 'active',
                'B-1003' => 'active',
                'A-808' => 'active',
                'B-1105' => 'pending',
            ],
            'Water Tanker Top-Up' => [
                'A-1104' => 'active',
                'A-502' => 'active',
                'B-707' => 'active',
            ],
            'Apartment Deep Cleaning' => [
                'A-1002' => 'active',
                'B-405' => 'active',
                'A-1206' => 'rejected',
            ],
            'Pest Control & Fumigation' => [
                'A-1104' => 'active',
                'A-304' => 'active',
                'B-901' => 'active',
                'A-902' => 'active',
            ],
        ];

        $billedUnits = [];

        foreach ($optIns as $serviceName => $apartments) {
            $serviceId = $serviceIds[$serviceName] ?? null;
            if (! $serviceId) {
                continue;
            }

            foreach ($apartments as $unitNumber => $status) {
                $unitId = $units[$unitNumber] ?? null;
                if (! $unitId) {
                    continue;
                }

                $contactId = DB::table('units')->where('id', $unitId)->value('billing_contact_user_id');

                DB::table('unit_service_subscriptions')->updateOrInsert(
                    ['community_id' => $this->cid, 'service_id' => $serviceId, 'unit_id' => $unitId],
                    [
                        'requested_by' => $contactId,
                        'status' => $status,
                        'note' => $status === 'rejected' ? null : 'Requested through the resident app.',
                        'reviewed_by' => $status === 'pending' ? null : $this->adminId,
                        'reviewed_at' => $status === 'pending' ? null : now()->subMonths(2)->addDays(3),
                        'rejection_reason' => $status === 'rejected'
                            ? 'Apartment is tenanted — the owner needs to request this, not the tenant.'
                            : null,
                        'starts_at' => $status === 'active' ? now()->startOfMonth()->subMonths(2) : null,
                        'updated_at' => now(),
                        'created_at' => now()->subMonths(2),
                    ],
                );

                if ($status === 'active') {
                    $billedUnits[$serviceName][] = $unitNumber;
                }
            }
        }

        // Automatic services bill every apartment.
        foreach ($services as $service) {
            if ($service['type'] !== 'automatic') {
                continue;
            }
            $billedUnits[$service['name']] = array_keys($units);
        }

        $bills = 0;

        foreach ($services as $service) {
            $serviceId = $serviceIds[$service['name']] ?? null;
            $targets = $billedUnits[$service['name']] ?? [];
            if (! $serviceId || $targets === []) {
                continue;
            }

            for ($monthsBack = 2; $monthsBack >= 0; $monthsBack--) {
                $period = now()->startOfMonth()->subMonths($monthsBack);
                $dueDate = $period->copy()->day($service['due_day']);
                $issuedAt = $period->copy()->day(1)->setTime(10, 0);

                foreach (array_values($targets) as $index => $unitNumber) {
                    $unitId = $units[$unitNumber] ?? null;
                    if (! $unitId) {
                        continue;
                    }

                    $contactId = DB::table('units')->where('id', $unitId)->value('billing_contact_user_id');

                    if ($monthsBack > 0) {
                        $status = 'paid';
                    } else {
                        $status = match ($index % 4) {
                            0, 1 => 'paid',
                            2 => 'pending_verification',
                            default => 'unpaid',
                        };
                    }

                    $row = [
                        'community_id' => $this->cid,
                        'service_id' => $serviceId,
                        'unit_id' => $unitId,
                        'billing_contact_user_id' => $contactId,
                        'created_by' => $this->adminId,
                        'billing_period' => $period->toDateString(),
                        'title' => $service['name'].' — '.$period->format('F Y'),
                        'description' => $service['description'],
                        'amount' => $service['amount'],
                        'due_date' => $dueDate->toDateString(),
                        'status' => $status,
                        'payment_instructions' => $service['instructions'],
                        'require_acknowledgement' => $service['type'] === 'automatic',
                        'require_payment_proof' => true,
                        'updated_at' => now(),
                    ];

                    if ($status === 'paid') {
                        $paidOn = $dueDate->copy()->subDays(($index % 5) + 1);
                        $row += [
                            'payment_date' => $paidOn->toDateString(),
                            'payment_reference' => 'SVC-'.$period->format('ym').'-'.str_pad((string) (100 + $index), 4, '0', STR_PAD_LEFT),
                            'payment_note' => 'Transferred to the maintenance account.',
                            'proof_submitted_at' => $paidOn,
                            'proof_submitted_by' => $contactId,
                            'approved_by' => $this->adminId,
                            'approved_at' => $paidOn->copy()->addDay(),
                            'acknowledged_at' => $service['type'] === 'automatic' ? $issuedAt->copy()->addHours(6) : null,
                            'acknowledged_by' => $service['type'] === 'automatic' ? $contactId : null,
                        ];
                    } elseif ($status === 'pending_verification') {
                        $row += [
                            'payment_date' => now()->subDay()->toDateString(),
                            'payment_reference' => 'SVC-'.$period->format('ym').'-'.str_pad((string) (700 + $index), 4, '0', STR_PAD_LEFT),
                            'payment_note' => 'Paid last night, screenshot uploaded, waiting on the office.',
                            'proof_submitted_at' => now()->subDay(),
                            'proof_submitted_by' => $contactId,
                        ];
                    }

                    $existing = DB::table('unit_service_bills')
                        ->where('service_id', $serviceId)
                        ->where('unit_id', $unitId)
                        ->where('billing_period', $period->toDateString())
                        ->value('id');

                    if ($existing) {
                        DB::table('unit_service_bills')->where('id', $existing)->update($row);
                    } else {
                        DB::table('unit_service_bills')->insert($row + ['created_at' => $issuedAt]);
                        $bills++;
                    }
                }
            }
        }

        $this->command?->info('  Unit service bills added: '.$bills);
    }

    /* ─────────────────────────── notices ─────────────────────────── */

    private function seedNotices(): void
    {
        // [title, category, body, image, daysAgo, pinned, scheduleOffsetDays]
        $rows = [
            [
                'Welcome to Haly Tower',
                'general',
                "Welcome to Haly Tower. This app is how the building now runs: notices, the maintenance and utility bills, amenity bookings, the residents feed, the marketplace, and direct messages with the management office.\n\nThe office is on the ground floor beside the A-wing lift, open Monday to Saturday 9am to 6pm. Imran Chaudhry is the building manager — anything that needs a person rather than an app, start there.\n\nThree things worth knowing in your first week. One: your DHA parking sticker and your building bay number are two different things, and the guards check both. Two: air conditioners are not on the generator circuit, so running one during load-shedding will trip the relay for your whole floor. Three: the mini mart downstairs will run you a monthly tab if you ask, which is easier than keeping change for milk.",
                'dha-residential-tower',
                1,
                true,
                3,
            ],
            [
                'LESCO Load-Shedding Schedule — This Month',
                'maintenance',
                "LESCO has confirmed the feeder schedule for DHA Phase 2 this month: two slots on weekdays, roughly 11:00am to 12:30pm and 7:00pm to 8:30pm, with Sunday usually spared. Treat the times as approximate — they slip by twenty minutes either way.\n\nBoth generators start automatically on the changeover panel within about fifteen seconds. They carry the lifts, both lobbies, every corridor, the water pumps, the gym, the deck lighting and 2 kW per apartment.\n\nThat 2 kW does not stretch to an air conditioner. If you switch one on while the building is on generator, the protective relay will trip the riser for your entire floor and you will have twelve neighbours in the stairwell looking for you. Fans, lights, fridge, router and television are all fine.\n\nIf your apartment stays dark more than a minute after the building has switched over, your own MCB has tripped. Call the office rather than touching the riser panel.",
                'amenity-generator',
                2,
                true,
                30,
            ],
            [
                'Maintenance Charges — Rs 12,500 From This Month',
                'general',
                "The monthly maintenance charge is Rs 12,500 per apartment from this month, up from Rs 11,200. The committee circulated the workings before the vote and Bilal Akhtar's reconciliation is attached in Documents.\n\nWhat moved: guard wages up with the minimum wage revision, the DVR and camera contract renewed at a higher rate after two cameras on the ramp failed, and the sinking fund contribution raised so the external paint cycle in 2028 does not need a special levy.\n\nWhat has not moved: the generator charge stays at Rs 4,500, lift maintenance at Rs 1,800, and pool upkeep at Rs 2,200. Those are billed separately and you can see each one in the Bills section.\n\nDue on the 10th. Transfer and upload the screenshot, or pay cash at the office against a numbered receipt. Please do not hand cash to the guards — they are not authorised to take it and it has caused two disputes this year.",
                'pakistan-housing-society',
                3,
                true,
                10,
            ],
            [
                'Water Tanker Arrangement for Summer',
                'maintenance',
                "The boring cannot keep both overhead tanks full through the afternoon peak in May, June and July. It managed it until 2023; the water table in this part of DHA has dropped since.\n\nThe building will run two tanker deliveries a month for apartments that opt in, at Rs 2,500 a month. Opt in through Services before the end of April so the office can book the tanker schedule in advance — booking it in May costs almost double.\n\nIn the meantime: the pumps run 6am to 8am and 5pm to 7pm. Fill your apartment tank in those windows. If your tank runs dry outside them, it is almost always the float valve rather than the supply, and the office keeps spares.",
                'feed-monsoon-rain',
                4,
                false,
                25,
            ],
            [
                'SNGPL Gas Pressure Through Winter',
                'maintenance',
                "SNGPL pressure on the Phase 2 line drops sharply between 6am and 10am through December and January. This is a city-wide supply problem, not a fault in the building riser.\n\nThe building runs a compressor on the riser from the 1st of December, which lifts morning pressure enough for a kettle and a single burner. It will not run a geyser and a full hob at the same time, so plan accordingly.\n\nIf you smell gas at any time: do not use the lift on that floor, do not operate any switch, open the stairwell window, and call the office. The guards have the riser isolation key. Three apartments still have the original 2009 regulators — the office knows which, and those are being replaced before November.",
                'lahore-canal',
                5,
                false,
                45,
            ],
            [
                'Lift Maintenance — B Wing, Thursday',
                'maintenance',
                "The AMC engineers are in on Thursday for the quarterly service. B-wing passenger lift 2 will be out of service from 10am to about 4pm while the door operator that caused the 4th-floor stoppage is replaced.\n\nB-wing passenger lift 1 and the service lift both stay running. A wing is unaffected.\n\nIf you are moving anything large on Thursday, book the A-wing service lift through the office so the guards can put the pads up. The annual third-party rope inspection for all six lifts is in September and will be notified separately.",
                'dha-street',
                6,
                false,
                4,
            ],
            [
                'Ramadan Timings — Masjid, Lifts and Deliveries',
                'general',
                "Ramadan timings for the building, effective from the first fast.\n\nMasjid: Taraweeh after Isha in the ground-floor prayer hall, ladies section open with the screens drawn. Sehri announcement over the building PA twenty minutes before the end time. Iftar is communal in the Community Hall on Fridays and Saturdays — Dr. Nadia Saleem is coordinating the roster.\n\nLifts: both wings run normally. Expect genuine congestion for twenty minutes either side of Iftar; if you are able, take the stairs for one or two floors and leave the lift to the elderly and to anyone carrying food.\n\nDeliveries: the guards will allow food delivery riders to the lobby but not above it, as usual. Please come down. The office will not hold Iftar deliveries.\n\nThe gym closes at 4pm and reopens at 9:30pm. The pool keeps normal hours.",
                'event-iftar',
                7,
                true,
                14,
            ],
            [
                'DHA Parking Stickers and Building Bay Numbers',
                'general',
                "Two separate things that get confused every year.\n\nYour DHA Phase 2 vehicle sticker is issued by DHA and lets you through the sector gates. Renew it at the DHA office with your registration book and CNIC. The building cannot issue or renew it.\n\nYour building bay number is allotted by this office and painted on the floor of your bay in Basement 1 or 2. One bay per apartment comes with your title. Extra bays are Rs 3,500 a month and eleven were free as of this month — request one through Services.\n\nThe guards log both. A car in the basement with no bay number against it gets a note on the windscreen the first time and is clamped the second. Visitor bays 101 to 112 on the ramp level are capped at four hours and are not a second bay for a household with two cars.",
                'pakistan-gated-community',
                9,
                false,
                20,
            ],
            [
                'Monsoon: Basement Ramp and Drainage',
                'maintenance',
                "Before the monsoon sets in: the ramp sump pump has been serviced and the second pump that failed last August has been replaced. Both are on the generator circuit.\n\nEven so, in a genuine cloudburst the ramp takes water faster than the sump clears it. If the forecast is heavy, move cars from the four bays nearest the ramp mouth in Basement 1. The office will announce it on the PA and here, but do not wait for that if you can see the sky.\n\nSaba Noor in B-707 has worked DHA drainage projects since 2019 and is the fastest route to the sub-contractor when the sector line backs up. Do not pour anything down the basement gullies — they feed the same line.",
                'feed-monsoon-rain',
                11,
                false,
                18,
            ],
            [
                'Quarterly Fumigation — Floor by Floor',
                'maintenance',
                "The pest control team works the building over four days next week, floor by floor, roughly three floors a day. The office has posted the floor schedule on the board by both lifts and it is also in Documents.\n\nGel and spray for kitchens and bathrooms inside subscribed apartments; fogging of both basements, the compound and the bin area regardless. The formulation is child and pet safe once dry, but keep cats and birds out of a treated room for two hours.\n\nIf you are not subscribed and want the apartment done, opt in through Services before Friday and they will include you in your floor's slot rather than making a separate visit.",
                'amenity-mini-mart',
                13,
                false,
                7,
            ],
            [
                'Fire Drill and Equipment Check',
                'general',
                "A full evacuation drill is scheduled for this month, announced on the PA on the day. Both stairwells, both wings, muster in the rear compound by the cricket net.\n\nAhead of it: every extinguisher in both wings has been serviced and re-tagged, the hose reels on floors 4, 8, 12 and 16 have been pressure-tested, and the basement smoke detectors have been cleaned. Three corridor detectors were replaced.\n\nWhat we need from you. Keep the fire lanes in the basement clear — they are painted red and a car in one is towed, not warned. Do not store anything in the stairwell landings; four floors currently have boxes, cycles or furniture on the landing and the office will remove them without further notice. Know which stairwell is nearer your door, because in smoke you will not be reading signs.",
                'notice-security',
                15,
                false,
                12,
            ],
            [
                'Guard Roster, CCTV and the Night Gate',
                'general',
                "Six guards across three shifts, two on each gate plus a rover, under the contract renewed in January. Col. (R) Shahbaz Khan audits the roster and the CCTV log on Sunday mornings and the office publishes anything notable here.\n\nThe rear gate is locked from 11pm to 5am. Use the main gate at night; the guard there has the register and the intercom to every apartment.\n\nCCTV covers both gates, both lobbies, all six lift cars, the ramp and both basement levels. Footage is kept twenty-one days. If you need a clip pulled, ask the office in writing with the date and a time window — the guards cannot release footage themselves and will not.\n\nTwo cameras on the ramp failed in February and were replaced under the new contract. The blind spot behind the generator room is known and a seventh camera is budgeted for next quarter.",
                'notice-security',
                18,
                false,
                30,
            ],
            [
                'Bin Area, Waste Collection and the Chute',
                'maintenance',
                "The DHA collection van comes daily between 7:30 and 9am. The building bin area is at the rear, past the cricket net.\n\nThe chutes on each floor are for household waste in tied bags only. They are not for construction debris, not for glass, and emphatically not for anything wet and unbagged — the ground-floor chute room smells the way it does right now because of exactly that.\n\nIf you are having work done in your apartment, the contractor takes the rubble away. Rubble left in the bin area is charged to the apartment, because DHA will not take it and the building pays a private tractor to.\n\nKitchen waste after a large event: tell the office and they will arrange an extra pickup rather than have it sit in the bin area overnight attracting cats.",
                'feed-street-vendor',
                21,
                false,
                22,
            ],
            [
                'External Paint Cycle and the Sinking Fund',
                'general',
                "The external paint cycle is due in 2028. The committee has raised the sinking fund contribution inside the new maintenance charge so it is funded by then without a special levy, which is what happened in 2019 and which nobody enjoyed.\n\nCurrent position, verified against the account by Bilal Akhtar: the fund covers a little over a third of the quoted scope at today's prices. The quote will be re-tendered in 2027.\n\nSeparately, the balcony railings on the south face are showing rust at the base on floors 3 to 7. Those are being treated and repainted this winter out of the regular maintenance budget, not the sinking fund. Please clear your balcony on the notified day.",
                'lahore-skyline',
                26,
                false,
                60,
            ],
            [
                'Tenancy, Police Verification and the Owner\'s Responsibility',
                'general',
                "A reminder as the tenancy season turns over. Every tenancy in the building needs a written agreement, a copy with the office, and police verification of the tenant through the DHA process. No exceptions, and the owner is the one answerable for it.\n\nMaryam Javed in B-405 drafted the tenancy addendum the building uses. It is in Documents. Read it before you sign whatever your agent puts in front of you.\n\nIf you rent out your apartment: your tenant gets the amenities and the app, but the maintenance charge, the bay allotment and anything structural remain yours. An unregistered tenant is refused entry at the gate, which is an embarrassing way for everyone to discover the paperwork was never filed.",
                'lahore-gulberg',
                30,
                false,
                40,
            ],
        ];

        foreach ($rows as [$title, $category, $body, $image, $daysAgo, $pinned, $scheduleOffset]) {
            $schedule = now()->addDays($scheduleOffset);

            DB::table('notices')->updateOrInsert(
                ['community_id' => $this->cid, 'title' => $title],
                [
                    'author_id' => $this->adminId,
                    'category' => $category,
                    'body' => $body,
                    'image_url' => $this->img($image),
                    'event_date' => $schedule->toDateString(),
                    'event_time' => '09:00',
                    'event_time_end' => '18:00',
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
        // [title, body, image, daysFromNow, start, end, capacity, location, pinned]
        $rows = [
            [
                'Eid ul-Fitr Rooftop Breakfast',
                "Eid Mubarak. The building does a communal breakfast on the rooftop deck on the first morning of Eid, after the Eid prayer, and it has become the one morning of the year everyone is actually on the same floor.\n\nHalwa puri, nihari, parathas and chai, catered from the Phase 2 market. Dr. Nadia Saleem is coordinating; the children's Eidi hunt on the deck starts about an hour in and has outgrown the space twice already.\n\nRSVP with your headcount so the order is right. Please come up rather than sending a helper for a plate — the point of this one is that everybody comes up.",
                'event-eid',
                9,
                '08:30',
                '11:30',
                90,
                'Rooftop Terrace & BBQ Deck, 16th Floor',
                true,
            ],
            [
                'Community Iftar — Friday',
                "Communal Iftar in the Community Hall this Friday. Catered from Saadi Di Sajji and Khas Samosa, with dates and chai from the mini mart downstairs.\n\nMen in the main hall, ladies section through the side entrance with screens up. Maghrib jamaat follows immediately in the prayer hall, then Taraweeh.\n\nRSVP by Thursday noon so the order is right — last Friday we were forty plates short and that is a bad way to begin a fast. Contribution is Rs 800 a head, payable at the office or to Dr. Nadia Saleem.",
                'event-iftar',
                3,
                '18:15',
                '20:30',
                150,
                'Community Hall, Ground Floor',
                true,
            ],
            [
                'Independence Day — 14 August',
                "Jashn-e-Azadi on the rooftop deck. Flag hoisting at 8am sharp with the national anthem, then breakfast, then the children's painting competition which Hina Qureshi is judging and about which she has already received three complaints.\n\nThe building will be lit green and white from the 13th. If you want to put up lights on your own balcony, use the clips from the office rather than nails — the railings on the south face are being treated for rust this winter and we would rather not add holes.\n\nNo fireworks and no aerial firing. Both are illegal and one of them killed a boy in Phase 4 two years ago.",
                'event-independence-day',
                24,
                '08:00',
                '11:00',
                120,
                'Rooftop Terrace & BBQ Deck, 16th Floor',
                false,
            ],
            [
                'Basant Rooftop Gathering — Kites Grounded',
                "Basant on the rooftop, with one firm condition: no kite flying from the building. Metallic and nylon string is banned in Punjab, it is banned here, and the Orange Line feeder behind Ghazi Road is three hundred metres from this roof.\n\nWhat we will do: dhol, the deck lit up, pakoras and jalebi from the market, and the kites up on the wall as decoration rather than in the air. Col. Khan has volunteered to be visibly unimpressed by all of it.\n\nIf you see string on the roof or on a balcony, tell the office. Every year a bird comes down on the terrace and every year it is avoidable.",
                'event-basant-kites',
                17,
                '17:00',
                '22:00',
                80,
                'Rooftop Terrace & BBQ Deck, 16th Floor',
                false,
            ],
            [
                'Residents Welfare Committee — Annual Meeting',
                "The annual general meeting of the residents welfare committee, in the Community Hall. One apartment, one vote, and proxies in writing to the office before the day.\n\nOn the agenda: the maintenance charge and the workings behind it, Bilal Akhtar's reconciliation of the account, the seventh CCTV camera for the generator-room blind spot, the sinking fund position ahead of the 2028 paint cycle, the balcony railing treatment on the south face, and the two-year guard contract coming up for renewal in January.\n\nZainab Haider is chairing. If you want something added to the agenda, send it to the office a week in advance — raising it from the floor at 9pm is how last year ran until midnight.",
                'event-milad',
                13,
                '19:30',
                '21:30',
                180,
                'Community Hall, Ground Floor',
                true,
            ],
            [
                'Inter-Wing Cricket Match — A Wing vs B Wing',
                "The annual A versus B tape-ball match, on the DHA Phase 2 ground rather than our own net, because the net cannot hold a match and the compound certainly cannot.\n\nSixteen overs a side. Dr. Faisal Mahmood captains A, Zeeshan Butt captains B, and Col. Khan has agreed to umpire on the condition that nobody appeals twice for the same ball.\n\nRSVP if you are playing. Spectators welcome and genuinely wanted — bring chairs, there is no stand. Chai and samosas from Khas Samosa at the innings break.",
                'event-cricket-match',
                6,
                '16:00',
                '19:00',
                40,
                'DHA Phase 2 Cricket Ground',
                false,
            ],
            [
                'Qawwali Night on the Deck',
                "A qawwali party from the Shah Jamal circle, on the rooftop deck after Isha. Four performers, harmonium and tabla, no amplification beyond what the deck already has — the DHA noise limit applies and we intend to stay inside it.\n\nSeating for sixty, floor cushions rather than chairs. Chai and barfi throughout.\n\nHard stop at 11pm. Daniel-style complaints from the 14th floor are entirely fair after that and the office will act on them. RSVP so we know whether sixty is enough.",
                'event-qawwali',
                20,
                '21:00',
                '23:00',
                60,
                'Rooftop Terrace & BBQ Deck, 16th Floor',
                false,
            ],
            [
                'Milad-un-Nabi Gathering',
                "Milad in the ground-floor prayer hall, with the ladies section open and screens drawn. Naat recitation by residents' children, a short bayan, and langar in the Community Hall afterwards.\n\nImam Sahib is leading. If your child wants to recite, give their name to the office by the Thursday before so the order can be set — last year we had eleven volunteers and no list.\n\nLangar contributions to Dr. Nadia Saleem or at the office. RSVP helps with the catering count.",
                'event-milad',
                31,
                '19:00',
                '21:00',
                120,
                'Jamia Masjid Prayer Hall, Ground Floor',
                false,
            ],
            [
                'Blood Donation Camp with National Hospital',
                "Dr. Faisal Mahmood has arranged a blood donation camp in the Community Hall with the transfusion team from National Hospital on Defence Road.\n\nWalk in with your CNIC. Screening on site, the whole thing takes about twenty-five minutes including the juice and biscuits afterwards. Eighteen to sixty, above fifty kilos, and not fasting on the day.\n\nThey are short on O negative and B negative in particular. Eleven residents donated last year and the target this time is thirty. RSVP so the team brings enough bags.",
                'lahore-shrine',
                11,
                '10:00',
                '15:00',
                60,
                'Community Hall, Ground Floor',
                false,
            ],
            [
                'Winter Barbecue on the Deck',
                "The deck is at its best in December and this is the evening it earns its keep. Both charcoal grills going, seekh kebab and malai boti marinated by Kamran Rashid's kitchen, naan brought up hot from the tandoor in the market.\n\nRs 1,800 a head, children under ten free. Pay at the office by the Wednesday before. Bring a shawl — sixteen floors up in December is colder than the forecast suggests.\n\nString lights are on the generator circuit, so load-shedding will not end the evening. RSVP with your headcount.",
                'food-barbecue-platter',
                27,
                '19:00',
                '22:30',
                70,
                'Rooftop Terrace & BBQ Deck, 16th Floor',
                false,
            ],
            [
                'Children\'s Sports Day in the Compound',
                "Sack races, a sprint along the rear compound, musical chairs and a penalty shootout against whichever father is least able to say no. Ages four to thirteen.\n\nHina Qureshi and Dr. Nadia Saleem are organising, with medals for everyone and trophies for the top three in each age band. Parents are needed as marshals — four volunteers still wanted, tell the office.\n\nStarts after the heat drops. Juice and ice cream from the mini mart. RSVP with your children's names and ages so the age bands can be set properly.",
                'feed-children-park',
                15,
                '17:00',
                '19:30',
                60,
                'Rear Compound',
                false,
            ],
            [
                'Yoga and Stretch Class — Tuesdays & Thursdays',
                "The twice-weekly morning class on the badminton court, 7am sharp, run by an instructor from Phase 4. Mixed level, forty-five minutes, mats provided.\n\nRs 3,500 a month for eight sessions, paid at the office. Drop-in is Rs 600 if you want to try one first.\n\nThe court is released to badminton bookings at 8:05, so the class genuinely does start at 7 and genuinely does finish on time. RSVP to join the current block.",
                'amenity-badminton',
                2,
                '07:00',
                '07:45',
                18,
                'Badminton Court, Podium Level',
                false,
            ],
        ];

        foreach ($rows as [$title, $body, $image, $daysFromNow, $start, $end, $capacity, $location, $pinned]) {
            DB::table('notices')->updateOrInsert(
                ['community_id' => $this->cid, 'title' => $title],
                [
                    'author_id' => $this->adminId,
                    'category' => 'event',
                    'body' => $body,
                    'location' => $location,
                    'image_url' => $this->img($image),
                    'event_date' => now()->addDays($daysFromNow)->toDateString(),
                    'event_time' => $start,
                    'event_time_end' => $end,
                    'event_capacity' => $capacity,
                    'requires_rsvp' => true,
                    'is_pinned' => $pinned,
                    'status' => 'published',
                    'review_status' => 'approved',
                    'is_global' => false,
                    'approved_by' => $this->adminId,
                    'approved_at' => now()->subDays(5),
                    'published_at' => now()->subDays(5),
                    'updated_at' => now()->subDays(5),
                    'created_at' => now()->subDays(5),
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

        $pattern = ['going', 'going', 'going', 'maybe', 'going', 'not_going', 'going', 'maybe'];

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
                        'created_at' => now()->subDays(($index % 4) + 1),
                    ]
                );
            }
        }
    }

    private function seedAlert(): void
    {
        DB::table('notices')->updateOrInsert(
            ['community_id' => $this->cid, 'title' => 'Urgent: Water Pump Failure — B Wing Riser'],
            [
                'author_id' => $this->adminId,
                'category' => 'emergency',
                'body' => "The booster pump on the B-wing riser failed at about 5:40 this morning. B wing has no mains pressure above the 8th floor until it is back. A wing is unaffected.\n\nThe technician is on site. The impeller has seized and the replacement is coming from Badami Bagh — the office is being told two to three hours, which in practice means this afternoon. We will update here the moment the pump runs, not before.\n\nIn the meantime: a tanker has been booked and will fill the B-wing overhead tank by hand-line from the compound around noon. That will give B wing enough for bathrooms and kitchens, not for washing machines or car washing. Please hold both until tomorrow.\n\nDrinking water: the mini mart has nineteen-litre bottles and the office has arranged for them to hold stock for B-wing apartments specifically. If you have an elderly resident or a newborn on a high floor in B wing, tell the guards and someone will carry water up.\n\nDo not run your motor dry trying to draw from an empty riser. Two pumps burned out that way last August and both were avoidable.",
                'image_url' => $this->img('feed-monsoon-rain'),
                'status' => 'published',
                'review_status' => 'approved',
                'is_global' => false,
                'is_pinned' => true,
                'approved_by' => $this->adminId,
                'approved_at' => now()->subHours(6),
                'published_at' => now()->subHours(6),
                'updated_at' => now()->subHours(6),
                'created_at' => now()->subHours(6),
            ]
        );
    }

    /* ─────────────────────────── feed ─────────────────────────── */

    private function seedFeed(): void
    {
        // [email, category, body, image, daysAgo]
        $posts = [
            [
                HalyTowerCommunitySeeder::RESIDENT_EMAIL,
                'general',
                "Sixteenth-floor sunset this evening was absurd. If you have not been up to the deck since the weather turned, go this week — the haze clears for about twenty minutes before Maghrib and you can see all the way past the Cantt.",
                'feed-sunset-rooftop',
                0,
            ],
            [
                'ayesha.haly@havena.app',
                'general',
                "The jasmine on the fifth-floor landing has come out. I planted it in 2022 after someone told me it would not survive a corridor and it is now taller than the fire extinguisher. Please do not let the cleaners cut it back — I water it myself.",
                'feed-jasmine',
                1,
            ],
            [
                'usman.haly@havena.app',
                'general',
                "Generator missed the changeover at 7:12 last night and the A-wing corridor lights were out for about forty seconds before it caught. Reported it to the office. If it happens again, it is the start battery rather than the panel, and I have a spare in A-706.",
                'amenity-generator',
                1,
            ],
            [
                'kamran.haly@havena.app',
                'general',
                "Mangoes are in. Chaunsa from the Multan truck that parks on Ghazi Road on Thursday mornings — Rs 280 a kilo and the best I have had in three seasons. I bought two crates for the kitchen, happy to split the second with whoever wants a share.",
                'feed-mango',
                2,
            ],
            [
                'rabia.haly@havena.app',
                'general',
                "Two seats free in the car to Phase 5 at 7:30 most mornings, and coming back about 5. Ghazi Road is a car park by 8:15 so leaving on time matters. Message me if you want in — splitting petrol three ways has saved me more than I expected.",
                'feed-rickshaw',
                2,
            ],
            [
                'hina.haly@havena.app',
                'event',
                "Sports day volunteers: I have four of the eight marshals I need. It is two hours in the compound, mostly standing at a cone and telling a seven-year-old the race has not started yet. Please.",
                'feed-children-park',
                3,
            ],
            [
                'faisal.haly@havena.app',
                'general',
                "Blood camp is confirmed for the 11th with the National Hospital team. They are short on O negative and B negative. Eleven of us donated last year; thirty is the target this time and it is genuinely achievable in a building this size.",
                'lahore-shrine',
                3,
            ],
            [
                'bilal.haly@havena.app',
                'general',
                "Quarterly reconciliation of the maintenance account is up in Documents. Short version: the account balances, the generator line is Rs 41,000 under budget because diesel dipped in February, and the sinking fund is where the committee said it would be. Questions welcome; I would rather answer them now than at the AGM at 11pm.",
                'pakistan-housing-society',
                4,
            ],
            [
                'saba.haly@havena.app',
                'general',
                "Ramp sump pump has been serviced and the failed second pump replaced. Both on the generator circuit now. In a real cloudburst the ramp will still take water faster than the sump clears it, so move your car out of the four bays nearest the ramp mouth if the sky looks like August.",
                'feed-monsoon-rain',
                5,
            ],
            [
                'nadia.haly@havena.app',
                'event',
                "Iftar roster for the remaining Fridays is on the office board. Two families still needed for the last Friday. Catering is from Saadi Di Sajji again because last time nobody complained, which for this building is a standing ovation.",
                'event-iftar',
                5,
            ],
            [
                'ahmed.haly@havena.app',
                'general',
                "If your maintenance transfer has not shown up, it is almost certainly the reference. Put your apartment number and nothing else — no names, no 'maintenance Feb'. Our reconciliation is manual and an unmatched transfer sits in suspense for a fortnight. Also: please do not ask me about this at Friday prayers.",
                'lahore-gulberg',
                6,
            ],
            [
                'maryam.haly@havena.app',
                'general',
                "The tenancy addendum is in Documents. Three people have signed agent-drafted agreements this year with no notice clause and no exit on the owner's side, and two of those are now messy. It takes ten minutes to read. Please read it.",
                'lahore-museum',
                7,
            ],
            [
                'zeeshan.haly@havena.app',
                'general',
                "For the record: bays 44 and 45 in Basement 1 are on my title and the showroom plates in them are mine. Fourth note on a windscreen this month. Happy to show the paperwork to anybody who wants to see it, including the guards, who already have a copy.",
                'dha-residential-tower',
                8,
            ],
            [
                'farah.haly@havena.app',
                'general',
                "The chemist in the Phase 2 market where I work keeps a nebuliser and a BP machine behind the counter for residents of this building, no charge. If a child is wheezing at midnight you do not need to drive to Defence Road. Ask the guards to call me.",
                'lahore-food-street',
                9,
            ],
            [
                'shahbaz.haly@havena.app',
                'general',
                "Sunday CCTV review: nothing to report at either gate, which is how it should be. One thing worth saying — the rear gate was found unlocked at 11:40 on Wednesday. It is locked 11pm to 5am and the guard concerned has been spoken to. Use the main gate at night.",
                'notice-security',
                10,
            ],
            [
                HalyTowerCommunitySeeder::RESIDENT_EMAIL,
                'general',
                "Fruit cart that stops outside the gate at about 5pm has the best guavas in the sector and will come up to the lobby if the guards call him. He does not take cards, so keep a note downstairs.",
                'feed-fruit-cart',
                11,
            ],
            [
                'ayesha.haly@havena.app',
                'general',
                "Bougainvillea along the rear compound wall has gone completely out of control and it is magnificent. The gardener wants to cut it back to the stem. I have asked him to wait until after the cricket match so we at least get photographs.",
                'feed-bougainvillea',
                13,
            ],
            [
                'usman.haly@havena.app',
                'general',
                "Haly Net has been solid for three months now — 50 down, 25 up, and the ONT stays alive through load-shedding because it is on the backup circuit. Worth the Rs 4,200 if you work from home. The router deposit is refundable, which I did not realise until I asked.",
                'lahore-orange-line',
                15,
            ],
        ];

        foreach ($posts as [$email, $category, $body, $image, $daysAgo]) {
            $userId = $this->uid($email);
            if (! $userId) {
                continue;
            }

            $at = now()->subDays($daysAgo)->subHours(($daysAgo % 5) + 2);

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
        $this->seedPolls();
        $this->recountEngagement();

        $this->command?->info('  Feed posts ready: '.count($posts));
    }

    private function seedComments(): void
    {
        $groups = [
            'Sixteenth-floor sunset this evening was absurd%' => [
                ['ayesha.haly@havena.app', 'Went up after reading this. You undersold it.'],
                ['usman.haly@havena.app', 'Twenty minutes before Maghrib is exactly right. Any earlier and the haze eats it.'],
                ['nadia.haly@havena.app', 'This is why the Eid breakfast is on the deck and not in the hall.'],
            ],
            'The jasmine on the fifth-floor landing has come out%' => [
                [HalyTowerCommunitySeeder::RESIDENT_EMAIL, 'I take the stairs from five to eleven just for that landing in June. Nobody is cutting it back.'],
                ['hina.haly@havena.app', 'My daughter calls it the smelling floor. Meant entirely as a compliment.'],
                ['farah.haly@havena.app', 'Coming in at eleven at night and hitting that smell is the best part of the shift.'],
            ],
            'Generator missed the changeover at 7:12 last night%' => [
                [HalyTowerCommunitySeeder::ADMIN_EMAIL, 'Logged, thank you. The AMC engineer is in on Thursday for the lift and will test both start batteries while he is here.'],
                ['shahbaz.haly@havena.app', 'Forty seconds is forty seconds. It was eleven minutes in August 2024 and I have not forgotten.'],
                ['saba.haly@havena.app', 'Worth checking the changeover timer as well. Ours drifted by three seconds a month on the last site I worked.'],
            ],
            'Mangoes are in. Chaunsa from the Multan truck%' => [
                ['nadia.haly@havena.app', 'Take the second crate. I will collect from your kitchen this evening.'],
                ['rabia.haly@havena.app', 'Which Thursday morning? I pass Ghazi Road at 7:30 and can pick up for anyone who asks.'],
                ['kamran.haly@havena.app', 'He is there from about six and gone by nine. Go early, the good crates move first.'],
                [HalyTowerCommunitySeeder::RESIDENT_EMAIL, 'Rs 280 is a fair price this early. Liberty was asking 340 last week.'],
            ],
            'Two seats free in the car to Phase 5 at 7:30%' => [
                ['ahmed.haly@havena.app', 'If you ever want to go via the bank I will take the third seat on Mondays.'],
                ['rabia.haly@havena.app', 'Easily done, it is two minutes off the route. Monday is yours.'],
            ],
            'Sports day volunteers: I have four of the eight marshals%' => [
                [HalyTowerCommunitySeeder::RESIDENT_EMAIL, 'Put me down. I can do the sprint end.'],
                ['bilal.haly@havena.app', 'And me. I will take musical chairs, which I understand to be the dangerous one.'],
                ['zeeshan.haly@havena.app', 'I will do the penalty shootout. I would like it on record that I tried to say no.'],
                ['hina.haly@havena.app', 'Seven. One more and we are there. Thank you all.'],
            ],
            'Blood camp is confirmed for the 11th%' => [
                ['farah.haly@havena.app', 'I am O negative and I will be there. Also happy to help with screening paperwork, I do it daily anyway.'],
                ['shahbaz.haly@havena.app', 'Count me in. Donated fourteen times, never once regretted it.'],
                ['maryam.haly@havena.app', 'Will the team take walk-ins from Phase 2 generally or residents only?'],
                ['faisal.haly@havena.app', 'Residents and their families. Any wider and we will not have the bags.'],
            ],
            'Quarterly reconciliation of the maintenance account is up%' => [
                [HalyTowerCommunitySeeder::RESIDENT_EMAIL, 'Thank you for doing this properly. The sinking fund line is the one I was worried about and it is fine.'],
                ['ahmed.haly@havena.app', 'Read it twice. The suspense account note is the useful bit — that is the unmatched transfers I keep going on about.'],
                ['shahbaz.haly@havena.app', 'This is what an audit should look like. No notes.'],
            ],
            'Ramp sump pump has been serviced%' => [
                [HalyTowerCommunitySeeder::ADMIN_EMAIL, 'The office will announce on the PA when the forecast is heavy, but Saba is right — do not wait for us if you can see it coming.'],
                ['zeeshan.haly@havena.app', 'Bays 44 and 45 are nowhere near the ramp mouth, so for once this is not about me.'],
            ],
            'Iftar roster for the remaining Fridays%' => [
                [HalyTowerCommunitySeeder::RESIDENT_EMAIL, 'We will take the last Friday. A-1104.'],
                ['hina.haly@havena.app', 'And us, so that is both. Saadi Di Sajji again please, the sajji was the only thing that arrived hot last time.'],
            ],
            'If your maintenance transfer has not shown up%' => [
                ['bilal.haly@havena.app', 'This is the single biggest source of noise in the reconciliation. Apartment number only. Please.'],
                ['kamran.haly@havena.app', 'Guilty. I put "Kamran maintenance" for two years and wondered why I kept getting reminders.'],
                ['maryam.haly@havena.app', 'Could the office not just publish this as a standing notice? It comes up every month.'],
                [HalyTowerCommunitySeeder::ADMIN_EMAIL, 'Fair. It is now in the pinned maintenance notice and on the payment instructions for every bill.'],
            ],
            'The tenancy addendum is in Documents%' => [
                ['zeeshan.haly@havena.app', 'Read it. Changed what I was about to sign. Thank you.'],
                ['farah.haly@havena.app', 'As a tenant: the notice clause cuts both ways and I would want it there too.'],
            ],
            'For the record: bays 44 and 45 in Basement 1%' => [
                [HalyTowerCommunitySeeder::ADMIN_EMAIL, 'Noted and circulated to all three shifts. Apologies — the night guard who wrote the last one was new and has now seen the allotment register.'],
                ['shahbaz.haly@havena.app', 'The register is the answer to all of this. It exists. People should read it.'],
            ],
            'The chemist in the Phase 2 market where I work%' => [
                ['nadia.haly@havena.app', 'This is genuinely useful and should be on the lobby board, not just here.'],
                ['hina.haly@havena.app', 'Used it in February at one in the morning for my son. Cannot thank you enough.'],
                [HalyTowerCommunitySeeder::ADMIN_EMAIL, 'Going on the board by both lifts tomorrow, with Farah\'s apartment number and the guards\' instruction.'],
            ],
            'Sunday CCTV review: nothing to report at either gate%' => [
                ['maryam.haly@havena.app', 'Thank you for publishing the unlocked gate rather than quietly handling it. That matters.'],
                ['saba.haly@havena.app', 'The blind spot behind the generator room is the one that worries me. Is the seventh camera actually budgeted?'],
                [HalyTowerCommunitySeeder::ADMIN_EMAIL, 'Budgeted for next quarter and on the AGM agenda. If the meeting wants it sooner it can vote for it.'],
            ],
            'Fruit cart that stops outside the gate at about 5pm%' => [
                ['ayesha.haly@havena.app', 'His guavas are better than anything in the market and about half the price.'],
                ['rabia.haly@havena.app', 'He now knows which floor I am on, which is both lovely and slightly alarming.'],
            ],
            'Haly Net has been solid for three months%' => [
                ['rabia.haly@havena.app', 'Same. I teach two online sessions a week and it has not dropped once during load-shedding.'],
                [HalyTowerCommunitySeeder::RESIDENT_EMAIL, 'Switched in January. The ONT being on the backup circuit is the whole value of it.'],
                ['bilal.haly@havena.app', 'Worth saying the deposit is refundable. I assumed it was not and nearly did not sign up.'],
            ],
        ];

        foreach ($groups as $bodyLike => $comments) {
            $postId = DB::table('posts')
                ->where('community_id', $this->cid)
                ->where('body', 'like', $bodyLike)
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

    /** Two live polls in the feed — one closing soon, one with plenty of time left. */
    private function seedPolls(): void
    {
        if (! Schema::hasTable('polls')) {
            return;
        }

        $polls = [
            [
                'email' => HalyTowerCommunitySeeder::RESIDENT_EMAIL,
                'body' => "Committee wants a sense of the building before the AGM: where should the next Rs 400,000 of discretionary spend go? One vote per apartment, and the result goes on the agenda rather than straight into a decision.",
                'image' => 'pakistan-housing-society',
                'daysAgo' => 4,
                'question' => 'Where should the next discretionary spend go?',
                'description' => 'Indicative only. The AGM decides, but the committee would rather walk in knowing what the building thinks.',
                'duration' => 10,
                'options' => [
                    'Seventh CCTV camera + DVR upgrade',
                    'Resurface the basement floor and repaint bay numbers',
                    'Second lift door operator as a spare',
                    'Shade structure over the kids play area',
                ],
                // Votes distributed across the approved residents, by option index.
                'weights' => [0, 1, 0, 3, 0, 2, 1, 0, 3, 0, 1, 2, 0, 3],
            ],
            [
                'email' => 'nadia.haly@havena.app',
                'body' => "Planning the Eid breakfast order and the deck only seats ninety comfortably. Which sitting would you actually come to? Honest answers please — last year I catered for one timing and half the building arrived at the other.",
                'image' => 'event-eid',
                'daysAgo' => 2,
                'question' => 'Eid breakfast — which sitting suits you?',
                'description' => 'Two sittings are possible if the split is roughly even. One is easier for the caterer.',
                'duration' => 5,
                'options' => [
                    'Straight after Eid prayer, around 8:30',
                    'Later sitting, around 10:30',
                    'Either is fine',
                ],
                'weights' => [0, 0, 1, 2, 0, 1, 0, 2, 1, 0, 0, 1, 2, 0],
            ],
        ];

        foreach ($polls as $poll) {
            $userId = $this->uid($poll['email']);
            if (! $userId) {
                continue;
            }

            $at = now()->subDays($poll['daysAgo']);

            DB::table('posts')->updateOrInsert(
                ['community_id' => $this->cid, 'user_id' => $userId, 'body' => $poll['body']],
                [
                    'category' => 'general',
                    'image_url' => $this->img($poll['image']),
                    'status' => 'approved',
                    'approved_at' => $at,
                    'likes_count' => 0,
                    'comments_count' => 0,
                    'updated_at' => $at,
                    'created_at' => $at,
                ]
            );

            $postId = (int) DB::table('posts')
                ->where('community_id', $this->cid)
                ->where('user_id', $userId)
                ->where('body', $poll['body'])
                ->value('id');

            if (! $postId) {
                continue;
            }

            $pollPayload = [
                'post_id' => $postId,
                'question' => $poll['question'],
                'description' => $poll['description'],
                'duration_days' => $poll['duration'],
                'ends_at' => $at->copy()->addDays($poll['duration']),
                'updated_at' => $at,
            ];

            $pollId = DB::table('polls')->where('post_id', $postId)->value('id');

            if ($pollId) {
                DB::table('polls')->where('id', $pollId)->update($pollPayload);
            } else {
                $pollId = DB::table('polls')->insertGetId($pollPayload + ['created_at' => $at]);
            }

            $optionIds = [];
            foreach ($poll['options'] as $position => $label) {
                DB::table('poll_options')->updateOrInsert(
                    ['poll_id' => $pollId, 'position' => $position],
                    ['label' => $label, 'updated_at' => $at, 'created_at' => $at],
                );

                $optionIds[$position] = (int) DB::table('poll_options')
                    ->where('poll_id', $pollId)
                    ->where('position', $position)
                    ->value('id');
            }

            foreach ($this->approvedResidentIds() as $index => $voterId) {
                $position = $poll['weights'][$index % count($poll['weights'])] ?? 0;
                $optionId = $optionIds[$position] ?? null;
                if (! $optionId) {
                    continue;
                }

                DB::table('poll_votes')->updateOrInsert(
                    ['poll_id' => $pollId, 'user_id' => $voterId],
                    ['option_id' => $optionId, 'created_at' => $at->copy()->addHours($index + 1)],
                );
            }
        }

        $this->command?->info('  Polls ready: '.count($polls));
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
            $take = 5 + ($index % 9);
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
                'zeeshan.haly@havena.app',
                'for_sale',
                'Vehicles',
                'used',
                'Honda CD 125 — 2022, One Owner',
                165000,
                "Bought new in 2022, done 11,400 km, all of it in Phase 2 and Phase 5. Serviced at the authorised workshop on Walton Road with the book stamped every time. New battery in January, tyres are the originals and have maybe a year in them.\n\nFile is clear and in my name. Selling because I have three vehicles and two bays. Priced for a quick sale to someone in the building — I would rather it went to a neighbour than to the Sunday bazaar.",
                ['dha-street'],
                3,
            ],
            [
                'kamran.haly@havena.app',
                'for_sale',
                'Home & Garden',
                'used',
                'Seven-Seater Sofa Set — Solid Sheesham',
                85000,
                "Sheesham frame made to order in 2021 by the carpenter in Phase 1, seven seats plus a centre table. Upholstery is a dark olive linen blend, cleaned professionally last month, one small mark on the left arm which I have photographed honestly.\n\nGenuinely heavy — you will need the service lift and two men. Selling because the drawing room is being redone. Collection from B-604 any evening this week.",
                ['lahore-gulberg'],
                5,
            ],
            [
                'usman.haly@havena.app',
                'for_sale',
                'Electronics',
                'used',
                '1.5 Ton Inverter AC — Haier, Two Seasons Old',
                95000,
                "Haier 1.5 ton DC inverter, bought June 2024, used two summers in a bedroom. Cools a 14x16 room to 24 degrees in about ten minutes. Gas has never been topped up, which tells you there are no leaks.\n\nIncludes the outdoor unit, bracket and remote. Warranty card is in the box with eighteen months left on the compressor. Uninstallation is on you — the technician from the market charges about Rs 2,500 and does it properly.",
                ['amenity-generator'],
                6,
            ],
            [
                'bilal.haly@havena.app',
                'for_sale',
                'Electronics',
                'used',
                '3 kVA Generator — Honda, Little Used',
                72000,
                "Honda EP2500, petrol, bought in 2021 when the load-shedding was worse than it is now. Runs a fridge, fans and lights comfortably. Perhaps sixty hours on it total — oil changed twice regardless.\n\nSelling because the building generator carries us fine now and this has been sitting in the store room making me feel guilty. Starts first pull. Comes with the trolley and a twenty-litre jerry can.",
                ['amenity-generator'],
                8,
            ],
            [
                'ahmed.haly@havena.app',
                'for_sale',
                'Electronics',
                'used',
                'UPS 1500VA with Two Tubular Batteries',
                48000,
                "Homage 1500VA inverter with two 185Ah tubular batteries, installed 2023. Batteries were replaced eleven months ago and hold a full four hours on fans and lights.\n\nMostly redundant now that the building backup covers 2 kW per apartment, but still the right answer if you want your router and a bedroom fan independent of the generator changeover. Wall bracket and cabling included.",
                ['lahore-orange-line'],
                9,
            ],
            [
                'ayesha.haly@havena.app',
                'for_sale',
                'Home & Garden',
                'used',
                'Hand-Knotted Bokhara Rug — 8x10',
                55000,
                "Hand-knotted Bokhara, deep red with the classic gul pattern, roughly 8 by 10 feet. Bought from the dealer in Liberty Market in 2019, professionally cleaned twice since, no moth and no bald patches.\n\nA textile designer selling a rug is admittedly a bad look, but the new drawing room is going a different direction. Happy for anyone to come and see it properly in daylight — photographs never do these justice.",
                ['lahore-museum'],
                11,
            ],
            [
                'hina.haly@havena.app',
                'for_sale',
                'Kids & Baby',
                'used',
                'Graco Travel System — Pram and Car Seat',
                14500,
                "Graco pram with the matching infant car seat and base, used for one child from 2023. Both washed, no tears, wheels run true. The car seat is within its expiry date, which most second-hand ones are not — check yours.\n\nFolds small enough for a sedan boot. Selling at well under half of what we paid. Collection from A-808.",
                ['feed-children-park'],
                12,
            ],
            [
                'rabia.haly@havena.app',
                'for_sale',
                'Furniture',
                'used',
                'Study Desk and Ergonomic Chair',
                22000,
                "Solid-top desk, 48 by 24 inches, with two drawers and a cable cut-out, plus a mesh-back chair with working lumbar adjustment and gas lift. Both bought in 2023 when I set up to teach online.\n\nThe desk has a ring mark near the right edge from a chai mug and I am not going to pretend otherwise. Everything else is sound. Ideal for an O-level or A-level student.",
                ['amenity-clubhouse'],
                14,
            ],
            [
                'farah.haly@havena.app',
                'for_sale',
                'Electronics',
                'used',
                'iPhone 14 — 128GB, Boxed, PTA Approved',
                185000,
                "iPhone 14, 128GB midnight, PTA approved and registered in my name. Battery health 89 percent. Always in a case with a screen protector from day one, so the glass is clean front and back — happy to show it under the lobby light rather than in a photograph.\n\nBox, cable and the original invoice included. Selling because I have moved to a work handset.",
                ['lahore-liberty-market'],
                15,
            ],
            [
                'faisal.haly@havena.app',
                'for_sale',
                'Sports & Outdoors',
                'used',
                'Treadmill — Motorised, 2.5 HP',
                65000,
                "Motorised treadmill, 2.5 HP, incline to 12 percent, max user weight 120 kg. Bought in 2022, serviced last year, belt is true and the deck has no give in it.\n\nFolds up but is still a heavy thing — service lift and two men. Selling because the building gym downstairs is better than this and free, which took me three years to accept.",
                ['amenity-gym'],
                17,
            ],
            [
                'ayesha.haly@havena.app',
                'service',
                'Services',
                null,
                'Tailoring and Alterations — In the Building',
                2500,
                "Twenty years in textiles and I still take in work from neighbours. Shalwar kameez stitched to measure, blouse and kurta alterations, curtains, and the hem on a suit that the shop in the market got wrong.\n\nRate below is for a standard stitched suit; alterations are less and I will tell you honestly if a thing is not worth altering. Wedding season books out, so come to me in February rather than in October.",
                ['lahore-liberty-market'],
                4,
            ],
            [
                'rabia.haly@havena.app',
                'service',
                'Lessons & Tutoring',
                null,
                'O-Level Economics and Maths Tuition',
                12000,
                "I teach economics at LUMS and take a small number of O-level students from the building in the evenings. Economics and additional maths, Cambridge syllabus, past papers from 2015 onwards.\n\nRate below is per subject per month for two sessions a week, in the residents library downstairs so parents can see the room. Three places this term, and I would rather say no than take six and do it badly.",
                ['amenity-clubhouse'],
                7,
            ],
            [
                'nadia.haly@havena.app',
                'service',
                'Lessons & Tutoring',
                null,
                'Quran and Nazra Classes for Children',
                8000,
                "Qari Sahib from the Phase 2 masjid takes children in the prayer hall, Monday to Thursday, 5pm to 6:30pm. Nazra and tajweed, ages five upwards, separate groups for boys and girls.\n\nI coordinate the group and collect the fee so he does not have to chase fourteen families. Rate below is per child per month. Four places open.",
                ['amenity-prayer-hall'],
                10,
            ],
            [
                'kamran.haly@havena.app',
                'service',
                'Food & Catering',
                null,
                'Home Catering for Small Gatherings',
                35000,
                "I run two kitchens in the Phase 2 market and do neighbour catering for thirty to a hundred covers in the Community Hall or on the deck. Karahi, biryani, seekh kebab, sajji on notice, and a proper vegetarian option rather than an afterthought.\n\nRate below is indicative for fifty covers of a standard three-dish menu with naan and salad. Crockery is extra because the hall does not have any. Two weeks' notice in wedding season, three days otherwise.",
                ['food-karahi'],
                13,
            ],
            [
                'zeeshan.haly@havena.app',
                'service',
                'Services',
                null,
                'Car Wash and Detailing in the Basement',
                1500,
                "My workshop boys come to the building on Saturday mornings and do cars in the basement — foam wash, interior vacuum, dashboard and tyre dressing. Waterless option for anyone worried about the drains, which Saba will be.\n\nRate below is for a sedan; an SUV is Rs 2,200. Full polish and paint correction on quotation. Message me by Friday evening to be on the list.",
                ['dha-residential-tower'],
                16,
            ],
            [
                'saba.haly@havena.app',
                'service',
                'Services',
                null,
                'Site Visit and Second Opinion on Renovation Quotes',
                6000,
                "Civil engineer, DHA road and drainage projects since 2019. Several neighbours have asked me to look over renovation quotes before they sign, so I am making it a proper arrangement rather than a favour I keep forgetting.\n\nOne visit, a walk round the apartment, and a written note on the quote: what is fairly priced, what is padded, what will fail in two years, and what the building will not let you do to a riser or a slab. Rate below is a flat fee per apartment.",
                ['pakistan-housing-society'],
                19,
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
                    'location' => 'DHA Phase 2, Lahore',
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
                'name' => 'Chaaye Khana',
                'category' => 'Cafe',
                'description' => 'The Islamabad chai house that landed in DHA and quietly became the default place in Phase 2 to sit for three hours over one pot. Doodh patti and kashmiri chai done properly, paratha rolls, and a breakfast that runs late enough to catch anyone who has had a bad night.',
                'address' => 'Haly Tower, Sector H Commercial, DHA Phase 2, Lahore',
                'phone' => '042 111 242 243',
                'hours' => 'Daily 8:00 AM – 1:00 AM',
                'amenities' => 'Indoor & terrace seating · Wi-Fi · Card payment · Family section',
                'website' => 'https://chaayekhana.com/',
                'image' => 'haly-chaaye-khana',
                'fallback' => 'food-chai',
                'owner' => HalyTowerCommunitySeeder::ADMIN_EMAIL,
                'deal' => [
                    'title' => 'Residents Chai Hour — 20% Off, 4 to 7 PM',
                    'description' => 'Twenty percent off the whole chai and paratha roll menu for Haly Tower residents, every afternoon between four and seven. Show the app at the counter. Dine-in only, not valid on Fridays or during Ramadan Iftar service.',
                    'type' => 'deal',
                    'label' => '20% off',
                    'original' => 1200,
                    'discounted' => 960,
                    'promo' => 'HALY20',
                    'featured' => true,
                    'endDays' => 60,
                    'image' => 'food-chai',
                ],
            ],
            [
                'name' => 'Saudi Broast',
                'category' => 'Restaurant',
                'description' => 'A Lahore institution for broast, pulao and chapli kebab, with a branch in the Phase 2 commercial strip. The queue at nine on a Friday evening tells you everything. Orders are packed hot and genuinely travel the two minutes to the tower without going soft.',
                'address' => 'Phase 2 Commercial Market, DHA, Lahore',
                'phone' => '042 3589 1122',
                'hours' => 'Daily 12:00 PM – 1:00 AM',
                'amenities' => 'Takeaway · Home delivery · Family seating · Cash & card',
                'website' => null,
                'image' => 'haly-saudi-broast',
                'fallback' => 'food-barbecue-platter',
                'owner' => 'kamran.haly@havena.app',
                'deal' => [
                    'title' => 'Family Broast Platter — Rs 2,450',
                    'description' => 'Eight pieces of broast, two pulao plates, salad, raita and four naan, for Rs 2,450 instead of Rs 3,100. Residents of Haly Tower only, quote the code when you call. Delivery to the lobby is free; the riders are not allowed above it.',
                    'type' => 'deal',
                    'label' => 'Save Rs 650',
                    'original' => 3100,
                    'discounted' => 2450,
                    'promo' => 'HALYBROAST',
                    'featured' => true,
                    'endDays' => 45,
                    'image' => 'food-barbecue-platter',
                ],
            ],
            [
                'name' => 'California Pizza',
                'category' => 'Restaurant',
                'description' => 'The Lahore pizza chain that most of the building defaults to when nobody can agree. Thin crust and pan, a decent garlic bread, and the only kitchen in the sector that has never once sent a cold order up to the lobby.',
                'address' => 'Phase 2 Commercial Market, DHA, Lahore',
                'phone' => '042 111 666 111',
                'hours' => 'Daily 12:00 PM – 2:00 AM',
                'amenities' => 'Dine-in · Home delivery · Online ordering · Card payment',
                'website' => 'https://californiapizza.com.pk/',
                'image' => 'haly-california-pizza',
                'fallback' => 'food-naan-tandoor',
                'owner' => 'usman.haly@havena.app',
                'deal' => [
                    'title' => 'Two Large Pizzas + 1.5L Drink — Rs 3,299',
                    'description' => 'Any two large pizzas from the classic range with a 1.5 litre drink for Rs 3,299 instead of Rs 4,250. Valid every day for Haly Tower residents on delivery or collection. Not combinable with other offers.',
                    'type' => 'deal',
                    'label' => 'Save Rs 950',
                    'original' => 4250,
                    'discounted' => 3299,
                    'promo' => 'HALYPIZZA',
                    'featured' => false,
                    'endDays' => 50,
                    'image' => 'food-naan-tandoor',
                ],
            ],
            [
                'name' => 'Ping Pong',
                'category' => 'Restaurant',
                'description' => 'Pan-Asian in the Phase 2 strip — Thai curries, dim sum, and a chilli garlic prawn that the building argues about. Small room, so book for more than four. The only place nearby that takes a vegetarian order seriously.',
                'address' => 'Phase 2 Commercial Market, DHA, Lahore',
                'phone' => '042 3741 9080',
                'hours' => 'Daily 12:30 PM – 11:30 PM',
                'amenities' => 'Dine-in · Reservations · Vegetarian menu · Card payment',
                'website' => null,
                'image' => 'haly-ping-pong',
                'fallback' => 'food-haleem',
                'owner' => 'rabia.haly@havena.app',
                'deal' => [
                    'title' => 'Dim Sum Basket Free on Rs 4,000',
                    'description' => 'A dim sum basket of your choice free on any dine-in bill over Rs 4,000, for Haly Tower residents. Mention the code when you order rather than at the till. Sunday to Thursday only.',
                    'type' => 'deal',
                    'label' => 'Free dim sum',
                    'original' => 1450,
                    'discounted' => 0,
                    'promo' => 'HALYDIMSUM',
                    'featured' => false,
                    'endDays' => 40,
                    'image' => 'food-haleem',
                ],
            ],
            [
                'name' => 'Pret Brasserie',
                'category' => 'Restaurant',
                'description' => 'The continental option in the sector — steaks, pasta, a proper breakfast, and the room most of the building books for an anniversary. Quieter than anywhere else on the strip, which is the point.',
                'address' => 'Phase 2 Commercial Market, DHA, Lahore',
                'phone' => '042 3570 4455',
                'hours' => 'Daily 8:00 AM – 12:00 AM',
                'amenities' => 'Dine-in · Breakfast · Reservations · Card payment · Outdoor seating',
                'website' => null,
                'image' => 'haly-pret-brasserie',
                'fallback' => 'lahore-food-street',
                'owner' => 'maryam.haly@havena.app',
                'deal' => [
                    'title' => 'Weekday Breakfast for Two — Rs 1,950',
                    'description' => 'Two full breakfasts with tea or coffee for Rs 1,950 instead of Rs 2,600, Monday to Friday before 11am. Haly Tower residents, dine-in only. Our favourite excuse to walk two minutes rather than cook.',
                    'type' => 'deal',
                    'label' => 'Save Rs 650',
                    'original' => 2600,
                    'discounted' => 1950,
                    'promo' => 'HALYBREAKFAST',
                    'featured' => true,
                    'endDays' => 55,
                    'image' => 'food-halwa-puri',
                ],
            ],
            [
                'name' => 'Cuisine By Ayesha Kamil',
                'category' => 'Catering',
                'description' => 'Home-style catering out of DHA that the building uses for mehndi and walima bookings in the Community Hall. Mutton pulao, chicken karahi, and a kheer that people ask about for weeks afterwards. Books out in wedding season.',
                'address' => 'DHA Phase 2, Lahore',
                'phone' => '0300 845 7711',
                'hours' => 'Mon–Sat 10:00 AM – 8:00 PM, by order',
                'amenities' => 'Event catering · Crockery on hire · Live cooking counter',
                'website' => null,
                'image' => 'haly-ayesha-kamil',
                'fallback' => 'food-biryani',
                'owner' => 'nadia.haly@havena.app',
                'deal' => [
                    'title' => 'Community Hall Bookings — 10% Off Catering',
                    'description' => 'Ten percent off the catering bill for any event booked in the Haly Tower Community Hall, plus crockery hire at cost rather than at the usual rate. Confirm with the management office when you book the hall.',
                    'type' => 'deal',
                    'label' => '10% off',
                    'original' => 95000,
                    'discounted' => 85500,
                    'promo' => 'HALYHALL10',
                    'featured' => true,
                    'endDays' => 90,
                    'image' => 'food-biryani',
                ],
            ],
            [
                'name' => 'Saadi Di Sajji',
                'category' => 'Restaurant',
                'description' => 'Balochi sajji done the long way — whole chicken on a skewer over coals, sajji rice, and roghani naan. Needs ordering ahead, which is exactly why it is the right call for Iftar in the Community Hall.',
                'address' => 'Phase 2 Commercial Market, DHA, Lahore',
                'phone' => '0321 440 8899',
                'hours' => 'Daily 1:00 PM – 12:00 AM',
                'amenities' => 'Takeaway · Pre-order · Bulk event orders · Cash only',
                'website' => null,
                'image' => 'haly-saadi-sajji',
                'fallback' => 'food-seekh-kebab',
                'owner' => 'kamran.haly@havena.app',
                'deal' => [
                    'title' => 'Iftar Platter — Rs 800 a Head, 40 Minimum',
                    'description' => 'Sajji, rice, roghani naan, dates, fruit chaat and chai at Rs 800 a head for building Iftar orders of forty or more. Delivered hot to the Community Hall at the time you set. This is the one that actually arrives hot.',
                    'type' => 'deal',
                    'label' => 'Rs 800 / head',
                    'original' => 1100,
                    'discounted' => 800,
                    'promo' => 'HALYIFTAR',
                    'featured' => true,
                    'endDays' => 35,
                    'image' => 'event-iftar',
                ],
            ],
            [
                'name' => 'Paradise Restaurant',
                'category' => 'Restaurant',
                'description' => 'Desi all-rounder on the strip — nihari in the morning, karahi and handi through the day, and a haleem on Fridays that sells out by two. The kitchen most of the older residents in this building have been ordering from for a decade.',
                'address' => 'Phase 2 Commercial Market, DHA, Lahore',
                'phone' => '042 3588 7700',
                'hours' => 'Daily 7:00 AM – 1:00 AM',
                'amenities' => 'Dine-in · Takeaway · Home delivery · Family hall',
                'website' => null,
                'image' => 'haly-paradise',
                'fallback' => 'food-nihari',
                'owner' => 'shahbaz.haly@havena.app',
                'deal' => [
                    'title' => 'Friday Nihari & Naan — Rs 950 for Two',
                    'description' => 'Two nihari plates with four naan and all the trimmings for Rs 950 instead of Rs 1,350, Friday mornings until 11am. Haly Tower residents, collection or lobby delivery.',
                    'type' => 'deal',
                    'label' => 'Save Rs 400',
                    'original' => 1350,
                    'discounted' => 950,
                    'promo' => 'HALYNIHARI',
                    'featured' => false,
                    'endDays' => 48,
                    'image' => 'food-nihari',
                ],
            ],
            [
                'name' => 'KAFI',
                'category' => 'Cafe',
                'description' => 'Small specialty coffee room in Phase 2 — single origin, properly pulled espresso, and a short food menu that does not pretend to be a restaurant. The only place in the sector where asking about the roast date gets a real answer.',
                'address' => 'Phase 2 Commercial Market, DHA, Lahore',
                'phone' => '0333 420 1166',
                'hours' => 'Daily 9:00 AM – 12:00 AM',
                'amenities' => 'Specialty coffee · Wi-Fi · Laptop friendly · Card payment',
                'website' => null,
                'image' => 'haly-kafi',
                'fallback' => 'food-chai',
                'owner' => 'usman.haly@havena.app',
                'deal' => [
                    'title' => 'Buy One Get One on Espresso Drinks',
                    'description' => 'Two espresso-based drinks for the price of one, all day Monday and Tuesday, for Haly Tower residents. Dine-in only, and genuinely useful if you work from home and need an excuse to leave it.',
                    'type' => 'deal',
                    'label' => 'BOGO',
                    'original' => 1100,
                    'discounted' => 550,
                    'promo' => 'HALYKAFI',
                    'featured' => false,
                    'endDays' => 42,
                    'image' => 'food-chai',
                ],
            ],
            [
                'name' => 'Majnoon Lebanese',
                'category' => 'Restaurant',
                'description' => 'Lebanese mezze and grills in Phase 2 — hummus, muhammara, a proper mixed grill, and the only decent baklava inside a five-minute drive. Small, so book ahead at the weekend.',
                'address' => 'Phase 2 Commercial Market, DHA, Lahore',
                'phone' => '0300 841 5566',
                'hours' => 'Daily 1:00 PM – 11:30 PM',
                'amenities' => 'Dine-in · Mezze platters · Vegetarian options · Card payment',
                'website' => null,
                'image' => 'haly-majnoon',
                'fallback' => 'food-haleem',
                'owner' => 'maryam.haly@havena.app',
                'deal' => [
                    'title' => 'Mezze Platter for Four — Rs 2,800',
                    'description' => 'Six mezze, pita, pickles and a mixed grill for four, at Rs 2,800 instead of Rs 3,600. Haly Tower residents, dine-in, Sunday to Thursday. Genuinely enough food for five.',
                    'type' => 'deal',
                    'label' => 'Save Rs 800',
                    'original' => 3600,
                    'discounted' => 2800,
                    'promo' => 'HALYMEZZE',
                    'featured' => false,
                    'endDays' => 44,
                    'image' => 'food-haleem',
                ],
            ],
            [
                'name' => 'Chips & Chopsticks',
                'category' => 'Fast Food',
                'description' => 'Loaded fries, wraps and chilli garlic noodles out of a small counter in the strip. Cheap, fast, open late, and the thing every teenager in this building orders the moment their parents leave for a wedding.',
                'address' => 'Phase 2 Commercial Market, DHA, Lahore',
                'phone' => '0321 778 4400',
                'hours' => 'Daily 2:00 PM – 2:00 AM',
                'amenities' => 'Takeaway · Late night · Home delivery · Cash & card',
                'website' => null,
                'image' => 'haly-chips-chopsticks',
                'fallback' => 'food-gol-gappa',
                'owner' => 'zeeshan.haly@havena.app',
                'deal' => [
                    'title' => 'Loaded Fries + Wrap + Drink — Rs 890',
                    'description' => 'Any loaded fries, any wrap and a soft drink for Rs 890 instead of Rs 1,250. All day, every day, for Haly Tower residents. Delivery to the lobby in about fifteen minutes.',
                    'type' => 'deal',
                    'label' => 'Save Rs 360',
                    'original' => 1250,
                    'discounted' => 890,
                    'promo' => 'HALYFRIES',
                    'featured' => false,
                    'endDays' => 38,
                    'image' => 'food-gol-gappa',
                ],
            ],
            [
                'name' => 'Rax Foods',
                'category' => 'Grocery',
                'description' => 'Neighbourhood grocery in the Phase 2 strip — imported and local, a decent butchery counter at the back, and a delivery boy who knows this building floor by floor. Runs a monthly account for most of the tower.',
                'address' => 'Phase 2 Commercial Market, DHA, Lahore',
                'phone' => '042 3569 2200',
                'hours' => 'Daily 8:30 AM – 11:00 PM',
                'amenities' => 'Home delivery · Butchery counter · Monthly account · Card payment',
                'website' => null,
                'image' => 'haly-rax-foods',
                'fallback' => 'amenity-mini-mart',
                'owner' => 'ahmed.haly@havena.app',
                'deal' => [
                    'title' => 'Free Delivery on Rs 3,000 for Haly Tower',
                    'description' => 'Free delivery to the Haly Tower lobby on any order over Rs 3,000, plus five percent off the butchery counter for residents. Call or message, and please come down for it — riders are not allowed above the lobby.',
                    'type' => 'deal',
                    'label' => 'Free delivery',
                    'original' => 300,
                    'discounted' => 0,
                    'promo' => 'HALYRAX',
                    'featured' => false,
                    'endDays' => 75,
                    'image' => 'amenity-mini-mart',
                ],
            ],
            [
                'name' => 'Kruncheese',
                'category' => 'Fast Food',
                'description' => 'Burgers and fried chicken out of the strip, with a cheese-stuffed patty that is exactly as sensible as it sounds. Reliable at midnight, which in this sector is a genuinely short list.',
                'address' => 'Phase 2 Commercial Market, DHA, Lahore',
                'phone' => '0333 118 9900',
                'hours' => 'Daily 1:00 PM – 2:30 AM',
                'amenities' => 'Takeaway · Late night · Home delivery · Cash & card',
                'website' => null,
                'image' => 'haly-kruncheese',
                'fallback' => 'food-barbecue-platter',
                'owner' => 'kamran.haly@havena.app',
                'deal' => [
                    'title' => 'Two Burgers + Fries to Share — Rs 1,290',
                    'description' => 'Two signature burgers with a large fries to share for Rs 1,290 instead of Rs 1,750. Haly Tower residents, any day, collection or lobby delivery.',
                    'type' => 'deal',
                    'label' => 'Save Rs 460',
                    'original' => 1750,
                    'discounted' => 1290,
                    'promo' => 'HALYBURGER',
                    'featured' => false,
                    'endDays' => 36,
                    'image' => 'food-barbecue-platter',
                ],
            ],
            [
                'name' => 'Khas Samosa',
                'category' => 'Bakery',
                'description' => 'Samosas, pakoras, jalebi and rusk out of a corner counter, fried to order from about four in the afternoon. The default Iftar order for half this building, and the reason the lift smells the way it does at 6:15 in Ramadan.',
                'address' => 'Phase 2 Commercial Market, DHA, Lahore',
                'phone' => '0300 448 2211',
                'hours' => 'Daily 7:00 AM – 10:00 PM',
                'amenities' => 'Takeaway · Bulk orders · Fried to order · Cash only',
                'website' => null,
                'image' => 'haly-khas-samosa',
                'fallback' => 'food-samosa',
                'owner' => 'nadia.haly@havena.app',
                'deal' => [
                    'title' => 'Iftar Box of 20 — Rs 1,100',
                    'description' => 'Twenty pieces, mixed samosa, pakora and jalebi, boxed and ready for the time you set, at Rs 1,100 instead of Rs 1,500. Order by 3pm. Haly Tower residents, collection from the counter.',
                    'type' => 'deal',
                    'label' => 'Save Rs 400',
                    'original' => 1500,
                    'discounted' => 1100,
                    'promo' => 'HALYSAMOSA',
                    'featured' => true,
                    'endDays' => 33,
                    'image' => 'food-samosa',
                ],
            ],
            [
                'name' => 'FoodGuy',
                'category' => 'Restaurant',
                'description' => 'Desi-fusion counter in the strip doing paratha rolls, loaded naan and a shawarma plate. Cheap, generous, and the kitchen the building\'s cricket team orders from after every match.',
                'address' => 'Phase 2 Commercial Market, DHA, Lahore',
                'phone' => '0321 660 7733',
                'hours' => 'Daily 12:00 PM – 1:30 AM',
                'amenities' => 'Takeaway · Home delivery · Bulk orders · Cash & card',
                'website' => null,
                'image' => 'haly-foodguy',
                'fallback' => 'food-seekh-kebab',
                'owner' => 'faisal.haly@havena.app',
                'deal' => [
                    'title' => 'Match Day Deal — 10 Rolls for Rs 2,200',
                    'description' => 'Ten paratha rolls, mixed chicken and beef, with chutney and salad, for Rs 2,200 instead of Rs 2,900. Made for the team after a game. Order an hour ahead.',
                    'type' => 'deal',
                    'label' => 'Save Rs 700',
                    'original' => 2900,
                    'discounted' => 2200,
                    'promo' => 'HALYROLLS',
                    'featured' => false,
                    'endDays' => 39,
                    'image' => 'event-cricket-match',
                ],
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
                'image_url' => $this->img($shop['image'], $shop['fallback'] ?? null),
                'status' => 'approved',
                'approved_at' => now()->subMonths(7),
                'approved_by' => $this->adminId,
                'updated_at' => now()->subDays(12),
                'created_at' => now()->subMonths(10),
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
                    'location' => 'DHA Phase 2, Lahore',
                    'image_url' => $this->img($deal['image'] ?? $shop['image'], $shop['fallback'] ?? null),
                    'is_featured' => (bool) ($deal['featured'] ?? false),
                    'status' => 'active',
                    'starts_at' => now()->subDays(12),
                    'ends_at' => now()->addDays((int) ($deal['endDays'] ?? 40)),
                    'updated_at' => now()->subDays(12),
                    'created_at' => now()->subDays(12),
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
                'Quiet Hours — 10:30 PM to 7:00 AM',
                'Noise',
                "Quiet hours in the building run from 10:30pm to 7:00am. Inside those hours: no drilling, no hammering, no furniture dragging, no loud music, and no gatherings on balconies or in the corridors.\n\nThe walls here carry sound vertically far better than they do horizontally, so the apartment you are disturbing is probably above or below you rather than next door.\n\nRooftop and Community Hall events have a hard stop at 11:00pm regardless of what the booking says. After that the office will act on a complaint rather than mediate it. Four complaints inside twelve months is a committee hearing and, as one resident has discovered, a suspension.",
                'important',
                true,
            ],
            [
                'Renovation and Construction Work',
                'Common Areas',
                "Renovation work is allowed Monday to Saturday, 9:00am to 6:00pm. No work on Sundays, no work on Eid, and no work during Jumma between 12:30 and 2:30pm.\n\nBefore you start, give the office your contractor's name, CNIC copies for the workers, and a scope note. Workers are signed in and out at the main gate and are not permitted in the lifts carrying material — the service lift is booked through the office and the guards put the pads up.\n\nNothing may be cut into a slab, a column, or a riser. That includes running a new gas line, moving a soil stack, and widening a doorway in a shear wall. If you are unsure, ask Saba Noor in B-707 before you ask your contractor, because your contractor will say yes.\n\nRubble leaves the site with the contractor. Rubble in the bin area is charged to the apartment.",
                'important',
                true,
            ],
            [
                'Parking, Bays and Fire Lanes',
                'Parking',
                "One numbered bay per apartment comes with your title. Extra bays are allotted by the office against a monthly charge and are painted and logged against your apartment with the guards.\n\nVisitor bays 101 to 112 on the ramp level are capped at four hours. They are not a second bay for a household with two cars, and the guards log entry times.\n\nFire lanes are painted red. A vehicle in a fire lane is towed at the owner's cost, not warned. The same applies to a vehicle blocking the ramp, the generator room doors, or either stairwell exit.\n\nYour DHA sector sticker and your building bay number are separate things and the guards check both.",
                'important',
                true,
            ],
            [
                'Guests, Gate Entry and Domestic Staff',
                'Security',
                "All visitors sign in at the main gate. Give the guards the name and expected time if you can, or issue a guest pass through the app and they will be cleared straight through.\n\nThe rear gate is locked 11:00pm to 5:00am. Use the main gate at night.\n\nDomestic staff and drivers must be registered with the office with a CNIC copy and a photograph, and are issued a building card. Unregistered staff are refused entry, which is an awkward way to start a Monday. Staff are not given apartment keys by the guards under any circumstances.\n\nFood delivery riders come to the lobby and no further. Please come down.",
                'important',
                true,
            ],
            [
                'Generator Load and the 2 kW Limit',
                'Utilities',
                "The backup supply gives each apartment 2 kW during load-shedding, on top of the lifts, lobbies, corridors, pumps, gym and deck lighting.\n\nAir conditioners are not on the backup circuit. Running one while the building is on generator will trip the protective relay for your entire floor. So will a water geyser, an electric heater, or a washing machine on a hot cycle.\n\nFans, lights, fridge, router, television and a laptop are all comfortably inside the limit.\n\nIf your apartment is dark more than a minute after the building has switched over, your own MCB has tripped. Call the office. Do not open the riser panel.",
                'important',
                true,
            ],
            [
                'Balconies, Chutes and Common Areas',
                'Common Areas',
                "Nothing is to be thrown, swept, shaken or poured from a balcony. Sixteen floors turns a cigarette end into a genuine hazard and a flower pot into a fatal one. Pots must be on the inside of the railing, not on the ledge.\n\nStairwell landings must be clear. No cycles, no boxes, no furniture, no shoe racks. Four floors currently have items on the landing and the office will remove them without further notice.\n\nFloor chutes take tied household bags only. No construction debris, no glass, and nothing wet and unbagged.\n\nCorridors and lobbies are common property. Plants, prayer mats, bicycles and shoe racks outside your door need the office's agreement, which is usually given and occasionally not.",
                'standard',
                true,
            ],
            [
                'Pets in the Building',
                'Pets',
                "Cats and small dogs are allowed with the office's written agreement, registered against your apartment. Nothing above medium size, and no birds of prey, which has had to be said once.\n\nDogs must be on a lead in all common areas and are not permitted in the lifts between 7:30 and 9:00am when the school vans are loading. Carry small dogs through the lobby.\n\nYou clear up after your animal, in the compound and on the ramp, every time. The gardener is not staff for this.\n\nPets are not allowed on the pool deck, in the gym, in the prayer hall, or in the Community Hall during a catered event.",
                'standard',
                true,
            ],
            [
                'Tenancy, Registration and Police Verification',
                'Tenancy',
                "Every tenancy needs a written agreement, a copy lodged with the office, and police verification of the tenant through the DHA process. The owner is answerable for all three.\n\nThe building's tenancy addendum, drafted by Maryam Javed in B-405, is in Documents. It is not mandatory but it is strongly recommended, and it has saved two owners this year.\n\nA tenant gets the amenities, the app and a building card. The maintenance charge, the bay allotment, and anything structural remain the owner's responsibility.\n\nAn unregistered tenant is refused entry at the gate.",
                'standard',
                true,
            ],
            [
                'Amenity Bookings and Cancellations',
                'Common Areas',
                "Bookings are made through the app and are confirmed once the fee clears. The Community Hall needs seven days' notice, the rooftop deck three, and courts can be taken the same day if the slot is free.\n\nCancellation more than 48 hours out is refunded in full. Inside 48 hours the fee is held and credited against your next booking. A no-show is forfeited — the slot could have gone to somebody else.\n\nYou are responsible for your guests and for the state of the space afterwards. The hall and the deck are inspected after every event and damage is charged to the booking apartment.\n\nCaterers use the pantry entrance for the hall and the service lift for the deck. Never the main lobby.",
                'standard',
                true,
            ],
            [
                'Bill Payment and References',
                'Utilities',
                "Maintenance, generator, lift, pool and service bills are due on the date shown on each bill. Transfer to the maintenance account and upload the screenshot through the app, or pay cash at the office against a numbered receipt.\n\nUse your apartment number, and only your apartment number, as the transfer reference. Reconciliation is manual and an unmatched transfer sits in suspense for up to a fortnight while somebody works out whose it was.\n\nDo not hand cash to the guards. They are not authorised to accept it and it has caused two disputes this year.\n\nBills more than sixty days overdue are listed to the committee. At ninety days, amenity booking rights are suspended until the account is clear.",
                'standard',
                true,
            ],
            [
                'Rooftop Deck and Pool Conduct',
                'Common Areas',
                "The pool has no lifeguard. Children under twelve must have an adult in the water with them, not on a lounger. Ladies-only hours are Monday, Wednesday and Saturday, 9am to 12pm, with the screens drawn.\n\nShower before you get in, no glass anywhere on the pool deck, and nothing in the water during backwashing — the office posts the day.\n\nOn the rooftop deck: the grills are charcoal only, no gas cylinders are permitted above the ground floor, and the coals are to be fully doused before you leave. Kite string of any kind is banned on the roof and on balconies.\n\nBoth spaces close at 11:00pm.",
                'info',
                false,
            ],
            [
                'Masjid Etiquette and Prayer Hall Use',
                'Common Areas',
                "The ground-floor prayer hall is for prayer. Jamaat for all five prayers, the ladies section is open with screens, and the wudu area is cleaned twice daily.\n\nChildren are welcome and always have been. If a child becomes genuinely disruptive, take them out rather than being taken out.\n\nThe hall is also used for Milad and for Qari Sahib's children's classes between 5pm and 6:30pm, Monday to Thursday. It is not available for private bookings or for gatherings with food — that is what the Community Hall is for.\n\nShoes on the racks, phones silent, and please do not leave prayer mats or Qurans on the floor overnight.",
                'info',
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
                    'updated_at' => now()->subMonths(4),
                    'created_at' => now()->subMonths(22),
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
                if (($index + $ruleIndex) % 6 === 5) {
                    continue;
                }

                DB::table('rule_acknowledgments')->updateOrInsert(
                    ['rule_id' => $ruleId, 'user_id' => $userId],
                    ['acknowledged_at' => now()->subDays((($index * 9) % 120) + 2)]
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
            ['New Resident Guide 2026', 'Policies', 'The office, the guards, the generator, the bins, the bays, and who to call. Start here if you have just taken possession or just moved in as a tenant.', 'haly-new-resident-guide-2026'],
            ['Maintenance Charge Workings 2026', 'Billing', 'Line-by-line derivation of the Rs 12,500 monthly charge — guard wages, CCTV contract, cleaning, horticulture, pumps, and the sinking fund contribution.', 'haly-maintenance-workings-2026'],
            ['Quarterly Account Reconciliation', 'Billing', 'Bilal Akhtar\'s reconciliation of the maintenance account against posted bills, including the suspense account note on unmatched transfers.', 'haly-account-reconciliation'],
            ['Tenancy Agreement Addendum', 'Forms', 'The addendum drafted by Maryam Javed that the building recommends alongside any agent agreement. Covers notice, exit, deposit and the owner\'s obligations.', 'haly-tenancy-addendum'],
            ['Generator Load Guidance', 'Utilities', 'What the 2 kW backup allowance does and does not run, why an air conditioner trips the floor relay, and what to do when your own MCB goes.', 'haly-generator-load-guidance'],
            ['Fire Safety and Evacuation Plan', 'Safety', 'Stairwell routes for both wings, muster point, extinguisher and hose reel locations, and the floor-by-floor drill procedure.', 'haly-fire-safety-plan'],
            ['Fumigation Floor Schedule', 'Policies', 'The four-day floor-by-floor pest control schedule, what is treated inside apartments, and the two-hour re-entry guidance for pets.', 'haly-fumigation-schedule'],
            ['Amenity Booking Rules and Fee Schedule', 'Forms', 'Notice periods, cancellation and refund terms, guest responsibility, and the current fee for the hall, deck, courts and study room in rupees.', 'haly-amenity-booking-rules'],
            ['Approved Contractor and Vendor List', 'Forms', 'Plumbers, electricians, AC technicians and carpenters that residents of this building have actually used. Not an endorsement — a starting point.', 'haly-approved-vendor-list'],
            ['Monsoon and Basement Drainage Notes', 'Grounds', 'Sump pump capacity, which four bays to clear in a cloudburst, and the DHA sector line escalation route.', 'haly-monsoon-drainage-notes'],
            ['DHA Phase 2 Useful Numbers', 'Civic', 'DHA maintenance, LESCO complaint, SNGPL emergency, WASA, Rescue 1122, the Phase 2 police post, and the nearest three hospitals.', 'haly-useful-numbers'],
            ['AGM Agenda and Last Year\'s Minutes', 'Policies', 'This year\'s agenda plus the signed minutes of the previous annual general meeting, including the maintenance charge vote.', 'haly-agm-agenda-minutes'],
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
                    'download_count' => 18 + ($index * 7),
                    'status' => 'active',
                    'updated_at' => now()->subDays(($index * 9) + 3),
                    'created_at' => now()->subDays(($index * 21) + 30),
                ]
            );
        }

        $this->command?->info('  Documents ready: '.count($docs));
    }

    private function placeholderPdf(string $title): string
    {
        $lines = [
            'Haly Tower - DHA Phase 2, Lahore',
            str_replace(['(', ')'], '', $title),
            'Placeholder document for the Haly Tower seed data.',
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

    /* ─────────────────────────── messages ─────────────────────────── */

    private function seedConversations(): void
    {
        if (! Schema::hasTable('conversations')) {
            return;
        }

        $resident = $this->uid(HalyTowerCommunitySeeder::RESIDENT_EMAIL);
        if (! $resident) {
            return;
        }

        $threads = [
            [
                'type' => 'direct',
                'title' => null,
                'with' => HalyTowerCommunitySeeder::ADMIN_EMAIL,
                'daysAgo' => 2,
                'messages' => [
                    [HalyTowerCommunitySeeder::RESIDENT_EMAIL, 'Assalam o alaikum. The deck booking for Saturday is confirmed on my side — could the grills be cleaned before 6pm? Last time there was still ash in both.'],
                    [HalyTowerCommunitySeeder::ADMIN_EMAIL, 'Walaikum assalam. Noted, I will have both grills brushed out and the deck swept by 5:30. The string lights are on the generator circuit so load-shedding will not affect you.'],
                    [HalyTowerCommunitySeeder::RESIDENT_EMAIL, 'Perfect. We are about 22 people. Charcoal is ours, so nothing needed there.'],
                    [HalyTowerCommunitySeeder::ADMIN_EMAIL, 'Twenty-two is comfortable. I will put a guard on the roof door from 6:45 so nobody wanders up mid-event. Receipt 0233 is against your booking.'],
                    [HalyTowerCommunitySeeder::RESIDENT_EMAIL, 'Thank you. One more thing — the B-wing pump notice. Are we expecting it to affect A wing at all?'],
                    [HalyTowerCommunitySeeder::ADMIN_EMAIL, 'No, A wing is on a separate riser and booster. You will not notice anything. I will update the notice the moment the B-wing pump runs.'],
                ],
            ],
            [
                'type' => 'direct',
                'title' => null,
                'with' => 'kamran.haly@havena.app',
                'daysAgo' => 1,
                'messages' => [
                    [HalyTowerCommunitySeeder::RESIDENT_EMAIL, 'Saw the mango post. Is the second crate still going? Happy to take half.'],
                    ['kamran.haly@havena.app', 'Nadia took most of it but there are about four kilos left. Yours if you want them, come to B-604 any time this evening.'],
                    [HalyTowerCommunitySeeder::RESIDENT_EMAIL, 'Taking them. Also — for the committee barbecue on Saturday, could your kitchen do seekh kebab for 22?'],
                    ['kamran.haly@havena.app', 'Easily. Marinated and skewered, you grill them on the deck. Rs 420 a skewer, say 45 skewers for 22 people with the usual appetites.'],
                    [HalyTowerCommunitySeeder::RESIDENT_EMAIL, 'Done. 45 skewers, delivered to the deck at 6:30 if that works.'],
                    ['kamran.haly@havena.app', 'Six-thirty on the deck. I will send a boy up with the service lift so the lobby stays clear.'],
                ],
            ],
            [
                'type' => 'group',
                'title' => 'Residents Welfare Committee',
                'with' => null,
                'participants' => [
                    HalyTowerCommunitySeeder::RESIDENT_EMAIL,
                    'faisal.haly@havena.app',
                    'bilal.haly@havena.app',
                    'shahbaz.haly@havena.app',
                    'maryam.haly@havena.app',
                    HalyTowerCommunitySeeder::ADMIN_EMAIL,
                ],
                'daysAgo' => 4,
                'messages' => [
                    [HalyTowerCommunitySeeder::RESIDENT_EMAIL, 'AGM is in thirteen days. Agenda draft is with the office. Anything to add, now rather than from the floor at 9pm please.'],
                    ['bilal.haly@havena.app', 'Reconciliation is uploaded. Account balances, generator line is Rs 41,000 under budget because diesel dipped in February, sinking fund is where we said it would be.'],
                    ['shahbaz.haly@havena.app', 'Add the seventh camera for the generator-room blind spot. I have raised it three quarters running and it keeps sliding.'],
                    [HalyTowerCommunitySeeder::ADMIN_EMAIL, 'It is on the draft agenda and budgeted for next quarter. If the meeting wants it sooner it can vote for it.'],
                    ['maryam.haly@havena.app', 'I want the tenancy registration position minuted properly this year. Two owners got into trouble because nobody wrote down what was agreed in 2025.'],
                    ['faisal.haly@havena.app', 'And the blood camp outcome, briefly. It is a good thing the building does and it should be in the record.'],
                    [HalyTowerCommunitySeeder::RESIDENT_EMAIL, 'All four added. Final agenda goes on the board and in Documents on Thursday.'],
                ],
            ],
            [
                'type' => 'direct',
                'title' => null,
                'with' => 'usman.haly@havena.app',
                'daysAgo' => 6,
                'messages' => [
                    ['usman.haly@havena.app', 'Did your lights flicker at about 7:12 last night, or was that just A-wing corridor?'],
                    [HalyTowerCommunitySeeder::RESIDENT_EMAIL, 'Mine blinked once. The corridor was properly out for a good half minute though.'],
                    ['usman.haly@havena.app', 'That is the changeover, not the panel. Start battery most likely. I have reported it and the AMC engineer is testing both on Thursday.'],
                    [HalyTowerCommunitySeeder::RESIDENT_EMAIL, 'Good. Put it in the AGM pack as well — if a battery is on its way out I would rather it was budgeted than discovered.'],
                ],
            ],
            [
                'type' => 'direct',
                'title' => null,
                'with' => 'rabia.haly@havena.app',
                'daysAgo' => 8,
                'messages' => [
                    [HalyTowerCommunitySeeder::RESIDENT_EMAIL, 'Are the economics tuition places still open? My nephew is in O2 and struggling with elasticity.'],
                    ['rabia.haly@havena.app', 'One place left of three. Two evenings a week in the library downstairs, Rs 12,000 a month for the subject.'],
                    ['rabia.haly@havena.app', 'If elasticity is the problem it is almost always because nobody drew the graphs with him. Fixable in about three sessions.'],
                    [HalyTowerCommunitySeeder::RESIDENT_EMAIL, 'Take him. I will send his details this evening.'],
                ],
            ],
        ];

        $created = 0;

        foreach ($threads as $thread) {
            $participantEmails = $thread['participants']
                ?? array_values(array_filter([HalyTowerCommunitySeeder::RESIDENT_EMAIL, $thread['with']]));

            $participantIds = array_values(array_filter(array_map(
                fn (string $email) => $this->uid($email),
                $participantEmails,
            )));

            if (count($participantIds) < 2) {
                continue;
            }

            $startedAt = now()->subDays($thread['daysAgo']);

            $conversationId = (int) DB::table('conversations')->insertGetId([
                'type' => $thread['type'],
                'title' => $thread['title'],
                'listing_id' => null,
                'created_at' => $startedAt,
                'updated_at' => $startedAt,
            ]);

            $lastSenderId = null;
            $minutes = 0;

            foreach ($thread['messages'] as [$email, $body]) {
                $senderId = $this->uid($email);
                if (! $senderId) {
                    continue;
                }

                $sentAt = $startedAt->copy()->addMinutes($minutes);

                DB::table('messages')->insert([
                    'conversation_id' => $conversationId,
                    'sender_id' => $senderId,
                    'body' => $body,
                    'type' => 'text',
                    'read_at' => $sentAt->copy()->addMinutes(6),
                    'created_at' => $sentAt,
                    'updated_at' => $sentAt,
                ]);

                $lastSenderId = $senderId;
                $minutes += 9 + ($minutes % 14);
            }

            $lastActivity = $startedAt->copy()->addMinutes($minutes);

            foreach ($participantIds as $userId) {
                // Everyone is caught up except whoever did not send the last message
                // in the two most recent threads — gives the inbox an unread badge.
                $unread = ($thread['daysAgo'] <= 2 && $userId !== $lastSenderId) ? 1 : 0;

                DB::table('conversation_participants')->insert([
                    'conversation_id' => $conversationId,
                    'user_id' => $userId,
                    'unread_count' => $unread,
                    'last_read_at' => $unread ? $lastActivity->copy()->subMinutes(20) : $lastActivity,
                    'created_at' => $startedAt,
                    'updated_at' => $lastActivity,
                ]);
            }

            DB::table('conversations')->where('id', $conversationId)->update(['updated_at' => $lastActivity]);
            $created++;
        }

        $this->command?->info('  Conversations ready: '.$created);
    }

    /* ─────────────────── points, streaks and leaderboard ─────────────────── */

    private function seedPoints(): void
    {
        if (! Schema::hasTable('point_transactions')) {
            return;
        }

        $residents = $this->approvedResidentIds();
        if ($residents === []) {
            return;
        }

        // A spread of real in-app actions. The leaderboard is derived from the
        // sum of these per member, so the mix decides the standings.
        $catalog = [
            ['daily_login', 'Daily Login', 'Welcome back!', 5],
            ['profile_completed', 'Profile Completed', 'Your profile is all set', 50],
            ['post_created', 'Community Post', 'Shared something with the building', 15],
            ['comment_created', 'Comment', 'Joined a conversation on the feed', 5],
            ['event_rsvp', 'Event RSVP', 'Replied to a building event', 10],
            ['amenity_booked', 'Amenity Booked', 'Reserved a building facility', 20],
            ['bill_paid_on_time', 'Bill Paid On Time', 'Settled a building bill before the due date', 25],
            ['rule_acknowledged', 'Rules Acknowledged', 'Confirmed you have read a building rule', 10],
            ['wellness_lesson', 'Wellness Lesson', 'Finished a lesson in the Wellness Hub', 15],
            ['neighbour_helped', 'Helping Hand', 'Thanked by a neighbour on the feed', 30],
        ];

        $resident = $this->uid(HalyTowerCommunitySeeder::RESIDENT_EMAIL);
        $rows = [];

        foreach ($residents as $memberIndex => $userId) {
            // The primary demo resident sits near the top but not first — a
            // leaderboard you can actually climb reads better than a won one.
            $volume = $userId === $resident ? 34 : 12 + (($memberIndex * 7) % 26);

            for ($i = 0; $i < $volume; $i++) {
                [$action, $title, $subtitle, $points] = $catalog[($memberIndex + $i) % count($catalog)];

                $rows[] = [
                    'user_id' => $userId,
                    'community_id' => $this->cid,
                    'action' => $action,
                    'title' => $title,
                    'subtitle' => $subtitle,
                    'points' => $points,
                    'meta' => null,
                    'created_at' => now()->subDays(($i * 2) % 90)->subHours($i % 20),
                ];
            }
        }

        foreach (array_chunk($rows, 200) as $chunk) {
            DB::table('point_transactions')->insert($chunk);
        }

        $this->seedLoginStreaks($residents, $resident);

        $this->command?->info('  Point transactions ready: '.count($rows));
    }

    /**
     * @param  list<int>  $residents
     */
    private function seedLoginStreaks(array $residents, ?int $resident): void
    {
        if (! Schema::hasTable('user_daily_logins')) {
            return;
        }

        foreach ($residents as $index => $userId) {
            // An unbroken run ending today for the demo resident; shorter,
            // staggered runs for everybody else.
            $days = $userId === $resident ? 14 : 2 + ($index % 7);

            for ($back = 0; $back < $days; $back++) {
                DB::table('user_daily_logins')->updateOrInsert(
                    ['user_id' => $userId, 'login_date' => now()->subDays($back)->toDateString()],
                    ['created_at' => now()->subDays($back)->setTime(8, 20)],
                );
            }
        }
    }

    /* ─────────────────────────── wellness ─────────────────────────── */

    /**
     * The Wellness Hub catalogue is global (see WellnessHubSeeder). What belongs
     * to a community is its residents' progress through it.
     */
    private function seedWellnessProgress(): void
    {
        if (! Schema::hasTable('wellness_lesson_progress')) {
            return;
        }

        $lessonsByCourse = DB::table('wellness_lessons')
            ->where('status', 'published')
            ->whereNull('deleted_at')
            ->orderBy('course_id')
            ->orderBy('sort_order')
            ->get(['id', 'course_id'])
            ->groupBy('course_id');

        if ($lessonsByCourse->isEmpty()) {
            $this->command?->warn('  Wellness progress skipped — run WellnessHubSeeder first.');

            return;
        }

        $residents = $this->approvedResidentIds();
        $resident = $this->uid(HalyTowerCommunitySeeder::RESIDENT_EMAIL);
        $courseIds = $lessonsByCourse->keys()->all();
        $marked = 0;

        foreach ($residents as $memberIndex => $userId) {
            // The demo resident has finished some courses outright and is
            // part-way through others, so every progress state is visible.
            $coursesTouched = $userId === $resident ? count($courseIds) : 1 + ($memberIndex % 4);

            foreach (array_slice($courseIds, 0, $coursesTouched) as $courseIndex => $courseId) {
                $lessons = $lessonsByCourse[$courseId]->values();
                $total = $lessons->count();
                if ($total === 0) {
                    continue;
                }

                if ($userId === $resident) {
                    // First three courses complete, the rest partially done.
                    $take = $courseIndex < 3 ? $total : max(1, (int) floor($total / 2));
                } else {
                    $take = max(1, (int) ceil($total * (($memberIndex + $courseIndex) % 4) / 4));
                }

                foreach ($lessons->take($take) as $lessonIndex => $lesson) {
                    DB::table('wellness_lesson_progress')->updateOrInsert(
                        ['user_id' => $userId, 'lesson_id' => $lesson->id],
                        ['completed_at' => now()
                            ->subDays((($memberIndex * 5) + ($courseIndex * 3) + $lessonIndex) % 70)
                            ->setTime(7, 15)],
                    );
                    $marked++;
                }
            }
        }

        $this->command?->info('  Wellness lessons completed: '.$marked);
    }

    /* ─────────────────────────── guests ─────────────────────────── */

    private function seedGuestInvitations(): void
    {
        if (! Schema::hasTable('guest_invitations')) {
            return;
        }

        $resident = $this->uid(HalyTowerCommunitySeeder::RESIDENT_EMAIL);
        $nadia = $this->uid('nadia.haly@havena.app');
        $kamran = $this->uid('kamran.haly@havena.app');
        $hina = $this->uid('hina.haly@havena.app');

        $rows = [
            [
                'invited_by' => $resident,
                'type' => 'resident',
                'name' => 'Sana Iqbal',
                'email' => 'sana.iqbal.guest@example.com',
                'phone' => '+923214507788',
                'code' => 'HTG-4812',
                'starts' => now()->addDays(4)->setTime(18, 0),
                'ends' => now()->addDays(4)->setTime(23, 0),
                'status' => 'active',
                'permissions' => ['gate_entry' => true, 'amenities' => ['Rooftop Terrace & BBQ Deck'], 'parking' => true],
                'approved' => true,
                'note' => 'Committee barbecue on the deck.',
            ],
            [
                'invited_by' => $resident,
                'type' => 'resident',
                'name' => 'Hassan Raza',
                'email' => null,
                'phone' => '+923004419922',
                'code' => 'HTG-4829',
                'starts' => now()->addDays(6)->setTime(9, 0),
                'ends' => now()->addDays(6)->setTime(11, 0),
                'status' => 'pending_approval',
                'permissions' => ['gate_entry' => true, 'amenities' => ['Rooftop Swimming Pool'], 'parking' => false],
                'approved' => false,
                'note' => 'Pool guest, ladies-only slot — waiting on the office.',
            ],
            [
                'invited_by' => $nadia,
                'type' => 'resident',
                'name' => 'Abdul Rehman Catering Team',
                'email' => null,
                'phone' => '+923334408811',
                'code' => 'HTG-4833',
                'starts' => now()->addDays(11)->setTime(16, 0),
                'ends' => now()->addDays(11)->setTime(23, 30),
                'status' => 'active',
                'permissions' => ['gate_entry' => true, 'service_lift' => true, 'amenities' => ['Community Hall'], 'parking' => true],
                'approved' => true,
                'note' => 'Mehndi catering. Pantry entrance and service lift only.',
            ],
            [
                'invited_by' => $kamran,
                'type' => 'resident',
                'name' => 'Imtiaz Ahmed',
                'email' => 'imtiaz.guest@example.com',
                'phone' => '+923216612345',
                'code' => 'HTG-4790',
                'starts' => now()->subDays(5)->setTime(20, 0),
                'ends' => now()->subDays(5)->setTime(23, 59),
                'status' => 'expired',
                'permissions' => ['gate_entry' => true, 'parking' => true],
                'approved' => true,
                'note' => 'Family dinner, pass has lapsed.',
            ],
            [
                'invited_by' => $hina,
                'type' => 'resident',
                'name' => 'Beaconhouse Van Driver — Shahid',
                'email' => null,
                'phone' => '+923451122334',
                'code' => 'HTG-4701',
                'starts' => now()->subMonths(2)->setTime(6, 30),
                'ends' => now()->addMonths(4)->setTime(15, 0),
                'status' => 'active',
                'permissions' => ['gate_entry' => true, 'recurring' => true, 'parking' => false],
                'approved' => true,
                'note' => 'Standing school van pass, 6:50am pickup and 2:40pm drop.',
            ],
            [
                'invited_by' => $this->adminId,
                'type' => 'admin',
                'name' => 'LESCO Meter Reader',
                'email' => null,
                'phone' => '+923009988776',
                'code' => 'HTG-4845',
                'starts' => now()->addDays(2)->setTime(10, 0),
                'ends' => now()->addDays(2)->setTime(13, 0),
                'status' => 'active',
                'permissions' => ['gate_entry' => true, 'common_areas' => true, 'parking' => false],
                'approved' => true,
                'note' => 'Monthly meter reading, both wings. Escorted by a guard.',
            ],
            [
                'invited_by' => $this->adminId,
                'type' => 'admin',
                'name' => 'Lift AMC Engineer — Tanveer',
                'email' => null,
                'phone' => '+923215566778',
                'code' => 'HTG-4846',
                'starts' => now()->addDays(3)->setTime(9, 30),
                'ends' => now()->addDays(3)->setTime(17, 0),
                'status' => 'active',
                'permissions' => ['gate_entry' => true, 'common_areas' => true, 'service_lift' => true, 'parking' => true],
                'approved' => true,
                'note' => 'Quarterly service plus the B-wing door operator replacement.',
            ],
            [
                'invited_by' => $resident,
                'type' => 'resident',
                'name' => 'Faizan Tariq',
                'email' => 'faizan.guest@example.com',
                'phone' => '+923337788990',
                'code' => 'HTG-4802',
                'starts' => now()->subDays(12)->setTime(19, 0),
                'ends' => now()->subDays(12)->setTime(22, 0),
                'status' => 'revoked',
                'permissions' => ['gate_entry' => true, 'parking' => true],
                'approved' => true,
                'note' => 'Revoked — vehicle was left in a fire lane on the previous visit.',
            ],
        ];

        $created = 0;

        foreach ($rows as $row) {
            if (! $row['invited_by']) {
                continue;
            }

            DB::table('guest_invitations')->updateOrInsert(
                ['community_id' => $this->cid, 'invite_code' => $row['code']],
                [
                    'invited_by_user_id' => $row['invited_by'],
                    'invitation_type' => $row['type'],
                    'guest_name' => $row['name'],
                    'guest_email' => $row['email'],
                    'guest_phone' => $row['phone'],
                    'starts_at' => $row['starts'],
                    'ends_at' => $row['ends'],
                    'permissions' => json_encode($row['permissions'] + ['note' => $row['note']]),
                    'status' => $row['status'],
                    'approved_by_user_id' => $row['approved'] ? $this->adminId : null,
                    'approved_at' => $row['approved'] ? $row['starts']->copy()->subDays(1) : null,
                    'revoked_at' => $row['status'] === 'revoked' ? now()->subDays(11) : null,
                    'revoked_by_user_id' => $row['status'] === 'revoked' ? $this->adminId : null,
                    'rejection_reason' => null,
                    'last_activity_at' => in_array($row['status'], ['active', 'expired', 'revoked'], true)
                        ? $row['starts']->copy()->addMinutes(20)
                        : null,
                    'updated_at' => now(),
                    'created_at' => $row['starts']->copy()->subDays(2),
                ],
            );
            $created++;
        }

        $this->command?->info('  Guest invitations ready: '.$created);
    }

    /* ─────────────────────────── notifications ─────────────────────────── */

    /**
     * Inbox notifications derived from the content just seeded, so every
     * action_url actually resolves and the module tabs all have something in
     * them. See App\Support\NotificationModule for how they are grouped.
     */
    private function seedNotifications(): void
    {
        if (! Schema::hasTable('app_notifications')) {
            return;
        }

        $residents = $this->approvedResidentIds();
        if ($residents === []) {
            return;
        }

        $notices = DB::table('notices')
            ->where('community_id', $this->cid)
            ->whereIn('category', ['general', 'maintenance', 'emergency'])
            ->orderByDesc('published_at')
            ->limit(5)
            ->get(['id', 'title']);

        $events = DB::table('notices')
            ->where('community_id', $this->cid)
            ->where('category', 'event')
            ->orderBy('event_date')
            ->limit(4)
            ->get(['id', 'title', 'event_date']);

        $created = 0;

        foreach ($residents as $index => $userId) {
            foreach ($notices as $noticeIndex => $notice) {
                $at = now()->subDays($noticeIndex + 1)->subHours($index % 9);

                DB::table('app_notifications')->updateOrInsert(
                    [
                        'user_id' => $userId,
                        'type' => 'notice.published',
                        'action_url' => '/notices/'.$notice->id,
                    ],
                    [
                        'title' => 'New Notice',
                        'body' => $notice->title,
                        'data' => json_encode(['notice_id' => (int) $notice->id, 'community_id' => $this->cid]),
                        // Leave the two newest unread so the badge is not zero.
                        'read_at' => $noticeIndex < 2 ? null : $at->copy()->addHours(3),
                        'updated_at' => $at,
                        'created_at' => $at,
                    ],
                );
                $created++;
            }

            foreach ($events as $eventIndex => $event) {
                $at = now()->subDays($eventIndex + 2)->subHours($index % 7);

                DB::table('app_notifications')->updateOrInsert(
                    [
                        'user_id' => $userId,
                        'type' => 'event.published',
                        'action_url' => '/notices/'.$event->id,
                    ],
                    [
                        'title' => 'New Event',
                        'body' => $event->title.' — '.Carbon::parse($event->event_date)->format('j M'),
                        'data' => json_encode([
                            'notice_id' => (int) $event->id,
                            'community_id' => $this->cid,
                            'category' => 'event',
                        ]),
                        'read_at' => $eventIndex === 0 ? null : $at->copy()->addHours(5),
                        'updated_at' => $at,
                        'created_at' => $at,
                    ],
                );
                $created++;
            }
        }

        $this->seedBookingNotifications();
        $this->seedBillNotifications();

        $this->command?->info('  Notifications ready: '.$created.'+');
    }

    private function seedBookingNotifications(): void
    {
        $bookings = DB::table('bookings')
            ->join('amenities', 'amenities.id', '=', 'bookings.amenity_id')
            ->where('amenities.community_id', $this->cid)
            ->orderByDesc('bookings.created_at')
            ->limit(8)
            ->get([
                'bookings.id',
                'bookings.user_id',
                'bookings.status',
                'bookings.date',
                'bookings.time_slot',
                'amenities.name as amenity_name',
            ]);

        foreach ($bookings as $index => $booking) {
            $at = now()->subDays($index + 1);

            [$title, $body] = match ($booking->status) {
                'confirmed' => [
                    'Amenity booking confirmed',
                    'Your booking for '.$booking->amenity_name.' on '
                        .Carbon::parse($booking->date)->format('j M').', '.$booking->time_slot.' is confirmed.',
                ],
                'awaiting_payment' => [
                    'Pay for your booking',
                    'Your booking for '.$booking->amenity_name.' is held until the fee is paid. '
                        .'Transfer and upload the screenshot, or pay at the office.',
                ],
                'cancelled' => [
                    'Amenity booking cancelled',
                    'Your booking for '.$booking->amenity_name.' on '
                        .Carbon::parse($booking->date)->format('j M').' was cancelled by the office.',
                ],
                default => [
                    'Amenity booking received',
                    'Your booking for '.$booking->amenity_name.' on '
                        .Carbon::parse($booking->date)->format('j M').' is waiting for approval.',
                ],
            };

            DB::table('app_notifications')->updateOrInsert(
                [
                    'user_id' => $booking->user_id,
                    'type' => 'booking.'.$booking->status,
                    'action_url' => '/bookings/'.$booking->id,
                ],
                [
                    'title' => $title,
                    'body' => $body,
                    'data' => json_encode([
                        'booking_id' => (int) $booking->id,
                        'community_id' => $this->cid,
                    ]),
                    'read_at' => $index < 2 ? null : $at->copy()->addHours(2),
                    'updated_at' => $at,
                    'created_at' => $at,
                ],
            );
        }
    }

    private function seedBillNotifications(): void
    {
        if (! Schema::hasTable('amenity_resident_bills')) {
            return;
        }

        $bills = DB::table('amenity_resident_bills as arb')
            ->join('amenity_monthly_bills as amb', 'amb.id', '=', 'arb.monthly_bill_id')
            ->where('arb.community_id', $this->cid)
            ->whereIn('arb.status', ['unpaid', 'pending_verification'])
            ->orderByDesc('amb.billing_month')
            ->limit(20)
            ->get(['arb.id', 'arb.user_id', 'arb.status', 'arb.amount', 'amb.title', 'amb.due_date']);

        foreach ($bills as $index => $bill) {
            $at = now()->subDays(($index % 5) + 1);
            $unpaid = $bill->status === 'unpaid';

            DB::table('app_notifications')->updateOrInsert(
                [
                    'user_id' => $bill->user_id,
                    'type' => 'amenity_bill.'.$bill->status,
                    'action_url' => '/amenity-bills/'.$bill->id,
                ],
                [
                    'title' => $unpaid ? 'Amenity bill due' : 'Amenity bill under review',
                    'body' => $unpaid
                        ? $bill->title.' — Rs '.number_format((float) $bill->amount)
                            .' due by '.Carbon::parse($bill->due_date)->format('j M').'.'
                        : $bill->title.' — your payment proof is with the office for review.',
                    'data' => json_encode([
                        'resident_bill_id' => (int) $bill->id,
                        'community_id' => $this->cid,
                    ]),
                    'read_at' => $unpaid ? null : $at->copy()->addHours(4),
                    'updated_at' => $at,
                    'created_at' => $at,
                ],
            );
        }
    }
}
