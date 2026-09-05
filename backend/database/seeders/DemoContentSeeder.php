<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Rich, presentation-ready demo content for the primary community plus
 * system-admin scope data. Idempotent: safe to run repeatedly.
 *
 * Images are served locally from /storage/seed/*.jpg (optimized).
 * Run:  php artisan db:seed --class=Database\Seeders\DemoContentSeeder
 */
class DemoContentSeeder extends Seeder
{
    private string $img = '/storage/seed';

    public ?int $targetCommunityId = null;

    public bool $preserveCommunityIdentity = false;

    public bool $seedSystemScope = true;

    public bool $seedFoundationalCatalogs = true;

    /** @var list<array<int, mixed>>|null */
    public ?array $customResidents = null;

    /** @var array<string, string> */
    public array $emailAliases = [];

    private string $copyName = 'Florida Main Street';

    public function run(): void
    {
        if ($this->seedFoundationalCatalogs) {
            $this->call([
                RegionSeeder::class,
                CommunitySeeder::class,
                BostonDemoSeeder::class,
                WellnessHubSeeder::class,
            ]);
        }

        $community = $this->resolveCommunity();

        if (! $community) {
            $this->command?->warn('DemoContentSeeder: no community found.');

            return;
        }

        $cid = $community->id;
        $region = DB::table('regions')->where('status', 'active')->orderBy('sort_order')->first();
        $boston = DB::table('regions')->where('title', 'Massachusetts - Boston')->first();
        $regionId = $community->region_id ?: ($boston->id ?? $region->id ?? null);

        if (! $this->preserveCommunityIdentity) {
            DB::table('communities')->where('id', $cid)->update([
                'name' => BostonDemoSeeder::COMMUNITY_NAME,
                'description' => 'Waterfront residences in Boston’s Seaport District. Residents share a fitness studio, courtyard garden, lounge, and 24-hour concierge along the Harborwalk.',
                'address' => BostonDemoSeeder::COMMUNITY_ADDRESS,
                'region' => $boston->title ?? 'Massachusetts - Boston',
                'region_id' => $boston->id ?? $regionId,
                'timezone' => 'America/New_York',
                'updated_at' => now(),
            ]);
            $this->copyName = BostonDemoSeeder::COMMUNITY_NAME;
            $regionId = $boston->id ?? $regionId;
        } else {
            $this->copyName = $community->name ?: 'Test Community';
        }

        $residents = $this->seedResidents($cid, $regionId);
        $adminId = $this->resolveAdminAuthor($cid);

        $amenitySeeder = new AmenitySeeder;
        $amenitySeeder->targetCommunityId = (int) $cid;
        if ($this->command) {
            $amenitySeeder->setCommand($this->command);
        }
        $amenitySeeder->run();

        $this->seedNotices($cid, $adminId);
        $this->archiveLegacyUnscheduledNotices($cid);
        $this->seedEvents($cid, $adminId, $residents);
        $this->seedAlerts($cid, $adminId);
        $this->seedFeed($cid, $residents);
        $this->seedListings($cid, $residents);
        $this->seedBusinessesAndDeals($cid, $residents, $adminId);
        $this->seedNearbyDiscovery($cid, $regionId, $residents, $adminId);
        $this->seedWellnessImages();
        if (! $this->preserveCommunityIdentity) {
            $this->call(NoticeAndDealTranslationSeeder::class);
        }
        $this->seedRules($cid, $adminId, $residents);
        $this->seedDocuments($cid, $adminId);
        $this->seedMessages($residents, $adminId);
        $this->seedNotifications($residents, $adminId);
        $this->seedPoints($cid, $residents);
        $this->seedModeration($cid, $residents, $adminId);

        if ($this->seedSystemScope) {
            $this->seedContactSubmissions();
            $this->seedAdminApplicants($regionId);
            $this->seedActivityLogs($residents, $adminId);
        }

        $this->command?->info('DemoContentSeeder: demo content ready for community #'.$cid.'.');
    }

    private function resolveCommunity(): ?object
    {
        if ($this->targetCommunityId) {
            return DB::table('communities')->where('id', $this->targetCommunityId)->first();
        }

        return BostonDemoSeeder::showcaseCommunityQuery()
            ->where('status', 'active')
            ->first()
            ?? DB::table('communities')
                ->where('status', 'active')
                ->orderBy('id')
                ->first();
    }

    private function mappedEmail(string $email): string
    {
        return $this->emailAliases[$email] ?? $email;
    }

    private function residentId(array $residents, string $email): ?int
    {
        $mapped = $this->mappedEmail($email);
        $id = $residents[$mapped] ?? $residents[$email] ?? null;

        return $id ? (int) $id : null;
    }

    /* ─────────────────────────── Residents ─────────────────────────── */

    private function seedResidents(int $cid, ?int $regionId): array
    {
        // [name, email, unit, residence_type, bio, avatarN, membership, role]
        $people = $this->customResidents ?? [
            ['Sarah Mitchell', 'sarah@havena.app', 'Apt 4B', 'Two-bedroom', 'Book club host and weekend gardener. Always happy to lend a hand.', 5, 'approved', 'member'],
            ['David Chen', 'david@havena.app', 'Apt 6D', 'Studio', 'Software engineer, coffee enthusiast, and casual cyclist.', 12, 'approved', 'member'],
            ['Lisa Wang', 'lisa@havena.app', 'Apt 2A', 'One-bedroom', 'Yoga instructor and plant collector. Ask me about houseplants.', 20, 'approved', 'member'],
            ['James Okafor', 'james@havena.app', 'Apt 7A', 'Two-bedroom', 'New to the neighborhood and excited to get involved.', 33, 'pending', 'member'],
            ['Emily Rodriguez', 'emily@havena.app', 'Apt 1C', 'One-bedroom', 'Freelance designer who loves farmers markets and long walks.', 45, 'approved', 'member'],
            ['Michael Torres', 'michael@havena.app', 'Apt 5F', 'Three-bedroom', 'Dad of two, grill master, and community volunteer.', 15, 'approved', 'moderator'],
            ['Priya Patel', 'priya@havena.app', 'Apt 3B', 'Two-bedroom', 'Physician and runner. Organizing the morning run group.', 26, 'approved', 'member'],
            ['Carlos Mendez', 'carlos@havena.app', 'Apt 8C', 'One-bedroom', 'Photographer capturing everyday moments around the community.', 51, 'approved', 'member'],
            ['Aisha Johnson', 'aisha@havena.app', 'Apt 2D', 'Studio', 'Teacher, baker, and proud dog mom to a golden retriever.', 47, 'approved', 'member'],
            ['Tom Becker', 'tom@havena.app', 'Apt 6A', 'Two-bedroom', 'Retired contractor. Handy with just about anything.', 60, 'approved', 'member'],
            ['Nina Kowalski', 'nina@havena.app', 'Apt 4C', 'One-bedroom', 'Marketing lead who loves community events and trivia nights.', 31, 'approved', 'member'],
            ['Diego Alvarez', 'diego@havena.app', 'Apt 9B', 'Three-bedroom', 'Chef exploring the local food scene one dish at a time.', 13, 'pending', 'member'],
            ['Grace Lee', 'grace@havena.app', 'Apt 1A', 'One-bedroom', 'Nurse and volunteer who enjoys quiet evenings by the pool.', 44, 'approved', 'member'],
            ['Robert Hayes', 'robert@havena.app', 'Apt 7D', 'Two-bedroom', 'Musician and night owl.', 68, 'banned', 'member'],
        ];

        $map = [];
        foreach ($people as $index => [$name, $email, $unit, $type, $bio, $avatarN, $status, $role]) {
            DB::table('users')->updateOrInsert(
                ['email' => $email],
                [
                    'uuid' => (string) Str::ulid(),
                    'name' => $name,
                    'password' => bcrypt('password'),
                    'role' => 'resident',
                    'status' => $status === 'banned' ? 'suspended' : 'active',
                    'email_verified_at' => now(),
                    'updated_at' => now(),
                    'created_at' => now()->subDays(rand(40, 220)),
                ]
            );

            $userId = DB::table('users')->where('email', $email)->value('id');
            $map[$email] = $userId;
            $avatarFile = 'avatar-'.str_pad((string) (($index % 14) + 1), 2, '0', STR_PAD_LEFT).'.jpg';

            DB::table('profiles')->updateOrInsert(
                ['user_id' => $userId],
                [
                    'display_name' => $name,
                    'avatar_url' => "{$this->img}/{$avatarFile}",
                    'bio' => $bio,
                    'unit_number' => $unit,
                    'residence_type' => $type,
                    'region_id' => $regionId,
                    'updated_at' => now(),
                    'created_at' => now()->subDays(rand(40, 220)),
                ]
            );

            DB::table('community_memberships')->updateOrInsert(
                ['user_id' => $userId, 'community_id' => $cid],
                [
                    'role' => $role,
                    'status' => $status,
                    'updated_at' => now(),
                    'created_at' => now()->subDays(rand(40, 220)),
                ]
            );
        }

        // Give the standing test accounts avatars too, if present.
        foreach ([
            'resident@gohavena.com' => 'avatar-alex.jpg',
            'community@gohavena.com' => 'avatar-admin.jpg',
            'test.resident@havena.app' => 'avatar-alex.jpg',
            'test.community.admin@havena.app' => 'avatar-admin.jpg',
            'community.admin@havena.app' => 'avatar-admin.jpg',
        ] as $email => $avatarFile) {
            if ($this->emailAliases !== [] && ! isset($this->emailAliases[$email])) {
                continue;
            }
            $lookup = $this->mappedEmail($email);
            $uid = DB::table('users')->where('email', $lookup)->value('id');
            if (! $uid) {
                continue;
            }
            $existingAvatar = DB::table('profiles')->where('user_id', $uid)->value('avatar_url');
            $payload = ['updated_at' => now()];
            if (! $existingAvatar || str_starts_with((string) $existingAvatar, '/storage/seed/')) {
                $payload['avatar_url'] = "{$this->img}/{$avatarFile}";
            }
            DB::table('profiles')->updateOrInsert(
                ['user_id' => $uid],
                $payload
            );
            $map[$lookup] = $uid;
            $map[$email] = $uid;
        }

        return $map;
    }

    private function resolveAdminAuthor(int $cid): int
    {
        $showcaseAdmin = DB::table('users')->where('email', BostonDemoSeeder::ADMIN_EMAIL)->value('id');
        if ($showcaseAdmin) {
            return (int) $showcaseAdmin;
        }

        $adminMembership = DB::table('community_memberships')
            ->where('community_id', $cid)
            ->where('role', 'admin')
            ->where('status', 'approved')
            ->orderBy('user_id')
            ->value('user_id');

        if ($adminMembership) {
            return $adminMembership;
        }

        $admin = DB::table('users')->whereIn('role', ['community_admin', 'system_admin'])->orderBy('id')->value('id');

        return $admin ?: DB::table('users')->orderBy('id')->value('id');
    }

    /* ─────────────────────────── Notices ─────────────────────────── */

