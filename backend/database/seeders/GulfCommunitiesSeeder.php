<?php

namespace Database\Seeders;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\InviteCode;
use App\Models\Profile;
use App\Models\State;
use App\Models\User;
use App\Services\LocationCatalog;
use App\Services\UnitAssignmentService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Muscat, Doha, and Jeddah — one community for each city, on the Acton pattern.
 *
 * Places, addresses, and population figures are published. The two named
 * residents belong to all three communities, as does syed@gohavena.com.
 * Office logins are admin.muscat@, admin.doha@, and admin.jeddah@ (OTP 221322).
 *
 * Run: php artisan db:seed --class=Database\Seeders\GulfCommunitiesSeeder --force
 */
class GulfCommunitiesSeeder extends Seeder
{
    public const RESIDENTS = [
        [
            'email' => 'faisalaljamil@gmail.com',
            'name' => 'Faisal Al Jamil',
        ],
        [
            'email' => 'zaeem.chaudhry@gmail.com',
            'name' => 'Zaeem Chaudhry',
        ],
    ];

    public function run(): void
    {
        $catalog = app(LocationCatalog::class);
        $residents = [];
        $showcase = User::query()->whereRaw('LOWER(email) = ?', ['syed@gohavena.com'])->first();
        $showcaseUnit = $showcase
            ? DB::table('profiles')->where('user_id', $showcase->id)->value('unit_number')
            : null;

        foreach (self::cities() as $city) {
            $state = State::query()->with('country')->findOrFail($city['state_id']);
            $country = strtoupper((string) $state->country?->code);
            $stateName = strtolower((string) $state->name);
            $needles = (array) $city['state_match'];
            $nameMatches = false;
            foreach ($needles as $needle) {
                if (str_contains($stateName, $needle)) {
                    $nameMatches = true;
                    break;
                }
            }
            if ($country !== $city['country'] || ! $nameMatches) {
                throw new \RuntimeException("Refusing to seed {$city['name']}: state {$state->id} is {$state->name} ({$country}).");
            }
            $region = $city['region'] === 'state'
                ? $catalog->ensureStateRegion($state)
                : $catalog->ensureCityRegion($state, $city['city']);

            $region->update([
                'users_label' => number_format($city['population']).' residents',
                'status' => 'active',
            ]);

            $community = $this->upsertCommunity($region, $city);
            $admin = $this->upsertAdmin($region, $community, $city);
            $this->attachShowcaseResident($community);
            foreach (self::RESIDENTS as $person) {
                $residents[$person['email']] = $this->upsertResident($region, $community, $person, $city);
            }
            $this->upsertInvite($community, $admin, $city);
            $this->upsertBilling($community, $city);
            $this->seedContent($community, $admin, $city);
            $this->assignCommunityUnits($community, $city);

            $this->command?->info($community->name.' ready — '.$city['admin_email'].' / '.self::RESIDENTS[0]['email'].' + '.self::RESIDENTS[1]['email']);
        }

        $home = Community::query()->where('name', 'Muscat, Oman')->first();
        if ($home) {
            foreach ($residents as $user) {
                if (in_array($user->role, ['system_admin', 'community_admin'], true)) {
                    continue;
                }
                $user->forceFill([
                    'active_context' => 'resident',
                    'active_context_community_id' => $home->id,
                ])->save();
                $primary = self::cities()[0]['units'][strtolower($user->email)][0] ?? null;
                if ($primary) {
                    DB::table('profiles')->where('user_id', $user->id)->update([
                        'unit_number' => $primary,
                        'updated_at' => now(),
                    ]);
                }
            }
        }

        if ($showcase && $showcaseUnit) {
            DB::table('profiles')->where('user_id', $showcase->id)->update([
                'unit_number' => $showcaseUnit,
                'updated_at' => now(),
            ]);
        }
    }

    /** @param array<string, mixed> $city */
    private function assignCommunityUnits(Community $community, array $city): void
    {
        $units = app(UnitAssignmentService::class);
        $admin = User::query()->whereRaw('LOWER(email) = ?', [strtolower($city['admin_email'])])->first();
        if ($admin) {
            $units->assignUserToUnitNumber((int) $community->id, (int) $admin->id, 'Office', true);
        }

        foreach ($city['units'] as $email => $numbers) {
            $user = User::query()->whereRaw('LOWER(email) = ?', [strtolower($email)])->first();
            if (! $user) {
                continue;
            }
            foreach ($numbers as $index => $number) {
                $units->assignUserToUnitNumber(
                    (int) $community->id,
                    (int) $user->id,
                    $number,
                    false,
                    $index === 0,
                );
            }
        }
    }

    /** @param array<string, mixed> $city */
    private function upsertCommunity($region, array $city): Community
    {
        $attributes = [
            'name' => $city['name'],
            'region' => $region->title,
            'region_id' => $region->id,
            'address' => $city['address'],
            'description' => $city['description'],
            'timezone' => $city['timezone'],
            'currency' => $city['currency'],
            'status' => 'active',
            'review_status' => 'approved',
            'reviewed_at' => now()->subMonths(8),
            'estimated_residents' => $city['population'],
            'latitude' => $city['latitude'],
            'longitude' => $city['longitude'],
        ];

        $community = Community::query()->where('name', $city['name'])->first();
        if ($community) {
            $community->update($attributes);
        } else {
            $community = Community::query()->create($attributes);
        }

        return $community->fresh();
    }

    /** @param array<string, mixed> $city */
    private function upsertAdmin($region, Community $community, array $city): User
    {
        $this->renameLegacyAdmin($city['admin_email']);
        $joined = now()->subMonths(10);
        $user = $this->upsertUser($city['admin_email'], [
            'name' => $city['admin_name'],
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'active_context' => 'community_admin',
            'active_context_community_id' => $community->id,
        ], $joined);

        $this->upsertProfile($user, [
            'display_name' => $city['admin_name'],
            'unit_number' => $city['office'],
            'office_address' => $city['address'],
            'residence_type' => 'Management',
            'bio' => $city['admin_bio'],
            'region_id' => $region->id,
            'utility_bill_url' => '/storage/seed/utility-bill-admin.jpg',
        ]);

        $this->upsertMembership($user, $community, 'admin', 'approved', $joined);

        return $user;
    }

    private function renameLegacyAdmin(string $email): void
    {
        $legacy = str_replace('admin.', 'community.', strtolower($email));
        if ($legacy === strtolower($email)) {
            return;
        }
        if (User::query()->whereRaw('LOWER(email) = ?', [strtolower($email)])->exists()) {
            return;
        }
        $old = User::query()->whereRaw('LOWER(email) = ?', [$legacy])->first();
        if ($old) {
            $old->forceFill(['email' => strtolower($email)])->save();
        }
    }

    /**
     * The Acton showcase resident joins each Gulf city without losing Acton,
     * and without moving their home community.
     */
    private function attachShowcaseResident(Community $community): void
    {
        $user = User::query()->whereRaw('LOWER(email) = ?', ['syed@gohavena.com'])->first();
        if (! $user) {
            return;
        }

        $this->upsertMembership($user, $community, 'member', 'approved', now()->subMonths(4));
    }

    /** @param array<string, mixed> $person */
    private function upsertResident($region, Community $community, array $person, array $city): User
    {
        $joined = now()->subMonths(4);
        $user = $this->upsertUser($person['email'], [
            'name' => $person['name'],
            'role' => 'resident',
            'status' => 'active',
        ], $joined);

        $profile = [
            'display_name' => $person['name'],
            'residence_type' => 'homeowner',
            'bio' => 'Resident of the Havena communities in Muscat, Doha, and Jeddah.',
        ];
        if ($city['name'] === 'Muscat, Oman') {
            $profile['region_id'] = $region->id;
        }
        $this->upsertProfile($user, $profile);

        $this->upsertMembership($user, $community, 'member', 'approved', $joined);

        return $user;
    }

    private function upsertUser(string $email, array $attributes, Carbon $createdAt): User
    {
        $user = User::query()->whereRaw('LOWER(email) = ?', [strtolower($email)])->first();
        $payload = $attributes;
        if ($user && in_array($user->role, ['system_admin', 'community_admin'], true) && ($payload['role'] ?? '') === 'resident') {
            unset($payload['role'], $payload['status']);
        }

        if (! $user) {
            $user = User::query()->create(array_merge($payload, [
                'uuid' => (string) Str::ulid(),
                'email' => strtolower($email),
                'password' => Str::random(40),
            ]));
        } else {
            unset($payload['password']);
            $user->update($payload);
        }

        if (! $user->email_verified_at) {
            $user->forceFill(['email_verified_at' => $createdAt])->save();
        }

        return $user->fresh();
    }

    private function upsertProfile(User $user, array $attributes): void
    {
        Profile::query()->updateOrCreate(['user_id' => $user->id], $attributes);
    }

    private function upsertMembership(User $user, Community $community, string $role, string $status, Carbon $createdAt): void
    {
        CommunityMembership::query()->updateOrCreate(
            ['user_id' => $user->id, 'community_id' => $community->id],
            ['role' => $role, 'status' => $status],
        );

        DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('community_id', $community->id)
            ->update(['created_at' => $createdAt, 'updated_at' => $createdAt]);
    }

    /** @param array<string, mixed> $city */
    private function upsertInvite(Community $community, User $admin, array $city): void
    {
        InviteCode::query()->updateOrCreate(
            ['code' => $city['invite']],
            [
                'community_id' => $community->id,
                'created_by' => $admin->id,
                'max_uses' => null,
                'expires_at' => null,
            ],
        );
    }

    /** @param array<string, mixed> $city */
    private function upsertBilling(Community $community, array $city): void
    {
        CommunitySubscription::query()->updateOrCreate(
            ['community_id' => $community->id],
            [
                'plan_slug' => 'growth',
                'billing_interval' => 'year',
                'status' => CommunitySubscription::STATUS_ACTIVE,
                'seat_limit' => $city['population'],
                'extra_seats' => 0,
                'estimated_residents' => $city['population'],
                'current_period_start' => now()->subMonths(2),
                'current_period_end' => now()->addMonths(10),
                'cancel_at_period_end' => false,
                'meta' => ['activated_via' => 'manual', 'granted_reason' => 'gulf_community'],
            ],
        );
    }

