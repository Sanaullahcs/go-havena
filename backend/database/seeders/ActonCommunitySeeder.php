<?php

namespace Database\Seeders;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\InviteCode;
use App\Models\Profile;
use App\Models\Region;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Acton, MA — the town as one community.
 *
 * The seeded community is Acton as a whole (West Acton, South Acton, Acton
 * Centre, and the neighborhoods around Nagog Hill), not a single subdivision.
 * Residents are fictional personas. Streets, transit, businesses, town
 * services and public events referenced throughout are real.
 *
 * Community admin: admin@gohavena.com     OTP 221322
 * Resident:        resident@gohavena.com  OTP 221322
 *
 * Run: php artisan db:seed --class=Database\Seeders\ActonCommunitySeeder
 */
class ActonCommunitySeeder extends Seeder
{
    public const COMMUNITY_NAME = 'Acton, MA';

    /** Previous seed name — used to rename the live row instead of creating a second community. */
    public const LEGACY_COMMUNITY_NAME = 'Village of Nagog Woods';

    public const COMMUNITY_ADDRESS = '472 Main Street, Acton, MA 01720';

    public const REGION_TITLE = 'Massachusetts - Acton';

    public const INVITE_CODE = 'ACTON-26';

    public const LEGACY_INVITE_CODE = 'NAGOG-WOODS-26';

    public const ADMIN_EMAIL = 'admin@gohavena.com';

    public const RESIDENT_EMAIL = 'resident@gohavena.com';

    public const DEMO_OTP = '221322';

    public const ADMIN_PHONE = '+19785550101';

    public const RESIDENT_PHONE = '+19785550120';

    /** Town of Acton resident count. */
    public const ESTIMATED_RESIDENTS = 24021;

    public function run(): void
    {
        $region = $this->seedRegion();
        $community = $this->seedCommunity($region);
        $admin = $this->seedCommunityAdmin($region, $community);
        $this->seedPrimaryResident($region, $community);
        $this->seedNeighbours($region, $community);
        $this->seedInviteCode($community, $admin);
        $this->seedBilling($community);

        $content = new ActonContentSeeder;
        $content->communityId = (int) $community->id;
        if ($this->command) {
            $content->setCommand($this->command);
        }
        $content->run();

        $this->command?->info('');
        $this->command?->info('Acton community ready (OTP '.self::DEMO_OTP.'):');
        $this->command?->info('  Community:       '.$community->name.' — '.$community->address);
        $this->command?->info('  Community admin: '.self::ADMIN_EMAIL);
        $this->command?->info('  Resident:        '.self::RESIDENT_EMAIL);
        $this->command?->info('  Invite code:     '.self::INVITE_CODE);
    }

    public static function communityQuery()
    {
        return DB::table('communities')->whereIn('name', [self::COMMUNITY_NAME, self::LEGACY_COMMUNITY_NAME]);
    }

    private function seedRegion(): Region
    {
        return Region::query()->updateOrCreate(
            ['title' => self::REGION_TITLE],
            [
                'area' => 'Acton & Nashoba Valley',
                'state' => 'Massachusetts',
                'users_label' => '24,021 residents',
                'sort_order' => 19,
                'status' => 'active',
            ],
        );
    }

    private function seedCommunity(Region $region): Community
    {
        $attributes = [
            'name' => self::COMMUNITY_NAME,
            'region' => $region->title,
            'region_id' => $region->id,
            'address' => self::COMMUNITY_ADDRESS,
            'description' => 'Acton, Massachusetts is a New England town in Middlesex County, about twenty-five miles northwest of Boston. This community is the town as a whole — West Acton, South Acton, Acton Centre, and the neighborhoods around Nagog Hill — not a single subdivision. Residents share Memorial Library and Town Hall on Main Street, NARA Park, the Acton Arboretum, the Bruce Freeman and Assabet River rail trails, and South Acton station on the MBTA Fitchburg Line.',
            'timezone' => 'America/New_York',
            'status' => 'active',
            'review_status' => 'approved',
            'reviewed_at' => now()->subYear(),
            'estimated_residents' => self::ESTIMATED_RESIDENTS,
            'latitude' => 42.4851,
            'longitude' => -71.4328,
        ];

        $community = Community::query()
            ->whereIn('name', [self::COMMUNITY_NAME, self::LEGACY_COMMUNITY_NAME])
            ->first();

        if ($community) {
            $community->update($attributes);
        } else {
            $community = Community::query()->create($attributes);
        }

        $this->command?->info('  Community ready: '.$community->name);

        return $community;
    }

