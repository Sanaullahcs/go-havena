<?php

namespace App\Services;

use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AchievementsService
{
    public const BADGES_TOTAL = 8;

    /** @return array<int, array<string, mixed>> */
    private function catalog(): array
    {
        return [
            [
                'key'            => 'first_steps',
                'title'          => 'First Steps',
                'subtitle'       => 'Complete your first wellness lesson',
                'status_label'   => 'Complete 1 lesson',
                'icon'           => 'footsteps-outline',
                'icon_color'     => '#0052DF',
                'icon_bg'        => '#EFF6FF',
                'image_key'      => 'earned_card',
                'progress_color' => '#0179FF',
                'target'         => 1,
            ],
            [
                'key'            => 'consistency_champion',
                'title'          => 'Consistency Champion',
                'subtitle'       => 'Maintain a 7-day wellness streak',
                'status_label'   => '7-day login streak',
                'icon'           => 'flame-outline',
                'icon_color'     => '#059669',
                'icon_bg'        => '#ECFDF5',
                'image_key'      => 'earned_card',
                'progress_color' => '#FB2C36',
                'target'         => 7,
            ],
            [
                'key'            => 'week_warrior',
                'title'          => 'Week Warrior',
                'subtitle'       => 'Stay active for one full week',
                'status_label'   => 'Active for 7 days',
                'icon'           => 'trophy-outline',
                'icon_color'     => '#D97706',
                'icon_bg'        => '#FFFBEB',
                'image_key'      => 'earned_card',
                'progress_color' => '#FE9A00',
                'target'         => 7,
            ],
            [
                'key'            => 'month_master',
                'title'          => 'Month Master',
                'subtitle'       => 'Complete 30 days of wellness activities',
                'status_label'   => 'Active for 30 days',
                'icon'           => 'calendar-outline',
                'icon_color'     => '#0052DF',
                'icon_bg'        => '#EFF6FF',
                'image_key'      => 'earned_card',
                'progress_color' => '#0179FF',
                'target'         => 30,
            ],
            [
                'key'            => 'wellness_pro',
                'title'          => 'Wellness Pro',
                'subtitle'       => 'Complete 10 wellness courses',
                'status_label'   => 'Complete 10 courses',
                'icon'           => 'school-outline',
                'icon_color'     => '#DC2626',
                'icon_bg'        => '#FEF2F2',
                'image_key'      => 'earned_card',
                'progress_color' => '#FB2C36',
                'target'         => 10,
            ],
            [
                'key'            => 'community_star',
                'title'          => 'Community Star',
                'subtitle'       => 'Share 50 posts with the community',
                'status_label'   => '50 community posts',
                'icon'           => 'people-outline',
                'icon_color'     => '#D97706',
                'icon_bg'        => '#FFFBEB',
                'image_key'      => 'community_star',
                'progress_color' => '#FE9A00',
                'target'         => 50,
            ],
            [
                'key'            => 'social_butterfly',
                'title'          => 'Social Butterfly',
                'subtitle'       => 'Attend 5 community events',
                'status_label'   => 'Attend 5 events',
                'icon'           => 'sparkles-outline',
                'icon_color'     => '#DC2626',
                'icon_bg'        => '#FEF2F2',
                'image_key'      => 'social_butterfly',
                'progress_color' => '#FB2C36',
                'target'         => 5,
            ],
            [
                'key'            => 'meditation_master',
                'title'          => 'Meditation Master',
                'subtitle'       => 'Complete 20 meditation sessions',
                'status_label'   => '20 meditation lessons',
                'icon'           => 'leaf-outline',
                'icon_color'     => '#D97706',
                'icon_bg'        => '#FFFBEB',
                'image_key'      => 'earned_card',
                'progress_color' => '#FE9A00',
                'target'         => 20,
            ],
        ];
    }

    public function forUser(int $userId, ?int $communityId = null): array
    {
        $metrics = $this->metricsForUser($userId, $communityId);
        $items = [];

        foreach ($this->catalog() as $badge) {
            $progress = $this->progressForBadge($badge, $metrics);
            $earned = $progress['current'] >= $badge['target'];
            $earnedAt = $earned ? $this->earnedAtForBadge($badge['key'], $metrics) : null;

            $items[] = array_merge($badge, [
                'earned'             => $earned,
                'earned_at'          => $earnedAt?->toIso8601String(),
                'earned_date_label'  => $earnedAt ? 'Earned on '.$earnedAt->format('M j, Y') : null,
                'progress'           => $progress,
            ]);
        }

        $earnedItems = collect($items)->where('earned', true)->values();
        $lockedItems = collect($items)->where('earned', false)->values();
        $earnedCount = $earnedItems->count();
        $totalCount = self::BADGES_TOTAL;
        $overallPercent = $totalCount > 0
            ? (int) round(($earnedCount / $totalCount) * 100)
            : 0;

        $recent = $earnedItems
            ->sortByDesc(fn ($item) => $item['earned_at'] ?? '')
            ->take(3)
            ->values()
            ->all();

        return [
            'earned_count'             => $earnedCount,
            'total_count'              => $totalCount,
            'overall_progress_percent' => $overallPercent,
            'earned'                   => $earnedItems->values()->all(),
            'locked'                   => $lockedItems->values()->all(),
            'recent'                   => $recent,
        ];
    }

    public function countEarned(int $userId, ?int $communityId = null): int
    {
        return $this->forUser($userId, $communityId)['earned_count'];
    }

    /** @return array<string, mixed> */
    private function metricsForUser(int $userId, ?int $communityId): array
    {
        $loginStreak = app(LoginStreakService::class)->calculateStreak($userId);
        $loginDays = app(LoginStreakService::class)->countDistinctLoginDays($userId);

        $lessonsCompleted = Schema::hasTable('wellness_lesson_progress')
            ? (int) DB::table('wellness_lesson_progress')
                ->where('user_id', $userId)
                ->count()
            : 0;

        $coursesCompleted = Schema::hasTable('wellness_lesson_progress') && Schema::hasTable('wellness_lessons')
            ? (int) DB::table('wellness_lesson_progress as lp')
                ->join('wellness_lessons as l', 'l.id', '=', 'lp.lesson_id')
                ->where('lp.user_id', $userId)
                ->distinct('l.course_id')
                ->count('l.course_id')
            : 0;

        $meditationLessons = Schema::hasTable('wellness_categories')
            ? (int) DB::table('wellness_lesson_progress as lp')
                ->join('wellness_lessons as l', 'l.id', '=', 'lp.lesson_id')
                ->join('wellness_courses as c', 'c.id', '=', 'l.course_id')
                ->join('wellness_categories as cat', 'cat.id', '=', 'c.category_id')
                ->where('lp.user_id', $userId)
                ->where('cat.key', 'meditation')
                ->count()
            : 0;

        $postsQuery = DB::table('posts')
            ->where('user_id', $userId)
            ->whereNull('deleted_at');

        if ($communityId) {
            $postsQuery->where('community_id', $communityId);
        }

        $eventRsvps = Schema::hasTable('event_rsvps')
            ? (int) DB::table('event_rsvps')
                ->where('user_id', $userId)
                ->where('status', 'going')
                ->count()
            : 0;

        $firstLessonAt = Schema::hasTable('wellness_lesson_progress')
            ? DB::table('wellness_lesson_progress')
                ->where('user_id', $userId)
                ->orderBy('completed_at')
                ->value('completed_at')
            : null;

        return [
            'login_streak'        => $loginStreak,
            'login_days'          => $loginDays,
            'lessons_completed'   => $lessonsCompleted,
            'courses_completed'   => $coursesCompleted,
            'meditation_lessons'  => $meditationLessons,
            'community_posts'     => (int) $postsQuery->count(),
            'event_rsvps'         => $eventRsvps,
            'first_lesson_at'     => $firstLessonAt ? Carbon::parse($firstLessonAt) : null,
            'streak_7_at'         => app(LoginStreakService::class)->firstEarnedAt($userId, 7),
            'streak_30_at'        => app(LoginStreakService::class)->firstEarnedAt($userId, 30),
        ];
    }

    /** @param array<string, mixed> $badge */
    /** @param array<string, mixed> $metrics */
    private function progressForBadge(array $badge, array $metrics): array
    {
        $current = match ($badge['key']) {
            'first_steps'           => min($metrics['lessons_completed'], $badge['target']),
            'consistency_champion'  => min($metrics['login_streak'], $badge['target']),
            'week_warrior'          => min($metrics['login_days'], $badge['target']),
            'month_master'          => min($metrics['login_streak'], $badge['target']),
            'wellness_pro'          => min($metrics['courses_completed'], $badge['target']),
            'community_star'        => min($metrics['community_posts'], $badge['target']),
            'social_butterfly'      => min($metrics['event_rsvps'], $badge['target']),
            'meditation_master'     => min($metrics['meditation_lessons'], $badge['target']),
            default                 => 0,
        };

        $total = $badge['target'];
        $percent = $total > 0 ? (int) round(($current / $total) * 100) : 0;

        return [
            'current' => $current,
            'total'   => $total,
            'percent' => min($percent, 100),
        ];
    }

    /** @param array<string, mixed> $metrics */
    private function earnedAtForBadge(string $key, array $metrics): ?Carbon
    {
        return match ($key) {
            'first_steps'          => $metrics['first_lesson_at'],
            'consistency_champion' => $metrics['streak_7_at'],
            'week_warrior'         => $metrics['streak_7_at'],
            'month_master'         => $metrics['streak_30_at'],
            default                => null,
        };
    }
}
