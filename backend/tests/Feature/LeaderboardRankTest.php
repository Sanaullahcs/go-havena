<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class LeaderboardRankTest extends TestCase
{
    use RefreshDatabase;

    public function test_stats_and_leaderboard_return_matching_rank(): void
    {
        $communityId = DB::table('communities')->insertGetId([
            'name'       => 'Phoenix Hub',
            'region'     => 'Arizona - Phoenix',
            'status'     => 'active',
            'timezone'   => 'America/Phoenix',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $leader = User::factory()->create(['name' => 'Jordan Lee']);
        $ahmad = User::factory()->create(['name' => 'Muhammad Ahmad']);
        $third = User::factory()->create(['name' => 'Taylor Brooks']);

        foreach ([$leader, $ahmad, $third] as $user) {
            DB::table('profiles')->insert([
                'user_id'      => $user->id,
                'display_name' => $user->name,
                'created_at'   => now(),
                'updated_at'   => now(),
            ]);

            DB::table('community_memberships')->insert([
                'user_id'      => $user->id,
                'community_id' => $communityId,
                'role'         => 'member',
                'status'       => 'approved',
                'created_at'   => now(),
                'updated_at'   => now(),
            ]);
        }

        $points = [
            $leader->id => 5200,
            $ahmad->id  => 4850,
            $third->id  => 4100,
        ];

        foreach ($points as $userId => $total) {
            DB::table('point_transactions')->insert([
                'user_id'      => $userId,
                'community_id' => $communityId,
                'action'       => 'daily_activity',
                'title'        => 'Points',
                'subtitle'     => 'Test',
                'points'       => $total,
                'created_at'   => now(),
            ]);
        }

        $token = $ahmad->createToken('mobile')->plainTextToken;
        $headers = [
            'Authorization' => "Bearer {$token}",
            'X-Community-Id'  => (string) $communityId,
        ];

        // Leaderboard first — stats awards daily login points and would change totals.
        $board = $this->withHeaders($headers)
            ->getJson('/api/v1/leaderboard')
            ->assertOk()
            ->json('data');

        $stats = $this->withHeaders($headers)
            ->getJson('/api/v1/me/points/stats')
            ->assertOk()
            ->json('data');

        $this->assertSame(2, $board['my_rank']);
        $this->assertSame(2, $stats['rank']);

        $ahmadEntry = collect($board['entries'])->firstWhere('is_me', true);
        $this->assertSame(2, $ahmadEntry['rank']);
        $this->assertSame(4850, $ahmadEntry['total_points']);
        $this->assertSame(4875, $stats['total_points']);
    }

    public function test_leaderboard_includes_all_approved_members_with_zero_points(): void
    {
        $communityId = DB::table('communities')->insertGetId([
            'name'       => 'Phoenix Hub',
            'region'     => 'Arizona - Phoenix',
            'status'     => 'active',
            'timezone'   => 'America/Phoenix',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $leader = User::factory()->create(['name' => 'Jordan Lee']);
        $ahmad = User::factory()->create(['name' => 'Muhammad Ahmad']);
        $inactive = User::factory()->create(['name' => 'No Points Yet']);

        foreach ([$leader, $ahmad, $inactive] as $user) {
            DB::table('profiles')->insert([
                'user_id'      => $user->id,
                'display_name' => $user->name,
                'created_at'   => now(),
                'updated_at'   => now(),
            ]);

            DB::table('community_memberships')->insert([
                'user_id'      => $user->id,
                'community_id' => $communityId,
                'role'         => 'member',
                'status'       => 'approved',
                'created_at'   => now(),
                'updated_at'   => now(),
            ]);
        }

        foreach ([$leader->id => 5200, $ahmad->id => 4850] as $userId => $total) {
            DB::table('point_transactions')->insert([
                'user_id'      => $userId,
                'community_id' => $communityId,
                'action'       => 'daily_activity',
                'title'        => 'Points',
                'subtitle'     => 'Test',
                'points'       => $total,
                'created_at'   => now(),
            ]);
        }

        $token = $ahmad->createToken('mobile')->plainTextToken;
        $headers = [
            'Authorization' => "Bearer {$token}",
            'X-Community-Id'  => (string) $communityId,
        ];

        $board = $this->withHeaders($headers)
            ->getJson('/api/v1/leaderboard')
            ->assertOk()
            ->json('data');

        $this->assertCount(3, $board['entries']);

        $zeroPointMember = collect($board['entries'])->firstWhere('user_id', $inactive->id);
        $this->assertNotNull($zeroPointMember);
        $this->assertSame(0, $zeroPointMember['total_points']);
        $this->assertSame(3, $zeroPointMember['rank']);
    }
}
