<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\Region;
use App\Models\User;
use App\Services\AmenityBillReminderService;
use App\Services\AmenitySharedBillService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AmenitySharedBillTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-09-01 12:00:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function seedCommunity(int $phoneBase = 160): array
    {
        $region = Region::query()->create([
            'title' => 'Test Region '.$phoneBase,
            'area' => 'Test Area',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $community = Community::query()->create([
            'name' => 'Oak Valley '.$phoneBase,
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'phone' => '+201700000'.$phoneBase,
        ]);

        $resident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'phone' => '+201700000'.($phoneBase + 1),
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

        return compact('community', 'admin', 'resident');
    }

    private function createAmenity(int $communityId, int $creatorId, array $overrides = []): int
    {
        return DB::table('amenities')->insertGetId(array_merge([
            'community_id' => $communityId,
            'created_by' => $creatorId,
            'name' => 'Swimming Pool',
            'description' => 'Shared pool',
            'status' => 'open',
            'review_status' => 'approved',
            'capacity' => 20,
            'floor' => 'Ground',
            'hours' => '9:00 AM - 6:00 PM',
            'start_time' => '09:00:00',
            'end_time' => '18:00:00',
            'weekends_available' => true,
            'shared_billing_enabled' => true,
            'shared_billing_type' => 'all_residents',
            'shared_billing_frequency' => 'monthly',
            'shared_billing_amount' => 25,
            'shared_billing_due_day' => 10,
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));
    }

    private function communityHeader(int $communityId): array
    {
        return [
            'X-Community-Id' => (string) $communityId,
            'Accept' => 'application/json',
        ];
    }

    public function test_admin_publishes_monthly_bill_for_eligible_residents(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $deleted = User::factory()->create(['role' => 'resident', 'status' => 'deleted', 'phone' => '+201700000162']);
        $pending = User::factory()->create(['role' => 'resident', 'status' => 'active', 'phone' => '+201700000163']);
        CommunityMembership::query()->create([
            'user_id' => $deleted->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $pending->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'pending',
        ]);

        $amenityId = $this->createAmenity($community->id, $admin->id);
        Sanctum::actingAs($admin);

        $response = $this->withHeaders($this->communityHeader($community->id))
            ->post("/api/v1/admin/amenities/{$amenityId}/bills", [
                'billing_month' => '2026-09',
                'title' => 'Swimming Pool — September 2026',
                'amount_per_resident' => 25,
                'due_date' => '2026-09-10',
                'description' => 'Pool maintenance',
                'file' => UploadedFile::fake()->image('pool-bill.jpg', 400, 400),
            ])->assertCreated();

        $response
            ->assertJsonPath('data.billing_month', '2026-09')
            ->assertJsonPath('data.billing_month_label', 'September 2026')
            ->assertJsonPath('data.amount_per_resident', 25)
            ->assertJsonPath('data.due_date', '2026-09-10')
            ->assertJsonPath('data.resident_count', 1)
            ->assertJsonPath('data.unpaid_count', 1)
            ->assertJsonPath('data.total_residents_billed', 1)
            ->assertJsonPath('data.total_amount_expected', 25)
            ->assertJsonPath('data.total_amount_paid', 0)
            ->assertJsonPath('data.outstanding_amount', 25)
            ->assertJsonPath('data.community_id', $community->id);

        $this->assertNotEmpty($response->json('data.file_url'));
        $this->assertDatabaseHas('amenity_monthly_bills', [
            'amenity_id' => $amenityId,
            'community_id' => $community->id,
            'title' => 'Swimming Pool — September 2026',
            'status' => AmenitySharedBillService::STATUS_PUBLISHED,
        ]);
        $this->assertDatabaseHas('amenity_resident_bills', [
            'amenity_id' => $amenityId,
            'user_id' => $resident->id,
            'amount' => 25.00,
            'status' => AmenitySharedBillService::RESIDENT_STATUS_UNPAID,
        ]);
        $this->assertDatabaseMissing('amenity_resident_bills', ['user_id' => $deleted->id]);
        $this->assertDatabaseMissing('amenity_resident_bills', ['user_id' => $pending->id]);
        $this->assertDatabaseMissing('amenity_resident_bills', ['user_id' => $admin->id]);
    }

    public function test_duplicate_monthly_bill_is_rejected(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id);
        Sanctum::actingAs($admin);

        $payload = [
            'billing_month' => '2026-09',
            'title' => 'Swimming Pool — September 2026',
            'amount_per_resident' => 25,
            'due_date' => '2026-09-10',
            'file' => UploadedFile::fake()->image('bill-1.jpg', 200, 200),
        ];

        $this->post("/api/v1/admin/amenities/{$amenityId}/bills", $payload, $this->communityHeader($community->id))
            ->assertCreated();

        $this->post("/api/v1/admin/amenities/{$amenityId}/bills", [
            ...$payload,
            'file' => UploadedFile::fake()->image('bill-2.jpg', 200, 200),
        ], $this->communityHeader($community->id))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['billing_month']);

        $this->assertSame(1, DB::table('amenity_monthly_bills')->where('amenity_id', $amenityId)->count());
    }

    public function test_cannot_publish_when_shared_billing_is_off(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id, [
            'shared_billing_enabled' => false,
            'shared_billing_amount' => null,
            'shared_billing_due_day' => null,
        ]);
        Sanctum::actingAs($admin);

        $this->post("/api/v1/admin/amenities/{$amenityId}/bills", [
            'billing_month' => '2026-09',
            'title' => 'Gym — September 2026',
            'amount_per_resident' => 25,
            'due_date' => '2026-09-10',
            'file' => UploadedFile::fake()->image('bill.jpg', 200, 200),
        ], $this->communityHeader($community->id))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['amenity']);
    }

    public function test_resident_can_view_unpaid_bill_and_cannot_create(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id);
        Sanctum::actingAs($admin);

        $this->post("/api/v1/admin/amenities/{$amenityId}/bills", [
            'billing_month' => '2026-09',
            'title' => 'Swimming Pool — September 2026',
            'amount_per_resident' => 25,
            'due_date' => '2026-09-10',
            'file' => UploadedFile::fake()->create('pool-bill.pdf', 120, 'application/pdf'),
        ], $this->communityHeader($community->id))->assertCreated();

        Sanctum::actingAs($resident);

        $this->getJson("/api/v1/amenities/{$amenityId}/bills")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.amenity_name', 'Swimming Pool')
            ->assertJsonPath('data.0.billing_month', '2026-09')
            ->assertJsonPath('data.0.amount', 25)
            ->assertJsonPath('data.0.due_date', '2026-09-10')
            ->assertJsonPath('data.0.status', 'unpaid')
            ->assertJsonPath('data.0.status_label', 'Unpaid');

        $this->assertNotEmpty($this->getJson("/api/v1/amenities/{$amenityId}/bills")->json('data.0.file_url'));

        $this->post("/api/v1/admin/amenities/{$amenityId}/bills", [
            'billing_month' => '2026-10',
            'title' => 'Should fail',
            'amount_per_resident' => 25,
            'due_date' => '2026-10-10',
            'file' => UploadedFile::fake()->image('nope.jpg', 100, 100),
        ], $this->communityHeader($community->id))->assertForbidden();
    }

    public function test_same_month_is_allowed_on_a_different_amenity(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();
        $poolId = $this->createAmenity($community->id, $admin->id);
        $gymId = $this->createAmenity($community->id, $admin->id, ['name' => 'Gym']);
        Sanctum::actingAs($admin);

        foreach ([$poolId, $gymId] as $amenityId) {
            $this->post("/api/v1/admin/amenities/{$amenityId}/bills", [
                'billing_month' => '2026-09',
                'title' => 'September 2026',
                'amount_per_resident' => 25,
                'due_date' => '2026-09-10',
                'file' => UploadedFile::fake()->image("bill-{$amenityId}.jpg", 200, 200),
            ], $this->communityHeader($community->id))->assertCreated();
        }

        $this->assertSame(2, DB::table('amenity_monthly_bills')->count());
    }

    private function publishBill(
        int $amenityId,
        int $communityId,
        string $month = '2026-09',
        string $dueDate = '2026-09-10',
    ): int {
        $this->post("/api/v1/admin/amenities/{$amenityId}/bills", [
            'billing_month' => $month,
            'title' => "Swimming Pool — {$month}",
            'amount_per_resident' => 25,
            'due_date' => $dueDate,
            'file' => UploadedFile::fake()->image('pool-bill.jpg', 200, 200),
        ], $this->communityHeader($communityId))->assertCreated();

        return (int) DB::table('amenity_monthly_bills')
            ->where('amenity_id', $amenityId)
            ->where('billing_month', Carbon::createFromFormat('Y-m', $month)->startOfMonth()->toDateString())
            ->value('id');
    }

    public function test_resident_can_submit_payment_proof_and_status_becomes_pending(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id);
        Sanctum::actingAs($admin);
        $this->publishBill($amenityId, $community->id);

        $residentBillId = (int) DB::table('amenity_resident_bills')
            ->where('amenity_id', $amenityId)
            ->where('user_id', $resident->id)
            ->value('id');

        Sanctum::actingAs($resident);

        $this->withHeaders(['Accept' => 'application/json'])
            ->post("/api/v1/amenities/{$amenityId}/bills/{$residentBillId}/proof", [
                'payment_date' => now()->toDateString(),
                'payment_reference' => 'TXN-9911',
                'payment_note' => 'Paid at the lobby desk',
                'file' => UploadedFile::fake()->image('receipt.jpg', 300, 300),
            ])
            ->assertOk()
            ->assertJsonPath('data.status', AmenitySharedBillService::RESIDENT_STATUS_PENDING)
            ->assertJsonPath('data.status_label', 'Pending Verification')
            ->assertJsonPath('data.can_submit_proof', false)
            ->assertJsonPath('data.payment_proof.payment_date', now()->toDateString())
            ->assertJsonPath('data.payment_proof.payment_reference', 'TXN-9911')
            ->assertJsonPath('message', AmenitySharedBillService::PROOF_SUBMITTED_MESSAGE);

        $this->assertNotEmpty(
            $this->getJson("/api/v1/amenities/{$amenityId}/bills")->json('data.0.payment_proof.file_url')
        );

        $this->assertDatabaseHas('amenity_resident_bills', [
            'id' => $residentBillId,
            'user_id' => $resident->id,
            'status' => AmenitySharedBillService::RESIDENT_STATUS_PENDING,
            'payment_reference' => 'TXN-9911',
        ]);
    }

    public function test_duplicate_payment_proof_is_rejected(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id);
        Sanctum::actingAs($admin);
        $this->publishBill($amenityId, $community->id);
        $residentBillId = (int) DB::table('amenity_resident_bills')
            ->where('user_id', $resident->id)
            ->value('id');

        Sanctum::actingAs($resident);
        $this->withHeaders(['Accept' => 'application/json'])
            ->post("/api/v1/amenities/{$amenityId}/bills/{$residentBillId}/proof", [
                'payment_date' => now()->toDateString(),
                'file' => UploadedFile::fake()->image('receipt-1.jpg', 200, 200),
            ])->assertOk();

        $this->withHeaders(['Accept' => 'application/json'])
            ->post("/api/v1/amenities/{$amenityId}/bills/{$residentBillId}/proof", [
                'payment_date' => now()->toDateString(),
                'file' => UploadedFile::fake()->image('receipt-2.jpg', 200, 200),
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['file']);

        $this->assertSame(
            AmenitySharedBillService::RESIDENT_STATUS_PENDING,
            DB::table('amenity_resident_bills')->where('id', $residentBillId)->value('status')
        );
    }

    public function test_resident_cannot_submit_proof_for_another_residents_bill(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $other = User::factory()->create(['role' => 'resident', 'status' => 'active', 'phone' => '+201700000164']);
        CommunityMembership::query()->create([
            'user_id' => $other->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        $amenityId = $this->createAmenity($community->id, $admin->id);
        Sanctum::actingAs($admin);
        $this->publishBill($amenityId, $community->id);
        $ownerBillId = (int) DB::table('amenity_resident_bills')
            ->where('user_id', $resident->id)
            ->value('id');

        Sanctum::actingAs($other);
        $this->withHeaders(['Accept' => 'application/json'])
            ->post("/api/v1/amenities/{$amenityId}/bills/{$ownerBillId}/proof", [
                'payment_date' => now()->toDateString(),
                'file' => UploadedFile::fake()->image('stolen.jpg', 200, 200),
            ])->assertNotFound();

        $this->assertSame(
            AmenitySharedBillService::RESIDENT_STATUS_UNPAID,
            DB::table('amenity_resident_bills')->where('id', $ownerBillId)->value('status')
        );
    }

    public function test_proof_requires_file_and_payment_date(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id);
        Sanctum::actingAs($admin);
        $this->publishBill($amenityId, $community->id);
        $residentBillId = (int) DB::table('amenity_resident_bills')
            ->where('user_id', $resident->id)
            ->value('id');

        Sanctum::actingAs($resident);
        $this->withHeaders(['Accept' => 'application/json'])
            ->post("/api/v1/amenities/{$amenityId}/bills/{$residentBillId}/proof", [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['file', 'payment_date']);
    }

    public function test_cannot_submit_proof_for_paid_or_inactive_bill(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id);
        Sanctum::actingAs($admin);
        $monthlyId = $this->publishBill($amenityId, $community->id);
        $residentBillId = (int) DB::table('amenity_resident_bills')
            ->where('user_id', $resident->id)
            ->value('id');

        DB::table('amenity_resident_bills')->where('id', $residentBillId)->update([
            'status' => AmenitySharedBillService::RESIDENT_STATUS_PAID,
        ]);

        Sanctum::actingAs($resident);
        $this->withHeaders(['Accept' => 'application/json'])
            ->post("/api/v1/amenities/{$amenityId}/bills/{$residentBillId}/proof", [
                'payment_date' => now()->toDateString(),
                'file' => UploadedFile::fake()->image('paid.jpg', 200, 200),
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['file']);

        DB::table('amenity_resident_bills')->where('id', $residentBillId)->update([
            'status' => AmenitySharedBillService::RESIDENT_STATUS_UNPAID,
        ]);
        DB::table('amenity_monthly_bills')->where('id', $monthlyId)->update([
            'status' => 'draft',
        ]);

        $this->withHeaders(['Accept' => 'application/json'])
            ->post("/api/v1/amenities/{$amenityId}/bills/{$residentBillId}/proof", [
                'payment_date' => now()->toDateString(),
                'file' => UploadedFile::fake()->image('inactive.jpg', 200, 200),
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['file']);
    }

    private function submitProof(int $amenityId, int $residentBillId, array $overrides = []): void
    {
        $this->withHeaders(['Accept' => 'application/json'])
            ->post("/api/v1/amenities/{$amenityId}/bills/{$residentBillId}/proof", array_merge([
                'payment_date' => now()->toDateString(),
                'payment_reference' => 'TXN-1001',
                'payment_note' => 'Paid at the lobby',
                'file' => UploadedFile::fake()->image('receipt.jpg', 240, 240),
            ], $overrides))
            ->assertOk();
    }

    public function test_admin_can_list_and_approve_pending_payment(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        \App\Models\Profile::query()->create([
            'user_id' => $resident->id,
            'display_name' => $resident->name,
            'unit_number' => '12B',
        ]);
        $amenityId = $this->createAmenity($community->id, $admin->id);
        Sanctum::actingAs($admin);
        $monthlyId = $this->publishBill($amenityId, $community->id);
        $residentBillId = (int) DB::table('amenity_resident_bills')
            ->where('user_id', $resident->id)
            ->value('id');

        Sanctum::actingAs($resident);
        $this->submitProof($amenityId, $residentBillId);

        Sanctum::actingAs($admin);
        $this->getJson("/api/v1/admin/amenities/{$amenityId}/bills/{$monthlyId}/residents", $this->communityHeader($community->id))
            ->assertOk()
            ->assertJsonPath('data.0.resident_name', $resident->name)
            ->assertJsonPath('data.0.unit_number', '12B')
            ->assertJsonPath('data.0.amenity_name', 'Swimming Pool')
            ->assertJsonPath('data.0.billing_month', '2026-09')
            ->assertJsonPath('data.0.amount', 25)
            ->assertJsonPath('data.0.status', AmenitySharedBillService::RESIDENT_STATUS_PENDING)
            ->assertJsonPath('data.0.status_label', 'Pending Verification')
            ->assertJsonPath('data.0.can_review', true)
            ->assertJsonPath('data.0.due_date', '2026-09-10')
            ->assertJsonPath('data.0.payment_proof.payment_reference', 'TXN-1001');

        $this->withHeaders($this->communityHeader($community->id))
            ->patch("/api/v1/admin/amenities/{$amenityId}/resident-bills/{$residentBillId}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', AmenitySharedBillService::RESIDENT_STATUS_PAID)
            ->assertJsonPath('data.status_label', 'Paid')
            ->assertJsonPath('data.approved_by', $admin->id)
            ->assertJsonPath('data.can_review', false)
            ->assertJsonPath('data.payment_proof.payment_reference', 'TXN-1001')
            ->assertJsonPath('data.payment_acknowledgement.status', AmenitySharedBillService::RESIDENT_STATUS_PAID)
            ->assertJsonPath('data.payment_acknowledgement.amenity_name', 'Swimming Pool')
            ->assertJsonPath('data.payment_acknowledgement.billing_month_label', 'September 2026')
            ->assertJsonPath('data.payment_acknowledgement.amount', 25)
            ->assertJsonPath('data.payment_acknowledgement.payment_reference', 'TXN-1001')
            ->assertJsonPath(
                'data.payment_acknowledgement.message',
                'Payment received. Your Swimming Pool bill for September 2026 has been acknowledged.'
            )
            ->assertJsonPath('message', AmenitySharedBillService::APPROVED_MESSAGE);

        $this->assertDatabaseHas('amenity_resident_bills', [
            'id' => $residentBillId,
            'status' => AmenitySharedBillService::RESIDENT_STATUS_PAID,
            'approved_by' => $admin->id,
            'payment_reference' => 'TXN-1001',
        ]);
        $this->assertNotNull(DB::table('amenity_resident_bills')->where('id', $residentBillId)->value('approved_at'));
        $this->assertDatabaseHas('amenity_resident_bill_reviews', [
            'resident_bill_id' => $residentBillId,
            'action' => AmenitySharedBillService::ACTION_APPROVED,
            'actor_id' => $admin->id,
            'status_from' => AmenitySharedBillService::RESIDENT_STATUS_PENDING,
            'status_to' => AmenitySharedBillService::RESIDENT_STATUS_PAID,
        ]);

        Sanctum::actingAs($resident);
        $this->getJson("/api/v1/amenities/{$amenityId}/bills")
            ->assertOk()
            ->assertJsonPath('data.0.status', AmenitySharedBillService::RESIDENT_STATUS_PAID)
            ->assertJsonPath('data.0.status_label', 'Paid')
            ->assertJsonPath('data.0.can_submit_proof', false)
            ->assertJsonPath(
                'data.0.payment_acknowledgement.message',
                'Payment received. Your Swimming Pool bill for September 2026 has been acknowledged.'
            )
            ->assertJsonPath('data.0.payment_acknowledgement.status_label', 'Paid');

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $resident->id,
            'title' => 'Payment received',
            'body' => 'Payment received. Your Swimming Pool bill for September 2026 has been acknowledged.',
        ]);
    }

    public function test_admin_can_reject_and_resident_can_resubmit(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id);
        Sanctum::actingAs($admin);
        $this->publishBill($amenityId, $community->id);
        $residentBillId = (int) DB::table('amenity_resident_bills')
            ->where('user_id', $resident->id)
            ->value('id');

        Sanctum::actingAs($resident);
        $this->submitProof($amenityId, $residentBillId, ['payment_reference' => 'OLD-REF']);

        Sanctum::actingAs($admin);
        $this->withHeaders($this->communityHeader($community->id))
            ->patch("/api/v1/admin/amenities/{$amenityId}/resident-bills/{$residentBillId}/reject", [
                'rejection_code' => 'unclear_proof',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', AmenitySharedBillService::RESIDENT_STATUS_REJECTED)
            ->assertJsonPath('data.status_label', 'Rejected')
            ->assertJsonPath('data.rejection_reason', 'Payment proof is unclear')
            ->assertJsonPath('data.rejected_by', $admin->id);

        $this->assertDatabaseHas('amenity_resident_bills', [
            'id' => $residentBillId,
            'status' => AmenitySharedBillService::RESIDENT_STATUS_REJECTED,
            'rejected_by' => $admin->id,
            'rejection_reason' => 'Payment proof is unclear',
        ]);
        $this->assertDatabaseHas('amenity_resident_bill_reviews', [
            'resident_bill_id' => $residentBillId,
            'action' => AmenitySharedBillService::ACTION_REJECTED,
            'rejection_reason' => 'Payment proof is unclear',
        ]);

        Sanctum::actingAs($resident);
        $this->getJson("/api/v1/amenities/{$amenityId}/bills")
            ->assertOk()
            ->assertJsonPath('data.0.status', AmenitySharedBillService::RESIDENT_STATUS_REJECTED)
            ->assertJsonPath('data.0.rejection_reason', 'Payment proof is unclear')
            ->assertJsonPath('data.0.can_submit_proof', true);

        $this->submitProof($amenityId, $residentBillId, [
            'payment_reference' => 'NEW-REF',
            'file' => UploadedFile::fake()->image('receipt-2.jpg', 220, 220),
        ]);

        $this->getJson("/api/v1/amenities/{$amenityId}/bills")
            ->assertOk()
            ->assertJsonPath('data.0.status', AmenitySharedBillService::RESIDENT_STATUS_PENDING)
            ->assertJsonPath('data.0.can_submit_proof', false)
            ->assertJsonPath('data.0.payment_proof.payment_reference', 'NEW-REF')
            ->assertJsonPath('data.0.rejection_reason', null);

        $this->assertSame(2, DB::table('amenity_resident_bill_reviews')
            ->where('resident_bill_id', $residentBillId)
            ->where('action', AmenitySharedBillService::ACTION_SUBMITTED)
            ->count());
        $this->assertDatabaseHas('amenity_resident_bills', [
            'id' => $residentBillId,
            'status' => AmenitySharedBillService::RESIDENT_STATUS_PENDING,
            'payment_reference' => 'NEW-REF',
            'rejected_by' => null,
            'rejection_reason' => null,
        ]);
    }

    public function test_other_community_admin_and_resident_cannot_review_payment(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $other = $this->seedCommunity(280);
        $amenityId = $this->createAmenity($community->id, $admin->id);
        Sanctum::actingAs($admin);
        $this->publishBill($amenityId, $community->id);
        $residentBillId = (int) DB::table('amenity_resident_bills')
            ->where('user_id', $resident->id)
            ->value('id');

        Sanctum::actingAs($resident);
        $this->submitProof($amenityId, $residentBillId);

        Sanctum::actingAs($other['admin']);
        $this->withHeaders($this->communityHeader($other['community']->id))
            ->patch("/api/v1/admin/amenities/{$amenityId}/resident-bills/{$residentBillId}/approve")
            ->assertNotFound();
        $this->withHeaders($this->communityHeader($community->id))
            ->patch("/api/v1/admin/amenities/{$amenityId}/resident-bills/{$residentBillId}/reject", [
                'rejection_code' => 'invalid_receipt',
            ])
            ->assertNotFound();

        Sanctum::actingAs($resident);
        $this->withHeaders($this->communityHeader($community->id))
            ->patch("/api/v1/admin/amenities/{$amenityId}/resident-bills/{$residentBillId}/approve")
            ->assertForbidden();

        $this->assertSame(
            AmenitySharedBillService::RESIDENT_STATUS_PENDING,
            DB::table('amenity_resident_bills')->where('id', $residentBillId)->value('status')
        );
    }

    public function test_cannot_approve_or_reject_unless_pending(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id);
        Sanctum::actingAs($admin);
        $this->publishBill($amenityId, $community->id);
        $residentBillId = (int) DB::table('amenity_resident_bills')
            ->where('user_id', $resident->id)
            ->value('id');

        $this->withHeaders($this->communityHeader($community->id))
            ->patch("/api/v1/admin/amenities/{$amenityId}/resident-bills/{$residentBillId}/approve")
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['status']);

        Sanctum::actingAs($resident);
        $this->submitProof($amenityId, $residentBillId);

        Sanctum::actingAs($admin);
        $this->withHeaders($this->communityHeader($community->id))
            ->patch("/api/v1/admin/amenities/{$amenityId}/resident-bills/{$residentBillId}/reject", [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['rejection_code']);

        $this->withHeaders($this->communityHeader($community->id))
            ->patch("/api/v1/admin/amenities/{$amenityId}/resident-bills/{$residentBillId}/reject", [
                'rejection_code' => 'other',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['rejection_reason']);
    }

    public function test_unpaid_and_rejected_become_overdue_but_pending_does_not(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $other = User::factory()->create(['role' => 'resident', 'status' => 'active', 'phone' => '+201700000190']);
        CommunityMembership::query()->create([
            'user_id' => $other->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        $amenityId = $this->createAmenity($community->id, $admin->id);
        Sanctum::actingAs($admin);
        $this->publishBill($amenityId, $community->id);
        $pendingBillId = (int) DB::table('amenity_resident_bills')->where('user_id', $resident->id)->value('id');
        $unpaidBillId = (int) DB::table('amenity_resident_bills')->where('user_id', $other->id)->value('id');

        Sanctum::actingAs($resident);
        $this->submitProof($amenityId, $pendingBillId);

        Carbon::setTestNow(Carbon::parse('2026-09-11 12:00:00'));
        $this->artisan('amenity-bills:process-reminders')->assertSuccessful();

        $this->assertSame(
            AmenitySharedBillService::RESIDENT_STATUS_PENDING,
            DB::table('amenity_resident_bills')->where('id', $pendingBillId)->value('status')
        );
        $this->assertSame(
            AmenitySharedBillService::RESIDENT_STATUS_OVERDUE,
            DB::table('amenity_resident_bills')->where('id', $unpaidBillId)->value('status')
        );

        Sanctum::actingAs($other);
        $this->getJson("/api/v1/amenities/{$amenityId}/bills")
            ->assertOk()
            ->assertJsonPath('data.0.status', AmenitySharedBillService::RESIDENT_STATUS_OVERDUE)
            ->assertJsonPath('data.0.status_label', 'Overdue')
            ->assertJsonPath('data.0.can_submit_proof', true);
    }

    public function test_bill_reminders_are_sent_once_at_each_stage(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id);
        Sanctum::actingAs($admin);
        $this->publishBill($amenityId, $community->id);
        $residentBillId = (int) DB::table('amenity_resident_bills')->where('user_id', $resident->id)->value('id');

        $this->assertDatabaseHas('amenity_resident_bill_notifications', [
            'resident_bill_id' => $residentBillId,
            'kind' => AmenityBillReminderService::KIND_CREATED,
        ]);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $resident->id,
            'body' => 'Your Swimming Pool bill for September 2026 is available.',
        ]);

        Carbon::setTestNow(Carbon::parse('2026-09-07 12:00:00'));
        app(AmenityBillReminderService::class)->processReminders();
        app(AmenityBillReminderService::class)->processReminders();
        $this->assertSame(1, DB::table('amenity_resident_bill_notifications')
            ->where('resident_bill_id', $residentBillId)
            ->where('kind', AmenityBillReminderService::KIND_DUE_SOON)
            ->count());

        Carbon::setTestNow(Carbon::parse('2026-09-10 12:00:00'));
        app(AmenityBillReminderService::class)->processReminders();
        $this->assertSame(1, DB::table('amenity_resident_bill_notifications')
            ->where('resident_bill_id', $residentBillId)
            ->where('kind', AmenityBillReminderService::KIND_DUE_DATE)
            ->count());

        Carbon::setTestNow(Carbon::parse('2026-09-11 12:00:00'));
        app(AmenityBillReminderService::class)->processReminders();
        $this->assertSame(1, DB::table('amenity_resident_bill_notifications')
            ->where('resident_bill_id', $residentBillId)
            ->where('kind', AmenityBillReminderService::KIND_OVERDUE)
            ->count());
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $resident->id,
            'body' => 'Your Swimming Pool bill is overdue. Please submit your payment proof.',
        ]);
    }

    public function test_next_month_unpaid_restricts_amenity_booking_until_paid(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $amenityId = $this->createAmenity($community->id, $admin->id);
        Sanctum::actingAs($admin);
        $this->publishBill($amenityId, $community->id);
        $septemberBillId = (int) DB::table('amenity_resident_bills')->where('user_id', $resident->id)->value('id');

        Carbon::setTestNow(Carbon::parse('2026-10-01 12:00:00'));
        $this->artisan('amenity-bills:process-reminders')->assertSuccessful();
        $this->publishBill($amenityId, $community->id, '2026-10', '2026-10-10');

        $this->assertSame(
            AmenitySharedBillService::RESIDENT_STATUS_OVERDUE,
            DB::table('amenity_resident_bills')->where('id', $septemberBillId)->value('status')
        );
        $this->assertDatabaseHas('amenity_resident_bill_notifications', [
            'resident_bill_id' => $septemberBillId,
            'kind' => AmenityBillReminderService::KIND_NEXT_CYCLE,
        ]);

        Sanctum::actingAs($resident);
        $this->getJson("/api/v1/amenities/{$amenityId}/bills")
            ->assertOk()
            ->assertJsonPath('data.0.has_overdue_shared_amenity_bill', true)
            ->assertJsonPath('data.0.has_outstanding_previous_bill', true)
            ->assertJsonPath('data.0.outstanding_previous_bill.billing_month', '2026-09');

        $this->getJson('/api/v1/amenities')
            ->assertOk()
            ->assertJsonPath('data.0.has_overdue_shared_amenity_bill', true);

        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => '2026-10-05',
            'guests' => 1,
        ])
            ->assertUnprocessable()
            ->assertJsonPath('error', AmenityBillReminderService::BOOKING_RESTRICTED_ERROR);

        $this->submitProof($amenityId, $septemberBillId);
        $this->assertSame(
            AmenitySharedBillService::RESIDENT_STATUS_PENDING,
            DB::table('amenity_resident_bills')->where('id', $septemberBillId)->value('status')
        );

        Sanctum::actingAs($admin);
        $this->withHeaders($this->communityHeader($community->id))
            ->patch("/api/v1/admin/amenities/{$amenityId}/resident-bills/{$septemberBillId}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', AmenitySharedBillService::RESIDENT_STATUS_PAID);

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/amenities')
            ->assertOk()
            ->assertJsonPath('data.0.has_overdue_shared_amenity_bill', false);

        $this->postJson('/api/v1/bookings', [
            'amenity_id' => $amenityId,
            'date' => '2026-10-05',
            'guests' => 1,
        ])->assertCreated();
    }

    public function test_admin_summary_and_status_filter_use_actual_resident_bills(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $other = User::factory()->create(['role' => 'resident', 'status' => 'active', 'phone' => '+201700000191']);
        CommunityMembership::query()->create([
            'user_id' => $other->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        $amenityId = $this->createAmenity($community->id, $admin->id);
        Sanctum::actingAs($admin);
        $monthlyId = $this->publishBill($amenityId, $community->id);
        $residentBillId = (int) DB::table('amenity_resident_bills')
            ->where('user_id', $resident->id)
            ->value('id');

        Sanctum::actingAs($resident);
        $this->submitProof($amenityId, $residentBillId);

        Sanctum::actingAs($admin);
        $this->withHeaders($this->communityHeader($community->id))
            ->patch("/api/v1/admin/amenities/{$amenityId}/resident-bills/{$residentBillId}/approve")
            ->assertOk();

        $this->getJson("/api/v1/admin/amenities/{$amenityId}/bills", $this->communityHeader($community->id))
            ->assertOk()
            ->assertJsonPath('data.0.total_residents_billed', 2)
            ->assertJsonPath('data.0.paid_count', 1)
            ->assertJsonPath('data.0.unpaid_count', 1)
            ->assertJsonPath('data.0.pending_count', 0)
            ->assertJsonPath('data.0.rejected_count', 0)
            ->assertJsonPath('data.0.overdue_count', 0)
            ->assertJsonPath('data.0.total_amount_expected', 50)
            ->assertJsonPath('data.0.total_amount_paid', 25)
            ->assertJsonPath('data.0.outstanding_amount', 25);

        $this->getJson(
            "/api/v1/admin/amenities/{$amenityId}/bills/{$monthlyId}/residents?status=paid",
            $this->communityHeader($community->id)
        )
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.user_id', $resident->id)
            ->assertJsonPath('data.0.status', AmenitySharedBillService::RESIDENT_STATUS_PAID);

        $this->getJson(
            "/api/v1/admin/amenities/{$amenityId}/bills/{$monthlyId}/residents?status=unpaid",
            $this->communityHeader($community->id)
        )
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.user_id', $other->id)
            ->assertJsonPath('data.0.status', AmenitySharedBillService::RESIDENT_STATUS_UNPAID);
    }

    public function test_admin_can_view_payment_review_history_and_residents_only_see_own_bills(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();
        $other = User::factory()->create(['role' => 'resident', 'status' => 'active', 'phone' => '+201700000192']);
        CommunityMembership::query()->create([
            'user_id' => $other->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        $amenityId = $this->createAmenity($community->id, $admin->id);
        Sanctum::actingAs($admin);
        $this->publishBill($amenityId, $community->id);
        $residentBillId = (int) DB::table('amenity_resident_bills')
            ->where('user_id', $resident->id)
            ->value('id');
        $otherBillId = (int) DB::table('amenity_resident_bills')
            ->where('user_id', $other->id)
            ->value('id');

        Sanctum::actingAs($resident);
        $this->submitProof($amenityId, $residentBillId, ['payment_reference' => 'FIRST-REF']);

        Sanctum::actingAs($admin);
        $this->withHeaders($this->communityHeader($community->id))
            ->patch("/api/v1/admin/amenities/{$amenityId}/resident-bills/{$residentBillId}/reject", [
                'rejection_code' => 'unclear_proof',
            ])
            ->assertOk();

        Sanctum::actingAs($resident);
        $this->submitProof($amenityId, $residentBillId, ['payment_reference' => 'SECOND-REF']);

        Sanctum::actingAs($admin);
        $this->withHeaders($this->communityHeader($community->id))
            ->patch("/api/v1/admin/amenities/{$amenityId}/resident-bills/{$residentBillId}/approve")
            ->assertOk();

        $this->getJson(
            "/api/v1/admin/amenities/{$amenityId}/resident-bills/{$residentBillId}/reviews",
            $this->communityHeader($community->id)
        )
            ->assertOk()
            ->assertJsonCount(4, 'data')
            ->assertJsonPath('data.0.action', AmenitySharedBillService::ACTION_SUBMITTED)
            ->assertJsonPath('data.0.proof.payment_reference', 'FIRST-REF')
            ->assertJsonPath('data.1.action', AmenitySharedBillService::ACTION_REJECTED)
            ->assertJsonPath('data.1.actor_id', $admin->id)
            ->assertJsonPath('data.1.rejection_reason', 'Payment proof is unclear')
            ->assertJsonPath('data.2.action', AmenitySharedBillService::ACTION_SUBMITTED)
            ->assertJsonPath('data.2.proof.payment_reference', 'SECOND-REF')
            ->assertJsonPath('data.3.action', AmenitySharedBillService::ACTION_APPROVED)
            ->assertJsonPath('data.3.actor_id', $admin->id)
            ->assertJsonPath('data.3.status_to', AmenitySharedBillService::RESIDENT_STATUS_PAID);

        Sanctum::actingAs($resident);
        $own = $this->getJson("/api/v1/amenities/{$amenityId}/bills")->assertOk();
        $this->assertSame([$residentBillId], array_column($own->json('data'), 'resident_bill_id'));

        Sanctum::actingAs($other);
        $otherHistory = $this->getJson("/api/v1/amenities/{$amenityId}/bills")->assertOk();
        $this->assertSame([$otherBillId], array_column($otherHistory->json('data'), 'resident_bill_id'));
        $this->assertNull($otherHistory->json('data.0.payment_acknowledgement'));
    }
}
