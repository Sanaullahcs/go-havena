<?php

namespace Database\Seeders;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Profile;
use App\Models\Region;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Fully onboarded mobile test accounts — email OTP 123456 in local/uat env.
 *
 * Resident:        test.resident@havena.app
 * Community admin: test.community.admin@havena.app
 */
class MobileTestAccountsSeeder extends Seeder
{
    public const RESIDENT_PHONE = '+15555550100';
    public const RESIDENT_EMAIL = 'test.resident@havena.app';

    public const COMMUNITY_ADMIN_PHONE = '+15555550200';
    public const COMMUNITY_ADMIN_EMAIL = 'test.community.admin@havena.app';

    public const LEGACY_RESIDENT_PHONE = '+15555555555';
    public const LEGACY_ADMIN_PHONE = '+15556668888';

    public function run(): void
    {
        $region = Region::query()
            ->where('status', 'active')
            ->orderBy('sort_order')
            ->first();

        $community = Community::query()
            ->where('name', BostonDemoSeeder::COMMUNITY_NAME)
            ->where('status', 'active')
            ->first()
            ?? Community::query()
                ->where('status', 'active')
                ->where(function ($q) {
                    $q->whereNull('review_status')->orWhere('review_status', 'approved');
                })
                ->orderBy('id')
                ->first();

        if (! $community) {
            $this->command?->warn('MobileTestAccountsSeeder: no active community — run MainSeeder first.');

            return;
        }

        if ($region && ! $community->region_id) {
            $community->update(['region_id' => $region->id]);
        }

        $this->seedResident(
            phone: self::RESIDENT_PHONE,
            email: self::RESIDENT_EMAIL,
            name: 'Alex Rivera',
            displayName: 'Alex Rivera',
            unit: 'Apt 101',
            residenceType: 'Two-bedroom',
            region: $region,
            community: $community,
        );

        $this->seedCommunityAdmin(
            phone: self::COMMUNITY_ADMIN_PHONE,
            email: self::COMMUNITY_ADMIN_EMAIL,
            name: 'Test Community Admin',
            region: $region,
            community: $community,
        );

        $this->refreshLegacyResident($region, $community);
        $this->command?->call('db:seed', ['--class' => CommunityAdminSeeder::class]);

        $this->command?->info('');
        $this->command?->info('Mobile test accounts (email OTP 123456 in local env):');
        $this->command?->info('  Resident:        test.resident@havena.app');
        $this->command?->info('  Community admin: test.community.admin@havena.app');
        $this->command?->info('  Legacy resident: sarah@havena.app');
        $this->command?->info('  Legacy admin:    community.admin@havena.app');
    }

    private function seedResident(
        string $phone,
        string $email,
        string $name,
        string $displayName,
        string $unit,
        string $residenceType,
        ?Region $region,
        Community $community,
    ): void {
        $user = User::query()->updateOrCreate(
            ['email' => $email],
            [
                'uuid'              => (string) Str::ulid(),
                'name'              => $name,
                'phone'             => $phone,
                'password'          => bcrypt('password'),
                'role'              => 'resident',
                'status'            => 'active',
                'email_verified_at' => now(),
                'phone_verified_at' => now(),
            ],
        );

        Profile::query()->updateOrCreate(
            ['user_id' => $user->id],
            [
                'display_name'   => $displayName,
                'avatar_url'     => '/storage/seed/avatar-alex.jpg',
                'unit_number'    => $unit,
                'residence_type' => $residenceType,
                'bio'            => "Resident at {$community->name}. Weekend runner and farmers-market regular.",
                'region_id'      => $region?->id ?? $community->region_id,
            ],
        );

        CommunityMembership::query()->updateOrCreate(
            [
                'user_id'      => $user->id,
                'community_id' => $community->id,
            ],
            [
                'role'   => 'member',
                'status' => 'approved',
            ],
        );

        $this->command?->info("  Resident ready: {$email} → {$community->name}");
    }

    private function seedCommunityAdmin(
        string $phone,
        string $email,
        string $name,
        ?Region $region,
        Community $community,
    ): void {
        $user = User::query()->updateOrCreate(
            ['email' => $email],
            [
                'uuid'                   => (string) Str::ulid(),
                'name'                   => $name,
                'phone'                  => $phone,
                'password'               => bcrypt('password'),
                'role'                   => 'community_admin',
                'community_admin_status' => 'approved',
                'status'                 => 'active',
                'email_verified_at'      => now(),
                'phone_verified_at'      => now(),
            ],
        );

        Profile::query()->updateOrCreate(
            ['user_id' => $user->id],
            [
                'display_name'   => $name,
                'avatar_url'     => '/storage/seed/avatar-admin.jpg',
                'unit_number'    => 'Management Office',
                'residence_type' => 'Office',
                'bio'            => "Test community admin for {$community->name}.",
                'region_id'      => $region?->id ?? $community->region_id,
            ],
        );

        CommunityMembership::query()->updateOrCreate(
            [
                'user_id'      => $user->id,
                'community_id' => $community->id,
            ],
            [
                'role'   => 'admin',
                'status' => 'approved',
            ],
        );

        CommunityMembership::query()
            ->where('user_id', $user->id)
            ->where('community_id', '!=', $community->id)
            ->delete();

        $this->command?->info("  Community admin ready: {$email} → {$community->name}");
    }

    private function refreshLegacyResident(?Region $region, Community $community): void
    {
        $user = User::query()->where('phone', self::LEGACY_RESIDENT_PHONE)
            ->orWhere('email', 'sarah@havena.app')
            ->first();

        if (! $user) {
            return;
        }

        $user->update([
            'phone'             => self::LEGACY_RESIDENT_PHONE,
            'phone_verified_at' => $user->phone_verified_at ?? now(),
            'status'            => 'active',
            'role'              => 'resident',
        ]);

        Profile::query()->updateOrCreate(
            ['user_id' => $user->id],
            [
                'display_name'   => $user->name ?? 'Sarah Mitchell',
                'unit_number'    => 'Apt 4B',
                'residence_type' => 'Two-bedroom',
                'bio'            => "Resident at {$community->name}.",
                'region_id'      => $region?->id ?? $community->region_id,
            ],
        );

        CommunityMembership::query()->updateOrCreate(
            [
                'user_id'      => $user->id,
                'community_id' => $community->id,
            ],
            [
                'role'   => 'member',
                'status' => 'approved',
            ],
        );

        $this->command?->info('  Legacy resident refreshed: '.self::LEGACY_RESIDENT_PHONE);
    }
}
