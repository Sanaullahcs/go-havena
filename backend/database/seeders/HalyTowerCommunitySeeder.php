<?php

namespace Database\Seeders;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\InviteCode;
use App\Models\Profile;
use App\Models\Region;
use App\Models\User;
use App\Services\UnitAssignmentService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Haly Tower — a high-rise apartment building in DHA Phase 2, Lahore.
 *
 * Residents are fictional households. Everything around them is real: the
 * block layout of DHA Phase 2, LESCO load-shedding and SNGPL gas pressure,
 * the Phase 2 Jamia Masjid, the commercial market on the main boulevard,
 * Ghazi Road and the Ring Road interchange, and the restaurants that actually
 * trade in and around the tower.
 *
 * Money is shown in Pakistani rupees — the community row carries currency
 * 'PKR' and every amount seeded below is a realistic 2026 Lahore price.
 *
 * Community admin: haly@gohavena.com         OTP 221322
 * Resident:        haly.resident@gohavena.com OTP 221322
 *
 * Run: php artisan db:seed --class=Database\Seeders\HalyTowerCommunitySeeder
 */
class HalyTowerCommunitySeeder extends Seeder
{
    public const COMMUNITY_NAME = 'Haly Tower';

    /**
     * Any other community whose name starts with this gets renamed out of the
     * way, so the demo can never be shown the wrong Haly Tower.
     */
    public const ARCHIVED_COMMUNITY_NAME = 'Haly Tower (archived 2026)';

    public const COMMUNITY_ADDRESS = 'Haly Tower, Sector H Commercial, DHA Phase 2, Lahore Cantt 54810, Pakistan';

    public const REGION_TITLE = 'Punjab - Lahore';

    public const CURRENCY = 'PKR';

    public const TIMEZONE = 'Asia/Karachi';

    public const INVITE_CODE = 'HALY-DHA2-26';

    public const ADMIN_EMAIL = 'haly@gohavena.com';

    public const RESIDENT_EMAIL = 'haly.resident@gohavena.com';

    public const DEMO_OTP = '221322';

    public const ADMIN_PHONE = '+923008410101';

    public const RESIDENT_PHONE = '+923008410120';

    /** Two wings, fourteen occupied floors, four apartments to a floor. */
    public const ESTIMATED_RESIDENTS = 412;

    public function run(): void
    {
        $region = $this->seedRegion();
        $community = $this->seedCommunity($region);
        $this->retireOtherHalyTowers((int) $community->id);

        $admin = $this->seedCommunityAdmin($region, $community);
        $resident = $this->seedPrimaryResident($region, $community);
        $this->seedNeighbours($region, $community);
        $this->seedInviteCode($community, $admin);
        $this->seedBilling($community);
        $this->seedFamilies($community, $resident);

        $content = new HalyTowerContentSeeder;
        $content->communityId = (int) $community->id;
        if ($this->command) {
            $content->setCommand($this->command);
        }
        $content->run();

        $this->command?->info('');
        $this->command?->info('Haly Tower ready (OTP '.self::DEMO_OTP.'):');
        $this->command?->info('  Community:       '.$community->name.' #'.$community->id);
        $this->command?->info('  Address:         '.$community->address);
        $this->command?->info('  Currency:        '.$community->currency);
        $this->command?->info('  Community admin: '.self::ADMIN_EMAIL);
        $this->command?->info('  Resident:        '.self::RESIDENT_EMAIL);
        $this->command?->info('  Invite code:     '.self::INVITE_CODE);
    }

    /** The row this seeder owns, identified by the invite code it alone issues. */
    public static function seededCommunityId(): ?int
    {
        $id = DB::table('invite_codes')->where('code', self::INVITE_CODE)->value('community_id');

        return $id ? (int) $id : null;
    }

    private function seedRegion(): Region
    {
        $region = Region::query()->updateOrCreate(
            ['title' => self::REGION_TITLE],
            [
                // "Pakistan" in the area text keeps the billing/currency country
                // resolvable even on an installation with no states table rows.
                'area' => 'DHA, Cantt & Walton, Lahore, Pakistan',
                'state' => 'Punjab',
                'users_label' => '13.0m residents',
                'sort_order' => 60,
                'status' => 'active',
            ],
        );

        if (! $region->state_id) {
            $stateId = DB::table('states')
                ->join('countries', 'countries.id', '=', 'states.country_id')
                ->where('countries.code', 'PK')
                ->where('states.name', 'Punjab')
                ->value('states.id');

            if ($stateId) {
                $region->forceFill(['state_id' => $stateId])->save();
            }
        }

        return $region->fresh();
    }

