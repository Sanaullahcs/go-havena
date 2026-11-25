<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\LoginStreakService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ProfilePointsTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_records_daily_streak_and_awards_points_once_per_day(): void
    {
        $user = User::factory()->create([
            'email' => 'streak@test.local',
            'password' => bcrypt('secret123'),
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'streak@test.local',
            'password' => 'secret123',
        ])->assertOk();

        $this->assertSame(1, app(LoginStreakService::class)->calculateStreak($user->id));
        $this->assertSame(1, DB::table('user_daily_logins')->where('user_id', $user->id)->count());
        $this->assertSame(1, DB::table('point_transactions')->where('user_id', $user->id)->where('action', 'daily_login')->count());

        $this->postJson('/api/v1/auth/login', [
            'email' => 'streak@test.local',
            'password' => 'secret123',
        ])->assertOk();

        $this->assertSame(1, DB::table('point_transactions')->where('user_id', $user->id)->where('action', 'daily_login')->count());
    }

    public function test_points_stats_and_achievements_endpoints(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('mobile')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/me/points/stats')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'total_points',
                    'current_streak',
                    'badges_earned',
                    'badges_total',
                    'community_posts',
                    'rank',
                ],
            ])
            ->assertJsonPath('data.badges_total', 8);

        $this->withToken($token)
            ->getJson('/api/v1/me/achievements')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'earned_count',
                    'total_count',
                    'overall_progress_percent',
                    'earned',
                    'locked',
                    'recent',
                ],
            ])
            ->assertJsonPath('data.total_count', 8);
    }
}