    private function seedNotices(int $cid, int $adminId): void
    {
        // [title, category, body, image, daysAgo, pinned]
        $rows = [
            ['Welcome to '.$this->copyName, 'general', "Welcome to Harbor Point. Use this app for notices, events, amenity booking, the resident marketplace, and messages with your neighbors. The management office is on the ground floor of 50 Liberty Drive — reach out anytime.", "{$this->img}/community-cover.jpg", 1, true],
            ['Pool Deck Resurfacing Schedule', 'maintenance', "The pool deck will be resurfaced next week to keep our resort pool looking its best. The pool will remain open, but the north deck section will be closed Monday through Wednesday from 8:00 AM to 4:00 PM. Thank you for your patience.", "{$this->img}/notice-maintenance.jpg", 3, false],
            ['Q3 Community Budget Summary', 'finance', "The third quarter budget summary is now available in the Documents section. Highlights include reserve fund contributions, landscaping investments, and the new smart access system. A detailed breakdown will be presented at the upcoming town hall.", "{$this->img}/event-townhall.jpg", 5, false],
            ['Updated Gate Access Codes', 'security', "For everyone's safety, gate and amenity access codes will be rotated at the end of the month. Updated codes will be sent to registered residents by email and are available at the management office with a valid ID.", "{$this->img}/notice-security.jpg", 7, false],
            ['Elevator Modernization Update', 'maintenance', "Elevator B in the east tower will undergo modernization over the next two weeks. Elevator A remains fully operational. We appreciate your understanding as we improve reliability and reduce wait times.", "{$this->img}/amenity-gym.jpg", 9, false],
            ['Landscaping Refresh This Month', 'general', "Our grounds team is refreshing the entry gardens and courtyard plantings this month. Expect new seasonal flowers, upgraded irrigation, and improved lighting along the main walkways.", "{$this->img}/listing-plants.jpg", 4, false],
            ['Saturday Boston Public Market Shuttle', 'general', "A complimentary shuttle runs from the Liberty Drive lobby to Boston Public Market every Saturday from 8:00 AM to 12:00 PM. Meet at the front porte cochère — no RSVP needed.", "{$this->img}/feed-market.jpg", 2, true],
            ['New Resident Welcome Packets', 'general', "New neighbors can pick up welcome packets at the management office. Packets include amenity hours, Wi‑Fi info, recycling guidelines, and this month's community calendar.", "{$this->img}/business-cafe.jpg", 6, false],
            ['Clubhouse Hours Extended', 'general', "Good news — the clubhouse lounge will stay open until 10:00 PM on Fridays and Saturdays starting this weekend. Quiet hours still begin at 11:00 PM.", "{$this->img}/amenity-clubhouse.jpg", 8, false],
            ['Pet Registration Reminder', 'general', "Please register pets at the management office if you have not already. Include a recent photo and vaccination records. Registered pets help us reunite lost animals quickly.", "{$this->img}/feed-dog.jpg", 10, false],
        ];

        foreach ($rows as $index => [$title, $category, $body, $image, $daysAgo, $pinned]) {
            // Stagger dummy board dates into the coming weeks so home/expiry stay valid.
            $eventDate = now()->startOfDay()->addDays(2 + ($index * 2));
            $payload = [
                'author_id' => $adminId,
                'category' => $category,
                'body' => $body,
                'image_url' => $image,
                'event_date' => $eventDate->toDateString(),
                'event_time' => '09:00',
                'event_time_end' => '17:00',
                'status' => 'published',
                'review_status' => 'approved',
                'is_global' => false,
                'approved_by' => $adminId,
                'approved_at' => now()->subDays($daysAgo),
                'published_at' => now()->subDays($daysAgo),
                'updated_at' => now()->subDays($daysAgo),
                'created_at' => now()->subDays($daysAgo),
            ];
            if ($this->noticesHasColumn('is_pinned')) {
                $payload['is_pinned'] = $pinned;
            }
            DB::table('notices')->updateOrInsert(
                ['community_id' => $cid, 'title' => $title],
                $payload
            );
        }

        // Leftover published notices (old uploads) — keep them visible with seed covers + future dates.
        $this->refreshOrphanNoticeDemoMedia($cid);
    }

    private function refreshOrphanNoticeDemoMedia(int $cid): void
    {
        $demoTitles = [
            'Welcome to '.$this->copyName,
            'Pool Deck Resurfacing Schedule',
            'Q3 Community Budget Summary',
            'Updated Gate Access Codes',
            'Elevator Modernization Update',
            'Landscaping Refresh This Month',
            'Saturday Boston Public Market Shuttle',
            'New Resident Welcome Packets',
            'Clubhouse Hours Extended',
            'Pet Registration Reminder',
            'Summer Community BBQ',
            'Quarterly Residents Town Hall',
            'Poolside Movie Night',
            'Holiday Cookie Exchange',
            'Sunrise Yoga by the Pool',
            'Fitness Bootcamp Saturday',
            'Neighborhood Coffee Meetup',
            'Kids Arts & Crafts Afternoon',
            'Winter Storm Watch: Secure Balconies',
        ];

        $orphans = DB::table('notices')
            ->where('community_id', $cid)
            ->where('status', 'published')
            ->where('category', '!=', 'emergency')
            ->whereNotIn('title', $demoTitles)
            ->orderBy('id')
            ->get(['id', 'image_url']);

        foreach ($orphans as $i => $row) {
            $image = $row->image_url;
            if (! is_string($image) || ! str_starts_with($image, '/storage/seed/')) {
                $image = "{$this->img}/community-cover.jpg";
            }
            DB::table('notices')->where('id', $row->id)->update([
                'image_url' => $image,
                'event_date' => now()->startOfDay()->addDays(3 + $i)->toDateString(),
                'event_time' => '10:00',
                'event_time_end' => '16:00',
                'updated_at' => now(),
            ]);
        }
    }

    /** Legacy rows without a schedule no longer belong on the resident board. */
    private function archiveLegacyUnscheduledNotices(int $cid): void
    {
        DB::table('notices')
            ->where('community_id', $cid)
            ->whereNull('event_date')
            ->where('status', 'published')
            ->where('category', '!=', 'emergency')
            ->update([
                'status' => 'archived',
                'updated_at' => now(),
            ]);
    }

    private function seedEvents(int $cid, int $adminId, array $residents): void
    {
        // [title, body, image, when, start24h, end24h, capacity, location, pinned]
        $rows = [
            ['Summer Community BBQ', "Join your neighbors for our biggest cookout of the season. We will have grilled favorites, games for the kids, live music, and plenty of shade. Bring a side dish to share if you like.", "{$this->img}/event-bbq.jpg", '+6 days', '17:00', '20:00', 120, 'Courtyard Lawn', true],
            ['Quarterly Residents Town Hall', "Meet the management team, review community updates, and share your ideas. We will cover the Q3 budget, upcoming projects, and answer your questions.", "{$this->img}/event-townhall.jpg", '+12 days', '18:30', '20:00', 80, 'Clubhouse Lounge', true],
            ['Poolside Movie Night', "Grab a towel and settle in for a family friendly movie under the stars by the pool. Popcorn and refreshments provided.", "{$this->img}/amenity-pool.jpg", '+9 days', '20:00', '22:00', 60, 'Resort Pool Deck', false],
            ['Holiday Cookie Exchange', "Bring a batch of your favorite cookies and swap with neighbors. A cozy way to meet new faces and share recipes.", "{$this->img}/event-cookies.jpg", '+20 days', '15:00', '17:00', 40, 'Clubhouse Lounge', false],
            ['Sunrise Yoga by the Pool', "Start the weekend with a gentle yoga flow led by resident instructor Lisa. Mats provided for the first 20 arrivals. All levels welcome.", "{$this->img}/event-yoga.jpg", '+4 days', '07:30', '08:30', 25, 'Resort Pool Deck', false],
            ['Fitness Bootcamp Saturday', "A high-energy outdoor bootcamp with stations for cardio, strength, and mobility. Bring water and athletic shoes.", "{$this->img}/event-bootcamp.jpg", '+11 days', '09:00', '10:00', 30, 'Courtyard Lawn', false],
            ['Neighborhood Coffee Meetup', "Casual coffee and conversation for new and longtime residents. Stop by anytime during the open house window.", "{$this->img}/event-coffee.jpg", '+3 days', '10:00', '11:30', 50, 'Lobby Café Corner', false],
            ['Kids Arts & Crafts Afternoon', "Creative stations for kids ages 5–12 with painting, stickers, and take-home crafts. Parents must stay on site.", "{$this->img}/listing-plants.jpg", '+14 days', '14:00', '16:00', 35, 'Clubhouse Activity Room', false],
        ];

        foreach ($rows as [$title, $body, $image, $when, $start, $end, $cap, $location, $pinned]) {
            $payload = [
                'author_id' => $adminId,
                'category' => 'event',
                'body' => $body,
                'location' => $location,
                'image_url' => $image,
                'event_date' => now()->modify($when)->toDateString(),
                'event_time' => $start,
                'event_time_end' => $end,
                'event_capacity' => $cap,
                'status' => 'published',
                'review_status' => 'approved',
                'is_global' => false,
                'approved_by' => $adminId,
                'approved_at' => now()->subDays(2),
                'published_at' => now()->subDays(2),
                'updated_at' => now()->subDays(2),
                'created_at' => now()->subDays(2),
            ];
            if ($this->noticesHasColumn('requires_rsvp')) {
                $payload['requires_rsvp'] = true;
            }
            if ($this->noticesHasColumn('is_pinned')) {
                $payload['is_pinned'] = $pinned;
            }
            DB::table('notices')->updateOrInsert(
                ['community_id' => $cid, 'title' => $title],
                $payload
            );
        }

        // RSVPs across several events so the resident app looks lively.
        $users = array_values(array_filter($residents));
        $eventTitles = [
            'Summer Community BBQ',
            'Quarterly Residents Town Hall',
            'Poolside Movie Night',
            'Sunrise Yoga by the Pool',
            'Neighborhood Coffee Meetup',
        ];
        foreach ($eventTitles as $eIdx => $title) {
            $noticeId = DB::table('notices')->where('community_id', $cid)->where('title', $title)->value('id');
            if (! $noticeId) {
                continue;
            }
            $statuses = ['going', 'going', 'going', 'maybe', 'going', 'not_going', 'going', 'maybe', 'going', 'going'];
            foreach ($users as $i => $uid) {
                if ($i >= 10) {
                    break;
                }
                DB::table('event_rsvps')->updateOrInsert(
                    ['notice_id' => $noticeId, 'user_id' => $uid],
                    ['status' => $statuses[($i + $eIdx) % count($statuses)], 'updated_at' => now(), 'created_at' => now()->subDays(rand(1, 3))]
                );
            }
        }
    }

    private function noticesHasColumn(string $column): bool
    {
        static $columns = null;
        if ($columns === null) {
            $columns = collect(DB::select('SHOW COLUMNS FROM notices'))->pluck('Field')->all();
        }

        return in_array($column, $columns, true);
    }

    private function seedAlerts(int $cid, int $adminId): void
    {
        DB::table('notices')->updateOrInsert(
            ['community_id' => $cid, 'title' => 'Winter Storm Watch: Secure Balconies'],
            [
                'author_id' => $adminId,
                'category' => 'emergency',
                'body' => "A winter storm watch is in effect for Greater Boston through Thursday. Please bring in balcony furniture and loose items, charge your devices, and review the Emergency Preparedness Guide in Documents. The management team will share updates as conditions change. Stay warm and stay safe.",
                'image_url' => "{$this->img}/alert-weather.jpg",
                'status' => 'published',
                'review_status' => 'approved',
                'is_global' => false,
                'approved_by' => $adminId,
                'approved_at' => now()->subDay(),
                'published_at' => now()->subDay(),
                'updated_at' => now()->subDay(),
                'created_at' => now()->subDay(),
            ]
        );
    }

    /* ─────────────────────────── Feed ─────────────────────────── */

