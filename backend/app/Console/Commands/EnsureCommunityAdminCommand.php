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
                            {email : Login email}
                            {--phone= : Optional contact phone in international format}
                            {--name=Community Admin : Display name}
                            {--approve : Mark community admin as approved (default true)}';

    protected $description = 'Create or fix a community admin account that signs in with email OTP';

    public function handle(): int
    {
        $email = strtolower(trim((string) $this->argument('email')));
        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->error("Invalid email: {$email}");

            return self::FAILURE;
        }

        $phone = null;
        $rawPhone = trim((string) $this->option('phone'));
        if ($rawPhone !== '') {
            $phone = PhoneNormalizer::normalize($rawPhone);
            if (! $phone) {
                $this->error("Invalid phone: {$rawPhone}");

                return self::FAILURE;
            }
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

        $user = User::query()->where('email', $email)->first();
        if (! $user && $phone) {
            $user = User::query()->where('phone', $phone)->first();
        }

        $attributes = [
            'name' => (string) $this->option('name'),
            'email' => $email,
            'password' => 'password',
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'email_verified_at' => now(),
        ];
        if ($phone) {
            $attributes['phone'] = $phone;
            $attributes['phone_verified_at'] = now();
        }

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

        $this->info("Community admin ready: {$email} / OTP 123456 (local) → {$community->name}");

        return self::SUCCESS;
    }
}
