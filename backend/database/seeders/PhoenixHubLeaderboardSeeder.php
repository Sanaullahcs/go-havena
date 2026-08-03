<?php

namespace Database\Seeders;

use App\Models\Community;
use App\Models\Region;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Ensures Phoenix Hub leaderboard demo data: Ahmad at rank #2.
 * Safe to re-run — only affects the Phoenix Hub community.
 */
class PhoenixHubLeaderboardSeeder extends Seeder
{
    public function run(): void
    {
        $region = Region::query()
            ->where('title', 'Arizona - Phoenix')
            ->where('status', 'active')
            ->first();

        if (! $region) {
            $this->command?->warn('PhoenixHubLeaderboardSeeder: Arizona - Phoenix region not found.');

            return;
        }

        $community = Community::query()->updateOrCreate(
            ['name' => 'Phoenix Hub'],
            [
                'region'        => $region->title,
                'region_id'     => $region->id,
                'address'       => '100 Phoenix Hub Blvd, Phoenix, AZ 85004',
                'description'   => 'Wellness-focused community in Phoenix.',
                'timezone'      => 'America/Phoenix',
                'status'        => 'active',
                'review_status' => 'approved',
                'reviewed_at'   => now(),
            ],
        );

        $ahmad = User::query()
            ->where(function ($query) {
                $query->where('name', 'like', '%Ahmad%')
                    ->orWhereHas('profile', fn ($profile) => $profile->where('display_name', 'like', '%Ahmad%'));
            })
            ->orderBy('id')
            ->first();

        if (! $ahmad) {
            $this->command?->warn('PhoenixHubLeaderboardSeeder: no Ahmad user found — skipping rank setup.');

            return;
        }

        $leader = User::query()->firstOrCreate(
            ['email' => 'phoenix.leader@havena.app'],
            [
                'name'       => 'Jordan Lee',
                'password'   => Hash::make('password'),
                'status'     => 'active',
                'role'       => 'resident',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        );

        $leader->profile()->updateOrCreate(
            ['user_id' => $leader->id],
            ['display_name' => 'Jordan Lee', 'unit_number' => 'Unit 101']
        );

        $third = User::query()->firstOrCreate(
            ['email' => 'phoenix.member@havena.app'],
            [
                'name'       => 'Taylor Brooks',
                'password'   => Hash::make('password'),
                'status'     => 'active',
                'role'       => 'resident',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        );

        $third->profile()->updateOrCreate(
            ['user_id' => $third->id],
            ['display_name' => 'Taylor Brooks', 'unit_number' => 'Unit 205']
        );

        $ahmad->profile()->updateOrCreate(
            ['user_id' => $ahmad->id],
            ['display_name' => $ahmad->profile?->display_name ?? $ahmad->name, 'unit_number' => 'Unit 12A']
        );

        foreach ([$ahmad, $leader, $third] as $member) {
            DB::table('community_memberships')->updateOrInsert(
                [
                    'user_id'      => $member->id,
                    'community_id' => $community->id,
                ],
                [
                    'role'       => 'member',
                    'status'     => 'approved',
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            );
        }

        // Demo: Ahmad's active community should be Phoenix Hub (rank #2).
        DB::table('community_memberships')
            ->where('user_id', $ahmad->id)
            ->where('community_id', '!=', $community->id)
            ->delete();

        DB::table('point_transactions')->where('community_id', $community->id)->delete();

        $now = now();
        $rows = [
            ['user_id' => $leader->id, 'points' => 5200, 'title' => 'Community Leader Bonus'],
            ['user_id' => $ahmad->id, 'points' => 4850, 'title' => 'Wellness Champion'],
            ['user_id' => $third->id, 'points' => 4100, 'title' => 'Active Member'],
        ];

        foreach ($rows as $row) {
            DB::table('point_transactions')->insert([
                'user_id'      => $row['user_id'],
                'community_id' => $community->id,
                'action'       => 'daily_activity',
                'title'        => $row['title'],
                'subtitle'     => 'Phoenix Hub community points',
                'points'       => $row['points'],
                'meta'         => null,
                'created_at'   => $now,
            ]);
        }

        $this->command?->info("PhoenixHubLeaderboardSeeder: Ahmad (user #{$ahmad->id}) is rank #2 in {$community->name}.");
    }
}
