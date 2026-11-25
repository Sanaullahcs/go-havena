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

class DocumentLifecycleTest extends TestCase
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

    public function test_documents_without_an_expiration_are_not_overdue_and_archived_copies_stay_hidden(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedPeople();
        Sanctum::actingAs($admin);

        $created = $this->post('/api/v1/admin/documents', [
            'title' => 'Handbook',
            'category' => 'Rules & Policies',
            'description' => 'The current community handbook.',
            'assignment_scope' => 'all',
            'publication_status' => 'published',
            'signature_required' => 0,
            'notify' => 0,
            'file' => UploadedFile::fake()->create('handbook.pdf', 80, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated();

        $id = $created->json('data.id');
        $this->assertSame('published', $created->json('data.lifecycle'));
        $this->assertNull($created->json('data.expires_at'));

        $this->post("/api/v1/admin/documents/{$id}/archive", [], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.lifecycle', 'archived')
            ->assertJsonPath('data.publication_status', 'archived');

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/documents')->assertOk()->assertJsonMissing(['id' => $id]);
        $this->getJson("/api/v1/documents/{$id}")->assertNotFound();

        Sanctum::actingAs($admin);
        $this->post("/api/v1/admin/documents/{$id}/restore", [], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.lifecycle', 'published');

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/documents')->assertOk()->assertJsonFragment(['id' => $id]);
    }

    public function test_expiration_is_separate_from_signature_deadlines_and_counts_people(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedPeople();
        Sanctum::actingAs($admin);

        $open = $this->post('/api/v1/admin/documents', [
            'title' => 'Waiver',
            'category' => 'Forms',
            'assignment_scope' => 'residents',
            'user_ids' => [$resident->id],
            'publication_status' => 'published',
            'signature_required' => 1,
            'notify' => 0,
            'due_at' => now()->addDay()->toIso8601String(),
            'expires_at' => now()->addMonth()->toDateString(),
            'file' => $this->pdf('Sign the waiver.'),
        ], ['Accept' => 'application/json'])->assertCreated();

        $id = $open->json('data.id');
        $this->assertSame('published', $open->json('data.lifecycle'));
        $this->assertSame('pending', $open->json('data.signature_status'));
        $this->assertSame(1, $open->json('data.signature_summary.required'));
        $this->assertSame(0, $open->json('data.signature_summary.signed'));

        $this->post("/api/v1/admin/documents/{$id}/deadline", [
            'due_at' => now()->subHour()->toIso8601String(),
        ], ['Accept' => 'application/json'])->assertStatus(422);

        $this->post("/api/v1/admin/documents/{$id}", [
            'expires_at' => now()->subDay()->toDateString(),
        ], ['Accept' => 'application/json'])->assertOk()
            ->assertJsonPath('data.lifecycle', 'overdue')
            ->assertJsonPath('data.signature_status', 'pending');

        DB::table('community_documents')->where('id', $id)->update([
            'due_at' => now()->subHour(),
        ]);

        $tracking = $this->getJson('/api/v1/admin/documents/signature-tracking')->assertOk();
        $this->assertSame(1, $tracking->json('required'));
        $this->assertSame(0, $tracking->json('signed'));
        $this->assertSame(0, $tracking->json('pending'));
        $this->assertSame(1, $tracking->json('overdue'));
        $this->assertSame('overdue', $tracking->json('documents.0.signature_status'));

        $this->postJson("/api/v1/admin/documents/{$id}/deadline", [
            'due_at' => now()->addDays(3)->toIso8601String(),
        ])->assertOk()->assertJsonPath('data.signature_status', 'pending');

        $this->assertDatabaseHas('community_document_activity', [
            'document_id' => $id,
            'event' => 'deadline_extended',
        ]);
    }

    public function test_partial_signatures_are_not_marked_fully_signed(): void
    {
        ['admin' => $admin, 'resident' => $resident, 'other' => $other] = $this->seedPeople();
        Sanctum::actingAs($admin);

        $created = $this->post('/api/v1/admin/documents', [
            'title' => 'Policy',
            'category' => 'Rules & Policies',
            'assignment_scope' => 'all',
            'publication_status' => 'published',
            'signature_required' => 1,
            'notify' => 0,
            'due_at' => now()->addDays(2)->toIso8601String(),
            'file' => $this->pdf('Sign the policy.'),
        ], ['Accept' => 'application/json'])->assertCreated();
        $id = $created->json('data.id');

        Sanctum::actingAs($resident);
        $detail = $this->getJson("/api/v1/documents/{$id}")->assertOk();
        $this->postJson("/api/v1/documents/{$id}/sign", [
            'version' => 1,
            'assignment_id' => $detail->json('data.assignments.0.assignment_id'),
            'method' => 'type',
            'typed_name' => $resident->name,
            'consent' => true,
        ])->assertCreated();

        Sanctum::actingAs($admin);
        $summary = $this->getJson('/api/v1/admin/documents/signature-tracking')->assertOk();
        $this->assertSame(2, $summary->json('required'));
        $this->assertSame(1, $summary->json('signed'));
        $this->assertSame(1, $summary->json('pending'));
        $this->assertSame('pending', $summary->json('documents.0.signature_status'));

        $this->postJson("/api/v1/admin/documents/{$id}/remind")->assertOk();
        Sanctum::actingAs($other);
        $this->getJson('/api/v1/documents')->assertOk()->assertJsonFragment(['id' => $id]);
    }

    public function test_each_document_update_keeps_the_previous_version(): void
    {
        ['admin' => $admin, 'resident' => $resident, 'other' => $other] = $this->seedPeople();
        Sanctum::actingAs($admin);

        $first = $this->post('/api/v1/admin/documents', [
            'title' => 'Community Guidelines',
            'category' => 'Rules & Policies',
            'description' => 'Original community guidelines for residents.',
            'assignment_scope' => 'all',
            'publication_status' => 'published',
            'signature_required' => 0,
            'notify' => 0,
            'file' => UploadedFile::fake()->create('guidelines-v1.pdf', 40, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated();

        $v1 = $first->json('data.id');
        $this->assertSame(1, $first->json('data.version'));
        $this->assertSame($v1, $first->json('data.version_root_id'));

        $second = $this->post("/api/v1/admin/documents/{$v1}/versions", [
            'title' => 'Community Guidelines',
            'category' => 'Maintenance',
            'description' => 'Second version of the community guidelines.',
            'assignment_scope' => 'residents',
            'user_ids' => [$resident->id],
            'publication_status' => 'published',
            'signature_required' => 0,
            'notify' => 0,
            'file' => UploadedFile::fake()->create('guidelines-v2.pdf', 55, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated();

        $v2 = $second->json('data.id');
        $this->assertSame(2, $second->json('data.version'));
        $this->assertSame($v1, $second->json('data.supersedes_id'));
        $this->assertSame($v1, $second->json('data.version_root_id'));
        $this->assertSame('published', $second->json('data.publication_status'));
        $this->assertSame('guidelines-v2.pdf', $second->json('data.file_name'));

        $this->getJson("/api/v1/documents/{$v1}")
            ->assertOk()
            ->assertJsonPath('data.version', 1)
            ->assertJsonPath('data.file_name', 'guidelines-v1.pdf')
            ->assertJsonPath('data.category', 'Rules & Policies')
            ->assertJsonPath('data.publication_status', 'published');

        $third = $this->post("/api/v1/admin/documents/{$v2}/versions", [
            'title' => 'Community Guidelines',
            'category' => 'Maintenance',
            'description' => 'Third version of the community guidelines.',
            'assignment_scope' => 'all',
            'publication_status' => 'published',
            'signature_required' => 0,
            'notify' => 0,
            'file' => UploadedFile::fake()->create('guidelines-v3.pdf', 60, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated();

        $v3 = $third->json('data.id');
        $this->assertSame(3, $third->json('data.version'));
        $this->assertSame($v2, $third->json('data.supersedes_id'));
        $this->getJson("/api/v1/documents/{$v2}")
            ->assertOk()
            ->assertJsonPath('data.file_name', 'guidelines-v2.pdf')
            ->assertJsonPath('data.publication_status', 'published');

        $this->post("/api/v1/admin/documents/{$v2}/archive", [], ['Accept' => 'application/json'])->assertOk();
        $this->getJson("/api/v1/documents/{$v1}")->assertOk()->assertJsonPath('data.publication_status', 'published');
        $this->getJson("/api/v1/documents/{$v3}")->assertOk()->assertJsonPath('data.publication_status', 'published');

        Sanctum::actingAs($resident);
        $residentIds = collect($this->getJson('/api/v1/documents')->json('data'))->pluck('id');
        $this->assertTrue($residentIds->contains($v1));
        $this->assertFalse($residentIds->contains($v2));
        $this->assertTrue($residentIds->contains($v3));

        Sanctum::actingAs($other);
        $otherIds = collect($this->getJson('/api/v1/documents')->json('data'))->pluck('id');
        $this->assertTrue($otherIds->contains($v1));
        $this->assertFalse($otherIds->contains($v2));
        $this->assertTrue($otherIds->contains($v3));

        Sanctum::actingAs($admin);
        $rows = collect($this->getJson('/api/v1/admin/documents?search=Community%20Guidelines')->json('data'));
        $this->assertSame([1, 2, 3], $rows->sortBy('version')->pluck('version')->values()->all());
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
            'phone' => '+201700000061',
        ]);
        $resident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'name' => 'Assigned Resident',
            'phone' => '+201700000062',
        ]);
        $other = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'name' => 'Other Resident',
            'phone' => '+201700000063',
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
