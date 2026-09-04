<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Concerns\BlocksGuestReads;
use App\Http\Controllers\Controller;
use App\Support\MediaUrl;
use App\Support\WellnessCategoryCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WellnessController extends Controller
{
    use BlocksGuestReads;
    /** GET /v1/wellness — legacy flat content (portal) */
    public function index(Request $request): JsonResponse
    {
        $this->assertGuestCanRead($request, 'wellness');
        $userId  = auth()->id();
        $content = DB::table('wellness_content')
            ->orderBy('category')
            ->orderBy('sort_order')
            ->get();

        // Prefer legacy flat content when present; otherwise expose course lessons
        // in the same grouped shape the web portal expects.
        if ($content->isEmpty()) {
            return response()->json(['data' => $this->portalGroupsFromCourses((int) $userId)]);
        }

        $completedIds = DB::table('wellness_progress')
            ->where('user_id', $userId)
            ->pluck('content_id')
            ->toArray();

        $items = $content->map(function ($c) use ($completedIds) {
            $c->completed = in_array($c->id, $completedIds, true);

            return $c;
        });

        $grouped = $items->groupBy('category')->map(fn ($group) => [
            'items'     => $group->values(),
            'completed' => $group->where('completed', true)->count(),
            'total'     => $group->count(),
        ]);

        return response()->json(['data' => $grouped]);
    }

    /** GET /v1/wellness/hub — mobile wellness hub */
    public function hub(Request $request): JsonResponse
    {
        $this->assertGuestCanRead($request, 'wellness');
        WellnessCategoryCatalog::ensureInDatabase();

        $userId = $request->user()->id;
        $stats  = $this->userStats($userId);

        $categories = DB::table('wellness_categories')
            ->where('status', 'active')
            ->orderBy('sort_order')
            ->orderBy('title')
            ->get()
            ->map(fn ($cat) => $this->transformCategorySummary($cat, $userId));

        return response()->json([
            'data' => [
                'stats'      => $stats,
                'categories' => $categories,
            ],
        ]);
    }

    /** GET /v1/wellness/categories/{key}/courses */
    public function categoryCourses(Request $request, string $key): JsonResponse
    {
        $category = $this->findActiveCategory($key);
        $userId   = $request->user()->id;

        $courses = DB::table('wellness_courses')
            ->where('category_id', $category->id)
            ->where('status', 'published')
            ->whereNull('deleted_at')
            ->orderBy('sort_order')
            ->orderBy('title')
            ->get()
            ->map(fn ($course) => $this->transformCourseSummary($course, $userId));

        return response()->json([
            'data' => [
                'category' => $this->transformCategory($category),
                'courses'  => $courses,
            ],
        ]);
    }

    /** GET /v1/wellness/courses/{id} */
    public function showCourse(Request $request, int $id): JsonResponse
    {
        $userId = (int) $request->user()->id;
        $course = DB::table('wellness_courses as c')
            ->join('wellness_categories as cat', 'cat.id', '=', 'c.category_id')
            ->where('c.id', $id)
            ->where('c.status', 'published')
            ->whereNull('c.deleted_at')
            ->where('cat.status', 'active')
            ->select([
                'c.*',
                'cat.key as category_key',
                'cat.title as category_title',
                'cat.color as category_color',
                'cat.image_url as category_image_url',
            ])
            ->first();

        if (! $course) {
            return response()->json(['message' => 'Course not found.'], 404);
        }

        $lessonRows = DB::table('wellness_lessons')
            ->where('course_id', $course->id)
            ->where('status', 'published')
            ->whereNull('deleted_at')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        $completedSet = $this->completedLessonIdSet(
            $userId,
            $lessonRows->pluck('id')->all()
        );

        $lessons = $lessonRows->map(
            fn ($lesson) => $this->transformLessonSummary($lesson, $completedSet)
        );

        $completed = $lessons->where('completed', true)->count();
        $total     = $lessons->count();

        return response()->json([
            'data' => [
                'id'               => $course->id,
                'category_key'     => $course->category_key,
                'category_title'   => $course->category_title,
                'category_color'   => $course->category_color,
                'category_image_url' => MediaUrl::toPublic($course->category_image_url ?? null, $request),
                'title'            => $course->title,
                'description'      => $course->description,
                'image_url'        => MediaUrl::toPublic($course->image_url, $request),
                'lessons'          => $lessons->values(),
                'completed_count'  => $completed,
                'total_count'      => $total,
                'progress_percent' => $total > 0 ? (int) round(($completed / $total) * 100) : 0,
            ],
        ]);
    }

    /** GET /v1/wellness/lessons/{id} */
    public function showLesson(Request $request, int $id): JsonResponse
    {
        $userId = $request->user()->id;
        $lesson = DB::table('wellness_lessons as l')
            ->join('wellness_courses as c', 'c.id', '=', 'l.course_id')
            ->join('wellness_categories as cat', 'cat.id', '=', 'c.category_id')
            ->where('l.id', $id)
            ->where('l.status', 'published')
            ->whereNull('l.deleted_at')
            ->where('c.status', 'published')
            ->whereNull('c.deleted_at')
            ->where('cat.status', 'active')
            ->select([
                'l.*',
                'c.title as course_title',
                'c.description as course_description',
                'c.id as course_id',
                'cat.key as category_key',
                'cat.title as category_title',
                'cat.color as category_color',
            ])
            ->first();

        if (! $lesson) {
            return response()->json(['message' => 'Lesson not found.'], 404);
        }

        $completed = DB::table('wellness_lesson_progress')
            ->where('user_id', $userId)
            ->where('lesson_id', (int) $lesson->id)
            ->exists();

        $linkUrl = $lesson->link_url ?: $lesson->video_url;
        $takeaways = $this->decodeTakeaways($lesson->key_takeaways ?? null);

        return response()->json([
            'data' => [
                'id'                 => (int) $lesson->id,
                'course_id'          => $lesson->course_id,
                'course_title'       => $lesson->course_title,
                'course_description' => $lesson->course_description,
                'category_key'       => $lesson->category_key,
                'category_title'     => $lesson->category_title,
                'category_color'     => $lesson->category_color,
                'title'              => $lesson->title,
                'description'        => $lesson->description,
                'duration_min'       => (int) $lesson->duration_min,
                'video_url'          => $linkUrl,
                'link_url'           => $linkUrl,
                'file_url'           => MediaUrl::toPublic($lesson->file_path ?? null, $request),
                'key_takeaways'      => $takeaways,
                'completed'          => $completed,
            ],
        ]);
    }

    /** POST /v1/wellness/lessons/{id}/complete */
    public function completeLesson(int $id): JsonResponse
    {
        $lesson = DB::table('wellness_lessons')
            ->where('id', $id)
            ->where('status', 'published')
            ->whereNull('deleted_at')
            ->first();
        if (! $lesson) {
            return response()->json(['message' => 'Lesson not found.'], 404);
        }

        $userId = (int) auth()->id();
        $lessonId = (int) $lesson->id;
        $exists = DB::table('wellness_lesson_progress')
            ->where('user_id', $userId)
            ->where('lesson_id', $lessonId)
            ->exists();

        if (! $exists) {
            DB::table('wellness_lesson_progress')->insert([
                'user_id'      => $userId,
                'lesson_id'    => $lessonId,
                'completed_at' => now(),
            ]);
        }

        return response()->json(['message' => 'Lesson marked as complete', 'success' => true]);
    }

    /** DELETE /v1/wellness/lessons/{id}/complete */
    public function uncompleteLesson(int $id): JsonResponse
    {
        DB::table('wellness_lesson_progress')
            ->where('user_id', auth()->id())
            ->where('lesson_id', $id)
            ->delete();

        return response()->json(['message' => 'Progress reset', 'success' => true]);
    }

    /** POST /v1/wellness/{id}/complete — legacy flat content */
    public function complete(int $id): JsonResponse
    {
        $userId  = auth()->id();
        $already = DB::table('wellness_progress')->where('user_id', $userId)->where('content_id', $id)->exists();

        if (! $already) {
            DB::table('wellness_progress')->insert([
                'user_id'      => $userId,
                'content_id'   => $id,
                'completed_at' => now(),
            ]);
        }

        return response()->json(['message' => 'Lesson marked as complete']);
    }

    /** DELETE /v1/wellness/{id}/complete — legacy flat content */
    public function uncomplete(int $id): JsonResponse
    {
        DB::table('wellness_progress')->where('user_id', auth()->id())->where('content_id', $id)->delete();

        return response()->json(['message' => 'Progress reset']);
    }

    /**
     * Build legacy portal payload from wellness_courses / wellness_lessons.
     *
     * @return array<string, array{items: list<object>, completed: int, total: int}>
     */
    private function portalGroupsFromCourses(int $userId): array
    {
        WellnessCategoryCatalog::ensureInDatabase();

        $categories = DB::table('wellness_categories')
            ->where('status', 'active')
            ->orderBy('sort_order')
            ->orderBy('title')
            ->get();

        $completedLessonIds = DB::table('wellness_lesson_progress')
            ->where('user_id', $userId)
            ->pluck('lesson_id')
            ->all();

        $grouped = [];

        foreach ($categories as $category) {
            $lessons = DB::table('wellness_lessons as l')
                ->join('wellness_courses as c', 'c.id', '=', 'l.course_id')
                ->where('c.category_id', $category->id)
                ->where('c.status', 'published')
                ->whereNull('c.deleted_at')
                ->where('l.status', 'published')
                ->orderBy('c.sort_order')
                ->orderBy('l.sort_order')
                ->orderBy('l.title')
                ->get([
                    'l.id',
                    'l.title',
                    'l.description',
                    'l.duration_min',
                    'c.image_url as course_image_url',
                    'c.title as course_title',
                ]);

            if ($lessons->isEmpty()) {
                continue;
            }

            $items = $lessons->map(function ($lesson) use ($category, $completedLessonIds) {
                return (object) [
                    'id'           => $lesson->id,
                    'category'     => $category->key,
                    'title'        => $lesson->title,
                    'description'  => $lesson->description
                        ?: ('From '.$lesson->course_title),
                    'duration_min' => (int) $lesson->duration_min,
                    'image_url'    => MediaUrl::toPublic($lesson->course_image_url, request()),
                    'completed'    => in_array((int) $lesson->id, array_map('intval', $completedLessonIds), true),
                ];
            })->values();

            $grouped[$category->key] = [
                'items'     => $items,
                'completed' => $items->where('completed', true)->count(),
                'total'     => $items->count(),
            ];
        }

        return $grouped;
    }

    private function findActiveCategory(string $key): object
    {
        WellnessCategoryCatalog::ensureInDatabase();

        $category = DB::table('wellness_categories')
            ->where('key', $key)
            ->where('status', 'active')
            ->first();

        abort_if(! $category, 404, 'Category not found.');

        return $category;
    }

    private function userStats(int $userId): array
    {
        $totalLessons = DB::table('wellness_lessons as l')
            ->join('wellness_courses as c', 'c.id', '=', 'l.course_id')
            ->join('wellness_categories as cat', 'cat.id', '=', 'c.category_id')
            ->where('l.status', 'published')
            ->where('c.status', 'published')
            ->where('cat.status', 'active')
            ->count();

        $completedLessons = DB::table('wellness_lesson_progress as p')
            ->join('wellness_lessons as l', 'l.id', '=', 'p.lesson_id')
            ->join('wellness_courses as c', 'c.id', '=', 'l.course_id')
            ->join('wellness_categories as cat', 'cat.id', '=', 'c.category_id')
            ->where('p.user_id', $userId)
            ->where('l.status', 'published')
            ->where('c.status', 'published')
            ->where('cat.status', 'active')
            ->count();

        $totalCourses = DB::table('wellness_courses as c')
            ->join('wellness_categories as cat', 'cat.id', '=', 'c.category_id')
            ->where('c.status', 'published')
            ->where('cat.status', 'active')
            ->count();

        $weekMinutes = (int) DB::table('wellness_lesson_progress as p')
            ->join('wellness_lessons as l', 'l.id', '=', 'p.lesson_id')
            ->where('p.user_id', $userId)
            ->where('p.completed_at', '>=', now()->subDays(7))
            ->sum('l.duration_min');

        $avgProgress = $totalLessons > 0
            ? (int) round(($completedLessons / $totalLessons) * 100)
            : 0;

        return [
            'total_courses'  => $totalCourses,
            'avg_progress'   => $avgProgress,
            'week_minutes'   => $weekMinutes,
            'week_label'     => $weekMinutes >= 60
                ? round($weekMinutes / 60, 1).'h'
                : $weekMinutes.'m',
        ];
    }

    private function transformCategory(object $category): array
    {
        return [
            'id'       => $category->id,
            'key'      => $category->key,
            'title'    => $category->title,
            'subtitle' => $category->subtitle,
            'icon_key'   => $category->icon_key,
            'color'      => $category->color,
            'image_url'  => MediaUrl::toPublic($category->image_url ?? null, request()),
        ];
    }

    private function transformCategorySummary(object $category, int $userId): array
    {
        $lessonIds = DB::table('wellness_lessons as l')
            ->join('wellness_courses as c', 'c.id', '=', 'l.course_id')
            ->where('c.category_id', $category->id)
            ->where('l.status', 'published')
            ->where('c.status', 'published')
            ->pluck('l.id');

        $courseCount = DB::table('wellness_courses')
            ->where('category_id', $category->id)
            ->where('status', 'published')
            ->count();

        $totalLessons = $lessonIds->count();
        $completed    = $totalLessons > 0
            ? DB::table('wellness_lesson_progress')
                ->where('user_id', $userId)
                ->whereIn('lesson_id', $lessonIds)
                ->count()
            : 0;

        $progressPercent = $totalLessons > 0
            ? (int) round(($completed / $totalLessons) * 100)
            : 0;

        return array_merge($this->transformCategory($category), [
            'course_count'     => $courseCount,
            'courses_label'    => $courseCount === 1 ? '1 course available' : "{$courseCount} courses available",
            'completed_count'  => $completed,
            'total_lessons'    => $totalLessons,
            'progress_percent' => $progressPercent,
            'progress_label'   => "{$progressPercent}% complete",
        ]);
    }

    private function transformCourseSummary(object $course, int $userId): array
    {
        $lessonIds = DB::table('wellness_lessons')
            ->where('course_id', $course->id)
            ->where('status', 'published')
            ->pluck('id');

        $totalLessons = $lessonIds->count();
        $completed    = $totalLessons > 0
            ? DB::table('wellness_lesson_progress')
                ->where('user_id', $userId)
                ->whereIn('lesson_id', $lessonIds)
                ->count()
            : 0;

        $duration = (int) DB::table('wellness_lessons')
            ->where('course_id', $course->id)
            ->where('status', 'published')
            ->sum('duration_min');

        $progressPercent = $totalLessons > 0
            ? (int) round(($completed / $totalLessons) * 100)
            : 0;

        return [
            'id'               => $course->id,
            'title'            => $course->title,
            'description'      => $course->description,
            'image_url'        => MediaUrl::toPublic($course->image_url, request()),
            'lesson_count'     => $totalLessons,
            'duration_min'     => $duration,
            'lessons_label'    => "{$totalLessons} lessons • {$duration} min",
            'progress_percent' => $progressPercent,
            'progress_label'   => "{$progressPercent}% complete",
        ];
    }

    /** @param list<int|string> $lessonIds */
    private function completedLessonIdSet(int $userId, array $lessonIds): array
    {
        $ids = array_values(array_unique(array_map('intval', $lessonIds)));
        if ($ids === []) {
            return [];
        }

        $completedIds = DB::table('wellness_lesson_progress')
            ->where('user_id', $userId)
            ->whereIn('lesson_id', $ids)
            ->pluck('lesson_id')
            ->all();

        return array_fill_keys(array_map('intval', $completedIds), true);
    }

    /** @param array<int, true> $completedSet */
    private function transformLessonSummary(object $lesson, array $completedSet): array
    {
        $id = (int) $lesson->id;

        return [
            'id'           => $id,
            'title'        => $lesson->title,
            'description'  => $lesson->description,
            'duration_min' => (int) $lesson->duration_min,
            'time_label'   => $lesson->duration_min.' min',
            'completed'    => isset($completedSet[$id]),
            'is_watching'  => false,
        ];
    }

    /** @return list<string> */
    private function decodeTakeaways(mixed $raw): array
    {
        if ($raw === null || $raw === '') {
            return [];
        }

        if (is_array($raw)) {
            return array_values(array_filter(array_map(
                fn ($v) => trim((string) $v),
                $raw
            )));
        }

        $decoded = json_decode((string) $raw, true);

        return is_array($decoded)
            ? array_values(array_filter(array_map(fn ($v) => trim((string) $v), $decoded)))
            : [];
    }
}
