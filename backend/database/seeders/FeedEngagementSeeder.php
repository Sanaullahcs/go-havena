<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Creates real post_likes / post_comments rows for demo posts.
 * The API counts live rows — denormalized likes_count alone is not enough.
 */
class FeedEngagementSeeder extends Seeder
{
    /** @var list<string> */
    private array $sampleComments = [
        'Thanks for sharing this!',
        'Great post — really helpful for the community.',
        'See you there!',
        'Appreciate the update.',
        'Count me in!',
        'Good to know, thanks.',
    ];

    public function run(): void
    {
        $posts = DB::table('posts')
            ->whereNull('deleted_at')
            ->orderBy('id')
            ->get();

        if ($posts->isEmpty()) {
            $this->command?->warn('FeedEngagementSeeder: no posts found.');

            return;
        }

        $seeded = 0;

        foreach ($posts as $post) {
            if ($this->seedPostEngagement($post)) {
                $seeded++;
            }
        }

        $this->command?->info("FeedEngagementSeeder: engagement synced for {$seeded} post(s).");
    }

    /** @return bool True when likes or comments were added */
    public function seedPostEngagement(object $post): bool
    {
        $postId = (int) $post->id;
        $authorId = (int) $post->user_id;
        $communityId = (int) $post->community_id;

        $memberIds = DB::table('community_memberships')
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->where('user_id', '!=', $authorId)
            ->orderBy('id')
            ->pluck('user_id')
            ->unique()
            ->values()
            ->all();

        if ($memberIds === []) {
            $memberIds = DB::table('users')
                ->where('id', '!=', $authorId)
                ->orderBy('id')
                ->limit(6)
                ->pluck('id')
                ->all();
        }

        $added = false;
        $existingLikes = (int) DB::table('post_likes')->where('post_id', $postId)->count();

        if ($existingLikes === 0 && $memberIds !== []) {
            $likeCount = min(count($memberIds), max(2, (int) ($post->likes_count ?? 0) ?: random_int(2, 5)));
            $likers = collect($memberIds)->shuffle()->take($likeCount);

            foreach ($likers as $userId) {
                DB::table('post_likes')->insert([
                    'user_id'    => (int) $userId,
                    'post_id'    => $postId,
                    'created_at' => now()->subMinutes(random_int(5, 720)),
                ]);
            }

            $added = true;
        }

        $existingComments = (int) DB::table('post_comments')
            ->where('post_id', $postId)
            ->whereNull('deleted_at')
            ->count();

        if ($existingComments === 0 && $memberIds !== []) {
            $targetComments = max(1, min(count($memberIds), (int) ($post->comments_count ?? 0) ?: random_int(1, 3)));
            $commenters = collect($memberIds)->shuffle()->take($targetComments);

            foreach ($commenters as $index => $userId) {
                DB::table('post_comments')->insert([
                    'post_id'    => $postId,
                    'user_id'    => (int) $userId,
                    'body'       => $this->sampleComments[$index % count($this->sampleComments)],
                    'created_at' => now()->subMinutes(random_int(10, 600)),
                    'updated_at' => now()->subMinutes(random_int(10, 600)),
                ]);
            }

            $added = true;
        }

        $this->syncPostCounts($postId);

        return $added;
    }

    public function syncPostCounts(int $postId): void
    {
        DB::table('posts')->where('id', $postId)->update([
            'likes_count'    => DB::table('post_likes')->where('post_id', $postId)->count(),
            'comments_count' => DB::table('post_comments')
                ->where('post_id', $postId)
                ->whereNull('deleted_at')
                ->count(),
            'updated_at'     => now(),
        ]);
    }
}
