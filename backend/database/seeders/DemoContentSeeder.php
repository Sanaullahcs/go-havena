<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
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

    public function run(): void
    {
        // Foundational catalogs (idempotent seeders).
        $this->call([
            RegionSeeder::class,
            CommunitySeeder::class,
            WellnessHubSeeder::class,
        ]);

        $community = DB::table('communities')
            ->where('status', 'active')
            ->orderBy('id')
            ->first();

        if (! $community) {
            $this->command?->warn('DemoContentSeeder: no active community found.');

            return;
        }

        $cid = $community->id;
        $region = DB::table('regions')->where('status', 'active')->orderBy('sort_order')->first();
        $regionId = $region->id ?? null;

        // Enrich the flagship community record.
        DB::table('communities')->where('id', $cid)->update([
            'description' => 'A vibrant resort-style residential community in Miami-Dade with premium amenities, an active neighborhood feed, a resident marketplace, and year-round events.',
            'address' => '1200 Palm Grove Boulevard, Miami, FL 33131',
            'region_id' => $community->region_id ?: $regionId,
            'timezone' => 'America/New_York',
            'updated_at' => now(),
        ]);

        $residents = $this->seedResidents($cid, $regionId);
        $adminId = $this->resolveAdminAuthor($cid);

        // Demo amenities for admin dashboard (idempotent).
        $this->call(AmenitySeeder::class);
        $this->seedNotices($cid, $adminId);
        $this->seedEvents($cid, $adminId, $residents);
        $this->seedAlerts($cid, $adminId);
        $this->seedFeed($cid, $residents);
        $this->seedListings($cid, $residents);
        $this->seedBusinessesAndDeals($cid, $residents, $adminId);
        $this->seedWellnessImages();
        $this->seedRules($cid, $adminId, $residents);
        $this->seedDocuments($cid, $adminId);
        $this->seedMessages($residents, $adminId);
        $this->seedNotifications($residents, $adminId);
        $this->seedPoints($cid, $residents);
        $this->seedModeration($cid, $residents, $adminId);

        // System-admin scope.
        $this->seedContactSubmissions();
        $this->seedAdminApplicants($regionId);
        $this->seedActivityLogs($residents, $adminId);

        $this->command?->info('DemoContentSeeder: demo content ready for community #'.$cid.'.');
    }

    /* ─────────────────────────── Residents ─────────────────────────── */

    private function seedResidents(int $cid, ?int $regionId): array
    {
        // [name, email, unit, residence_type, bio, avatarN, membership, role]
        $people = [
            ['Sarah Mitchell', 'sarah@neighborlink.app', 'Apt 4B', 'Two-bedroom', 'Book club host and weekend gardener. Always happy to lend a hand.', 5, 'approved', 'member'],
            ['David Chen', 'david@neighborlink.app', 'Apt 6D', 'Studio', 'Software engineer, coffee enthusiast, and casual cyclist.', 12, 'approved', 'member'],
            ['Lisa Wang', 'lisa@neighborlink.app', 'Apt 2A', 'One-bedroom', 'Yoga instructor and plant collector. Ask me about houseplants.', 20, 'approved', 'member'],
            ['James Okafor', 'james@neighborlink.app', 'Apt 7A', 'Two-bedroom', 'New to the neighborhood and excited to get involved.', 33, 'pending', 'member'],
            ['Emily Rodriguez', 'emily@neighborlink.app', 'Apt 1C', 'One-bedroom', 'Freelance designer who loves farmers markets and long walks.', 45, 'approved', 'member'],
            ['Michael Torres', 'michael@neighborlink.app', 'Apt 5F', 'Three-bedroom', 'Dad of two, grill master, and community volunteer.', 15, 'approved', 'moderator'],
            ['Priya Patel', 'priya@neighborlink.app', 'Apt 3B', 'Two-bedroom', 'Physician and runner. Organizing the morning run group.', 26, 'approved', 'member'],
            ['Carlos Mendez', 'carlos@neighborlink.app', 'Apt 8C', 'One-bedroom', 'Photographer capturing everyday moments around the community.', 51, 'approved', 'member'],
            ['Aisha Johnson', 'aisha@neighborlink.app', 'Apt 2D', 'Studio', 'Teacher, baker, and proud dog mom to a golden retriever.', 47, 'approved', 'member'],
            ['Tom Becker', 'tom@neighborlink.app', 'Apt 6A', 'Two-bedroom', 'Retired contractor. Handy with just about anything.', 60, 'approved', 'member'],
            ['Nina Kowalski', 'nina@neighborlink.app', 'Apt 4C', 'One-bedroom', 'Marketing lead who loves community events and trivia nights.', 31, 'approved', 'member'],
            ['Diego Alvarez', 'diego@neighborlink.app', 'Apt 9B', 'Three-bedroom', 'Chef exploring the local food scene one dish at a time.', 13, 'pending', 'member'],
            ['Grace Lee', 'grace@neighborlink.app', 'Apt 1A', 'One-bedroom', 'Nurse and volunteer who enjoys quiet evenings by the pool.', 44, 'approved', 'member'],
            ['Robert Hayes', 'robert@neighborlink.app', 'Apt 7D', 'Two-bedroom', 'Musician and night owl.', 68, 'banned', 'member'],
        ];

        $map = [];
        foreach ($people as [$name, $email, $unit, $type, $bio, $avatarN, $status, $role]) {
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

            DB::table('profiles')->updateOrInsert(
                ['user_id' => $userId],
                [
                    'display_name' => $name,
                    'avatar_url' => "https://i.pravatar.cc/300?img={$avatarN}",
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
        foreach (['test.resident@neighborlink.app' => 8, 'test.community.admin@neighborlink.app' => 3, 'community.admin@neighborlink.app' => 11] as $email => $n) {
            $uid = DB::table('users')->where('email', $email)->value('id');
            if ($uid) {
                DB::table('profiles')->updateOrInsert(
                    ['user_id' => $uid],
                    ['avatar_url' => "https://i.pravatar.cc/300?img={$n}", 'updated_at' => now()]
                );
                $map[$email] = $uid;
            }
        }

        return $map;
    }

    private function resolveAdminAuthor(int $cid): int
    {
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
            ['Welcome to Florida Main Street', 'general', "We are thrilled to welcome you to our community. Use this app to stay up to date on notices, RSVP to events, book amenities, browse the resident marketplace, and connect with your neighbors. If you have questions, reach out to the management office anytime.", "{$this->img}/community-cover.jpg", 1, true],
            ['Pool Deck Resurfacing Schedule', 'maintenance', "The pool deck will be resurfaced next week to keep our resort pool looking its best. The pool will remain open, but the north deck section will be closed Monday through Wednesday from 8:00 AM to 4:00 PM. Thank you for your patience.", "{$this->img}/notice-maintenance.jpg", 3, false],
            ['Q3 Community Budget Summary', 'finance', "The third quarter budget summary is now available in the Documents section. Highlights include reserve fund contributions, landscaping investments, and the new smart access system. A detailed breakdown will be presented at the upcoming town hall.", "{$this->img}/event-townhall.jpg", 5, false],
            ['Updated Gate Access Codes', 'security', "For everyone's safety, gate and amenity access codes will be rotated at the end of the month. Updated codes will be sent to registered residents by email and are available at the management office with a valid ID.", "{$this->img}/alert-weather.jpg", 7, false],
            ['Elevator Modernization Update', 'maintenance', "Elevator B in the east tower will undergo modernization over the next two weeks. Elevator A remains fully operational. We appreciate your understanding as we improve reliability and reduce wait times.", "{$this->img}/amenity-gym.jpg", 9, false],
            ['Landscaping Refresh This Month', 'general', "Our grounds team is refreshing the entry gardens and courtyard plantings this month. Expect new seasonal flowers, upgraded irrigation, and improved lighting along the main walkways.", "{$this->img}/listing-plants.jpg", 4, false],
            ['Saturday Farmers Market Shuttle', 'general', "A free shuttle will run from the lobby to the neighborhood farmers market every Saturday from 8:00 AM to 12:00 PM. Meet at the front porte cochère — no RSVP needed.", "{$this->img}/feed-market.jpg", 2, true],
            ['New Resident Welcome Packets', 'general', "New neighbors can pick up welcome packets at the management office. Packets include amenity hours, Wi‑Fi info, recycling guidelines, and this month's community calendar.", "{$this->img}/business-cafe.jpg", 6, false],
            ['Clubhouse Hours Extended', 'general', "Good news — the clubhouse lounge will stay open until 10:00 PM on Fridays and Saturdays starting this weekend. Quiet hours still begin at 11:00 PM.", "{$this->img}/amenity-clubhouse.jpg", 8, false],
            ['Pet Registration Reminder', 'general', "Please register pets at the management office if you have not already. Include a recent photo and vaccination records. Registered pets help us reunite lost animals quickly.", "{$this->img}/feed-dog.jpg", 10, false],
        ];

        foreach ($rows as [$title, $category, $body, $image, $daysAgo, $pinned]) {
            $payload = [
                'author_id' => $adminId,
                'category' => $category,
                'body' => $body,
                'image_url' => $image,
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
    }

    private function seedEvents(int $cid, int $adminId, array $residents): void
    {
        // [title, body, image, when, start24h, end24h, capacity, location, pinned]
        $rows = [
            ['Summer Community BBQ', "Join your neighbors for our biggest cookout of the season. We will have grilled favorites, games for the kids, live music, and plenty of shade. Bring a side dish to share if you like.", "{$this->img}/event-bbq.jpg", '+6 days', '17:00', '20:00', 120, 'Courtyard Lawn', true],
            ['Quarterly Residents Town Hall', "Meet the management team, review community updates, and share your ideas. We will cover the Q3 budget, upcoming projects, and answer your questions.", "{$this->img}/event-townhall.jpg", '+12 days', '18:30', '20:00', 80, 'Clubhouse Lounge', true],
            ['Poolside Movie Night', "Grab a towel and settle in for a family friendly movie under the stars by the pool. Popcorn and refreshments provided.", "{$this->img}/amenity-pool.jpg", '+9 days', '20:00', '22:00', 60, 'Resort Pool Deck', false],
            ['Holiday Cookie Exchange', "Bring a batch of your favorite cookies and swap with neighbors. A cozy way to meet new faces and share recipes.", "{$this->img}/amenity-clubhouse.jpg", '+20 days', '15:00', '17:00', 40, 'Clubhouse Lounge', false],
            ['Sunrise Yoga by the Pool', "Start the weekend with a gentle yoga flow led by resident instructor Lisa. Mats provided for the first 20 arrivals. All levels welcome.", "{$this->img}/wellness-exercise.jpg", '+4 days', '07:30', '08:30', 25, 'Resort Pool Deck', false],
            ['Fitness Bootcamp Saturday', "A high-energy outdoor bootcamp with stations for cardio, strength, and mobility. Bring water and athletic shoes.", "{$this->img}/amenity-gym.jpg", '+11 days', '09:00', '10:00', 30, 'Courtyard Lawn', false],
            ['Neighborhood Coffee Meetup', "Casual coffee and conversation for new and longtime residents. Stop by anytime during the open house window.", "{$this->img}/deal-coffee.jpg", '+3 days', '10:00', '11:30', 50, 'Lobby Café Corner', false],
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
            ['community_id' => $cid, 'title' => 'Tropical Storm Watch: Secure Balconies'],
            [
                'author_id' => $adminId,
                'category' => 'emergency',
                'body' => "A tropical storm watch is in effect for Miami-Dade through Thursday. Please secure balcony furniture and loose items, charge your devices, and review the Emergency Preparedness Guide in the Documents section. The management team will share updates as conditions change. Stay safe.",
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
        $u = fn (string $email) => $residents[$email] ?? null;

        $posts = [
            ['aisha@neighborlink.app', 'help', "Has anyone seen Biscuit? Our golden retriever slipped out of the lobby this afternoon near the east tower. He is very friendly and wearing a blue collar. Please call me if you spot him. Thank you neighbors!", "{$this->img}/feed-dog.jpg", 14, 3, 1],
            ['emily@neighborlink.app', 'general', "The Saturday farmers market two blocks over is amazing right now. Fresh strawberries, local honey, and the best sourdough. Highly recommend a morning stroll over there this weekend.", "{$this->img}/feed-market.jpg", 22, 5, 2],
            ['priya@neighborlink.app', 'general', "Starting a morning run group! We meet at the clubhouse at 6:30 AM on Tuesdays and Thursdays. All paces welcome, we stick together. Comment below if you want to join.", null, 18, 6, 3],
            ['tom@neighborlink.app', 'help', "Looking for a recommendation for a reliable plumber who has worked in the building before. Slow drain in the kitchen. Appreciate any leads.", null, 4, 4, 4],
            ['david@neighborlink.app', 'general', "Big thank you to the maintenance team for fixing the gym AC so quickly. Back to full workouts in comfort. You all are the best.", null, 27, 2, 5],
            ['nina@neighborlink.app', 'general', "Free moving boxes available! We just unpacked and have about fifteen sturdy boxes plus packing paper. First come first served, message me and I will leave them by the mailroom.", null, 9, 3, 6],
        ];

        foreach ($posts as [$email, $category, $body, $image, $likes, $comments, $daysAgo]) {
            $uid = $u($email);
            if (! $uid) {
                continue;
            }
            DB::table('posts')->updateOrInsert(
                ['community_id' => $cid, 'user_id' => $uid, 'body' => $body],
                [
                    'category' => $category,
                    'image_url' => $image,
                    'status' => 'approved',
                    'approved_at' => now()->subDays($daysAgo),
                    'likes_count' => $likes,
                    'comments_count' => $comments,
                    'updated_at' => now()->subDays($daysAgo),
                    'created_at' => now()->subDays($daysAgo),
                ]
            );
        }

        // Comments + likes on the lost dog and farmers market posts.
        $dogPost = DB::table('posts')->where('community_id', $cid)->where('category', 'help')->where('body', 'like', 'Has anyone seen Biscuit%')->value('id');
        $marketPost = DB::table('posts')->where('community_id', $cid)->where('body', 'like', 'The Saturday farmers market%')->value('id');

        $comments = [];
        if ($dogPost) {
            $comments[] = [$dogPost, 'sarah@neighborlink.app', 'I think I saw him near the pool gate about an hour ago. Keeping an eye out!'];
            $comments[] = [$dogPost, 'michael@neighborlink.app', 'Sharing with my floor group chat. We will help look.'];
            $comments[] = [$dogPost, 'grace@neighborlink.app', 'So glad he was found safe. What a sweetheart.'];
        }
        if ($marketPost) {
            $comments[] = [$marketPost, 'lisa@neighborlink.app', 'The honey vendor is my favorite. See you there Saturday!'];
            $comments[] = [$marketPost, 'carlos@neighborlink.app', 'Great photos. Adding this to my weekend plans.'];
        }

        foreach ($comments as [$postId, $email, $body]) {
            $uid = $u($email);
            if (! $uid) {
                continue;
            }
            DB::table('post_comments')->updateOrInsert(
                ['post_id' => $postId, 'user_id' => $uid, 'body' => $body],
                ['updated_at' => now(), 'created_at' => now()->subDays(rand(1, 10))]
            );
        }

        // Likes (composite PK, created_at default).
        $likeUsers = array_values($residents);
        foreach ([$dogPost, $marketPost] as $postId) {
            if (! $postId) {
                continue;
            }
            foreach (array_slice($likeUsers, 0, 8) as $uid) {
                DB::table('post_likes')->updateOrInsert(['user_id' => $uid, 'post_id' => $postId], []);
            }
        }

        // Keep denormalized counters aligned with real rows (not the placeholder seed numbers).
        $seededPostIds = DB::table('posts')->where('community_id', $cid)->pluck('id');
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
        $u = fn (string $email) => $residents[$email] ?? null;

        $rows = [
            ['sarah@neighborlink.app', 'for_sale', 'Furniture', 'Like new', 'Gray 3-Seat Sofa', 220.00, "Comfortable light gray fabric sofa in excellent condition. Smoke free and pet free home. Pickup from Apt 4B.", ['listing-sofa'], 3],
            ['david@neighborlink.app', 'for_sale', 'Sports', 'Good', 'Hybrid Commuter Bike', 180.00, "Reliable hybrid bike, recently tuned with new tires. Great for the trail or commuting. Minor cosmetic wear.", ['listing-bike'], 5],
            ['emily@neighborlink.app', 'for_sale', 'Furniture', 'Good', 'White Office Desk', 95.00, "Clean white home office desk with drawers. Perfect for a study nook. Some light scuffs on the legs.", ['listing-desk'], 6],
            ['lisa@neighborlink.app', 'for_sale', 'Home & Garden', 'New', 'Indoor Plant Bundle', 40.00, "Five healthy potted houseplants including a snake plant and pothos. Great starter set for a green corner.", ['listing-plants'], 2],
            ['carlos@neighborlink.app', 'for_sale', 'Electronics', 'Good', '55 inch 4K Smart TV', 300.00, "55 inch 4K smart TV with remote and stand. Crisp picture, works perfectly. Upgrading to a larger size.", ['listing-tv'], 8],
            ['nina@neighborlink.app', 'for_sale', 'Baby & Kids', 'Like new', 'Baby Stroller', 120.00, "Lightweight stroller, folds easily, barely used. Includes rain cover. Pickup from the lobby.", ['listing-stroller'], 4],
            ['priya@neighborlink.app', 'service', 'Services', null, 'Math Tutoring (Grades 6-12)', 30.00, "Experienced tutor offering math help for middle and high school students. Evenings and weekends. First session is free.", [], 10],
            ['tom@neighborlink.app', 'wanted', 'Furniture', null, 'Wanted: Standing Desk', null, "Looking for a used sit-stand desk in good condition. Willing to pick up. Let me know what you have.", [], 7],
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
                    'location' => 'Florida Main Street',
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
        $u = fn (string $email) => $residents[$email] ?? $adminId;

        $businesses = [
            ['Sunrise Coffee Co.', 'Cafe', "Neighborhood coffee bar serving specialty espresso, fresh pastries, and cold brew. Locally roasted beans and a cozy patio.", '1200 Palm Grove Blvd, Suite 4', '(305) 555-0142', 'Mon-Sun 6:30 AM - 7:00 PM', 'Free WiFi, Outdoor seating, Loyalty rewards', 'business-cafe', 'emily@neighborlink.app'],
            ['Core Pilates Studio', 'Fitness', "Boutique pilates and reformer studio with certified instructors. Small classes for all levels, from beginner to advanced.", '1200 Palm Grove Blvd, Suite 8', '(305) 555-0187', 'Mon-Sat 6:00 AM - 8:00 PM', 'Reformer classes, Private sessions, First class free', 'business-fitness', 'lisa@neighborlink.app'],
            ['Luxe Hair & Spa', 'Beauty & Spa', "Full service salon and spa offering cuts, color, facials, and massage. Relax and refresh close to home.", '1200 Palm Grove Blvd, Suite 12', '(305) 555-0164', 'Tue-Sun 9:00 AM - 6:00 PM', 'Hair, Color, Facials, Massage', 'business-salon', 'nina@neighborlink.app'],
            ['Bella Cucina Trattoria', 'Restaurant', "Family owned Italian trattoria with wood-fired pizza, handmade pasta, and a warm atmosphere. Dine in or takeout.", '1200 Palm Grove Blvd, Suite 1', '(305) 555-0119', 'Mon-Sun 11:00 AM - 10:00 PM', 'Wood-fired pizza, Handmade pasta, Takeout, Delivery', 'business-restaurant', 'diego@neighborlink.app'],
        ];

        $businessIds = [];
        foreach ($businesses as [$name, $cat, $desc, $addr, $phone, $hours, $amenities, $image, $ownerEmail]) {
            DB::table('businesses')->updateOrInsert(
                ['community_id' => $cid, 'name' => $name],
                [
                    'owner_id' => $u($ownerEmail),
                    'category' => $cat,
                    'description' => $desc,
                    'address' => $addr,
                    'phone' => $phone,
                    'hours' => $hours,
                    'amenities' => $amenities,
                    'image_url' => "{$this->img}/{$image}.jpg",
                    'status' => 'approved',
                    'approved_at' => now()->subDays(30),
                    'approved_by' => $adminId,
                    'updated_at' => now()->subDays(30),
                    'created_at' => now()->subDays(60),
                ]
            );
            $businessIds[$name] = DB::table('businesses')->where('community_id', $cid)->where('name', $name)->value('id');
        }

        $deals = [
            ['20% Off Any Latte', 'Sunrise Coffee Co.', "Show this coupon at the counter to get 20% off any latte, hot or iced. Start your morning right.", 'coupon', '20% OFF', 5.50, 4.40, 'BREW20', 'Cafe', 'deal-coffee', true, 'emily@neighborlink.app', 30],
            ['Free First Pilates Class', 'Core Pilates Studio', "New to the studio? Your first reformer class is on us. Book online or drop by to reserve your spot.", 'offer', 'FREE TRIAL', null, null, null, 'Fitness', 'business-fitness', false, 'lisa@neighborlink.app', 45],
            ['$15 Off Any Spa Service', 'Luxe Hair & Spa', "Treat yourself to a facial or massage and take $15 off any spa service over $60. Neighbors only.", 'deal', '$15 OFF', 80.00, 65.00, 'RELAX15', 'Beauty & Spa', 'deal-spa', false, 'nina@neighborlink.app', 20],
            ['Family Pizza Night 2-for-1', 'Bella Cucina Trattoria', "Buy any large wood-fired pizza and get a second of equal or lesser value free, every Tuesday night.", 'deal', '2 FOR 1', 24.00, 12.00, 'PIZZATUES', 'Restaurant', 'deal-pizza', true, 'diego@neighborlink.app', 14],
        ];

        foreach ($deals as [$title, $vendor, $desc, $type, $label, $orig, $disc, $promo, $cat, $image, $featured, $ownerEmail, $endDays]) {
            DB::table('deals')->updateOrInsert(
                ['community_id' => $cid, 'title' => $title],
                [
                    'created_by' => $u($ownerEmail),
                    'business_id' => $businessIds[$vendor] ?? null,
                    'vendor' => $vendor,
                    'description' => $desc,
                    'type' => $type,
                    'discount_label' => $label,
                    'original_price' => $orig,
                    'discounted_price' => $disc,
                    'promo_code' => $promo,
                    'category' => $cat,
                    'location' => 'Florida Main Street',
                    'image_url' => "{$this->img}/{$image}.jpg",
                    'is_featured' => $featured,
                    'status' => 'active',
                    'starts_at' => now()->subDays(10),
                    'ends_at' => now()->addDays($endDays),
                    'updated_at' => now()->subDays(10),
                    'created_at' => now()->subDays(10),
                ]
            );
        }
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
            DB::table('wellness_courses')
                ->where('category_id', $categoryId)
                ->whereNull('image_url')
                ->update(['image_url' => "{$this->img}/{$image}.jpg", 'updated_at' => now()]);
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
            ['Resident Handbook 2026', 'Policies', 'The complete guide to living at Florida Main Street, including amenities, policies, and contacts.', 'resident-handbook-2026'],
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
        $text = 'NeighborLink Demo Document: '.str_replace(['(', ')'], '', $title);
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
        $resident = $residents['test.resident@neighborlink.app']
            ?? DB::table('users')->where('phone', '+15555550100')->value('id')
            ?? ($residents['sarah@neighborlink.app'] ?? null);

        if (! $resident) {
            return;
        }

        $threads = [
            [$residents['sarah@neighborlink.app'] ?? null, 'direct', [
                [$residents['sarah@neighborlink.app'] ?? null, 'Hi! Welcome to the building. Let me know if you need anything getting settled in.', 3],
                [$resident, 'Thank you so much! Where is the best place to pick up packages?', 3],
                [$residents['sarah@neighborlink.app'] ?? null, 'The mailroom on the ground floor by the east elevators. There are lockers for larger packages.', 2],
                [$resident, 'Perfect, appreciate it!', 2],
            ]],
            [$adminId, 'direct', [
                [$adminId, 'Hello and welcome to Florida Main Street. Your amenity access has been activated. Enjoy the pool and gym!', 4],
                [$resident, 'Great, thank you. Is the clubhouse available to reserve for a small gathering?', 4],
                [$adminId, 'Absolutely. You can request it from the Amenities section in the app. I will approve it once submitted.', 1],
            ]],
            [$residents['david@neighborlink.app'] ?? null, 'direct', [
                [$resident, 'Hi David, is the commuter bike still available?', 2],
                [$residents['david@neighborlink.app'] ?? null, 'Yes it is! Happy to show it to you this weekend if you like.', 1],
            ]],
        ];

        foreach ($threads as [$other, $type, $messages]) {
            if (! $other) {
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
                DB::table('conversation_participants')->insert([
                    'conversation_id' => $conversationId,
                    'user_id' => $participant,
                    'unread_count' => $participant === $resident ? 1 : 0,
                    'last_read_at' => now()->subDays(1),
                    'created_at' => now()->subDays(4),
                    'updated_at' => now(),
                ]);
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
            $residents['test.resident@neighborlink.app'] ?? DB::table('users')->where('phone', '+15555550100')->value('id'),
            $residents['test.community.admin@neighborlink.app'] ?? DB::table('users')->where('phone', '+15555550200')->value('id'),
            $adminId,
        ]);

        $notifications = [
            ['event', 'New event: Summer Community BBQ', 'RSVP now for the biggest cookout of the season this Saturday.', false, 1],
            ['notice', 'New notice posted', 'Pool deck resurfacing schedule has been announced.', false, 2],
            ['marketplace', 'Your listing was approved', 'Your item is now live in the community marketplace.', true, 3],
            ['booking', 'Booking confirmed', 'Your amenity reservation has been confirmed.', true, 4],
            ['alert', 'Weather alert issued', 'Tropical storm watch is in effect. Tap to read the guidance.', false, 1],
            ['community', 'Welcome to Florida Main Street', 'Complete your profile to get the most out of your community.', true, 6],
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
        $u = fn (string $email) => $residents[$email] ?? null;

        $rows = [
            ['noise', 'Loud music after quiet hours', "Repeated loud music coming from a nearby unit well past 11 PM on weekends. Have tried knocking with no response.", 'open', 'medium', 'tom@neighborlink.app', 'robert@neighborlink.app', null],
            ['safety', 'Broken light in parking garage', "The light on level P2 near the ramp has been out for a week. It feels unsafe walking to my car at night.", 'in_review', 'high', 'grace@neighborlink.app', null, null],
            ['spam', 'Repeated solicitation flyers', "Someone keeps leaving business flyers on every door despite the no soliciting policy.", 'resolved', 'low', 'nina@neighborlink.app', null, 'Management posted signage and addressed the vendor. Resolved.'],
            ['damage', 'Damaged mailbox lock', "The lock on the cluster mailbox by the lobby is jammed and will not open properly.", 'open', 'medium', 'david@neighborlink.app', null, null],
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
            ['resident', 'Olivia Brooks', 'olivia.brooks@example.com', 'Harbor Point Residences', "I would love to bring NeighborLink to our building. Who should I connect with about getting our HOA set up?", 'new'],
            ['admin', 'Marcus Reid', 'marcus.reid@example.com', 'Cedar Ridge Community', "We manage three properties and are interested in a demo for our board meeting next month.", 'new'],
            ['resident', 'Hannah Kim', 'hannah.kim@example.com', 'Lakeside Villas', "Does the app support event RSVPs and amenity booking? Our residents have been asking for this.", 'read'],
            ['admin', 'Derek Alvarado', 'derek.alvarado@example.com', 'Metro Lofts', "Following up on pricing for a 250 unit community. Please send details.", 'read'],
            ['resident', 'Sophia Nguyen', 'sophia.nguyen@example.com', null, "Just wanted to say the marketplace feature is a fantastic idea. Hope our community adopts it soon.", 'archived'],
            ['admin', 'Patricia Gomez', 'patricia.gomez@example.com', 'Bayfront Towers', "Our previous portal was clunky. NeighborLink looks much cleaner. Can we schedule a walkthrough?", 'new'],
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
                    'avatar_url' => 'https://i.pravatar.cc/300?img='.(52 + $i),
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
                'user_agent' => 'NeighborLink Mobile',
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
                'user_agent' => 'NeighborLink Web',
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
