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
 * AIDA Muscat — luxury coastal residential demo (DarGlobal / OMRAN, Yiti & Yenkit).
 *
 * Community admin: aida@gohavena.com         OTP 221322
 * Residents:       zaeem.chaudhry@gmail.com, faisalaljamil@gmail.com, syed@gohavena.com
 *
 * Run: php artisan db:seed --class=Database\Seeders\AidaMuscatCommunitySeeder
 */
class AidaMuscatCommunitySeeder extends Seeder
{
    public const COMMUNITY_NAME = 'AIDA Muscat';

    public const DISPLAY_NAME = 'AIDA';

    public const COMMUNITY_CODE = 'AIDA-MCT';

    public const REGION_TITLE = 'Muscat Governorate - AIDA';

    public const COMMUNITY_ADDRESS = 'AIDA by DarGlobal, Yiti and Yenkit, Muscat Governorate, Sultanate of Oman';

    public const CURRENCY = 'OMR';

    public const TIMEZONE = 'Asia/Muscat';

    public const INVITE_CODE = 'AIDA-MCT';

    public const ADMIN_EMAIL = 'aida@gohavena.com';

    public const DEMO_OTP = '221322';

    public const ADMIN_PHONE = '+96824123456';

    public const ESTIMATED_RESIDENTS = 420;

    /** @var list<array{email: string, name: string, phone: string, unit: string, collection: string, bio: string, avatar: string}> */
    public const RESIDENTS = [
        [
            'email' => 'zaeem.chaudhry@gmail.com',
            'name' => 'Zaeem Chaudhry',
            'phone' => '+96891234501',
            'unit' => 'FV-012',
            'collection' => 'Fairway Villas',
            'bio' => 'Fairway Villas homeowner at AIDA. Golf on weekends, community apps on weekdays. Fairway Villas, FV-012.',
            'avatar' => '/storage/seed/avatar-admin.jpg',
        ],
        [
            'email' => 'faisalaljamil@gmail.com',
            'name' => 'Faisal Al Jamil',
            'phone' => '+96891234502',
            'unit' => 'SH-008',
            'collection' => 'Sunrise Haven',
            'bio' => 'Sunrise Haven resident — morning runs along the coastal path and occasional padel at the club.',
            'avatar' => '/storage/seed/avatar-05.jpg',
        ],
        [
            'email' => 'syed@gohavena.com',
            'name' => 'Syed Gilani',
            'phone' => '+96891234503',
            'unit' => 'AOV-015',
            'collection' => 'Azure Oceanfront Villas',
            'bio' => 'Azure Oceanfront Villas. Here for the Gulf horizon and to stress-test Havena across communities.',
            'avatar' => '/storage/seed/avatar-07.jpg',
        ],
    ];

  /** @return list<array{zone: string, units: list<string>}> */
    public static function unitInventory(): array
    {
        return [
            ['zone' => 'The Great Escape', 'units' => ['TGE-001', 'TGE-008', 'TGE-015', 'TGE-022']],
            ['zone' => 'The Great Escape 2', 'units' => ['TGE2-003', 'TGE2-011', 'TGE2-019']],
            ['zone' => 'Fairway Villas', 'units' => ['FV-004', 'FV-012', 'FV-018', 'FV-024']],
            ['zone' => 'Sunrise Haven', 'units' => ['SH-002', 'SH-008', 'SH-014', 'SH-020']],
            ['zone' => 'Trump Golf Villas', 'units' => ['TGV-005', 'TGV-012', 'TGV-019']],
            ['zone' => 'Trump Cliff Villas', 'units' => ['TCV-003', 'TCV-009', 'TCV-016']],
            ['zone' => 'Coastal Investment Villas', 'units' => ['CIV-006', 'CIV-013', 'CIV-021']],
            ['zone' => 'Azure Oceanfront Villas', 'units' => ['AOV-007', 'AOV-015', 'AOV-023']],
            ['zone' => 'Marriott Residences', 'units' => ['MR-1001', 'MR-1204', 'MR-1508', 'MR-1802']],
        ];
    }