    private function seedCommunity(Region $region): Community
    {
        $attributes = [
            'name' => self::COMMUNITY_NAME,
            'region' => $region->title,
            'region_id' => $region->id,
            'address' => self::COMMUNITY_ADDRESS,
            'description' => 'Haly Tower is a sixteen-storey residential building in Sector H of DHA Phase 2, Lahore, a short walk from the Phase 2 commercial market and five minutes from the Ghazi Road interchange onto Lahore Ring Road. Two wings, A and B, share a basement car park, a rooftop deck looking north towards the Cantt, a ground-floor Jamia Masjid prayer hall, and a generator plant that carries the whole building through LESCO load-shedding. Allama Iqbal International Airport is fifteen minutes away; LUMS, Packages Mall and the Phase 4 Y-Block market are all inside twenty.',
            'timezone' => self::TIMEZONE,
            'currency' => self::CURRENCY,
            'status' => 'active',
            'review_status' => 'approved',
            'reviewed_at' => now()->subMonths(30),
            'estimated_residents' => self::ESTIMATED_RESIDENTS,
            'latitude' => 31.4806190,
            'longitude' => 74.4139420,
        ];

        $seededId = self::seededCommunityId();
        $community = $seededId ? Community::query()->find($seededId) : null;

        if ($community) {
            $community->update($attributes);
        } else {
            $community = Community::query()->create($attributes);
        }

        $this->command?->info('  Community ready: '.$community->name.' #'.$community->id.' ('.$community->currency.')');

        return $community->fresh();
    }

    /**
     * An older Haly Tower exists on production from an earlier demo. Rename and
     * deactivate it rather than deleting, so nothing it is referenced by breaks.
     */
    private function retireOtherHalyTowers(int $keepCommunityId): void
    {
        $stale = Community::query()
            ->where('id', '!=', $keepCommunityId)
            ->where(function ($query) {
                $query->where('name', 'like', self::COMMUNITY_NAME.'%')
                    ->orWhere('name', 'like', 'Haly%Tower%');
            })
            ->get();

        foreach ($stale as $community) {
            $community->update([
                'name' => self::ARCHIVED_COMMUNITY_NAME,
                'status' => 'inactive',
            ]);

            $this->command?->warn('  Retired old community #'.$community->id.' → '.self::ARCHIVED_COMMUNITY_NAME);
        }
    }

    private function seedCommunityAdmin(Region $region, Community $community): User
    {
        $joinedAt = now()->subMonths(29);

        $existing = User::query()->where('email', self::ADMIN_EMAIL)->first();
        $role = $existing?->role === 'system_admin' ? 'system_admin' : 'community_admin';

        $admin = $this->upsertUser(self::ADMIN_EMAIL, [
            'name' => 'Imran Chaudhry',
            'phone' => self::ADMIN_PHONE,
            'role' => $role,
            'community_admin_status' => 'approved',
            'status' => 'active',
        ], $joinedAt);

        $this->upsertProfile($admin, [
            'display_name' => 'Imran Chaudhry',
            'avatar_url' => '/storage/seed/avatar-admin.jpg',
            'utility_bill_url' => '/storage/seed/notice-maintenance.jpg',
            'unit_number' => 'Office',
            'residence_type' => 'Management',
            'office_address' => 'Building Management Office, Ground Floor, Haly Tower',
            'bio' => 'Building manager at Haly Tower. The office is on the ground floor beside the A-wing lift, open Monday to Saturday 9am to 6pm. I handle maintenance billing, the generator and lift contracts, amenity bookings, DHA parking stickers, and anything the guards escalate overnight.',
            'region_id' => $region->id,
        ], $joinedAt, now()->subWeeks(2));

        $this->upsertMembership($admin, $community, 'admin', 'approved', $joinedAt);

        CommunityMembership::query()
            ->where('user_id', $admin->id)
            ->where('community_id', '!=', $community->id)
            ->delete();

        app(UnitAssignmentService::class)
            ->assignUserToUnitNumber((int) $community->id, (int) $admin->id, 'Office', true);

        $this->command?->info('  Community admin ready: '.self::ADMIN_EMAIL);

        return $admin->fresh();
    }

