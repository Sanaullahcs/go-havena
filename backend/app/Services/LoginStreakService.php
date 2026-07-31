<?php

namespace App\Services;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class LoginStreakService
{
    /** Record today's login and return the updated streak count. */
    public function recordLogin(User $user): int
    {
        if (! Schema::hasTable('user_daily_logins')) {
            return 0;
        }

        $today = now()->toDateString();

        DB::table('user_daily_logins')->insertOrIgnore([
            'user_id'    => $user->id,
            'login_date' => $today,
            'created_at' => now(),
        ]);

        return $this->calculateStreak($user->id);
    }

    public function calculateStreak(int $userId): int
    {
        if (! Schema::hasTable('user_daily_logins')) {
            return 0;
        }

        $dates = DB::table('user_daily_logins')
            ->where('user_id', $userId)
            ->orderByDesc('login_date')
            ->pluck('login_date')
            ->map(fn ($d) => (string) $d);

        if ($dates->isEmpty()) {
            return 0;
        }

        $streak = 0;
        $cursor = now()->startOfDay();

        foreach ($dates as $day) {
            if ($day === $cursor->toDateString()) {
                $streak++;
                $cursor = $cursor->copy()->subDay();
                continue;
            }

            if ($streak === 0 && $day === now()->subDay()->toDateString()) {
                $streak++;
                $cursor = now()->subDays(2)->startOfDay();
                continue;
            }

            break;
        }

        return $streak;
    }

    /** Distinct login days used for streak-style progress badges. */
    public function countDistinctLoginDays(int $userId): int
    {
        if (! Schema::hasTable('user_daily_logins')) {
            return 0;
        }

        return (int) DB::table('user_daily_logins')
            ->where('user_id', $userId)
            ->count();
    }

    public function firstEarnedAt(int $userId, int $requiredStreak): ?Carbon
    {
        if (! Schema::hasTable('user_daily_logins')) {
            return null;
        }

        $dates = DB::table('user_daily_logins')
            ->where('user_id', $userId)
            ->orderBy('login_date')
            ->pluck('login_date')
            ->map(fn ($d) => Carbon::parse((string) $d));

        if ($dates->count() < $requiredStreak) {
            return null;
        }

        for ($i = 0; $i <= $dates->count() - $requiredStreak; $i++) {
            $window = $dates->slice($i, $requiredStreak)->values();
            $consecutive = true;

            for ($j = 1; $j < $window->count(); $j++) {
                if (! $window[$j - 1]->copy()->addDay()->isSameDay($window[$j])) {
                    $consecutive = false;
                    break;
                }
            }

            if ($consecutive) {
                return $window->last();
            }
        }

        return null;
    }
}