    public function run(): void
    {
        $region = $this->seedRegion();
        $community = $this->seedCommunity($region);

        $admin = $this->seedCommunityAdmin($region, $community);
        $this->seedResidents($region, $community);
        $this->seedUnitInventory($community);
        $this->assignResidentUnits($community);
        $this->seedInviteCode($community, $admin);
        $this->seedBilling($community);

        $content = new AidaMuscatContentSeeder;
        $content->communityId = (int) $community->id;
        if ($this->command) {
            $content->setCommand($this->command);
        }
        $content->run();

        $this->command?->info('');
        $this->command?->info('AIDA Muscat ready (OTP '.self::DEMO_OTP.'):');
        $this->command?->info('  Community:       '.$community->name.' #'.$community->id);
        $this->command?->info('  Display:         '.self::DISPLAY_NAME.' ('.self::COMMUNITY_CODE.')');
        $this->command?->info('  Admin portal:    '.self::ADMIN_EMAIL);
        $this->command?->info('  Residents:       '.implode(', ', array_column(self::RESIDENTS, 'email')));
        $this->command?->info('  Invite code:     '.self::INVITE_CODE);
    }

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
                'area' => 'Yiti, Yenkit & Quriyat Coast, Muscat, Oman',
                'state' => 'Muscat',
                'users_label' => '1.6m residents',
                'sort_order' => 45,
                'status' => 'active',
            ],
        );

        if (! $region->state_id) {
            $stateId = DB::table('states')
                ->join('countries', 'countries.id', '=', 'states.country_id')
                ->where('countries.code', 'OM')
                ->whereIn('states.name', ['Muscat', 'Masqat'])
                ->value('states.id');

            if ($stateId) {
                $region->forceFill(['state_id' => $stateId])->save();
            }
        }

        return $region->fresh();
    }

    private function seedCommunity(Region $region): Community
    {
        $description = 'AIDA Muscat is a prestigious coastal residential community overlooking the Gulf of Oman at Yiti and Yenkit. '
            .'Developed by DarGlobal in partnership with OMRAN Group, AIDA combines contemporary architecture, luxury residences, '
            .'landscaped open spaces, golf facilities and curated lifestyle programming along the Sultanate\'s eastern shoreline.';

        $settings = [
            'display_name' => self::DISPLAY_NAME,
            'community_code' => self::COMMUNITY_CODE,
            'community_type' => 'Luxury Residential Community',
            'developer' => 'DarGlobal',
            'development_partner' => 'OMRAN Group',
            'country' => 'Oman',
            'city' => 'Muscat',
            'area' => 'Yiti and Yenkit',
            'phone_country_code' => '+968',
            'languages' => ['en', 'ar'],
            'community_email' => self::ADMIN_EMAIL,
            'profile_image_url' => '/storage/seed/aida/profile.jpg',
            'cover_image_url' => '/storage/seed/aida/cover.jpg',
            'residential_collections' => array_column(self::unitInventory(), 'zone'),
        ];

        $attributes = [
            'name' => self::COMMUNITY_NAME,
            'region' => $region->title,
            'region_id' => $region->id,
            'address' => self::COMMUNITY_ADDRESS,
            'description' => $description,
            'timezone' => self::TIMEZONE,
            'currency' => self::CURRENCY,
            'settings' => $settings,
            'status' => 'active',
            'review_status' => 'approved',
            'reviewed_at' => now()->subMonths(14),
            'estimated_residents' => self::ESTIMATED_RESIDENTS,
            'latitude' => 23.5694,
            'longitude' => 58.5921,
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

    private function seedCommunityAdmin(Region $region, Community $community): User
    {
        $joinedAt = now()->subMonths(11);

        $existing = User::query()->where('email', self::ADMIN_EMAIL)->first();
        $role = $existing?->role === 'system_admin' ? 'system_admin' : 'community_admin';

        $admin = $this->upsertUser(self::ADMIN_EMAIL, [
            'name' => 'Zaeem Chaudhry',
            'phone' => self::ADMIN_PHONE,
            'role' => $role,
            'community_admin_status' => 'approved',
            'status' => 'active',
            'active_context' => 'community_admin',
            'active_context_community_id' => $community->id,
        ], $joinedAt);

        $this->upsertProfile($admin, [
            'display_name' => 'Zaeem Chaudhry',
            'avatar_url' => '/storage/seed/aida/profile.jpg',
            'unit_number' => 'Management',
            'residence_type' => 'Management',
            'office_address' => 'AIDA Community Management Office, Yenkit Boulevard',
            'bio' => 'Community Administrator for AIDA Muscat. The management office is open Sunday to Thursday, 8:30am to 5:30pm, at the Yenkit Boulevard welcome centre.',
            'region_id' => $region->id,
        ], $joinedAt, now()->subWeek());

        $this->upsertMembership($admin, $community, 'admin', 'approved', $joinedAt);

        app(UnitAssignmentService::class)
            ->assignUserToUnitNumber((int) $community->id, (int) $admin->id, 'Office', true);

        $this->command?->info('  Community admin ready: '.self::ADMIN_EMAIL);

        return $admin->fresh();
    }

    private function seedResidents(Region $region, Community $community): void
    {
        foreach (self::RESIDENTS as $index => $person) {
            $joinedAt = now()->subMonths(8)->addWeeks($index * 3);

            $existing = User::query()->whereRaw('LOWER(email) = ?', [strtolower($person['email'])])->first();
            $role = $existing && in_array($existing->role, ['system_admin', 'community_admin'], true)
                ? null
                : 'resident';

            $attrs = [
                'name' => $person['name'],
                'phone' => $person['phone'],
                'status' => 'active',
            ];
            if ($role) {
                $attrs['role'] = $role;
            }

            $user = $this->upsertUser($person['email'], $attrs, $joinedAt);

            $this->upsertProfile($user, [
                'display_name' => $person['name'],
                'avatar_url' => $person['avatar'],
                'unit_number' => $person['unit'],
                'residence_type' => 'homeowner',
                'bio' => $person['bio'],
                'region_id' => $region->id,
            ], $joinedAt, now()->subDays(4 + $index));

            $this->upsertMembership($user, $community, 'member', 'approved', $joinedAt);
        }

        $this->command?->info('  Residents attached: '.count(self::RESIDENTS).' (existing memberships preserved)');
    }

    private function seedUnitInventory(Community $community): void
    {
        $units = app(UnitAssignmentService::class);
        $created = 0;

        foreach (self::unitInventory() as $block) {
            foreach ($block['units'] as $unitNumber) {
                if (! $units->unitNumberExistsInCommunity((int) $community->id, $unitNumber)) {
                    $units->createUnit((int) $community->id, $unitNumber);
                    $created++;
                }
            }
        }

        if (! $units->unitNumberExistsInCommunity((int) $community->id, 'Office')) {
            $units->createUnit((int) $community->id, 'Office', UnitAssignmentService::KIND_OFFICE);
        }

        $this->command?->info('  Unit inventory: '.count(self::unitInventory()).' collections, '.$created.' new units');
    }

    private function assignResidentUnits(Community $community): void
    {
        $units = app(UnitAssignmentService::class);

        foreach (self::RESIDENTS as $person) {
            $user = User::query()->whereRaw('LOWER(email) = ?', [strtolower($person['email'])])->first();
            if (! $user) {
                continue;
            }
            $units->assignUserToUnitNumber((int) $community->id, (int) $user->id, $person['unit'], false, true);
        }
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
                'seat_limit' => 600,
                'extra_seats' => 0,
                'estimated_residents' => self::ESTIMATED_RESIDENTS,
                'current_period_start' => now()->subMonths(2),
                'current_period_end' => now()->addMonths(10),
                'cancel_at_period_end' => false,
                'meta' => [
                    'activated_via' => 'manual',
                    'granted_reason' => 'aida_muscat_demo',
                ],
            ],
        );
    }

    private function upsertUser(string $email, array $attributes, Carbon $createdAt): User
    {
        $payload = array_merge($attributes, ['password' => 'password']);

        $user = User::query()->whereRaw('LOWER(email) = ?', [strtolower($email)])->first();

        if ($user) {
            unset($payload['password']);
            $user->update($payload);
        } else {
            $user = User::query()->create(array_merge($payload, [
                'uuid' => (string) Str::ulid(),
                'email' => strtolower($email),
                'password' => 'password',
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