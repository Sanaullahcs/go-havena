<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\MediaUrl;
use App\Support\WellnessCategoryCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminWellnessController extends Controller
{
    /** GET /v1/admin/wellness/categories */
    public function categories(): JsonResponse
    {
        WellnessCategoryCatalog::ensureInDatabase();

        $categories = DB::table('wellness_categories')
            ->orderBy('sort_order')
            ->orderBy('title')
            ->get()
            ->map(fn ($cat) => $this->transformCategory($cat));

        return response()->json(['data' => $categories]);
    }

    /** POST /v1/admin/wellness/categories */
    public function storeCategory(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title'      => ['required', 'string', 'max:120'],
            'subtitle'   => ['nullable', 'string', 'max:255'],
            'icon_key'   => ['nullable', 'string', 'max:40'],
            'color'      => ['nullable', 'string', 'max:20'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:255'],
            'status'     => ['nullable', Rule::in(['active', 'inactive'])],
            'key'        => ['nullable', 'string', 'max:40', 'regex:/^[a-z0-9_]+$/', 'unique:wellness_categories,key'],
        ]);

        $key = $validated['key'] ?? WellnessCategoryCatalog::uniqueKeyFromTitle($validated['title']);

        $id = DB::table('wellness_categories')->insertGetId([
            'key'        => $key,
            'title'      => trim($validated['title']),
            'subtitle'   => isset($validated['subtitle']) ? trim((string) $validated['subtitle']) : null,
            'icon_key'   => $validated['icon_key'] ?? $key,
            'color'      => $validated['color'] ?? '#0052DF',
            'sort_order' => $validated['sort_order'] ?? ((int) DB::table('wellness_categories')->max('sort_order') + 1),
            'status'     => $validated['status'] ?? 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $category = DB::table('wellness_categories')->where('id', $id)->first();

        return response()->json(['data' => $this->transformCategory($category)], 201);
    }

    /** PATCH /v1/admin/wellness/categories/{id} */
    public function updateCategory(Request $request, int $id): JsonResponse
    {
        $category = DB::table('wellness_categories')->where('id', $id)->first();
        if (! $category) {
            return response()->json(['message' => 'Category not found.'], 404);
        }

        $validated = $request->validate([
            'title'      => ['sometimes', 'string', 'max:120'],
            'subtitle'   => ['nullable', 'string', 'max:255'],
            'icon_key'   => ['nullable', 'string', 'max:40'],
            'color'      => ['nullable', 'string', 'max:20'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:255'],
            'status'     => ['nullable', Rule::in(['active', 'inactive'])],
        ]);

        if ($validated !== []) {
            if (array_key_exists('title', $validated)) {
                $validated['title'] = trim($validated['title']);
            }
            if (array_key_exists('subtitle', $validated)) {
                $validated['subtitle'] = $validated['subtitle'] !== null
                    ? trim((string) $validated['subtitle'])
                    : null;
            }
            $validated['updated_at'] = now();
            DB::table('wellness_categories')->where('id', $id)->update($validated);
        }

        $category = DB::table('wellness_categories')->where('id', $id)->first();

        return response()->json(['data' => $this->transformCategory($category)]);
    }

    /** DELETE /v1/admin/wellness/categories/{id} */
    public function destroyCategory(int $id): JsonResponse
    {
        $category = DB::table('wellness_categories')->where('id', $id)->first();
        if (! $category) {
            return response()->json(['message' => 'Category not found.'], 404);
        }

        $courseCount = DB::table('wellness_courses')
            ->where('category_id', $id)
            ->whereNull('deleted_at')
            ->count();

        if ($courseCount > 0) {
            return response()->json([
                'message' => 'Remove or move all courses in this category before deleting it.',
            ], 422);
        }

        DB::table('wellness_categories')->where('id', $id)->delete();

        return response()->json(['message' => 'Category deleted']);
    }

    /** GET /v1/admin/wellness/courses */
    public function courses(Request $request): JsonResponse
    {
        $query = DB::table('wellness_courses as c')
            ->join('wellness_categories as cat', 'cat.id', '=', 'c.category_id')
            ->select([
                'c.*',
                'cat.key as category_key',
                'cat.title as category_title',
            ])
            ->whereNull('c.deleted_at');

        if ($categoryId = $request->integer('category_id')) {
            $query->where('c.category_id', $categoryId);
        }

        if ($status = $request->string('status')->trim()->toString()) {
            if (in_array($status, ['published', 'draft'], true)) {
                $query->where('c.status', $status);
            }
        }

        if ($search = $request->string('search')->trim()->toString()) {
            $query->where(function ($builder) use ($search) {
                $builder->where('c.title', 'like', "%{$search}%")
                    ->orWhere('c.description', 'like', "%{$search}%");
            });
        }

        $courses = $query
            ->orderBy('cat.sort_order')
            ->orderBy('c.sort_order')
            ->orderBy('c.title')
            ->get()
            ->map(fn ($course) => $this->transformCourse($course));

        return response()->json(['data' => $courses]);
    }

    /** POST /v1/admin/wellness/courses */
    public function storeCourse(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'category_id' => ['required', 'integer', 'exists:wellness_categories,id'],
            'title'       => ['required', 'string', 'max:200'],
            'description' => ['required', 'string', 'max:5000'],
            'image_url'   => ['nullable', 'string', 'max:512'],
            'sort_order'  => ['nullable', 'integer', 'min:0', 'max:255'],
            'status'      => ['nullable', Rule::in(['published', 'draft'])],
        ]);

        $id = DB::table('wellness_courses')->insertGetId([
            'category_id' => $validated['category_id'],
            'title'       => trim($validated['title']),
            'description' => trim($validated['description']),
            'image_url'   => $validated['image_url'] ?? null,
            'sort_order'  => $validated['sort_order'] ?? 0,
            'status'      => $validated['status'] ?? 'published',
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);

        return response()->json(['data' => $this->transformCourse($this->fetchCourseRow($id))], 201);
    }

    /** PATCH /v1/admin/wellness/courses/{id} */
    public function updateCourse(Request $request, int $id): JsonResponse
    {
        if (! DB::table('wellness_courses')->whereNull('deleted_at')->where('id', $id)->exists()) {
            return response()->json(['message' => 'Course not found.'], 404);
        }

        $validated = $request->validate([
            'category_id' => ['sometimes', 'integer', 'exists:wellness_categories,id'],
            'title'       => ['sometimes', 'string', 'max:200'],
            'description' => ['sometimes', 'required', 'string', 'max:5000'],
            'image_url'   => ['nullable', 'string', 'max:512'],
            'sort_order'  => ['nullable', 'integer', 'min:0', 'max:255'],
            'status'      => ['nullable', Rule::in(['published', 'draft'])],
        ]);

        if ($validated !== []) {
            if (array_key_exists('title', $validated)) {
                $validated['title'] = trim($validated['title']);
            }
            if (array_key_exists('description', $validated)) {
                $validated['description'] = trim($validated['description']);
            }
            $validated['updated_at'] = now();
            DB::table('wellness_courses')->where('id', $id)->update($validated);
        }

        return response()->json(['data' => $this->transformCourse($this->fetchCourseRow($id))]);
    }

    /** DELETE /v1/admin/wellness/courses/{id} */
    public function destroyCourse(int $id): JsonResponse
    {
        if (! DB::table('wellness_courses')->whereNull('deleted_at')->where('id', $id)->exists()) {
            return response()->json(['message' => 'Course not found.'], 404);
        }

        DB::table('wellness_courses')->where('id', $id)->update(['deleted_at' => now(), 'updated_at' => now()]);

        return response()->json(['message' => 'Course deleted']);
    }

    /** GET /v1/admin/wellness/courses/{id}/lessons */
    public function lessons(Request $request, int $courseId): JsonResponse
    {
        if (! DB::table('wellness_courses')->whereNull('deleted_at')->where('id', $courseId)->exists()) {
            return response()->json(['message' => 'Course not found.'], 404);
        }

        $lessons = DB::table('wellness_lessons')
            ->where('course_id', $courseId)
            ->whereNull('deleted_at')
            ->orderBy('sort_order')
            ->orderBy('title')
            ->get()
            ->map(fn ($lesson) => $this->transformLesson($lesson, $request));

        return response()->json(['data' => $lessons]);
    }

    /** POST /v1/admin/wellness/courses/{id}/lessons */
    public function storeLesson(Request $request, int $courseId): JsonResponse
    {
        if (! DB::table('wellness_courses')->whereNull('deleted_at')->where('id', $courseId)->exists()) {
            return response()->json(['message' => 'Course not found.'], 404);
        }

        $validated = $this->validateLessonPayload($request, creating: true);
        $filePath = $this->storeLessonFile($request);

        $linkUrl = $this->normalizeOptionalUrl($validated['link_url'] ?? $validated['video_url'] ?? null);
        if (! $filePath && ! $linkUrl) {
            throw ValidationException::withMessages([
                'content' => ['Provide either a file upload or a link.'],
            ]);
        }

        $id = DB::table('wellness_lessons')->insertGetId([
            'course_id'     => $courseId,
            'title'         => trim($validated['title']),
            'description'   => $this->nullableTrim($validated['description'] ?? null),
            'duration_min'  => $validated['duration_min'] ?? 10,
            'video_url'     => $linkUrl,
            'link_url'      => $linkUrl,
            'file_path'     => $filePath,
            'key_takeaways' => $this->encodeTakeaways($validated['key_takeaways'] ?? null),
            'sort_order'    => $validated['sort_order'] ?? 0,
            'status'        => $validated['status'] ?? 'published',
            'created_at'    => now(),
            'updated_at'    => now(),
        ]);

        $lesson = DB::table('wellness_lessons')->where('id', $id)->first();

        return response()->json(['data' => $this->transformLesson($lesson, $request)], 201);
    }

    /** PATCH /v1/admin/wellness/lessons/{id} */
    public function updateLesson(Request $request, int $id): JsonResponse
    {
        $existing = DB::table('wellness_lessons')->whereNull('deleted_at')->where('id', $id)->first();
        if (! $existing) {
            return response()->json(['message' => 'Lesson not found.'], 404);
        }

        $validated = $this->validateLessonPayload($request, creating: false);

        $updates = [];
        foreach (['title', 'description', 'duration_min', 'sort_order', 'status'] as $field) {
            if (array_key_exists($field, $validated)) {
                $updates[$field] = $field === 'title'
                    ? trim($validated[$field])
                    : ($field === 'description' ? $this->nullableTrim($validated[$field]) : $validated[$field]);
            }
        }

        if (array_key_exists('key_takeaways', $validated)) {
            $updates['key_takeaways'] = $this->encodeTakeaways($validated['key_takeaways']);
        }

        $linkProvided = $request->exists('link_url') || $request->exists('video_url');
        if ($linkProvided) {
            $linkUrl = $this->normalizeOptionalUrl($validated['link_url'] ?? $validated['video_url'] ?? null);
            $updates['link_url'] = $linkUrl;
            $updates['video_url'] = $linkUrl;
        }

        if ($request->boolean('remove_file')) {
            $this->deleteStoredFile($existing->file_path ?? null);
            $updates['file_path'] = null;
        }

        if ($request->hasFile('file')) {
            $this->deleteStoredFile($existing->file_path ?? null);
            $updates['file_path'] = $this->storeLessonFile($request);
        }

        $nextLink = array_key_exists('link_url', $updates)
            ? $updates['link_url']
            : ($existing->link_url ?: $existing->video_url);
        $nextFile = array_key_exists('file_path', $updates)
            ? $updates['file_path']
            : ($existing->file_path ?? null);

        if (! $nextLink && ! $nextFile) {
            throw ValidationException::withMessages([
                'content' => ['Provide either a file upload or a link.'],
            ]);
        }

        if ($updates !== []) {
            $updates['updated_at'] = now();
            DB::table('wellness_lessons')->where('id', $id)->update($updates);
        }

        $lesson = DB::table('wellness_lessons')->where('id', $id)->first();

        return response()->json(['data' => $this->transformLesson($lesson, $request)]);
    }

    /** DELETE /v1/admin/wellness/lessons/{id} */
    public function destroyLesson(int $id): JsonResponse
    {
        $lesson = DB::table('wellness_lessons')->whereNull('deleted_at')->where('id', $id)->first();
        if (! $lesson) {
            return response()->json(['message' => 'Lesson not found.'], 404);
        }

        $this->deleteStoredFile($lesson->file_path ?? null);
        DB::table('wellness_lessons')->where('id', $id)->update(['deleted_at' => now(), 'updated_at' => now()]);

        return response()->json(['message' => 'Lesson deleted']);
    }

    private function validateLessonPayload(Request $request, bool $creating): array
    {
        foreach (['link_url', 'video_url'] as $field) {
            if ($request->has($field) && trim((string) $request->input($field)) === '') {
                $request->merge([$field => null]);
            }
        }

        $takeawaysRule = ['nullable'];
        // Accept JSON string (multipart) or array.
        if (is_string($request->input('key_takeaways'))) {
            $decoded = json_decode($request->input('key_takeaways'), true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $request->merge(['key_takeaways' => $decoded]);
            }
        }

        return $request->validate([
            'title'         => [$creating ? 'required' : 'sometimes', 'string', 'max:200'],
            'description'   => ['nullable', 'string', 'max:5000'],
            'duration_min'  => ['nullable', 'integer', 'min:1', 'max:600'],
            'link_url'      => ['nullable', 'string', 'url', 'max:512'],
            'video_url'     => ['nullable', 'string', 'url', 'max:512'],
            'file'          => ['nullable', 'file', 'max:51200', 'mimes:mp4,mov,webm,pdf,doc,docx,ppt,pptx,png,jpg,jpeg'],
            'remove_file'   => ['nullable', 'boolean'],
            'key_takeaways' => ['nullable', 'array', 'max:20'],
            'key_takeaways.*' => ['nullable', 'string', 'max:500'],
            'sort_order'    => ['nullable', 'integer', 'min:0', 'max:255'],
            'status'        => ['nullable', Rule::in(['published', 'draft'])],
        ]);
    }

    private function storeLessonFile(Request $request): ?string
    {
        if (! $request->hasFile('file')) {
            return null;
        }

        $path = $request->file('file')->store('wellness/lessons', 'public');

        return '/storage/'.ltrim(str_replace('\\', '/', $path), '/');
    }

    private function deleteStoredFile(?string $path): void
    {
        if (! $path) {
            return;
        }

        $normalized = MediaUrl::normalize($path);
        if (! $normalized || ! str_starts_with($normalized, '/storage/')) {
            return;
        }

        $diskPath = ltrim(substr($normalized, strlen('/storage/')), '/');
        if ($diskPath && Storage::disk('public')->exists($diskPath)) {
            Storage::disk('public')->delete($diskPath);
        }
    }

    private function normalizeOptionalUrl(?string $url): ?string
    {
        $url = trim((string) $url);

        return $url !== '' ? $url : null;
    }

    private function nullableTrim(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $trimmed = trim((string) $value);

        return $trimmed !== '' ? $trimmed : null;
    }

    /** @param  array<int, string|null>|string|null  $takeaways */
    private function encodeTakeaways(mixed $takeaways): ?string
    {
        if ($takeaways === null) {
            return null;
        }

        if (is_string($takeaways)) {
            $decoded = json_decode($takeaways, true);
            $takeaways = json_last_error() === JSON_ERROR_NONE ? $decoded : [$takeaways];
        }

        if (! is_array($takeaways)) {
            return null;
        }

        $clean = array_values(array_filter(array_map(
            fn ($item) => trim((string) $item),
            $takeaways
        ), fn ($item) => $item !== ''));

        return $clean === [] ? null : json_encode($clean);
    }

    /** @return list<string> */
    private function decodeTakeaways(mixed $raw): array
    {
        if ($raw === null || $raw === '') {
            return [];
        }

        if (is_array($raw)) {
            return array_values(array_filter(array_map('strval', $raw)));
        }

        $decoded = json_decode((string) $raw, true);

        return is_array($decoded)
            ? array_values(array_filter(array_map(fn ($v) => trim((string) $v), $decoded)))
            : [];
    }

    private function fetchCourseRow(int $id): object
    {
        return DB::table('wellness_courses as c')
            ->join('wellness_categories as cat', 'cat.id', '=', 'c.category_id')
            ->where('c.id', $id)
            ->whereNull('c.deleted_at')
            ->select([
                'c.*',
                'cat.key as category_key',
                'cat.title as category_title',
            ])
            ->first();
    }

    private function transformCategory(object $category): array
    {
        $courseCount = DB::table('wellness_courses')
            ->where('category_id', $category->id)
            ->whereNull('deleted_at')
            ->count();
        $lessonCount = DB::table('wellness_lessons as l')
            ->join('wellness_courses as c', 'c.id', '=', 'l.course_id')
            ->where('c.category_id', $category->id)
            ->whereNull('l.deleted_at')
            ->whereNull('c.deleted_at')
            ->count();

        return [
            'id'           => $category->id,
            'key'          => $category->key,
            'title'        => $category->title,
            'subtitle'     => $category->subtitle,
            'icon_key'     => $category->icon_key,
            'color'        => $category->color,
            'sort_order'   => (int) $category->sort_order,
            'status'       => $category->status,
            'is_static'    => WellnessCategoryCatalog::isStaticKey($category->key),
            'course_count' => $courseCount,
            'lesson_count' => $lessonCount,
        ];
    }

    private function transformCourse(object $course): array
    {
        $lessonCount = DB::table('wellness_lessons')
            ->where('course_id', $course->id)
            ->whereNull('deleted_at')
            ->count();

        return [
            'id'             => $course->id,
            'category_id'    => $course->category_id,
            'category_key'   => $course->category_key ?? null,
            'category_title' => $course->category_title ?? null,
            'title'          => $course->title,
            'description'    => $course->description,
            'image_url'      => $course->image_url,
            'sort_order'     => (int) $course->sort_order,
            'status'         => $course->status,
            'lesson_count'   => $lessonCount,
        ];
    }

    private function transformLesson(object $lesson, ?Request $request = null): array
    {
        $linkUrl = $lesson->link_url ?: $lesson->video_url;
        $fileUrl = MediaUrl::toPublic($lesson->file_path ?? null, $request);

        return [
            'id'            => $lesson->id,
            'course_id'     => $lesson->course_id,
            'title'         => $lesson->title,
            'description'   => $lesson->description,
            'duration_min'  => (int) $lesson->duration_min,
            'video_url'     => $linkUrl,
            'link_url'      => $linkUrl,
            'file_path'     => $lesson->file_path ?? null,
            'file_url'      => $fileUrl,
            'key_takeaways' => $this->decodeTakeaways($lesson->key_takeaways ?? null),
            'sort_order'    => (int) $lesson->sort_order,
            'status'        => $lesson->status,
            'has_file'      => filled($lesson->file_path ?? null),
            'has_link'      => filled($linkUrl),
        ];
    }
}
