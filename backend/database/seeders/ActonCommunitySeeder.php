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
 * Village of Nagog Woods — Acton, Massachusetts.
 *
 * A real Acton HOA: 277 cedar-and-glass townhouses and garden homes on 60
 * wooded acres off Route 2A/119, designed by The Architects Collaborative in
 * 1972, with its own ZIP code (01718). Its documented amenities — clubhouse,
 * competition lap pool, six tennis courts, fitness centre, trails into the
 * Nagog Hill Conservation Area — are what the seeded amenity set mirrors.
 *
 * Residents are fictional personas; the places, streets, transit, businesses
 * and municipal services referenced throughout are real.
 *
 * Community admin: acton@gohavena.com    OTP 221322
 * Resident:        resident.acton@gohavena.com  OTP 221322
 *
 * Run: php artisan db:seed --class=Database\Seeders\ActonCommunitySeeder
 */
class ActonCommunitySeeder extends Seeder
{
    public const COMMUNITY_NAME = 'Village of Nagog Woods';

    public const COMMUNITY_ADDRESS = '100 Great Elm Way, Acton, MA 01718';

    public const REGION_TITLE = 'Massachusetts - Acton';

    public const INVITE_CODE = 'NAGOG-WOODS-26';

    public const ADMIN_EMAIL = 'acton@gohavena.com';

    public const RESIDENT_EMAIL = 'resident.acton@gohavena.com';

    public const DEMO_OTP = '221322';

    public const ADMIN_PHONE = '+19785550101';

    public const RESIDENT_PHONE = '+19785550120';

