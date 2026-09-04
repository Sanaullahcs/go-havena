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
 * Flagship Boston demo used for sales presentations.
 *
 * Resident:        resident@gohavena.com   OTP 221322
 * Community admin: community@gohavena.com  OTP 221322
 */
class BostonDemoSeeder extends Seeder
{
    public const COMMUNITY_NAME = 'Harbor Point Residences';

    public const COMMUNITY_ADDRESS = '50 Liberty Drive, Boston, MA 02210';

    public const INVITE_CODE = 'HARBOR-2026';

    public const RESIDENT_EMAIL = 'resident@gohavena.com';

    public const ADMIN_EMAIL = 'community@gohavena.com';

    public const DEMO_OTP = '221322';

    public const RESIDENT_PHONE = '+16175551020';

    public const ADMIN_PHONE = '+16175551010';

    public function run(): void
    {
        $this->call(RegionSeeder::class);

        $region = Region::query()->updateOrCreate(
            ['title' => 'Massachusetts - Boston'],
            [
                'area' => 'Greater Boston',
                'state' => 'Massachusetts',
                'users_label' => '2,840 residents',
                'sort_order' => 0,
                'status' => 'active',
            ],
        );

        $community = $this->seedCommunity($region);
        $admin = $this->seedCommunityAdmin($region, $community);
        $this->seedPrimaryResident($region, $community);
        $this->seedNeighbors($region, $community);
        $this->seedInviteCode($community, $admin);
        $this->seedBilling($community);

        $this->command?->info('');
        $this->command?->info('Boston demo accounts (OTP '.self::DEMO_OTP.'):');
        $this->command?->info('  Resident:        '.self::RESIDENT_EMAIL);
        $this->command?->info('  Community admin: '.self::ADMIN_EMAIL);
        $this->command?->info('  Community:       '.$community->name.' — '.$community->address);
    }

    public static function showcaseCommunityQuery()
    {
        return DB::table('communities')->where('name', self::COMMUNITY_NAME);
    }

    private function seedCommunity(Region $region): Community
    {
        $community = Community::query()->updateOrCreate(
            ['name' => self::COMMUNITY_NAME],
            [
                'region' => $region->title,
                'region_id' => $region->id,
                'address' => self::COMMUNITY_ADDRESS,
                'description' => 'Waterfront residences in Boston’s Seaport District. Residents share a fitness studio, courtyard garden, lounge, and 24-hour concierge along the Harborwalk.',
                'timezone' => 'America/New_York',
                'status' => 'active',
                'review_status' => 'approved',
                'reviewed_at' => now()->subMonths(8),
                'estimated_residents' => 186,
                'latitude' => 42.34955,
                'longitude' => -71.04185,
            ],
        );

        $this->command?->info('  Community ready: '.$community->name);

        return $community;
    }

    private function seedCommunityAdmin(Region $region, Community $community): User
    {
        $joinedAt = now()->subMonths(8);
        $profileUpdatedAt = now()->subMonths(2);

        $admin = $this->upsertUser(self::ADMIN_EMAIL, [
            'name' => 'Elena Vasquez',
            'phone' => self::ADMIN_PHONE,
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'email_verified_at' => $joinedAt,
            'phone_verified_at' => $joinedAt,
        ], $joinedAt);

        $this->upsertProfile($admin, [
            'display_name' => 'Elena Vasquez',
            'avatar_url' => '/storage/seed/avatar-admin.jpg',
            'unit_number' => 'Management Office',
            'residence_type' => 'Management',
            'bio' => 'Community manager at Harbor Point Residences. I look after notices, amenities, and day-to-day resident services for our Seaport neighbors.',
            'region_id' => $region->id,
        ], $joinedAt, $profileUpdatedAt);

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
        $joinedAt = now()->subMonths(6);
        $profileUpdatedAt = now()->subMonths(1);

        $resident = $this->upsertUser(self::RESIDENT_EMAIL, [
            'name' => 'James Whitaker',
            'phone' => self::RESIDENT_PHONE,
            'role' => 'resident',
            'status' => 'active',
            'email_verified_at' => $joinedAt,
            'phone_verified_at' => $joinedAt,
        ], $joinedAt);

        $this->upsertProfile($resident, [
            'display_name' => 'James Whitaker',
            'avatar_url' => '/storage/seed/avatar-alex.jpg',
            'unit_number' => '1204',
            'residence_type' => 'homeowner',
            'bio' => 'Harbor Point homeowner in the Seaport. I work in downtown Boston and spend weekends on the Harborwalk, at SoWa, and catching a game when I can.',
            'region_id' => $region->id,
        ], $joinedAt, $profileUpdatedAt);

        $this->upsertMembership($resident, $community, 'member', 'approved', $joinedAt);

        $this->command?->info('  Resident ready: '.self::RESIDENT_EMAIL);
    }

