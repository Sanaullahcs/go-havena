<?php

namespace App\Console\Commands;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Profile;
use App\Models\Region;
use App\Models\User;
use App\Support\PhoneNormalizer;
use Illuminate\Console\Command;

class EnsureCommunityAdminCommand extends Command
{
    protected $signature = 'havena:ensure-community-admin
                            {phone : Phone in international format, e.g. +2017777777}
                            {--name=Community Admin : Display name}
                            {--approve : Mark community admin as approved (default true)}';

    protected $description = 'Create or fix a community admin account with the correct E.164 phone';

    public function handle(): int
    {
        $rawPhone = (string) $this->argument('phone');
        $phone = PhoneNormalizer::normalize($rawPhone);

        if (! $phone) {
            $this->error("Invalid phone: {$rawPhone}");

            return self::FAILURE;
        }

        $community = Community::query()
            ->where('status', 'active')
            ->where(function ($q) {
                $q->whereNull('review_status')->orWhere('review_status', 'approved');
            })
            ->orderBy('id')
            ->first();

        if (! $community) {
            $this->error('No active community found. Run CommunitySeeder first.');

            return self::FAILURE;
        }

        $region = Region::query()->where('status', 'active')->orderBy('sort_order')->first();

        $user = User::query()->where('phone', $phone)->first();

        if (! $user) {
            foreach (PhoneNormalizer::alternatesForLookup($phone) as $alternate) {
                $user = User::query()->where('phone', $alternate)->first();
                if ($user) {
                    break;
                }
            }
        }

        $attributes = [
            'name' => (string) $this->option('name'),
            'phone' => $phone,
            'email' => str_replace('+', '', $phone).'@phone.havena.local',
            'password' => 'password',
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'phone_verified_at' => now(),
        ];

        if ($user) {
            $user->update($attributes);
        } else {
            $user = User::query()->create($attributes);
        }

        Profile::query()->updateOrCreate(
            ['user_id' => $user->id],
            [
                'display_name' => (string) $this->option('name'),
                'unit_number' => 'Office',
                'residence_type' => 'Management',
                'region_id' => $region?->id ?? $community->region_id,
            ],
        );

        CommunityMembership::query()->updateOrCreate(
            [
                'user_id' => $user->id,
                'community_id' => $community->id,
            ],
            [
                'role' => 'admin',
                'status' => 'approved',
            ],
        );

        $this->info("Community admin ready: {$phone} / OTP 123456 (local) → {$community->name}");

        return self::SUCCESS;
    }
}
