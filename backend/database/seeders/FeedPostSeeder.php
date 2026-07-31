<?php

namespace Database\Seeders;

use App\Models\Community;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class FeedPostSeeder extends Seeder
{
    public function run(): void
    {
        $communities = Community::query()
            ->where('status', 'active')
            ->where(function ($w) {
                $w->whereNull('review_status')
                    ->orWhere('review_status', 'approved');
            })
            ->orderBy('id')
            ->get();

        if ($communities->isEmpty()) {
            $this->command?->warn('FeedPostSeeder: no active communities found.');

            return;
        }

        $samples = [
            ['general', 'Does anyone know a good pediatrician nearby?'],
            ['help', 'Free moving boxes available in the lobby — first come first served!'],
            ['help', 'Looking for a dog walker for weekday mornings. Any recommendations?'],
            ['event', 'Reminder: Yoga in the Park this Sunday at 7 AM near the east garden.'],
            ['announcement', 'Pool maintenance scheduled for Thursday 9 AM–12 PM.'],
            ['update', 'New recycling bins have been installed near Building C.'],
            ['general', 'Great turnout at last weekend\'s community BBQ — thanks everyone!'],
            ['help', 'Anyone have a ladder I could borrow for an hour this afternoon?'],
        ];

        $created = 0;

        foreach ($communities as $community) {
            $memberIds = DB::table('community_memberships')
                ->where('community_id', $community->id)
                ->where('status', 'approved')
                ->orderBy('id')
                ->pluck('user_id')
                ->unique()
                ->values();

            if ($memberIds->isEmpty()) {
                $memberIds = DB::table('users')->orderBy('id')->limit(4)->pluck('id');
            }

            if ($memberIds->isEmpty()) {
                continue;
            }

            $existingCount = DB::table('posts')
                ->where('community_id', $community->id)
                ->whereNull('deleted_at')
                ->count();

            if ($existingCount >= 4) {
                continue;
            }

            foreach ($samples as $index => [$category, $body]) {
                $userId = $memberIds[$index % $memberIds->count()];

                $exists = DB::table('posts')
                    ->where('community_id', $community->id)
                    ->where('user_id', $userId)
                    ->where('body', $body)
                    ->exists();

                if ($exists) {
                    continue;
                }

                DB::table('posts')->insert([
                    'community_id'   => $community->id,
                    'user_id'        => $userId,
                    'body'           => $body,
                    'category'       => $category,
                    'status'         => 'approved',
                    'approved_at'    => now(),
                    'likes_count'    => rand(2, 24),
                    'comments_count' => rand(0, 8),
                    'created_at'     => now()->subHours($index * 4 + rand(1, 12)),
                    'updated_at'     => now(),
                ]);
                $created++;
            }
        }

        $this->command?->info("FeedPostSeeder: {$created} sample post(s) added across communities.");
    }
}
