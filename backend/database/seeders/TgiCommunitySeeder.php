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
 * Clean TGI community in Pakistan - Lahore for local amenity/service testing.
 *
 * Community admin: tgi.admin@havena.app (also tgiadmin@havena.app)
 * Residents:       tgi.resident1@havena.app … tgi.resident4@havena.app
 * Local OTP:       123456
 * Password:        password
 */
class TgiCommunitySeeder extends Seeder
{
    public const COMMUNITY_NAME = 'TGI';

    public const COMMUNITY_ADDRESS = 'TGI Community, Lahore, Punjab, Pakistan';

    public const INVITE_CODE = 'TGI-2026';

    public const ADMIN_EMAIL = 'tgi.admin@havena.app';

    public const ADMIN_PHONE = '+923001111111';

    /** @var list<array{name: string, email: string, phone: string, unit: string, residence: string, bio: string}> */
    public const RESIDENTS = [
        [
            'name' => 'Ali Khan',
            'email' => 'tgi.resident1@havena.app',
            'phone' => '+923002222221',
            'unit' => 'A-101',
            'residence' => 'homeowner',
            'bio' => 'Resident at TGI in Lahore. Homeowner in Block A.',
        ],
        [
            'name' => 'Fatima Ahmed',
            'email' => 'tgi.resident2@havena.app',
            'phone' => '+923002222222',
            'unit' => 'B-202',
            'residence' => 'tenant',
            'bio' => 'Resident at TGI in Lahore. Lives in Block B with family.',
        ],
        [
            'name' => 'Hassan Raza',
            'email' => 'tgi.resident3@havena.app',
            'phone' => '+923002222223',
            'unit' => 'C-303',
            'residence' => 'homeowner',
            'bio' => 'Resident at TGI in Lahore. Homeowner in Block C.',
        ],
        [
            'name' => 'Sara Ali',
            'email' => 'tgi.resident4@havena.app',
            'phone' => '+923002222224',
            'unit' => 'A-101',
            'residence' => 'tenant',
            'bio' => 'Resident at TGI in Lahore. Shares unit A-101.',
        ],
    ];

    public function run(): void
    {
        $this->call(RegionSeeder::class);

        $region = Region::query()->where('title', 'Pakistan - Lahore')->firstOrFail();

        $community = $this->seedCommunity($region);
        $this->seedBilling($community);
        $admin = $this->seedCommunityAdmin($region, $community);
        $this->seedResidents($region, $community);
        $this->seedInviteCode($community, $admin);

        $this->command?->info('');
        $this->command?->info('TGI community ready (OTP 123456 in local env):');
        $this->command?->info('  Community:       '.$community->name.' — '.$community->address);
        $this->command?->info('  Region:          '.$region->title);
        $this->command?->info('  Community admin: '.self::ADMIN_EMAIL);
        foreach (self::RESIDENTS as $resident) {
            $this->command?->info('  Resident:        '.$resident['email'].'  ('.$resident['unit'].')');
        }
    }

    private function seedCommunity(Region $region): Community
    {
        $community = Community::query()->updateOrCreate(
            ['name' => self::COMMUNITY_NAME],
            [
                'region' => $region->title,
                'region_id' => $region->id,
                'address' => self::COMMUNITY_ADDRESS,
                'description' => 'TGI residential community in Lahore for local testing.',
                'timezone' => 'Asia/Karachi',
                'status' => 'active',
                'review_status' => 'approved',
                'reviewed_at' => now()->subMonths(2),
                'estimated_residents' => 5,
                'latitude' => 31.4754244,
                'longitude' => 74.4014853,
            ],
        );

        $this->command?->info('  Community ready: '.$community->name);

        return $community;
    }

    private function seedBilling(Community $community): void
    {
        CommunitySubscription::query()->updateOrCreate(
            ['community_id' => $community->id],
            [
                'plan_slug' => 'starter',
                'billing_interval' => 'month',
                'status' => CommunitySubscription::STATUS_ACTIVE,
                'seat_limit' => 100,
                'extra_seats' => 0,
                'estimated_residents' => 5,
                'current_period_start' => now()->subMonth(),
                'current_period_end' => now()->addMonth(),
                'cancel_at_period_end' => false,
                'meta' => [
                    'activated_via' => 'manual',
                    'card_on_file' => true,
                    'granted_reason' => 'tgi_local',
                ],
            ],
        );
    }

    private function seedCommunityAdmin(Region $region, Community $community): User
    {
        $joinedAt = now()->subMonths(3);

        $admin = $this->upsertUser(self::ADMIN_EMAIL, [
            'name' => 'Ayesha Malik',
            'phone' => self::ADMIN_PHONE,
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'email_verified_at' => $joinedAt,
            'phone_verified_at' => $joinedAt,
        ], $joinedAt);

        $this->upsertProfile($admin, [
            'display_name' => 'Ayesha Malik',
            'avatar_url' => '/storage/seed/avatar-admin.jpg',
            'utility_bill_url' => '/storage/seed/utility-bill-admin.jpg',
            'unit_number' => 'Office',
            'residence_type' => 'Management',
            'bio' => 'Community manager at TGI, Lahore. I look after notices, amenities, and resident services.',
            'region_id' => $region->id,
        ], $joinedAt);

        $this->upsertMembership($admin, $community, 'admin', 'approved', $joinedAt);

        CommunityMembership::query()
            ->where('user_id', $admin->id)
            ->where('community_id', '!=', $community->id)
            ->delete();

        $community->update(['requested_by_user_id' => $admin->id]);

        app(UnitAssignmentService::class)->assignUserToUnitNumber(
            (int) $community->id,
            (int) $admin->id,
            'Office',
            true,
        );

        $this->command?->info('  Community admin ready: '.self::ADMIN_EMAIL);

        return $admin;
    }

    private function seedResidents(Region $region, Community $community): void
    {
        $units = app(UnitAssignmentService::class);

        foreach (self::RESIDENTS as $index => $person) {
            $joinedAt = now()->subMonths(2)->addWeeks($index);

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
                'avatar_url' => '/storage/seed/avatar-0'.($index + 2).'.jpg',
                'utility_bill_url' => '/storage/seed/utility-bill-resident.jpg',
                'unit_number' => $person['unit'],
                'residence_type' => $person['residence'],
                'bio' => $person['bio'],
                'region_id' => $region->id,
            ], $joinedAt);

            $this->upsertMembership($user, $community, 'member', 'approved', $joinedAt);

            $units->assignUserToUnitNumber(
                (int) $community->id,
                (int) $user->id,
                $person['unit'],
            );
        }

        $this->command?->info('  Residents ready: '.count(self::RESIDENTS));
    }

    private function seedInviteCode(Community $community, User $admin): void
    {
        InviteCode::query()->updateOrCreate(
            ['code' => self::INVITE_CODE],
            [
                'community_id' => $community->id,
                'created_by' => $admin->id,
                'max_uses' => null,
                'used_count' => 0,
                'expires_at' => null,
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

    private function upsertProfile(User $user, array $attributes, Carbon $createdAt): void
    {
        Profile::query()->updateOrCreate(
            ['user_id' => $user->id],
            $attributes,
        );

        DB::table('profiles')->where('user_id', $user->id)->update([
            'created_at' => $createdAt,
            'updated_at' => $createdAt,
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
