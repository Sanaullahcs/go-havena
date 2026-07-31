<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\WellnessHubSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WellnessHubTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(WellnessHubSeeder::class);
    }

    public function test_resident_can_fetch_wellness_hub(): void
    {
        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        Sanctum::actingAs($resident);

        $response = $this->getJson('/api/v1/wellness/hub');

        $response->assertOk();
        $response->assertJsonStructure([
            'data' => [
                'stats' => ['total_courses', 'avg_progress', 'week_minutes', 'week_label'],
                'categories' => [
                    ['key', 'title', 'subtitle', 'course_count', 'progress_percent'],
                ],
            ],
        ]);
        $this->assertGreaterThanOrEqual(5, count($response->json('data.categories')));
    }

    public function test_resident_can_browse_category_courses_and_complete_lesson(): void
    {
        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        Sanctum::actingAs($resident);

        $courses = $this->getJson('/api/v1/wellness/categories/weight/courses');
        $courses->assertOk();
        $this->assertNotEmpty($courses->json('data.courses'));

        $courseId = $courses->json('data.courses.0.id');

        $course = $this->getJson("/api/v1/wellness/courses/{$courseId}");
        $course->assertOk();
        $lessonId = $course->json('data.lessons.0.id');
        $this->assertNotNull($lessonId);

        $complete = $this->postJson("/api/v1/wellness/lessons/{$lessonId}/complete");
        $complete->assertOk();

        $lesson = $this->getJson("/api/v1/wellness/lessons/{$lessonId}");
        $lesson->assertOk();
        $lesson->assertJsonPath('data.completed', true);

        $hub = $this->getJson('/api/v1/wellness/hub');
        $hub->assertOk();
        $this->assertGreaterThan(0, $hub->json('data.stats.avg_progress'));
    }

    public function test_system_admin_can_create_course_and_lesson(): void
    {
        $admin = User::factory()->create(['role' => 'system_admin', 'status' => 'active']);
        Sanctum::actingAs($admin);

        $categoryId = $this->getJson('/api/v1/admin/wellness/categories')
            ->json('data.0.id');

        $course = $this->postJson('/api/v1/admin/wellness/courses', [
            'category_id' => $categoryId,
            'title'       => 'Admin Created Course',
            'description' => 'Created from admin test',
            'status'      => 'published',
        ]);
        $course->assertCreated();
        $courseId = $course->json('data.id');

        $lesson = $this->postJson("/api/v1/admin/wellness/courses/{$courseId}/lessons", [
            'title'        => 'Admin Created Lesson',
            'description'  => 'Lesson body',
            'duration_min' => 12,
            'video_url'    => 'https://example.com/video.mp4',
            'status'       => 'published',
        ]);
        $lesson->assertCreated();

        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        Sanctum::actingAs($resident);

        $show = $this->getJson("/api/v1/wellness/courses/{$courseId}");
        $show->assertOk();
        $show->assertJsonPath('data.title', 'Admin Created Course');
        $this->assertCount(1, $show->json('data.lessons'));
    }

    public function test_lesson_requires_file_or_link_and_course_description_is_required(): void
    {
        $admin = User::factory()->create(['role' => 'system_admin', 'status' => 'active']);
        Sanctum::actingAs($admin);

        $categoryId = $this->getJson('/api/v1/admin/wellness/categories')
            ->json('data.0.id');

        $this->postJson('/api/v1/admin/wellness/courses', [
            'category_id' => $categoryId,
            'title'       => 'Validation Course',
            'status'      => 'published',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['description']);

        $courseId = $this->postJson('/api/v1/admin/wellness/courses', [
            'category_id' => $categoryId,
            'title'       => 'Validation Course',
            'description' => 'Required course description',
            'status'      => 'published',
        ])->assertCreated()
            ->json('data.id');

        $this->postJson("/api/v1/admin/wellness/courses/{$courseId}/lessons", [
            'title' => 'Missing Content',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['content']);

        $this->postJson("/api/v1/admin/wellness/courses/{$courseId}/lessons", [
            'title'     => 'Bad Link URL',
            'video_url' => 'not-a-url',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['video_url']);

        $this->postJson("/api/v1/admin/wellness/courses/{$courseId}/lessons", [
            'title'        => 'With Link',
            'link_url'     => 'https://example.com/lesson.mp4',
            'key_takeaways'=> ['Point one', 'Point two'],
        ])->assertCreated()
            ->assertJsonPath('data.link_url', 'https://example.com/lesson.mp4')
            ->assertJsonPath('data.key_takeaways.0', 'Point one');
    }

    public function test_uploaded_lesson_file_is_served_from_storage_path(): void
    {
        $admin = User::factory()->create(['role' => 'system_admin', 'status' => 'active']);
        Sanctum::actingAs($admin);

        $categoryId = $this->getJson('/api/v1/admin/wellness/categories')
            ->json('data.0.id');

        $courseId = $this->postJson('/api/v1/admin/wellness/courses', [
            'category_id' => $categoryId,
            'title'       => 'File Upload Course',
            'description' => 'Course for uploaded lesson media',
            'status'      => 'published',
        ])->assertCreated()
            ->json('data.id');

        $fakeVideo = \Illuminate\Http\UploadedFile::fake()->create('lesson-demo.mp4', 128, 'video/mp4');

        $lesson = $this->postJson("/api/v1/admin/wellness/courses/{$courseId}/lessons", [
            'title' => 'Uploaded Video Lesson',
            'file'  => $fakeVideo,
        ]);
        $lesson->assertCreated();
        $lesson->assertJsonPath('data.has_file', true);
        $this->assertStringContainsString('/storage/wellness/lessons/', $lesson->json('data.file_url'));

        $lessonId = $lesson->json('data.id');

        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        Sanctum::actingAs($resident);

        $show = $this->getJson("/api/v1/wellness/lessons/{$lessonId}");
        $show->assertOk();
        $show->assertJsonPath('data.file_url', fn ($url) => str_contains($url, '/storage/wellness/lessons/'));
    }

    public function test_admin_can_publish_draft_lesson_with_file_only(): void
    {
        $admin = User::factory()->create(['role' => 'system_admin', 'status' => 'active']);
        Sanctum::actingAs($admin);

        $categoryId = $this->getJson('/api/v1/admin/wellness/categories')
            ->json('data.0.id');

        $courseId = $this->postJson('/api/v1/admin/wellness/courses', [
            'category_id' => $categoryId,
            'title'       => 'Publish Test Course',
            'description' => 'Course for publish toggle test',
            'status'      => 'published',
        ])->assertCreated()
            ->json('data.id');

        $fakeVideo = \Illuminate\Http\UploadedFile::fake()->create('draft-lesson.mp4', 128, 'video/mp4');

        $lessonId = $this->postJson("/api/v1/admin/wellness/courses/{$courseId}/lessons", [
            'title'  => 'Draft File Lesson',
            'status' => 'draft',
            'file'   => $fakeVideo,
        ])->assertCreated()
            ->assertJsonPath('data.status', 'draft')
            ->json('data.id');

        $this->patchJson("/api/v1/admin/wellness/lessons/{$lessonId}", [
            'title'  => 'Draft File Lesson',
            'status' => 'published',
        ])->assertOk()
            ->assertJsonPath('data.status', 'published');

        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        Sanctum::actingAs($resident);

        $this->getJson("/api/v1/wellness/lessons/{$lessonId}")
            ->assertOk()
            ->assertJsonPath('data.title', 'Draft File Lesson');
    }

    public function test_system_admin_can_search_update_and_delete_courses_and_lessons(): void
    {
        $admin = User::factory()->create(['role' => 'system_admin', 'status' => 'active']);
        Sanctum::actingAs($admin);

        $categoryId = $this->getJson('/api/v1/admin/wellness/categories')
            ->json('data.0.id');

        $courseId = $this->postJson('/api/v1/admin/wellness/courses', [
            'category_id' => $categoryId,
            'title'       => 'Unique Yoga Flow',
            'description' => 'Stretch and breathe',
            'status'      => 'draft',
        ])->assertCreated()
            ->json('data.id');

        $this->getJson('/api/v1/admin/wellness/courses?search=Unique+Yoga')
            ->assertOk()
            ->assertJsonPath('data.0.title', 'Unique Yoga Flow');

        $this->patchJson("/api/v1/admin/wellness/courses/{$courseId}", [
            'title'  => 'Updated Yoga Flow',
            'status' => 'published',
        ])->assertOk()
            ->assertJsonPath('data.title', 'Updated Yoga Flow')
            ->assertJsonPath('data.status', 'published');

        $lessonId = $this->postJson("/api/v1/admin/wellness/courses/{$courseId}/lessons", [
            'title'        => 'Warm Up',
            'video_url'    => 'https://example.com/warmup.mp4',
            'duration_min' => 8,
        ])->assertCreated()
            ->json('data.id');

        $this->patchJson("/api/v1/admin/wellness/lessons/{$lessonId}", [
            'title'     => 'Warm Up Revised',
            'video_url' => 'https://example.com/warmup-v2.mp4',
        ])->assertOk()
            ->assertJsonPath('data.title', 'Warm Up Revised')
            ->assertJsonPath('data.video_url', 'https://example.com/warmup-v2.mp4');

        $this->deleteJson("/api/v1/admin/wellness/lessons/{$lessonId}")
            ->assertOk();

        $this->getJson("/api/v1/admin/wellness/courses/{$courseId}/lessons")
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->deleteJson("/api/v1/admin/wellness/courses/{$courseId}")
            ->assertOk();

        $this->getJson('/api/v1/admin/wellness/courses?search=Updated+Yoga')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_community_admin_cannot_manage_wellness_hub(): void
    {
        $communityAdmin = User::factory()->create(['role' => 'community_admin', 'status' => 'active']);
        Sanctum::actingAs($communityAdmin);

        $this->getJson('/api/v1/admin/wellness/categories')->assertForbidden();
        $this->getJson('/api/v1/admin/wellness/courses')->assertForbidden();
        $this->postJson('/api/v1/admin/wellness/courses', [
            'category_id' => 1,
            'title'       => 'Blocked Course',
        ])->assertForbidden();
    }

    public function test_admin_can_manage_categories(): void
    {
        $admin = User::factory()->create(['role' => 'system_admin', 'status' => 'active']);
        Sanctum::actingAs($admin);

        $created = $this->postJson('/api/v1/admin/wellness/categories', [
            'title'    => 'Test Category',
            'subtitle' => 'For automated tests',
            'color'    => '#112233',
            'key'      => 'test_category',
        ]);
        $created->assertCreated()
            ->assertJsonPath('data.title', 'Test Category')
            ->assertJsonPath('data.key', 'test_category')
            ->assertJsonPath('data.course_count', 0);

        $categoryId = $created->json('data.id');

        $this->patchJson("/api/v1/admin/wellness/categories/{$categoryId}", [
            'title'  => 'Updated Test Category',
            'status' => 'inactive',
        ])->assertOk()
            ->assertJsonPath('data.title', 'Updated Test Category')
            ->assertJsonPath('data.status', 'inactive');

        $this->deleteJson("/api/v1/admin/wellness/categories/{$categoryId}")
            ->assertOk();

        $this->getJson('/api/v1/admin/wellness/categories')
            ->assertOk()
            ->assertJsonMissing(['key' => 'test_category']);
    }

    public function test_category_cannot_be_deleted_while_courses_exist(): void
    {
        $admin = User::factory()->create(['role' => 'system_admin', 'status' => 'active']);
        Sanctum::actingAs($admin);

        $categoryId = $this->getJson('/api/v1/admin/wellness/categories')
            ->json('data.0.id');

        $this->deleteJson("/api/v1/admin/wellness/categories/{$categoryId}")
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Remove or move all courses in this category before deleting it.');
    }

    public function test_admin_can_toggle_course_publish_status(): void
    {
        $admin = User::factory()->create(['role' => 'system_admin', 'status' => 'active']);
        Sanctum::actingAs($admin);

        $categoryId = $this->getJson('/api/v1/admin/wellness/categories')
            ->json('data.0.id');

        $courseId = $this->postJson('/api/v1/admin/wellness/courses', [
            'category_id' => $categoryId,
            'title'       => 'Toggle Course',
            'description' => 'Publish toggle test',
            'status'      => 'published',
        ])->assertCreated()
            ->json('data.id');

        $this->patchJson("/api/v1/admin/wellness/courses/{$courseId}", [
            'status' => 'draft',
        ])->assertOk()
            ->assertJsonPath('data.status', 'draft');

        $this->patchJson("/api/v1/admin/wellness/courses/{$courseId}", [
            'status' => 'published',
        ])->assertOk()
            ->assertJsonPath('data.status', 'published');
    }

    public function test_admin_can_toggle_lesson_publish_status_with_json_patch(): void
    {
        $admin = User::factory()->create(['role' => 'system_admin', 'status' => 'active']);
        Sanctum::actingAs($admin);

        $categoryId = $this->getJson('/api/v1/admin/wellness/categories')
            ->json('data.0.id');

        $courseId = $this->postJson('/api/v1/admin/wellness/courses', [
            'category_id' => $categoryId,
            'title'       => 'Lesson Toggle Course',
            'description' => 'Lesson publish toggle test',
            'status'      => 'published',
        ])->assertCreated()
            ->json('data.id');

        $lessonId = $this->postJson("/api/v1/admin/wellness/courses/{$courseId}/lessons", [
            'title'     => 'Toggle Lesson',
            'link_url'  => 'https://example.com/toggle-lesson.mp4',
            'status'    => 'published',
        ])->assertCreated()
            ->json('data.id');

        $this->patchJson("/api/v1/admin/wellness/lessons/{$lessonId}", [
            'title'  => 'Toggle Lesson',
            'status' => 'draft',
        ])->assertOk()
            ->assertJsonPath('data.status', 'draft');

        $this->patchJson("/api/v1/admin/wellness/lessons/{$lessonId}", [
            'title'  => 'Toggle Lesson',
            'status' => 'published',
        ])->assertOk()
            ->assertJsonPath('data.status', 'published');
    }

    public function test_draft_courses_and_lessons_are_hidden_from_residents(): void
    {
        $admin = User::factory()->create(['role' => 'system_admin', 'status' => 'active']);
        Sanctum::actingAs($admin);

        $categoryId = $this->getJson('/api/v1/admin/wellness/categories')
            ->json('data.0.id');

        $courseId = $this->postJson('/api/v1/admin/wellness/courses', [
            'category_id' => $categoryId,
            'title'       => 'Hidden Draft Course',
            'description' => 'Should not appear for residents',
            'status'      => 'draft',
        ])->assertCreated()
            ->json('data.id');

        $lessonId = $this->postJson("/api/v1/admin/wellness/courses/{$courseId}/lessons", [
            'title'    => 'Hidden Draft Lesson',
            'link_url' => 'https://example.com/hidden.mp4',
            'status'   => 'draft',
        ])->assertCreated()
            ->json('data.id');

        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        Sanctum::actingAs($resident);

        $this->getJson("/api/v1/wellness/courses/{$courseId}")
            ->assertNotFound();

        $this->getJson("/api/v1/wellness/lessons/{$lessonId}")
            ->assertNotFound();

        Sanctum::actingAs($admin);

        $publishedCourseId = $this->postJson('/api/v1/admin/wellness/courses', [
            'category_id' => $categoryId,
            'title'       => 'Published With Draft Lesson',
            'description' => 'Only published lessons visible',
            'status'      => 'published',
        ])->assertCreated()
            ->json('data.id');

        $this->postJson("/api/v1/admin/wellness/courses/{$publishedCourseId}/lessons", [
            'title'    => 'Visible Published Lesson',
            'link_url' => 'https://example.com/visible.mp4',
            'status'   => 'published',
        ])->assertCreated();

        $draftLessonId = $this->postJson("/api/v1/admin/wellness/courses/{$publishedCourseId}/lessons", [
            'title'    => 'Draft Lesson In Published Course',
            'link_url' => 'https://example.com/draft-in-course.mp4',
            'status'   => 'draft',
        ])->assertCreated()
            ->json('data.id');

        Sanctum::actingAs($resident);

        $course = $this->getJson("/api/v1/wellness/courses/{$publishedCourseId}")
            ->assertOk();
        $this->assertCount(1, $course->json('data.lessons'));
        $this->assertSame('Visible Published Lesson', $course->json('data.lessons.0.title'));

        $this->getJson("/api/v1/wellness/lessons/{$draftLessonId}")
            ->assertNotFound();
    }

    public function test_resident_can_uncomplete_lesson(): void
    {
        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        Sanctum::actingAs($resident);

        $courses = $this->getJson('/api/v1/wellness/categories/weight/courses')->assertOk();
        $courseId = $courses->json('data.courses.0.id');
        $lessonId = $this->getJson("/api/v1/wellness/courses/{$courseId}")
            ->json('data.lessons.0.id');

        $this->postJson("/api/v1/wellness/lessons/{$lessonId}/complete")->assertOk();
        $this->getJson("/api/v1/wellness/lessons/{$lessonId}")
            ->assertOk()
            ->assertJsonPath('data.completed', true);

        $this->deleteJson("/api/v1/wellness/lessons/{$lessonId}/complete")->assertOk();
        $this->getJson("/api/v1/wellness/lessons/{$lessonId}")
            ->assertOk()
            ->assertJsonPath('data.completed', false);
    }

    public function test_admin_course_list_supports_category_and_status_filters(): void
    {
        $admin = User::factory()->create(['role' => 'system_admin', 'status' => 'active']);
        Sanctum::actingAs($admin);

        $categories = $this->getJson('/api/v1/admin/wellness/categories')->assertOk()->json('data');
        $categoryId = $categories[0]['id'];

        $draftId = $this->postJson('/api/v1/admin/wellness/courses', [
            'category_id' => $categoryId,
            'title'       => 'Filter Draft Course',
            'description' => 'Draft filter test',
            'status'      => 'draft',
        ])->assertCreated()
            ->json('data.id');

        $this->getJson("/api/v1/admin/wellness/courses?category_id={$categoryId}&status=draft")
            ->assertOk()
            ->assertJsonFragment(['id' => $draftId, 'status' => 'draft']);

        $this->getJson('/api/v1/admin/wellness/courses?status=published')
            ->assertOk()
            ->assertJsonMissing(['id' => $draftId]);
    }

    public function test_inactive_category_is_hidden_from_resident_hub(): void
    {
        $admin = User::factory()->create(['role' => 'system_admin', 'status' => 'active']);
        Sanctum::actingAs($admin);

        $created = $this->postJson('/api/v1/admin/wellness/categories', [
            'title' => 'Inactive Hub Category',
            'key'   => 'inactive_hub_cat',
            'status'=> 'inactive',
        ])->assertCreated();

        $categoryKey = $created->json('data.key');

        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        Sanctum::actingAs($resident);

        $hubKeys = collect($this->getJson('/api/v1/wellness/hub')->json('data.categories'))
            ->pluck('key')
            ->all();
        $this->assertNotContains($categoryKey, $hubKeys);

        $this->getJson("/api/v1/wellness/categories/{$categoryKey}/courses")
            ->assertNotFound();
    }
}
