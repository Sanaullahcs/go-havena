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
 * Dev community admin — email OTP login on mobile and web.
 * Email: community.admin@havena.app, OTP: 123456 (local env)
 */
class CommunityAdminSeeder extends Seeder
{
    public const DEV_PHONE = '+15556668888';
    public const DEV_EMAIL = 'community.admin@havena.app';

    public function run(): void
    {
        $region = Region::query()
            ->where('status', 'active')
            ->orderBy('sort_order')
            ->first();

        $community = Community::query()
            ->where('status', 'active')
            ->where(function ($q) {
                $q->whereNull('review_status')->orWhere('review_status', 'approved');
            })
            ->orderBy('id')
            ->first();

        if (! $community) {
            $this->command?->warn('CommunityAdminSeeder: no active community found. Run CommunitySeeder first.');

            return;
        }

        $user = User::query()->updateOrCreate(
            ['email' => self::DEV_EMAIL],
            [
                'uuid'                   => (string) Str::ulid(),
                'name'                   => 'Community Admin Demo',
                'phone'                  => self::DEV_PHONE,
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
                'display_name'   => 'Community Admin Demo',
                'unit_number'    => 'Office',
                'residence_type' => 'Management',
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

        $this->command?->info('CommunityAdminSeeder: '.self::DEV_EMAIL.' → '.$community->name.' (approved admin)');
    }
}