    /** 277 units at Nagog Woods, about 2.2 people per unit. */
    public const ESTIMATED_RESIDENTS = 609;

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
        return DB::table('communities')->where('name', self::COMMUNITY_NAME);
    }

    private function seedRegion(): Region
    {
        $this->call(RegionSeeder::class);

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
        $community = Community::query()->updateOrCreate(
            ['name' => self::COMMUNITY_NAME],
            [
                'region' => $region->title,
                'region_id' => $region->id,
                'address' => self::COMMUNITY_ADDRESS,
                'description' => 'An award-winning 1972 village of 277 cedar-and-glass townhouses and garden homes set on 60 wooded acres in North Acton, designed by The Architects Collaborative to sit inside the treeline rather than on top of it. Residents share a clubhouse, a competition lap pool and family pool, six tennis courts, a fitness centre, garden plots, and private trails that open onto the Nagog Hill Conservation Area and Nagog Pond. South Acton station on the MBTA Fitchburg Line is a ten-minute drive, and Route 2 puts Cambridge and Boston within reach.',
                'timezone' => 'America/New_York',
                'status' => 'active',
                'review_status' => 'approved',
                'reviewed_at' => now()->subYear(),
                'estimated_residents' => self::ESTIMATED_RESIDENTS,
                'latitude' => 42.5091000,
                'longitude' => -71.4374000,
            ],
        );

        $this->command?->info('  Community ready: '.$community->name);

        return $community;
    }

    private function seedCommunityAdmin(Region $region, Community $community): User
    {
        $joinedAt = now()->subMonths(26);

        $admin = $this->upsertUser(self::ADMIN_EMAIL, [
            'name' => 'Deborah Kelleher',
            'phone' => self::ADMIN_PHONE,
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
        ], $joinedAt);

        $this->upsertProfile($admin, [
            'display_name' => 'Deborah Kelleher',
            'avatar_url' => '/storage/seed/avatar-admin.jpg',
            'utility_bill_url' => '/storage/seed/utility-bill-admin.jpg',
            'unit_number' => 'Clubhouse — Management Office',
            'residence_type' => 'Management',
            'bio' => 'Community manager for the Village of Nagog Woods. The office is in the clubhouse on Great Elm Way, open Monday to Thursday 9–4 and Friday mornings. I handle notices, amenity bookings, trustee meetings, and the vendor schedule — snow, landscaping, and the cedar siding programme.',
            'region_id' => $region->id,
        ], $joinedAt, now()->subMonths(2));

        $this->upsertMembership($admin, $community, 'admin', 'approved', $joinedAt);

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
            'utility_bill_url' => '/storage/seed/utility-bill-resident.jpg',
            'unit_number' => '14 Great Elm Way',
            'residence_type' => 'Townhouse — 3BR',
            'bio' => 'Bought into Nagog Woods for the trees and stayed for the neighbours. I take the 7:12 out of South Acton most mornings, run the Nagog Hill loop on weekends, and I am on the tennis ladder in the summer. Happy to answer questions from anyone new to the village.',
            'region_id' => $region->id,
        ], $joinedAt, now()->subWeeks(3));

        $this->upsertMembership($resident, $community, 'member', 'approved', $joinedAt);

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
     * Fictional households, written against real Acton geography, schools,
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
                'residence' => 'Townhouse — 2BR',
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
                'residence' => 'Garden home — 3BR',
                'bio' => 'Process chemist, Kendall Square. I organise the summer tennis ladder on courts 3 and 4 and I will absolutely put you in the A flight if you say you are "a bit rusty".',
                'avatar' => 'avatar-03.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Kavita Deshpande',
                'email' => 'kavita.nagog@havena.app',
                'phone' => '+19785550123',
                'unit' => '31 Meadows Edge',
                'residence' => 'Townhouse — 3BR',
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
                'residence' => 'Garden home — 2BR',
                'bio' => 'Engineer out in Lexington. I ride the Bruce Freeman from the Route 2A bridge down to Concord most Saturdays — glad of company at a civilised pace.',
                'avatar' => 'avatar-07.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Grace Okonjo',
                'email' => 'grace.nagog@havena.app',
                'phone' => '+19785550125',
                'unit' => '5 Nagog Hill Road',
                'residence' => 'Townhouse — 2BR',
                'bio' => 'ICU nurse at Emerson in Concord, mostly nights. If my car is in the visitor bay at 8am it is because I have just got in — please do not have it towed.',
                'avatar' => 'avatar-04.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Daniel Krasner',
                'email' => 'daniel.nagog@havena.app',
                'phone' => '+19785550126',
                'unit' => '19 Meadows Edge',
                'residence' => 'Townhouse — 3BR',
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
                'residence' => 'Garden home — 3BR',
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
                'residence' => 'Townhouse — 2BR',
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
                'residence' => 'Townhouse — 2BR',
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
                'residence' => 'Garden home — 2BR',
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
                'residence' => 'Townhouse — 2BR',
                'bio' => 'Chair of the landscape committee and a volunteer at the Arboretum on Taylor Road. Ask me about the invasive glossy buckthorn along the west trail; I will not stop.',
                'avatar' => 'avatar-14.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Hemant Joshi',
                'email' => 'hemant.nagog@havena.app',
                'phone' => '+19785550132',
                'unit' => '3 Nagog Hill Road',
                'residence' => 'Townhouse — 3BR',
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
                'residence' => 'Townhouse — 2BR',
                'bio' => 'Suspended pending a trustee hearing on repeated quiet-hours complaints.',
                'avatar' => 'avatar-08.jpg',
                'status' => 'banned',
                'role' => 'member',
            ],
        ];
    }

    private function seedInviteCode(Community $community, User $admin): void
    {
        InviteCode::query()->updateOrCreate(
            ['code' => self::INVITE_CODE],
            [
                'community_id' => $community->id,
                'created_by' => $admin->id,
                'max_uses' => null,
                'used_count' => 38,
                'expires_at' => null,
            ],
        );
    }

    private function seedBilling(Community $community): void
    {
        CommunitySubscription::query()->updateOrCreate(
            ['community_id' => $community->id],
            [
                'plan_slug' => 'growth',
                'billing_interval' => 'year',
                'status' => CommunitySubscription::STATUS_ACTIVE,
                'seat_limit' => 700,
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