    private function seedPrimaryResident(Region $region, Community $community): User
    {
        $joinedAt = now()->subMonths(21);

        $resident = $this->upsertUser(self::RESIDENT_EMAIL, [
            'name' => 'Zainab Haider',
            'phone' => self::RESIDENT_PHONE,
            'role' => 'resident',
            'status' => 'active',
        ], $joinedAt);

        $this->upsertProfile($resident, [
            'display_name' => 'Zainab Haider',
            'avatar_url' => '/storage/seed/avatar-11.jpg',
            'utility_bill_url' => '/storage/seed/notice-maintenance.jpg',
            'unit_number' => 'A-1104',
            'residence_type' => 'homeowner',
            'bio' => 'Architect, practice in Gulberg. We bought A-1104 for the north view and stayed for the neighbours. I chair the residents welfare committee, so if the lift is making that noise again, tell me before you tell the group.',
            'region_id' => $region->id,
        ], $joinedAt, now()->subDays(9));

        $this->upsertMembership($resident, $community, 'member', 'approved', $joinedAt);

        CommunityMembership::query()
            ->where('user_id', $resident->id)
            ->where('community_id', '!=', $community->id)
            ->delete();

        app(UnitAssignmentService::class)
            ->assignUserToUnitNumber((int) $community->id, (int) $resident->id, 'A-1104');

        $this->command?->info('  Resident ready: '.self::RESIDENT_EMAIL.' (A-1104)');

        return $resident->fresh();
    }

    private function seedNeighbours(Region $region, Community $community): void
    {
        $units = app(UnitAssignmentService::class);

        foreach (self::neighbours() as $index => $person) {
            $joinedAt = now()->subMonths(28)->addMonths($index);

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

            CommunityMembership::query()
                ->where('user_id', $user->id)
                ->where('community_id', '!=', $community->id)
                ->delete();

            if ($person['status'] === 'approved') {
                $units->assignUserToUnitNumber((int) $community->id, (int) $user->id, $person['unit']);
            }
        }

        $this->command?->info('  Neighbours ready: '.count(self::neighbours()).' residents across A and B wings');
    }

