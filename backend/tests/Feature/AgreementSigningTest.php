<?php

namespace Tests\Feature;

use App\Mail\HavenaTransactionalMail;
use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use App\Support\AppUrls;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AgreementSigningTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['billing.enabled' => false, 'billing.enforce' => false]);
    }

    public function test_admin_can_publish_and_resident_can_sign_once(): void
    {
        Storage::fake('public');
        Storage::fake('local');
        ['admin' => $admin, 'resident' => $resident, 'otherResident' => $other] = $this->seedCommunity();

        Sanctum::actingAs($admin);
        $draft = $this->post('/api/v1/admin/documents/agreements', [
            'title' => 'Community Rules Agreement',
            'category' => 'Rules & Policies',
            'description' => 'House rules',
            'due_at' => now()->addDays(10)->toDateString(),
            'file' => $this->pdfFile('Residents agree to the community rules.'),
        ], ['Accept' => 'application/json'])->assertCreated();

        $id = $draft->json('data.id');
        $this->assertSame('draft', $draft->json('data.publication_status'));
        $this->assertSame(1, $draft->json('data.version'));

        $published = $this->postJson("/api/v1/admin/documents/agreements/{$id}/publish", [
            'scope' => 'all',
            'notify' => true,
        ])->assertOk();
        $this->assertSame(1, $published->json('assigned'));
        $this->assertSame('published', $published->json('data.publication_status'));

        $this->postJson("/api/v1/admin/documents/agreements/{$id}/publish", [
            'scope' => 'all',
        ])->assertOk()->assertJsonPath('already_published', true)->assertJsonPath('assigned', 0);
        $this->assertSame(1, DB::table('community_document_assignments')->where('document_id', $id)->count());

        Sanctum::actingAs($other);
        $this->getJson('/api/v1/documents')->assertOk()->assertJsonMissing(['id' => $id]);
        $this->getJson("/api/v1/documents/{$id}")->assertNotFound();

        Sanctum::actingAs($resident);
        $list = $this->getJson('/api/v1/documents')->assertOk();
        $this->assertSame($id, $list->json('data.0.id'));
        $this->assertSame('pending', $list->json('data.0.signature_status'));

        $detail = $this->getJson("/api/v1/documents/{$id}")->assertOk();
        $assignmentId = $detail->json('data.assignments.0.assignment_id');
        $this->assertTrue($detail->json('data.assignments.0.can_sign'));

        $this->postJson("/api/v1/documents/{$id}/sign", [
            'version' => 1,
            'assignment_id' => $assignmentId,
            'method' => 'type',
            'typed_name' => $resident->name,
            'consent' => false,
        ])->assertStatus(422);

        $signed = $this->postJson("/api/v1/documents/{$id}/sign", [
            'version' => 1,
            'assignment_id' => $assignmentId,
            'method' => 'type',
            'typed_name' => $resident->name,
            'consent' => true,
        ])->assertCreated();

        $this->assertNotEmpty($signed->json('data.signature.checksum'));
        $this->assertNotEmpty($signed->json('data.signed_file_url'));
        $this->assertSame(1, DB::table('community_document_signatures')->count());

        $again = $this->postJson("/api/v1/documents/{$id}/sign", [
            'version' => 1,
            'assignment_id' => $assignmentId,
            'method' => 'type',
            'typed_name' => $resident->name,
            'consent' => true,
        ])->assertOk();
        $this->assertTrue($again->json('data.replayed'));
        $this->assertSame($signed->json('data.signature.checksum'), $again->json('data.signature.checksum'));
        $this->assertSame(1, DB::table('community_document_signatures')->count());

        $url = parse_url($signed->json('data.signed_file_url'));
        $download = $this->get($url['path'].'?'.$url['query']);
        $download->assertOk();
        $bytes = $download->streamedContent();
        $this->assertStringStartsWith('%PDF', $bytes);
        $this->assertStringContainsString('Residents agree to the community rules.', $bytes);
        $this->assertStringContainsString($resident->name, $bytes);

        Sanctum::actingAs($other);
        $this->getJson("/api/v1/documents/{$id}/signed-link?assignment_id={$assignmentId}")->assertNotFound();

        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/admin/documents/agreements/{$id}/remind")
            ->assertOk()
            ->assertJsonPath('sent', 0);
        $this->postJson("/api/v1/admin/documents/{$id}")->assertStatus(422);
    }

    public function test_a_due_date_of_today_still_accepts_a_signature(): void
    {
        Storage::fake('public');
        Storage::fake('local');
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunity();

        Sanctum::actingAs($admin);
        $draft = $this->post('/api/v1/admin/documents/agreements', [
            'title' => 'Due Today',
            'category' => 'Rules & Policies',
            'due_at' => now()->toDateString(),
            'file' => $this->pdfFile('Due today.'),
        ], ['Accept' => 'application/json'])->assertCreated();
        $id = $draft->json('data.id');
        $this->postJson("/api/v1/admin/documents/agreements/{$id}/publish", [
            'scope' => 'all',
            'notify' => false,
        ])->assertOk();

        Sanctum::actingAs($resident);
        $detail = $this->getJson("/api/v1/documents/{$id}")->assertOk();
        $this->assertTrue($detail->json('data.assignments.0.can_sign'));
        $this->assertSame('viewed', $detail->json('data.assignments.0.display_status'));
        $this->postJson("/api/v1/documents/{$id}/sign", [
            'version' => 1,
            'assignment_id' => $detail->json('data.assignments.0.assignment_id'),
            'method' => 'type',
            'typed_name' => $resident->name,
            'consent' => true,
        ])->assertCreated();
    }

    public function test_unit_assignments_are_tracked_separately_and_foreign_residents_are_ignored(): void
    {
        Storage::fake('public');
        Storage::fake('local');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident, 'otherResident' => $other] = $this->seedCommunity();

        $first = DB::table('units')->insertGetId([
            'community_id' => $community->id,
            'unit_number' => 'A-101',
            'unit_number_normalized' => 'a-101',
            'kind' => 'residential',
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $second = DB::table('units')->insertGetId([
            'community_id' => $community->id,
            'unit_number' => 'A-102',
            'unit_number_normalized' => 'a-102',
            'kind' => 'residential',
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        foreach ([$first, $second] as $unitId) {
            DB::table('unit_residents')->insert([
                'unit_id' => $unitId,
                'community_id' => $community->id,
                'user_id' => $resident->id,
                'status' => 'active',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        Sanctum::actingAs($admin);
        $id = $this->post('/api/v1/admin/documents/agreements', [
            'title' => 'Parking Agreement',
            'category' => 'Rules & Policies',
            'file' => $this->pdfFile('Parking terms stay intact.'),
        ], ['Accept' => 'application/json'])->json('data.id');

        $this->postJson("/api/v1/admin/documents/agreements/{$id}/publish", [
            'scope' => 'units',
            'unit_ids' => [$first, $second],
            'user_ids' => [$other->id],
        ])->assertOk()->assertJsonPath('assigned', 2);

        Sanctum::actingAs($resident);
        $cards = collect($this->getJson('/api/v1/documents')->json('data'));
        $this->assertCount(2, $cards);
        $firstCard = $cards->firstWhere('unit_label', 'A-101');
        $this->postJson("/api/v1/documents/{$id}/sign", [
            'version' => 1,
            'assignment_id' => $firstCard['assignment_id'],
            'method' => 'draw',
            'consent' => true,
            'strokes' => [
                [
                    ['x' => 0.1, 'y' => 0.5],
                    ['x' => 0.8, 'y' => 0.4],
                ],
            ],
        ])->assertCreated();

        $after = collect($this->getJson('/api/v1/documents')->json('data'))->keyBy('unit_label');
        $this->assertSame('signed', $after['A-101']['signature_status']);
        $this->assertSame('pending', $after['A-102']['signature_status']);
    }

    public function test_a_dragged_signature_is_saved_on_the_selected_page(): void
    {
        Storage::fake('public');
        Storage::fake('local');
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunity();

        Sanctum::actingAs($admin);
        $id = $this->post('/api/v1/admin/documents/agreements', [
            'title' => 'Placement Agreement',
            'category' => 'Rules & Policies',
            'file' => $this->pdfFile('The original page stays intact.'),
        ], ['Accept' => 'application/json'])->assertCreated()->json('data.id');
        $this->postJson("/api/v1/admin/documents/agreements/{$id}/publish", [
            'scope' => 'all',
            'notify' => false,
        ])->assertOk();

        Sanctum::actingAs($resident);
        $assignmentId = $this->getJson("/api/v1/documents/{$id}")->json('data.assignments.0.assignment_id');
        $signed = $this->postJson("/api/v1/documents/{$id}/sign", [
            'version' => 1,
            'assignment_id' => $assignmentId,
            'method' => 'type',
            'typed_name' => 'Placed Mark',
            'consent' => true,
            'placement' => ['page' => 1, 'x' => 0.1, 'y' => 0.2, 'width' => 0.5, 'height' => 0.12],
        ])->assertCreated();

        $stored = json_decode((string) DB::table('community_document_signatures')->value('placement'), true);
        $this->assertSame(1, $stored['page']);
        $this->assertEqualsWithDelta(0.1, $stored['x'], 0.0001);
        $this->assertEqualsWithDelta(0.2, $stored['y'], 0.0001);
        $this->assertEqualsWithDelta(0.5, $stored['width'], 0.0001);
        $this->assertEqualsWithDelta(0.12, $stored['height'], 0.0001);

        $url = parse_url($signed->json('data.signed_file_url'));
        $bytes = $this->get($url['path'].'?'.$url['query'])->assertOk()->streamedContent();
        $this->assertStringStartsWith('%PDF', $bytes);
        $mark = strpos($bytes, 'Placed Mark');
        $record = strpos($bytes, 'Electronic signature record');
        $this->assertNotFalse($mark);
        $this->assertNotFalse($record);
        $this->assertLessThan($record, $mark);
        $this->assertStringContainsString('Signature placed on page 1.', $bytes);
        $this->assertStringContainsString('The original page stays intact.', $bytes);
    }

    public function test_status_tabs_count_every_agreement_state(): void
    {
        Storage::fake('public');
        ['admin' => $admin] = $this->seedCommunity();
        Sanctum::actingAs($admin);

        $this->post('/api/v1/admin/documents/agreements', [
            'title' => 'Still a draft',
            'category' => 'Rules & Policies',
            'due_at' => now()->addDays(3)->toDateString(),
            'file' => $this->pdfFile('Draft terms.'),
        ], ['Accept' => 'application/json'])->assertCreated();

        $overdueId = $this->post('/api/v1/admin/documents/agreements', [
            'title' => 'Already due',
            'category' => 'Rules & Policies',
            'due_at' => now()->subDay()->toDateString(),
            'file' => $this->pdfFile('Overdue terms.'),
        ], ['Accept' => 'application/json'])->json('data.id');
        $this->postJson("/api/v1/admin/documents/agreements/{$overdueId}/publish", [
            'scope' => 'all',
            'notify' => false,
        ])->assertOk();

        $counts = $this->getJson('/api/v1/admin/documents/agreements?status=draft')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->json('meta.counts');

        $this->assertSame(2, $counts['all']);
        $this->assertSame(1, $counts['draft']);
        $this->assertSame(1, $counts['published']);
        $this->assertSame(1, $counts['overdue']);
        $this->assertSame(0, $counts['archived']);
        $this->assertSame(0, $counts['revoked']);
        $this->assertSame(0, $counts['superseded']);
    }

    public function test_publish_emails_only_the_selected_residents(): void
    {
        Mail::fake();
        Storage::fake('public');
        ['admin' => $admin, 'resident' => $resident, 'community' => $community] = $this->seedCommunity();
        $skipped = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'name' => 'Skipped Resident',
            'phone' => '+201700000044',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $skipped->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        Sanctum::actingAs($admin);
        $id = $this->post('/api/v1/admin/documents/agreements', [
            'title' => 'Community Rules Agreement',
            'category' => 'Rules & Policies',
            'file' => $this->pdfFile('Residents agree to the community rules.'),
        ], ['Accept' => 'application/json'])->assertCreated()->json('data.id');

        $this->postJson("/api/v1/admin/documents/agreements/{$id}/publish", [
            'scope' => 'residents',
            'user_ids' => [$resident->id],
            'notify' => true,
        ])->assertOk()->assertJsonPath('assigned', 1);

        Mail::assertSent(HavenaTransactionalMail::class, function (HavenaTransactionalMail $mail) use ($resident, $id) {
            $details = collect($mail->details);

            return $mail->hasTo($resident->email)
                && str_contains($mail->subjectLine, 'Community Rules Agreement')
                && str_contains($mail->intro, 'new agreement is available for your review and signature')
                && $details->contains(fn ($detail) => $detail['label'] === 'Agreement' && $detail['value'] === 'Community Rules Agreement')
                && $details->contains(fn ($detail) => $detail['label'] === 'Community' && $detail['value'] === 'Haly Tower')
                && $mail->ctaUrl === AppUrls::agreementReview((int) $id);
        });
        Mail::assertNotSent(HavenaTransactionalMail::class, fn (HavenaTransactionalMail $mail) => $mail->hasTo($skipped->email));
        Mail::assertNotSent(HavenaTransactionalMail::class, fn (HavenaTransactionalMail $mail) => $mail->hasTo($admin->email));
        $this->assertSame(1, Mail::sent(HavenaTransactionalMail::class)->count());

        Mail::fake();
        $silentId = $this->post('/api/v1/admin/documents/agreements', [
            'title' => 'Silent Agreement',
            'category' => 'Rules & Policies',
            'file' => $this->pdfFile('No email for this one.'),
        ], ['Accept' => 'application/json'])->assertCreated()->json('data.id');
        $this->postJson("/api/v1/admin/documents/agreements/{$silentId}/publish", [
            'scope' => 'residents',
            'user_ids' => [$resident->id],
            'notify' => false,
        ])->assertOk();
        Mail::assertNothingSent();
    }

    public function test_signing_emails_the_community_admin_a_signed_pdf_link(): void
    {
        Mail::fake();
        Storage::fake('public');
        Storage::fake('local');
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunity();

        Sanctum::actingAs($admin);
        $id = $this->post('/api/v1/admin/documents/agreements', [
            'title' => 'Community Rules Agreement',
            'category' => 'Rules & Policies',
            'file' => $this->pdfFile('Residents agree to the community rules.'),
        ], ['Accept' => 'application/json'])->assertCreated()->json('data.id');
        $this->postJson("/api/v1/admin/documents/agreements/{$id}/publish", [
            'scope' => 'residents',
            'user_ids' => [$resident->id],
            'notify' => false,
        ])->assertOk();

        Sanctum::actingAs($resident);
        $assignmentId = $this->getJson("/api/v1/documents/{$id}")->assertOk()->json('data.assignments.0.assignment_id');
        $this->postJson("/api/v1/documents/{$id}/sign", [
            'version' => 1,
            'assignment_id' => $assignmentId,
            'method' => 'type',
            'typed_name' => $resident->name,
            'consent' => true,
        ])->assertCreated();

        $pdfUrl = null;
        Mail::assertSent(HavenaTransactionalMail::class, function (HavenaTransactionalMail $mail) use ($admin, $resident, &$pdfUrl) {
            $details = collect($mail->details);
            $matches = $mail->hasTo($admin->email)
                && str_contains($mail->subjectLine, $resident->name)
                && str_contains($mail->subjectLine, 'Community Rules Agreement')
                && $details->contains(fn ($detail) => $detail['label'] === 'Resident' && $detail['value'] === $resident->name)
                && $details->contains(fn ($detail) => $detail['label'] === 'Agreement' && $detail['value'] === 'Community Rules Agreement')
                && $details->contains(fn ($detail) => $detail['label'] === 'Community' && $detail['value'] === 'Haly Tower')
                && $details->contains(fn ($detail) => $detail['label'] === 'Signed on' && $detail['value'] !== '')
                && $mail->ctaLabel === 'View signed PDF'
                && str_contains((string) $mail->ctaUrl, '/api/v1/documents/signed-files/');
            if ($matches) {
                $pdfUrl = $mail->ctaUrl;
            }

            return $matches;
        });
        Mail::assertNotSent(HavenaTransactionalMail::class, fn (HavenaTransactionalMail $mail) => $mail->hasTo($resident->email));
        $this->assertSame(1, Mail::sent(HavenaTransactionalMail::class)->count());

        $url = parse_url((string) $pdfUrl);
        $download = $this->get($url['path'].'?'.$url['query']);
        $download->assertOk();
        $this->assertStringStartsWith('%PDF', $download->streamedContent());
    }

    public function test_invalid_pdf_is_rejected(): void
    {
        Storage::fake('public');
        ['admin' => $admin] = $this->seedCommunity();
        Sanctum::actingAs($admin);

        $this->post('/api/v1/admin/documents/agreements', [
            'title' => 'Broken',
            'category' => 'Rules & Policies',
            'file' => UploadedFile::fake()->createWithContent('notes.pdf', 'not a pdf'),
        ], ['Accept' => 'application/json'])->assertStatus(422);
    }

    private function pdfFile(string $sentence): UploadedFile
    {
        $pdf = new \FPDF();
        $pdf->SetCompression(false);
        $pdf->AddPage();
        $pdf->SetFont('Helvetica', '', 12);
        $pdf->Text(20, 30, $sentence);

        return UploadedFile::fake()->createWithContent('agreement.pdf', $pdf->Output('S'));
    }

    private function seedCommunity(): array
    {
        $region = Region::query()->create([
            'title' => 'Test Region',
            'area' => 'Test Area',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);
        $community = Community::query()->create([
            'name' => 'Haly Tower',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);
        $otherCommunity = Community::query()->create([
            'name' => 'Other Community',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);
        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'name' => 'Community Admin',
            'phone' => '+201700000041',
        ]);
        $resident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'name' => 'Zainab Haider',
            'phone' => '+201700000042',
        ]);
        $otherResident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'name' => 'Other Resident',
            'phone' => '+201700000043',
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
        CommunityMembership::query()->create([
            'user_id' => $otherResident->id,
            'community_id' => $otherCommunity->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        return compact('community', 'admin', 'resident', 'otherResident');
    }
}
