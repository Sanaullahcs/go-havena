<?php

namespace App\Services;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Profile;
use App\Models\User;
use Database\Seeders\TgiCommunitySeeder;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Schema;

class LocalLoginAccountRestorer
{
    public const SYSTEM_ADMIN_EMAIL = 'admin@havena.app';

    public const SYSTEM_ADMIN_PASSWORD = 'password';

    public function usersAreMissing(): bool
    {
        if (! Schema::hasTable('users')) {
            return false;
        }

        $hasSystem = User::query()
            ->where('email', self::SYSTEM_ADMIN_EMAIL)
            ->whereNull('deleted_at')
            ->exists();
        $hasTgi = User::query()
            ->where('email', TgiCommunitySeeder::ADMIN_EMAIL)
            ->whereNull('deleted_at')
            ->exists();

        return ! $hasSystem || ! $hasTgi;
    }

    /** Fast path for HTTP: recreate the two login users without geography/demo data. */
    public function restoreUsers(): void
    {
        $this->ensureSystemAdmin(verifyLogin: false);
        $this->ensureTgiCommunityAdmin();
    }

    public function ensureSystemAdmin(
        string $email = self::SYSTEM_ADMIN_EMAIL,
        string $password = self::SYSTEM_ADMIN_PASSWORD,
        bool $verifyLogin = true,
    ): User {
        $user = User::query()->updateOrCreate(
            ['email' => $email],
            [
                'name' => 'Admin User',
                'password' => $password,
                'status' => 'active',
                'role' => 'system_admin',
            ],
        );

        $user->forceFill([
            'password' => $password,
            'status' => 'active',
            'role' => 'system_admin',
        ])->save();

        if ($verifyLogin) {
            if (! Auth::attempt(['email' => $email, 'password' => $password])) {
                throw new \RuntimeException("System admin was saved but login verification failed for {$email}.");
            }
            Auth::logout();
        }

        return $user->fresh();
    }

    public function ensureTgiCommunityAdmin(): User
    {
        $email = TgiCommunitySeeder::ADMIN_EMAIL;
        $joinedAt = now();

        $user = User::query()->updateOrCreate(
            ['email' => $email],
            [
                'name' => 'Ayesha Malik',
                'phone' => TgiCommunitySeeder::ADMIN_PHONE,
                'password' => 'password',
                'role' => 'community_admin',
                'community_admin_status' => 'approved',
                'status' => 'active',
                'email_verified_at' => $joinedAt,
                'phone_verified_at' => $joinedAt,
            ],
        );

        $user->forceFill([
            'password' => 'password',
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'email_verified_at' => $user->email_verified_at ?: $joinedAt,
            'phone_verified_at' => $user->phone_verified_at ?: $joinedAt,
        ])->save();

        Profile::query()->updateOrCreate(
            ['user_id' => $user->id],
            [
                'display_name' => 'Ayesha Malik',
                'unit_number' => 'Office',
                'residence_type' => 'Management',
            ],
        );

        if (Schema::hasTable('communities')) {
            $community = Community::query()
                ->where('name', TgiCommunitySeeder::COMMUNITY_NAME)
                ->first()
                ?? Community::query()
                    ->where('status', 'active')
                    ->where(function ($q) {
                        $q->whereNull('review_status')->orWhere('review_status', 'approved');
                    })
                    ->orderBy('id')
                    ->first();

            if ($community) {
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
            }
        }

        return $user->fresh();
    }
}