    /**
     * Fictional households written against real Lahore employers, schools,
     * hospitals and commuting patterns.
     *
     * @return list<array<string, string>>
     */
    public static function neighbours(): array
    {
        return [
            [
                'name' => 'Dr. Faisal Mahmood',
                'email' => 'faisal.haly@havena.app',
                'phone' => '+923008410121',
                'unit' => 'A-304',
                'residence' => 'homeowner',
                'bio' => 'Cardiologist at National Hospital on Defence Road. On the building committee since 2023. If someone collapses in the lobby, the guards have my number on the wall — use it before you call anyone else.',
                'avatar' => 'avatar-05.jpg',
                'status' => 'approved',
                'role' => 'moderator',
            ],
            [
                'name' => 'Col. (R) Shahbaz Khan',
                'email' => 'shahbaz.haly@havena.app',
                'phone' => '+923008410122',
                'unit' => 'B-203',
                'residence' => 'homeowner',
                'bio' => 'Retired, thirty-two years in the Army, the last four at Lahore Cantt. I audit the guard roster and the CCTV log every Sunday morning and I will keep doing it whether or not anyone asks.',
                'avatar' => 'avatar-07.jpg',
                'status' => 'approved',
                'role' => 'moderator',
            ],
            [
                'name' => 'Ayesha Siddiqui',
                'email' => 'ayesha.haly@havena.app',
                'phone' => '+923008410123',
                'unit' => 'A-502',
                'residence' => 'homeowner',
                'bio' => 'Textile designer, I supply two labels in Liberty Market. The jasmine on the fifth-floor landing is mine and it is the reason that corridor smells the way it does in June.',
                'avatar' => 'avatar-09.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Usman Ghani',
                'email' => 'usman.haly@havena.app',
                'phone' => '+923008410124',
                'unit' => 'A-706',
                'residence' => 'homeowner',
                'bio' => 'Software engineer, Arfa Software Technology Park. I keep a spare inverter battery and jumper cables in A-706 — knock any time the generator misses a changeover.',
                'avatar' => 'avatar-03.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Hina Qureshi',
                'email' => 'hina.haly@havena.app',
                'phone' => '+923008410125',
                'unit' => 'A-808',
                'residence' => 'homeowner',
                'bio' => 'Primary coordinator at Beaconhouse DHA. Three of the tower\'s school vans stop under my window at 6:50am, so I know exactly which one is late and by how long.',
                'avatar' => 'avatar-01.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Bilal Akhtar',
                'email' => 'bilal.haly@havena.app',
                'phone' => '+923008410126',
                'unit' => 'A-902',
                'residence' => 'homeowner',
                'bio' => 'Chartered accountant, own practice off Walton Road. I reconcile the maintenance account against the posted bills every quarter and publish the summary here. Nobody has objected yet.',
                'avatar' => 'avatar-10.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Dr. Nadia Saleem',
                'email' => 'nadia.haly@havena.app',
                'phone' => '+923008410127',
                'unit' => 'A-1002',
                'residence' => 'homeowner',
                'bio' => 'Paediatric dentist with a chair in Phase 1 commercial. I host the children\'s Eid party on the rooftop every year and it has outgrown the deck twice already.',
                'avatar' => 'avatar-14.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Maryam Javed',
                'email' => 'maryam.haly@havena.app',
                'phone' => '+923008410128',
                'unit' => 'B-405',
                'residence' => 'homeowner',
                'bio' => 'Advocate, Lahore High Court. I drafted the current tenancy addendum the building uses. Read it before you sign anything your landlord hands you.',
                'avatar' => 'avatar-04.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Kamran Rashid',
                'email' => 'kamran.haly@havena.app',
                'phone' => '+923008410129',
                'unit' => 'B-604',
                'residence' => 'homeowner',
                'bio' => 'I run two kitchens in Phase 2 commercial. Wedding season means my staff vans are in the visitor bay at odd hours — message me rather than calling the tow truck.',
                'avatar' => 'avatar-08.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Saba Noor',
                'email' => 'saba.haly@havena.app',
                'phone' => '+923008410130',
                'unit' => 'B-707',
                'residence' => 'homeowner',
                'bio' => 'Civil engineer, I have worked DHA road and drainage projects since 2019. When the monsoon backs up at the ramp, I am the one on the phone to the sub-contractor.',
                'avatar' => 'avatar-06.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Ahmed Raza',
                'email' => 'ahmed.haly@havena.app',
                'phone' => '+923008410131',
                'unit' => 'B-901',
                'residence' => 'homeowner',
                'bio' => 'Branch manager at the bank in Phase 2 commercial. Happy to explain why your online maintenance transfer has not cleared, but please do not ask me at Friday prayers.',
                'avatar' => 'avatar-12.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Rabia Aslam',
                'email' => 'rabia.haly@havena.app',
                'phone' => '+923008410132',
                'unit' => 'B-1003',
                'residence' => 'tenant',
                'bio' => 'Teach economics at LUMS, so I am on Ghazi Road at 7:30 every morning. Two seats free in the car if anyone is going towards Phase 5.',
                'avatar' => 'avatar-02.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Farah Ehsan',
                'email' => 'farah.haly@havena.app',
                'phone' => '+923008410133',
                'unit' => 'A-1206',
                'residence' => 'tenant',
                'bio' => 'Pharmacist, evening shift at the chemist in Phase 2 market. I get in around eleven, so the A-wing lift chime at that hour is me, not an intruder.',
                'avatar' => 'avatar-13.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Zeeshan Butt',
                'email' => 'zeeshan.haly@havena.app',
                'phone' => '+923008410134',
                'unit' => 'B-1208',
                'residence' => 'homeowner',
                'bio' => 'Car dealer on Walton Road. Yes, the showroom plates in the basement are mine; no, I am not using resident bays — bay 44 and 45 are on my title.',
                'avatar' => 'avatar-05.jpg',
                'status' => 'approved',
                'role' => 'member',
            ],
            [
                'name' => 'Tariq Mehmood',
                'email' => 'tariq.haly@havena.app',
                'phone' => '+923008410135',
                'unit' => 'B-1105',
                'residence' => 'homeowner',
                'bio' => 'Took possession of B-1105 last month after shifting back from Dubai. Still working out which switch does what and where the water tank valve is.',
                'avatar' => 'avatar-03.jpg',
                'status' => 'pending',
                'role' => 'member',
            ],
            [
                'name' => 'Junaid Ali',
                'email' => 'junaid.haly@havena.app',
                'phone' => '+923008410136',
                'unit' => 'A-206',
                'residence' => 'tenant',
                'bio' => 'Access suspended pending the committee hearing — four quiet-hours complaints and a blocked fire exit in the basement.',
                'avatar' => 'avatar-08.jpg',
                'status' => 'banned',
                'role' => 'member',
            ],
        ];
    }