    private function seedCommunityAdmin(Region $region, Community $community): User
    {
        $joinedAt = now()->subMonths(26);

        $existingAdmin = User::query()->where('email', self::ADMIN_EMAIL)->first();
        $adminRole = $existingAdmin?->role === 'system_admin' ? 'system_admin' : 'community_admin';

        $admin = $this->upsertUser(self::ADMIN_EMAIL, [
            'name' => 'Deborah Kelleher',
            'phone' => self::ADMIN_PHONE,
            'role' => $adminRole,
            'community_admin_status' => 'approved',
            'status' => 'active',
        ], $joinedAt);

        $this->upsertProfile($admin, [
            'display_name' => 'Deborah Kelleher',
            'avatar_url' => '/storage/seed/avatar-admin.jpg',
            'utility_bill_url' => '/storage/seed/notice-maintenance.jpg',
            'unit_number' => 'Town Hall — Community Office',
            'residence_type' => 'Management',
            'bio' => 'Community manager for Acton, MA. The office is at Town Hall, 472 Main Street, open Monday to Thursday 9–4 and Friday mornings. I handle notices, amenity bookings, town events, and day-to-day resident services.',
            'region_id' => $region->id,
        ], $joinedAt, now()->subMonths(2));

        $this->upsertMembership($admin, $community, 'admin', 'approved', $joinedAt);

        CommunityMembership::query()
            ->where('user_id', $admin->id)
            ->where('community_id', '!=', $community->id)
            ->delete();

        $this->command?->info('  Community admin ready: '.self::ADMIN_EMAIL);

        return $admin;
    }

    private function seedPrimaryResident(Region $region, Community $community): void
    {
        $joinedAt = now()->subMonths(14);

        $resident = $this->upsertUser(self::RESIDENT_EMAIL, [
            'name' => 'Ananya Raghavan',
            'phone' => self::RESIDENT_PHONE,
            'role' => 'resident',
            'status' => 'active',
        ], $joinedAt);

        $this->upsertProfile($resident, [
            'display_name' => 'Ananya Raghavan',
            'avatar_url' => '/storage/seed/avatar-11.jpg',
            'utility_bill_url' => '/storage/seed/notice-maintenance.jpg',
            'unit_number' => '14 Great Elm Way',
            'residence_type' => 'homeowner',
            'bio' => 'Acton homeowner. I take the 7:12 out of South Acton most mornings, walk the Arboretum and Nagog Hill on weekends, and I am happy to answer questions from anyone new to town.',
            'region_id' => $region->id,
        ], $joinedAt, now()->subWeeks(3));

        $this->upsertMembership($resident, $community, 'member', 'approved', $joinedAt);

        CommunityMembership::query()
            ->where('user_id', $resident->id)
            ->where('community_id', '!=', $community->id)
            ->delete();

        $this->command?->info('  Resident ready: '.self::RESIDENT_EMAIL);
    }

    private function seedNeighbours(Region $region, Community $community): void
    {
        foreach (self::neighbours() as $index => $person) {
            $joinedAt = now()->subMonths(24)->addMonths($index);

            $user = $this->upsertUser($person['email'], [
                'name' => $person['name'],
                'phone' => $person['phone'],
                'role' => 'resident',
                'status' => $person['status'] === 'banned' ? 'suspended' : 'active',
            ], $joinedAt);

            $this->upsertProfile($user, [
                'display_name' => $person['name'],
                'avatar_url' => '/storage/seed/'.$person['avatar'],
                'unit_number' => $person['unit'],
                'residence_type' => $person['residence'],
                'bio' => $person['bio'],
                'region_id' => $region->id,
            ], $joinedAt, $joinedAt->copy()->addWeeks(3));

            $this->upsertMembership($user, $community, $person['role'], $person['status'], $joinedAt);
        }

        $this->command?->info('  Neighbours ready: '.count(self::neighbours()).' residents');
    }

