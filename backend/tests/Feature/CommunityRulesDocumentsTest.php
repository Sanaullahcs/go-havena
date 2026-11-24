<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CommunityRulesDocumentsTest extends TestCase
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
            'title'       => 'Test Region',
            'area'        => 'Test Area',
            'users_label' => '0 users',
            'sort_order'  => 1,
            'status'      => 'active',
        ]);

        $community = Community::query()->create([
            'name'          => 'Test Community',
            'region_id'     => $region->id,
            'region'        => $region->title,
            'status'        => 'active',
            'review_status' => 'approved',
        ]);

        $otherCommunity = Community::query()->create([
            'name'          => 'Other Community',
            'region_id'     => $region->id,
            'region'        => $region->title,
            'status'        => 'active',
            'review_status' => 'approved',
        ]);

        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
            'phone'                  => '+201700000030',
        ]);

        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000031',
        ]);

        $otherResident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000032',
        ]);

        $systemAdmin = User::factory()->create([
            'role'   => 'system_admin',
            'status' => 'active',
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

        CommunityMembership::query()->create([
            'user_id'      => $otherResident->id,
            'community_id' => $otherCommunity->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $systemAdmin->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        return compact('community', 'otherCommunity', 'admin', 'resident', 'otherResident', 'systemAdmin');
    }

    /* ─── Community Rules ─────────────────────────────────────── */

    public function test_community_admin_can_create_rule_visible_to_resident(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $create = $this->postJson('/api/v1/admin/community-rules', [
            'title'                   => 'Quiet Hours',
            'category'                => 'Noise',
            'description'             => 'Quiet hours are 10 PM to 7 AM.',
            'severity'                => 'important',
            'requires_acknowledgment' => true,
            'status'                  => 'active',
        ])->assertCreated();

        $ruleId = $create->json('data.id');
        $this->assertSame('Quiet Hours', $create->json('data.title'));
        $this->assertSame($community->id, $create->json('data.community_id'));

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/community-rules')
            ->assertOk()
            ->assertJsonPath('data.0.id', $ruleId)
            ->assertJsonPath('data.0.needs_action', true)
            ->assertJsonPath('unacknowledged', 1);
    }

    public function test_resident_can_acknowledge_rule(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $ruleId = $this->postJson('/api/v1/admin/community-rules', [
            'title'                   => 'Parking Policy',
            'category'                => 'Parking',
            'description'             => 'Guest parking is limited to 24 hours.',
            'severity'                => 'standard',
            'requires_acknowledgment' => true,
        ])->json('data.id');

        Sanctum::actingAs($resident);

        $this->postJson("/api/v1/community-rules/{$ruleId}/acknowledge")
            ->assertOk()
            ->assertJsonPath('acknowledged', true);

        $this->getJson('/api/v1/community-rules')
            ->assertOk()
            ->assertJsonPath('data.0.acknowledged', true)
            ->assertJsonPath('data.0.needs_action', false)
            ->assertJsonPath('unacknowledged', 0);
    }

    public function test_inactive_rule_hidden_from_residents_but_visible_in_admin_index(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $ruleId = $this->postJson('/api/v1/admin/community-rules', [
            'title'       => 'Draft Rule',
            'category'    => 'General',
            'description' => 'Not published yet.',
            'severity'    => 'info',
            'status'      => 'inactive',
        ])->json('data.id');

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/community-rules')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/admin/community-rules?status=inactive')
            ->assertOk()
            ->assertJsonPath('data.0.id', $ruleId);
    }

    public function test_community_admin_can_update_and_delete_rule(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $ruleId = $this->postJson('/api/v1/admin/community-rules', [
            'title'       => 'Old Title',
            'category'    => 'Safety',
            'description' => 'Original text.',
            'severity'    => 'important',
        ])->json('data.id');

        $this->patchJson("/api/v1/admin/community-rules/{$ruleId}", [
            'title' => 'Updated Title',
        ])->assertOk()->assertJsonPath('data.title', 'Updated Title');

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/community-rules')
            ->assertOk()
            ->assertJsonPath('data.0.title', 'Updated Title');

        Sanctum::actingAs($admin);
        $this->deleteJson("/api/v1/admin/community-rules/{$ruleId}")
            ->assertOk();

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/community-rules')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_resident_cannot_use_admin_rule_endpoints(): void
    {
        ['resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($resident);

        $this->postJson('/api/v1/admin/community-rules', [
            'title'       => 'Forbidden',
            'category'    => 'General',
            'description' => 'Should fail.',
            'severity'    => 'info',
        ])->assertForbidden();

        $this->getJson('/api/v1/admin/community-rules')->assertForbidden();
    }

    public function test_rule_filters_by_category_and_search(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/admin/community-rules', [
            'title'       => 'Pool Hours',
            'category'    => 'Amenities',
            'description' => 'Pool open 6 AM to 10 PM.',
            'severity'    => 'info',
        ])->assertCreated();

        $this->postJson('/api/v1/admin/community-rules', [
            'title'       => 'Pet Policy',
            'category'    => 'Pets',
            'description' => 'Dogs must be leashed.',
            'severity'    => 'standard',
        ])->assertCreated();

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/community-rules?category=Pets')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Pet Policy');

        $this->getJson('/api/v1/community-rules?severity=info')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Pool Hours');
    }

    /* ─── Community Documents ─────────────────────────────────── */

    public function test_community_admin_can_upload_document_visible_to_resident(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $file = UploadedFile::fake()->create('bylaws.pdf', 200, 'application/pdf');

        $create = $this->post('/api/v1/admin/documents', [
            'title'       => 'Community Bylaws',
            'category'    => 'Rules & Policies',
            'description' => 'Official community bylaws.',
            'status'      => 'active',
            'file'        => $file,
        ])->assertCreated();

        $docId = $create->json('data.id');
        $this->assertSame('Community Bylaws', $create->json('data.title'));
        $this->assertSame($community->id, $create->json('data.community_id'));
        $this->assertNotEmpty($create->json('data.file_url'));

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/documents')
            ->assertOk()
            ->assertJsonPath('data.0.id', $docId)
            ->assertJsonPath('total', 1)
            ->assertJsonPath('categories.0.name', 'Rules & Policies')
            ->assertJsonPath('categories.0.count', 1)
            ->assertJsonPath('categories.1.name', 'Maintenance')
            ->assertJsonPath('categories.1.count', 0)
            ->assertJsonPath('categories.2.name', 'Financial')
            ->assertJsonPath('categories.3.name', 'Property')
            ->assertJsonPath('categories.4.name', 'Others')
            ->assertJsonPath('categories.4.count', 0);
    }

    public function test_resident_document_categories_match_admin_presets_and_bucket_legacy_into_others(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        // Residents need an active unit before UserActingContextService resolves a community.
        app(\App\Services\UnitAssignmentService::class)->assignUserToUnitNumber(
            $community->id,
            $resident->id,
            '101',
            false,
            true,
            'active',
            'invite',
        );

        Sanctum::actingAs($admin);

        $this->post('/api/v1/admin/documents', [
            'title'    => 'Civic Notice',
            'category' => 'Civic',
            'file'     => UploadedFile::fake()->create('civic.pdf', 80, 'application/pdf'),
        ])->assertCreated();

        $this->post('/api/v1/admin/documents', [
            'title'    => 'Grounds Map',
            'category' => 'Grounds',
            'file'     => UploadedFile::fake()->create('grounds.pdf', 80, 'application/pdf'),
        ])->assertCreated();

        $this->post('/api/v1/admin/documents', [
            'title'    => 'Budget 2026',
            'category' => 'Financial',
            'file'     => UploadedFile::fake()->create('budget.pdf', 80, 'application/pdf'),
        ])->assertCreated();

        // Community admin on the resident Documents endpoint must still get preset chips
        // (not raw seeded names like Civic / Forms / Grounds).
        $adminList = $this->getJson('/api/v1/documents')->assertOk();
        $adminList
            ->assertJsonPath('categories.0.name', 'Rules & Policies')
            ->assertJsonPath('categories.1.name', 'Maintenance')
            ->assertJsonPath('categories.2.name', 'Financial')
            ->assertJsonPath('categories.2.count', 1)
            ->assertJsonPath('categories.3.name', 'Property')
            ->assertJsonPath('categories.4.name', 'Others')
            ->assertJsonPath('categories.4.count', 2);

        $adminNames = collect($adminList->json('categories'))->pluck('name')->all();
        $this->assertSame(
            ['Rules & Policies', 'Maintenance', 'Financial', 'Property', 'Others'],
            $adminNames,
        );
        $this->assertEmpty(array_intersect($adminNames, ['Civic', 'Forms', 'Grounds', 'Policies', 'Recreation']));

        Sanctum::actingAs($resident);

        $residentList = $this->getJson('/api/v1/documents')->assertOk();
        $residentList
            ->assertJsonPath('categories.2.name', 'Financial')
            ->assertJsonPath('categories.2.count', 1)
            ->assertJsonPath('categories.4.name', 'Others')
            ->assertJsonPath('categories.4.count', 2);

        $this->assertSame(
            ['Rules & Policies', 'Maintenance', 'Financial', 'Property', 'Others'],
            collect($residentList->json('categories'))->pluck('name')->all(),
        );
    }

    public function test_resident_can_view_and_download_document(): void
    {
        Storage::fake('public');
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $file = UploadedFile::fake()->create('form.pdf', 100, 'application/pdf');

        $docId = $this->post('/api/v1/admin/documents', [
            'title'    => 'Move-in Form',
            'category' => 'Forms',
            'description' => 'Move-in form for new residents.',
            'file'     => $file,
        ])->json('data.id');

        Sanctum::actingAs($resident);

        $this->getJson("/api/v1/documents/{$docId}")
            ->assertOk()
            ->assertJsonPath('data.title', 'Move-in Form');

        $this->postJson("/api/v1/documents/{$docId}/download")
            ->assertOk()
            ->assertJsonPath('data.download_count', 1);
    }

    public function test_inactive_document_hidden_from_residents(): void
    {
        Storage::fake('public');
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $file = UploadedFile::fake()->create('draft.pdf', 100, 'application/pdf');

        $docId = $this->post('/api/v1/admin/documents', [
            'title'    => 'Draft Document',
            'category' => 'Financial',
            'description' => 'Draft document kept inactive.',
            'status'   => 'inactive',
            'file'     => $file,
        ])->json('data.id');

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/documents')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->getJson("/api/v1/documents/{$docId}")
            ->assertNotFound();

        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/admin/documents?status=inactive')
            ->assertOk()
            ->assertJsonPath('data.0.id', $docId);
    }

    public function test_community_admin_can_update_and_delete_document(): void
    {
        Storage::fake('public');
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $file = UploadedFile::fake()->create('guide.pdf', 100, 'application/pdf');

        $docId = $this->post('/api/v1/admin/documents', [
            'title'    => 'Old Guide',
            'category' => 'Guidelines',
            'description' => 'Community guide for residents.',
            'file'     => $file,
        ])->json('data.id');

        $this->patch("/api/v1/admin/documents/{$docId}", [
            'title' => 'Updated Guide',
        ])->assertStatus(422);

        $this->getJson("/api/v1/documents/{$docId}")
            ->assertOk()
            ->assertJsonPath('data.title', 'Old Guide')
            ->assertJsonPath('data.version', 1)
            ->assertJsonPath('data.file_name', 'guide.pdf');

        $replacement = UploadedFile::fake()->create('replacement.pdf', 80, 'application/pdf');
        $version = $this->post("/api/v1/admin/documents/{$docId}/versions", [
            'title' => 'Updated Guide',
            'category' => 'Guidelines',
            'description' => 'Revised community guide for residents.',
            'assignment_scope' => 'all',
            'publication_status' => 'published',
            'signature_required' => 0,
            'notify' => 0,
            'file' => $replacement,
        ])->assertCreated();
        $versionId = $version->json('data.id');
        $this->assertNotSame($docId, $versionId);
        $this->assertSame(2, $version->json('data.version'));
        $this->assertSame($docId, $version->json('data.supersedes_id'));
        $this->assertSame('replacement.pdf', $version->json('data.file_name'));

        $this->getJson("/api/v1/documents/{$docId}")
            ->assertOk()
            ->assertJsonPath('data.title', 'Old Guide')
            ->assertJsonPath('data.file_name', 'guide.pdf')
            ->assertJsonPath('data.publication_status', 'published');

        Sanctum::actingAs($resident);
        $visible = collect($this->getJson('/api/v1/documents')->json('data'))->pluck('id');
        $this->assertTrue($visible->contains($docId));
        $this->assertTrue($visible->contains($versionId));

        Sanctum::actingAs($admin);
        $this->deleteJson("/api/v1/admin/documents/{$docId}")
            ->assertOk();

        Sanctum::actingAs($resident);
        $remaining = collect($this->getJson('/api/v1/documents')->json('data'))->pluck('id');
        $this->assertFalse($remaining->contains($docId));
        $this->assertTrue($remaining->contains($versionId));
    }

    public function test_resident_cannot_use_admin_document_endpoints(): void
    {
        Storage::fake('public');
        ['resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($resident);

        $file = UploadedFile::fake()->create('hack.pdf', 100, 'application/pdf');

        $this->post('/api/v1/admin/documents', [
            'title'    => 'Forbidden',
            'category' => 'Forms',
            'file'     => $file,
        ])->assertForbidden();

        $this->getJson('/api/v1/admin/documents')->assertForbidden();
    }

    public function test_document_filters_by_category_and_search(): void
    {
        Storage::fake('public');
        ['admin' => $admin] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($admin);

        $fileA = UploadedFile::fake()->create('safety.pdf', 100, 'application/pdf');
        $fileB = UploadedFile::fake()->create('map.pdf', 100, 'application/pdf');

        $this->post('/api/v1/admin/documents', [
            'title'    => 'Fire Safety Plan',
            'category' => 'Safety',
            'description' => 'Fire safety plan for the community.',
            'file'     => $fileA,
        ])->assertCreated();

        $this->post('/api/v1/admin/documents', [
            'title'    => 'Site Map',
            'category' => 'Maps & Diagrams',
            'description' => 'Site map of community grounds.',
            'file'     => $fileB,
        ])->assertCreated();

        $this->getJson('/api/v1/admin/documents?category=Safety')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Fire Safety Plan');

        $this->getJson('/api/v1/admin/documents?search=map')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Site Map');
    }

    /* ─── Authorization edge cases ────────────────────────────── */

    public function test_unauthenticated_requests_are_rejected(): void
    {
        $this->getJson('/api/v1/community-rules')->assertUnauthorized();
        $this->getJson('/api/v1/documents')->assertUnauthorized();
        $this->getJson('/api/v1/admin/community-rules')->assertUnauthorized();
        $this->getJson('/api/v1/admin/documents')->assertUnauthorized();
    }

    public function test_user_without_membership_gets_422(): void
    {
        $loner = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
        ]);

        Sanctum::actingAs($loner);

        $this->getJson('/api/v1/community-rules')
            ->assertStatus(422)
            ->assertJsonPath('message', 'No approved community membership found.');

        $this->getJson('/api/v1/documents')
            ->assertStatus(422)
            ->assertJsonPath('message', 'No approved community membership found.');
    }

    public function test_system_admin_with_membership_can_manage_rules_and_documents(): void
    {
        Storage::fake('public');
        ['systemAdmin' => $systemAdmin, 'resident' => $resident] = $this->seedCommunityWithAdmin();

        Sanctum::actingAs($systemAdmin);

        $ruleId = $this->postJson('/api/v1/admin/community-rules', [
            'title'       => 'System Admin Rule',
            'category'    => 'General',
            'description' => 'Created by system admin.',
            'severity'    => 'info',
        ])->assertCreated()->json('data.id');

        $file = UploadedFile::fake()->create('policy.pdf', 100, 'application/pdf');

        $docId = $this->post('/api/v1/admin/documents', [
            'title'    => 'System Admin Doc',
            'category' => 'Forms',
            'description' => 'Document created by a system admin.',
            'file'     => $file,
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/community-rules')
            ->assertOk()
            ->assertJsonPath('data.0.id', $ruleId);

        $this->getJson('/api/v1/documents')
            ->assertOk()
            ->assertJsonPath('data.0.id', $docId);
    }
}
