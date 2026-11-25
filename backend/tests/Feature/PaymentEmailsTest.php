<?php

namespace Tests\Feature;

use App\Mail\HavenaTransactionalMail;
use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\Region;
use App\Models\User;
use App\Services\PaymentMailService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Resident payment emails for amenity bills: issued, proof received, confirmed, rejected. */
class PaymentEmailsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-09-01 12:00:00'));
        Storage::fake('public');
        Mail::fake();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_publishing_a_bill_emails_the_resident_an_invoice(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident, 'amenityId' => $amenityId] = $this->seedBillingCommunity();
        Sanctum::actingAs($admin);
        $this->publishBill($amenityId, $community->id);
        $billId = $this->residentBillId($resident);

        $mails = $this->mailsTo($resident->email);
        $this->assertCount(1, $mails);
        $mail = $mails[0];
        $this->assertStringStartsWith('New bill: Swimming Pool', $mail->subjectLine);
        $this->assertSame('Invoice', $mail->details[0]['label']);
        $this->assertSame('INV-AB-'.str_pad((string) $billId, 6, '0', STR_PAD_LEFT), $mail->details[0]['value']);
        $this->assertContains('Oak Valley Mail', array_column($mail->details, 'value'));
    }

    public function test_proof_received_then_confirmed_sends_one_receipt(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident, 'amenityId' => $amenityId] = $this->seedBillingCommunity();
        Sanctum::actingAs($admin);
        $this->publishBill($amenityId, $community->id);
        $billId = $this->residentBillId($resident);

        Sanctum::actingAs($resident);
        $this->submitProof($amenityId, $billId);
        $this->assertTrue(collect($this->mailsTo($resident->email))->contains(fn ($m) => str_starts_with($m->subjectLine, 'We received your payment proof')));

        Sanctum::actingAs($admin);
        $this->withHeaders($this->header($community->id))
            ->patch("/api/v1/admin/amenities/{$amenityId}/resident-bills/{$billId}/approve")
            ->assertOk();
        app(PaymentMailService::class)->amenityBill($billId, 'approved');

        $receipts = collect($this->mailsTo($resident->email))->filter(fn ($m) => str_starts_with($m->subjectLine, 'Payment confirmed'))->values();
        $this->assertCount(1, $receipts, 'A confirmed payment sends exactly one receipt, even if triggered twice.');
        $details = collect($receipts[0]->details)->pluck('value', 'label');
        $this->assertSame('RCP-AB-'.str_pad((string) $billId, 6, '0', STR_PAD_LEFT), $details['Receipt']);
        $this->assertSame('TXN-1001', $details['Reference']);
        $this->assertSame('Payment proof, verified by admin', $details['Method']);
    }

    public function test_rejection_email_includes_the_reason_and_each_rejection_is_sent(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident, 'amenityId' => $amenityId] = $this->seedBillingCommunity();
        Sanctum::actingAs($admin);
        $this->publishBill($amenityId, $community->id);
        $billId = $this->residentBillId($resident);

        foreach ([1, 2] as $round) {
            Sanctum::actingAs($resident);
            $this->submitProof($amenityId, $billId, ['payment_reference' => "TXN-R{$round}"]);
            Carbon::setTestNow(now()->addMinute());
            Sanctum::actingAs($admin);
            $this->withHeaders($this->header($community->id))
                ->patch("/api/v1/admin/amenities/{$amenityId}/resident-bills/{$billId}/reject", ['rejection_code' => 'unclear_proof'])
                ->assertOk();
            Carbon::setTestNow(now()->addMinute());
        }

        $rejections = collect($this->mailsTo($resident->email))->filter(fn ($m) => str_starts_with($m->subjectLine, 'Action needed'))->values();
        $this->assertCount(2, $rejections);
        $this->assertSame('Payment proof is unclear', collect($rejections[0]->details)->firstWhere('label', 'Reason')['value']);
    }

    public function test_mail_failure_never_breaks_the_payment_flow(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident, 'amenityId' => $amenityId] = $this->seedBillingCommunity();
        Mail::shouldReceive('to')->andThrow(new \RuntimeException('SMTP down'));

        Sanctum::actingAs($admin);
        $this->publishBill($amenityId, $community->id);
        $billId = $this->residentBillId($resident);
        Sanctum::actingAs($resident);
        $this->submitProof($amenityId, $billId);

        $this->assertDatabaseHas('amenity_resident_bills', ['id' => $billId, 'status' => 'pending_verification']);
    }

    /**
     * @return list<HavenaTransactionalMail>
     */
    private function mailsTo(string $email): array
    {
        return Mail::sent(HavenaTransactionalMail::class, fn ($mail) => $mail->hasTo($email))->values()->all();
    }

    private function residentBillId(User $resident): int
    {
        return (int) DB::table('amenity_resident_bills')->where('user_id', $resident->id)->value('id');
    }

    /**
     * @return array{community: Community, admin: User, resident: User, amenityId: int}
     */
    private function seedBillingCommunity(): array
    {
        $region = Region::query()->create(['title' => 'Mail Region', 'area' => 'Area', 'users_label' => '0 users', 'sort_order' => 1, 'status' => 'active']);
        $community = Community::query()->create(['name' => 'Oak Valley Mail', 'region_id' => $region->id, 'region' => $region->title, 'status' => 'active', 'review_status' => 'approved']);
        $admin = User::factory()->create(['role' => 'community_admin', 'community_admin_status' => 'approved', 'status' => 'active', 'phone' => '+201700000901']);
        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active', 'name' => 'Sara Khan', 'email' => 'sara.khan@example.com', 'phone' => '+201700000902']);
        CommunityMembership::query()->create(['user_id' => $admin->id, 'community_id' => $community->id, 'role' => 'admin', 'status' => 'approved']);
        CommunityMembership::query()->create(['user_id' => $resident->id, 'community_id' => $community->id, 'role' => 'member', 'status' => 'approved']);
        CommunitySubscription::query()->create([
            'community_id' => $community->id, 'plan_slug' => 'starter', 'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_ACTIVE, 'seat_limit' => 100, 'meta' => ['card_on_file' => true, 'activated_via' => 'manual'],
        ]);

        $amenityId = (int) DB::table('amenities')->insertGetId([
            'community_id' => $community->id, 'created_by' => $admin->id, 'name' => 'Swimming Pool', 'description' => 'Shared pool for residents',
            'status' => 'open', 'review_status' => 'approved', 'capacity' => 20, 'floor' => 'Ground', 'hours' => '9:00 AM - 6:00 PM',
            'start_time' => '09:00:00', 'end_time' => '18:00:00', 'weekends_available' => true,
            'shared_billing_enabled' => true, 'shared_billing_type' => 'all_residents', 'shared_billing_frequency' => 'monthly',
            'shared_billing_amount' => 25, 'shared_billing_due_day' => 10, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return compact('community', 'admin', 'resident', 'amenityId');
    }

    private function publishBill(int $amenityId, int $communityId): void
    {
        $this->post("/api/v1/admin/amenities/{$amenityId}/bills", [
            'billing_month' => '2026-09',
            'title' => 'Swimming Pool — 2026-09',
            'amount_per_resident' => 25,
            'due_date' => '2026-09-10',
            'file' => UploadedFile::fake()->image('pool-bill.jpg', 200, 200),
        ], $this->header($communityId))->assertCreated();
    }

    private function submitProof(int $amenityId, int $billId, array $overrides = []): void
    {
        $this->withHeaders(['Accept' => 'application/json'])
            ->post("/api/v1/amenities/{$amenityId}/bills/{$billId}/proof", array_merge([
                'payment_date' => now()->toDateString(),
                'payment_reference' => 'TXN-1001',
                'file' => UploadedFile::fake()->image('receipt.jpg', 240, 240),
            ], $overrides))
            ->assertOk();
    }

    /** @return array<string, string> */
    private function header(int $communityId): array
    {
        return ['X-Community-Id' => (string) $communityId, 'Accept' => 'application/json'];
    }
}