    private function seedFeed(int $cid, array $residents): void
    {
        $u = fn (string $email) => $this->residentId($residents, $email);

        $posts = [
            ['resident@gohavena.com', 'general', "Beautiful morning on the Harborwalk. If anyone wants to join a casual Saturday loop from Liberty Drive to Fan Pier and back, comment below — all paces welcome.", "{$this->img}/feed-harborwalk.jpg", 1],
            ['aisha@havena.app', 'help', "Has anyone seen Biscuit? Our golden retriever slipped out of the lobby this afternoon near the east tower. He is very friendly and wearing a blue collar. Please call me if you spot him. Thank you neighbors!", "{$this->img}/feed-dog.jpg", 1],
            ['emily@havena.app', 'general', "Boston Public Market was packed this morning. Fresh strawberries, local honey, and the best sourdough. Highly recommend the Saturday shuttle from the lobby.", "{$this->img}/feed-market.jpg", 2],
            ['priya@havena.app', 'general', "Starting a morning run group! We meet at the clubhouse at 6:30 AM on Tuesdays and Thursdays. All paces welcome, we stick together. Comment below if you want to join.", "{$this->img}/feed-run.jpg", 3],
            ['tom@havena.app', 'help', "Looking for a recommendation for a reliable plumber who has worked in the building before. Slow drain in the kitchen. Appreciate any leads.", "{$this->img}/feed-plumber.jpg", 4],
            ['david@havena.app', 'general', "Big thank you to the maintenance team for fixing the gym AC so quickly. Back to full workouts in comfort. You all are the best.", "{$this->img}/feed-gym.jpg", 5],
            ['nina@havena.app', 'general', "Free moving boxes available! We just unpacked and have about fifteen sturdy boxes plus packing paper. First come first served, message me and I will leave them by the mailroom.", "{$this->img}/feed-boxes.jpg", 6],
            ['carlos@havena.app', 'general', "Golden hour from the ninth-floor walkway after dinner. Even on a weeknight this waterfront view still stops me. If you have not walked the Harborwalk at dusk yet, go tonight.", "{$this->img}/feed-skyline.jpg", 0],
            ['sarah@havena.app', 'event', "Harbor Point Book Club meets Thursday at 7:00 PM in the clubhouse lounge. This month we are discussing The Lincoln Highway. Extra chairs and tea provided — come even if you have not finished.", "{$this->img}/feed-books.jpg", 1],
            ['michael@havena.app', 'event', "Family movie night on the courtyard lawn Saturday at 6:30 PM. We are bringing a projector, blankets, and popcorn. Kids welcome. If it rains we will move into the clubhouse.", "{$this->img}/feed-kids.jpg", 2],
            ['grace@havena.app', 'update', "The new courtyard plantings look wonderful. Thank you to the grounds team — the entry walk feels like a different building this week.", "{$this->img}/feed-garden.jpg", 1],
            ['aisha@havena.app', 'general', "Baked too many loaves this morning. Three extra banana breads are on the lobby console — please take one if you are heading out. Nut-free.", "{$this->img}/feed-bread.jpg", 0],
            ['emily@havena.app', 'help', "Found a set of Honda keys with a blue Harbor Point fob by the P2 elevator this morning. I turned them in at the front desk.", "{$this->img}/feed-keys.jpg", 0],
            ['community@gohavena.com', 'announcement', "New recycling totes are now on every residential floor next to the trash rooms. Please rinse bottles, flatten cardboard, and keep food waste in the compost pail. Questions? Message the management office.", "{$this->img}/feed-recycle.jpg", 3],
            ['tom@havena.app', 'update', "I reorganized the overflow package shelf in the mailroom this afternoon. If you are waiting on a box, check the labeled bins by carrier before asking the desk.", "{$this->img}/feed-packages.jpg", 2],
            ['nina@havena.app', 'general', "Trivia night in the lounge was a blast — 4C took second by one point. Next round is Friday at 8:00 PM. Teams of four, first round is Boston history.", "{$this->img}/feed-trivia.jpg", 4],
            ['lisa@havena.app', 'general', "Tried the grilled prawns at Legal Harborside last night — excellent for a weeknight. Reservations help after 7. Happy to share the dish we ordered if anyone wants a rec.", "{$this->img}/feed-dinner.jpg", 1],
            ['michael@havena.app', 'help', "Looking for a trusted weekend babysitter in the building for two kids, ages 6 and 9. Saturday 5–9 PM, courtyard movie night. Happy to swap favors.", "{$this->img}/feed-family.jpg", 3],
        ];

        foreach ($posts as [$email, $category, $body, $image, $daysAgo]) {
            $uid = $u($email);
            if (! $uid) {
                continue;
            }
            $at = now()->subDays($daysAgo)->subMinutes(($daysAgo + 1) * 17);
            DB::table('posts')->updateOrInsert(
                ['community_id' => $cid, 'user_id' => $uid, 'body' => $body],
                [
                    'category' => $category,
                    'image_url' => $image,
                    'status' => 'approved',
                    'approved_at' => $at,
                    'likes_count' => 0,
                    'comments_count' => 0,
                    'updated_at' => $at,
                    'created_at' => $at,
                ]
            );
        }

        $findPost = fn (string $like) => DB::table('posts')
            ->where('community_id', $cid)
            ->where('body', 'like', $like)
            ->value('id');

        $commentGroups = [
            'Beautiful morning on the Harborwalk%' => [
                ['priya@havena.app', 'I am in for Saturday. Meeting at the Liberty Drive lobby at 8:30?'],
                ['david@havena.app', 'Perfect pace for me. I will bring water and a spare tube.'],
                ['carlos@havena.app', 'Gorgeous light this morning. I may join with a camera, not a run.'],
            ],
            'Has anyone seen Biscuit%' => [
                ['sarah@havena.app', 'I think I saw him near the pool gate about an hour ago. Keeping an eye out!'],
                ['michael@havena.app', 'Sharing with my floor group chat. We will help look.'],
                ['grace@havena.app', 'So glad neighbors are looking. What a sweetheart.'],
                ['emily@havena.app', 'Just walked the east path — no sign yet. Sending a photo to the lobby desk.'],
                ['priya@havena.app', 'I will keep an eye out on my morning run. Hope he is home soon.'],
                ['tom@havena.app', 'Checking the courtyard cameras with the front office now.'],
                ['david@havena.app', 'Saw a golden near the mailroom earlier. Was it Biscuit?'],
                ['nina@havena.app', 'Putting treats by the lobby door in case he comes back.'],
                ['lisa@havena.app', 'Posted in the building WhatsApp. Lots of neighbors looking.'],
                ['carlos@havena.app', 'I can print flyers if you still need them tonight.'],
            ],
            'Boston Public Market was packed%' => [
                ['lisa@havena.app', 'The honey vendor is my favorite. See you there Saturday!'],
                ['carlos@havena.app', 'Great photos. Adding this to my weekend plans.'],
                ['sarah@havena.app', 'Their sourdough sells out by 10. Worth the early shuttle.'],
            ],
            'Starting a morning run group%' => [
                ['resident@gohavena.com', 'Count me in for Thursday. I am a slow-and-steady runner.'],
                ['grace@havena.app', 'I can do Tuesdays after night shift some weeks. Thank you for organizing.'],
                ['david@havena.app', 'Clubhouse at 6:30 works. I will post if I am running late.'],
            ],
            'Looking for a recommendation for a reliable plumber%' => [
                ['tom@havena.app', 'North End Plumbing has been in 6A twice. Clean, on time, fair price.'],
                ['michael@havena.app', 'Same company fixed our tub last year. Ask for Luis.'],
                ['sarah@havena.app', 'Management also keeps a preferred vendor list at the desk.'],
            ],
            'Big thank you to the maintenance team%' => [
                ['priya@havena.app', 'Agreed — they were in the gym before 8 AM. Impressive.'],
                ['nina@havena.app', 'Shout-out to the whole ops team this week.'],
            ],
            'Free moving boxes available%' => [
                ['emily@havena.app', 'Grabbing four this afternoon if they are still there. Thank you!'],
                ['james@havena.app', 'New neighbor here — I could use a few this weekend.'],
            ],
            'Caught the Seaport skyline%' => [
                ['emily@havena.app', 'This is stunning, Carlos. Ninth floor never disappoints.'],
                ['lisa@havena.app', 'Dusk walks are my favorite. Thank you for sharing this.'],
                ['nina@havena.app', 'Saving this as my reminder to get outside tonight.'],
            ],
            'Harbor Point Book Club meets Thursday%' => [
                ['emily@havena.app', 'I am two chapters behind and still coming. Save me a chair.'],
                ['grace@havena.app', 'I can bring herbal tea. See you Thursday.'],
                ['nina@havena.app', 'Lincoln Highway was a great pick. Count me in.'],
            ],
            'Family movie night on the courtyard lawn%' => [
                ['aisha@havena.app', 'We will be there with a blanket. What is the film?'],
                ['sarah@havena.app', 'I can help with snacks if you need an extra pair of hands.'],
                ['priya@havena.app', 'Wonderful idea. The kids will love this.'],
            ],
            'The new courtyard plantings look wonderful%' => [
                ['sarah@havena.app', 'The hydrangeas by the entry are gorgeous. Thank you for noticing.'],
                ['lisa@havena.app', 'Already took a photo for the plant club thread.'],
            ],
            'Baked too many loaves this morning%' => [
                ['david@havena.app', 'Grabbed a loaf on my way to work. You are a hero.'],
                ['grace@havena.app', 'Thank you for labeling nut-free. That helps a lot.'],
            ],
            'Found a set of Honda keys%' => [
                ['tom@havena.app', 'Front desk confirmed they have them. Owner should check in.'],
                ['michael@havena.app', 'Good looking out, Emily.'],
            ],
            'New recycling totes are now on every residential floor%' => [
                ['tom@havena.app', 'Thank you. The old bins on 6 were overflowing every Monday.'],
                ['sarah@havena.app', 'Is compost pickup still Wednesday mornings?'],
                ['nina@havena.app', 'Noted. I will rinse bottles and flatten the moving boxes before they go down.'],
            ],
            'I reorganized the overflow package shelf%' => [
                ['david@havena.app', 'Found my Amazon box in two minutes. Thank you, Tom.'],
                ['emily@havena.app', 'This was much needed. The shelf was chaos yesterday.'],
            ],
            'Trivia night in the lounge was a blast%' => [
                ['carlos@havena.app', '4C got lucky on that last Boston question. Rematch Friday.'],
                ['lisa@havena.app', 'I will recruit a fourth. Do not start without us.'],
                ['resident@gohavena.com', 'First time was so fun. Putting it on the calendar.'],
            ],
            'Tried the grilled prawns at Legal Harborside%' => [
                ['grace@havena.app', 'We go there after late shifts. The harbor view is worth it.'],
                ['sarah@havena.app', 'Saving this. Thank you for the honest rec.'],
            ],
            'Looking for a trusted weekend babysitter%' => [
                ['priya@havena.app', 'Maya in 3B sits for us. I can intro you over message.'],
                ['aisha@havena.app', 'I am free Saturday after 6 if you still need a backup.'],
            ],
        ];

        foreach ($commentGroups as $like => $rows) {
            $postId = $findPost($like);
            if (! $postId) {
                continue;
            }
            $hours = 2;
            foreach ($rows as [$email, $body]) {
                $uid = $u($email);
                if (! $uid) {
                    continue;
                }
                DB::table('post_comments')->updateOrInsert(
                    ['post_id' => $postId, 'user_id' => $uid, 'body' => $body],
                    [
                        'updated_at' => now()->subHours($hours),
                        'created_at' => now()->subHours($hours),
                    ]
                );
                $hours += 3;
            }
        }

        $likeEmails = [
            'resident@gohavena.com', 'sarah@havena.app', 'david@havena.app', 'lisa@havena.app',
            'emily@havena.app', 'michael@havena.app', 'priya@havena.app', 'carlos@havena.app',
            'aisha@havena.app', 'tom@havena.app', 'nina@havena.app', 'grace@havena.app',
        ];
        $seededPostIds = DB::table('posts')->where('community_id', $cid)->whereNull('deleted_at')->pluck('id');
        foreach ($seededPostIds as $index => $postId) {
            $take = 5 + ($index % 7);
            foreach (array_slice($likeEmails, 0, $take) as $email) {
                $uid = $u($email);
                if (! $uid) {
                    continue;
                }
                DB::table('post_likes')->updateOrInsert(['user_id' => $uid, 'post_id' => $postId], []);
            }
        }

        foreach ($seededPostIds as $postId) {
            DB::table('posts')->where('id', $postId)->update([
                'likes_count' => DB::table('post_likes')->where('post_id', $postId)->count(),
                'comments_count' => DB::table('post_comments')
                    ->where('post_id', $postId)
                    ->whereNull('deleted_at')
                    ->count(),
            ]);
        }
    }

    /* ─────────────────────────── Marketplace ─────────────────────────── */

    private function seedListings(int $cid, array $residents): void
    {
        $u = fn (string $email) => $this->residentId($residents, $email);

        $rows = [
            ['sarah@havena.app', 'for_sale', 'Furniture', 'Like new', 'Gray 3-Seat Sofa', 220.00, "Comfortable light gray fabric sofa in excellent condition. Smoke free and pet free home. Pickup from Apt 4B.", ['listing-sofa'], 3],
            ['david@havena.app', 'for_sale', 'Sports', 'Good', 'Hybrid Commuter Bike', 180.00, "Reliable hybrid bike, recently tuned with new tires. Great for the trail or commuting. Minor cosmetic wear.", ['listing-bike'], 5],
            ['emily@havena.app', 'for_sale', 'Furniture', 'Good', 'White Office Desk', 95.00, "Clean white home office desk with drawers. Perfect for a study nook. Some light scuffs on the legs.", ['listing-desk'], 6],
            ['lisa@havena.app', 'for_sale', 'Home & Garden', 'New', 'Indoor Plant Bundle', 40.00, "Five healthy potted houseplants including a snake plant and pothos. Great starter set for a green corner.", ['listing-plants'], 2],
            ['carlos@havena.app', 'for_sale', 'Electronics', 'Good', '55 inch 4K Smart TV', 300.00, "55 inch 4K smart TV with remote and stand. Crisp picture, works perfectly. Upgrading to a larger size.", ['listing-tv'], 8],
            ['nina@havena.app', 'for_sale', 'Baby & Kids', 'Like new', 'Baby Stroller', 120.00, "Lightweight stroller, folds easily, barely used. Includes rain cover. Pickup from the lobby.", ['listing-stroller'], 4],
            ['priya@havena.app', 'service', 'Services', null, 'Math Tutoring (Grades 6-12)', 30.00, "Experienced tutor offering math help for middle and high school students. Evenings and weekends. First session is free.", [], 10],
            ['tom@havena.app', 'wanted', 'Furniture', null, 'Wanted: Standing Desk', null, "Looking for a used sit-stand desk in good condition. Willing to pick up. Let me know what you have.", [], 7],
        ];

        foreach ($rows as [$email, $type, $category, $condition, $title, $price, $desc, $images, $daysAgo]) {
            $uid = $u($email);
            if (! $uid) {
                continue;
            }
            $imgs = array_map(fn ($n) => "{$this->img}/{$n}.jpg", $images);
            DB::table('listings')->updateOrInsert(
                ['community_id' => $cid, 'user_id' => $uid, 'title' => $title],
                [
                    'type' => $type,
                    'category' => $category,
                    'condition' => $condition,
                    'price' => $price,
                    'description' => $desc,
                    'location' => $this->copyName,
                    'images' => json_encode($imgs),
                    'status' => 'approved',
                    'is_verified' => true,
                    'approved_at' => now()->subDays($daysAgo),
                    'updated_at' => now()->subDays($daysAgo),
                    'created_at' => now()->subDays($daysAgo),
                ]
            );
        }
    }

