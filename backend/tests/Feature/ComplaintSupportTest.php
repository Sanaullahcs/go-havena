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

    public function test_validation_membership_and_feature_flag(): void
    {
        ['community' => $community, 'resident' => $resident, 'pending' => $pending, 'suspended' => $suspended, 'guest' => $guest] = $this->seedWorld();

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
        $bodies = collect($detail->json('data.messages'))->pluck('body');
        $this->assertTrue($bodies->contains('We are checking the pipe.'));
        $this->assertFalse($bodies->contains('Vendor arrives after 6.'));
        $this->assertNotContains('internal_note', collect($detail->json('data.events'))->pluck('action')->all());
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $resident->id,
            'title' => 'New reply on your complaint',
        ]);

        $this->postJson('/api/v1/admin/complaints/'.$id.'/messages', [
            'body' => 'The leak is still there.',
            'visibility' => 'internal',
        ])->assertForbidden();
        $this->postJson('/api/v1/complaints/'.$id.'/feedback', [
            'rating' => 4,
            'comment' => 'The visit was helpful.',
        ])->assertOk();
        $this->postJson('/api/v1/complaints/'.$id.'/status', ['status' => 'reopened'])
            ->assertOk()
            ->assertJsonPath('data.status', 'reopened');
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $admin->id,
            'title' => 'Complaint Reopened',
        ]);

        $this->get('/api/v1/complaints/'.$id.'/attachments/'.$attachmentId)->assertOk();
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
