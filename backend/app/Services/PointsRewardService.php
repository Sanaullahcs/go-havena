<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;

class PointsRewardService
{
    public const DAILY_LOGIN_POINTS = 25;

    public const PROFILE_COMPLETED_POINTS = 100;

    public function awardDailyLogin(User $user, ?int $communityId = null): bool
    {
        $today = now()->startOfDay();

        $alreadyAwarded = DB::table('point_transactions')
            ->where('user_id', $user->id)
            ->where('action', 'daily_login')
            ->where('created_at', '>=', $today)
            ->exists();

        if ($alreadyAwarded) {
            return false;
        }

        $communityId ??= $this->resolveCommunityId($user);

        DB::table('point_transactions')->insert([
            'user_id'      => $user->id,
            'community_id' => $communityId,
            'action'       => 'daily_login',
            'title'        => 'Daily Login',
            'subtitle'     => 'Welcome back!',
            'points'       => self::DAILY_LOGIN_POINTS,
            'meta'         => null,
            'created_at'   => now(),
        ]);

        return true;
    }

    public function awardProfileCompleted(User $user, ?int $communityId = null): bool
    {
        $alreadyAwarded = DB::table('point_transactions')
            ->where('user_id', $user->id)
            ->where('action', 'profile_completed')
            ->exists();

        if ($alreadyAwarded) {
            return false;
        }

        $communityId ??= $this->resolveCommunityId($user);

        DB::table('point_transactions')->insert([
            'user_id'      => $user->id,
            'community_id' => $communityId,
            'action'       => 'profile_completed',
            'title'        => 'Profile Completed',
            'subtitle'     => 'Your profile is all set',
            'points'       => self::PROFILE_COMPLETED_POINTS,
            'meta'         => null,
            'created_at'   => now(),
        ]);

        return true;
    }

    public function isProfileComplete(User $user): bool
    {
        $user->loadMissing('profile');

        $profile = $user->profile;
        if (! $profile) {
            return false;
        }

        return filled($profile->display_name)
            && filled($profile->avatar_url)
            && filled($profile->unit_number);
    }

    private function resolveCommunityId(User $user): ?int
    {
        return $user->memberships()
            ->where('status', 'approved')
            ->orderBy('id')
            ->value('community_id');
    }
}