    private function seedBusinessesAndDeals(int $cid, array $residents, int $adminId): void
    {
        $owner = fn (string $email) => $this->residentId($residents, $email) ?? $adminId;

        $shops = [
            [
                'name' => 'Harborwalk Coffee',
                'category' => 'Cafe',
                'description' => 'Seaport coffee bar serving specialty espresso, fresh pastries, and cold brew. Locally roasted beans and a patio facing the Harborwalk.',
                'address' => '50 Liberty Drive, Suite 4, Boston, MA 02210',
                'phone' => '(617) 555-0142',
                'hours' => 'Mon-Sun 6:30 AM - 7:00 PM',
                'amenities' => 'Free WiFi, Outdoor seating, Loyalty rewards',
                'image' => 'business-cafe',
                'owner' => 'emily@havena.app',
                'deal' => [
                    'title' => '20% Off Any Latte',
                    'description' => 'Show this coupon at the counter to get 20% off any latte, hot or iced.',
                    'type' => 'coupon',
                    'label' => '20% OFF',
                    'original' => 5.50,
                    'discounted' => 4.40,
                    'promo' => 'BREW20',
                    'image' => 'deal-coffee',
                    'endDays' => 30,
                ],
            ],
            [
                'name' => 'Core Pilates Studio',
                'category' => 'Fitness',
                'description' => 'Boutique pilates and reformer studio with certified instructors. Small classes for all levels, from beginner to advanced.',
                'address' => '50 Liberty Drive, Suite 8, Boston, MA 02210',
                'phone' => '(617) 555-0187',
                'hours' => 'Mon-Sat 6:00 AM - 8:00 PM',
                'amenities' => 'Reformer classes, Private sessions, First class free',
                'image' => 'business-fitness',
                'owner' => 'lisa@havena.app',
                'deal' => [
                    'title' => 'Free First Pilates Class',
                    'description' => 'New to the studio? Your first reformer class is on us. Book online or drop by.',
                    'type' => 'offer',
                    'label' => 'FREE TRIAL',
                    'image' => 'business-fitness',
                    'featured' => true,
                    'endDays' => 45,
                ],
            ],
            [
                'name' => 'Luxe Hair & Spa',
                'category' => 'Beauty & Spa',
                'description' => 'Full-service salon and spa offering cuts, color, facials, and massage. Relax and refresh close to home.',
                'address' => '50 Liberty Drive, Suite 12, Boston, MA 02210',
                'phone' => '(617) 555-0164',
                'hours' => 'Tue-Sun 9:00 AM - 6:00 PM',
                'amenities' => 'Hair, Color, Facials, Massage',
                'image' => 'business-salon',
                'owner' => 'nina@havena.app',
                'deal' => [
                    'title' => '$15 Off Any Spa Service',
                    'description' => 'Take $15 off any spa service over $60. Neighbors only.',
                    'type' => 'deal',
                    'label' => '$15 OFF',
                    'original' => 80.00,
                    'discounted' => 65.00,
                    'promo' => 'RELAX15',
                    'image' => 'deal-spa',
                    'endDays' => 20,
                ],
            ],
            [
                'name' => 'Fort Point Trattoria',
                'category' => 'Restaurant',
                'description' => 'Family-owned Italian trattoria with wood-fired pizza, handmade pasta, and a warm atmosphere. Dine in or takeout.',
                'address' => '50 Liberty Drive, Suite 1, Boston, MA 02210',
                'phone' => '(617) 555-0119',
                'hours' => 'Mon-Sun 11:00 AM - 10:00 PM',
                'amenities' => 'Wood-fired pizza, Handmade pasta, Takeout, Delivery',
                'image' => 'business-restaurant',
                'owner' => 'diego@havena.app',
                'deal' => [
                    'title' => 'Family Pizza Night 2-for-1',
                    'description' => 'Buy any large wood-fired pizza and get a second of equal or lesser value free, every Tuesday night.',
                    'type' => 'deal',
                    'label' => '2 FOR 1',
                    'original' => 24.00,
                    'discounted' => 12.00,
                    'promo' => 'PIZZATUES',
                    'image' => 'deal-pizza',
                    'featured' => true,
                    'endDays' => 14,
                ],
            ],
            [
                'name' => 'Liberty Lane Bakery',
                'category' => 'Bakery',
                'description' => 'Neighborhood bakery with sourdough, morning buns, and seasonal tarts. Fresh from 7 AM — grab a loaf on the way to the T.',
                'address' => '50 Liberty Drive, Suite 2, Boston, MA 02210',
                'phone' => '(617) 555-0133',
                'hours' => 'Tue-Sun 7:00 AM - 4:00 PM',
                'amenities' => 'Sourdough, Pastries, Pre-order',
                'image' => 'business-bakery',
                'owner' => 'aisha@havena.app',
                'deal' => [
                    'title' => 'Free Morning Bun with Coffee',
                    'description' => 'Any espresso drink includes a house morning bun before 10 AM.',
                    'type' => 'offer',
                    'label' => 'FREE BUN',
                    'image' => 'business-bakery',
                    'endDays' => 28,
                ],
            ],
            [
                'name' => 'Seaport Market Pantry',
                'category' => 'Grocery',
                'description' => 'Compact grocer with local produce, house-made soups, and everyday staples. Perfect when you need milk without leaving the block.',
                'address' => '50 Liberty Drive, Suite 6, Boston, MA 02210',
                'phone' => '(617) 555-0155',
                'hours' => 'Mon-Sun 8:00 AM - 9:00 PM',
                'amenities' => 'Produce, Prepared foods, Delivery',
                'image' => 'business-grocery',
                'owner' => 'sarah@havena.app',
                'deal' => [
                    'title' => '$10 Off $50 Shop',
                    'description' => 'Save $10 when you spend $50 in a single visit this month.',
                    'type' => 'coupon',
                    'label' => '$10 OFF',
                    'promo' => 'PANTRY10',
                    'image' => 'business-grocery',
                    'endDays' => 25,
                ],
            ],
            [
                'name' => 'Harbor Point Pharmacy',
                'category' => 'Pharmacy',
                'description' => 'Full-service pharmacy with vaccinations, compounding, and a small wellness shop. Same-day pickup for residents.',
                'address' => '50 Liberty Drive, Suite 3, Boston, MA 02210',
                'phone' => '(617) 555-0170',
                'hours' => 'Mon-Fri 8:00 AM - 7:00 PM, Sat 9:00 AM - 3:00 PM',
                'amenities' => 'Prescriptions, Vaccines, Delivery',
                'image' => 'business-pharmacy',
                'owner' => 'priya@havena.app',
                'deal' => [
                    'title' => 'Flu Shot + Wellness Kit',
                    'description' => 'Seasonal flu shot includes a complimentary travel wellness kit.',
                    'type' => 'offer',
                    'label' => 'FREE KIT',
                    'image' => 'business-pharmacy',
                    'endDays' => 60,
                ],
            ],
            [
                'name' => 'Paws on Liberty',
                'category' => 'Pet Care',
                'description' => 'Grooming, daycare, and a boutique for dogs and cats. Lobby drop-off for Harbor Point residents.',
                'address' => '50 Liberty Drive, Suite 9, Boston, MA 02210',
                'phone' => '(617) 555-0181',
                'hours' => 'Mon-Sat 8:00 AM - 6:00 PM',
                'amenities' => 'Grooming, Daycare, Retail',
                'image' => 'business-pets',
                'owner' => 'carlos@havena.app',
                'deal' => [
                    'title' => 'First Groom 20% Off',
                    'description' => 'New clients save 20% on a full groom. Mention you live in the building.',
                    'type' => 'coupon',
                    'label' => '20% OFF',
                    'promo' => 'PAWS20',
                    'image' => 'business-pets',
                    'endDays' => 35,
                ],
            ],
            [
                'name' => 'Tidewater Wine Bar',
                'category' => 'Bar',
                'description' => 'Quiet wine bar with a Seaport-focused list, small plates, and a late-week happy hour for neighbors.',
                'address' => '50 Liberty Drive, Suite 11, Boston, MA 02210',
                'phone' => '(617) 555-0194',
                'hours' => 'Tue-Sun 4:00 PM - 11:00 PM',
                'amenities' => 'Wine, Small plates, Happy hour',
                'image' => 'business-bar',
                'owner' => 'nina@havena.app',
                'deal' => [
                    'title' => 'Neighbor Happy Hour',
                    'description' => 'Half-price glasses of house wine, 4–6 PM Tuesday through Thursday.',
                    'type' => 'deal',
                    'label' => '1/2 OFF',
                    'image' => 'business-wine',
                    'endDays' => 40,
                ],
            ],
            [
                'name' => 'Skyline Yoga',
                'category' => 'Fitness',
                'description' => 'Heated vinyasa and restorative classes with harbor light. Mats provided. First-timers welcome.',
                'address' => '50 Liberty Drive, Suite 14, Boston, MA 02210',
                'phone' => '(617) 555-0128',
                'hours' => 'Mon-Sun 6:00 AM - 8:00 PM',
                'amenities' => 'Heated studio, Mats, Intro week',
                'image' => 'business-yoga',
                'owner' => 'lisa@havena.app',
                'deal' => [
                    'title' => 'Intro Week Unlimited',
                    'description' => 'Unlimited classes for seven days at $29 for new students.',
                    'type' => 'offer',
                    'label' => '$29 WEEK',
                    'image' => 'business-yoga',
                    'endDays' => 50,
                ],
            ],
            [
                'name' => 'Fan Pier Flowers',
                'category' => 'Florist',
                'description' => 'Seasonal bouquets, weekly subscriptions, and same-day delivery in the Seaport.',
                'address' => '50 Liberty Drive, Suite 5, Boston, MA 02210',
                'phone' => '(617) 555-0166',
                'hours' => 'Mon-Sat 9:00 AM - 6:00 PM',
                'amenities' => 'Bouquets, Subscriptions, Delivery',
                'image' => 'business-florist',
                'owner' => 'grace@havena.app',
                'deal' => [
                    'title' => 'Lobby Bouquet $12',
                    'description' => 'Wrapped mixed bouquet ready at the lobby desk every Friday.',
                    'type' => 'deal',
                    'label' => '$12',
                    'original' => 18.00,
                    'discounted' => 12.00,
                    'image' => 'business-florist',
                    'endDays' => 21,
                ],
            ],
            [
                'name' => 'Scoop & Sail',
                'category' => 'Ice Cream',
                'description' => 'Small-batch ice cream with rotating Seaport flavors. Outdoor window on warm evenings.',
                'address' => '50 Liberty Drive, Suite 7, Boston, MA 02210',
                'phone' => '(617) 555-0139',
                'hours' => 'Sun-Thu 12:00 PM - 9:00 PM, Fri-Sat 12:00 PM - 10:00 PM',
                'amenities' => 'Walk-up window, Dairy-free options',
                'image' => 'business-icecream',
                'owner' => 'emily@havena.app',
                'deal' => [
                    'title' => 'Double Scoop Tuesday',
                    'description' => 'Second scoop free every Tuesday after 6 PM.',
                    'type' => 'deal',
                    'label' => '2ND FREE',
                    'image' => 'business-icecream',
                    'endDays' => 30,
                ],
            ],
            [
                'name' => 'Channel Dry & Fold',
                'category' => 'Dry Cleaning',
                'description' => 'Same-day dry cleaning and wash-and-fold with lobby pickup for Harbor Point.',
                'address' => '50 Liberty Drive, Suite 10, Boston, MA 02210',
                'phone' => '(617) 555-0177',
                'hours' => 'Mon-Fri 7:00 AM - 7:00 PM, Sat 9:00 AM - 2:00 PM',
                'amenities' => 'Same-day, Lobby pickup, Eco solvents',
                'image' => 'business-laundry',
                'owner' => 'tom@havena.app',
                'deal' => [
                    'title' => 'First Bag Free Fold',
                    'description' => 'Complimentary wash-and-fold on your first 10 lb bag.',
                    'type' => 'offer',
                    'label' => 'FREE BAG',
                    'image' => 'business-laundry',
                    'endDays' => 45,
                ],
            ],
            [
                'name' => 'Waterfront Sushi',
                'category' => 'Restaurant',
                'description' => 'Omakase counter and takeout rolls a few steps from the Harborwalk. Fresh fish daily.',
                'address' => '50 Liberty Drive, Suite 15, Boston, MA 02210',
                'phone' => '(617) 555-0188',
                'hours' => 'Tue-Sun 12:00 PM - 10:00 PM',
                'amenities' => 'Omakase, Takeout, Sake list',
                'image' => 'business-sushi',
                'owner' => 'diego@havena.app',
                'deal' => [
                    'title' => 'Neighbor Roll Combo',
                    'description' => 'Any two specialty rolls and miso for $24 after 8 PM.',
                    'type' => 'deal',
                    'label' => '$24 COMBO',
                    'original' => 32.00,
                    'discounted' => 24.00,
                    'image' => 'business-sushi',
                    'endDays' => 18,
                ],
            ],
        ];

        foreach ($shops as $shop) {
            $this->upsertDemoShop($cid, $adminId, $owner, $shop, $this->copyName);
        }
    }