    /**
     * Fictional households written against real Acton geography, schools,
     * employers, and commuting patterns.
     *
     * @return list<array<string, string>>
     */
    public static function neighbours(): array
    {
        return [
            [
                'name' => 'Michael Doherty',
                'email' => 'michael.nagog@havena.app',
                'phone' => '+19785550121',
                'unit' => '22 Great Elm Way',
                'residence' => 'homeowner',
                'bio' => 'Thirty-one years with Acton DPW before I retired, so I know where every water shutoff in this village is buried. I run the snow-shovel call list for neighbours who cannot get out after a storm.',
                'avatar' => 'avatar-05.jpg',
                'status' => 'approved',
                'role' => 'moderator',
            ],
            [
                'name' => 'Wei-Lin Chen',
                'email' => 'weilin.nagog@havena.app',
                'phone' => '+19785550122',
                'unit' => '8 Meadows Edge',
                'residence' => 'homeowner',
                'bio' => 'Process chemist in Kendall Square. I organise the summer tennis ladder on courts 3 and 4, and I will absolutely put you in the A flight if you tell me you are "a bit rusty".',
                'avatar' => 'avatar-03.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Kavita Deshpande',
                'email' => 'kavita.nagog@havena.app',
                'phone' => '+19785550123',
                'unit' => '31 Meadows Edge',
                'residence' => 'homeowner',
                'bio' => 'Dentist with a practice on Great Road. Two kids at Douglas School, which means I am at the Elm Street farmers market every Sunday whether I planned to be or not.',
                'avatar' => 'avatar-09.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Tom Brennan',
                'email' => 'tom.nagog@havena.app',
                'phone' => '+19785550124',
                'unit' => '47 Great Elm Way',
                'residence' => 'homeowner',
                'bio' => 'Engineer out in Lexington. I ride the Bruce Freeman from the Route 2A bridge down to Concord most Saturdays and I am always glad of company at a civilised pace.',
                'avatar' => 'avatar-07.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Grace Okonjo',
                'email' => 'grace.nagog@havena.app',
                'phone' => '+19785550125',
                'unit' => '5 Nagog Hill Road',
                'residence' => 'tenant',
                'bio' => 'ICU nurse at Emerson in Concord, mostly nights. If my car is in the visitor bay at 8am it is because I have only just got in — please do not have it towed.',
                'avatar' => 'avatar-04.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Daniel Krasner',
                'email' => 'daniel.nagog@havena.app',
                'phone' => '+19785550126',
                'unit' => '19 Meadows Edge',
                'residence' => 'homeowner',
                'bio' => 'I teach orchestra at Acton-Boxborough. Yes, that is a cello you hear through the party wall on Sunday afternoons, and yes, I will stop by seven.',
                'avatar' => 'avatar-12.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Meera Iyer',
                'email' => 'meera.nagog@havena.app',
                'phone' => '+19785550127',
                'unit' => '26 Nagog Hill Road',
                'residence' => 'homeowner',
                'bio' => 'Paediatrician. I host the Diwali potluck in the clubhouse each autumn and it has grown every single year since 2019 — bring a dish, bring your neighbours.',
                'avatar' => 'avatar-01.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Patrick Sullivan',
                'email' => 'patrick.nagog@havena.app',
                'phone' => '+19785550128',
                'unit' => '52 Great Elm Way',
                'residence' => 'homeowner',
                'bio' => 'Carpenter, semi-retired. I have re-trimmed half the cedar in this village and I am happy to tell you, at length, why you should not pressure-wash it.',
                'avatar' => 'avatar-10.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Yuki Tanaka',
                'email' => 'yuki.nagog@havena.app',
                'phone' => '+19785550129',
                'unit' => '11 Meadows Edge',
                'residence' => 'tenant',
                'bio' => 'Museum educator down on Main Street. I bring the leftover build-a-bridge kits home, so if your kids want to make a mess on the clubhouse tables, say the word.',
                'avatar' => 'avatar-02.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Rosa Delgado',
                'email' => 'rosa.nagog@havena.app',
                'phone' => '+19785550130',
                'unit' => '38 Great Elm Way',
                'residence' => 'homeowner',
                'bio' => 'I cater small events around Acton and Concord. Two of the garden plots on Meadows Edge are mine — the tomatoes are for the family, the basil is fair game.',
                'avatar' => 'avatar-06.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Linda Whitcomb',
                'email' => 'linda.nagog@havena.app',
                'phone' => '+19785550131',
                'unit' => '44 Meadows Edge',
                'residence' => 'homeowner',
                'bio' => 'Chair of the landscape committee and a volunteer at the Arboretum on Taylor Road. Ask me about the glossy buckthorn along the west trail; I will not stop.',
                'avatar' => 'avatar-14.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Hemant Joshi',
                'email' => 'hemant.nagog@havena.app',
                'phone' => '+19785550132',
                'unit' => '3 Nagog Hill Road',
                'residence' => 'homeowner',
                'bio' => 'Closed on our unit three weeks ago and still finding light switches. Moved out from Waltham for the schools and the quiet.',
                'avatar' => 'avatar-13.jpg',
                'status' => 'pending',
                'role' => 'member',
            ],
            [
                'name' => 'Kevin Marchetti',
                'email' => 'kevin.nagog@havena.app',
                'phone' => '+19785550133',
                'unit' => '29 Great Elm Way',
                'residence' => 'tenant',
                'bio' => 'Suspended pending a trustee hearing on repeated quiet-hours complaints.',
                'avatar' => 'avatar-08.jpg',
                'status' => 'banned',
                'role' => 'member',
            ],
        ];
    }