    private function seedInviteCode(Community $community, User $admin): void
    {
        $invite = InviteCode::query()
            ->where('code', self::INVITE_CODE)
            ->orWhere('community_id', $community->id)
            ->first();

        $payload = [
            'community_id' => $community->id,
            'created_by' => $admin->id,
            'code' => self::INVITE_CODE,
            'max_uses' => null,
            'used_count' => 64,
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
                'seat_limit' => 500,
                'extra_seats' => 0,
                'estimated_residents' => self::ESTIMATED_RESIDENTS,
                'current_period_start' => now()->subMonths(3),
                'current_period_end' => now()->addMonths(9),
                'cancel_at_period_end' => false,
                'meta' => [
                    'activated_via' => 'manual',
                    'card_on_file' => true,
                    'granted_reason' => 'haly_tower_demo',
                ],
            ],
        );
    }

    /**
     * Two households, so the family screens have something to show: the primary
     * resident heads one, a neighbour heads the other.
     */
    private function seedFamilies(Community $community, User $resident): void
    {
        $byEmail = fn (string $email) => User::query()->where('email', $email)->first();

        $households = [
            [
                'head' => $resident,
                'number' => 'HT-1104',
                'name' => 'Haider household — A-1104',
                'members' => [
                    ['user' => $byEmail('farah.haly@havena.app'), 'relationship' => 'Sister'],
                ],
            ],
            [
                'head' => $byEmail('faisal.haly@havena.app'),
                'number' => 'HT-0304',
                'name' => 'Mahmood household — A-304',
                'members' => [
                    ['user' => $byEmail('nadia.haly@havena.app'), 'relationship' => 'Spouse'],
                    ['user' => $byEmail('usman.haly@havena.app'), 'relationship' => 'Brother'],
                ],
            ],
        ];

        foreach ($households as $household) {
            $head = $household['head'];
            if (! $head) {
                continue;
            }

            $familyId = DB::table('families')
                ->where('community_id', $community->id)
                ->where('family_number', $household['number'])
                ->value('id');

            $payload = [
                'community_id' => $community->id,
                'head_user_id' => $head->id,
                'family_number' => $household['number'],
                'name' => $household['name'],
                'status' => 'active',
                'updated_at' => now(),
            ];

            if ($familyId) {
                DB::table('families')->where('id', $familyId)->update($payload);
            } else {
                $familyId = DB::table('families')->insertGetId(
                    $payload + ['created_at' => now()->subMonths(11)]
                );
            }

            $members = array_merge(
                [['user' => $head, 'relationship' => 'Head of household', 'role' => 'head']],
                $household['members'],
            );

            foreach ($members as $member) {
                if (! $member['user']) {
                    continue;
                }

                DB::table('family_members')->updateOrInsert(
                    ['family_id' => $familyId, 'user_id' => $member['user']->id],
                    [
                        'role' => $member['role'] ?? 'member',
                        'status' => 'active',
                        'relationship' => $member['relationship'],
                        'added_by_user_id' => $head->id,
                        'joined_at' => now()->subMonths(10),
                        'updated_at' => now(),
                        'created_at' => now()->subMonths(10),
                    ],
                );
            }
        }

        $this->command?->info('  Families ready: 2 households');
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
