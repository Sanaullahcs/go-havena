<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NoticeBoardTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['billing.enabled' => false, 'billing.enforce' => false]);
    }

    private function seedCommunityWithAdmin(): array
    {
        $region = Region::query()->create([
            'title'       => 'Cairo Metro',
            'area'        => 'Cairo',
            'users_label' => '0 users',
            'sort_order'  => 1,
            'status'      => 'active',
        ]);

        $community = Community::query()->create([
            'name'          => 'Oak Valley',
            'region_id'     => $region->id,
            'region'        => $region->title,
            'status'        => 'active',
            'review_status' => 'approved',
        ]);

        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
            'phone'                  => '+201700000020',
        ]);

        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000021',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $resident->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        return compact('community', 'admin', 'resident');
    }

    /** Default relevance schedule fields required for notice/event/alert creates. */
    private function scheduleFields(?string $date = null): array
    {
        $day = $date ?? now()->addDay()->toDateString();

        return [
            'event_date'      => $day,
            'event_end_date'  => $day,
            'event_time'      => '09:00',
            'event_time_end'  => '17:00',
        ];
    }

    public function test_community_admin_can_create_notice_visible_to_residents(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $create = $this->postJson('/api/v1/admin/notices', array_merge([
            'title'    => 'Pool maintenance',
            'body'     => 'The pool will close at 5 PM today.',
            'category' => 'maintenance',
        ], $this->scheduleFields()))->assertCreated();

        $noticeId = $create->json('data.id');
        $this->assertSame('published', $create->json('data.status'));
        $this->assertSame('approved', $create->json('data.review_status'));

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notices')
            ->assertOk()
            ->assertJsonPath('data.0.id', $noticeId)
            ->assertJsonPath('data.0.title', 'Pool maintenance')
            ->assertJsonPath('data.0.community_id', $community->id);
    }

    public function test_community_admin_can_create_event_with_image_url(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $imageUrl = 'https://cdn.example.com/notices/bbq.jpg';

        $create = $this->postJson('/api/v1/admin/events', array_merge([
            'title'      => 'Community BBQ',
            'body'       => 'Join us at the clubhouse.',
            'location'   => 'Clubhouse lawn',
            'image_url'  => $imageUrl,
            'event_time' => '18:00',
            'event_time_end' => '21:00',
        ], $this->scheduleFields(now()->addDays(3)->toDateString())))->assertCreated();

        $this->assertSame('event', $create->json('data.category'));
        $this->assertSame($imageUrl, $create->json('data.image_url'));

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notices/'.$create->json('data.id'))
            ->assertOk()
            ->assertJsonPath('data.image_url', $imageUrl)
            ->assertJsonPath('data.title', 'Community BBQ');
    }

    public function test_event_create_rejects_invalid_characters_in_title_and_location(): void
    {
        ['admin' => $admin] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $payload = array_merge([
            'title' => 'DSGFKJASD,EWR/?',
            'body' => 'Join us in the courtyard for food and fun.',
            'location' => 'Clubhouse ???',
            'event_time' => '18:00',
            'event_time_end' => '21:00',
        ], $this->scheduleFields(now()->addDays(2)->toDateString()));

        $this->postJson('/api/v1/admin/events', $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['title', 'location']);
    }

    public function test_long_notice_body_still_creates_and_notifies_residents(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $body = str_repeat('Community BBQ details. ', 80);

        $response = $this->postJson('/api/v1/admin/notices', array_merge([
            'title'    => 'Neighborhood BBQ',
            'body'     => $body,
            'category' => 'general',
            'status'   => 'published',
        ], $this->scheduleFields()))->assertCreated();

        $noticeId = $response->json('data.id');
        $this->assertNotEmpty($noticeId);

        $notification = DB::table('app_notifications')
            ->where('user_id', $resident->id)
            ->where('action_url', "/notices/{$noticeId}")
            ->first();

        $this->assertNotNull($notification);
        $this->assertLessThanOrEqual(500, mb_strlen((string) $notification->body));
    }

    public function test_notice_image_upload_endpoint_returns_url(): void
    {
        Storage::fake('public');
        ['admin' => $admin] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $file = UploadedFile::fake()->create('cover.jpg', 100, 'image/jpeg');

        $response = $this->postJson('/api/v1/admin/notices/upload-image', [
            'image' => $file,
        ])->assertOk();

        $imageUrl = $response->json('data.image_url');
        $this->assertNotEmpty($imageUrl);
        $this->assertStringContainsString('/storage/notices/', $imageUrl);
        Storage::disk('public')->assertExists('notices/'.basename(parse_url($imageUrl, PHP_URL_PATH)));
    }

    public function test_dashboard_style_image_url_is_rewritten_for_mobile_request(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $create = $this->postJson('/api/v1/admin/notices', array_merge([
            'title'     => 'Photo notice',
            'body'      => 'Includes a cover image.',
            'category'  => 'general',
            'image_url' => 'http://127.0.0.1:8000/storage/notices/dashboard-cover.jpg',
        ], $this->scheduleFields()))->assertCreated();

        $noticeId = $create->json('data.id');

        Sanctum::actingAs($resident);

        config(['app.url' => 'http://10.0.2.2/go-havena/backend/public']);

        $imageUrl = $this->getJson('/api/v1/notices/'.$noticeId)
            ->assertOk()
            ->json('data.image_url');

        $this->assertStringContainsString('/storage/notices/dashboard-cover.jpg', $imageUrl);
        $this->assertStringNotContainsString('127.0.0.1', $imageUrl);
    }

    public function test_resident_list_excludes_draft_notices(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/admin/notices', [
            'title'    => 'Draft notice',
            'body'     => 'Not visible yet',
            'category' => 'general',
            'status'   => 'draft',
        ])->assertCreated();

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notices')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_resident_list_excludes_expired_scheduled_notices(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $active = $this->postJson('/api/v1/admin/notices', array_merge([
            'title'    => 'Upcoming maintenance',
            'body'     => 'Still relevant.',
            'category' => 'maintenance',
        ], $this->scheduleFields(now()->addDay()->toDateString())))->assertCreated();

        $expired = $this->postJson('/api/v1/admin/notices', array_merge([
            'title'    => 'Past maintenance',
            'body'     => 'Should be hidden.',
            'category' => 'maintenance',
        ], $this->scheduleFields(now()->subDay()->toDateString())))->assertCreated();

        Sanctum::actingAs($resident);

        $response = $this->getJson('/api/v1/notices')->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();

        $this->assertContains($active->json('data.id'), $ids);
        $this->assertNotContains($expired->json('data.id'), $ids);

        $withExpired = $this->getJson('/api/v1/notices?include_expired=1')->assertOk();
        $withExpiredIds = collect($withExpired->json('data'))->pluck('id')->all();
        $this->assertContains($active->json('data.id'), $withExpiredIds);
        $this->assertContains($expired->json('data.id'), $withExpiredIds);

        $this->getJson('/api/v1/notices/'.$expired->json('data.id'))
            ->assertOk()
            ->assertJsonPath('data.id', $expired->json('data.id'));
    }

    public function test_resident_can_submit_event_pending_until_admin_approves(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($resident);

        $create = $this->postJson('/api/v1/events', [
            'title'      => 'Block Party',
            'body'       => 'Bring a dish to share.',
            'location'   => 'Courtyard',
            'event_date' => now()->addDays(5)->toDateString(),
            'event_time' => '17:00',
            'event_time_end' => '20:00',
        ])->assertCreated();

        $eventId = $create->json('data.id');
        $this->assertSame('pending', $create->json('data.review_status'));
        $this->assertSame('draft', $create->json('data.status'));

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notices')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->getJson('/api/v1/notices/'.$eventId)
            ->assertNotFound();

        Sanctum::actingAs($admin);

        $this->patchJson('/api/v1/admin/notices/'.$eventId.'/approve')
            ->assertOk()
            ->assertJsonPath('data.review_status', 'approved')
            ->assertJsonPath('data.status', 'published');

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notices')
            ->assertOk()
            ->assertJsonPath('data.0.id', $eventId)
            ->assertJsonPath('data.0.title', 'Block Party')
            ->assertJsonPath('data.0.community_id', $community->id);
    }

    public function test_resident_can_list_own_events_in_mine_tab(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        $other = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000099',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $other->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        Sanctum::actingAs($resident);

        $create = $this->postJson('/api/v1/events', [
            'title'          => 'My Courtyard Party',
            'body'           => 'Potluck.',
            'location'       => 'Courtyard',
            'event_date'     => now()->addDays(4)->toDateString(),
            'event_time'     => '18:00',
            'event_time_end' => '21:00',
        ])->assertCreated();

        $eventId = $create->json('data.id');

        $this->getJson('/api/v1/notices?mine=1&include_expired=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $eventId)
            ->assertJsonPath('data.0.review_status', 'pending');

        Sanctum::actingAs($other);

        $this->getJson('/api/v1/notices?mine=1')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        Sanctum::actingAs($admin);

        $this->patchJson('/api/v1/admin/notices/'.$eventId.'/approve')->assertOk();

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notices?mine=1')
            ->assertOk()
            ->assertJsonPath('data.0.review_status', 'approved');

        $this->getJson('/api/v1/notices/'.$eventId)
            ->assertOk()
            ->assertJsonPath('data.id', $eventId);
    }

    public function test_author_can_view_pending_event_other_residents_cannot(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        $neighbor = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000098',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $neighbor->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        Sanctum::actingAs($resident);

        $eventId = $this->postJson('/api/v1/events', [
            'title'          => 'Private Until Approved',
            'body'           => 'Details',
            'location'       => 'Clubhouse',
            'event_date'     => now()->addDays(2)->toDateString(),
            'event_time'     => '10:00',
            'event_time_end' => '12:00',
        ])->assertCreated()
            ->json('data.id');

        Sanctum::actingAs($neighbor);

        $this->getJson('/api/v1/notices/'.$eventId)->assertNotFound();
    }

    public function test_community_admin_can_rsvp_to_resident_created_event(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($resident);

        $create = $this->postJson('/api/v1/events', [
            'title'          => 'Resident Block Party',
            'body'           => 'Potluck in the courtyard.',
            'location'       => 'Courtyard',
            'event_date'     => now()->addDays(3)->toDateString(),
            'event_time'     => '18:00',
            'event_time_end' => '21:00',
            'requires_rsvp'  => true,
        ])->assertCreated();

        $eventId = $create->json('data.id');

        Sanctum::actingAs($admin);

        $this->patchJson('/api/v1/admin/notices/'.$eventId.'/approve')->assertOk();

        $this->postJson('/api/v1/notices/'.$eventId.'/rsvp', [
            'status' => 'going',
        ])
            ->assertOk()
            ->assertJsonPath('data.is_joined', true)
            ->assertJsonPath('data.is_organizer', false)
            ->assertJsonPath('data.rsvp_count', 1);
    }

    public function test_admin_can_reapprove_rejected_event(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($resident);

        $create = $this->postJson('/api/v1/events', [
            'title'          => 'Garden Meetup',
            'body'           => 'Bring your plants.',
            'location'       => 'Community garden',
            'event_date'     => now()->addDays(4)->toDateString(),
            'event_time'     => '16:00',
            'event_time_end' => '18:00',
        ])->assertCreated();

        $eventId = $create->json('data.id');

        Sanctum::actingAs($admin);

        $this->patchJson('/api/v1/admin/notices/'.$eventId.'/reject', [
            'reason' => 'Incomplete details',
        ])->assertOk();

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notices')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        Sanctum::actingAs($admin);

        $this->patchJson('/api/v1/admin/notices/'.$eventId.'/approve')
            ->assertOk()
            ->assertJsonPath('message', 'Re-approved and published')
            ->assertJsonPath('data.review_status', 'approved')
            ->assertJsonPath('data.status', 'published');

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notices')
            ->assertOk()
            ->assertJsonPath('data.0.id', $eventId)
            ->assertJsonPath('data.0.title', 'Garden Meetup')
            ->assertJsonPath('data.0.community_id', $community->id);
    }

    public function test_resident_cannot_use_admin_event_endpoint(): void
    {
        ['resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($resident);

        $this->postJson('/api/v1/admin/events', [
            'title'      => 'Secret event',
            'body'       => 'Should fail',
            'location'   => 'Park',
            'event_date' => now()->addDay()->toDateString(),
            'event_time' => '10:00',
        ])->assertForbidden();
    }

    public function test_resident_can_join_event_and_organizer_cannot_rsvp(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $create = $this->postJson('/api/v1/admin/events', [
            'title'          => 'Community BBQ',
            'body'           => 'Bring a side dish.',
            'location'       => 'Courtyard',
            'event_date'     => now()->addDays(2)->toDateString(),
            'event_time'     => '17:00',
            'event_time_end' => '20:00',
            'requires_rsvp'  => true,
        ])->assertCreated();

        $eventId = $create->json('data.id');

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/notices/'.$eventId.'/rsvp', [
            'status' => 'going',
        ])->assertStatus(422);

        Sanctum::actingAs($resident);

        $join = $this->postJson('/api/v1/notices/'.$eventId.'/rsvp', [
            'status' => 'going',
        ])->assertOk();

        $this->assertTrue($join->json('data.is_joined'));
        $this->assertSame(1, $join->json('data.rsvp_count'));
        $this->assertCount(1, $join->json('data.attendees'));

        $show = $this->getJson('/api/v1/notices/'.$eventId)->assertOk();
        $this->assertTrue($show->json('data.is_joined'));
        $this->assertFalse($show->json('data.is_organizer'));

        $joinNotification = DB::table('app_notifications')
            ->where('user_id', $admin->id)
            ->where('title', 'Event Update')
            ->orderByDesc('id')
            ->first();

        $this->assertNotNull($joinNotification);
        $this->assertStringContainsString('joined your event', $joinNotification->body);
        $this->assertStringContainsString('Total people coming: 1', $joinNotification->body);

        Sanctum::actingAs($admin);

        $listed = $this->getJson('/api/v1/notifications')->assertOk();
        $latest = collect($listed->json('data'))->firstWhere('title', 'Event Update');
        $this->assertNotNull($latest);
        $this->assertStringContainsString('joined your event', $latest['body']);

        Sanctum::actingAs($resident);

        $leave = $this->postJson('/api/v1/notices/'.$eventId.'/rsvp', [
            'status' => 'not_going',
        ])->assertOk();

        $this->assertFalse($leave->json('data.is_joined'));
        $this->assertSame(0, $leave->json('data.rsvp_count'));

        $leaveNotification = DB::table('app_notifications')
            ->where('user_id', $admin->id)
            ->where('title', 'Event Update')
            ->orderByDesc('id')
            ->first();

        $this->assertNotNull($leaveNotification);
        $this->assertStringContainsString('left your event', $leaveNotification->body);
        $this->assertStringContainsString('Total people coming: 0', $leaveNotification->body);
    }

    public function test_event_rsvp_adds_to_waitlist_when_capacity_reached(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        $residentTwo = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000022',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $residentTwo->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        Sanctum::actingAs($admin);

        $create = $this->postJson('/api/v1/admin/events', [
            'title'          => 'Small meetup',
            'body'           => 'Limited seats.',
            'location'       => 'Clubhouse',
            'event_date'     => now()->addDays(2)->toDateString(),
            'event_time'     => '17:00',
            'event_time_end' => '19:00',
            'event_capacity' => 1,
            'requires_rsvp'  => true,
        ])->assertCreated();

        $eventId = $create->json('data.id');

        Sanctum::actingAs($resident);

        $this->postJson('/api/v1/notices/'.$eventId.'/rsvp', [
            'status' => 'going',
        ])->assertOk()
            ->assertJsonPath('data.is_joined', true)
            ->assertJsonPath('data.rsvp_count', 1)
            ->assertJsonPath('data.is_full', true)
            ->assertJsonPath('data.spots_remaining', 0);

        Sanctum::actingAs($residentTwo);

        $this->postJson('/api/v1/notices/'.$eventId.'/rsvp', [
            'status' => 'going',
        ])->assertOk()
            ->assertJsonPath('message', "You're on the waiting list")
            ->assertJsonPath('data.is_waitlisted', true)
            ->assertJsonPath('data.waitlist_position', 1)
            ->assertJsonPath('data.waitlist_count', 1)
            ->assertJsonPath('data.is_joined', false)
            ->assertJsonPath('data.rsvp_count', 1);
    }

    public function test_leaving_event_promotes_next_waitlisted_resident(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        $residentTwo = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000033',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $residentTwo->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        Sanctum::actingAs($admin);

        $eventId = $this->postJson('/api/v1/admin/events', [
            'title'          => 'Waitlist promotion test',
            'body'           => 'One seat.',
            'location'       => 'Hall',
            'event_date'     => now()->addDays(3)->toDateString(),
            'event_time'     => '18:00',
            'event_time_end' => '20:00',
            'event_capacity' => 1,
            'requires_rsvp'  => true,
        ])->assertCreated()
            ->json('data.id');

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/notices/'.$eventId.'/rsvp', ['status' => 'going'])->assertOk();

        Sanctum::actingAs($residentTwo);
        $this->postJson('/api/v1/notices/'.$eventId.'/rsvp', ['status' => 'going'])
            ->assertOk()
            ->assertJsonPath('data.is_waitlisted', true);

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/notices/'.$eventId.'/rsvp', ['status' => 'not_going'])->assertOk();

        Sanctum::actingAs($residentTwo);
        $this->getJson('/api/v1/notices/'.$eventId)
            ->assertOk()
            ->assertJsonPath('data.is_joined', true)
            ->assertJsonPath('data.is_waitlisted', false)
            ->assertJsonPath('data.rsvp_count', 1)
            ->assertJsonPath('data.waitlist_count', 0);

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $residentTwo->id,
            'title'   => 'Seat Available',
        ]);
    }

    public function test_organizer_can_view_event_waitlist(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        $organizer = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000044',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $organizer->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        Sanctum::actingAs($admin);

        $eventId = $this->postJson('/api/v1/admin/events', [
            'title'          => 'Organizer waitlist view',
            'body'           => 'Queue test',
            'location'       => 'Park',
            'event_date'     => now()->addDays(4)->toDateString(),
            'event_time'     => '10:00',
            'event_time_end' => '12:00',
            'event_capacity' => 1,
            'requires_rsvp'  => true,
        ])->assertCreated()
            ->json('data.id');

        DB::table('notices')->where('id', $eventId)->update(['author_id' => $organizer->id]);

        $residentTwo = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000055',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $residentTwo->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        Sanctum::actingAs($residentTwo);
        $this->postJson('/api/v1/notices/'.$eventId.'/rsvp', ['status' => 'going'])->assertOk();

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/notices/'.$eventId.'/rsvp', ['status' => 'going'])
            ->assertOk()
            ->assertJsonPath('data.is_waitlisted', true);

        Sanctum::actingAs($organizer);
        $this->getJson('/api/v1/notices/'.$eventId)
            ->assertOk()
            ->assertJsonPath('data.waitlist_count', 1)
            ->assertJsonCount(1, 'data.waitlist')
            ->assertJsonPath('data.waitlist.0.name', $resident->name);
    }

    public function test_admin_cannot_set_event_capacity_below_attendance(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        $residentTwo = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000023',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $residentTwo->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        Sanctum::actingAs($admin);

        $create = $this->postJson('/api/v1/admin/events', [
            'title'          => 'Workshop',
            'body'           => 'Hands-on session.',
            'location'       => 'Room A',
            'event_date'     => now()->addDays(2)->toDateString(),
            'event_time'     => '14:00',
            'event_time_end' => '16:00',
            'event_capacity' => 5,
            'requires_rsvp'  => true,
        ])->assertCreated();

        $eventId = $create->json('data.id');

        Sanctum::actingAs($resident);

        $this->postJson('/api/v1/notices/'.$eventId.'/rsvp', [
            'status' => 'going',
        ])->assertOk();

        Sanctum::actingAs($residentTwo);

        $this->postJson('/api/v1/notices/'.$eventId.'/rsvp', [
            'status' => 'going',
        ])->assertOk();

        Sanctum::actingAs($admin);

        $this->patchJson('/api/v1/admin/notices/'.$eventId, [
            'event_capacity' => 1,
        ])->assertStatus(422)
            ->assertJsonPath('code', 'capacity_below_attendance');
    }

    public function test_community_admin_can_create_alert_and_notify_residents(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $create = $this->postJson('/api/v1/admin/alerts', array_merge([
            'title'          => 'Water shutoff',
            'body'           => 'Water will be off from 9 AM to 1 PM tomorrow.',
            'event_time'     => '09:00',
            'event_time_end' => '13:00',
        ], $this->scheduleFields(now()->addDay()->toDateString())))->assertCreated();

        $this->assertSame('emergency', $create->json('data.category'));

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $resident->id,
            'type'    => 'warning',
            'title'   => 'New Alert',
        ]);

        $this->assertDatabaseMissing('app_notifications', [
            'user_id' => $admin->id,
            'title'   => 'New Alert',
        ]);
    }

    public function test_notice_publisher_is_not_notified_but_other_admins_and_residents_are(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        $otherAdmin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
            'phone'                  => '+201700000023',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $otherAdmin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        Sanctum::actingAs($admin);

        $noticeId = $this->postJson('/api/v1/admin/notices', array_merge([
            'title'    => 'Pool closed',
            'body'     => 'The pool is closed for cleaning.',
            'category' => 'general',
            'status'   => 'published',
        ], $this->scheduleFields()))->assertCreated()->json('data.id');

        $this->assertDatabaseMissing('app_notifications', [
            'user_id'    => $admin->id,
            'action_url' => "/notices/{$noticeId}",
        ]);

        foreach ([$resident->id, $otherAdmin->id] as $userId) {
            $this->assertDatabaseHas('app_notifications', [
                'user_id'    => $userId,
                'action_url' => "/notices/{$noticeId}",
                'title'      => 'New Notice',
            ]);
        }
    }

    public function test_scheduled_notice_does_not_notify_its_author(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $noticeId = $this->postJson('/api/v1/admin/notices', array_merge([
            'title'        => 'Later reminder',
            'body'         => 'This notice publishes on a schedule.',
            'category'     => 'general',
            'scheduled_at' => now()->addHours(2)->toIso8601String(),
        ], $this->scheduleFields()))->assertCreated()->json('data.id');

        $this->assertDatabaseMissing('app_notifications', [
            'action_url' => "/notices/{$noticeId}",
        ]);

        $this->travelTo(now()->addHours(3));

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notices')
            ->assertOk()
            ->assertJsonPath('data.0.id', $noticeId);

        $this->assertDatabaseMissing('app_notifications', [
            'user_id'    => $admin->id,
            'action_url' => "/notices/{$noticeId}",
        ]);

        $this->assertDatabaseHas('app_notifications', [
            'user_id'    => $resident->id,
            'action_url' => "/notices/{$noticeId}",
            'title'      => 'New Notice',
        ]);
    }

    public function test_resident_cannot_create_alert(): void
    {
        ['resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($resident);

        $this->postJson('/api/v1/admin/alerts', [
            'title' => 'Fake alert',
            'body'  => 'Should fail',
        ])->assertForbidden();
    }

    public function test_editing_published_alert_updates_existing_notifications(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $create = $this->postJson('/api/v1/admin/alerts', array_merge([
            'title' => 'Water shutoff',
            'body'  => 'Water will be off from 9 AM to 1 PM tomorrow.',
        ], $this->scheduleFields()))->assertCreated();

        $alertId = $create->json('data.id');

        $this->patchJson('/api/v1/admin/notices/'.$alertId, [
            'title' => 'Water restored',
            'body'  => 'Water service has been restored.',
        ])->assertOk();

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonPath('data.0.body', 'Water service has been restored.');
    }

    public function test_notification_list_shows_live_notice_body_even_when_stored_body_is_stale(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $create = $this->postJson('/api/v1/admin/alerts', array_merge([
            'title' => 'Old title',
            'body'  => 'Old body text',
        ], $this->scheduleFields()))->assertCreated();

        $alertId = $create->json('data.id');

        DB::table('notices')->where('id', $alertId)->update([
            'title'      => 'Updated title',
            'body'       => 'Updated body text',
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonPath('data.0.body', 'Updated body text');
    }

    public function test_notification_list_sorts_unread_before_read(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $first = $this->postJson('/api/v1/admin/alerts', array_merge([
            'title' => 'First alert',
            'body'  => 'First body',
        ], $this->scheduleFields()))->assertCreated();

        $second = $this->postJson('/api/v1/admin/alerts', array_merge([
            'title' => 'Second alert',
            'body'  => 'Second body',
        ], $this->scheduleFields()))->assertCreated();

        $firstNotificationId = DB::table('app_notifications')
            ->where('user_id', $resident->id)
            ->where('action_url', '/notices/'.$first->json('data.id'))
            ->value('id');

        DB::table('app_notifications')
            ->where('id', $firstNotificationId)
            ->update(['read_at' => now()]);

        Sanctum::actingAs($resident);

        $response = $this->getJson('/api/v1/notifications')->assertOk();

        $this->assertSame('Second body', $response->json('data.0.body'));
        $this->assertSame('First body', $response->json('data.1.body'));
    }

    public function test_admin_can_schedule_event_for_later_publish(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $scheduledAt = now()->addDay()->format('Y-m-d H:i:s');

        $create = $this->postJson('/api/v1/admin/events', array_merge([
            'title'         => 'Future event',
            'body'          => 'Not visible yet.',
            'location'      => 'Park',
            'scheduled_at'  => $scheduledAt,
            'requires_rsvp' => true,
        ], $this->scheduleFields(now()->addDays(3)->toDateString())))->assertCreated();

        $eventId = $create->json('data.id');
        $this->assertSame('draft', $create->json('data.status'));
        $this->assertNotNull($create->json('data.scheduled_at'));

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notices?category=event')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->travelTo(now()->addDays(2));

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notices?category=event')
            ->assertOk()
            ->assertJsonPath('data.0.id', $eventId)
            ->assertJsonPath('data.0.title', 'Future event');

        $this->travelBack();
    }

    public function test_pinned_events_sort_first_in_resident_list(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $regular = $this->postJson('/api/v1/admin/events', array_merge([
            'title'         => 'Regular event',
            'body'          => 'Normal ordering.',
            'location'      => 'Hall',
            'requires_rsvp' => false,
        ], $this->scheduleFields(now()->addDays(5)->toDateString())))->assertCreated();

        $pinned = $this->postJson('/api/v1/admin/events', array_merge([
            'title'         => 'Pinned event',
            'body'          => 'Should appear first.',
            'location'      => 'Lobby',
            'is_pinned'     => true,
            'requires_rsvp' => false,
        ], $this->scheduleFields(now()->addDays(6)->toDateString())))->assertCreated();

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notices?category=event')
            ->assertOk()
            ->assertJsonPath('data.0.id', $pinned->json('data.id'))
            ->assertJsonPath('data.1.id', $regular->json('data.id'));
    }

    public function test_rsvp_rejected_when_event_does_not_require_rsvp(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $create = $this->postJson('/api/v1/admin/events', array_merge([
            'title'         => 'Open house',
            'body'          => 'No RSVP needed.',
            'location'      => 'Courtyard',
            'requires_rsvp' => false,
        ], $this->scheduleFields(now()->addDays(2)->toDateString())))->assertCreated();

        $eventId = $create->json('data.id');

        Sanctum::actingAs($resident);

        $this->postJson('/api/v1/notices/'.$eventId.'/rsvp', [
            'status' => 'going',
        ])->assertStatus(422);
    }

    public function test_resident_cannot_set_admin_only_event_options(): void
    {
        ['resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($resident);

        $this->postJson('/api/v1/events', [
            'title'        => 'Resident event',
            'body'         => 'Submitted by resident.',
            'location'     => 'Park',
            'event_date'   => now()->addDays(2)->toDateString(),
            'event_time'   => '09:00',
            'is_pinned'    => true,
            'scheduled_at' => now()->addDay()->toDateTimeString(),
        ])->assertStatus(422);
    }

    public function test_admin_can_schedule_notice_for_later_publish(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $scheduledAt = now()->addDay()->format('Y-m-d H:i:s');
        $noticeDate = now()->addDays(2)->toDateString();

        $create = $this->postJson('/api/v1/admin/notices', [
            'title'          => 'Future notice',
            'body'           => 'Scheduled community notice.',
            'category'       => 'general',
            'event_date'     => $noticeDate,
            'event_time'     => '09:00',
            'event_time_end' => '17:00',
            'scheduled_at'   => $scheduledAt,
            'is_pinned'      => true,
        ])->assertCreated();

        $noticeId = $create->json('data.id');
        $this->assertSame('draft', $create->json('data.status'));
        $this->assertTrue($create->json('data.is_pinned'));

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notices?category=general')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->travelTo(now()->addDays(2));

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notices?category=general')
            ->assertOk()
            ->assertJsonPath('data.0.id', $noticeId)
            ->assertJsonPath('data.0.event_date', $noticeDate);
    }

    public function test_pinned_notices_sort_first_in_resident_list(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/admin/notices', array_merge([
            'title'    => 'Regular notice',
            'body'     => 'Standard notice body here.',
            'category' => 'general',
        ], $this->scheduleFields()))->assertCreated();

        $pinned = $this->postJson('/api/v1/admin/notices', array_merge([
            'title'     => 'Pinned notice',
            'body'      => 'Important pinned notice body.',
            'category'  => 'general',
            'is_pinned' => true,
        ], $this->scheduleFields()))->assertCreated();

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notices?category=general')
            ->assertOk()
            ->assertJsonPath('data.0.id', $pinned->json('data.id'))
            ->assertJsonPath('data.0.title', 'Pinned notice');
    }

    public function test_admin_can_schedule_alert_for_later_publish(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $scheduledAt = now()->addDay()->format('Y-m-d H:i:s');
        $alertDate = now()->addDays(2)->toDateString();

        $create = $this->postJson('/api/v1/admin/alerts', array_merge([
            'title'        => 'Future alert',
            'body'         => 'Scheduled emergency alert.',
            'scheduled_at' => $scheduledAt,
            'is_pinned'    => true,
        ], $this->scheduleFields($alertDate)))->assertCreated();

        $alertId = $create->json('data.id');
        $this->assertSame('draft', $create->json('data.status'));
        $this->assertTrue($create->json('data.is_pinned'));
        $this->assertNotNull($create->json('data.scheduled_at'));

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notices?category=emergency')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->travelTo(now()->addDays(2));

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notices?category=emergency')
            ->assertOk()
            ->assertJsonPath('data.0.id', $alertId)
            ->assertJsonPath('data.0.event_date', $alertDate);

        $this->travelBack();
    }

    public function test_published_create_rejects_missing_schedule_for_notice_event_and_alert(): void
    {
        ['admin' => $admin] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/admin/notices', [
            'title'    => 'No schedule notice',
            'body'     => 'Missing date and times.',
            'category' => 'general',
        ])->assertStatus(422)
            ->assertJsonPath('errors.event_date.0', 'Date is required.');

        $this->postJson('/api/v1/admin/events', [
            'title'    => 'No schedule event',
            'body'     => 'Missing date and times.',
            'location' => 'Park',
        ])->assertStatus(422)
            ->assertJsonPath('errors.event_time_end.0', 'End time is required.');

        $this->postJson('/api/v1/admin/alerts', [
            'title' => 'No schedule alert',
            'body'  => 'Missing date and times.',
        ])->assertStatus(422)
            ->assertJsonPath('errors.event_date.0', 'Date is required.');

        $this->postJson('/api/v1/admin/alerts', [
            'title'      => 'Date only alert',
            'body'       => 'Alert without start or end time.',
            'event_date' => now()->addDay()->toDateString(),
        ])->assertCreated()
            ->assertJsonPath('data.category', 'emergency')
            ->assertJsonPath('data.event_time', null)
            ->assertJsonPath('data.event_time_end', null);
    }

    public function test_pinned_alerts_sort_first_in_resident_list(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $regular = $this->postJson('/api/v1/admin/alerts', array_merge([
            'title' => 'Regular alert',
            'body'  => 'Standard alert body text.',
        ], $this->scheduleFields(now()->addDays(3)->toDateString())))->assertCreated();

        $pinned = $this->postJson('/api/v1/admin/alerts', array_merge([
            'title'     => 'Pinned alert',
            'body'      => 'Important pinned alert body.',
            'is_pinned' => true,
        ], $this->scheduleFields(now()->addDays(4)->toDateString())))->assertCreated();

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notices?category=emergency')
            ->assertOk()
            ->assertJsonPath('data.0.id', $pinned->json('data.id'))
            ->assertJsonPath('data.1.id', $regular->json('data.id'));
    }

    public function test_legacy_naive_scheduled_at_publishes_in_schedule_timezone(): void
    {
        config(['app.schedule_timezone' => 'Asia/Karachi']);

        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        $communityId = (int) DB::table('community_memberships')
            ->where('user_id', $admin->id)
            ->where('role', 'admin')
            ->value('community_id');

        $pastUtc = now('Asia/Karachi')->subHour()->utc()->format('Y-m-d H:i:s');

        $noticeId = DB::table('notices')->insertGetId([
            'community_id'   => $communityId,
            'author_id'      => $admin->id,
            'title'          => 'Legacy scheduled alert',
            'category'       => 'emergency',
            'body'           => 'Should auto-publish using schedule timezone.',
            'event_date'     => now('Asia/Karachi')->addDay()->toDateString(),
            'event_time'     => '09:00',
            'event_time_end' => '17:00',
            'status'         => 'draft',
            'review_status'  => 'approved',
            'scheduled_at'   => $pastUtc,
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notices?category=emergency')
            ->assertOk()
            ->assertJsonPath('data.0.id', $noticeId)
            ->assertJsonPath('data.0.status', 'published');
    }

    public function test_scheduled_notice_with_iso_utc_stays_draft_until_due(): void
    {
        config(['app.schedule_timezone' => 'Asia/Karachi']);

        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $scheduledAt = now('Asia/Karachi')->addHours(4)->utc()->toIso8601String();
        $noticeDate = now('Asia/Karachi')->addDays(2)->toDateString();

        $create = $this->postJson('/api/v1/admin/notices', [
            'title'          => 'Future finance notice',
            'body'           => 'Electricity bill reminder scheduled later.',
            'category'       => 'finance',
            'event_date'     => $noticeDate,
            'event_time'     => '09:00',
            'event_time_end' => '17:00',
            'scheduled_at'   => $scheduledAt,
            'is_pinned'      => true,
        ])->assertCreated();

        $noticeId = $create->json('data.id');
        $this->assertSame('draft', $create->json('data.status'));

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notices?category=finance')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->travelTo(now('Asia/Karachi')->addHours(5));

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notices?category=finance')
            ->assertOk()
            ->assertJsonPath('data.0.id', $noticeId)
            ->assertJsonPath('data.0.status', 'published');
    }

    private function seedSecondResident(int $communityId): User
    {
        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000022',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $resident->id,
            'community_id' => $communityId,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        return $resident;
    }

    public function test_targeted_notice_is_visible_only_to_selected_residents(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $selected] = $this->seedCommunityWithAdmin();
        $other = $this->seedSecondResident($community->id);

        Sanctum::actingAs($admin);

        $create = $this->postJson('/api/v1/admin/notices', array_merge([
            'title'              => 'Private reminder',
            'body'               => 'Please update your contact details.',
            'category'           => 'general',
            'audience_type'      => 'selected',
            'recipient_user_ids' => [$selected->id],
        ], $this->scheduleFields()))->assertCreated();

        $noticeId = $create->json('data.id');
        $this->assertSame('selected', $create->json('data.audience_type'));
        $this->assertSame([$selected->id], $create->json('data.recipient_user_ids'));
        $recipients = $create->json('data.recipients');
        $this->assertCount(1, $recipients);
        $this->assertSame($selected->id, $recipients[0]['id']);
        $this->assertNotEmpty($recipients[0]['name']);

        Sanctum::actingAs($selected);

        $this->getJson('/api/v1/notices')
            ->assertOk()
            ->assertJsonPath('data.0.id', $noticeId);

        $this->getJson("/api/v1/notices/{$noticeId}")
            ->assertOk()
            ->assertJsonPath('data.title', 'Private reminder');

        Sanctum::actingAs($other);

        $this->getJson('/api/v1/notices')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->getJson("/api/v1/notices/{$noticeId}")
            ->assertNotFound();
    }

    public function test_targeted_notice_notifies_only_selected_residents(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $selected] = $this->seedCommunityWithAdmin();
        $other = $this->seedSecondResident($community->id);

        Sanctum::actingAs($admin);

        $noticeId = $this->postJson('/api/v1/admin/notices', array_merge([
            'title'              => 'Unit inspection',
            'body'               => 'Your unit is scheduled for inspection tomorrow.',
            'category'           => 'maintenance',
            'audience_type'      => 'selected',
            'recipient_user_ids' => [$selected->id],
        ], $this->scheduleFields()))->json('data.id');

        $this->assertTrue(
            DB::table('app_notifications')
                ->where('user_id', $selected->id)
                ->where('action_url', "/notices/{$noticeId}")
                ->exists()
        );

        $this->assertFalse(
            DB::table('app_notifications')
                ->where('user_id', $other->id)
                ->where('action_url', "/notices/{$noticeId}")
                ->exists()
        );
    }

    public function test_all_residents_notice_remains_visible_to_everyone(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();
        $other = $this->seedSecondResident($community->id);

        Sanctum::actingAs($admin);

        $noticeId = $this->postJson('/api/v1/admin/notices', array_merge([
            'title'         => 'Community-wide update',
            'body'          => 'Trash pickup moves to Friday this week.',
            'category'      => 'general',
            'audience_type' => 'all',
        ], $this->scheduleFields()))->json('data.id');

        foreach ([$resident, $other] as $user) {
            Sanctum::actingAs($user);

            $this->getJson('/api/v1/notices')
                ->assertOk()
                ->assertJsonPath('data.0.id', $noticeId);
        }
    }

    public function test_deleting_published_event_notifies_community_members(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();
        $other = $this->seedSecondResident($community->id);

        Sanctum::actingAs($admin);

        $eventId = $this->postJson('/api/v1/admin/notices', array_merge([
            'title'    => 'Summer BBQ',
            'body'     => 'Bring a dish to share.',
            'category' => 'event',
            'location' => 'Courtyard',
            'status'   => 'published',
        ], $this->scheduleFields(now()->addDays(2)->toDateString())))->assertCreated()->json('data.id');

        $this->deleteJson("/api/v1/admin/notices/{$eventId}")
            ->assertOk()
            ->assertJsonPath('message', 'Notice deleted');

        foreach ([$resident->id, $other->id] as $userId) {
            $this->assertDatabaseHas('app_notifications', [
                'user_id'    => $userId,
                'type'       => 'warning',
                'title'      => 'Event Cancelled',
                'action_url' => '/screens/notices',
            ]);
        }

        $this->assertDatabaseMissing('app_notifications', [
            'user_id' => $admin->id,
            'title'   => 'Event Cancelled',
        ]);

        $body = DB::table('app_notifications')
            ->where('user_id', $resident->id)
            ->where('title', 'Event Cancelled')
            ->value('body');

        $this->assertStringContainsString('Summer BBQ', (string) $body);
        $this->assertStringContainsString('cancelled', (string) $body);
    }

    public function test_deleting_draft_event_does_not_notify_members(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $eventId = DB::table('notices')->insertGetId([
            'community_id'   => $community->id,
            'author_id'      => $admin->id,
            'title'          => 'Unpublished Meetup',
            'body'           => 'Still drafting this event.',
            'category'       => 'event',
            'status'         => 'draft',
            'review_status'  => 'approved',
            'audience_type'  => 'all',
            'event_date'     => now()->addDays(5)->toDateString(),
            'event_time'     => '10:00:00',
            'event_time_end' => '11:00:00',
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);

        $this->deleteJson("/api/v1/admin/notices/{$eventId}")->assertOk();

        $this->assertDatabaseMissing('app_notifications', [
            'user_id' => $resident->id,
            'title'   => 'Event Cancelled',
        ]);
    }

    public function test_create_notice_rejects_past_time_when_date_is_today(): void
    {
        config(['billing.enabled' => false, 'billing.enforce' => false]);

        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithAdmin();
        $community->update(['timezone' => 'America/New_York']);

        \Carbon\Carbon::setTestNow(\Carbon\Carbon::parse('2026-09-28 15:30:00', 'America/New_York'));

        try {
            Sanctum::actingAs($admin);

            $this->postJson('/api/v1/admin/notices', [
                'title'    => 'Too late',
                'body'     => 'This notice uses a time that already passed today.',
                'category' => 'general',
                'status'   => 'published',
                'event_date' => '2026-09-28',
                'event_time' => '14:00',
                'event_time_end' => '17:00',
            ])
                ->assertStatus(422)
                ->assertJsonPath('message', 'Please select a future date and time.')
                ->assertJsonPath('errors.event_time.0', 'Please select a future date and time.');
        } finally {
            \Carbon\Carbon::setTestNow();
        }
    }

    public function test_create_notice_allows_future_time_today_and_any_time_tomorrow(): void
    {
        config(['billing.enabled' => false, 'billing.enforce' => false]);

        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithAdmin();
        $community->update(['timezone' => 'America/New_York']);

        \Carbon\Carbon::setTestNow(\Carbon\Carbon::parse('2026-09-28 15:30:00', 'America/New_York'));

        try {
            Sanctum::actingAs($admin);

            $this->postJson('/api/v1/admin/notices', [
                'title'    => 'Later today',
                'body'     => 'This notice uses a future time on the same day.',
                'category' => 'general',
                'status'   => 'published',
                'event_date' => '2026-09-28',
                'event_time' => '16:00',
                'event_time_end' => '17:00',
            ])->assertCreated();

            $this->postJson('/api/v1/admin/notices', [
                'title'    => 'Tomorrow early',
                'body'     => 'Future dates keep all valid time options available.',
                'category' => 'general',
                'status'   => 'published',
                'event_date' => '2026-09-29',
                'event_time' => '01:00',
                'event_time_end' => '02:00',
            ])->assertCreated();
        } finally {
            \Carbon\Carbon::setTestNow();
        }
    }

    public function test_events_board_loads_when_notices_feature_is_off(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithAdmin();

        DB::table('community_feature_flags')->insert([
            'community_id' => $community->id,
            'feature_key' => 'notices',
            'enabled' => false,
            'disabled_by' => 'system_admin',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/admin/events', array_merge([
            'title' => 'Courtyard social',
            'body' => 'Join neighbors after dinner.',
            'location' => 'Courtyard',
            'status' => 'published',
        ], $this->scheduleFields(now()->addDay()->toDateString())))->assertCreated();

        $this->getJson('/api/v1/admin/notices?category_group=events')
            ->assertOk()
            ->assertJsonPath('data.0.title', 'Courtyard social')
            ->assertJsonPath('data.0.category', 'event');

        $this->getJson('/api/v1/admin/notices?category_group=notices')
            ->assertForbidden()
            ->assertJsonPath('message', 'Notices is not available in this community.');
    }

    public function test_alerts_board_loads_when_notices_feature_is_off(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        DB::table('community_feature_flags')->insert([
            'community_id' => $community->id,
            'feature_key' => 'notices',
            'enabled' => false,
            'disabled_by' => 'system_admin',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/admin/alerts', array_merge([
            'title' => 'Water shutoff',
            'body' => 'Water is off until 4pm.',
            'status' => 'published',
        ], $this->scheduleFields()))->assertCreated();

        $this->postJson('/api/v1/admin/notices', array_merge([
            'title' => 'Lobby hours',
            'body' => 'The lobby desk closes at 8pm.',
            'category' => 'general',
            'status' => 'published',
        ], $this->scheduleFields()))->assertForbidden();

        $this->getJson('/api/v1/admin/notices?category_group=alerts')
            ->assertOk()
            ->assertJsonPath('data.0.title', 'Water shutoff')
            ->assertJsonPath('data.0.category', 'emergency');

        $this->getJson('/api/v1/admin/notices?category_group=notices')
            ->assertForbidden()
            ->assertJsonPath('message', 'Notices is not available in this community.');

        Sanctum::actingAs($resident);

        $list = $this->getJson('/api/v1/notices')->assertOk();
        $titles = collect($list->json('data'))->pluck('title')->all();
        $this->assertContains('Water shutoff', $titles);
        $this->assertNotContains('Lobby hours', $titles);
    }

    public function test_community_admin_can_update_a_draft_notice_and_other_users_cannot(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();
        $start = now()->addDays(3)->toDateString();
        $end = now()->addDays(4)->toDateString();

        Sanctum::actingAs($admin);

        $noticeId = $this->postJson('/api/v1/admin/notices', array_merge([
            'title' => 'Pool hours',
            'body' => 'The pool is open all afternoon.',
            'category' => 'general',
            'location' => 'Pool deck',
            'status' => 'draft',
            'is_pinned' => false,
            'audience_type' => 'all',
        ], $this->scheduleFields($start)))->assertCreated()->json('data.id');

        $updated = $this->patchJson("/api/v1/admin/notices/{$noticeId}", [
            'title' => 'Updated pool hours',
            'body' => 'The pool closes earlier this week.',
            'category' => 'maintenance',
            'location' => 'Clubhouse',
            'event_date' => $start,
            'event_end_date' => $end,
            'event_time' => '10:00',
            'event_time_end' => '18:00',
            'is_pinned' => true,
            'status' => 'draft',
            'audience_type' => 'selected',
            'recipient_user_ids' => [$resident->id],
        ])->assertOk()
            ->assertJsonPath('message', 'Notice updated')
            ->assertJsonPath('data.title', 'Updated pool hours')
            ->assertJsonPath('data.body', 'The pool closes earlier this week.')
            ->assertJsonPath('data.category', 'maintenance')
            ->assertJsonPath('data.location', 'Clubhouse')
            ->assertJsonPath('data.audience_type', 'selected')
            ->assertJsonPath('data.is_pinned', true)
            ->assertJsonPath('data.status', 'draft');

        $this->assertStringStartsWith('10:00', (string) $updated->json('data.event_time'));
        $this->assertStringStartsWith('18:00', (string) $updated->json('data.event_time_end'));
        $this->assertStringStartsWith($end, (string) $updated->json('data.event_end_date'));
        $this->assertContains($resident->id, $updated->json('data.recipient_user_ids'));

        $this->getJson("/api/v1/notices/{$noticeId}")
            ->assertOk()
            ->assertJsonPath('data.title', 'Updated pool hours')
            ->assertJsonPath('data.location', 'Clubhouse');

        $this->assertDatabaseMissing('app_notifications', [
            'action_url' => "/notices/{$noticeId}",
        ]);

        Sanctum::actingAs($resident);
        $this->patchJson("/api/v1/admin/notices/{$noticeId}", [
            'title' => 'Hijacked',
        ])->assertForbidden();

        $outsider = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'phone' => '+201700000099',
        ]);
        Sanctum::actingAs($outsider);
        $this->patchJson("/api/v1/admin/notices/{$noticeId}", [
            'title' => 'Outside edit',
        ])->assertForbidden();

        $this->assertDatabaseHas('notices', [
            'id' => $noticeId,
            'title' => 'Updated pool hours',
            'status' => 'draft',
        ]);
    }

    public function test_events_sort_by_schedule_and_notices_by_latest_update(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $later = $this->postJson('/api/v1/admin/events', array_merge([
            'title'         => 'Later event',
            'body'          => 'Happens after the sooner one.',
            'location'      => 'Hall',
            'requires_rsvp' => false,
        ], $this->scheduleFields(now()->addDays(8)->toDateString())))->assertCreated();

        $sooner = $this->postJson('/api/v1/admin/events', array_merge([
            'title'         => 'Sooner event',
            'body'          => 'Should lead the event list.',
            'location'      => 'Lobby',
            'requires_rsvp' => false,
        ], $this->scheduleFields(now()->addDays(2)->toDateString())))->assertCreated();

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notices?category=event')
            ->assertOk()
            ->assertJsonPath('data.0.id', $sooner->json('data.id'))
            ->assertJsonPath('data.1.id', $later->json('data.id'));

        $from = now()->addDays(5)->toDateString();
        $this->getJson('/api/v1/notices?category=event&date_from='.$from)
            ->assertOk()
            ->assertJsonPath('data.0.id', $later->json('data.id'))
            ->assertJsonMissing(['id' => $sooner->json('data.id')]);

        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/admin/notices?category_group=events')
            ->assertOk()
            ->assertJsonPath('data.0.id', $sooner->json('data.id'))
            ->assertJsonPath('data.1.id', $later->json('data.id'));

        $older = $this->postJson('/api/v1/admin/notices', array_merge([
            'title'    => 'Older notice',
            'body'     => 'Created first.',
            'category' => 'general',
        ], $this->scheduleFields()))->assertCreated();

        $newer = $this->postJson('/api/v1/admin/notices', array_merge([
            'title'    => 'Newer notice',
            'body'     => 'Created second.',
            'category' => 'general',
        ], $this->scheduleFields()))->assertCreated();

        DB::table('notices')->where('id', $older->json('data.id'))->update([
            'updated_at' => now()->addHour(),
        ]);

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/notices?category_group=notices')
            ->assertOk()
            ->assertJsonPath('data.0.id', $older->json('data.id'))
            ->assertJsonPath('data.1.id', $newer->json('data.id'));

        $this->getJson('/api/v1/notices?category_group=notices&sort=oldest')
            ->assertOk()
            ->assertJsonPath('data.0.id', $newer->json('data.id'))
            ->assertJsonPath('data.1.id', $older->json('data.id'));
    }
}
