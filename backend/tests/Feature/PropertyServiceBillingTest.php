<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\Region;
use App\Models\User;
use App\Services\UnitAssignmentService;
use App\Services\UnitServiceBillReminderService;
use App\Services\UnitServiceBillService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PropertyServiceBillingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-09-21 12:00:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function seedCommunity(int $phoneBase = 210): array
    {
        $region = Region::query()->create([
            'title' => 'Service Region '.$phoneBase,
            'area' => 'Test Area',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $community = Community::query()->create([
            'name' => 'Service Court '.$phoneBase,
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'phone' => '+201800000'.$phoneBase,
        ]);
        $resident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'phone' => '+201800000'.($phoneBase + 1),
        ]);
        $resident->profile()->updateOrCreate(['user_id' => $resident->id], [
            'display_name' => 'Ahmed',
            'unit_number' => '4B',
            'residence_type' => 'homeowner',
        ]);

        CommunityMembership::query()->create([
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'starter',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_ACTIVE,
            'seat_limit' => 100,
            'meta' => ['card_on_file' => true, 'activated_via' => 'manual'],
        ]);

        $units = app(UnitAssignmentService::class);
        $units->assignUserToUnitNumber($community->id, $admin->id, 'Office', true);
        $units->syncUserToCommunity($resident->fresh('profile'), $community->id);

        return compact('community', 'admin', 'resident');
    }

    private function headers(int $communityId): array
    {
        return [
            'X-Community-Id' => (string) $communityId,
            'Accept' => 'application/json',
        ];
    }

    public function test_first_resident_becomes_billing_contact_and_second_does_not(): void
    {
        ['community' => $community, 'resident' => $ahmed] = $this->seedCommunity();
        $maria = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'phone' => '+201800000212',
        ]);
        $maria->profile()->updateOrCreate(['user_id' => $maria->id], [
            'display_name' => 'Maria',
            'unit_number' => '4B',
            'residence_type' => 'tenant',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $maria->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);
        app(UnitAssignmentService::class)->syncUserToCommunity($maria->fresh('profile'), $community->id);

        Sanctum::actingAs($ahmed);
        $mine = $this->getJson('/api/v1/units/mine')->assertOk()->json('data');
        $this->assertTrue($mine['is_billing_contact']);
        $this->assertSame('4B', $mine['unit_number']);
        $this->assertTrue(collect($mine['residents'] ?? [])->contains('id', $maria->id));

        Sanctum::actingAs($maria);
        $mariaUnit = $this->getJson('/api/v1/units/mine')->assertOk()->json('data');
        $this->assertFalse($mariaUnit['is_billing_contact']);
        $this->assertSame($mine['id'], $mariaUnit['id']);
    }

    public function test_automatic_service_bills_units_and_notifies_billing_contact_only(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $ahmed] = $this->seedCommunity();
        $maria = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'phone' => '+201800000213',
        ]);
        $maria->profile()->updateOrCreate(['user_id' => $maria->id], [
            'display_name' => 'Maria',
            'unit_number' => '4B',
            'residence_type' => 'tenant',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $maria->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);
        app(UnitAssignmentService::class)->syncUserToCommunity($maria->fresh('profile'), $community->id);

        Sanctum::actingAs($admin);
        $serviceId = $this->withHeaders($this->headers($community->id))
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'Water',
                'category' => 'water',
                'application_type' => 'automatic',
                'amount_type' => 'fixed',
                'amount' => 40,
                'due_day' => 10,
                'first_billing_month' => '2026-09',
                'payment_instructions' => 'Pay at the office',
                'require_acknowledgement' => true,
            ])->assertCreated()->json('data.id');

        $this->assertDatabaseHas('unit_service_bills', [
            'service_id' => $serviceId,
            'billing_contact_user_id' => $ahmed->id,
            'status' => UnitServiceBillService::STATUS_UNPAID,
            'amount' => 40,
        ]);
        $this->assertDatabaseMissing('unit_service_bills', [
            'service_id' => $serviceId,
            'billing_contact_user_id' => $maria->id,
        ]);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $ahmed->id,
            'title' => 'New Service Bill',
        ]);
        $this->assertDatabaseMissing('app_notifications', [
            'user_id' => $maria->id,
            'title' => 'New Service Bill',
        ]);

        $generated = $this->withHeaders($this->headers($community->id))
            ->post("/api/v1/admin/property-services/{$serviceId}/generate-bills", [
                'billing_period' => '2026-09',
            ])->assertCreated()->json('data');
        $this->assertSame(0, $generated['created_count']);

        Sanctum::actingAs($ahmed);
        $this->assertCount(1, $this->getJson('/api/v1/service-bills')->assertOk()->json('data'));

        Sanctum::actingAs($maria);
        $this->assertCount(0, $this->getJson('/api/v1/service-bills')->assertOk()->json('data'));
    }

    public function test_automatic_service_with_future_first_month_does_not_bill_yet(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $ahmed] = $this->seedCommunity(270);

        Sanctum::actingAs($admin);
        $serviceId = $this->withHeaders($this->headers($community->id))
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'Internet',
                'category' => 'internet',
                'application_type' => 'automatic',
                'amount' => 50,
                'due_day' => 10,
                'first_billing_month' => '2026-10',
            ])->assertCreated()->json('data.id');

        $this->assertDatabaseMissing('unit_service_bills', [
            'service_id' => $serviceId,
        ]);
        $this->assertDatabaseMissing('app_notifications', [
            'title' => UnitServiceBillReminderService::CREATED_TITLE,
        ]);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $ahmed->id,
            'title' => UnitServiceBillReminderService::SERVICE_PUBLISHED_TITLE,
            'body' => 'Internet has been added for your unit.',
        ]);
    }

    public function test_optional_service_requires_billing_contact_and_admin_approval(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $ahmed] = $this->seedCommunity();
        $maria = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'phone' => '+201800000214',
        ]);
        $maria->profile()->updateOrCreate(['user_id' => $maria->id], [
            'display_name' => 'Maria',
            'unit_number' => '4B',
            'residence_type' => 'tenant',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $maria->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);
        app(UnitAssignmentService::class)->syncUserToCommunity($maria->fresh('profile'), $community->id);

        Sanctum::actingAs($admin);
        $serviceId = $this->withHeaders($this->headers($community->id))
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'Parking',
                'category' => 'parking',
                'application_type' => 'optional',
                'billing_frequency' => 'monthly',
                'amount' => 80,
                'due_day' => 15,
                'requires_admin_approval' => true,
            ])->assertCreated()->json('data.id');

        Sanctum::actingAs($maria);
        $this->postJson("/api/v1/property-services/{$serviceId}/subscribe")
            ->assertStatus(422)
            ->assertJsonPath('errors.service.0', UnitServiceBillService::NOT_BILLING_CONTACT_MESSAGE);

        Sanctum::actingAs($ahmed);
        $subscriptionId = $this->postJson("/api/v1/property-services/{$serviceId}/subscribe", [
            'note' => 'Need one extra spot',
        ])->assertCreated()->json('data.id');
        $this->assertDatabaseHas('unit_service_subscriptions', [
            'id' => $subscriptionId,
            'status' => 'pending',
        ]);
        $this->assertDatabaseHas('unit_service_bills', [
            'service_id' => $serviceId,
            'billing_contact_user_id' => $ahmed->id,
            'amount' => 80,
        ]);

        Sanctum::actingAs($ahmed);
        $pendingBills = $this->getJson('/api/v1/service-bills')->assertOk()->json('data');
        $this->assertTrue(collect($pendingBills)->contains(
            fn ($row) => (int) $row['service_id'] === (int) $serviceId
        ));

        Sanctum::actingAs($admin);
        $listed = $this->withHeaders($this->headers($community->id))
            ->getJson('/api/v1/admin/property-services')
            ->assertOk()
            ->json('data');
        $parking = collect($listed)->firstWhere('id', $serviceId);
        $this->assertSame(0, (int) ($parking['active_subscribers'] ?? -1));
        $this->assertSame(1, (int) ($parking['pending_subscribers'] ?? -1));
        $this->assertSame(1, (int) ($parking['subscriber_count'] ?? -1));

        $inbox = $this->withHeaders($this->headers($community->id))
            ->getJson('/api/v1/admin/service-subscriptions')
            ->assertOk()
            ->json('data');
        $this->assertCount(1, $inbox);
        $this->assertSame($subscriptionId, (int) ($inbox[0]['id'] ?? 0));
        $this->assertSame('pending', $inbox[0]['status'] ?? null);
        $this->assertSame('Parking', $inbox[0]['service_name'] ?? null);

        $this->withHeaders($this->headers($community->id))
            ->post("/api/v1/admin/property-services/{$serviceId}/generate-bills", [
                'billing_period' => '2026-09',
            ])->assertStatus(422);

        $this->withHeaders($this->headers($community->id))
            ->patchJson("/api/v1/admin/service-subscriptions/{$subscriptionId}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'active');

        $this->assertDatabaseHas('unit_service_bills', [
            'service_id' => $serviceId,
            'amount' => 80,
        ]);

        $this->withHeaders($this->headers($community->id))
            ->post("/api/v1/admin/property-services/{$serviceId}/generate-bills", [
                'billing_period' => '2026-09',
            ])->assertCreated()
            ->assertJsonPath('data.created_count', 0);

        $subscription = $this->withHeaders($this->headers($community->id))
            ->getJson("/api/v1/admin/property-services/{$serviceId}/subscriptions")
            ->assertOk()
            ->assertJsonPath('data.0.status', 'active')
            ->assertJsonPath('data.0.latest_bill.amount', 80)
            ->json('data.0');
        $this->assertContains($subscription['latest_bill']['status'], ['unpaid', 'overdue']);
    }

    public function test_resident_can_acknowledge_submit_proof_and_admin_can_reject_then_approve(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $ahmed] = $this->seedCommunity();

        Sanctum::actingAs($admin);
        $serviceId = $this->withHeaders($this->headers($community->id))
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'Waste',
                'category' => 'plumbing',
                'application_type' => 'automatic',
                'amount' => 15,
                'due_day' => 5,
                'first_billing_month' => '2026-09',
                'require_acknowledgement' => true,
            ])->assertCreated()->json('data.id');

        $billId = (int) DB::table('unit_service_bills')->where('service_id', $serviceId)->value('id');
        $this->assertGreaterThan(0, $billId);

        Sanctum::actingAs($ahmed);
        $this->getJson('/api/v1/service-bills')
            ->assertOk()
            ->assertJsonPath('data.0.can_acknowledge', true)
            ->assertJsonPath('data.0.can_submit_proof', false);
        $this->post("/api/v1/service-bills/{$billId}/proof", [
            'payment_date' => '2026-09-20',
            'file' => UploadedFile::fake()->image('early.jpg', 400, 400),
        ])->assertStatus(422);

        $this->postJson("/api/v1/service-bills/{$billId}/acknowledge")
            ->assertOk()
            ->assertJsonPath('data.status', 'acknowledged')
            ->assertJsonPath('data.can_acknowledge', false);

        $adminNotice = DB::table('app_notifications')
            ->where('user_id', $admin->id)
            ->where('title', 'Service bill acknowledged')
            ->first();
        $this->assertNotNull($adminNotice);
        $this->assertSame(1, DB::table('app_notifications')->where('user_id', $admin->id)->where('title', 'Service bill acknowledged')->count());
        $this->assertStringContainsString('Ahmed', (string) $adminNotice->body);
        $this->assertStringContainsString('Unit 4B', (string) $adminNotice->body);
        $this->assertStringContainsString('Waste', (string) $adminNotice->body);
        $this->assertSame('/screens/admin-service-bills?billId='.$billId, $adminNotice->action_url);
        $this->assertSame(0, DB::table('app_notifications')->where('user_id', $ahmed->id)->where('title', 'Service bill acknowledged')->count());

        $this->postJson("/api/v1/service-bills/{$billId}/acknowledge")->assertStatus(422);
        $this->assertSame(1, DB::table('app_notifications')->where('user_id', $admin->id)->where('title', 'Service bill acknowledged')->count());
        $this->assertSame(1, DB::table('unit_service_bill_reviews')->where('bill_id', $billId)->where('action', 'acknowledged')->count());

        Sanctum::actingAs($admin);
        $adminBill = $this->withHeaders($this->headers($community->id))
            ->getJson("/api/v1/admin/service-bills/{$billId}")
            ->assertOk()
            ->json('data');
        $this->assertSame('acknowledged', $adminBill['status']);
        $this->assertSame('Acknowledged', $adminBill['status_label']);
        $this->assertNotEmpty($adminBill['acknowledged_at']);
        $this->assertSame('Ahmed', $adminBill['acknowledged_by_name']);
        $this->assertNotEmpty($adminBill['title']);
        $ackReview = collect($adminBill['reviews'])->firstWhere('action', 'acknowledged');
        $this->assertNotNull($ackReview);
        $this->assertSame('Ahmed', $ackReview['actor_name']);
        $this->assertNotEmpty($ackReview['created_at']);

        Sanctum::actingAs($ahmed);

        $listed = $this->getJson('/api/v1/service-bills')->assertOk()->json('data.0');
        $this->assertFalse($listed['can_acknowledge']);
        $this->assertNotEmpty($listed['acknowledged_at']);

        $this->post("/api/v1/service-bills/{$billId}/proof", [
            'payment_date' => '2026-09-20',
            'payment_reference' => 'TX-1',
            'file' => UploadedFile::fake()->image('receipt.jpg', 400, 400),
        ])->assertOk()->assertJsonPath('data.status', 'pending_verification');

        Sanctum::actingAs($admin);
        $this->withHeaders($this->headers($community->id))
            ->patchJson("/api/v1/admin/service-bills/{$billId}/reject", [
                'rejection_code' => 'unclear_proof',
            ])->assertOk()->assertJsonPath('data.status', 'rejected');

        Sanctum::actingAs($ahmed);
        $this->post("/api/v1/service-bills/{$billId}/proof", [
            'payment_date' => '2026-09-21',
            'file' => UploadedFile::fake()->image('receipt-2.jpg', 400, 400),
        ])->assertOk();

        Sanctum::actingAs($admin);
        $this->withHeaders($this->headers($community->id))
            ->patchJson("/api/v1/admin/service-bills/{$billId}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'paid');
    }

    public function test_service_bill_notices_and_notifications_follow_review_lifecycle(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $ahmed] = $this->seedCommunity(310);

        Sanctum::actingAs($admin);
        $headers = $this->headers($community->id);
        $serviceId = $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'Water Service',
                'category' => 'water',
                'application_type' => 'automatic',
                'amount' => 50,
                'due_day' => 30,
                'first_billing_month' => '2026-09',
            ])->assertCreated()->json('data.id');

        $bill = DB::table('unit_service_bills')->where('service_id', $serviceId)->first();
        $this->assertNotNull($bill);
        $this->assertNotNull($bill->notice_id);

        $createdBody = 'Your Water Service bill of $50 is now available. Due date: September 30.';
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $ahmed->id,
            'title' => UnitServiceBillReminderService::CREATED_TITLE,
            'body' => $createdBody,
        ]);
        $this->assertDatabaseHas('notices', [
            'id' => $bill->notice_id,
            'community_id' => $community->id,
            'category' => 'finance',
            'title' => 'Water Service — Unit 4B',
            'body' => $createdBody,
            'status' => 'published',
        ]);
        $this->assertDatabaseHas('notice_recipients', [
            'notice_id' => $bill->notice_id,
            'user_id' => $ahmed->id,
        ]);

        Sanctum::actingAs($ahmed);
        $this->getJson('/api/v1/notices')
            ->assertOk()
            ->assertJsonFragment(['id' => (int) $bill->notice_id]);
        $this->getJson('/api/v1/notices/'.$bill->notice_id)
            ->assertOk()
            ->assertJsonPath('data.service_bill.status', 'unpaid')
            ->assertJsonPath('data.service_bill.service_name', 'Water Service')
            ->assertJsonPath('data.service_bill.status_label', 'Unpaid')
            ->assertJsonPath('data.service_bill.billing_frequency', 'monthly')
            ->assertJsonPath('data.amenity_bill', null);

        $this->post("/api/v1/service-bills/{$bill->id}/proof", [
            'payment_date' => '2026-09-20',
            'file' => UploadedFile::fake()->image('receipt.jpg', 400, 400),
        ])->assertOk()->assertJsonPath('data.status', 'pending_verification');

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $ahmed->id,
            'title' => UnitServiceBillReminderService::PROOF_SUBMITTED_TITLE,
            'body' => UnitServiceBillReminderService::PROOF_SUBMITTED_BODY,
        ]);
        $this->assertDatabaseHas('notices', [
            'id' => $bill->notice_id,
            'status' => 'published',
        ]);

        Sanctum::actingAs($admin);
        $this->withHeaders($headers)
            ->patchJson("/api/v1/admin/service-bills/{$bill->id}/reject", [
                'rejection_code' => 'unclear_proof',
            ])->assertOk()->assertJsonPath('data.status', 'rejected');

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $ahmed->id,
            'title' => UnitServiceBillReminderService::REJECTED_TITLE,
            'body' => UnitServiceBillReminderService::REJECTED_BODY,
        ]);
        $this->assertDatabaseHas('notices', [
            'id' => $bill->notice_id,
            'status' => 'published',
        ]);

        Sanctum::actingAs($ahmed);
        $this->getJson('/api/v1/notices')
            ->assertOk()
            ->assertJsonFragment(['id' => (int) $bill->notice_id]);

        $this->post("/api/v1/service-bills/{$bill->id}/proof", [
            'payment_date' => '2026-09-21',
            'file' => UploadedFile::fake()->image('receipt-2.jpg', 400, 400),
        ])->assertOk()->assertJsonPath('data.status', 'pending_verification');

        $this->assertSame(
            2,
            DB::table('app_notifications')
                ->where('user_id', $ahmed->id)
                ->where('title', UnitServiceBillReminderService::PROOF_SUBMITTED_TITLE)
                ->count()
        );

        Sanctum::actingAs($admin);
        $this->withHeaders($headers)
            ->patchJson("/api/v1/admin/service-bills/{$bill->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'paid');

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $ahmed->id,
            'title' => UnitServiceBillReminderService::APPROVED_TITLE,
            'body' => 'Your payment for Water Service has been approved.',
        ]);
        $this->assertDatabaseHas('notices', [
            'id' => $bill->notice_id,
            'status' => 'published',
        ]);
        $notice = DB::table('notices')->find($bill->notice_id);
        $this->assertNotNull($notice->event_date);
        $this->assertTrue(Carbon::parse($notice->event_date)->lt(now()->startOfDay()));

        Sanctum::actingAs($ahmed);
        $homeIds = collect($this->getJson('/api/v1/notices')->assertOk()->json('data'))->pluck('id');
        $this->assertFalse($homeIds->contains((int) $bill->notice_id));

        $updatesIds = collect($this->getJson('/api/v1/notices?include_expired=1')->assertOk()->json('data'))->pluck('id');
        $this->assertTrue($updatesIds->contains((int) $bill->notice_id));
        $this->getJson('/api/v1/notices/'.$bill->notice_id)
            ->assertOk()
            ->assertJsonPath('data.service_bill.status', 'paid')
            ->assertJsonPath('data.service_bill.status_label', 'Paid');
    }

    public function test_optional_service_bill_notifies_billing_contact_and_creates_home_notice(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $ahmed] = $this->seedCommunity(320);

        Sanctum::actingAs($admin);
        $headers = $this->headers($community->id);
        $serviceId = $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'House Cleaning',
                'category' => 'house_cleaning',
                'application_type' => 'optional',
                'billing_frequency' => 'monthly',
                'amount' => 80,
                'due_day' => 15,
                'requires_admin_approval' => false,
                'first_billing_month' => '2026-09',
            ])->assertCreated()->json('data.id');

        Sanctum::actingAs($ahmed);
        $this->postJson("/api/v1/property-services/{$serviceId}/subscribe")->assertCreated();

        $bill = DB::table('unit_service_bills')->where('service_id', $serviceId)->first();
        $this->assertNotNull($bill);
        $this->assertNotNull($bill->notice_id);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $ahmed->id,
            'title' => UnitServiceBillReminderService::CREATED_TITLE,
            'body' => 'Your House Cleaning bill of $80 is now available. Due date: September 15.',
        ]);
        $this->assertDatabaseHas('notices', [
            'id' => $bill->notice_id,
            'status' => 'published',
            'category' => 'finance',
            'title' => 'House Cleaning — Unit 4B',
        ]);
        $this->assertDatabaseHas('notice_recipients', [
            'notice_id' => $bill->notice_id,
            'user_id' => $ahmed->id,
        ]);

        $this->getJson('/api/v1/notices')
            ->assertOk()
            ->assertJsonFragment(['id' => (int) $bill->notice_id]);
    }

    public function test_pending_one_time_subscribe_counts_and_creates_unit_bill(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $ahmed] = $this->seedCommunity(340);

        Sanctum::actingAs($admin);
        $headers = $this->headers($community->id);
        $serviceId = $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'plumber',
                'category' => 'plumbing',
                'application_type' => 'optional',
                'billing_frequency' => 'one_time',
                'amount' => 100,
                'requires_admin_approval' => true,
            ])->assertCreated()->json('data.id');

        Sanctum::actingAs($ahmed);
        $this->postJson("/api/v1/property-services/{$serviceId}/subscribe")
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending');

        $this->assertDatabaseHas('unit_service_bills', [
            'service_id' => $serviceId,
            'billing_contact_user_id' => $ahmed->id,
            'amount' => 100,
            'status' => UnitServiceBillService::STATUS_UNPAID,
        ]);
        $this->assertTrue(collect($this->getJson('/api/v1/service-bills')->assertOk()->json('data'))->contains(
            fn ($row) => (int) $row['service_id'] === (int) $serviceId && (int) round((float) $row['amount']) === 100
        ));

        Sanctum::actingAs($admin);
        $plumber = collect($this->withHeaders($headers)->getJson('/api/v1/admin/property-services')->json('data'))
            ->firstWhere('id', $serviceId);
        $this->assertSame(1, (int) ($plumber['subscriber_count'] ?? 0));
        $this->assertSame(1, (int) ($plumber['pending_subscribers'] ?? 0));
    }

    public function test_creating_any_service_notifies_billing_contacts_and_optional_subscribe_creates_unit_bill(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $ahmed] = $this->seedCommunity(330);
        $fatima = $this->addUnitResident($community->id, 'Fatima', '5A', '+201800000332');

        Sanctum::actingAs($admin);
        $headers = $this->headers($community->id);

        $automaticId = $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'Water Supply',
                'category' => 'water',
                'application_type' => 'automatic',
                'billing_frequency' => 'monthly',
                'amount' => 35,
                'due_day' => 10,
                'first_billing_month' => '2026-09',
            ])->assertCreated()->json('data.id');

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $ahmed->id,
            'title' => UnitServiceBillReminderService::CREATED_TITLE,
        ]);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $fatima->id,
            'title' => UnitServiceBillReminderService::CREATED_TITLE,
        ]);
        $this->assertDatabaseMissing('app_notifications', [
            'user_id' => $ahmed->id,
            'title' => UnitServiceBillReminderService::SERVICE_PUBLISHED_TITLE,
        ]);

        $optionalMonthlyId = $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'House Cleaning',
                'category' => 'house_cleaning',
                'application_type' => 'optional',
                'billing_frequency' => 'monthly',
                'amount' => 80,
                'due_day' => 15,
                'requires_admin_approval' => false,
                'first_billing_month' => '2026-09',
            ])->assertCreated()->json('data.id');

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $ahmed->id,
            'title' => UnitServiceBillReminderService::SERVICE_AVAILABLE_TITLE,
            'body' => 'House Cleaning is now available for your unit. Open Available Services to subscribe.',
        ]);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $fatima->id,
            'title' => UnitServiceBillReminderService::SERVICE_AVAILABLE_TITLE,
        ]);
        $this->assertDatabaseMissing('unit_service_bills', [
            'service_id' => $optionalMonthlyId,
        ]);

        $optionalOneTimeId = $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'AC Tune-up',
                'category' => 'ac_maintenance',
                'application_type' => 'optional',
                'billing_frequency' => 'one_time',
                'amount' => 120,
                'requires_admin_approval' => false,
            ])->assertCreated()->json('data.id');

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $ahmed->id,
            'title' => UnitServiceBillReminderService::SERVICE_AVAILABLE_TITLE,
            'body' => 'AC Tune-up is now available for your unit. Open Available Services to subscribe.',
        ]);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $fatima->id,
            'title' => UnitServiceBillReminderService::SERVICE_AVAILABLE_TITLE,
            'body' => 'AC Tune-up is now available for your unit. Open Available Services to subscribe.',
        ]);

        Sanctum::actingAs($ahmed);
        $this->postJson("/api/v1/property-services/{$optionalMonthlyId}/subscribe")
            ->assertCreated()
            ->assertJsonPath('data.status', 'active');
        $this->assertDatabaseHas('unit_service_bills', [
            'service_id' => $optionalMonthlyId,
            'billing_contact_user_id' => $ahmed->id,
            'status' => UnitServiceBillService::STATUS_UNPAID,
            'amount' => 80,
        ]);
        $monthlyBills = $this->getJson('/api/v1/service-bills')->assertOk()->json('data');
        $this->assertTrue(collect($monthlyBills)->contains(
            fn ($row) => (int) ($row['service_id'] ?? 0) === (int) $optionalMonthlyId
                && (int) round((float) ($row['amount'] ?? 0)) === 80
                && in_array($row['status'] ?? null, ['unpaid', 'overdue'], true)
        ));
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $ahmed->id,
            'title' => UnitServiceBillReminderService::CREATED_TITLE,
            'body' => 'Your House Cleaning bill of $80 is now available. Due date: September 15.',
        ]);

        $this->postJson("/api/v1/property-services/{$optionalOneTimeId}/subscribe")->assertCreated();
        $allBills = $this->getJson('/api/v1/service-bills')->assertOk()->json('data');
        $this->assertTrue(collect($allBills)->contains(
            fn ($row) => (int) $row['service_id'] === (int) $optionalOneTimeId
                && (int) round((float) $row['amount']) === 120
                && in_array($row['status'] ?? null, ['unpaid', 'overdue'], true)
        ));

        Sanctum::actingAs($fatima);
        $fatimaBills = $this->getJson('/api/v1/service-bills')->assertOk()->json('data');
        $this->assertFalse(collect($fatimaBills)->contains(
            fn ($row) => in_array((int) $row['service_id'], [(int) $optionalMonthlyId, (int) $optionalOneTimeId], true)
        ));
        $this->assertTrue(collect($fatimaBills)->contains(
            fn ($row) => (int) $row['service_id'] === (int) $automaticId
        ));
    }

    public function test_service_price_change_applies_to_next_cycle_only(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity(260);

        Sanctum::actingAs($admin);
        $headers = $this->headers($community->id);
        $serviceId = $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'Water',
                'category' => 'water',
                'application_type' => 'automatic',
                'amount' => 40,
                'due_day' => 10,
                'first_billing_month' => '2026-09',
            ])->assertCreated()->json('data.id');

        $this->withHeaders($headers)
            ->post("/api/v1/admin/property-services/{$serviceId}/generate-bills", [
                'billing_period' => '2026-09',
            ])->assertCreated();

        $this->assertDatabaseHas('unit_service_bills', [
            'service_id' => $serviceId,
            'amount' => 40,
        ]);

        $this->withHeaders($headers)
            ->patchJson("/api/v1/admin/property-services/{$serviceId}", [
                'amount' => 75,
            ])->assertOk();

        $this->assertDatabaseHas('unit_service_bills', [
            'service_id' => $serviceId,
            'amount' => 40,
        ]);
        $this->assertDatabaseMissing('unit_service_bills', [
            'service_id' => $serviceId,
            'amount' => 75,
        ]);

        $this->withHeaders($headers)
            ->post("/api/v1/admin/property-services/{$serviceId}/generate-bills", [
                'billing_period' => '2026-10',
            ])->assertCreated()
            ->assertJsonPath('data.created_count', 1);

        $this->assertDatabaseHas('unit_service_bills', [
            'service_id' => $serviceId,
            'amount' => 75,
        ]);
    }

    public function test_admin_can_list_update_and_delete_property_services(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity(250);

        Sanctum::actingAs($admin);
        $headers = $this->headers($community->id);

        $automaticId = $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'Parking dues',
                'category' => 'parking',
                'application_type' => 'automatic',
                'amount_type' => 'variable',
                'due_day' => 10,
                'first_billing_month' => '2026-09',
            ])->assertCreated()->json('data.id');

        $optionalId = $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'AC',
                'category' => 'ac_maintenance',
                'application_type' => 'optional',
                'amount' => 200,
                'due_day' => 15,
            ])->assertCreated()->json('data.id');

        $list = $this->withHeaders($headers)
            ->getJson('/api/v1/admin/property-services')
            ->assertOk()
            ->json('data');

        $automatic = collect($list)->firstWhere('id', $automaticId);
        $optional = collect($list)->firstWhere('id', $optionalId);

        $this->assertSame(1, $automatic['active_subscribers']);
        $this->assertSame(0, $optional['active_subscribers']);

        $this->withHeaders($headers)
            ->patchJson("/api/v1/admin/property-services/{$optionalId}", [
                'name' => 'AC Maintenance',
                'amount' => 225,
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'AC Maintenance')
            ->assertJsonPath('data.amount', 225);

        $this->withHeaders($headers)
            ->deleteJson("/api/v1/admin/property-services/{$automaticId}")
            ->assertOk();

        $this->assertDatabaseMissing('property_services', ['id' => $automaticId]);
        $this->assertDatabaseHas('property_services', ['id' => $optionalId, 'name' => 'AC Maintenance']);
    }

    public function test_office_units_are_not_billed_for_automatic_services(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();

        Sanctum::actingAs($admin);
        $serviceId = $this->withHeaders($this->headers($community->id))
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'Water',
                'category' => 'water',
                'application_type' => 'automatic',
                'amount' => 40,
                'due_day' => 10,
                'first_billing_month' => '2026-09',
            ])->assertCreated()->json('data.id');

        $this->withHeaders($this->headers($community->id))
            ->post("/api/v1/admin/property-services/{$serviceId}/generate-bills", [
                'billing_period' => '2026-09',
            ])->assertCreated();

        $this->assertDatabaseMissing('unit_service_bills', [
            'service_id' => $serviceId,
            'billing_contact_user_id' => $admin->id,
        ]);
    }

    public function test_admin_list_uses_current_unit_billing_contact_when_bill_snapshot_is_empty(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $ahmed] = $this->seedCommunity(280);

        Sanctum::actingAs($admin);
        $headers = $this->headers($community->id);
        $serviceId = $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'Parking dues',
                'category' => 'parking',
                'application_type' => 'automatic',
                'amount' => 20,
                'due_day' => 10,
                'first_billing_month' => '2026-09',
            ])->assertCreated()->json('data.id');

        $billId = (int) DB::table('unit_service_bills')->where('service_id', $serviceId)->value('id');
        $this->assertGreaterThan(0, $billId);
        DB::table('unit_service_bills')->where('id', $billId)->update([
            'billing_contact_user_id' => null,
        ]);

        $listed = $this->withHeaders($headers)
            ->getJson('/api/v1/admin/service-bills')
            ->assertOk()
            ->json('data');
        $row = collect($listed)->firstWhere('id', $billId);

        $this->assertNotNull($row);
        $this->assertFalse($row['missing_billing_contact']);
        $this->assertSame($ahmed->id, $row['billing_contact']['id']);
        $this->assertDatabaseHas('unit_service_bills', [
            'id' => $billId,
            'billing_contact_user_id' => $ahmed->id,
        ]);

        Sanctum::actingAs($ahmed);
        $mine = $this->getJson('/api/v1/service-bills')->assertOk()->json('data');
        $this->assertTrue(collect($mine)->contains(fn ($bill) => (int) $bill['id'] === $billId));
    }

    public function test_community_admin_is_not_a_residential_billing_contact(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity(240);
        DB::table('profiles')->updateOrInsert(
            ['user_id' => $admin->id],
            ['unit_number' => '201', 'updated_at' => now()]
        );
        $admin->unsetRelation('profile');

        $units = app(UnitAssignmentService::class);
        $units->syncUserToCommunity($admin->fresh('profile'), $community->id);
        $assigned = $units->findActiveUnitForUser((int) $admin->id, (int) $community->id);

        $this->assertNotNull($assigned);
        $this->assertSame('Office', $assigned->unit_number);
        $this->assertSame(UnitAssignmentService::KIND_OFFICE, $assigned->kind);
        $this->assertDatabaseMissing('units', [
            'community_id' => $community->id,
            'unit_number' => '201',
            'billing_contact_user_id' => $admin->id,
        ]);

        $now = now();
        $unitId = DB::table('units')->insertGetId([
            'community_id' => $community->id,
            'unit_number' => '201',
            'unit_number_normalized' => '201',
            'kind' => UnitAssignmentService::KIND_RESIDENTIAL,
            'status' => UnitAssignmentService::STATUS_ACTIVE,
            'billing_contact_user_id' => $admin->id,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        DB::table('unit_residents')->insert([
            'unit_id' => $unitId,
            'community_id' => $community->id,
            'user_id' => $admin->id,
            'status' => UnitAssignmentService::RESIDENT_ACTIVE,
            'joined_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $units->repairStaffAssignments((int) $community->id);
        $payload = $units->formatAdminUnit(DB::table('units')->find($unitId));

        $this->assertNull($payload['billing_contact_user_id']);
        $this->assertSame(0, $payload['resident_count']);
        $this->assertSame([], $payload['residents']);
        $this->assertDatabaseMissing('unit_residents', [
            'unit_id' => $unitId,
            'user_id' => $admin->id,
            'status' => UnitAssignmentService::RESIDENT_ACTIVE,
        ]);
        $this->assertDatabaseHas('unit_residents', [
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'status' => UnitAssignmentService::RESIDENT_ACTIVE,
            'unit_id' => $assigned->id,
        ]);
    }

    public function test_billing_contact_transfer_stays_pending_until_nominee_accepts(): void
    {
        ['community' => $community, 'resident' => $ahmed] = $this->seedCommunity(240);
        $maria = $this->addUnitResident($community->id, 'Maria', '4B', '+201800000242');

        Sanctum::actingAs($ahmed);
        $requestId = $this->postJson('/api/v1/units/mine/billing-contact-transfers', [
            'nominee_user_id' => $maria->id,
        ])->assertCreated()->json('data.id');

        $mine = $this->getJson('/api/v1/units/mine')->assertOk()->json('data');
        $this->assertTrue($mine['is_billing_contact']);
        $this->assertFalse($mine['can_request_transfer']);
        $this->assertSame('pending', $mine['outgoing_transfer']['status']);
        $this->assertSame($maria->id, $mine['outgoing_transfer']['nominee']['id']);

        $this->postJson('/api/v1/units/mine/billing-contact-transfers', [
            'nominee_user_id' => $maria->id,
        ])->assertCreated()->assertJsonPath('data.id', $requestId);

        Sanctum::actingAs($maria);
        $mariaMine = $this->getJson('/api/v1/units/mine')->assertOk()->json('data');
        $this->assertFalse($mariaMine['is_billing_contact']);
        $this->assertSame($requestId, $mariaMine['incoming_transfer']['id']);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $maria->id,
            'title' => 'Billing contact request',
        ]);

        $this->patchJson("/api/v1/billing-contact-transfers/{$requestId}/accept")
            ->assertOk()
            ->assertJsonPath('data.status', 'accepted');

        $this->assertTrue($this->getJson('/api/v1/units/mine')->assertOk()->json('data.is_billing_contact'));

        Sanctum::actingAs($ahmed);
        $this->assertFalse($this->getJson('/api/v1/units/mine')->assertOk()->json('data.is_billing_contact'));
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $ahmed->id,
            'title' => 'Billing contact accepted',
        ]);
    }

    public function test_rejected_or_pending_billing_contact_transfer_keeps_current_contact(): void
    {
        ['community' => $community, 'resident' => $ahmed] = $this->seedCommunity(250);
        $maria = $this->addUnitResident($community->id, 'Maria', '4B', '+201800000252');

        Sanctum::actingAs($ahmed);
        $requestId = $this->postJson('/api/v1/units/mine/billing-contact-transfers', [
            'nominee_user_id' => $maria->id,
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($maria);
        $this->patchJson("/api/v1/billing-contact-transfers/{$requestId}/reject")
            ->assertOk()
            ->assertJsonPath('data.status', 'rejected');

        Sanctum::actingAs($ahmed);
        $this->assertTrue($this->getJson('/api/v1/units/mine')->assertOk()->json('data.is_billing_contact'));
        $this->assertTrue($this->getJson('/api/v1/units/mine')->assertOk()->json('data.can_request_transfer'));
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $ahmed->id,
            'title' => 'Billing contact declined',
        ]);

        Sanctum::actingAs($maria);
        $this->assertFalse($this->getJson('/api/v1/units/mine')->assertOk()->json('data.is_billing_contact'));
    }

    public function test_ineligible_stale_billing_contact_does_not_flag_viewer_as_contact(): void
    {
        ['community' => $community, 'resident' => $ahmed] = $this->seedCommunity(270);
        $maria = $this->addUnitResident($community->id, 'Maria', '4B', '+201800000272');
        $unitId = (int) DB::table('units')
            ->where('community_id', $community->id)
            ->where('unit_number', '4B')
            ->value('id');

        DB::table('units')->where('id', $unitId)->update([
            'billing_contact_user_id' => $ahmed->id,
        ]);
        DB::table('users')->where('id', $ahmed->id)->update(['role' => 'community_admin']);
        DB::table('community_memberships')
            ->where('user_id', $ahmed->id)
            ->where('community_id', $community->id)
            ->update(['role' => 'admin']);

        Sanctum::actingAs($ahmed);
        $mine = $this->getJson('/api/v1/units/mine')->assertOk()->json('data');
        $this->assertFalse($mine['is_billing_contact']);
        $this->assertSame($maria->id, $mine['billing_contact']['id']);

        Sanctum::actingAs($maria);
        $mariaMine = $this->getJson('/api/v1/units/mine')->assertOk()->json('data');
        $this->assertTrue($mariaMine['is_billing_contact']);
        $this->assertSame($maria->id, $mariaMine['billing_contact']['id']);
    }

    public function test_non_billing_contact_cannot_nominate_and_nominee_must_be_unit_resident(): void
    {
        ['community' => $community, 'resident' => $ahmed] = $this->seedCommunity(260);
        $maria = $this->addUnitResident($community->id, 'Maria', '4B', '+201800000262');
        $outsider = $this->addUnitResident($community->id, 'Omar', '9C', '+201800000263');

        Sanctum::actingAs($maria);
        $this->postJson('/api/v1/units/mine/billing-contact-transfers', [
            'nominee_user_id' => $ahmed->id,
        ])->assertStatus(422);

        Sanctum::actingAs($ahmed);
        $this->postJson('/api/v1/units/mine/billing-contact-transfers', [
            'nominee_user_id' => $outsider->id,
        ])->assertStatus(422);

        $mine = $this->getJson('/api/v1/units/mine')->assertOk()->json('data');
        $this->assertFalse(collect($mine['residents'] ?? [])->contains('id', $outsider->id));
        $this->assertNull($mine['outgoing_transfer']);
        $this->assertTrue($mine['can_request_transfer']);
    }

    public function test_pending_billing_contact_request_blocks_another_nomination(): void
    {
        ['community' => $community, 'resident' => $ahmed] = $this->seedCommunity(261);
        $maria = $this->addUnitResident($community->id, 'Maria', '4B', '+201800000264');
        $sara = $this->addUnitResident($community->id, 'Sara', '4B', '+201800000265');

        Sanctum::actingAs($ahmed);
        $this->postJson('/api/v1/units/mine/billing-contact-transfers', [
            'nominee_user_id' => $maria->id,
        ])->assertCreated();

        $this->postJson('/api/v1/units/mine/billing-contact-transfers', [
            'nominee_user_id' => $sara->id,
        ])->assertStatus(422);

        $mine = $this->getJson('/api/v1/units/mine')->assertOk()->json('data');
        $this->assertTrue($mine['is_billing_contact']);
        $this->assertFalse($mine['can_request_transfer']);
        $this->assertSame($maria->id, $mine['outgoing_transfer']['nominee']['id']);
    }

    public function test_admin_property_services_include_all_schedule_and_type_combinations_for_filters(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity(290);

        Sanctum::actingAs($admin);
        $headers = $this->headers($community->id);

        $combos = [
            ['name' => 'Auto Monthly', 'application_type' => 'automatic', 'billing_frequency' => 'monthly', 'expected_frequency' => 'monthly'],
            ['name' => 'Auto Yearly', 'application_type' => 'automatic', 'billing_frequency' => 'yearly', 'expected_frequency' => 'yearly'],
            ['name' => 'Auto One-time', 'application_type' => 'automatic', 'billing_frequency' => 'one_time', 'expected_frequency' => 'monthly'],
            ['name' => 'Optional Monthly', 'application_type' => 'optional', 'billing_frequency' => 'monthly', 'expected_frequency' => 'monthly'],
            ['name' => 'Optional Yearly', 'application_type' => 'optional', 'billing_frequency' => 'yearly', 'expected_frequency' => 'yearly'],
            ['name' => 'Optional One-time', 'application_type' => 'optional', 'billing_frequency' => 'one_time', 'expected_frequency' => 'one_time'],
        ];

        foreach ($combos as $combo) {
            $this->withHeaders($headers)
                ->postJson('/api/v1/admin/property-services', array_merge([
                    'category' => 'water',
                    'amount' => 100,
                    'due_day' => 10,
                    'first_billing_month' => '2026-09',
                ], $combo))
                ->assertCreated()
                ->assertJsonPath('data.application_type', $combo['application_type'])
                ->assertJsonPath('data.billing_frequency', $combo['expected_frequency']);
        }

        $list = $this->withHeaders($headers)
            ->getJson('/api/v1/admin/property-services')
            ->assertOk()
            ->json('data');

        $this->assertCount(6, $list);
        $this->assertSame(3, collect($list)->where('application_type', 'automatic')->count());
        $this->assertSame(3, collect($list)->where('application_type', 'optional')->count());
        $this->assertSame(3, collect($list)->where('billing_frequency', 'monthly')->count());
        $this->assertSame(2, collect($list)->where('billing_frequency', 'yearly')->count());
        $this->assertSame(1, collect($list)->where('billing_frequency', 'one_time')->count());
    }

    public function test_yearly_service_stores_billing_year_and_generates_once_for_that_year(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $ahmed] = $this->seedCommunity(310);

        Sanctum::actingAs($admin);
        $headers = $this->headers($community->id);

        $current = $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'Annual Dues',
                'category' => 'parking',
                'application_type' => 'automatic',
                'billing_frequency' => 'yearly',
                'amount' => 240,
                'due_day' => 10,
                'first_billing_month' => '2026',
            ])
            ->assertCreated()
            ->assertJsonPath('data.billing_frequency', 'yearly')
            ->assertJsonPath('data.first_billing_month', '2026-01')
            ->json('data');

        $this->assertSame(1, DB::table('unit_service_bills')->where('service_id', $current['id'])->count());
        $this->assertSame('2026-01-01', DB::table('unit_service_bills')->where('service_id', $current['id'])->value('billing_period'));

        $future = $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'Future Dues',
                'category' => 'parking',
                'application_type' => 'automatic',
                'billing_frequency' => 'yearly',
                'amount' => 240,
                'due_day' => 10,
                'first_billing_month' => '2027',
            ])
            ->assertCreated()
            ->assertJsonPath('data.first_billing_month', '2027-01')
            ->json('data');

        $this->assertSame(0, DB::table('unit_service_bills')->where('service_id', $future['id'])->count());

        Sanctum::actingAs($ahmed);
        $bills = $this->getJson('/api/v1/service-bills')->assertOk()->json('data');
        $this->assertTrue(collect($bills)->contains(fn ($bill) => $bill['service_id'] === $current['id']));
        $this->assertFalse(collect($bills)->contains(fn ($bill) => $bill['service_id'] === $future['id']));
    }

    public function test_inactive_service_stops_new_bills_and_subscriptions_until_reactivated(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $ahmed] = $this->seedCommunity(320);
        $headers = $this->headers($community->id);

        Sanctum::actingAs($admin);
        $automaticId = $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'Water',
                'category' => 'water',
                'application_type' => 'automatic',
                'amount' => 40,
                'due_day' => 10,
                'first_billing_month' => '2026-09',
            ])->assertCreated()->json('data.id');

        $optionalId = $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'Parking',
                'category' => 'parking',
                'application_type' => 'optional',
                'billing_frequency' => 'monthly',
                'amount' => 80,
                'due_day' => 15,
            ])->assertCreated()->json('data.id');

        $closedOptionalId = $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'Pest control',
                'category' => 'pest_control',
                'application_type' => 'optional',
                'billing_frequency' => 'monthly',
                'amount' => 60,
                'due_day' => 15,
                'status' => 'inactive',
            ])->assertCreated()
            ->assertJsonPath('data.status', 'inactive')
            ->json('data.id');

        Sanctum::actingAs($ahmed);
        $this->postJson("/api/v1/property-services/{$optionalId}/subscribe")->assertCreated();
        $this->postJson("/api/v1/property-services/{$closedOptionalId}/subscribe")
            ->assertStatus(422)
            ->assertJsonPath('errors.service.0', 'This service is not accepting subscriptions.');

        $this->assertDatabaseHas('unit_service_bills', [
            'service_id' => $automaticId,
            'billing_contact_user_id' => $ahmed->id,
            'amount' => 40,
        ]);
        $this->assertDatabaseHas('unit_service_bills', [
            'service_id' => $optionalId,
            'billing_contact_user_id' => $ahmed->id,
            'amount' => 80,
        ]);
        $this->assertDatabaseHas('unit_service_subscriptions', [
            'service_id' => $optionalId,
            'status' => 'active',
        ]);
        $existingBillCount = DB::table('unit_service_bills')
            ->whereIn('service_id', [$automaticId, $optionalId])
            ->count();

        Sanctum::actingAs($admin);
        $this->withHeaders($headers)
            ->patchJson("/api/v1/admin/property-services/{$automaticId}", ['status' => 'inactive'])
            ->assertOk()
            ->assertJsonPath('data.status', 'inactive');
        $this->withHeaders($headers)
            ->patchJson("/api/v1/admin/property-services/{$optionalId}", ['status' => 'inactive'])
            ->assertOk()
            ->assertJsonPath('data.status', 'inactive');

        $this->assertSame(
            $existingBillCount,
            DB::table('unit_service_bills')->whereIn('service_id', [$automaticId, $optionalId])->count()
        );
        $this->assertDatabaseHas('unit_service_subscriptions', [
            'service_id' => $optionalId,
            'status' => 'active',
        ]);

        $this->withHeaders($headers)
            ->post("/api/v1/admin/property-services/{$automaticId}/generate-bills", [
                'billing_period' => '2026-10',
            ])
            ->assertStatus(422)
            ->assertJsonPath('errors.service.0', 'Inactive services cannot generate new bills.');

        Sanctum::actingAs($ahmed);
        $catalog = collect($this->getJson('/api/v1/property-services')->assertOk()->json('data'));
        $this->assertFalse($catalog->contains(fn ($row) => (int) $row['id'] === (int) $optionalId));
        $this->assertFalse($catalog->contains(fn ($row) => (int) $row['id'] === (int) $automaticId));
        $this->postJson("/api/v1/property-services/{$optionalId}/subscribe")
            ->assertStatus(422)
            ->assertJsonPath('errors.service.0', 'This service is not accepting subscriptions.');

        Carbon::setTestNow(Carbon::parse('2026-10-15 12:00:00'));
        app(UnitServiceBillService::class)->generateDueAutomaticBills();
        $this->assertSame(
            $existingBillCount,
            DB::table('unit_service_bills')->whereIn('service_id', [$automaticId, $optionalId])->count()
        );

        Sanctum::actingAs($admin);
        $this->withHeaders($headers)
            ->patchJson("/api/v1/admin/property-services/{$automaticId}", ['status' => 'active'])
            ->assertOk()
            ->assertJsonPath('data.status', 'active');
        $this->withHeaders($headers)
            ->patchJson("/api/v1/admin/property-services/{$optionalId}", ['status' => 'active'])
            ->assertOk()
            ->assertJsonPath('data.status', 'active');
        $this->withHeaders($headers)
            ->patchJson("/api/v1/admin/property-services/{$closedOptionalId}", ['status' => 'active'])
            ->assertOk()
            ->assertJsonPath('data.status', 'active');

        $this->assertDatabaseHas('unit_service_bills', [
            'service_id' => $automaticId,
            'billing_period' => '2026-10-01',
            'amount' => 40,
        ]);
        $this->assertDatabaseHas('unit_service_bills', [
            'service_id' => $optionalId,
            'billing_period' => '2026-10-01',
            'amount' => 80,
        ]);

        Sanctum::actingAs($ahmed);
        $catalog = collect($this->getJson('/api/v1/property-services')->assertOk()->json('data'));
        $this->assertTrue($catalog->contains(fn ($row) => (int) $row['id'] === (int) $optionalId));
        $this->assertTrue($catalog->contains(fn ($row) => (int) $row['id'] === (int) $closedOptionalId));
        $residentBills = collect($this->getJson('/api/v1/service-bills')->assertOk()->json('data'));
        $this->assertCount(4, $residentBills);
        $this->assertTrue($residentBills->contains(
            fn ($bill) => (int) $bill['service_id'] === (int) $automaticId && str_starts_with((string) $bill['billing_period'], '2026-09')
        ));
        $this->assertTrue($residentBills->contains(
            fn ($bill) => (int) $bill['service_id'] === (int) $automaticId && str_starts_with((string) $bill['billing_period'], '2026-10')
        ));

        $this->postJson("/api/v1/property-services/{$closedOptionalId}/subscribe")->assertCreated();
        $this->assertDatabaseHas('unit_service_subscriptions', [
            'service_id' => $closedOptionalId,
            'status' => 'active',
        ]);
    }

    public function test_admin_service_bills_status_filter_and_overdue_marking(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $ahmed] = $this->seedCommunity(300);

        Sanctum::actingAs($admin);
        $headers = $this->headers($community->id);

        $automaticId = $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'Water',
                'category' => 'water',
                'application_type' => 'automatic',
                'amount' => 40,
                'due_day' => 10,
                'first_billing_month' => '2026-09',
            ])->assertCreated()->json('data.id');

        $optionalId = $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'Parking',
                'category' => 'parking',
                'application_type' => 'optional',
                'billing_frequency' => 'monthly',
                'amount' => 80,
                'due_day' => 15,
                'requires_admin_approval' => false,
            ])->assertCreated()->json('data.id');

        Sanctum::actingAs($ahmed);
        $this->postJson("/api/v1/property-services/{$optionalId}/subscribe")->assertCreated();

        Sanctum::actingAs($admin);
        $this->withHeaders($headers)
            ->post("/api/v1/admin/property-services/{$optionalId}/generate-bills", [
                'billing_period' => '2026-09',
            ])->assertCreated();

        $automaticBillId = (int) DB::table('unit_service_bills')->where('service_id', $automaticId)->value('id');
        $optionalBillId = (int) DB::table('unit_service_bills')->where('service_id', $optionalId)->value('id');
        $this->assertGreaterThan(0, $automaticBillId);
        $this->assertGreaterThan(0, $optionalBillId);

        DB::table('unit_service_bills')->where('id', $automaticBillId)->update([
            'status' => UnitServiceBillService::STATUS_OVERDUE,
            'due_date' => '2026-09-01',
        ]);
        DB::table('unit_service_bills')->where('id', $optionalBillId)->update([
            'status' => UnitServiceBillService::STATUS_PENDING,
            'due_date' => '2026-09-20',
        ]);

        $all = $this->withHeaders($headers)->getJson('/api/v1/admin/service-bills')->assertOk()->json('data');
        $this->assertGreaterThanOrEqual(2, count($all));
        $this->assertTrue(collect($all)->contains(fn ($row) => (int) $row['id'] === $automaticBillId && $row['application_type'] === 'automatic'));
        $this->assertTrue(collect($all)->contains(fn ($row) => (int) $row['id'] === $optionalBillId && $row['application_type'] === 'optional'));

        $overdue = $this->withHeaders($headers)
            ->getJson('/api/v1/admin/service-bills?status=overdue')
            ->assertOk()
            ->json('data');
        $this->assertTrue(collect($overdue)->contains(fn ($row) => (int) $row['id'] === $automaticBillId));
        $this->assertFalse(collect($overdue)->contains(fn ($row) => (int) $row['id'] === $optionalBillId));

        $pending = $this->withHeaders($headers)
            ->getJson('/api/v1/admin/service-bills?status=pending_verification')
            ->assertOk()
            ->json('data');
        $this->assertTrue(collect($pending)->contains(fn ($row) => (int) $row['id'] === $optionalBillId));
        $this->assertFalse(collect($pending)->contains(fn ($row) => (int) $row['id'] === $automaticBillId));

        DB::table('unit_service_bills')->where('id', $automaticBillId)->update([
            'status' => UnitServiceBillService::STATUS_UNPAID,
            'due_date' => '2026-09-01',
        ]);

        $marked = $this->withHeaders($headers)->getJson('/api/v1/admin/service-bills?status=overdue')->assertOk()->json('data');
        $this->assertTrue(collect($marked)->contains(fn ($row) => (int) $row['id'] === $automaticBillId));

        Sanctum::actingAs($ahmed);
        $this->postJson("/api/v1/service-bills/{$automaticBillId}/acknowledge")
            ->assertOk()
            ->assertJsonPath('data.status', 'acknowledged');

        Sanctum::actingAs($admin);
        $acknowledged = $this->withHeaders($headers)
            ->getJson('/api/v1/admin/service-bills?status=acknowledged')
            ->assertOk()
            ->json('data');
        $this->assertTrue(collect($acknowledged)->contains(fn ($row) => (int) $row['id'] === $automaticBillId));

        Sanctum::actingAs($admin);
        $this->withHeaders($headers)
            ->patchJson("/api/v1/admin/service-bills/{$optionalBillId}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'paid');

        $paid = $this->withHeaders($headers)
            ->getJson('/api/v1/admin/service-bills?status=paid')
            ->assertOk()
            ->json('data');
        $this->assertTrue(collect($paid)->contains(fn ($row) => (int) $row['id'] === $optionalBillId));

        $this->withHeaders($headers)
            ->getJson('/api/v1/admin/service-bills?status=nonexistent')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_service_with_send_notice_disabled_skips_finance_notice(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $ahmed] = $this->seedCommunity(330);
        $headers = $this->headers($community->id);

        Sanctum::actingAs($admin);
        $serviceId = $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'Silent Water',
                'category' => 'water',
                'application_type' => 'automatic',
                'amount' => 35,
                'due_day' => 10,
                'first_billing_month' => '2026-09',
                'send_notice' => false,
                'send_notification' => true,
            ])->assertCreated()->json('data.id');

        $bill = DB::table('unit_service_bills')->where('service_id', $serviceId)->first();
        $this->assertNotNull($bill);
        $this->assertNull($bill->notice_id);
        $this->assertDatabaseMissing('notices', [
            'community_id' => $community->id,
            'title' => 'Silent Water — Unit 4B',
        ]);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $ahmed->id,
            'title' => 'New Service Bill',
        ]);

        Sanctum::actingAs($ahmed);
        $homeIds = collect($this->getJson('/api/v1/notices')->assertOk()->json('data'))->pluck('id');
        $this->assertFalse($homeIds->contains(fn ($id) => str_contains(
            (string) DB::table('notices')->where('id', $id)->value('body'),
            'Silent Water',
        )));
    }

    public function test_inactive_service_notice_rules_and_reactivation_notice_generation(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $ahmed] = $this->seedCommunity(340);
        $headers = $this->headers($community->id);

        Sanctum::actingAs($admin);
        $serviceId = $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'Garden Care',
                'category' => 'house_cleaning',
                'application_type' => 'automatic',
                'amount' => 45,
                'due_day' => 10,
                'first_billing_month' => '2026-09',
            ])->assertCreated()->json('data.id');

        $firstBill = DB::table('unit_service_bills')->where('service_id', $serviceId)->first();
        $this->assertNotNull($firstBill?->notice_id);
        $firstNoticeId = (int) $firstBill->notice_id;

        Sanctum::actingAs($ahmed);
        $this->getJson('/api/v1/notices')
            ->assertOk()
            ->assertJsonFragment(['id' => $firstNoticeId]);

        Sanctum::actingAs($admin);
        $this->withHeaders($headers)
            ->patchJson("/api/v1/admin/property-services/{$serviceId}", ['status' => 'inactive'])
            ->assertOk();

        Carbon::setTestNow(Carbon::parse('2026-10-15 12:00:00'));
        app(UnitServiceBillService::class)->generateDueAutomaticBills();
        $this->assertSame(1, DB::table('unit_service_bills')->where('service_id', $serviceId)->count());
        $this->assertDatabaseHas('notices', ['id' => $firstNoticeId, 'status' => 'published']);

        $this->withHeaders($headers)
            ->patchJson("/api/v1/admin/property-services/{$serviceId}", ['status' => 'active'])
            ->assertOk();

        $secondBill = DB::table('unit_service_bills')
            ->where('service_id', $serviceId)
            ->where('billing_period', '2026-10-01')
            ->first();
        $this->assertNotNull($secondBill);
        $this->assertNotNull($secondBill->notice_id);
        $this->assertNotSame($firstNoticeId, (int) $secondBill->notice_id);

        Sanctum::actingAs($ahmed);
        $homeIds = collect($this->getJson('/api/v1/notices')->assertOk()->json('data'))->pluck('id');
        $this->assertTrue($homeIds->contains($firstNoticeId));
        $this->assertTrue($homeIds->contains((int) $secondBill->notice_id));

        Sanctum::actingAs($admin);
        $this->withHeaders($headers)
            ->patchJson("/api/v1/admin/service-bills/{$secondBill->id}/approve")
            ->assertStatus(422);

        Storage::fake('public');
        Sanctum::actingAs($ahmed);
        $this->post("/api/v1/service-bills/{$secondBill->id}/proof", [
            'payment_date' => '2026-10-14',
            'file' => UploadedFile::fake()->image('garden-proof.jpg', 400, 400),
        ])->assertOk();

        Sanctum::actingAs($admin);
        $this->withHeaders($headers)
            ->patchJson("/api/v1/admin/service-bills/{$secondBill->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'paid');

        $paidNotice = DB::table('notices')->find($secondBill->notice_id);
        $this->assertNotNull($paidNotice->event_date);
        $this->assertTrue(Carbon::parse($paidNotice->event_date)->lt(now()->startOfDay()));

        Sanctum::actingAs($ahmed);
        $homeIds = collect($this->getJson('/api/v1/notices')->assertOk()->json('data'))->pluck('id');
        $this->assertTrue($homeIds->contains($firstNoticeId));
        $this->assertFalse($homeIds->contains((int) $secondBill->notice_id));
        $updatesIds = collect($this->getJson('/api/v1/notices?include_expired=1')->assertOk()->json('data'))->pluck('id');
        $this->assertTrue($updatesIds->contains((int) $secondBill->notice_id));

        Carbon::setTestNow(Carbon::parse('2026-09-21 12:00:00'));
    }

    public function test_automatic_service_bill_backfills_when_residential_unit_is_assigned_after_publish(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity(410);

        DB::table('unit_residents')->where('user_id', $resident->id)->delete();
        DB::table('units')
            ->where('community_id', $community->id)
            ->where('kind', UnitAssignmentService::KIND_RESIDENTIAL)
            ->delete();

        Sanctum::actingAs($admin);
        $headers = $this->headers($community->id);
        $serviceId = $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'Water Supply',
                'category' => 'water',
                'application_type' => 'automatic',
                'billing_frequency' => 'monthly',
                'amount' => 35,
                'due_day' => 10,
                'first_billing_month' => '2026-09',
                'auto_generate_bills' => true,
            ])
            ->assertCreated()
            ->json('data.id');

        $this->assertDatabaseMissing('unit_service_bills', ['service_id' => $serviceId]);

        app(UnitAssignmentService::class)->syncUserToCommunity($resident->fresh('profile'), $community->id);

        $this->assertDatabaseHas('unit_service_bills', [
            'service_id' => $serviceId,
            'billing_contact_user_id' => $resident->id,
            'status' => UnitServiceBillService::STATUS_UNPAID,
        ]);
        $this->assertDatabaseHas('notice_recipients', [
            'user_id' => $resident->id,
        ]);

        Sanctum::actingAs($resident);
        $bills = $this->getJson('/api/v1/service-bills')->assertOk()->json('data');
        $this->assertTrue(collect($bills)->contains(
            fn ($row) => (int) ($row['service_id'] ?? 0) === (int) $serviceId,
        ));
    }

    public function test_service_name_and_description_reject_text_past_the_character_limit(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity(420);
        Sanctum::actingAs($admin);
        $headers = $this->headers($community->id);
        $payload = [
            'category' => 'water',
            'application_type' => 'automatic',
            'billing_frequency' => 'monthly',
            'amount' => 25,
            'due_day' => 10,
            'first_billing_month' => '2026-09',
        ];

        $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', array_merge($payload, [
                'name' => str_repeat('A', 121),
                'description' => 'Water service',
            ]))
            ->assertUnprocessable()
            ->assertJsonPath('errors.name.0', 'Service name must be 120 characters or fewer.');

        $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', array_merge($payload, [
                'name' => 'Water',
                'description' => str_repeat('B', 501),
            ]))
            ->assertUnprocessable()
            ->assertJsonPath('errors.description.0', 'Description must be 500 characters or fewer.');

        $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', array_merge($payload, [
                'name' => 'Water',
                'payment_instructions' => str_repeat('C', 2001),
            ]))
            ->assertUnprocessable()
            ->assertJsonPath('errors.payment_instructions.0', 'Payment instructions must be 2,000 characters or fewer.');

        $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', array_merge($payload, [
                'name' => str_repeat('A', 120),
                'description' => str_repeat('B', 500),
                'payment_instructions' => str_repeat('C', 2000),
            ]))
            ->assertCreated()
            ->assertJsonPath('data.name', str_repeat('A', 120))
            ->assertJsonPath('data.description', str_repeat('B', 500))
            ->assertJsonPath('data.payment_instructions', str_repeat('C', 2000));
    }

    public function test_custom_category_must_be_between_2_and_80_characters(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity(421);
        Sanctum::actingAs($admin);
        $headers = $this->headers($community->id);
        $payload = [
            'name' => 'Concierge',
            'category' => 'other',
            'application_type' => 'automatic',
            'billing_frequency' => 'monthly',
            'amount' => 25,
            'due_day' => 10,
            'first_billing_month' => '2026-09',
        ];

        $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', array_merge($payload, [
                'custom_category' => 'A',
            ]))
            ->assertUnprocessable()
            ->assertJsonPath('errors.custom_category.0', 'Custom category must be at least 2 characters.');

        $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', array_merge($payload, [
                'custom_category' => str_repeat('D', 81),
            ]))
            ->assertUnprocessable()
            ->assertJsonPath('errors.custom_category.0', 'Custom category must be 80 characters or fewer.');

        $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', array_merge($payload, [
                'custom_category' => str_repeat('D', 80),
            ]))
            ->assertCreated()
            ->assertJsonPath('data.custom_category', str_repeat('D', 80));
    }

    public function test_service_amount_must_be_between_one_cent_and_the_maximum(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity(422);
        Sanctum::actingAs($admin);
        $headers = $this->headers($community->id);
        $payload = [
            'name' => 'Water',
            'category' => 'water',
            'application_type' => 'automatic',
            'billing_frequency' => 'monthly',
            'due_day' => 10,
            'first_billing_month' => '2026-09',
        ];

        $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', array_merge($payload, ['amount' => 0]))
            ->assertUnprocessable()
            ->assertJsonPath('errors.amount.0', 'Enter an amount of at least 0.01.');

        $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', array_merge($payload, ['amount' => -5]))
            ->assertUnprocessable()
            ->assertJsonPath('errors.amount.0', 'Enter an amount of at least 0.01.');

        $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', array_merge($payload, ['amount' => 1000000]))
            ->assertUnprocessable()
            ->assertJsonPath('errors.amount.0', 'Enter an amount of 999,999.99 or less.');

        $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', array_merge($payload, ['amount' => 1.239]))
            ->assertUnprocessable()
            ->assertJsonPath('errors.amount.0', 'Enter an amount with up to 2 decimal places.');

        $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', array_merge($payload, ['amount' => 999999.99]))
            ->assertCreated()
            ->assertJsonPath('data.amount', 999999.99);
    }

    public function test_optional_service_subscriber_limit_must_be_between_one_and_the_maximum(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity(423);
        Sanctum::actingAs($admin);
        $headers = $this->headers($community->id);
        $payload = [
            'name' => 'Parking',
            'category' => 'parking',
            'application_type' => 'optional',
            'billing_frequency' => 'monthly',
            'amount' => 25,
            'due_day' => 10,
            'first_billing_month' => '2026-09',
        ];

        $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', array_merge($payload, ['max_subscribers' => 0]))
            ->assertUnprocessable()
            ->assertJsonPath('errors.max_subscribers.0', 'Enter at least 1 subscriber.');

        $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', array_merge($payload, ['max_subscribers' => 100001]))
            ->assertUnprocessable()
            ->assertJsonPath('errors.max_subscribers.0', 'Enter 100,000 subscribers or fewer.');

        $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', array_merge($payload, ['max_subscribers' => 100000]))
            ->assertCreated()
            ->assertJsonPath('data.max_subscribers', 100000);
    }

    public function test_automatic_bills_skip_vacant_units_and_start_when_a_resident_is_assigned(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $ahmed] = $this->seedCommunity(430);
        $units = app(UnitAssignmentService::class);
        $vacant = $units->createUnit((int) $community->id, '201');

        Sanctum::actingAs($admin);
        $headers = $this->headers($community->id);
        $serviceId = $this->withHeaders($headers)
            ->postJson('/api/v1/admin/property-services', [
                'name' => 'Water',
                'category' => 'water',
                'application_type' => 'automatic',
                'billing_frequency' => 'monthly',
                'amount' => 40,
                'due_day' => 10,
                'first_billing_month' => '2026-09',
                'auto_generate_bills' => true,
            ])
            ->assertCreated()
            ->json('data.id');

        $this->assertSame(UnitAssignmentService::STATUS_ACTIVE, DB::table('units')->where('id', $vacant->id)->value('status'));
        $this->assertDatabaseMissing('unit_service_bills', [
            'service_id' => $serviceId,
            'unit_id' => $vacant->id,
        ]);
        $this->assertDatabaseHas('unit_service_bills', [
            'service_id' => $serviceId,
            'billing_contact_user_id' => $ahmed->id,
            'billing_period' => '2026-09-01',
        ]);

        $listed = $this->withHeaders($headers)->getJson('/api/v1/admin/property-services')->assertOk()->json('data');
        $this->assertSame(1, collect($listed)->firstWhere('id', $serviceId)['active_subscribers']);

        Carbon::setTestNow(Carbon::parse('2026-10-16 12:00:00'));
        app(UnitServiceBillService::class)->generateDueAutomaticBills();
        $this->assertDatabaseMissing('unit_service_bills', [
            'service_id' => $serviceId,
            'unit_id' => $vacant->id,
        ]);
        $this->assertDatabaseHas('unit_service_bills', [
            'service_id' => $serviceId,
            'billing_contact_user_id' => $ahmed->id,
            'billing_period' => '2026-10-01',
        ]);

        $newResident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'phone' => '+201800000439',
        ]);
        $newResident->profile()->updateOrCreate(['user_id' => $newResident->id], [
            'display_name' => 'New Resident',
            'unit_number' => '201',
            'residence_type' => 'tenant',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $newResident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);
        $units->syncUserToCommunity($newResident->fresh('profile'), (int) $community->id);

        $this->assertDatabaseHas('unit_service_bills', [
            'service_id' => $serviceId,
            'unit_id' => $vacant->id,
            'billing_contact_user_id' => $newResident->id,
            'billing_period' => '2026-10-01',
        ]);
        $this->assertDatabaseMissing('unit_service_bills', [
            'service_id' => $serviceId,
            'unit_id' => $vacant->id,
            'billing_period' => '2026-09-01',
        ]);

        $octoberBillId = (int) DB::table('unit_service_bills')
            ->where('service_id', $serviceId)
            ->where('unit_id', $vacant->id)
            ->value('id');

        DB::table('community_memberships')
            ->where('user_id', $newResident->id)
            ->where('community_id', $community->id)
            ->update(['status' => 'inactive', 'updated_at' => now()]);
        DB::table('unit_residents')
            ->where('user_id', $newResident->id)
            ->where('unit_id', $vacant->id)
            ->update([
                'status' => UnitAssignmentService::RESIDENT_LEFT,
                'left_at' => now(),
                'updated_at' => now(),
            ]);
        DB::table('units')->where('id', $vacant->id)->update([
            'billing_contact_user_id' => null,
            'updated_at' => now(),
        ]);

        Carbon::setTestNow(Carbon::parse('2026-11-16 12:00:00'));
        app(UnitServiceBillService::class)->generateDueAutomaticBills();

        $this->assertSame(UnitAssignmentService::STATUS_ACTIVE, DB::table('units')->where('id', $vacant->id)->value('status'));
        $this->assertDatabaseHas('unit_service_bills', [
            'id' => $octoberBillId,
            'billing_contact_user_id' => $newResident->id,
            'billing_period' => '2026-10-01',
        ]);
        $this->assertDatabaseMissing('unit_service_bills', [
            'service_id' => $serviceId,
            'unit_id' => $vacant->id,
            'billing_period' => '2026-11-01',
        ]);

        $adminBills = $this->withHeaders($headers)->getJson('/api/v1/admin/service-bills')->assertOk()->json('data');
        $this->assertTrue(collect($adminBills)->contains(fn ($row) => (int) $row['id'] === $octoberBillId));
    }

    private function addUnitResident(int $communityId, string $name, string $unitNumber, string $phone): User
    {
        $user = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'phone' => $phone,
        ]);
        $user->profile()->updateOrCreate(['user_id' => $user->id], [
            'display_name' => $name,
            'unit_number' => $unitNumber,
            'residence_type' => 'tenant',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $user->id,
            'community_id' => $communityId,
            'role' => 'member',
            'status' => 'approved',
        ]);
        app(UnitAssignmentService::class)->syncUserToCommunity($user->fresh('profile'), $communityId);

        return $user;
    }
}
