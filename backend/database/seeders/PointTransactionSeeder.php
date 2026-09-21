<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class PointTransactionSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(CommunitySeeder::class);

        $communityId = DB::table('communities')->orderBy('id')->value('id');
        $users = User::query()->with('memberships')->limit(15)->get();

        if ($users->isEmpty() || ! $communityId) {
            $this->command?->warn('PointTransactionSeeder: no users or communities found.');

            return;
        }

        $now = now();

        foreach ($users as $user) {
            $hasMembership = $user->memberships
                ->where('community_id', $communityId)
                ->where('status', 'approved')
                ->isNotEmpty();

            if (! $hasMembership) {
                DB::table('community_memberships')->insert([
                    'user_id'      => $user->id,
                    'community_id' => $communityId,
                    'role'         => 'member',
                    'status'       => 'approved',
                    'created_at'   => $now,
                    'updated_at'   => $now,
                ]);
            }
        }

        DB::table('point_transactions')->delete();

        $samples = [
            ['action' => 'lesson_completed', 'title' => 'Lesson Completed', 'subtitle' => 'Body Scan Meditation', 'points' => 150],
            ['action' => 'community_post', 'title' => 'Community Post', 'subtitle' => 'Shared wellness tips', 'points' => 100],
            ['action' => 'streak_bonus', 'title' => 'Daily Streak Bonus', 'subtitle' => '7 day streak milestone', 'points' => 150],
            ['action' => 'lesson_completed', 'title' => 'Lesson Completed', 'subtitle' => 'Breathing Techniques', 'points' => 50],
            ['action' => 'booking', 'title' => 'Amenity Booking', 'subtitle' => 'Pool reservation', 'points' => 75],
        ];

        foreach ($users as $index => $user) {
            $baseDays = 14 - ($index % 5);

            foreach ($samples as $offset => $sample) {
                DB::table('point_transactions')->insert([
                    'user_id'      => $user->id,
                    'community_id' => $communityId,
                    'action'       => $sample['action'],
                    'title'        => $sample['title'],
                    'subtitle'     => $sample['subtitle'],
                    'points'       => $sample['points'] + ($index * 10),
                    'meta'         => null,
                    'created_at'   => now()->subDays($baseDays - $offset)->subHours($offset * 3),
                ]);
            }

            for ($d = 0; $d < min($baseDays, 14); $d++) {
                DB::table('point_transactions')->insert([
                    'user_id'      => $user->id,
                    'community_id' => $communityId,
                    'action'       => 'daily_activity',
                    'title'        => 'Daily Activity',
                    'subtitle'     => 'Stayed active in the community',
                    'points'       => 25,
                    'meta'         => null,
                    'created_at'   => now()->subDays($d)->setHour(9),
                ]);
            }
        }

        $this->command?->info('PointTransactionSeeder: complete.');
    }
}