    private function seedInviteCode(Community $community, User $admin): void
    {
        $invite = InviteCode::query()
            ->where('community_id', $community->id)
            ->orWhereIn('code', [self::INVITE_CODE, self::LEGACY_INVITE_CODE])
            ->first();

        $payload = [
            'community_id' => $community->id,
            'created_by' => $admin->id,
            'code' => self::INVITE_CODE,
            'max_uses' => null,
            'used_count' => 38,
            'expires_at' => null,
        ];

        if ($invite) {
            $invite->update($payload);
        } else {
            InviteCode::query()->create($payload);
        }
    }

    private function seedBilling(Community $community): void
    {
        CommunitySubscription::query()->updateOrCreate(
            ['community_id' => $community->id],
            [
                'plan_slug' => 'growth',
                'billing_interval' => 'year',
                'status' => CommunitySubscription::STATUS_ACTIVE,
                'seat_limit' => 25000,
                'extra_seats' => 0,
                'estimated_residents' => self::ESTIMATED_RESIDENTS,
                'current_period_start' => now()->subMonths(4),
                'current_period_end' => now()->addMonths(8),
                'cancel_at_period_end' => false,
                'meta' => [
                    'activated_via' => 'manual',
                    'card_on_file' => true,
                    'granted_reason' => 'acton_community',
                ],
            ],
        );
    }

    private function upsertUser(string $email, array $attributes, Carbon $createdAt): User
    {
        $payload = array_merge($attributes, ['password' => 'password']);

        $user = User::query()->where('email', $email)->first();

        if ($user) {
            $user->update($payload);
        } else {
            $user = User::query()->create(array_merge($payload, [
                'uuid' => (string) Str::ulid(),
                'email' => $email,
            ]));
        }

        $user->forceFill([
            'email_verified_at' => $createdAt,
            'phone_verified_at' => $createdAt,
            'created_at' => $user->created_at ?: $createdAt,
        ])->save();

        return $user->fresh();
    }

    private function upsertProfile(User $user, array $attributes, Carbon $createdAt, Carbon $updatedAt): void
    {
        Profile::query()->updateOrCreate(['user_id' => $user->id], $attributes);

        DB::table('profiles')->where('user_id', $user->id)->update([
            'created_at' => $createdAt,
            'updated_at' => $updatedAt,
        ]);
    }

    private function upsertMembership(
        User $user,
        Community $community,
        string $role,
        string $status,
        Carbon $createdAt,
    ): void {
        CommunityMembership::query()->updateOrCreate(
            ['user_id' => $user->id, 'community_id' => $community->id],
            ['role' => $role, 'status' => $status],
        );

        DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('community_id', $community->id)
            ->update(['created_at' => $createdAt, 'updated_at' => $createdAt]);
    }
}