    /**
     * Nearby Boston communities + shops so the home location picker
     * (2 / 3 / 5 / 10 miles) has a full marketplace outside Harbor Point.
     */
    private function seedNearbyDiscovery(int $homeCid, ?int $regionId, array $residents, int $adminId): void
    {
        $owner = fn (string $email) => $this->residentId($residents, $email) ?? $adminId;
        $boston = $regionId
            ? DB::table('regions')->where('id', $regionId)->first()
            : DB::table('regions')->where('title', 'Massachusetts - Boston')->first();

        $places = [
            [
                'community' => 'Fan Pier Residences',
                'address' => '1 Marina Park Drive, Boston, MA 02210',
                'lat' => 42.35340,
                'lng' => -71.04490,
                'description' => 'Waterfront residences on Fan Pier, a short Harborwalk stroll from Harbor Point.',
                'shops' => [
                    [
                        'name' => 'Seaport Provisions',
                        'category' => 'Cafe',
                        'description' => 'All-day cafe and market facing the harbor. Espresso, sandwiches, and picnic supplies for the Harborwalk.',
                        'address' => '1 Marina Park Drive, Boston, MA 02210',
                        'phone' => '(617) 555-0201',
                        'hours' => 'Mon-Sun 7:00 AM - 8:00 PM',
                        'amenities' => 'Patio, Takeout, Harbor views',
                        'image' => 'business-cafe',
                        'owner' => 'emily@havena.app',
                        'deal' => [
                            'title' => 'Harbor Latte $1 Off',
                            'description' => 'Show this coupon for $1 off any specialty latte. Walkable from Harbor Point.',
                            'type' => 'coupon',
                            'label' => '$1 OFF',
                            'image' => 'deal-coffee',
                        ],
                    ],
                    [
                        'name' => 'Marina Park Bikes',
                        'category' => 'Bike Shop',
                        'description' => 'Tune-ups, rentals, and a small fleet of commuter bikes for Seaport residents.',
                        'address' => '1 Marina Park Drive, Suite B, Boston, MA 02210',
                        'phone' => '(617) 555-0208',
                        'hours' => 'Tue-Sun 10:00 AM - 6:00 PM',
                        'amenities' => 'Rentals, Tune-ups, Locks',
                        'image' => 'business-bike',
                        'owner' => 'david@havena.app',
                        'deal' => [
                            'title' => 'Harbor Point Tune-Up $29',
                            'description' => 'Basic tune-up for $29 when you mention Harbor Point.',
                            'type' => 'deal',
                            'label' => '$29',
                            'image' => 'business-bike',
                        ],
                    ],
                    [
                        'name' => 'Fan Pier Brunch House',
                        'category' => 'Restaurant',
                        'description' => 'Weekend brunch with harbor light, citrus ricotta pancakes, and a short wait if you book.',
                        'address' => '1 Marina Park Drive, Boston, MA 02210',
                        'phone' => '(617) 555-0209',
                        'hours' => 'Thu-Sun 8:00 AM - 3:00 PM',
                        'amenities' => 'Brunch, Patio, Reservations',
                        'image' => 'business-brunch',
                        'owner' => 'diego@havena.app',
                        'deal' => [
                            'title' => 'Bottomless Coffee Brunch',
                            'description' => 'Any brunch plate includes bottomless drip coffee.',
                            'type' => 'offer',
                            'label' => 'FREE COFFEE',
                            'image' => 'business-brunch',
                        ],
                    ],
                ],
            ],
            [
                'community' => 'Channel Center Residences',
                'address' => '25 Thomson Place, Boston, MA 02210',
                'lat' => 42.35180,
                'lng' => -71.04720,
                'description' => 'Fort Point lofts beside the ICA and the Harborwalk, under a mile from Harbor Point.',
                'shops' => [
                    [
                        'name' => 'District Wine Cellar',
                        'category' => 'Wine Shop',
                        'description' => 'Curated New England and European bottles, with Friday tastings for Seaport neighbors.',
                        'address' => '25 Thomson Place, Boston, MA 02210',
                        'phone' => '(617) 555-0210',
                        'hours' => 'Mon-Sat 11:00 AM - 8:00 PM',
                        'amenities' => 'Tastings, Local producers, Delivery',
                        'image' => 'business-wine',
                        'owner' => 'sarah@havena.app',
                        'deal' => [
                            'title' => 'Friday Tasting Complimentary',
                            'description' => 'Harbor Point residents join Friday 5 PM tasting at no charge.',
                            'type' => 'offer',
                            'label' => 'FREE TASTING',
                            'image' => 'business-wine',
                        ],
                    ],
                    [
                        'name' => 'Thomson Street Books',
                        'category' => 'Bookstore',
                        'description' => 'Independent bookshop with a well-loved fiction table and a quiet reading nook.',
                        'address' => '25 Thomson Place, Boston, MA 02210',
                        'phone' => '(617) 555-0211',
                        'hours' => 'Mon-Sun 10:00 AM - 7:00 PM',
                        'amenities' => 'New releases, Used finds, Events',
                        'image' => 'business-bookstore',
                        'owner' => 'nina@havena.app',
                        'deal' => [
                            'title' => 'Hardcover 15% Off',
                            'description' => '15% off new hardcovers this month for Seaport neighbors.',
                            'type' => 'coupon',
                            'label' => '15% OFF',
                            'promo' => 'READ15',
                            'image' => 'business-bookstore',
                        ],
                    ],
                ],
            ],
            [
                'community' => 'Ink Block Residences',
                'address' => '300 Harrison Avenue, Boston, MA 02118',
                'lat' => 42.33890,
                'lng' => -71.07030,
                'description' => 'South End apartments beside SoWa, about two miles from the Seaport.',
                'shops' => [
                    [
                        'name' => 'Harrison Kitchen',
                        'category' => 'Restaurant',
                        'description' => 'Seasonal American plates and a lively bar. Easy rideshare from Harbor Point.',
                        'address' => '300 Harrison Avenue, Boston, MA 02118',
                        'phone' => '(617) 555-0212',
                        'hours' => 'Tue-Sun 5:00 PM - 10:00 PM',
                        'amenities' => 'Dinner, Bar, Patio',
                        'image' => 'business-restaurant',
                        'owner' => 'diego@havena.app',
                        'deal' => [
                            'title' => 'Neighbor Prix Fixe $39',
                            'description' => 'Three-course neighbor menu Sunday through Thursday.',
                            'type' => 'deal',
                            'label' => '$39',
                            'image' => 'business-restaurant',
                        ],
                    ],
                    [
                        'name' => 'SoWa Pet Studio',
                        'category' => 'Pet Care',
                        'description' => 'Cage-free daycare and spa baths. Day passes for Seaport dogs.',
                        'address' => '300 Harrison Avenue, Boston, MA 02118',
                        'phone' => '(617) 555-0213',
                        'hours' => 'Mon-Fri 7:00 AM - 7:00 PM',
                        'amenities' => 'Daycare, Baths, Day pass',
                        'image' => 'business-pets',
                        'owner' => 'carlos@havena.app',
                        'deal' => [
                            'title' => 'Seaport Day Pass',
                            'description' => 'First daycare day complimentary for Harbor Point pups.',
                            'type' => 'offer',
                            'label' => 'FREE DAY',
                            'image' => 'business-pets',
                        ],
                    ],
                ],
            ],
            [
                'community' => 'Back Bay Commons',
                'address' => '200 Clarendon Street, Boston, MA 02116',
                'lat' => 42.34920,
                'lng' => -71.07580,
                'description' => 'Back Bay residences near Copley Square, shops, and the Green Line.',
                'shops' => [
                    [
                        'name' => 'Clarendon Books & Coffee',
                        'category' => 'Cafe',
                        'description' => 'Independent bookstore cafe with a quiet loft and weekend author talks.',
                        'address' => '200 Clarendon Street, Boston, MA 02116',
                        'phone' => '(617) 555-0203',
                        'hours' => 'Mon-Sat 8:00 AM - 7:00 PM',
                        'amenities' => 'Wifi, Reading loft, Pastries',
                        'image' => 'business-bookstore',
                        'owner' => 'sarah@havena.app',
                        'deal' => [
                            'title' => 'Free Pastry with Coffee',
                            'description' => 'Any drip or espresso drink includes a house pastry.',
                            'type' => 'offer',
                            'label' => 'FREE PASTRY',
                            'image' => 'deal-coffee',
                        ],
                    ],
                    [
                        'name' => 'Newbury Street Salon',
                        'category' => 'Beauty & Spa',
                        'description' => 'Color specialists and blowouts a short ride from the Seaport.',
                        'address' => '200 Clarendon Street, Boston, MA 02116',
                        'phone' => '(617) 555-0214',
                        'hours' => 'Tue-Sat 9:00 AM - 7:00 PM',
                        'amenities' => 'Color, Blowouts, Bridal',
                        'image' => 'business-salon',
                        'owner' => 'nina@havena.app',
                        'deal' => [
                            'title' => 'Blowout $35 Tuesday',
                            'description' => 'Express blowout for $35 every Tuesday.',
                            'type' => 'deal',
                            'label' => '$35',
                            'image' => 'business-salon',
                        ],
                    ],
                    [
                        'name' => 'Copley Yoga Loft',
                        'category' => 'Fitness',
                        'description' => 'Candlelit evening flow above Clarendon. Drop-ins welcome.',
                        'address' => '200 Clarendon Street, Boston, MA 02116',
                        'phone' => '(617) 555-0215',
                        'hours' => 'Mon-Sun 6:30 AM - 8:30 PM',
                        'amenities' => 'Drop-in, Mats, Evening flow',
                        'image' => 'business-yoga',
                        'owner' => 'lisa@havena.app',
                        'deal' => [
                            'title' => 'First Class $10',
                            'description' => 'Intro drop-in is $10 for Harbor Point residents.',
                            'type' => 'offer',
                            'label' => '$10 INTRO',
                            'image' => 'business-yoga',
                        ],
                    ],
                ],
            ],
            [
                'community' => 'Fenway Court',
                'address' => '1330 Boylston Street, Boston, MA 02215',
                'lat' => 42.34480,
                'lng' => -71.09950,
                'description' => 'Fenway apartments beside the ballpark, museums, and the Emerald Necklace.',
                'shops' => [
                    [
                        'name' => 'Lansdowne Fitness',
                        'category' => 'Fitness',
                        'description' => 'Open-floor gym with classes facing Lansdowne Street. Day passes for Seaport neighbors.',
                        'address' => '1330 Boylston Street, Boston, MA 02215',
                        'phone' => '(617) 555-0204',
                        'hours' => 'Mon-Sun 5:30 AM - 10:00 PM',
                        'amenities' => 'Day pass, Classes, Lockers',
                        'image' => 'business-fitness',
                        'owner' => 'priya@havena.app',
                        'deal' => [
                            'title' => 'Neighbor Day Pass',
                            'description' => 'Harbor Point residents get a complimentary day pass this month.',
                            'type' => 'offer',
                            'label' => 'FREE DAY',
                            'image' => 'amenity-gym',
                        ],
                    ],
                    [
                        'name' => 'Fenway Scoop',
                        'category' => 'Ice Cream',
                        'description' => 'Game-day cones and late scoops near Landsdowne. Dairy-free pints to go.',
                        'address' => '1330 Boylston Street, Boston, MA 02215',
                        'phone' => '(617) 555-0216',
                        'hours' => 'Mon-Sun 12:00 PM - 11:00 PM',
                        'amenities' => 'Walk-up, Pints, Dairy-free',
                        'image' => 'business-icecream',
                        'owner' => 'emily@havena.app',
                        'deal' => [
                            'title' => 'Pint Night $6',
                            'description' => 'Any pint $6 after the 7th inning equivalent — 9 PM nightly.',
                            'type' => 'deal',
                            'label' => '$6 PINT',
                            'image' => 'business-icecream',
                        ],
                    ],
                ],
            ],
            [
                'community' => 'Navy Yard Residences',
                'address' => '197 8th Street, Charlestown, MA 02129',
                'lat' => 42.37300,
                'lng' => -71.05350,
                'description' => 'Charlestown Navy Yard living with harbor paths, about three miles from Harbor Point.',
                'shops' => [
                    [
                        'name' => 'Yard Bird Cafe',
                        'category' => 'Cafe',
                        'description' => 'Coffee and breakfast sandwiches beside the dry dock. Outdoor tables when the wind is kind.',
                        'address' => '197 8th Street, Charlestown, MA 02129',
                        'phone' => '(617) 555-0217',
                        'hours' => 'Mon-Sun 6:30 AM - 3:00 PM',
                        'amenities' => 'Breakfast, Patio, Wifi',
                        'image' => 'business-brunch',
                        'owner' => 'emily@havena.app',
                        'deal' => [
                            'title' => 'Sandwich + Coffee $9',
                            'description' => 'Any breakfast sandwich and drip coffee for $9 before 10 AM.',
                            'type' => 'deal',
                            'label' => '$9',
                            'image' => 'business-brunch',
                        ],
                    ],
                    [
                        'name' => 'Constitution Wine & Cheese',
                        'category' => 'Wine Shop',
                        'description' => 'Small shop of New England cheeses and coastal wines. Picnic packs for the Navy Yard lawn.',
                        'address' => '197 8th Street, Charlestown, MA 02129',
                        'phone' => '(617) 555-0218',
                        'hours' => 'Tue-Sat 11:00 AM - 7:00 PM',
                        'amenities' => 'Cheese, Wine, Picnic packs',
                        'image' => 'business-wine',
                        'owner' => 'sarah@havena.app',
                        'deal' => [
                            'title' => 'Picnic Pack $18',
                            'description' => 'Cheese, crackers, and a mini bottle for $18 on weekends.',
                            'type' => 'deal',
                            'label' => '$18 PACK',
                            'image' => 'business-wine',
                        ],
                    ],
                ],
            ],
            [
                'community' => 'Kendall Square Lofts',
                'address' => '350 Third Street, Cambridge, MA 02142',
                'lat' => 42.36260,
                'lng' => -71.08430,
                'description' => 'Cambridge lofts beside Kendall Square labs, about four miles from the Seaport.',
                'shops' => [
                    [
                        'name' => 'Third Street Sushi',
                        'category' => 'Restaurant',
                        'description' => 'Fast omakase lunch and evening rolls for Kendall workers and Seaport visitors.',
                        'address' => '350 Third Street, Cambridge, MA 02142',
                        'phone' => '(617) 555-0219',
                        'hours' => 'Mon-Sat 11:30 AM - 9:30 PM',
                        'amenities' => 'Lunch omakase, Takeout',
                        'image' => 'business-sushi',
                        'owner' => 'diego@havena.app',
                        'deal' => [
                            'title' => 'Lunch Bento $16',
                            'description' => 'Chef bento and miso for $16, weekdays before 2 PM.',
                            'type' => 'deal',
                            'label' => '$16 BENTO',
                            'image' => 'business-sushi',
                        ],
                    ],
                    [
                        'name' => 'Kendall Bike Lab',
                        'category' => 'Bike Shop',
                        'description' => 'E-bike service and commuter sales on the Charles River path.',
                        'address' => '350 Third Street, Cambridge, MA 02142',
                        'phone' => '(617) 555-0220',
                        'hours' => 'Tue-Sat 10:00 AM - 6:00 PM',
                        'amenities' => 'E-bikes, Service, Rentals',
                        'image' => 'business-bike',
                        'owner' => 'david@havena.app',
                        'deal' => [
                            'title' => 'Weekend Rental $25',
                            'description' => 'Half-day commuter rental for $25 with a Harbor Point ID.',
                            'type' => 'deal',
                            'label' => '$25',
                            'image' => 'business-bike',
                        ],
                    ],
                ],
            ],
            [
                'community' => 'Brookline Village Residences',
                'address' => '1 Harvard Street, Brookline, MA 02445',
                'lat' => 42.33260,
                'lng' => -71.12100,
                'description' => 'Village living on the C Line with cafes, a library, and Coolidge Corner nearby.',
                'shops' => [
                    [
                        'name' => 'Coolidge Corner Spa',
                        'category' => 'Beauty & Spa',
                        'description' => 'Calm spa for facials and massage. Easy Green Line trip from the Seaport.',
                        'address' => '1 Harvard Street, Brookline, MA 02445',
                        'phone' => '(617) 555-0205',
                        'hours' => 'Tue-Sun 10:00 AM - 7:00 PM',
                        'amenities' => 'Facials, Massage, Neighbors welcome',
                        'image' => 'deal-spa',
                        'owner' => 'nina@havena.app',
                        'deal' => [
                            'title' => 'Seaport Neighbor Facial',
                            'description' => '$20 off any 60-minute facial for Harbor Point residents.',
                            'type' => 'deal',
                            'label' => '$20 OFF',
                            'image' => 'deal-spa',
                        ],
                    ],
                    [
                        'name' => 'Village Oven Bakery',
                        'category' => 'Bakery',
                        'description' => 'Old-school Brookline bakery with rye, rugelach, and Saturday challah.',
                        'address' => '1 Harvard Street, Brookline, MA 02445',
                        'phone' => '(617) 555-0221',
                        'hours' => 'Tue-Sun 7:00 AM - 5:00 PM',
                        'amenities' => 'Challah, Coffee, Pre-order',
                        'image' => 'business-bakery',
                        'owner' => 'aisha@havena.app',
                        'deal' => [
                            'title' => 'Saturday Challah $5',
                            'description' => 'Plain challah $5 before noon on Saturdays.',
                            'type' => 'deal',
                            'label' => '$5',
                            'image' => 'business-bakery',
                        ],
                    ],
                ],
            ],
            [
                'community' => 'Centre Street Residences',
                'address' => '701 Centre Street, Jamaica Plain, MA 02130',
                'lat' => 42.30970,
                'lng' => -71.11510,
                'description' => 'Jamaica Plain apartments on Centre Street, about six miles from the Seaport.',
                'shops' => [
                    [
                        'name' => 'JP Market',
                        'category' => 'Grocery',
                        'description' => 'Independent grocer with local produce, bulk spices, and a hot-bar lunch.',
                        'address' => '701 Centre Street, Jamaica Plain, MA 02130',
                        'phone' => '(617) 555-0222',
                        'hours' => 'Mon-Sun 8:00 AM - 8:00 PM',
                        'amenities' => 'Produce, Hot bar, Bulk',
                        'image' => 'business-grocery',
                        'owner' => 'sarah@havena.app',
                        'deal' => [
                            'title' => 'Hot Bar $2 Off',
                            'description' => '$2 off any hot-bar container over $10.',
                            'type' => 'coupon',
                            'label' => '$2 OFF',
                            'image' => 'business-grocery',
                        ],
                    ],
                    [
                        'name' => 'Centre Street Flowers',
                        'category' => 'Florist',
                        'description' => 'Garden-style arrangements and a Sunday bucket bar.',
                        'address' => '701 Centre Street, Jamaica Plain, MA 02130',
                        'phone' => '(617) 555-0223',
                        'hours' => 'Wed-Sun 10:00 AM - 6:00 PM',
                        'amenities' => 'Arrangements, Bucket bar',
                        'image' => 'business-florist',
                        'owner' => 'grace@havena.app',
                        'deal' => [
                            'title' => 'Sunday Bucket $15',
                            'description' => 'Build-your-own bouquet bucket for $15 on Sundays.',
                            'type' => 'deal',
                            'label' => '$15',
                            'image' => 'business-florist',
                        ],
                    ],
                ],
            ],
            [
                'community' => 'Davis Square Lofts',
                'address' => '90 College Avenue, Somerville, MA 02144',
                'lat' => 42.39650,
                'lng' => -71.12220,
                'description' => 'Somerville lofts beside Davis Square restaurants, the Red Line, and weekend markets.',
                'shops' => [
                    [
                        'name' => 'Davis Square Pizzeria',
                        'category' => 'Restaurant',
                        'description' => 'Coal-fired pies and a patio on College Avenue. Worth the ride from the Seaport.',
                        'address' => '90 College Avenue, Somerville, MA 02144',
                        'phone' => '(617) 555-0206',
                        'hours' => 'Mon-Sun 11:30 AM - 10:00 PM',
                        'amenities' => 'Patio, Takeout, Late kitchen',
                        'image' => 'business-restaurant',
                        'owner' => 'diego@havena.app',
                        'deal' => [
                            'title' => 'Two-Top Tuesday',
                            'description' => 'Any large pizza and a second of equal or lesser value half off on Tuesdays.',
                            'type' => 'deal',
                            'label' => '1/2 OFF',
                            'image' => 'deal-pizza',
                        ],
                    ],
                    [
                        'name' => 'Davis Wash & Fold',
                        'category' => 'Dry Cleaning',
                        'description' => 'Student-friendly wash-and-fold with same-week dry cleaning.',
                        'address' => '90 College Avenue, Somerville, MA 02144',
                        'phone' => '(617) 555-0224',
                        'hours' => 'Mon-Sat 8:00 AM - 8:00 PM',
                        'amenities' => 'Wash-and-fold, Dry cleaning',
                        'image' => 'business-laundry',
                        'owner' => 'tom@havena.app',
                        'deal' => [
                            'title' => '10 lb Bag $12',
                            'description' => 'Wash-and-fold 10 lb bag for $12 on weekdays.',
                            'type' => 'deal',
                            'label' => '$12',
                            'image' => 'business-laundry',
                        ],
                    ],
                ],
            ],
            [
                'community' => 'Newton Highlands Court',
                'address' => '18 Lincoln Street, Newton, MA 02461',
                'lat' => 42.32150,
                'lng' => -71.20550,
                'description' => 'Quiet Newton village on the D Line, about a 10-mile trip from the Seaport.',
                'shops' => [
                    [
                        'name' => 'Highlands Market',
                        'category' => 'Grocery',
                        'description' => 'Neighborhood market with local produce, flowers, and a weekday lunch counter.',
                        'address' => '18 Lincoln Street, Newton, MA 02461',
                        'phone' => '(617) 555-0207',
                        'hours' => 'Mon-Sat 8:00 AM - 7:00 PM',
                        'amenities' => 'Produce, Flowers, Lunch counter',
                        'image' => 'feed-market',
                        'owner' => 'aisha@havena.app',
                        'deal' => [
                            'title' => 'Bouquet with $25 Shop',
                            'description' => 'Complimentary seasonal bouquet with a $25 market purchase this week.',
                            'type' => 'offer',
                            'label' => 'FREE BOUQUET',
                            'image' => 'listing-plants',
                        ],
                    ],
                    [
                        'name' => 'Highlands Pharmacy',
                        'category' => 'Pharmacy',
                        'description' => 'Independent pharmacy with immunizations and a compounding bench.',
                        'address' => '18 Lincoln Street, Newton, MA 02461',
                        'phone' => '(617) 555-0225',
                        'hours' => 'Mon-Fri 9:00 AM - 6:00 PM, Sat 9:00 AM - 1:00 PM',
                        'amenities' => 'Prescriptions, Vaccines, Compounding',
                        'image' => 'business-pharmacy',
                        'owner' => 'priya@havena.app',
                        'deal' => [
                            'title' => 'Transfer $20 Gift Card',
                            'description' => '$20 store card when you transfer a prescription this month.',
                            'type' => 'offer',
                            'label' => '$20 CARD',
                            'image' => 'business-pharmacy',
                        ],
                    ],
                ],
            ],
        ];

        foreach ($places as $place) {
            $payload = [
                'region' => $boston->title ?? 'Massachusetts - Boston',
                'region_id' => $boston->id ?? $regionId,
                'address' => $place['address'],
                'description' => $place['description'],
                'timezone' => 'America/New_York',
                'status' => 'active',
                'review_status' => 'approved',
                'latitude' => $place['lat'],
                'longitude' => $place['lng'],
                'updated_at' => now(),
            ];
            $existing = DB::table('communities')->where('name', $place['community'])->value('id');
            if ($existing) {
                DB::table('communities')->where('id', $existing)->update($payload);
                $nearbyId = (int) $existing;
            } else {
                $payload['name'] = $place['community'];
                $payload['created_at'] = now()->subMonths(4);
                $nearbyId = (int) DB::table('communities')->insertGetId($payload);
            }

            if ($nearbyId === $homeCid) {
                continue;
            }

            foreach ($place['shops'] as $shop) {
                $this->upsertDemoShop($nearbyId, $adminId, $owner, $shop, $place['community']);
            }
        }
    }

