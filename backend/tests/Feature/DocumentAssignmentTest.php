<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DocumentAssignmentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['billing.enabled' => false, 'billing.enforce' => false]);
        Mail::fake();
        Storage::fake('public');
        Storage::fake('local');
    }

    public function test_drafts_stay_hidden_and_published_documents_reach_only_assigned_residents(): void
    {
        ['admin' => $admin, 'resident' => $resident, 'other' => $other] = $this->seedPeople();

        Sanctum::actingAs($admin);
        $draft = $this->post('/api/v1/admin/documents', [
            'title' => 'Pool Rules',
            'category' => 'Rules & Policies',
            'description' => 'Rules for the community pool.',
            'assignment_scope' => 'residents',
            'user_ids' => [$resident->id],
            'publication_status' => 'draft',
            'signature_required' => 0,
            'notify' => 0,
            'file' => UploadedFile::fake()->create('pool.pdf', 120, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated();

        $id = $draft->json('data.id');
        $this->assertSame('draft', $draft->json('data.publication_status'));

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/documents')->assertOk()->assertJsonMissing(['id' => $id]);
        $this->getJson("/api/v1/documents/{$id}")->assertNotFound();

        Sanctum::actingAs($admin);
        $this->post("/api/v1/admin/documents/{$id}", [
            'publication_status' => 'published',
            'assignment_scope' => 'residents',
            'user_ids' => [$resident->id],
            'notify' => 1,
        ], ['Accept' => 'application/json'])->assertOk()
            ->assertJsonPath('data.publication_status', 'published');

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/documents')->assertOk()->assertJsonPath('data.0.id', $id);
        Sanctum::actingAs($other);
        $this->getJson('/api/v1/documents')->assertOk()->assertJsonMissing(['id' => $id]);
        $this->getJson("/api/v1/documents/{$id}")->assertNotFound();
    }

    public function test_signature_document_uses_the_agreement_signing_flow(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedPeople();

        Sanctum::actingAs($admin);
        $this->post('/api/v1/admin/documents', [
            'title' => 'Late Waiver',
            'category' => 'Forms',
            'assignment_scope' => 'all',
            'publication_status' => 'published',
            'signature_required' => 1,
            'due_at' => now()->subHour()->toIso8601String(),
            'file' => $this->pdf('Sign the waiver.'),
        ], ['Accept' => 'application/json'])->assertStatus(422);

        $created = $this->post('/api/v1/admin/documents', [
            'title' => 'Waiver',
            'category' => 'Forms',
            'assignment_scope' => 'all',
            'publication_status' => 'published',
            'signature_required' => 1,
            'notify' => 0,
            'due_at' => now()->addDay()->toIso8601String(),
            'file' => $this->pdf('Sign the waiver.'),
        ], ['Accept' => 'application/json'])->assertCreated();

        $id = $created->json('data.id');
        $this->assertTrue($created->json('data.signature_required'));

        Sanctum::actingAs($resident);
        $detail = $this->getJson("/api/v1/documents/{$id}")->assertOk();
        $assignmentId = $detail->json('data.assignments.0.assignment_id');
        $this->assertTrue($detail->json('data.assignments.0.can_sign'));

        $signed = $this->postJson("/api/v1/documents/{$id}/sign", [
            'version' => 1,
            'assignment_id' => $assignmentId,
            'method' => 'type',
            'typed_name' => $resident->name,
            'consent' => true,
        ])->assertCreated();

        $this->assertNotEmpty($signed->json('data.signature.checksum'));
        $this->assertSame(1, DB::table('community_document_signatures')->count());

        Sanctum::actingAs($admin);
        $this->getJson("/api/v1/documents/{$id}")
            ->assertOk()
            ->assertJsonPath('data.stats.signed', 1)
            ->assertJsonPath('data.stats.recipients', 2)
            ->assertJsonPath('data.stats.pending', 1);
    }

    public function test_plain_documents_publish_without_signature_expiration_or_notification(): void
    {
        ['admin' => $admin, 'resident' => $resident, 'other' => $other] = $this->seedPeople();

        Sanctum::actingAs($admin);
        $created = $this->post('/api/v1/admin/documents', [
            'title' => 'Welcome Packet',
            'category' => 'Rules & Policies',
            'description' => 'Read this welcome packet.',
            'assignment_scope' => 'residents',
            'user_ids' => [$resident->id],
            'publication_status' => 'published',
            'file' => UploadedFile::fake()->create('welcome.pdf', 80, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated();

        $id = $created->json('data.id');
        $this->assertFalse($created->json('data.signature_required'));
        $this->assertNull($created->json('data.expires_at'));
        $this->assertNull($created->json('data.due_at'));
        Mail::assertNothingSent();

        Sanctum::actingAs($resident);
        $detail = $this->getJson("/api/v1/documents/{$id}")->assertOk();
        $this->assertNotEmpty($detail->json('data.file_url'));
        $this->assertFalse($detail->json('data.assignments.0.can_sign'));
        $this->postJson("/api/v1/documents/{$id}/download")->assertOk();
        $this->postJson("/api/v1/documents/{$id}/sign", [
            'version' => 1,
            'method' => 'type',
            'typed_name' => $resident->name,
            'consent' => true,
        ])->assertNotFound();

        Sanctum::actingAs($other);
        $this->getJson("/api/v1/documents/{$id}")->assertNotFound();
        $this->postJson("/api/v1/documents/{$id}/download")->assertNotFound();
    }

    private function pdf(string $sentence): UploadedFile
    {
        $pdf = new \FPDF();
        $pdf->SetCompression(false);
        $pdf->AddPage();
        $pdf->SetFont('Helvetica', '', 12);
        $pdf->Text(20, 30, $sentence);

        return UploadedFile::fake()->createWithContent('waiver.pdf', $pdf->Output('S'));
    }

    private function seedPeople(): array
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
        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'name' => 'Community Admin',
            'phone' => '+201700000051',
        ]);
        $resident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'name' => 'Assigned Resident',
            'phone' => '+201700000052',
        ]);
        $other = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'name' => 'Unassigned Resident',
            'phone' => '+201700000053',
        ]);
        foreach ([[$admin, 'admin'], [$resident, 'member'], [$other, 'member']] as [$user, $role]) {
            CommunityMembership::query()->create([
                'user_id' => $user->id,
                'community_id' => $community->id,
                'role' => $role,
                'status' => 'approved',
            ]);
        }

        return compact('admin', 'resident', 'other');
    }
}