    private function seedNeighbors(Region $region, Community $community): void
    {
        $neighbors = [
            [
                'name' => 'Sophia Callahan',
                'email' => 'sophia.harbor@havena.app',
                'phone' => '+16175551021',
                'unit' => '805',
                'residence' => 'homeowner',
                'bio' => 'Architect with a studio in Fort Point. Morning Harborwalk runner and courtyard-garden volunteer.',
                'avatar' => '/storage/seed/avatar-02.jpg',
            ],
            [
                'name' => 'Marcus Reed',
                'email' => 'marcus.harbor@havena.app',
                'phone' => '+16175551022',
                'unit' => '1412',
                'residence' => 'tenant',
                'bio' => 'Product manager who lives for Seaport food halls, the Greenway, and a good Saturday market.',
                'avatar' => '/storage/seed/avatar-03.jpg',
            ],
            [
                'name' => 'Amara Diallo',
                'email' => 'amara.harbor@havena.app',
                'phone' => '+16175551023',
                'unit' => '610',
                'residence' => 'homeowner',
                'bio' => 'Pediatric nurse at Mass General. I host the building book swap in the resident lounge.',
                'avatar' => '/storage/seed/avatar-04.jpg',
            ],
            [
                'name' => 'Thomas Nguyen',
                'email' => 'thomas.harbor@havena.app',
                'phone' => '+16175551024',
                'unit' => '1502',
                'residence' => 'homeowner',
                'bio' => 'Works in finance on the waterfront. Early-morning rower on the Charles when the weather cooperates.',
                'avatar' => '/storage/seed/avatar-05.jpg',
            ],
            [
                'name' => 'Claire Brennan',
                'email' => 'claire.harbor@havena.app',
                'phone' => '+16175551025',
                'unit' => '918',
                'residence' => 'tenant',
                'bio' => 'Teacher in the North End. Saturday SoWa regular and always up for a neighborhood coffee.',
                'avatar' => '/storage/seed/avatar-06.jpg',
            ],
            [
                'name' => 'Diego Morales',
                'email' => 'diego.harbor@havena.app',
                'phone' => '+16175551026',
                'unit' => '1106',
                'residence' => 'homeowner',
                'bio' => 'Chef exploring Boston’s neighborhood restaurants. Happy to share Fort Point and Seaport tips.',
                'avatar' => '/storage/seed/avatar-07.jpg',
            ],
        ];

        foreach ($neighbors as $index => $person) {
            $joinedAt = now()->subMonths(7)->addWeeks($index);
            $user = $this->upsertUser($person['email'], [
                'name' => $person['name'],
                'phone' => $person['phone'],
                'role' => 'resident',
                'status' => 'active',
                'email_verified_at' => $joinedAt,
                'phone_verified_at' => $joinedAt,
            ], $joinedAt);

            $this->upsertProfile($user, [
                'display_name' => $person['name'],
                'avatar_url' => $person['avatar'],
                'unit_number' => $person['unit'],
                'residence_type' => $person['residence'],
                'bio' => $person['bio'],
                'region_id' => $region->id,
            ], $joinedAt, $joinedAt->copy()->addWeeks(2));

            $this->upsertMembership($user, $community, 'member', 'approved', $joinedAt);
        }

        $this->command?->info('  Neighbors ready: '.count($neighbors).' approved residents');
    }

    private function seedInviteCode(Community $community, User $admin): void
    {
        InviteCode::query()->updateOrCreate(
            ['code' => self::INVITE_CODE],
            [
                'community_id' => $community->id,
                'created_by' => $admin->id,
                'max_uses' => null,
                'used_count' => 12,
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
                'seat_limit' => 250,
                'extra_seats' => 0,
                'estimated_residents' => 186,
                'current_period_start' => now()->subMonths(2),
                'current_period_end' => now()->addMonths(10),
                'cancel_at_period_end' => false,
                'meta' => [
                    'activated_via' => 'manual',
                    'card_on_file' => true,
                    'demo_showcase' => true,
                    'granted_reason' => 'boston_demo',
                ],
            ],
        );
    }

    private function upsertUser(string $email, array $attributes, Carbon $createdAt): User
    {
        $verifiedAt = $attributes['email_verified_at'] ?? $createdAt;
        $phoneVerifiedAt = $attributes['phone_verified_at'] ?? $createdAt;
        unset($attributes['email_verified_at'], $attributes['phone_verified_at']);

        $payload = array_merge($attributes, [
            'password' => 'password',
        ]);

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
            'email_verified_at' => $verifiedAt,
            'phone_verified_at' => $phoneVerifiedAt,
            'created_at' => $user->created_at ?: $createdAt,
        ])->save();

        return $user->fresh();
    }

    private function upsertProfile(User $user, array $attributes, Carbon $createdAt, Carbon $updatedAt): void
    {
        Profile::query()->updateOrCreate(
            ['user_id' => $user->id],
            $attributes,
        );

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
            [
                'user_id' => $user->id,
                'community_id' => $community->id,
            ],
            [
                'role' => $role,
                'status' => $status,
            ],
        );

        DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('community_id', $community->id)
            ->update([
                'created_at' => $createdAt,
                'updated_at' => $createdAt,
            ]);
    }
}