    /** @param array<string, mixed> $city */
    private function seedContent(Community $community, User $admin, array $city): void
    {
        $cid = (int) $community->id;
        $now = now();

        foreach ($city['places'] as $place) {
            [$openAt, $closeAt] = $this->amenityClock($place['name']);
            $payload = [
                'community_id' => $cid,
                'created_by' => $admin->id,
                'name' => $place['name'],
                'description' => $place['description'],
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => $place['capacity'],
                'floor' => $place['address'],
                'hours' => $place['hours'],
                'start_time' => $openAt,
                'end_time' => $closeAt,
                'weekends_available' => true,
                'slot_duration_minutes' => null,
                'icon_key' => 'building',
                'image_url' => $this->img($place['image']),
                'booking_fee' => 0,
                'updated_at' => $now,
            ];

            $existing = DB::table('amenities')->where('community_id', $cid)->where('name', $place['name'])->value('id');
            if ($existing) {
                DB::table('amenities')->where('id', $existing)->update($payload);
            } else {
                DB::table('amenities')->insert($payload + ['created_at' => $now]);
            }
        }

        foreach ($city['events'] as $event) {
            $deadline = Carbon::parse($event['date'])->subDay();
            $payload = [
                'author_id' => $admin->id,
                'category' => 'event',
                'body' => $event['body'],
                'location' => $event['location'],
                'image_url' => $this->img($event['image']),
                'event_date' => $event['date'],
                'event_end_date' => $event['date'],
                'event_time' => $event['start'],
                'event_time_end' => $event['end'],
                'event_capacity' => $event['capacity'],
                'requires_rsvp' => true,
                'is_pinned' => $event['pinned'],
                'status' => 'published',
                'review_status' => 'approved',
                'is_global' => false,
                'approved_by' => $admin->id,
                'approved_at' => $now,
                'published_at' => $now,
                'updated_at' => $now,
                'created_at' => $now,
            ];
            if (Schema::hasColumn('notices', 'registration_deadline_date')) {
                $payload['registration_deadline_date'] = $deadline->toDateString();
                $payload['registration_deadline_time'] = '18:00:00';
            }

            DB::table('notices')->updateOrInsert(
                ['community_id' => $cid, 'title' => $event['title']],
                $payload,
            );
        }

        foreach ($city['notices'] as $notice) {
            $payload = [
                'author_id' => $admin->id,
                'category' => $notice['category'] ?? 'general',
                'body' => $notice['body'],
                'location' => $notice['location'] ?? null,
                'image_url' => $this->img($notice['image']),
                'event_date' => $notice['date'] ?? null,
                'event_end_date' => $notice['end_date'] ?? ($notice['date'] ?? null),
                'event_time' => $notice['start'] ?? null,
                'event_time_end' => $notice['end'] ?? null,
                'status' => 'published',
                'review_status' => 'approved',
                'is_global' => false,
                'approved_by' => $admin->id,
                'approved_at' => $now,
                'published_at' => $now,
                'updated_at' => $now,
                'created_at' => $now,
            ];
            if (Schema::hasColumn('notices', 'is_pinned')) {
                $payload['is_pinned'] = (bool) ($notice['pinned'] ?? false);
            }

            DB::table('notices')->updateOrInsert(
                ['community_id' => $cid, 'title' => $notice['title']],
                $payload,
            );
        }

        foreach ($city['businesses'] as $shop) {
            $payload = [
                'category' => $shop['category'],
                'description' => $shop['description'],
                'address' => $shop['address'],
                'phone' => $shop['phone'] ?? null,
                'hours' => $shop['hours'],
                'image_url' => $this->img($shop['image']),
                'status' => 'approved',
                'approved_at' => $now,
                'approved_by' => $admin->id,
                'updated_at' => $now,
                'created_at' => $now,
            ];
            if (Schema::hasColumn('businesses', 'website')) {
                $payload['website'] = $shop['website'];
            }
            if (Schema::hasColumn('businesses', 'amenities')) {
                $payload['amenities'] = $shop['amenities'];
            }

            DB::table('businesses')->updateOrInsert(
                ['community_id' => $cid, 'name' => $shop['name']],
                $payload + ['owner_id' => $admin->id],
            );
        }

        foreach ($city['rules'] as $rule) {
            DB::table('community_rules')->updateOrInsert(
                ['community_id' => $cid, 'title' => $rule['title']],
                [
                    'created_by' => $admin->id,
                    'category' => $rule['category'],
                    'description' => $rule['body'],
                    'severity' => 'important',
                    'requires_acknowledgment' => true,
                    'status' => 'active',
                    'updated_at' => $now,
                    'created_at' => $now,
                ],
            );
        }

        foreach ($city['posts'] as $post) {
            $author = User::query()->whereRaw('LOWER(email) = ?', [strtolower($post['email'])])->value('id')
                ?? $admin->id;
            DB::table('posts')->updateOrInsert(
                ['community_id' => $cid, 'user_id' => $author, 'body' => $post['body']],
                [
                    'category' => 'general',
                    'image_url' => $this->img($post['image']),
                    'status' => 'approved',
                    'approved_at' => $now,
                    'likes_count' => 0,
                    'comments_count' => 0,
                    'updated_at' => $now,
                    'created_at' => $now,
                ],
            );
        }

        $firstTitle = $city['events'][0]['title'];
        $noticeId = DB::table('notices')->where('community_id', $cid)->where('title', $firstTitle)->value('id');
        if ($noticeId && Schema::hasTable('event_rsvps')) {
            $rsvpEmails = array_merge(array_column(self::RESIDENTS, 'email'), ['syed@gohavena.com']);
            foreach ($rsvpEmails as $email) {
                $userId = User::query()->whereRaw('LOWER(email) = ?', [strtolower($email)])->value('id');
                if (! $userId) {
                    continue;
                }
                DB::table('event_rsvps')->updateOrInsert(
                    ['notice_id' => $noticeId, 'user_id' => $userId],
                    ['status' => 'going', 'updated_at' => $now, 'created_at' => $now],
                );
            }
        }

        $this->seedOffers($community, $admin, $city);
        $this->seedListings($community, $admin, $city);
        $this->seedConversation($cid, $city);
        $this->retireReplacedContent($cid, $city, $now);
    }

    /** @param array<string, mixed> $city */
    private function seedOffers(Community $community, User $admin, array $city): void
    {
        if (! Schema::hasTable('deals')) {
            return;
        }

        $cid = (int) $community->id;
        $now = now();
        $hasBusiness = Schema::hasColumn('deals', 'business_id');

        foreach ($city['offers'] ?? [] as $offer) {
            $businessId = null;
            if ($hasBusiness && ! empty($offer['business'])) {
                $businessId = DB::table('businesses')
                    ->where('community_id', $cid)
                    ->where('name', $offer['business'])
                    ->value('id');
            }

            $payload = [
                'created_by' => $admin->id,
                'vendor' => $offer['vendor'],
                'description' => $offer['description'],
                'type' => 'offer',
                'discount_label' => $offer['label'],
                'original_price' => null,
                'discounted_price' => null,
                'promo_code' => null,
                'category' => $offer['category'],
                'location' => $offer['location'],
                'image_url' => $this->img($offer['image']),
                'is_featured' => (bool) ($offer['featured'] ?? false),
                'status' => 'active',
                'starts_at' => $now->copy()->subDay(),
                'ends_at' => null,
                'updated_at' => $now,
                'created_at' => $now,
            ];
            if ($hasBusiness) {
                $payload['business_id'] = $businessId;
            }

            DB::table('deals')->updateOrInsert(
                ['community_id' => $cid, 'title' => $offer['title']],
                $payload,
            );
        }
    }

    /** @param array<string, mixed> $city */
    private function seedListings(Community $community, User $admin, array $city): void
    {
        if (! Schema::hasTable('listings')) {
            return;
        }

        $cid = (int) $community->id;
        $now = now();

        foreach ($city['listings'] ?? [] as $listing) {
            $userId = User::query()->whereRaw('LOWER(email) = ?', [strtolower($listing['email'])])->value('id');
            if (! $userId) {
                continue;
            }

            $payload = [
                'type' => $listing['type'],
                'price' => $listing['price'],
                'description' => $listing['description'],
                'images' => json_encode(array_values(array_filter([$this->img($listing['image'])]))),
                'status' => 'approved',
                'is_verified' => true,
                'approved_at' => $now,
                'approved_by' => $admin->id,
                'updated_at' => $now,
                'created_at' => $now,
            ];
            if (Schema::hasColumn('listings', 'category')) {
                $payload['category'] = $listing['category'];
            }
            if (Schema::hasColumn('listings', 'condition')) {
                $payload['condition'] = $listing['condition'] ?? null;
            }
            if (Schema::hasColumn('listings', 'location')) {
                $payload['location'] = $listing['location'];
            }

            DB::table('listings')->updateOrInsert(
                ['community_id' => $cid, 'user_id' => $userId, 'title' => $listing['title']],
                $payload,
            );
        }
    }

    /** @param array<string, mixed> $city */
    private function seedConversation(int $cid, array $city): void
    {
        $now = now();
        $emails = array_merge(array_column(self::RESIDENTS, 'email'), ['syed@gohavena.com']);
        $memberIds = User::query()->whereIn('email', $emails)->pluck('id')->map(fn ($id) => (int) $id)->all();

        foreach ($city['comments'] ?? [] as $comment) {
            $postId = DB::table('posts')
                ->where('community_id', $cid)
                ->where('body', $comment['post'])
                ->value('id');
            $userId = User::query()->whereRaw('LOWER(email) = ?', [strtolower($comment['email'])])->value('id');
            if (! $postId || ! $userId || ! Schema::hasTable('post_comments')) {
                continue;
            }

            DB::table('post_comments')->updateOrInsert(
                ['post_id' => $postId, 'user_id' => $userId, 'body' => $comment['body']],
                ['updated_at' => $now, 'created_at' => $now],
            );
        }

        if (! Schema::hasTable('post_likes')) {
            return;
        }

        $posts = DB::table('posts')
            ->where('community_id', $cid)
            ->whereNull('deleted_at')
            ->get(['id', 'user_id']);

        foreach ($posts as $post) {
            foreach ($memberIds as $userId) {
                if ($userId === (int) $post->user_id) {
                    continue;
                }
                DB::table('post_likes')->updateOrInsert(
                    ['user_id' => $userId, 'post_id' => $post->id],
                    ['created_at' => $now],
                );
            }

            DB::table('posts')->where('id', $post->id)->update([
                'likes_count' => DB::table('post_likes')->where('post_id', $post->id)->count(),
                'comments_count' => Schema::hasTable('post_comments')
                    ? DB::table('post_comments')->where('post_id', $post->id)->whereNull('deleted_at')->count()
                    : 0,
            ]);
        }
    }

    /** @return array{0: string, 1: string} */
    private function amenityClock(string $name): array
    {
        return match ($name) {
            'Mutrah Corniche and Souq' => ['09:00:00', '22:00:00'],
            'Sultan Qaboos Grand Mosque' => ['08:00:00', '11:00:00'],
            'Royal Opera House Muscat' => ['10:00:00', '21:00:00'],
            'Souq Waqif' => ['10:00:00', '23:00:00'],
            'Museum of Islamic Art' => ['09:00:00', '19:00:00'],
            'Doha Corniche' => ['16:00:00', '22:00:00'],
            'Katara Cultural Village' => ['16:00:00', '22:00:00'],
            'Al-Balad' => ['16:00:00', '21:30:00'],
            "King Fahd's Fountain" => ['17:30:00', '22:00:00'],
            'Al Rahmah Mosque' => ['16:00:00', '20:00:00'],
            default => ['08:00:00', '20:00:00'],
        };
    }

    private function img(string $key): ?string
    {
        if ($key === '') {
            return null;
        }

        foreach (['gulf', 'seed/gulf'] as $dir) {
            if (is_file(storage_path('app/public/'.$dir.'/'.$key.'.jpg'))) {
                return '/storage/'.$dir.'/'.$key.'.jpg';
            }
        }

        return null;
    }

    /** Archive notices, expire deals, and hide showcase posts this seed no longer publishes. */
    private function retireReplacedContent(int $cid, array $city, $now): void
    {
        $keepNotices = array_merge(
            array_column($city['events'], 'title'),
            array_column($city['notices'], 'title'),
        );
        DB::table('notices')
            ->where('community_id', $cid)
            ->whereNotIn('title', $keepNotices)
            ->update(['status' => 'archived', 'updated_at' => $now]);

        if (Schema::hasTable('deals')) {
            $keepDeals = array_column($city['offers'] ?? [], 'title');
            DB::table('deals')
                ->where('community_id', $cid)
                ->whereNotIn('title', $keepDeals)
                ->where('status', 'active')
                ->update(['status' => 'expired', 'updated_at' => $now]);
        }

        $emails = array_merge(array_column(self::RESIDENTS, 'email'), ['syed@gohavena.com']);
        $memberIds = User::query()->whereIn('email', $emails)->pluck('id')->all();
        if ($memberIds === []) {
            return;
        }

        if (Schema::hasColumn('posts', 'deleted_at')) {
            DB::table('posts')
                ->where('community_id', $cid)
                ->whereIn('user_id', $memberIds)
                ->whereNotIn('body', array_column($city['posts'], 'body'))
                ->whereNull('deleted_at')
                ->update(['deleted_at' => $now, 'updated_at' => $now]);
        }

        if (Schema::hasTable('listings')) {
            $keepListings = array_column($city['listings'] ?? [], 'title');
            DB::table('listings')
                ->where('community_id', $cid)
                ->whereIn('user_id', $memberIds)
                ->whereNotIn('title', $keepListings)
                ->where('status', 'approved')
                ->update(['status' => 'rejected', 'updated_at' => $now]);
        }
    }

