<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\Region;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ComplaintSupportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake();
        Storage::fake('local');
    }

    public function test_maintenance_and_technical_complaints_route_to_the_right_queue(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident, 'systemAdmin' => $systemAdmin, 'unit' => $unit] = $this->seedWorld();

        Sanctum::actingAs($resident);
        $maintenance = $this->postJson('/api/v1/complaints', [
            'type' => 'maintenance',
            'category' => 'plumbing',
            'priority' => 'high',
            'unit_id' => $unit->id,
            'title' => 'Kitchen leak',
            'description' => 'Water is leaking under the kitchen sink.',
        ])->assertCreated();

        $this->assertSame('community_admin', $maintenance->json('data.routed_to'));
        $this->assertSame($community->id, $maintenance->json('data.community_id'));
        $this->assertSame('A-1', $maintenance->json('data.unit_number'));
        $this->assertSame('submitted', $maintenance->json('data.status'));
        $this->assertMatchesRegularExpression('/^CMP-\d{6}$/', $maintenance->json('data.reference'));
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $admin->id,
            'type' => 'complaint',
        ]);

        $technical = $this->postJson('/api/v1/complaints', [
            'type' => 'technical',
            'category' => 'app_bug',
            'title' => 'Login screen freezes',
            'description' => 'The login button stays disabled after a valid code.',
        ])->assertCreated();

        $this->assertSame('system_admin', $technical->json('data.routed_to'));
        $this->assertNull($technical->json('data.unit_id'));
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $systemAdmin->id,
            'type' => 'complaint',
        ]);

        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/admin/complaints')
            ->assertOk()
            ->assertJsonPath('meta.counts.all', 1)
            ->assertJsonPath('data.0.type', 'maintenance');

        Sanctum::actingAs($systemAdmin);
        $this->getJson('/api/v1/admin/complaints')
            ->assertOk()
            ->assertJsonPath('meta.counts.all', 1)
            ->assertJsonPath('data.0.type', 'technical');
        $this->getJson('/api/v1/admin/complaints/'.$maintenance->json('data.id'))
            ->assertNotFound();
    }

    public function test_community_admin_technical_complaint_reaches_system_admin_queue_with_notifications(): void
    {
        ['community' => $community, 'admin' => $admin, 'systemAdmin' => $systemAdmin] = $this->seedWorld();

        Sanctum::actingAs($admin);
        $created = $this->postJson('/api/v1/complaints', [
            'type' => 'technical',
            'category' => 'app_bug',
            'priority' => 'high',
            'title' => 'Dashboard export fails',
            'description' => 'CSV export from the complaints screen returns an empty file.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        $id = (int) $created->json('data.id');
        $this->assertSame('technical', $created->json('data.type'));
        $this->assertSame('system_admin', $created->json('data.routed_to'));
        $this->assertSame($community->id, $created->json('data.community_id'));

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $systemAdmin->id,
            'type' => 'complaint',
        ]);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $admin->id,
            'type' => 'complaint',
        ]);

        Sanctum::actingAs($systemAdmin);
        $this->getJson('/api/v1/admin/complaints')
            ->assertOk()
            ->assertJsonPath('meta.counts.all', 1)
            ->assertJsonPath('data.0.id', $id)
            ->assertJsonPath('data.0.type', 'technical');

        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/complaints/'.$id)
            ->assertOk()
            ->assertJsonPath('data.id', $id);
        $this->getJson('/api/v1/admin/complaints/'.$id)
            ->assertOk()
            ->assertJsonPath('data.id', $id);
    }

    public function test_validation_membership_and_feature_flag(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident, 'pending' => $pending, 'suspended' => $suspended, 'guest' => $guest] = $this->seedWorld();

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/complaints', [
            'type' => 'maintenance',
            'category' => 'app_bug',
            'title' => 'Wrong category',
            'description' => 'This category does not belong to maintenance.',
        ])->assertStatus(422);

        $this->postJson('/api/v1/complaints', [
            'type' => 'maintenance',
            'category' => 'plumbing',
            'title' => 'No',
            'description' => 'Too short',
        ])->assertStatus(422);

        $created = $this->postJson('/api/v1/complaints', [
            'type' => 'maintenance',
            'category' => 'security_safety',
            'title' => 'Gate left open',
            'description' => 'The side gate was open overnight and nobody was on duty.',
        ])->assertCreated();
        $this->assertSame('security_safety', $created->json('data.category'));
        $this->assertSame('Security & Safety', $created->json('data.category_label'));

        $renamed = $this->postJson('/api/v1/complaints', [
            'type' => 'maintenance',
            'category' => 'cleaning',
            'title' => 'Lobby needs cleaning',
            'description' => 'The lobby bins were not emptied this morning.',
        ])->assertCreated();
        $this->assertSame('cleaning', $renamed->json('data.category'));
        $this->assertSame('Cleaning & Sanitation', $renamed->json('data.category_label'));

        $lifts = $this->postJson('/api/v1/complaints', [
            'type' => 'maintenance',
            'category' => 'lifts',
            'title' => 'Lift stopped',
            'description' => 'The passenger lift is stuck on the third floor.',
        ])->assertCreated();
        $this->assertSame('lifts', $lifts->json('data.category'));
        $this->assertSame('Elevators / Lifts', $lifts->json('data.category_label'));

        $this->postJson('/api/v1/complaints', [
            'type' => 'technical',
            'category' => 'pest_control',
            'title' => 'Wrong type',
            'description' => 'Pest control belongs to maintenance, not technical support.',
        ])->assertStatus(422);

        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/admin/complaints?category=security_safety')
            ->assertOk()
            ->assertJsonPath('data.0.category', 'security_safety')
            ->assertJsonPath('data.0.category_label', 'Security & Safety')
            ->assertJsonPath('meta.total', 1);
        $this->getJson('/api/v1/admin/complaints?category=cleaning')
            ->assertOk()
            ->assertJsonPath('data.0.category', 'cleaning')
            ->assertJsonPath('data.0.category_label', 'Cleaning & Sanitation');

        Sanctum::actingAs($pending);
        $this->postJson('/api/v1/complaints', $this->maintenancePayload())->assertForbidden();
        $this->postJson('/api/v1/complaints', [
            'type' => 'technical',
            'category' => 'account',
            'title' => 'Cannot update profile',
            'description' => 'The account screen will not save my name.',
        ])->assertCreated();

        Sanctum::actingAs($suspended);
        $this->postJson('/api/v1/complaints', [
            'type' => 'technical',
            'category' => 'login',
            'title' => 'Suspended login',
            'description' => 'I cannot sign in after the account was suspended.',
        ])->assertForbidden();

        Sanctum::actingAs($guest);
        $this->postJson('/api/v1/complaints', [
            'type' => 'technical',
            'category' => 'login',
            'title' => 'Guest login',
            'description' => 'A guest should not be able to open a ticket.',
        ])->assertForbidden();

        DB::table('community_feature_flags')->insert([
            'community_id' => $community->id,
            'feature_key' => 'complaints',
            'enabled' => false,
            'disabled_by' => 'community_admin',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($resident);
        $existing = $this->postJson('/api/v1/complaints', [
            'type' => 'technical',
            'category' => 'payment',
            'title' => 'Payment receipt missing',
            'description' => 'The payment succeeded but the receipt is missing.',
        ])->assertCreated();
        $this->postJson('/api/v1/complaints', $this->maintenancePayload())->assertForbidden();
        $this->getJson('/api/v1/complaints')->assertOk();
        $this->getJson('/api/v1/complaints/'.$existing->json('data.id'))->assertOk();
    }

    public function test_status_messages_notes_attachments_and_reopen(): void
    {
        ['admin' => $admin, 'resident' => $resident, 'otherResident' => $otherResident, 'systemAdmin' => $systemAdmin] = $this->seedWorld();

        Sanctum::actingAs($resident);
        $created = $this->post('/api/v1/complaints', array_merge($this->maintenancePayload(), [
            'files' => [UploadedFile::fake()->create('leak.jpg', 100, 'image/jpeg')],
        ]))->assertCreated();
        $id = $created->json('data.id');
        $attachmentId = $created->json('data.attachments.0.id');

        Sanctum::actingAs($otherResident);
        $this->getJson('/api/v1/complaints/'.$id)->assertNotFound();
        $this->get('/api/v1/complaints/'.$id.'/attachments/'.$attachmentId)->assertNotFound();

        Sanctum::actingAs($systemAdmin);
        $this->getJson('/api/v1/admin/complaints/'.$id)->assertNotFound();

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/complaints/'.$id)
            ->assertOk()
            ->assertJsonPath('data.resident_chat_available', false)
            ->assertJsonPath('data.messages', []);
        $this->postJson('/api/v1/complaints/'.$id.'/messages', [
            'body' => 'Can someone reply?',
        ])->assertStatus(403);

        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/admin/complaints/'.$id.'/status', ['status' => 'resolved'])
            ->assertForbidden();
        $this->postJson('/api/v1/admin/complaints/'.$id.'/status', ['status' => 'in_review'])
            ->assertForbidden();
        $this->postJson('/api/v1/admin/complaints/'.$id.'/messages', [
            'body' => 'We are checking the pipe.',
            'visibility' => 'public',
        ])->assertOk();
        $this->postJson('/api/v1/admin/complaints/'.$id.'/messages', [
            'body' => 'Vendor arrives after 6.',
            'visibility' => 'internal',
        ])->assertOk();
        $this->postJson('/api/v1/admin/complaints/'.$id.'/assign', [
            'assigned_to_user_id' => $admin->id,
        ])->assertStatus(422);
        $this->postJson('/api/v1/admin/complaints/'.$id.'/status', ['status' => 'in_progress'])->assertForbidden();
        $this->postJson('/api/v1/admin/complaints/'.$id.'/status', ['status' => 'resolved'])->assertForbidden();
        DB::table('complaints')->where('id', $id)->update([
            'status' => 'resolved',
            'resolved_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($resident);
        $detail = $this->getJson('/api/v1/complaints/'.$id)->assertOk();
        $detail->assertJsonPath('data.resident_chat_available', true);
        $bodies = collect($detail->json('data.messages'))->pluck('body');
        $this->assertTrue($bodies->contains('We are checking the pipe.'));
        $this->assertFalse($bodies->contains('Vendor arrives after 6.'));
        $this->assertNotContains('internal_note', collect($detail->json('data.events'))->pluck('action')->all());
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $resident->id,
            'title' => 'Complaint chat started',
        ]);

        $this->postJson('/api/v1/complaints/'.$id.'/messages', [
            'body' => 'Thank you, we will be home after 5.',
        ])->assertOk();

        $this->postJson('/api/v1/admin/complaints/'.$id.'/messages', [
            'body' => 'The leak is still there.',
            'visibility' => 'internal',
        ])->assertForbidden();
        $this->postJson('/api/v1/complaints/'.$id.'/feedback', [
            'rating' => 4,
            'comment' => 'The visit was helpful.',
        ])->assertOk();
        $this->postJson('/api/v1/complaints/'.$id.'/status', ['status' => 'reopened'])
            ->assertStatus(422);
        $this->postJson('/api/v1/complaints/'.$id.'/status', [
            'status' => 'reopened',
            'note' => 'The leak came back overnight',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'reopened')
            ->assertJsonPath('data.reopen_reason', 'The leak came back overnight')
            ->assertJsonPath('data.assigned_to_user_id', null);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $admin->id,
            'title' => 'Complaint Reopened',
        ]);
        $this->assertDatabaseHas('complaint_events', [
            'complaint_id' => $id,
            'action' => 'status_changed',
            'to_status' => 'reopened',
            'note' => 'The leak came back overnight',
        ]);

        $this->get('/api/v1/complaints/'.$id.'/attachments/'.$attachmentId)->assertOk();
    }

    public function test_summary_counts_follow_status_and_configured_deadlines(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident, 'unit' => $unit] = $this->seedWorld();

        Sanctum::actingAs($resident);
        $submitted = $this->postJson('/api/v1/complaints', [
            'type' => 'maintenance',
            'category' => 'plumbing',
            'priority' => 'normal',
            'unit_id' => $unit->id,
            'title' => 'Old leak',
            'description' => 'This leak has been waiting without a deadline.',
        ])->assertCreated();
        $review = $this->postJson('/api/v1/complaints', [
            'type' => 'maintenance',
            'category' => 'electrical',
            'priority' => 'high',
            'unit_id' => $unit->id,
            'title' => 'Hall light',
            'description' => 'The hall light is still out after the first report.',
        ])->assertCreated();
        DB::table('complaints')->where('id', $review->json('data.id'))->update(['status' => 'in_review']);
        $resolved = $this->postJson('/api/v1/complaints', [
            'type' => 'maintenance',
            'category' => 'parking',
            'priority' => 'normal',
            'unit_id' => $unit->id,
            'title' => 'Space cleared',
            'description' => 'The blocked parking space has been cleared.',
        ])->assertCreated();
        DB::table('complaints')->where('id', $resolved->json('data.id'))->update([
            'status' => 'resolved',
            'resolution_due_at' => now()->subDay(),
        ]);
        $closed = $this->postJson('/api/v1/complaints', [
            'type' => 'maintenance',
            'category' => 'cleaning',
            'priority' => 'low',
            'unit_id' => $unit->id,
            'title' => 'Lobby cleaned',
            'description' => 'The lobby was cleaned and the resident confirmed it.',
        ])->assertCreated();
        DB::table('complaints')->where('id', $closed->json('data.id'))->update(['status' => 'closed']);
        DB::table('complaints')->where('id', $submitted->json('data.id'))->update([
            'created_at' => now()->subDays(30),
            'resolution_due_at' => null,
        ]);

        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/admin/complaints')
            ->assertOk()
            ->assertJsonPath('meta.counts.all', 4)
            ->assertJsonPath('meta.counts.open_queue', 2)
            ->assertJsonPath('meta.counts.in_review', 1)
            ->assertJsonPath('meta.counts.resolved', 1)
            ->assertJsonPath('meta.counts.closed', 1)
            ->assertJsonPath('meta.counts.overdue', 0);

        $this->getJson('/api/v1/admin/complaints?summary=open')
            ->assertOk()
            ->assertJsonPath('meta.total', 2);

        DB::table('complaints')->where('id', $submitted->json('data.id'))->update([
            'resolution_due_at' => now()->subHour(),
        ]);
        $overdue = $this->getJson('/api/v1/admin/complaints?summary=overdue')
            ->assertOk()
            ->assertJsonPath('meta.counts.overdue', 1)
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $submitted->json('data.id'));
        $this->assertSame('submitted', $overdue->json('data.0.status'));

        $community->forceFill([
            'settings' => ['complaint_resolution_hours' => ['normal' => 2]],
        ])->save();
        DB::table('complaints')->where('id', $review->json('data.id'))->update([
            'created_at' => now()->subHours(5),
            'resolution_due_at' => null,
        ]);
        $this->getJson('/api/v1/admin/complaints')
            ->assertOk()
            ->assertJsonPath('meta.counts.overdue', 1);
    }

    public function test_community_admin_in_resident_mode_cannot_open_the_admin_queue(): void
    {
        ['admin' => $admin] = $this->seedWorld();
        $admin->forceFill(['active_context' => 'resident'])->save();

        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/admin/complaints')
            ->assertForbidden()
            ->assertJsonPath('code', 'RESIDENT_MODE_ACTIVE');
    }

    /** @return array<string, mixed> */
    private function maintenancePayload(): array
    {
        return [
            'type' => 'maintenance',
            'category' => 'electrical',
            'priority' => 'normal',
            'title' => 'Hall light is out',
            'description' => 'The hallway light has not worked since last night.',
        ];
    }

    /** @return array<string, mixed> */
    public function test_technical_categories_keep_old_records_and_accept_the_expanded_list(): void
    {
        ['resident' => $resident, 'systemAdmin' => $systemAdmin] = $this->seedWorld();

        Sanctum::actingAs($resident);
        $labels = [
            'app_bug' => 'App Bug',
            'login' => 'Login & Authentication',
            'account' => 'Account & Access',
            'performance' => 'Performance Issues',
            'payment' => 'Payment Technical Issues',
            'notifications' => 'Notification Issues',
            'data_display' => 'Data & Display Issues',
            'file_upload' => 'File & Upload Issues',
            'other' => 'Other Technical Issues',
        ];
        foreach ($labels as $key => $label) {
            $created = $this->postJson('/api/v1/complaints', [
                'type' => 'technical',
                'category' => $key,
                'title' => 'Technical '.$key,
                'description' => 'Checking the technical category label and stored value.',
            ])->assertCreated();
            $this->assertSame($key, $created->json('data.category'));
            $this->assertSame($label, $created->json('data.category_label'));
        }

        $maintenanceOther = $this->postJson('/api/v1/complaints', [
            'type' => 'maintenance',
            'category' => 'other',
            'title' => 'Something else',
            'description' => 'This maintenance complaint stays in the Other category.',
        ])->assertCreated();
        $this->assertSame('other', $maintenanceOther->json('data.category'));
        $this->assertSame('Other', $maintenanceOther->json('data.category_label'));

        $this->postJson('/api/v1/complaints', [
            'type' => 'maintenance',
            'category' => 'performance',
            'title' => 'Not maintenance',
            'description' => 'Performance issues belong to technical support.',
        ])->assertStatus(422);

        Sanctum::actingAs($systemAdmin);
        $this->getJson('/api/v1/admin/complaints?category=login')
            ->assertOk()
            ->assertJsonPath('data.0.category', 'login')
            ->assertJsonPath('data.0.category_label', 'Login & Authentication')
            ->assertJsonPath('meta.total', 1);
        $this->getJson('/api/v1/admin/complaints?category=file_upload')
            ->assertOk()
            ->assertJsonPath('data.0.category', 'file_upload')
            ->assertJsonPath('data.0.category_label', 'File & Upload Issues')
            ->assertJsonPath('meta.total', 1);
        $this->getJson('/api/v1/admin/complaints?category=other')
            ->assertOk()
            ->assertJsonPath('data.0.category', 'other')
            ->assertJsonPath('data.0.category_label', 'Other Technical Issues')
            ->assertJsonPath('meta.total', 1);
    }

    private function seedWorld(): array
    {
        $region = Region::query()->create([
            'title' => 'Test Region',
            'area' => 'Test Area',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);
        $community = Community::query()->create([
            'name' => 'Green Test',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);
        $other = Community::query()->create([
            'name' => 'Other Test',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'active_context' => 'community_admin',
            'active_context_community_id' => $community->id,
        ]);
        $resident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'active_context_community_id' => $community->id,
        ]);
        $otherResident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'active_context_community_id' => $other->id,
        ]);
        $pending = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'active_context_community_id' => $community->id,
        ]);
        $suspended = User::factory()->create([
            'role' => 'resident',
            'status' => 'suspended',
            'active_context_community_id' => $community->id,
        ]);
        $guest = User::factory()->create([
            'role' => 'guest',
            'status' => 'active',
        ]);
        $systemAdmin = User::factory()->create([
            'role' => 'system_admin',
            'status' => 'active',
        ]);

        foreach ([
            [$admin, $community, 'admin'],
            [$resident, $community, 'member'],
            [$pending, $community, 'member'],
            [$suspended, $community, 'member'],
            [$otherResident, $other, 'member'],
        ] as [$user, $row, $role]) {
            CommunityMembership::query()->create([
                'user_id' => $user->id,
                'community_id' => $row->id,
                'role' => $role,
                'status' => $user->id === $pending->id ? 'pending' : 'approved',
            ]);
        }

        $unitId = DB::table('units')->insertGetId([
            'community_id' => $community->id,
            'unit_number' => 'A-1',
            'unit_number_normalized' => 'a-1',
            'kind' => 'residential',
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('unit_residents')->insert([
            'unit_id' => $unitId,
            'community_id' => $community->id,
            'user_id' => $resident->id,
            'status' => 'active',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_TRIALING,
            'seat_limit' => 150,
            'stripe_customer_id' => 'cus_complaints',
            'stripe_subscription_id' => 'sub_complaints',
            'current_period_start' => now(),
            'current_period_end' => now()->addDays(30),
            'meta' => ['card_on_file' => true],
        ]);

        return [
            'community' => $community,
            'other' => $other,
            'admin' => $admin,
            'resident' => $resident,
            'otherResident' => $otherResident,
            'pending' => $pending,
            'suspended' => $suspended,
            'guest' => $guest,
            'systemAdmin' => $systemAdmin,
            'unit' => (object) ['id' => $unitId],
        ];
    }
}