    private function upsertDemoShop(int $communityId, int $adminId, callable $owner, array $shop, string $locationName): int
    {
        $ownerId = $owner($shop['owner']);

        DB::table('businesses')->updateOrInsert(
            ['community_id' => $communityId, 'name' => $shop['name']],
            [
                'owner_id' => $ownerId,
                'category' => $shop['category'],
                'description' => $shop['description'],
                'address' => $shop['address'],
                'phone' => $shop['phone'],
                'hours' => $shop['hours'],
                'amenities' => $shop['amenities'],
                'image_url' => "{$this->img}/{$shop['image']}.jpg",
                'status' => 'approved',
                'approved_at' => now()->subDays(20),
                'approved_by' => $adminId,
                'updated_at' => now()->subDays(20),
                'created_at' => now()->subDays(40),
            ]
        );

        $businessId = (int) DB::table('businesses')
            ->where('community_id', $communityId)
            ->where('name', $shop['name'])
            ->value('id');

        if (! empty($shop['deal']) && $businessId) {
            $deal = $shop['deal'];
            DB::table('deals')->updateOrInsert(
                ['community_id' => $communityId, 'title' => $deal['title']],
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
                    'location' => $locationName,
                    'image_url' => "{$this->img}/".($deal['image'] ?? $shop['image']).'.jpg',
                    'is_featured' => (bool) ($deal['featured'] ?? false),
                    'status' => 'active',
                    'starts_at' => now()->subDays(8),
                    'ends_at' => now()->addDays((int) ($deal['endDays'] ?? 40)),
                    'updated_at' => now()->subDays(8),
                    'created_at' => now()->subDays(8),
                ]
            );
        }