    /** @return list<array<string, mixed>> */
    public static function cities(): array
    {
        return [
            [
                'name' => 'Muscat, Oman',
                'country' => 'OM',
                'state_id' => 3572,
                'state_match' => 'muscat',
                'region' => 'state',
                'city' => 'Muscat',
                'address' => 'Al Bahri Road, Mutrah, Muscat, Oman',
                'office' => 'Mutrah Corniche office',
                'timezone' => 'Asia/Muscat',
                'currency' => 'OMR',
                'latitude' => 23.6139,
                'longitude' => 58.5933,
                'population' => 952290,
                'invite' => 'MUSCAT-26',
                'admin_email' => 'admin.muscat@gohavena.com',
                'units' => [
                    'faisalaljamil@gmail.com' => ['Qurum 12', 'Al Khuwair 4'],
                    'zaeem.chaudhry@gmail.com' => ['Mutrah 8', 'Shatti 21'],
                    'syed@gohavena.com' => ['Ruwi 15', 'Ghubrah 3'],
                ],
                'admin_name' => 'Aisha Al Hinai',
                'admin_bio' => 'Community office for Muscat, Oman. The desk is on Al Bahri Road in Mutrah. I post notices for the corniche, the Grand Mosque visiting hours, and neighbour walks.',
                'hero' => 'muscat-mutrah',
                'description' => 'Muscat is the capital of Oman, spread along the Gulf of Oman from Mutrah and Old Muscat to Qurum, Al Khuwair, and Ruwi. This community is the city, not one compound. The National Centre for Statistics and Information counted 952,290 people in Muscat Governorate at the end of 2025. Residents share Mutrah Corniche and Mutrah Souq on Al Bahri Road, the Sultan Qaboos Grand Mosque in Ghubrah, and the Royal Opera House in Shatti Al Qurum.',
                'places' => [
                    ['name' => 'Mutrah Corniche and Souq', 'address' => 'Al Bahri Road, Mutrah', 'hours' => 'Souq 9:00 AM - 1:00 PM and 4:00 PM - 10:00 PM. Closed early afternoon.', 'capacity' => 500, 'image' => 'muscat-p01', 'description' => 'The waterfront walk and the covered souq behind it, on Al Bahri Road in Mutrah. The corniche is the evening walk. The souq is silver, frankincense, and textiles, and it closes in the early afternoon.'],
                    ['name' => 'Sultan Qaboos Grand Mosque', 'address' => 'Sultan Qaboos Street, Al Ghubrah', 'hours' => 'Sat - Thu 8:00 AM - 11:00 AM for visitors. Closed Friday morning.', 'capacity' => 200, 'image' => 'muscat-p07', 'description' => 'The Grand Mosque in Al Ghubrah, open to non-Muslim visitors on Saturday to Thursday morning outside prayer time. Shoulders and legs covered. Women are asked to cover their hair. The visitor entrance is not the prayer entrance.'],
                    ['name' => 'Royal Opera House Muscat', 'address' => 'Shatti Al Qurum, Muscat', 'hours' => 'Plaza 10:00 AM - 9:00 PM. Tickets follow rohmuscat.org.om.', 'capacity' => 1100, 'image' => 'muscat-p10', 'description' => 'The opera house on Sultan Qaboos Street in Shatti Al Qurum. The plaza and the gardens are the public part of the visit. Performances and tours are booked through rohmuscat.org.om, not through this app.'],
                ],
                'events' => [
                    ['title' => 'Mutrah Corniche evening walk', 'date' => '2026-12-06', 'start' => '17:00', 'end' => '18:30', 'capacity' => 40, 'pinned' => true, 'image' => 'muscat-mutrah', 'location' => 'Mutrah Corniche, Al Bahri Road, Muscat', 'body' => "A neighbour walk along the Mutrah Corniche, starting at the souq end of Al Bahri Road at 5:00 PM.\n\nThe pavement is flat and lit, and it is fine for children. We stop at the old watchtower and turn back. This is not a municipality tour and it is not a booking.\n\nThe souq behind the corniche closes in the early afternoon and is open again by the time we meet."],
                    ['title' => 'Grand Mosque visitor morning', 'date' => '2027-01-09', 'start' => '08:15', 'end' => '10:30', 'capacity' => 24, 'pinned' => false, 'image' => 'muscat-mosque-hall', 'location' => 'Sultan Qaboos Grand Mosque visitor entrance, Al Ghubrah', 'body' => "Meet at the visitor entrance of the Sultan Qaboos Grand Mosque at 8:15 AM, before the hall fills.\n\nNon-Muslim visitors are received Saturday to Thursday, 8:00 AM to 11:00 AM. Friday morning is for worship. Cover shoulders and legs. Women should bring a headscarf. The mosque can lend an abaya. Shoes come off before the carpeted halls. The chandelier in the main hall is on the visitor route.\n\nThis is neighbours going in together, not a guided tour."],
                    ['title' => 'Shatti Al Qurum beach walk', 'date' => '2027-02-06', 'start' => '16:30', 'end' => '18:00', 'capacity' => 30, 'pinned' => false, 'image' => 'muscat-p17', 'location' => 'Shatti Al Qurum beach, Muscat', 'body' => "An easy late-afternoon walk on the beach at Shatti Al Qurum, starting on the sand near the Opera House side at 4:30 PM.\n\nFebruary is still a comfortable month for walking in Muscat. Bring water anyway. We stay on the beach and the path, not on Sultan Qaboos Street. Dogs are not part of this walk.\n\nWe finish before maghrib."],
                    ['title' => 'Own table at Bait Al Luban', 'date' => '2026-12-06', 'start' => '19:30', 'end' => '21:30', 'capacity' => 12, 'pinned' => false, 'image' => 'muscat-bait-al-luban', 'location' => 'Bait Al Luban, Al Mina Street, Mutrah', 'body' => "After the corniche walk, anyone who wants dinner can come to Bait Al Luban on Al Mina Street at 7:30 PM.\n\nIt is the old house on the Mutrah Corniche, open from noon to 11:00 PM. The phone published for reservations is +968 2471 1842. Each person pays their own bill. This office is not holding a table and there is no set menu price in the app.\n\nIf the house is full, we do not wait in the road."],
                    ['title' => 'Opera House plaza, no ticket', 'date' => '2027-03-06', 'start' => '17:00', 'end' => '18:30', 'capacity' => 30, 'pinned' => false, 'image' => 'muscat-opera', 'location' => 'Royal Opera House plaza, Shatti Al Qurum', 'body' => "Meet in the public plaza of the Royal Opera House Muscat at 5:00 PM.\n\nThe plaza and the gardens are open to the street. A performance or a tour that evening is ticketed on rohmuscat.org.om and is not part of this meetup. Al Angham, the Omani restaurant inside the house, is a separate booking. Children under 6 are not seated there, and the dress is smart casual.\n\nWe stay in the plaza."],
                ],
                'notices' => [
                    ['title' => 'How this Muscat community works', 'category' => 'general', 'pinned' => false, 'image' => 'muscat-fort', 'location' => 'Al Bahri Road, Mutrah', 'date' => '2026-11-20', 'end_date' => '2027-05-31', 'start' => '08:00', 'end' => '21:00', 'body' => "This community is Muscat as a city: Mutrah, Old Muscat, Qurum, Al Khuwair, Ruwi, and Seeb. It is not one compound.\n\nNotices come from the community office on Al Bahri Road. Mosque hours, souq times, and restaurant details are published facts. A meetup on the calendar is neighbours meeting in a public place. It is not a table the office has reserved, and it is not a ticket.\n\nAl Jalali, the fort in the photograph, is seen from the corniche. It is not an entrance from the souq. The office account is admin.muscat@gohavena.com."],
                    ['title' => 'Grand Mosque visitor hours', 'category' => 'general', 'pinned' => false, 'image' => 'muscat-p08', 'location' => 'Sultan Qaboos Grand Mosque, Al Ghubrah', 'date' => '2026-12-12', 'end_date' => '2027-05-31', 'start' => '08:00', 'end' => '11:00', 'body' => "Non-Muslim visitors are received Saturday to Thursday, 8:00 AM to 11:00 AM. The visitor entrance is not the prayer entrance.\n\nFriday morning is for worship. Do not come for a tour then. Cover shoulders and legs. Women should bring a headscarf. The mosque can lend an abaya. Shoes come off before the carpet. The photograph is an inner room of the mosque. The chandelier is in the main visitor hall, on the same route.\n\nThe neighbour morning on 9 January meets at the visitor entrance at 8:15 AM."],
                    ['title' => 'Mutrah Souq hours, including the afternoon close', 'category' => 'general', 'pinned' => false, 'image' => 'muscat-p06', 'location' => 'Mutrah Souq, Al Bahri Road', 'date' => '2027-01-16', 'end_date' => '2027-05-31', 'start' => '09:00', 'end' => '22:00', 'body' => "The covered souq behind the corniche is generally open from about 9:00 AM to 1:00 PM, then again from about 4:00 PM to 10:00 PM. The middle of the day is a real close, not a quiet hour.\n\nThe corniche walk stays open while the shutters are down. The Sunday walk on 6 December starts at 5:00 PM, after the souq has reopened.\n\nFrankincense, silver, and textiles are sold in the shops. The price is agreed in the shop. This office does not publish a discount or a code."],
                    ['title' => 'Evenings on the corniche and at Shatti', 'category' => 'general', 'pinned' => false, 'image' => 'muscat-p02', 'location' => 'Mutrah Corniche and Shatti Al Qurum', 'date' => '2027-02-20', 'end_date' => '2027-05-31', 'start' => '16:30', 'end' => '21:00', 'body' => "The cooler months are the time for walking in Muscat. The office still sets group walks after 4:30 PM.\n\nBring water. Children and older neighbours set the pace. The Shatti walk on 6 February starts on the beach on the Opera House side. The photograph is Riyam park, inland of that waterfront. Stay off Sultan Qaboos Street.\n\nThe plaza at the opera house is public. A performance that night is ticketed on rohmuscat.org.om and is not part of the walk."],
                    ['title' => 'Royal Opera House: the plaza is the public part', 'category' => 'general', 'pinned' => false, 'image' => 'muscat-p09', 'location' => 'Shatti Al Qurum, Muscat', 'date' => '2027-03-20', 'end_date' => '2027-05-31', 'start' => '10:00', 'end' => '21:00', 'body' => "The plaza and gardens of the Royal Opera House Muscat are open to the street. Performances and tours are booked on rohmuscat.org.om. This app does not sell those tickets and does not discount them.\n\nAl Angham, inside the house, serves lunch and dinner Sunday to Thursday, 12:00 to 4:00 PM and 7:00 to 11:00 PM. Dress is smart casual. Shorts are not worn. Alcohol is not served. Children under 6 are not seated. The published phones are +968 2207 7777 and +968 9436 1111.\n\nThe photograph is the auditorium boxes. The neighbour meetup on 6 March is the plaza only."],
                    ['title' => 'Grand Mosque visitor entrance is closed on Friday mornings', 'category' => 'emergency', 'pinned' => true, 'image' => 'muscat-mosque', 'location' => 'Visitor entrance, Al Ghubrah', 'date' => '2026-11-21', 'end_date' => '2027-05-31', 'start' => '08:00', 'end' => '11:00', 'body' => "The visitor entrance of the Sultan Qaboos Grand Mosque is closed on Friday mornings. Worshippers use the prayer entrance. Do not gather a group at the visitor gate on a Friday.\n\nVisitors are received Saturday to Thursday, 8:00 AM to 11:00 AM. The neighbour group on 9 January, a Saturday, meets there at 8:15 AM.\n\nCover shoulders and legs. Women should bring a headscarf."],
                    ['title' => 'Mutrah Souq shutters are down from about 1:00 to 4:00 PM', 'category' => 'emergency', 'pinned' => false, 'image' => 'muscat-watchtower', 'location' => 'Mutrah Souq, Al Bahri Road', 'date' => '2026-12-26', 'end_date' => '2027-05-31', 'start' => '13:00', 'end' => '16:00', 'body' => "Plan the souq for the morning or for after 4:00 PM. From about 1:00 PM to 4:00 PM the shops are closed. A closed shutter is not a reason to push further in.\n\nThe corniche itself stays open. The Sunday walk turns back at the old watchtower in this photograph. We do not go up into the houses above the shops.\n\nThe walk on 6 December starts at 5:00 PM, after the souq has reopened."],
                    ['title' => 'Corniche walks stay on the pavement', 'category' => 'emergency', 'pinned' => false, 'image' => 'muscat-q03', 'location' => 'Al Bahri Road, Mutrah', 'date' => '2027-01-30', 'end_date' => '2027-05-31', 'start' => '16:00', 'end' => '21:00', 'body' => "Group walks on the Mutrah Corniche meet on the pavement at the souq end of Al Bahri Road. Do not wait in the carriageway, and do not stand the group on the sea wall.\n\nThe road stays open to traffic. Cross where the pavement allows, not between cars.\n\nOn 6 December the start is 5:00 PM. We walk the waterfront and turn back at the watchtower."],
                    ['title' => 'Houses above Mutrah Souq are private', 'category' => 'emergency', 'pinned' => false, 'image' => 'muscat-p15', 'location' => 'Mutrah Souq, Al Bahri Road', 'date' => '2027-02-27', 'end_date' => '2027-05-31', 'start' => '09:00', 'end' => '22:00', 'body' => "The lanes of the souq and the corniche are the visit. The houses above the shops are not.\n\nDo not go up a stair because a door was open. Ask before you photograph a shopkeeper. If someone declines, that is the end of it.\n\nThe photograph is a gate in the old town. Al Jalali fort is the view across the harbour. It is not reached through the souq."],
                    ['title' => 'Shatti walk stays off Sultan Qaboos Street', 'category' => 'emergency', 'pinned' => false, 'image' => 'muscat-ubhar', 'location' => 'Shatti Al Qurum beach, Muscat', 'date' => '2027-03-27', 'end_date' => '2027-05-31', 'start' => '16:00', 'end' => '19:00', 'body' => "The beach walk on 6 February starts at 4:30 PM on the sand at Shatti Al Qurum, the beach in this photograph.\n\nStay on the beach and the path. Do not use Sultan Qaboos Street as the walking route. Ubhar, the Omani restaurant at 52 Bareeq Al Shatti, is on this waterfront. It is not a stop the office has booked.\n\nBring water. We finish before maghrib."],
                ],
                'businesses' => [
                    ['name' => 'Royal Opera House Muscat', 'category' => 'Arts', 'address' => 'Sultan Qaboos Street, Shatti Al Qurum, Muscat', 'hours' => 'According to the published programme', 'website' => 'https://www.rohmuscat.org.om/', 'amenities' => 'Performances, Tours, Plaza', 'image' => 'muscat-opera', 'phone' => null, 'description' => 'The opera house in Shatti Al Qurum. Tickets and tour times are on the house website. The plaza is open to the street.'],
                    ['name' => 'Mutrah Souq', 'category' => 'Market', 'address' => 'Al Bahri Road, Mutrah, Muscat', 'hours' => 'Morning until early afternoon, then late afternoon until about 10:00 PM', 'website' => null, 'amenities' => 'Frankincense, Silver, Textiles', 'image' => 'muscat-mutrah', 'phone' => null, 'description' => 'The covered souq behind Mutrah Corniche. It closes in the heat of the afternoon and opens again before evening. Prices are agreed in the shop, not fixed by this app.'],
                    ['name' => 'Bait Al Luban', 'category' => 'Dining', 'address' => 'Al Mina Street, Mutrah Corniche, Muscat', 'hours' => 'Noon to 11:00 PM', 'website' => null, 'amenities' => 'Omani, Reservations', 'image' => 'bait-al-luban-food', 'phone' => '+968 24711842', 'description' => 'An Omani house on the Mutrah Corniche, about 140 years old, with frankincense in the rooms. Reservations: +968 2471 1842, reservations@baitalluban.com. Open from noon to 11:00 PM. This app does not publish a price or a code.'],
                    ['name' => 'Kargeen', 'category' => 'Dining', 'address' => 'Al Bashair Street, Madinat Sultan Qaboos, Muscat', 'hours' => 'Sat-Thu 8:00 AM to midnight. Friday from noon.', 'website' => null, 'amenities' => 'Garden, Omani', 'image' => 'kargeen-garden', 'phone' => '+968 99253351', 'description' => 'The garden restaurant on Al Bashair Street in Madinat Sultan Qaboos. Saturday to Thursday from 8:00 AM to midnight, Friday from noon. Phone +968 9925 3351. The picture is a garden table of the kind this house is known for. It is not a photograph of the Al Bashair Street room.'],
                    ['name' => 'Rozna', 'category' => 'Dining', 'address' => 'Next to the Ministry of Education, As Seeb, PC 112, Muscat', 'hours' => 'Daily 8:00 AM to 11:30 PM', 'website' => null, 'amenities' => 'Shuwa, Qabuli', 'image' => 'rozna-shuwa', 'phone' => '+968 95522920', 'description' => 'Omani kitchen beside the Ministry of Education in As Seeb. Daily from 8:00 AM to 11:30 PM. Shuwa and qabuli are the dishes people come for. Phones +968 9552 2920 and +968 2202 2220. Email info@roznaoman.com. The picture is that platter. It is not a photograph of the Seeb room.'],
                    ['name' => 'Al Angham', 'category' => 'Dining', 'address' => 'Royal Opera House Muscat, Shatti Al Qurum', 'hours' => 'Sun-Thu 12:00-4:00 PM and 7:00-11:00 PM', 'website' => 'https://www.rohmuscat.org.om/', 'amenities' => 'Omani, Smart casual', 'image' => 'muscat-opera', 'phone' => '+968 22077777', 'description' => 'The Omani restaurant inside the Royal Opera House. Sunday to Thursday, lunch 12:00 to 4:00 PM and dinner 7:00 to 11:00 PM. Smart casual, no shorts, no alcohol, no children under 6. Shuwa, harees, and halwa are on the kitchen. Phones +968 2207 7777 and +968 9436 1111. The photograph is the house, not the dining room.'],
                    ['name' => 'Ubhar', 'category' => 'Dining', 'address' => '52 Bareeq Al Shatti, Shatti Al Qurum, Muscat', 'hours' => 'Lunch and dinner', 'website' => null, 'amenities' => 'Omani', 'image' => 'ubhar-food', 'phone' => null, 'description' => 'Omani restaurant at 52 Bareeq Al Shatti, on the Shatti Al Qurum waterfront, open for lunch and dinner. The photograph is the beach, not the dining room. A phone number is not published here because this office has not confirmed one.'],
                ],
                'rules' => [
                    ['title' => 'Visiting the Grand Mosque', 'category' => 'Conduct', 'body' => "At the Sultan Qaboos Grand Mosque, visitors are received Saturday to Thursday from 8:00 AM to 11:00 AM. Friday morning is for worship, not touring.\n\nCover shoulders and legs. Women cover their hair. Photography of people at prayer needs their agreement. Shoes come off before the carpeted halls."],
                    ['title' => 'Heat on the corniche', 'category' => 'Safety', 'body' => "From May to September, do not plan a long walk on Mutrah Corniche or Qurum beach in the early afternoon. The office posts evening walks for that reason.\n\nCarry water even in the cooler months. Children and older neighbours set the pace."],
                ],
                'posts' => [
                    ['email' => 'faisalaljamil@gmail.com', 'image' => 'muscat-q04', 'body' => 'Sunday 6 December, Mutrah Corniche at 5:00 PM. I will be on the pavement at the souq end of Al Bahri Road. We walk the waterfront and turn back at the old watchtower. I am coming from Qurum. The souq is open again by then.'],
                    ['email' => 'faisalaljamil@gmail.com', 'image' => 'muscat-p18', 'body' => 'Shatti Al Qurum on 6 February starts at 4:30 PM on the beach beside the Opera House. I am coming from Qurum. We stay on the sand, not on Sultan Qaboos Street. Bring water.'],
                    ['email' => 'zaeem.chaudhry@gmail.com', 'image' => 'muscat-p16', 'body' => 'Grand Mosque visitor morning is Saturday 9 January, 8:15 AM at the visitor entrance in Al Ghubrah. Visitors are received Saturday to Thursday, 8:00 to 11:00. Friday morning is for worship. Cover shoulders and legs. Women should bring a headscarf.'],
                    ['email' => 'syed@gohavena.com', 'image' => 'muscat-q01', 'body' => 'I am in Ruwi and in Ghubrah. I will be at the Grand Mosque visitor entrance on 9 January at 8:15 AM. Shoulders covered, and a scarf if you need one. Shoes come off before the carpet. The chandelier hall is on the visitor route.'],
                    ['email' => 'syed@gohavena.com', 'image' => 'muscat-p04', 'body' => 'After the corniche walk on 6 December I am going to Bait Al Luban on Al Mina Street, on my own bill. It is the old house on the corniche, open from noon to 11:00 PM. I am not holding a table. The reservations phone is +968 2471 1842 if you want your own booking.'],
                ],
                'comments' => [
                    ['post' => 'I am in Ruwi and in Ghubrah. I will be at the Grand Mosque visitor entrance on 9 January at 8:15 AM. Shoulders covered, and a scarf if you need one. Shoes come off before the carpet. The chandelier hall is on the visitor route.', 'email' => 'faisalaljamil@gmail.com', 'body' => 'I will be at the visitor entrance. I am coming from Qurum, and I will have a scarf with me.'],
                    ['post' => 'I am in Ruwi and in Ghubrah. I will be at the Grand Mosque visitor entrance on 9 January at 8:15 AM. Shoulders covered, and a scarf if you need one. Shoes come off before the carpet. The chandelier hall is on the visitor route.', 'email' => 'zaeem.chaudhry@gmail.com', 'body' => 'The mosque lends abayas. A scarf is still worth bringing if you have one. Friday morning is not a visiting day.'],
                    ['post' => 'After the corniche walk on 6 December I am going to Bait Al Luban on Al Mina Street, on my own bill. It is the old house on the corniche, open from noon to 11:00 PM. I am not holding a table. The reservations phone is +968 2471 1842 if you want your own booking.', 'email' => 'zaeem.chaudhry@gmail.com', 'body' => 'I will come if the walk finishes on time. I am paying for my own plate. If they are full, I will not wait in the road.'],
                    ['post' => 'Sunday 6 December, Mutrah Corniche at 5:00 PM. I will be on the pavement at the souq end of Al Bahri Road. We walk the waterfront and turn back at the old watchtower. I am coming from Qurum. The souq is open again by then.', 'email' => 'syed@gohavena.com', 'body' => 'I will be on the pavement, not in the carriageway. Coming from Ruwi after the souq reopens.'],
                    ['post' => 'Shatti Al Qurum on 6 February starts at 4:30 PM on the beach beside the Opera House. I am coming from Qurum. We stay on the sand, not on Sultan Qaboos Street. Bring water.', 'email' => 'zaeem.chaudhry@gmail.com', 'body' => 'I can do 4:30. I will stay on the beach path. Ubhar is on that waterfront, but I am not booking it.'],
                ],
                'offers' => [
                    ['title' => 'Bait Al Luban', 'vendor' => 'Bait Al Luban', 'business' => 'Bait Al Luban', 'label' => 'Omani', 'category' => 'Dining', 'location' => 'Al Mina Street, Mutrah Corniche', 'image' => 'bait-al-luban-food', 'featured' => true, 'description' => 'The old Omani house on Al Mina Street, on the Mutrah Corniche. Frankincense in the rooms, and the building is about 140 years old. Open from noon to 11:00 PM. Reservations +968 2471 1842, reservations@baitalluban.com. The picture is the meal. The house itself is on the corniche. There is no code and no set price in this app. You pay the house.'],
                    ['title' => 'Ubhar', 'vendor' => 'Ubhar', 'business' => 'Ubhar', 'label' => 'Omani', 'category' => 'Dining', 'location' => '52 Bareeq Al Shatti, Shatti Al Qurum', 'image' => 'ubhar-food', 'featured' => false, 'description' => 'Omani restaurant at 52 Bareeq Al Shatti, on the Shatti Al Qurum waterfront, open for lunch and dinner. The picture is a grilled fish plate, not the beach and not the dining room. A phone is not listed because this office has not confirmed one. No code.'],
                    ['title' => 'Al Angham', 'vendor' => 'Al Angham', 'business' => 'Al Angham', 'label' => 'Omani', 'category' => 'Dining', 'location' => 'Royal Opera House, Shatti Al Qurum', 'image' => 'al-angham-food', 'featured' => false, 'description' => 'Omani restaurant inside the Royal Opera House. Sunday to Thursday, 12:00 to 4:00 PM and 7:00 to 11:00 PM. Smart casual, no shorts, no alcohol, and no children under 6. Shuwa, harees, and halwa are the kitchen. Phones +968 2207 7777 and +968 9436 1111. The picture is shuwa, harees, and halwa, not the opera house. Book with the restaurant. This is not a ticket discount.'],
                    ['title' => 'Kargeen', 'vendor' => 'Kargeen', 'business' => 'Kargeen', 'label' => 'Omani', 'category' => 'Dining', 'location' => 'Al Bashair Street, Madinat Sultan Qaboos', 'image' => 'kargeen-garden', 'featured' => false, 'description' => 'Garden restaurant on Al Bashair Street in Madinat Sultan Qaboos. Saturday to Thursday from 8:00 AM to midnight. Friday from noon. Phone +968 9925 3351. The picture is a garden table of the kind this house is known for, not a photograph of the Al Bashair Street room. No code and no invented price.'],
                    ['title' => 'Rozna', 'vendor' => 'Rozna', 'business' => 'Rozna', 'label' => 'Omani', 'category' => 'Dining', 'location' => 'As Seeb, beside the Ministry of Education', 'image' => 'rozna-shuwa', 'featured' => false, 'description' => 'Omani kitchen beside the Ministry of Education in As Seeb, PC 112. Open daily from 8:00 AM to 11:30 PM. People go for shuwa and qabuli. Phones +968 9552 2920 and +968 2202 2220. Email info@roznaoman.com. The picture is that platter, not a photograph of the Seeb room. There is no code.'],
                ],
                'listings' => [
                    ['email' => 'faisalaljamil@gmail.com', 'type' => 'wanted', 'title' => 'Lift from Qurum to Mutrah on 6 December', 'price' => null, 'category' => 'Transport', 'condition' => null, 'location' => 'Qurum, Muscat', 'image' => 'muscat-p03', 'description' => 'I am at Qurum 12. The walk starts at the souq end of Al Bahri Road at 5:00 PM on 6 December. A lift one way is enough. I will wait on the pavement, not in the road.'],
                    ['email' => 'zaeem.chaudhry@gmail.com', 'type' => 'service', 'title' => 'Spare scarf for the Grand Mosque morning', 'price' => 0, 'category' => 'Help', 'condition' => null, 'location' => 'Al Ghubrah, Muscat', 'image' => 'muscat-p11', 'description' => 'One extra scarf for the visitor morning on 9 January. It is not a sale. Collect it at the visitor entrance at 8:15 AM. The mosque also lends abayas.'],
                    ['email' => 'syed@gohavena.com', 'type' => 'wanted', 'title' => 'Share a taxi from Ruwi to the Grand Mosque', 'price' => null, 'category' => 'Transport', 'condition' => null, 'location' => 'Ruwi, Muscat', 'image' => 'muscat-p12', 'description' => 'From Ruwi 15 to the visitor entrance before 8:15 AM on 9 January. Happy to split the fare. Friday morning is not a visiting day, so this is the Saturday.'],
                    ['email' => 'faisalaljamil@gmail.com', 'type' => 'wanted', 'title' => 'Lift from Qurum to Shatti beach on the 5th', 'price' => null, 'category' => 'Transport', 'condition' => null, 'location' => 'Qurum, Muscat', 'image' => 'muscat-p05', 'description' => 'From Qurum 12 to the beach beside the Opera House before 4:30 PM on 6 February. One way is enough. We are walking the sand, not the street.'],
                    ['email' => 'syed@gohavena.com', 'type' => 'wanted', 'title' => 'Share a taxi from Ruwi to Bait Al Luban', 'price' => null, 'category' => 'Transport', 'condition' => null, 'location' => 'Ruwi, Muscat', 'image' => 'muscat-q02', 'description' => 'From Ruwi 15 to Al Mina Street after the corniche walk on 6 December, for dinner at Bait Al Luban. Happy to split the fare. Each person pays their own bill at the house.'],
                ],
            ],
            [
                'name' => 'Doha, Qatar',
                'country' => 'QA',
                'state_id' => 3911,
                'state_match' => 'doha',
                'region' => 'state',
                'city' => 'Doha',
                'address' => 'Souq Waqif, Al Souq Street, Doha, Qatar',
                'office' => 'Souq Waqif office',
                'timezone' => 'Asia/Qatar',
                'currency' => 'QAR',
                'latitude' => 25.2867,
                'longitude' => 51.5333,
                'population' => 1186023,
                'invite' => 'DOHA-26',
                'admin_email' => 'admin.doha@gohavena.com',
                'units' => [
                    'faisalaljamil@gmail.com' => ['West Bay 2104', 'Msheireb 906'],
                    'zaeem.chaudhry@gmail.com' => ['Pearl 1208', 'West Bay 1802'],
                    'syed@gohavena.com' => ['Al Sadd 22', 'Pearl 508'],
                ],
                'admin_name' => 'Noura Al Kuwari',
                'admin_bio' => 'Community office for Doha, Qatar. The desk is at Souq Waqif. I post the corniche walks, museum hours, and Katara meetups.',
                'hero' => 'doha-souq',
                'description' => 'Doha is the capital of Qatar, on the bay between West Bay, Msheireb, and the corniche. This community is the city. The 2020 census counted 1,186,023 people in Doha municipality. Residents share Souq Waqif, the Museum of Islamic Art at the end of the corniche, the National Museum of Qatar, and Katara Cultural Village.',
                'places' => [
                    ['name' => 'Souq Waqif', 'address' => 'Al Souq Street, Doha', 'hours' => 'Shops 10:00 AM - 12:00 PM and 3:00 PM - 11:00 PM.', 'capacity' => 800, 'image' => 'doha-souq', 'description' => 'The restored market between Al Souq Street and the corniche. Spice, falcon, and textile shops, and the evening crowds after the afternoon break.'],
                    ['name' => 'Museum of Islamic Art', 'address' => 'The Corniche, Doha', 'hours' => 'Park 9:00 AM - 7:00 PM. Galleries: see mia.org.qa.', 'capacity' => 300, 'image' => 'doha-mia-building', 'description' => 'I. M. Pei’s museum on its own island at the south end of the Doha Corniche. The park around the building is open when the galleries are not. Admission and the weekly closed day are on mia.org.qa.'],
                    ['name' => 'Doha Corniche', 'address' => 'Corniche Street, Doha', 'hours' => 'Best walked 4:00 PM - 10:00 PM.', 'capacity' => 1000, 'image' => 'doha-skyline', 'description' => 'The waterfront road from Souq Waqif to the Museum of Islamic Art, with West Bay across the bay. The evening walk is the usable one from late spring through early autumn.'],
                    ['name' => 'Katara Cultural Village', 'address' => 'Al Gassar, Doha', 'hours' => 'Plazas 4:00 PM - 10:00 PM. Shows on katara.net are ticketed.', 'capacity' => 400, 'image' => 'doha-katara', 'description' => 'The cultural village at Al Gassar. The amphitheatre plaza, the pigeon towers, and the waterfront are public. A performance that night is ticketed by Katara and is not included in a neighbour walk.'],
                ],
                'events' => [
                    ['title' => 'Souq Waqif evening', 'date' => '2027-01-11', 'start' => '17:30', 'end' => '19:30', 'capacity' => 36, 'pinned' => true, 'image' => 'doha-souq', 'location' => 'Souq Waqif main gate, Al Souq Street, Doha', 'body' => "Meet at the main gate of Souq Waqif at 5:30 PM and walk the spice and textile lanes, then out to the corniche side.\n\nThe souq is busiest after the afternoon break. Keep children beside you in the falcon market.\n\nThis is neighbours, not a tour booking."],
                    ['title' => 'Museum of Islamic Art park walk', 'date' => '2027-02-14', 'start' => '16:00', 'end' => '17:30', 'capacity' => 28, 'pinned' => false, 'image' => 'doha-mia', 'location' => 'Museum of Islamic Art park, Doha Corniche', 'body' => "A walk in the park around the Museum of Islamic Art, starting at the corniche approach at 4:00 PM.\n\nThe park does not require a museum ticket. If you want the galleries, check the closed day and book on mia.org.qa before you come. We will not wait inside a ticket line.\n\nWest Bay is the view across the water."],
                    ['title' => 'Katara waterfront meetup', 'date' => '2027-03-14', 'start' => '17:00', 'end' => '18:30', 'capacity' => 30, 'pinned' => false, 'image' => 'doha-katara', 'location' => 'Katara Cultural Village amphitheatre plaza, Doha', 'body' => "Meet on the amphitheatre plaza at Katara Cultural Village at 5:00 PM.\n\nKatara is open to the public. A performance that night, if there is one, is ticketed by Katara and is not included. We walk the waterfront. The photograph on the plaza notice is the amphitheatre. Details of what is on are at katara.net.\n\nThis is neighbours, not a ticket."],
                    ['title' => 'Own table at Parisa', 'date' => '2027-01-11', 'start' => '20:00', 'end' => '22:00', 'capacity' => 10, 'pinned' => false, 'image' => 'doha-p17', 'location' => 'Parisa, Al Ahmed Street, Souq Waqif', 'body' => "After the souq walk, anyone who wants dinner can come to Parisa on Al Ahmed Street at 8:00 PM.\n\nIt is a Persian kitchen in Souq Waqif. The published hours are 1:00 to 4:00 PM and 6:00 to 11:00 PM. Kaseh kebab is the Friday and Saturday dish. The phone is +974 4441 1494. Each person pays their own bill. This office is not holding a table.\n\nThe photograph is the dhow harbour beside the souq, not the dining room."],
                    ['title' => 'Outside the National Museum of Qatar', 'date' => '2027-04-11', 'start' => '16:30', 'end' => '18:00', 'capacity' => 24, 'pinned' => false, 'image' => 'doha-nmoq', 'location' => 'National Museum of Qatar, Museum Park Street', 'body' => "Meet outside the National Museum of Qatar at 4:30 PM. The building in the photograph is Jean Nouvel's desert rose.\n\nThe galleries are ticketed on nmoq.org.qa. This meetup does not include a ticket, and we will not join the ticket line. Jiwan, the restaurant in the museum, is booked with the museum, not with this office.\n\nWe stay on the public approach."],
                ],
                'notices' => [
                    ['title' => 'How this Doha community works', 'category' => 'general', 'pinned' => false, 'image' => 'doha-skyline', 'location' => 'Souq Waqif, Doha', 'date' => '2026-11-20', 'end_date' => '2027-05-31', 'start' => '08:00', 'end' => '22:00', 'body' => "This community is Doha municipality: West Bay, the corniche, Msheireb, Al Sadd, and the Pearl. It is not one tower.\n\nThe 2020 census figure we use is 1,186,023. Notices from this office are on Souq Waqif time. A calendar item is neighbours meeting in a public place. It is not a reserved table and it is not a museum ticket.\n\nThe photograph is West Bay across the bay. The office account is admin.doha@gohavena.com."],
                    ['title' => 'Souq Waqif hours, including the afternoon break', 'category' => 'general', 'pinned' => false, 'image' => 'doha-p04', 'location' => 'Al Souq Street, Doha', 'date' => '2026-12-15', 'end_date' => '2027-05-31', 'start' => '10:00', 'end' => '23:00', 'body' => "Shops in Souq Waqif generally open from about 10:00 AM to 12:00 PM, then again from about 3:00 PM to 11:00 PM. The early afternoon is a close.\n\nThe lanes can still be walked while the shops are shut. The neighbour evening on 11 January meets at the main gate at 5:30 PM, after the shops have reopened.\n\nParisa is on Al Ahmed Street inside the souq. Prices are agreed in the shop. This office does not publish a coupon."],
                    ['title' => 'The museum building and the park ticket are different', 'category' => 'general', 'pinned' => false, 'image' => 'doha-mia-building', 'location' => 'Museum of Islamic Art, Doha Corniche', 'date' => '2027-01-19', 'end_date' => '2027-05-31', 'start' => '09:00', 'end' => '19:00', 'body' => "The photograph is I. M. Pei's Museum of Islamic Art, on its own island at the end of the corniche. The park around it does not need a gallery ticket. The 14 February walk is that park, starting at 4:00 PM.\n\nGallery hours and the weekly closed day are on mia.org.qa. IDAM, Alain Ducasse's restaurant, is on the fifth floor. Book it with the restaurant. This office is not publishing hours or a phone it has not confirmed, and it is not a discount on a gallery ticket."],
                    ['title' => 'Katara plazas are open. Shows are ticketed.', 'category' => 'general', 'pinned' => false, 'image' => 'doha-p11', 'location' => 'Katara Cultural Village, Al Gassar', 'date' => '2027-02-16', 'end_date' => '2027-05-31', 'start' => '16:00', 'end' => '22:00', 'body' => "The amphitheatre plaza, the pigeon towers, and the waterfront at Katara are public. A performance is listed and ticketed on katara.net and is not included in a neighbour walk.\n\nThe photograph is the mosque at Katara. The meetup on 14 March is 5:00 PM on the amphitheatre plaza. Come for the walk. Buy a ticket only if you want the show.\n\nFrom May through September this office does not set a midday walk here. March at 5:00 PM is the right hour."],
                    ['title' => 'National Museum of Qatar is ticketed inside', 'category' => 'general', 'pinned' => false, 'image' => 'doha-p10', 'location' => 'Museum Park Street, Doha', 'date' => '2027-03-16', 'end_date' => '2027-05-31', 'start' => '09:00', 'end' => '19:00', 'body' => "The photograph is the desert-rose building of the National Museum of Qatar, designed by Jean Nouvel.\n\nTickets and opening days are on nmoq.org.qa. The meetup on 11 April is outside the building and does not include a ticket. Jiwan, the restaurant in the museum, is booked with the museum. This office will not invent a menu or a phone.\n\nWe do not join the ticket line as a group."],
                    ['title' => 'Souq Waqif shops close from about noon to 3:00 PM', 'category' => 'emergency', 'pinned' => true, 'image' => 'doha-p03', 'location' => 'Souq Waqif main gate, Al Souq Street', 'date' => '2026-11-22', 'end_date' => '2027-05-31', 'start' => '12:00', 'end' => '15:00', 'body' => "Most shops in Souq Waqif close around noon and open again from about 3:00 PM. You can walk the lanes during the break. Do not expect a counter to be open, and do not treat a closed shutter as a reason to push further in.\n\nMonday 11 January we meet at the main gate at 5:30 PM, after the shops have reopened. Friday afternoon traffic from West Bay is heavier. Do not cut that meeting fine."],
                    ['title' => 'The park walk does not enter the museum queue', 'category' => 'emergency', 'pinned' => false, 'image' => 'doha-mia-park', 'location' => 'Museum of Islamic Art park, Doha Corniche', 'date' => '2026-12-29', 'end_date' => '2027-05-31', 'start' => '16:00', 'end' => '18:00', 'body' => "The walk on 14 February is the park around the Museum of Islamic Art, not the galleries. It starts at 4:00 PM at the corniche approach.\n\nThe photograph is Richard Serra's sculpture 7, which stands in that park. The park does not need a ticket. Gallery hours and the weekly closed day are on mia.org.qa and they change. Book a gallery visit yourself. The group will not enter the ticket line."],
                    ['title' => 'Stay on the corniche promenade, off the road', 'category' => 'emergency', 'pinned' => false, 'image' => 'doha-corniche-walk', 'location' => 'Doha Corniche', 'date' => '2027-01-26', 'end_date' => '2027-05-31', 'start' => '16:00', 'end' => '22:00', 'body' => "Corniche walks stay on the sea-side promenade in this photograph. Do not use the carriageway. Bicycles stay in the marked path where there is one.\n\nAl Mourjan sits on the corniche side of Souq Waqif, in Al Jasra Building 20. It is open from 8:00 AM to midnight. The phone is +974 4436 5539. A walk is not a booking there.\n\nCross only where the pavement allows."],
                    ['title' => 'A Katara show is seated. Do not block the amphitheatre.', 'category' => 'emergency', 'pinned' => false, 'image' => 'doha-katara-birds', 'location' => 'Katara amphitheatre, Al Gassar', 'date' => '2027-02-23', 'end_date' => '2027-05-31', 'start' => '16:00', 'end' => '22:00', 'body' => "The photograph is the view from Katara's amphitheatre. If a performance is seating, that hall is for ticket holders. Do not stand the group in the aisles or in front of people who have paid.\n\nThe 14 March meetup is the public plaza at 5:00 PM. What is on that night is listed at katara.net. Buy a ticket only if you want the show.\n\nThe pigeon towers and the waterfront stay public."],
                    ['title' => 'The Pearl beach in this photo is a hotel beach', 'category' => 'emergency', 'pinned' => false, 'image' => 'doha-pearl', 'location' => 'The Pearl, Doha', 'date' => '2027-03-23', 'end_date' => '2027-05-31', 'start' => '08:00', 'end' => '22:00', 'body' => "The beach in this photograph is at the Marsa Malaz Kempinski on the Pearl. It is a hotel beach. This office does not meet there, and it is not a public walk.\n\nNeighbours on the Pearl meet the group at Souq Waqif or at the museum park, not on that sand. If you are coming from Pearl 1208 or Pearl 508, leave time for the bridge.\n\nDo not treat a hotel beach as the community beach."],
                ],
                'businesses' => [
                    ['name' => 'Museum of Islamic Art', 'category' => 'Museum', 'address' => 'Museum of Islamic Art, Doha Corniche', 'hours' => 'See mia.org.qa', 'website' => 'https://mia.org.qa/', 'amenities' => 'Galleries, Park, Shop', 'image' => 'doha-mia-building', 'phone' => null, 'description' => 'The museum on the corniche. Gallery hours and the weekly closed day are published on the museum site. The park around the building is separate from gallery admission.'],
                    ['name' => 'Katara Cultural Village', 'category' => 'Arts', 'address' => 'Al Gassar, Doha', 'hours' => 'Public areas open through the day and evening', 'website' => 'https://www.katara.net/', 'amenities' => 'Amphitheatre, Galleries, Waterfront', 'image' => 'doha-katara', 'phone' => null, 'description' => 'The cultural village at Al Gassar. Public plazas are open. Performances are listed and ticketed by Katara.'],
                    ['name' => 'National Museum of Qatar', 'category' => 'Museum', 'address' => 'Museum Park Street, Doha', 'hours' => 'See nmoq.org.qa', 'website' => 'https://nmoq.org.qa/', 'amenities' => 'Galleries, Desert rose building', 'image' => 'doha-nmoq', 'phone' => null, 'description' => 'The national museum near the corniche, in Jean Nouvel\'s desert-rose building. Tickets and opening days are on nmoq.org.qa.'],
                    ['name' => 'Parisa', 'category' => 'Dining', 'address' => 'Al Ahmed Street, Souq Waqif, Doha', 'hours' => '1:00-4:00 PM and 6:00-11:00 PM', 'website' => null, 'amenities' => 'Persian, Kaseh kebab', 'image' => 'parisa-food', 'phone' => '+974 44411494', 'description' => 'Persian restaurant on Al Ahmed Street in Souq Waqif. Open 1:00 to 4:00 PM and 6:00 to 11:00 PM. Kaseh kebab is served on Friday and Saturday. Phone +974 4441 1494. The picture is a kebab plate, not the dining room. No code.'],
                    ['name' => 'Al Mourjan', 'category' => 'Dining', 'address' => 'Al Jasra Building 20, Souq Waqif, Doha', 'hours' => '8:00 AM to midnight', 'website' => null, 'amenities' => 'Waterfront', 'image' => 'mourjan-food', 'phone' => '+974 44365539', 'description' => 'On the corniche side of Souq Waqif, in Al Jasra Building 20. Open from 8:00 AM to midnight. Phone +974 4436 5539. The picture is a grilled fish plate, not the dining room. No code.'],
                    ['name' => 'Damasca One', 'category' => 'Dining', 'address' => 'Souq Waqif, Doha', 'hours' => 'Through the day and late', 'website' => null, 'amenities' => 'Syrian', 'image' => 'damasca-mezze', 'phone' => '+974 44759089', 'description' => 'Syrian kitchen in Souq Waqif, open through the day and late. Phone +974 4475 9089. The picture is a mezze table. It is not a photograph of the Souq Waqif room. No code and no invented price.'],
                    ['name' => 'IDAM', 'category' => 'Dining', 'address' => 'Fifth floor, Museum of Islamic Art, Doha', 'hours' => 'Book ahead', 'website' => 'https://mia.org.qa/', 'amenities' => 'Alain Ducasse', 'image' => 'idam-food', 'phone' => null, 'description' => 'Alain Ducasse\'s restaurant on the fifth floor of the Museum of Islamic Art. Book ahead. This office has not confirmed a phone or a daily hour, so neither is printed. The picture is a plated dish, not the building. No code.'],
                    ['name' => 'Jiwan', 'category' => 'Dining', 'address' => 'National Museum of Qatar, Doha', 'hours' => 'Book ahead', 'website' => 'https://nmoq.org.qa/', 'amenities' => 'Museum restaurant', 'image' => 'jiwan-food', 'phone' => null, 'description' => 'The restaurant at the National Museum of Qatar. Book ahead. This office has not confirmed a menu or a phone, so neither is printed. The picture is a rice plate, not the building. No code.'],
                ],
                'rules' => [
                    ['title' => 'Souq and corniche', 'category' => 'Conduct', 'body' => "In Souq Waqif, ask before you photograph a shopkeeper or a falconer. Do not block a lane for a photo.\n\nOn the corniche, stay off the road. The evening walk is on the sea side. Bicycles stay in the marked path where there is one."],
                    ['title' => 'Summer evenings', 'category' => 'Safety', 'body' => "From May through September the office sets walks after 4:30 PM. Midday on the corniche and at Katara is not a group walk.\n\nBring water. If a child or an older neighbour needs to stop, the group stops."],
                ],
                'posts' => [
                    ['email' => 'faisalaljamil@gmail.com', 'image' => 'doha-p18', 'body' => 'Souq Waqif on Monday 11 January, 5:30 PM at the main gate on Al Souq Street. We walk the spice and textile lanes and come out on the corniche side. The shops have reopened by then, after the noon break. I am coming from West Bay.'],
                    ['email' => 'faisalaljamil@gmail.com', 'image' => 'doha-p12', 'body' => 'Katara on 14 March, amphitheatre plaza at 5:00 PM. I am coming from West Bay. The plaza is public. A show that night, if there is one, is ticketed on katara.net and is not part of the walk.'],
                    ['email' => 'zaeem.chaudhry@gmail.com', 'image' => 'doha-p08', 'body' => 'Museum of Islamic Art park on 14 February at 4:00 PM, at the corniche approach. The park does not need a gallery ticket. The Serra sculpture is in the park. If you want the galleries, check the closed day on mia.org.qa yourself. I will not wait in that line.'],
                    ['email' => 'syed@gohavena.com', 'image' => 'doha-p14', 'body' => 'I am in Al Sadd and on the Pearl. Souq Waqif on 11 January, I will be at the main gate at 5:30 PM. The hotel beach on the Pearl is not the meeting point. I am coming across to the souq.'],
                    ['email' => 'zaeem.chaudhry@gmail.com', 'image' => 'doha-p06', 'body' => 'I walked the corniche promenade from the souq toward the museum. West Bay is across the water. On the 29th I will be at the park at 4:00 PM. Al Mourjan is on that corniche side of the souq if anyone eats there on their own bill. I am not booking it.'],
                ],
                'comments' => [
                    ['post' => 'I am in Al Sadd and on the Pearl. Souq Waqif on 11 January, I will be at the main gate at 5:30 PM. The hotel beach on the Pearl is not the meeting point. I am coming across to the souq.', 'email' => 'zaeem.chaudhry@gmail.com', 'body' => 'I will come from the Pearl as well. The spice lane gets crowded, so we should stay together at the gate first.'],
                    ['post' => 'I am in Al Sadd and on the Pearl. Souq Waqif on 11 January, I will be at the main gate at 5:30 PM. The hotel beach on the Pearl is not the meeting point. I am coming across to the souq.', 'email' => 'faisalaljamil@gmail.com', 'body' => 'Main gate at 5:30. I am in West Bay 2104 if anyone is already on that side of the bay.'],
                    ['post' => 'Museum of Islamic Art park on 14 February at 4:00 PM, at the corniche approach. The park does not need a gallery ticket. The Serra sculpture is in the park. If you want the galleries, check the closed day on mia.org.qa yourself. I will not wait in that line.', 'email' => 'syed@gohavena.com', 'body' => 'I will be at the corniche approach at 4:00. I am not buying a gallery ticket that day.'],
                    ['post' => 'Katara on 14 March, amphitheatre plaza at 5:00 PM. I am coming from West Bay. The plaza is public. A show that night, if there is one, is ticketed on katara.net and is not part of the walk.', 'email' => 'zaeem.chaudhry@gmail.com', 'body' => 'Plaza at 5:00. If a show is seating, I will stay out of the hall.'],
                    ['post' => 'Souq Waqif on Monday 11 January, 5:30 PM at the main gate on Al Souq Street. We walk the spice and textile lanes and come out on the corniche side. The shops have reopened by then, after the noon break. I am coming from West Bay.', 'email' => 'syed@gohavena.com', 'body' => 'I can do 5:30. After the walk I may eat at Parisa on Al Ahmed Street, on my own bill. I am not holding a table.'],
                ],
                'offers' => [
                    ['title' => 'Parisa', 'vendor' => 'Parisa', 'business' => 'Parisa', 'label' => 'Persian', 'category' => 'Dining', 'location' => 'Al Ahmed Street, Souq Waqif', 'image' => 'parisa-food', 'featured' => true, 'description' => 'Persian restaurant on Al Ahmed Street in Souq Waqif. Open 1:00 to 4:00 PM and 6:00 to 11:00 PM. Kaseh kebab is the Friday and Saturday dish. Phone +974 4441 1494. The picture is a kebab plate, not a photograph of the dining room. You pay the house. There is no code.'],
                    ['title' => 'Al Mourjan', 'vendor' => 'Al Mourjan', 'business' => 'Al Mourjan', 'label' => 'Waterfront', 'category' => 'Dining', 'location' => 'Al Jasra Building 20, Souq Waqif', 'image' => 'mourjan-food', 'featured' => false, 'description' => 'On the corniche side of Souq Waqif, Al Jasra Building 20. Open from 8:00 AM to midnight. Phone +974 4436 5539. The picture is a grilled fish plate, not a photograph of the dining room. No code.'],
                    ['title' => 'Damasca One', 'vendor' => 'Damasca One', 'business' => 'Damasca One', 'label' => 'Syrian', 'category' => 'Dining', 'location' => 'Souq Waqif, Doha', 'image' => 'damasca-mezze', 'featured' => false, 'description' => 'Syrian kitchen in Souq Waqif, open through the day and into the evening. Phone +974 4475 9089. The picture is a mezze table, not a photograph of the Souq Waqif room. No code and no set price.'],
                    ['title' => 'IDAM', 'vendor' => 'IDAM', 'business' => 'IDAM', 'label' => 'French', 'category' => 'Dining', 'location' => 'Fifth floor, Museum of Islamic Art', 'image' => 'idam-food', 'featured' => false, 'description' => 'Alain Ducasse\'s restaurant on the fifth floor of the Museum of Islamic Art. Book ahead. This office has not confirmed today\'s hours or a phone, so neither is printed. The picture is a plated dish, not the building. This is not a gallery discount and there is no code.'],
                    ['title' => 'Jiwan', 'vendor' => 'Jiwan', 'business' => 'Jiwan', 'label' => 'Qatari', 'category' => 'Dining', 'location' => 'National Museum of Qatar', 'image' => 'jiwan-food', 'featured' => false, 'description' => 'The restaurant at the National Museum of Qatar. Book ahead. This office has not confirmed a menu or a phone, so neither is printed. The picture is a rice plate, not the building. A museum ticket is separate. No code.'],
                ],
                'listings' => [
                    ['email' => 'faisalaljamil@gmail.com', 'type' => 'wanted', 'title' => 'Lift from West Bay to Souq Waqif on 11 January', 'price' => null, 'category' => 'Transport', 'condition' => null, 'location' => 'West Bay, Doha', 'image' => 'doha-p02', 'description' => 'I am at West Bay 2104. The walk meets at the Souq Waqif main gate at 5:30 PM on 11 January. A lift one way is enough. Friday traffic across the bay is slower, so Monday is the easier evening.'],
                    ['email' => 'zaeem.chaudhry@gmail.com', 'type' => 'wanted', 'title' => 'Share a taxi from the Pearl to the museum park', 'price' => null, 'category' => 'Transport', 'condition' => null, 'location' => 'The Pearl, Doha', 'image' => 'doha-p07', 'description' => 'From Pearl 1208 to the Museum of Islamic Art park before 4:00 PM on 14 February. Happy to split the fare. The meeting point is the corniche approach, not the gallery door.'],
                    ['email' => 'syed@gohavena.com', 'type' => 'service', 'title' => 'Walk from Al Sadd to the souq gate', 'price' => 0, 'category' => 'Help', 'condition' => null, 'location' => 'Al Sadd, Doha', 'image' => 'doha-p15', 'description' => 'I am at Al Sadd 22. If you are passing on the way to Souq Waqif on 11 January, I will walk the last part with you to the main gate for 5:30 PM. Not a paid service.'],
                    ['email' => 'faisalaljamil@gmail.com', 'type' => 'wanted', 'title' => 'Lift from West Bay to Katara on 14 March', 'price' => null, 'category' => 'Transport', 'condition' => null, 'location' => 'West Bay, Doha', 'image' => 'doha-p16', 'description' => 'From West Bay 2104 to the Katara amphitheatre plaza before 5:00 PM on 14 March. One way is enough. The plaza is the meeting point. A show ticket is separate.'],
                    ['email' => 'syed@gohavena.com', 'type' => 'wanted', 'title' => 'Share a taxi to the National Museum on 11 April', 'price' => null, 'category' => 'Transport', 'condition' => null, 'location' => 'Al Sadd, Doha', 'image' => 'doha-p09', 'description' => 'From Al Sadd 22 to the outside of the National Museum of Qatar before 4:30 PM on 11 April. Happy to split the fare. We are not buying gallery tickets as a group.'],
                ],
            ],
            [
                'name' => 'Jeddah, Saudi Arabia',
                'country' => 'SA',
                'state_id' => 4086,
                'state_match' => ['makk', 'mecc'],
                'region' => 'city',
                'city' => 'Jeddah',
                'address' => 'Al-Dahab Street, Al-Balad, Jeddah, Saudi Arabia',
                'office' => 'Al-Balad office',
                'timezone' => 'Asia/Riyadh',
                'currency' => 'SAR',
                'latitude' => 21.4858,
                'longitude' => 39.1925,
                'population' => 3751722,
                'invite' => 'JEDDAH-26',
                'admin_email' => 'admin.jeddah@gohavena.com',
                'units' => [
                    'faisalaljamil@gmail.com' => ['Al-Hamra 1502', 'Al-Zahra 804'],
                    'zaeem.chaudhry@gmail.com' => ['Al-Rawdah 18', 'Al-Salamah 1106'],
                    'syed@gohavena.com' => ['Al-Andalus 9', 'Al-Hamra 702'],
                ],
                'admin_name' => 'Hana Al Ghamdi',
                'admin_bio' => 'Community office for Jeddah, in Al-Balad. I post the historic-district walks, the corniche, and the fountain evenings.',
                'hero' => 'jeddah-balad',
                'description' => 'Jeddah is the Red Sea port of Makkah Province. This community is the city, from Al-Balad to the corniche. The 2022 census counted 3,751,722 people in Jeddah governorate. Al-Balad, the old town, is a UNESCO World Heritage site. The corniche runs south from there, past King Fahd’s Fountain, toward Al Rahmah Mosque.',
                'places' => [
                    ['name' => 'Al-Balad', 'address' => 'Al-Dahab Street, Al-Balad, Jeddah', 'hours' => 'Walk 4:00 PM - 9:30 PM. Public lanes stay open.', 'capacity' => 600, 'image' => 'jeddah-balad', 'description' => 'Historic Jeddah, a UNESCO World Heritage site. Coral-stone houses, roshan balconies, and the lanes around Al-Dahab Street. Walk it on foot. The municipality has restored the main lanes. Side lanes are still homes.'],
                    ['name' => "King Fahd's Fountain", 'address' => 'Jeddah Corniche', 'hours' => 'Lit after sunset, about 5:30 PM - 10:00 PM.', 'capacity' => 400, 'image' => 'jeddah-fountain', 'description' => "The seawater fountain on the Jeddah Corniche, lit after dark. The viewing is from the corniche pavement, not from the water. It is the tallest fountain of its kind and it does not run during maintenance shutdowns."],
                    ['name' => 'Al Rahmah Mosque', 'address' => 'North Corniche, Jeddah', 'hours' => 'Corniche view 4:00 PM - 8:00 PM. Hall is for prayer.', 'capacity' => 200, 'image' => 'jeddah-mosque', 'description' => 'The white mosque on the north corniche, built out over the water and often called the floating mosque. The corniche pavement is the public view. The prayer hall is not a tourist interior.'],
                ],
                'events' => [
                    ['title' => 'Al-Balad lane walk', 'date' => '2027-01-12', 'start' => '17:00', 'end' => '18:30', 'capacity' => 30, 'pinned' => true, 'image' => 'jeddah-balad', 'location' => 'Al-Dahab Street, Al-Balad, Jeddah', 'body' => "A walk through the restored lanes of Al-Balad, starting on Al-Dahab Street at 5:00 PM.\n\nAl-Balad is a UNESCO site and it is also people's houses. Stay on the public lanes, and do not step into an open doorway for a photo.\n\nComfortable shoes. The coral stone is uneven."],
                    ['title' => 'Corniche and the fountain', 'date' => '2027-02-15', 'start' => '17:30', 'end' => '19:00', 'capacity' => 40, 'pinned' => false, 'image' => 'jeddah-fountain', 'location' => "Jeddah Corniche, King Fahd's Fountain", 'body' => "Meet on the corniche pavement opposite King Fahd's Fountain at 5:30 PM, in time for the lights.\n\nWe walk a short stretch of the sea wall and stop. This is not a run and not a swim. The fountain is viewed from the pavement.\n\nIf the fountain is off for maintenance, we still walk the corniche and say so in the thread."],
                    ['title' => 'North corniche at Al Rahmah', 'date' => '2027-03-15', 'start' => '16:30', 'end' => '18:00', 'capacity' => 28, 'pinned' => false, 'image' => 'jeddah-r02', 'location' => 'Al Rahmah Mosque, North Corniche, Jeddah', 'body' => "A walk on the north corniche, meeting at the pavement in front of Al Rahmah Mosque at 4:30 PM.\n\nThe mosque sits over the water. We stay on the public corniche. The prayer hall is for worshippers, and this office will not take a group inside.\n\nThe afternoon is windy off the sea. Bring a light layer."],
                    ['title' => 'Own bill at Shawarma Shakir', 'date' => '2027-01-12', 'start' => '19:00', 'end' => '20:30', 'capacity' => 12, 'pinned' => false, 'image' => 'jeddah-shawarma', 'location' => 'Shawarma Shakir Aljazeera, Hail Street, Al Ruwais', 'body' => "After the Al-Balad walk, anyone who wants shawarma can come to Shawarma Shakir Aljazeera on Hail Street in Al Ruwais at 7:00 PM.\n\nThe counter has been there since 1965, 1385 AH. It opens in the afternoon and stays late. The old Al-Balad branch is gone, so do not look for it in the lanes. The site is shakiraljazeera.com. Each person pays their own bill. This office is not holding an order.\n\nThe photograph is a row of shawarma shops in Al-Baghdadia, the same trade. It is not the Hail Street counter."],
                    ['title' => 'Roshan balconies, public lanes only', 'date' => '2027-04-13', 'start' => '17:00', 'end' => '18:30', 'capacity' => 24, 'pinned' => false, 'image' => 'jeddah-roshan', 'location' => 'Historic Jeddah, Al-Balad', 'body' => "A second walk in Historic Jeddah, on 13 April at 5:00 PM, for the roshan balconies. Meet on Al-Dahab Street.\n\nThe houses in the photograph are homes. We stay in the public lanes. An open door is not an invitation, and the coral stone is not for climbing.\n\nShoes you can walk in. The stone is uneven."],
                ],
                'notices' => [
                    ['title' => 'How this Jeddah community works', 'category' => 'general', 'pinned' => false, 'image' => 'jeddah-r10', 'location' => 'Al-Dahab Street, Al-Balad', 'date' => '2026-11-20', 'end_date' => '2027-05-31', 'start' => '08:00', 'end' => '22:00', 'body' => "This community is Jeddah: Al-Balad, the corniche, Al-Hamra, Al-Zahra, Al-Rawdah, Al-Salamah, and Al-Andalus. It is not one compound.\n\nThe population figure is the 10 May 2022 census for Jeddah governorate, 3,751,722. Historic Jeddah was inscribed by UNESCO in 2014. The photograph is the old town, and those houses are still homes.\n\nA meetup is neighbours in a public lane or on the pavement. It is not a reserved table. The office account is admin.jeddah@gohavena.com."],
                    ['title' => 'Al-Balad lanes are public. The houses are not.', 'category' => 'general', 'pinned' => false, 'image' => 'jeddah-balad-lane', 'location' => 'Al-Dahab Street, Al-Balad', 'date' => '2026-12-18', 'end_date' => '2027-05-31', 'start' => '16:00', 'end' => '21:30', 'body' => "Historic Jeddah is a UNESCO site and a neighbourhood. The restored lanes around Al-Dahab Street are the visit. The photograph is one of those lanes.\n\nAn open door, a courtyard, or a roof is not an invitation. Ask before you photograph a person. Do not climb the coral stone. It is old and it breaks.\n\nThe walk on 12 January starts on Al-Dahab Street at 5:00 PM and stays on the public lanes. Wear shoes you can walk in. The stone is uneven."],
                    ['title' => 'King Fahd\'s Fountain is watched from the pavement', 'category' => 'general', 'pinned' => false, 'image' => 'jeddah-r09', 'location' => 'Jeddah Corniche', 'date' => '2027-01-22', 'end_date' => '2027-05-31', 'start' => '17:30', 'end' => '22:00', 'body' => "The fountain is lit after sunset and it is viewed from the corniche pavement. It does not run during maintenance, and this office is not told of every shutdown in advance.\n\nThe walk on 15 February meets opposite the fountain at 5:30 PM. If the water is off, we still walk the pavement and say so in the thread.\n\nDo not climb the rocks and do not go in the water. Cross the corniche road at the lights."],
                    ['title' => 'Al Rahmah: the pavement is the visit', 'category' => 'general', 'pinned' => false, 'image' => 'jeddah-q05', 'location' => 'North Corniche, Jeddah', 'date' => '2027-02-19', 'end_date' => '2027-05-31', 'start' => '16:00', 'end' => '20:00', 'body' => "Al Rahmah Mosque sits over the water on the north corniche. The public view is the pavement in front of it.\n\nThe prayer hall is for worshippers. It is not a tourist interior, and this office will not take a group inside.\n\nThe walk on 15 March meets on that pavement at 4:30 PM. The afternoon is windy off the sea. Bring a light layer."],
                    ['title' => 'Walk Al-Balad after 4:00 PM', 'category' => 'general', 'pinned' => false, 'image' => 'jeddah-r06', 'location' => 'Al-Balad, Jeddah', 'date' => '2027-03-19', 'end_date' => '2027-05-31', 'start' => '16:00', 'end' => '21:30', 'body' => "Jeddah stays warm in the middle of the day. This office sets Al-Balad and corniche walks from 4:00 PM. The photograph is the old town. The gate is the meeting side.\n\nShops in the old town keep their own hours. The lanes stay open. If you are coming from Al-Hamra or Al-Andalus, leave time for the traffic into Al-Balad.\n\nCarry water. The group stops if a child or an older neighbour needs to stop."],
                    ['title' => 'Do not step through an open door in Al-Balad', 'category' => 'emergency', 'pinned' => true, 'image' => 'jeddah-r07', 'location' => 'Al-Dahab Street, Al-Balad', 'date' => '2026-11-24', 'end_date' => '2027-05-31', 'start' => '16:00', 'end' => '21:30', 'body' => "Al-Balad is people's houses. The meeting point on 12 January is Al-Dahab Street at 5:00 PM, and the route is the public lanes only. The same rule holds for the roshan walk on 13 April.\n\nDo not enter a doorway, a courtyard, or a roof because it was open. If a resident asks you to move on, move on. The office will not treat that as a dispute to be argued in the lane.\n\nThe photograph is a house front in the old town. The meeting point stays in the public lane."],
                    ['title' => 'Stay off the rocks at the fountain', 'category' => 'emergency', 'pinned' => false, 'image' => 'jeddah-r01', 'location' => 'Jeddah Corniche, King Fahd\'s Fountain', 'date' => '2026-12-22', 'end_date' => '2027-05-31', 'start' => '17:30', 'end' => '22:00', 'body' => "The fountain viewing on 15 February is from the corniche pavement, opposite the water, at 5:30 PM.\n\nDo not climb down the rocks. Do not wade. If the fountain is off for maintenance, the walk still happens and we stay on the pavement.\n\nCross at the lights. Once the lights come on, the pavement gets crowded. Keep the group together."],
                    ['title' => 'The prayer hall at Al Rahmah is not a tour', 'category' => 'emergency', 'pinned' => false, 'image' => 'jeddah-mosque', 'location' => 'Al Rahmah Mosque, North Corniche', 'date' => '2027-01-29', 'end_date' => '2027-05-31', 'start' => '16:00', 'end' => '20:00', 'body' => "Al Rahmah is a mosque. The 15 March walk meets on the pavement in front of it at 4:30 PM and stays there.\n\nDo not lead the group into the prayer hall. Do not photograph people at prayer. The corniche view is the visit.\n\nThe sea wind is real. A light layer is enough."],
                    ['title' => 'Do not climb the coral stone', 'category' => 'emergency', 'pinned' => false, 'image' => 'jeddah-q04', 'location' => 'Al-Balad lanes, Jeddah', 'date' => '2027-02-26', 'end_date' => '2027-05-31', 'start' => '16:00', 'end' => '21:30', 'body' => "The coral stone in these lanes is old and it is fragile. Do not climb it for a photograph, and do not sit on a balcony that is part of a house.\n\nThe 12 January walk and the 13 April roshan walk both stay on the ground, in the public lanes. Shoes with a grip. The stone is uneven.\n\nIf you need a photograph of a facade, take it from the lane."],
                    ['title' => 'Roshan houses are still lived in', 'category' => 'emergency', 'pinned' => false, 'image' => 'jeddah-r11', 'location' => 'Historic Jeddah, Al-Balad', 'date' => '2027-03-26', 'end_date' => '2027-05-31', 'start' => '16:00', 'end' => '21:30', 'body' => "The wooden roshan balconies in this photograph are on houses where people live. A balcony is not a viewing platform for visitors.\n\nOn 13 April we meet on Al-Dahab Street at 5:00 PM to walk past them, in the lane. We do not go up.\n\nAsk before you photograph a person in a window."],
                ],
                'businesses' => [
                    ['name' => 'Historic Jeddah, Al-Balad', 'category' => 'Heritage', 'address' => 'Al-Balad, Jeddah', 'hours' => 'Public lanes open daily', 'website' => 'https://whc.unesco.org/en/list/1361/', 'amenities' => 'UNESCO site, Coral houses, Public lanes', 'image' => 'jeddah-balad', 'phone' => null, 'description' => 'Historic Jeddah was inscribed on the UNESCO World Heritage List in 2014. The public lanes are the visit. Private houses are not open unless a museum door says so.'],
                    ['name' => 'Shawarma Shakir Aljazeera', 'category' => 'Dining', 'address' => 'Hail Street, Al Ruwais, Jeddah', 'hours' => 'Afternoon until late', 'website' => 'https://shakiraljazeera.com/', 'amenities' => 'Shawarma', 'image' => 'shakir-shawarma-food', 'phone' => null, 'description' => 'Shawarma counter on Hail Street in Al Ruwais, open from the afternoon until late, since 1965 (1385 AH). The old Al-Balad branch is gone. Site shakiraljazeera.com. The photograph is shawarma shops in Al-Baghdadia, not this counter. No phone is printed here.'],
                    ['name' => 'Al Romansiah', 'category' => 'Dining', 'address' => 'Several branches in Jeddah', 'hours' => 'See the branch', 'website' => null, 'amenities' => 'Kabsa', 'image' => 'jeddah-kabsa', 'phone' => null, 'description' => 'Kabsa kitchen with several Jeddah branches. This office will not invent a street. The photograph is chicken kabsa, the dish, not a shopfront. No code.'],
                    ['name' => 'Al Baik', 'category' => 'Dining', 'address' => 'Corniche and Al-Balad branches, Jeddah', 'hours' => 'See the branch', 'website' => null, 'amenities' => 'Broasted chicken', 'image' => 'albaik-chicken', 'phone' => null, 'description' => 'Broasted chicken. Branches on the corniche and in Al-Balad are on the official branch list. The picture is the chicken, garlic sauce, and bread. It is not a branch and it is not a logo. There is no coupon.'],
                    ['name' => 'Palm Beach', 'category' => 'Dining', 'address' => 'Al Zahra, Jeddah', 'hours' => 'See the shop', 'website' => null, 'amenities' => 'Shawarma, Pickles', 'image' => 'palm-beach-shawarma', 'phone' => null, 'description' => 'Shawarma and pickles in Al Zahra. This office will not invent a street or a phone. The picture is the spit, the wrap, and the pickles, not a photograph of the shop. There is no coupon.'],
                    ['name' => 'N9 Darzan', 'category' => 'Dining', 'address' => 'Prince Sultan Road, Al Mohammadiyyah, Jeddah', 'hours' => 'Open 24 hours', 'website' => null, 'amenities' => 'Open all night', 'image' => 'n9-darzan-night', 'phone' => null, 'description' => 'On Prince Sultan Road in Al Mohammadiyyah, open 24 hours. The picture is a late grill plate. It is not a photograph of the room, and no phone is printed because this office has not confirmed one. No coupon.'],
                ],
                'rules' => [
                    ['title' => 'Al-Balad is a neighbourhood', 'category' => 'Conduct', 'body' => "Al-Balad is a world heritage site and a place where people live. Stay in the public lanes. Do not enter a house, a courtyard, or a roof because a door was open.\n\nAsk before you photograph a person. The coral stone is fragile. Do not climb it."],
                    ['title' => 'Corniche after dark', 'category' => 'Safety', 'body' => "Fountain and mosque walks are on the pavement, not on the rocks or in the water.\n\nCross the corniche road at the lights. Keep the group together once the fountain lights come on and the pavement gets crowded."],
                ],
                'posts' => [
                    ['email' => 'faisalaljamil@gmail.com', 'image' => 'jeddah-q03', 'body' => 'Al-Balad on Tuesday 12 January, 5:00 PM on Al-Dahab Street. Public lanes only. The coral stone is uneven, so wear shoes you can walk in. I am coming from Al-Hamra. We do not step into a doorway.'],
                    ['email' => 'zaeem.chaudhry@gmail.com', 'image' => 'jeddah-q09', 'body' => "Corniche opposite King Fahd's Fountain on 15 February at 5:30 PM, for the lights. We stay on the pavement. If the fountain is off for maintenance, I am still walking. Do not climb the rocks."],
                    ['email' => 'zaeem.chaudhry@gmail.com', 'image' => 'jeddah-q06', 'body' => 'North corniche on 15 March, pavement in front of Al Rahmah at 4:30 PM. I am coming from Al-Rawdah. The prayer hall is for worshippers. I am not taking anyone inside. Bring a light layer for the sea wind.'],
                    ['email' => 'syed@gohavena.com', 'image' => 'jeddah-q11', 'body' => 'I am in Al-Andalus and Al-Hamra. Al-Balad on 12 January, Al-Dahab Street at 5:00 PM. Public lanes only. I will not climb the coral stone, and I will not go through an open door for a photo.'],
                    ['email' => 'syed@gohavena.com', 'image' => 'jeddah-q12', 'body' => 'After the Al-Balad walk on 12 January I am going to Shawarma Shakir on Hail Street in Al Ruwais, on my own bill. The counter is open from the afternoon until late. The old Al-Balad branch is gone. The photo on the notice is shawarma shops in Al-Baghdadia, not the Hail Street door. I am not placing an order for anyone else.'],
                ],
                'comments' => [
                    ['post' => 'I am in Al-Andalus and Al-Hamra. Al-Balad on 12 January, Al-Dahab Street at 5:00 PM. Public lanes only. I will not climb the coral stone, and I will not go through an open door for a photo.', 'email' => 'faisalaljamil@gmail.com', 'body' => 'I will be on Al-Dahab Street. Shoes with a grip. The coral stone is uneven, and I am staying in the lane.'],
                    ['post' => 'I am in Al-Andalus and Al-Hamra. Al-Balad on 12 January, Al-Dahab Street at 5:00 PM. Public lanes only. I will not climb the coral stone, and I will not go through an open door for a photo.', 'email' => 'zaeem.chaudhry@gmail.com', 'body' => 'Same. If a resident asks us to move on, we move on. I am not arguing it in the lane.'],
                    ['post' => 'After the Al-Balad walk on 12 January I am going to Shawarma Shakir on Hail Street in Al Ruwais, on my own bill. The counter is open from the afternoon until late. The old Al-Balad branch is gone. The photo on the notice is shawarma shops in Al-Baghdadia, not the Hail Street door. I am not placing an order for anyone else.', 'email' => 'faisalaljamil@gmail.com', 'body' => 'I will come if the walk finishes on time. I am paying for my own shawarma. Hail Street, not Al-Balad.'],
                    ['post' => "Corniche opposite King Fahd's Fountain on 15 February at 5:30 PM, for the lights. We stay on the pavement. If the fountain is off for maintenance, I am still walking. Do not climb the rocks.", 'email' => 'syed@gohavena.com', 'body' => 'I will be on the pavement at 5:30. I am coming from Al-Hamra, and I will cross at the lights.'],
                    ['post' => 'North corniche on 15 March, pavement in front of Al Rahmah at 4:30 PM. I am coming from Al-Rawdah. The prayer hall is for worshippers. I am not taking anyone inside. Bring a light layer for the sea wind.', 'email' => 'faisalaljamil@gmail.com', 'body' => 'Pavement only. I will bring a light layer. I am not going into the hall.'],
                ],
                'offers' => [
                    ['title' => 'Shawarma Shakir Aljazeera', 'vendor' => 'Shawarma Shakir Aljazeera', 'business' => 'Shawarma Shakir Aljazeera', 'label' => 'Shawarma', 'category' => 'Dining', 'location' => 'Hail Street, Al Ruwais, Jeddah', 'image' => 'shakir-shawarma-food', 'featured' => true, 'description' => 'Shawarma on Hail Street in Al Ruwais, open from the afternoon until late. The counter has been there since 1965, 1385 AH. The old Al-Balad branch is gone. The site is shakiraljazeera.com. The picture is the shawarma, not the Hail Street door. You pay the counter. There is no coupon.'],
                    ['title' => 'Al Romansiah', 'vendor' => 'Al Romansiah', 'business' => 'Al Romansiah', 'label' => 'Kabsa', 'category' => 'Dining', 'location' => 'Several branches in Jeddah', 'image' => 'jeddah-kabsa', 'featured' => false, 'description' => 'Kabsa, with several branches in Jeddah. This office will not invent a street or a phone. The photograph is chicken kabsa, the dish the kitchen is known for, not a shopfront. You pay the branch. There is no code.'],
                    ['title' => 'Al Baik', 'vendor' => 'Al Baik', 'business' => 'Al Baik', 'label' => 'Broasted chicken', 'category' => 'Dining', 'location' => 'Corniche and Al-Balad, Jeddah', 'image' => 'albaik-chicken', 'featured' => false, 'description' => 'Broasted chicken. Branches on the corniche and in Al-Balad are on the official list. The picture is the chicken, garlic sauce, and bread. It is not a branch and it is not a logo. There is no coupon and no code.'],
                    ['title' => 'Palm Beach', 'vendor' => 'Palm Beach', 'business' => 'Palm Beach', 'label' => 'Shawarma', 'category' => 'Dining', 'location' => 'Al Zahra, Jeddah', 'image' => 'palm-beach-shawarma', 'featured' => false, 'description' => 'Shawarma and pickles in Al Zahra. This office will not invent a street number or a phone. The picture is the spit, the wrap, and the pickles. It is not a photograph of the shop. You pay the shop. There is no coupon.'],
                    ['title' => 'N9 Darzan', 'vendor' => 'N9 Darzan', 'business' => 'N9 Darzan', 'label' => 'Open 24 hours', 'category' => 'Dining', 'location' => 'Prince Sultan Road, Al Mohammadiyyah', 'image' => 'n9-darzan-night', 'featured' => false, 'description' => 'On Prince Sultan Road in Al Mohammadiyyah, open 24 hours. The picture is a late grill plate, not a photograph of the room. A phone is not printed because this office has not confirmed one. There is no coupon.'],
                ],
                'listings' => [
                    ['email' => 'faisalaljamil@gmail.com', 'type' => 'wanted', 'title' => 'Lift from Al-Hamra to Al-Balad on 12 January', 'price' => null, 'category' => 'Transport', 'condition' => null, 'location' => 'Al-Hamra, Jeddah', 'image' => 'jeddah-r12', 'description' => 'I am at Al-Hamra 1502. The walk starts on Al-Dahab Street at 5:00 PM on 12 January. A lift one way is enough. I will wait in the lane, not in a doorway.'],
                    ['email' => 'zaeem.chaudhry@gmail.com', 'type' => 'wanted', 'title' => 'Share a ride from Al-Rawdah to the fountain', 'price' => null, 'category' => 'Transport', 'condition' => null, 'location' => 'Al-Rawdah, Jeddah', 'image' => 'jeddah-r08', 'description' => 'From Al-Rawdah 18 to the corniche opposite the fountain before 5:30 PM on 15 February. Happy to split the fare. We stay on the pavement.'],
                    ['email' => 'syed@gohavena.com', 'type' => 'wanted', 'title' => 'Share a taxi from Al-Andalus to Al-Dahab Street', 'price' => null, 'category' => 'Transport', 'condition' => null, 'location' => 'Al-Andalus, Jeddah', 'image' => 'jeddah-q02', 'description' => 'From Al-Andalus 9 to Al-Dahab Street before 5:00 PM on 12 January. Happy to split the fare. Public lanes only after we arrive.'],
                    ['email' => 'syed@gohavena.com', 'type' => 'wanted', 'title' => 'Share a taxi from Al-Balad to Hail Street', 'price' => null, 'category' => 'Transport', 'condition' => null, 'location' => 'Al-Balad, Jeddah', 'image' => 'jeddah-q01', 'description' => 'After the 12 January walk, from Al-Dahab Street to Shawarma Shakir on Hail Street in Al Ruwais. Happy to split the fare. Each person pays for their own shawarma.'],
                    ['email' => 'zaeem.chaudhry@gmail.com', 'type' => 'wanted', 'title' => 'Share a ride from Al-Rawdah to Al Rahmah', 'price' => null, 'category' => 'Transport', 'condition' => null, 'location' => 'Al-Rawdah, Jeddah', 'image' => 'jeddah-r03', 'description' => 'From Al-Rawdah 18 to the pavement in front of Al Rahmah Mosque before 4:30 PM on 15 March. Happy to split the fare. We are not going into the prayer hall.'],
                ],
            ],
        ];
    }
}