        return $businessId;
    }

    private function seedWellnessImages(): void
    {
        $map = [
            'weight' => 'wellness-weight',
            'exercise' => 'wellness-exercise',
            'stress' => 'wellness-stress',
            'learning' => 'wellness-learning',
            'social' => 'wellness-social',
        ];

        foreach ($map as $key => $image) {
            $categoryId = DB::table('wellness_categories')->where('key', $key)->value('id');
            if (! $categoryId) {
                continue;
            }
            $path = "{$this->img}/{$image}.jpg";
            if (Schema::hasColumn('wellness_categories', 'image_url')) {
                DB::table('wellness_categories')
                    ->where('id', $categoryId)
                    ->whereNull('image_url')
                    ->update(['image_url' => $path, 'updated_at' => now()]);
            }
            DB::table('wellness_courses')
                ->where('category_id', $categoryId)
                ->whereNull('image_url')
                ->update(['image_url' => $path, 'updated_at' => now()]);
        }
    }

    /* ─────────────────────────── Rules & Documents ─────────────────────────── */

    private function seedRules(int $cid, int $adminId, array $residents): void
    {
        $rows = [
            ['Quiet Hours', 'Noise', "Quiet hours are from 10:00 PM to 7:00 AM daily. Please keep noise to a minimum during these times, including music, gatherings, and appliance use, out of respect for your neighbors.", 'important', true],
            ['Pool Rules', 'Amenities', "Pool hours are 6:00 AM to 10:00 PM. No glass containers on the deck. Children under 12 must be supervised by an adult. Please shower before entering and no diving in the shallow end.", 'standard', true],
            ['Pet Policy', 'Pets', "Pets must be leashed in all common areas and owners are responsible for cleaning up after them. A maximum of two pets per unit. Please register your pet with the management office.", 'standard', false],
            ['Parking Guidelines', 'Parking', "Each unit is assigned one covered space. Guest parking is available in the marked visitor areas for up to 24 hours. Vehicles parked in fire lanes will be towed at the owner expense.", 'standard', false],
            ['Trash & Recycling', 'Sanitation', "Trash and recycling rooms are located on each floor. Please break down boxes and use the labeled recycling bins. Bulk items must be scheduled for pickup through the management office.", 'info', false],
            ['Guest & Visitor Policy', 'Security', "All guests must be registered at the front gate. Overnight guests staying more than seven days should be reported to management. Residents are responsible for their guests conduct.", 'important', true],
        ];

        foreach ($rows as [$title, $category, $desc, $severity, $ack]) {
            DB::table('community_rules')->updateOrInsert(
                ['community_id' => $cid, 'title' => $title],
                [
                    'created_by' => $adminId,
                    'category' => $category,
                    'description' => $desc,
                    'severity' => $severity,
                    'requires_acknowledgment' => $ack,
                    'status' => 'active',
                    'updated_at' => now()->subDays(90),
                    'created_at' => now()->subDays(90),
                ]
            );
        }

        // Acknowledgments from several residents on rules that require it.
        $ackRules = DB::table('community_rules')->where('community_id', $cid)->where('requires_acknowledgment', true)->pluck('id');
        $users = array_slice(array_values($residents), 0, 8);
        foreach ($ackRules as $ruleId) {
            foreach ($users as $uid) {
                if (rand(0, 100) < 70) {
                    DB::table('rule_acknowledgments')->updateOrInsert(
                        ['rule_id' => $ruleId, 'user_id' => $uid],
                        ['acknowledged_at' => now()->subDays(rand(1, 60))]
                    );
                }
            }
        }
    }

    private function seedDocuments(int $cid, int $adminId): void
    {
        $dir = storage_path('app/public/documents/'.$cid);
        if (! is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }

        $docs = [
            ['Resident Handbook 2026', 'Policies', 'The complete guide to living at '.$this->copyName.', including amenities, policies, and contacts.', 'resident-handbook-2026'],
            ['HOA Bylaws', 'Governance', 'Official community bylaws and governing documents for residents and owners.', 'hoa-bylaws'],
            ['Amenity Reservation Form', 'Forms', 'Printable form to request a private reservation of the clubhouse or pool deck.', 'amenity-reservation-form'],
            ['Emergency Preparedness Guide', 'Safety', 'Storm season checklist and emergency procedures for residents.', 'emergency-preparedness-guide'],
            ['Q3 Financial Statement', 'Financials', 'Quarterly financial statement and reserve fund summary for the community.', 'q3-financial-statement'],
        ];

        foreach ($docs as [$title, $category, $desc, $slug]) {
            $fileName = $slug.'.pdf';
            $absPath = $dir.'/'.$fileName;
            if (! is_file($absPath)) {
                file_put_contents($absPath, $this->placeholderPdf($title));
            }
            $size = is_file($absPath) ? filesize($absPath) : 0;

            DB::table('community_documents')->updateOrInsert(
                ['community_id' => $cid, 'title' => $title],
                [
                    'created_by' => $adminId,
                    'category' => $category,
                    'description' => $desc,
                    'file_path' => "/storage/documents/{$cid}/{$fileName}",
                    'file_name' => $fileName,
                    'file_size' => $size,
                    'mime_type' => 'application/pdf',
                    'download_count' => rand(3, 48),
                    'status' => 'active',
                    'updated_at' => now()->subDays(rand(5, 60)),
                    'created_at' => now()->subDays(rand(5, 60)),
                ]
            );
        }
    }

    private function placeholderPdf(string $title): string
    {
        $text = 'Havena Demo Document: '.str_replace(['(', ')'], '', $title);
        $content = "BT /F1 18 Tf 72 720 Td ({$text}) Tj ET";
        $len = strlen($content);

        return "%PDF-1.4\n"
            ."1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
            ."2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
            ."3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
            ."4 0 obj<</Length {$len}>>stream\n{$content}\nendstream endobj\n"
            ."5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
            ."trailer<</Root 1 0 R>>\n%%EOF";
    }

    /* ─────────────────────────── Messages ─────────────────────────── */

    private function seedMessages(array $residents, int $adminId): void
    {
        $resident = $this->residentId($residents, 'test.resident@havena.app')
            ?? $this->residentId($residents, 'sarah@havena.app');

        if (! $resident && $this->emailAliases === []) {
            $resident = DB::table('users')->where('phone', '+15555550100')->value('id');
        }

        if (! $resident) {
            return;
        }

        $sarah = $this->residentId($residents, 'sarah@havena.app');
        $david = $this->residentId($residents, 'david@havena.app');

        $threads = [
            [$sarah, 'direct', [
                [$sarah, 'Hi! Welcome to the building. Let me know if you need anything getting settled in.', 3],
                [$resident, 'Thank you so much! Where is the best place to pick up packages?', 3],
                [$sarah, 'The mailroom on the ground floor by the east elevators. There are lockers for larger packages.', 2],
                [$resident, 'Perfect, appreciate it!', 2],
            ]],
            [$adminId, 'direct', [
                [$adminId, 'Hello and welcome to '.$this->copyName.'. Your amenity access has been activated. Enjoy the fitness studio, courtyard, and lounge.', 4],
                [$resident, 'Great, thank you. Is the clubhouse available to reserve for a small gathering?', 4],
                [$adminId, 'Absolutely. You can request it from the Amenities section in the app. I will approve it once submitted.', 1],
            ]],
            [$david, 'direct', [
                [$resident, 'Hi David, is the commuter bike still available?', 2],
                [$david, 'Yes it is! Happy to show it to you this weekend if you like.', 1],
            ]],
        ];

        foreach ($threads as [$other, $type, $messages]) {
            if (! $other || (int) $other === (int) $resident) {
                continue;
            }

            // Idempotency: skip if a direct conversation already exists between the pair.
            $existing = DB::table('conversation_participants as a')
                ->join('conversation_participants as b', 'a.conversation_id', '=', 'b.conversation_id')
                ->join('conversations as c', 'c.id', '=', 'a.conversation_id')
                ->where('a.user_id', $resident)
                ->where('b.user_id', $other)
                ->where('c.type', 'direct')
                ->value('a.conversation_id');

            if ($existing) {
                continue;
            }

            $conversationId = DB::table('conversations')->insertGetId([
                'type' => $type,
                'title' => null,
                'created_at' => now()->subDays(4),
                'updated_at' => now(),
            ]);

            foreach ([$resident, $other] as $participant) {
                DB::table('conversation_participants')->updateOrInsert(
                    ['conversation_id' => $conversationId, 'user_id' => $participant],
                    [
                        'unread_count' => (int) $participant === (int) $resident ? 1 : 0,
                        'last_read_at' => now()->subDays(1),
                        'updated_at' => now(),
                        'created_at' => now()->subDays(4),
                    ]
                );
            }

            foreach ($messages as [$senderId, $body, $daysAgo]) {
                if (! $senderId) {
                    continue;
                }
                DB::table('messages')->insert([
                    'conversation_id' => $conversationId,
                    'sender_id' => $senderId,
                    'body' => $body,
                    'type' => 'text',
                    'read_at' => $daysAgo > 1 ? now()->subDays($daysAgo - 1) : null,
                    'created_at' => now()->subDays($daysAgo),
                    'updated_at' => now()->subDays($daysAgo),
                ]);
            }
        }
    }

    /* ─────────────────────────── Notifications & Points ─────────────────────────── */

    private function seedNotifications(array $residents, int $adminId): void
    {
        $targets = array_filter([
            $this->residentId($residents, 'test.resident@havena.app'),
            $this->residentId($residents, 'test.community.admin@havena.app'),
            $adminId,
        ]);

        if ($this->emailAliases === []) {
            $targets[] = DB::table('users')->where('phone', '+15555550100')->value('id');
            $targets[] = DB::table('users')->where('phone', '+15555550200')->value('id');
            $targets = array_unique(array_filter($targets));
        }

        $notifications = [
            ['event', 'New event: Summer Community BBQ', 'RSVP now for the biggest cookout of the season this Saturday.', false, 1],
            ['notice', 'New notice posted', 'Pool deck resurfacing schedule has been announced.', false, 2],
            ['marketplace', 'Your listing was approved', 'Your item is now live in the community marketplace.', true, 3],
            ['booking', 'Booking confirmed', 'Your amenity reservation has been confirmed.', true, 4],
            ['alert', 'Weather alert issued', 'Tropical storm watch is in effect. Tap to read the guidance.', false, 1],
            ['community', 'Welcome to '.$this->copyName, 'Complete your profile to get the most out of your community.', true, 6],
        ];

        foreach ($targets as $uid) {
            foreach ($notifications as $i => [$type, $title, $body, $read, $daysAgo]) {
                DB::table('app_notifications')->updateOrInsert(
                    ['user_id' => $uid, 'type' => $type, 'title' => $title],
                    [
                        'body' => $body,
                        'read_at' => $read ? now()->subDays($daysAgo) : null,
                        'created_at' => now()->subDays($daysAgo),
                        'updated_at' => now()->subDays($daysAgo),
                    ]
                );
            }
        }
    }

    private function seedPoints(int $cid, array $residents): void
    {
        $actions = [
            ['daily_login', 'Daily check-in', 'Opened the app', 5],
            ['post_created', 'Shared a post', 'Posted in the community feed', 15],
            ['event_rsvp', 'RSVP to event', 'Confirmed attendance', 10],
            ['comment_added', 'Joined a conversation', 'Commented on a post', 8],
            ['listing_created', 'Listed an item', 'Added a marketplace listing', 20],
            ['rule_acknowledged', 'Reviewed community rules', 'Acknowledged a rule', 12],
            ['profile_completed', 'Completed profile', 'Added photo and details', 25],
        ];

        $users = array_values(array_filter($residents));
        foreach ($users as $uid) {
            // Skip if this user already has demo points.
            if (DB::table('point_transactions')->where('user_id', $uid)->exists()) {
                continue;
            }
            $picks = array_rand($actions, min(5, count($actions)));
            foreach ((array) $picks as $idx) {
                [$action, $title, $subtitle, $points] = $actions[$idx];
                DB::table('point_transactions')->insert([
                    'user_id' => $uid,
                    'community_id' => $cid,
                    'action' => $action,
                    'title' => $title,
                    'subtitle' => $subtitle,
                    'points' => $points,
                    'created_at' => now()->subDays(rand(1, 30)),
                ]);
            }
        }
    }

    /* ─────────────────────────── Moderation ─────────────────────────── */

    private function seedModeration(int $cid, array $residents, int $adminId): void
    {
        $u = fn (string $email) => $this->residentId($residents, $email);

        $rows = [
            ['noise', 'Loud music after quiet hours', "Repeated loud music coming from a nearby unit well past 11 PM on weekends. Have tried knocking with no response.", 'open', 'medium', 'tom@havena.app', 'robert@havena.app', null],
            ['safety', 'Broken light in parking garage', "The light on level P2 near the ramp has been out for a week. It feels unsafe walking to my car at night.", 'in_review', 'high', 'grace@havena.app', null, null],
            ['spam', 'Repeated solicitation flyers', "Someone keeps leaving business flyers on every door despite the no soliciting policy.", 'resolved', 'low', 'nina@havena.app', null, 'Management posted signage and addressed the vendor. Resolved.'],
            ['damage', 'Damaged mailbox lock', "The lock on the cluster mailbox by the lobby is jammed and will not open properly.", 'open', 'medium', 'david@havena.app', null, null],
        ];

        foreach ($rows as [$type, $title, $desc, $status, $severity, $reporterEmail, $reportedEmail, $note]) {
            $reporter = $u($reporterEmail);
            if (! $reporter) {
                continue;
            }
            DB::table('reports')->updateOrInsert(
                ['community_id' => $cid, 'title' => $title],
                [
                    'reporter_id' => $reporter,
                    'reported_user_id' => $reportedEmail ? $u($reportedEmail) : null,
                    'type' => $type,
                    'description' => $desc,
                    'status' => $status,
                    'severity' => $severity,
                    'assigned_to' => in_array($status, ['in_review', 'resolved'], true) ? $adminId : null,
                    'resolved_by' => $status === 'resolved' ? $adminId : null,
                    'resolved_at' => $status === 'resolved' ? now()->subDays(2) : null,
                    'resolution_note' => $note,
                    'updated_at' => now()->subDays(rand(1, 10)),
                    'created_at' => now()->subDays(rand(5, 20)),
                ]
            );
        }
    }

    /* ─────────────────────────── System scope ─────────────────────────── */

    private function seedContactSubmissions(): void
    {
        $rows = [
            [
                'admin',
                'Olivia Brooks',
                'olivia.brooks@example.com',
                'Harbor Point Residences',
                "[Demo request]\nPhone: +1 555 010 1201\nCommunity size: 51–200 residents\nPreferred time: Weekday morning\n\nI would love to bring Havena to our building. Who should I connect with about getting our HOA set up?",
                'new',
            ],
            [
                'admin',
                'Marcus Reid',
                'marcus.reid@example.com',
                'Cedar Ridge Community',
                "[Demo request]\nPhone: +1 555 010 2202\nCommunity size: 201–500 residents\nPreferred time: Weekday afternoon\n\nWe manage three properties and are interested in a demo for our board meeting next month.",
                'new',
            ],
            [
                'other',
                'Hannah Kim',
                'hannah.kim@example.com',
                'Lakeside Villas',
                "[Demo request]\nCommunity size: 1–50 residents\nPreferred time: Flexible / anytime\n\nDoes the app support event RSVPs and amenity booking? Our residents have been asking for this.",
                'read',
            ],
            [
                'admin',
                'Derek Alvarado',
                'derek.alvarado@example.com',
                'Metro Lofts',
                "[Demo request]\nPhone: +1 555 010 3404\nCommunity size: 201–500 residents\nPreferred time: Weekday evening\n\nFollowing up on pricing for a 250 unit community. Please send details.",
                'read',
            ],
            [
                'other',
                'Sophia Nguyen',
                'sophia.nguyen@example.com',
                'Bay View Co-op',
                "[Demo request]\nCommunity size: Not sure yet\nPreferred time: Flexible / anytime\n\nJust exploring options for our board. Hope our community adopts Havena soon.",
                'archived',
            ],
            [
                'admin',
                'Patricia Gomez',
                'patricia.gomez@example.com',
                'Bayfront Towers',
                "[Demo request]\nPhone: +1 555 010 5606\nCommunity size: 500+ residents\nPreferred time: Weekday morning\n\nOur previous portal was clunky. Havena looks much cleaner. Can we schedule a walkthrough?",
                'new',
            ],
        ];

        foreach ($rows as [$role, $name, $email, $community, $message, $status]) {
            DB::table('contact_submissions')->updateOrInsert(
                ['email' => $email, 'message' => $message],
                [
                    'role' => $role,
                    'name' => $name,
                    'community' => $community,
                    'status' => $status,
                    'ip_address' => '203.0.113.'.rand(2, 250),
                    'user_agent' => 'Mozilla/5.0 (demo submission)',
                    'updated_at' => now()->subDays(rand(1, 20)),
                    'created_at' => now()->subDays(rand(1, 20)),
                ]
            );
        }
    }

    private function seedAdminApplicants(?int $regionId): void
    {
        // Community admin applicants awaiting system-admin approval.
        $applicants = [
            ['Rebecca Foster', 'rebecca.foster@example.com', 'Harbor Point Residences', 'pending'],
            ['Anthony Rivera', 'anthony.rivera@example.com', 'Cedar Ridge Community', 'pending'],
            ['Michelle Carter', 'michelle.carter@example.com', 'Lakeside Villas', 'pending'],
        ];

        foreach ($applicants as $i => [$name, $email, $communityName, $status]) {
            DB::table('users')->updateOrInsert(
                ['email' => $email],
                [
                    'uuid' => (string) Str::ulid(),
                    'name' => $name,
                    'password' => bcrypt('password'),
                    'role' => 'community_admin',
                    'community_admin_status' => $status,
                    'status' => 'active',
                    'phone' => '+1305556'.str_pad((string) (700 + $i), 4, '0', STR_PAD_LEFT),
                    'phone_verified_at' => now(),
                    'updated_at' => now(),
                    'created_at' => now()->subDays(rand(1, 14)),
                ]
            );

            $uid = DB::table('users')->where('email', $email)->value('id');
            DB::table('profiles')->updateOrInsert(
                ['user_id' => $uid],
                [
                    'display_name' => $name,
                    'avatar_url' => "{$this->img}/avatar-".str_pad((string) (($i % 14) + 1), 2, '0', STR_PAD_LEFT).'.jpg',
                    'utility_bill_url' => "{$this->img}/notice-maintenance.jpg",
                    'unit_number' => 'Management Office',
                    'residence_type' => 'Office',
                    'region_id' => $regionId,
                    'bio' => "Prospective community admin for {$communityName}.",
                    'updated_at' => now(),
                    'created_at' => now()->subDays(rand(1, 14)),
                ]
            );
        }
    }

    private function seedActivityLogs(array $residents, int $adminId): void
    {
        if (DB::table('activity_logs')->where('action', 'demo.seeded')->exists()) {
            return;
        }

        $users = array_values(array_filter($residents));
        $userLogs = [
            ['user', 'auth.login', 'Signed in to the app', 'info'],
            ['user', 'post.created', 'Created a new community post', 'info'],
            ['user', 'listing.created', 'Listed an item in the marketplace', 'info'],
            ['user', 'booking.created', 'Requested an amenity booking', 'info'],
            ['user', 'event.rsvp', 'RSVP to a community event', 'info'],
            ['user', 'profile.updated', 'Updated profile information', 'info'],
        ];
        $systemLogs = [
            ['system', 'notice.published', 'A notice was published to the community', 'info'],
            ['system', 'member.approved', 'A membership request was approved', 'info'],
            ['system', 'report.escalated', 'A moderation report was escalated', 'warning'],
            ['system', 'deal.created', 'A new deal was published', 'info'],
            ['system', 'document.uploaded', 'A community document was uploaded', 'info'],
            ['system', 'login.failed', 'Multiple failed login attempts detected', 'warning'],
        ];

        foreach ($userLogs as $i => [$logType, $action, $desc, $severity]) {
            DB::table('activity_logs')->insert([
                'log_type' => $logType,
                'user_id' => $users[$i % max(count($users), 1)] ?? $adminId,
                'action' => $action,
                'description' => $desc,
                'entity_type' => null,
                'entity_id' => null,
                'ip_address' => '198.51.100.'.rand(2, 250),
                'user_agent' => 'Havena Mobile',
                'severity' => $severity,
                'created_at' => now()->subDays(rand(0, 14)),
                'updated_at' => now()->subDays(rand(0, 14)),
            ]);
        }

        foreach ($systemLogs as [$logType, $action, $desc, $severity]) {
            DB::table('activity_logs')->insert([
                'log_type' => $logType,
                'user_id' => $adminId,
                'action' => $action,
                'description' => $desc,
                'ip_address' => '198.51.100.'.rand(2, 250),
                'user_agent' => 'Havena Web',
                'severity' => $severity,
                'created_at' => now()->subDays(rand(0, 14)),
                'updated_at' => now()->subDays(rand(0, 14)),
            ]);
        }

        DB::table('activity_logs')->insert([
            'log_type' => 'system',
            'user_id' => $adminId,
            'action' => 'demo.seeded',
            'description' => 'Demo content seeded for presentation',
            'severity' => 'info',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
