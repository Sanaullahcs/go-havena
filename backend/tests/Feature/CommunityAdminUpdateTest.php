<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Profile;
use App\Models\Region;
use App\Models\User;
use App\Support\UtilityBillDocumentVerdict;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CommunityAdminUpdateTest extends TestCase
{
    use RefreshDatabase;

    private function systemAdmin(): User
    {
        $this->seed(SystemAdminSeeder::class);

        return User::query()->where('email', 'admin@havena.app')->firstOrFail();
    }

    private function communityAdmin(): User
    {
        $region = Region::query()->create([
            'title' => 'Test Region',
            'area' => 'Test',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $community = Community::query()->create([
            'name' => 'Test Community',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $admin = User::factory()->create([
            'name' => 'Old Name',
            'email' => 'old.admin@example.com',
            'phone' => '+15555550100',
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
        ]);

        Profile::query()->create([
            'user_id' => $admin->id,
            'display_name' => 'Old Display',
            'office_address' => 'Building A, office 1',
            'unit_number' => null,
            'residence_type' => null,
        ]);

        CommunityMembership::query()->create([
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);

        return $admin;
    }

    public function test_system_admin_can_update_community_admin_profile(): void
    {
        Sanctum::actingAs($this->systemAdmin());
        $admin = $this->communityAdmin();

        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}", [
            'name' => 'Updated Admin',
            'phone' => '+14155552671',
            'display_name' => 'Updated Display',
            'office_address' => 'Building B, suite 12',
        ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Updated Admin')
            ->assertJsonPath('data.email', 'old.admin@example.com')
            ->assertJsonPath('data.phone', '+14155552671')
            ->assertJsonPath('data.profile.display_name', 'Updated Display')
            ->assertJsonPath('data.profile.office_address', 'Building B, suite 12')
            ->assertJsonPath('data.profile.unit_number', null)
            ->assertJsonPath('data.profile.residence_type', null);

        $this->assertDatabaseHas('users', [
            'id' => $admin->id,
            'name' => 'Updated Admin',
            'email' => 'old.admin@example.com',
            'phone' => '+14155552671',
        ]);
    }

    public function test_update_rejects_email_changes(): void
    {
        Sanctum::actingAs($this->systemAdmin());
        $admin = $this->communityAdmin();

        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}", [
            'name' => 'Should Not Save',
            'email' => 'updated.admin@example.com',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email'])
            ->assertJsonPath('errors.email.0', 'Email address cannot be changed from this form.');

        $this->assertDatabaseHas('users', [
            'id' => $admin->id,
            'name' => 'Old Name',
            'email' => 'old.admin@example.com',
        ]);

        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}", [
            'name' => 'Updated Admin',
            'email' => 'Old.Admin@example.com',
        ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Updated Admin')
            ->assertJsonPath('data.email', 'old.admin@example.com');
    }

    public function test_update_rejects_name_and_office_address_over_character_limits(): void
    {
        Sanctum::actingAs($this->systemAdmin());
        $admin = $this->communityAdmin();

        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}", [
            'name' => str_repeat('A', 51),
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name'])
            ->assertJsonPath('errors.name.0', 'Full name cannot exceed 50 characters.');

        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}", [
            'office_address' => str_repeat('1', 256),
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['office_address'])
            ->assertJsonPath('errors.office_address.0', 'Office address cannot exceed 255 characters.');

        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}", [
            'name' => str_repeat('A', 50),
            'office_address' => str_repeat('1', 255),
        ])->assertOk()
            ->assertJsonPath('data.name', str_repeat('A', 50))
            ->assertJsonPath('data.profile.office_address', str_repeat('1', 255));
    }

    public function test_profile_update_persists_first_and_last_name(): void
    {
        $admin = $this->communityAdmin();
        $admin->profile()->update([
            'utility_bill_url' => '/storage/utility-bills/existing.pdf',
        ]);
        Sanctum::actingAs($admin->fresh());

        $this->putJson('/api/v1/me', [
            'first_name' => 'Jane',
            'last_name' => 'Doe',
        ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Jane Doe')
            ->assertJsonPath('data.profile.first_name', 'Jane')
            ->assertJsonPath('data.profile.last_name', 'Doe')
            ->assertJsonPath('data.profile.display_name', 'Jane Doe');

        $admin->refresh();
        $this->assertSame('Jane', $admin->profile->first_name);
        $this->assertSame('Doe', $admin->profile->last_name);
    }

    public function test_profile_update_does_not_require_office_address_when_it_is_not_submitted(): void
    {
        $admin = $this->communityAdmin();
        $admin->profile()->update([
            'office_address' => null,
            'utility_bill_url' => '/storage/utility-bills/existing.pdf',
        ]);
        Sanctum::actingAs($admin->fresh());

        $this->postJson('/api/v1/me', [
            'name' => 'Updated Name',
            'display_name' => 'Updated Name',
            'bio' => 'Updated community bio',
            'phone' => '+14155552671',
        ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Updated Name')
            ->assertJsonPath('data.profile.bio', 'Updated community bio')
            ->assertJsonPath('data.profile.office_address', null);

        $this->postJson('/api/v1/me', [
            'display_name' => 'Updated Name',
            'office_address' => '   ',
        ])
            ->assertStatus(422)
            ->assertJsonPath('errors.office_address.0', 'Office address is required.');
    }

    public function test_community_admin_profile_update_enforces_the_same_limits(): void
    {
        $admin = $this->communityAdmin();
        Sanctum::actingAs($admin);

        $this->putJson('/api/v1/me', [
            'name' => str_repeat('B', 51),
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name'])
            ->assertJsonPath('errors.name.0', 'Full name cannot exceed 50 characters.');

        $this->putJson('/api/v1/me', [
            'office_address' => str_repeat('2', 256),
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['office_address'])
            ->assertJsonPath('errors.office_address.0', 'Office address cannot exceed 255 characters.');
    }

    public function test_utility_bill_is_optional_and_unchanged_when_omitted(): void
    {
        Sanctum::actingAs($this->systemAdmin());
        $admin = $this->communityAdmin();
        $admin->profile()->update([
            'utility_bill_url' => '/storage/utility-bills/existing.pdf',
            'utility_bill_review_status' => 'approved',
        ]);

        $response = $this->patchJson("/api/v1/admin/community-admins/{$admin->id}", [
            'name' => 'Updated Admin',
        ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Updated Admin')
            ->assertJsonPath('data.community_admin_status', 'approved')
            ->assertJsonPath('data.profile.utility_bill_review_status', 'approved');

        $this->assertStringContainsString(
            '/storage/utility-bills/existing.pdf',
            (string) $response->json('data.profile.utility_bill_url'),
        );

        $this->assertDatabaseHas('profiles', [
            'user_id' => $admin->id,
            'utility_bill_url' => '/storage/utility-bills/existing.pdf',
            'utility_bill_review_status' => 'approved',
        ]);
    }

    public function test_system_admin_can_replace_utility_bill_without_changing_status(): void
    {
        Storage::fake('public');
        Sanctum::actingAs($this->systemAdmin());
        $admin = $this->communityAdmin();
        $admin->profile()->update([
            'utility_bill_url' => '/storage/utility-bills/existing.pdf',
            'utility_bill_review_status' => 'approved',
        ]);

        $this->post("/api/v1/admin/community-admins/{$admin->id}", [
            'name' => 'Updated Admin',
            'utility_bill' => $this->utilityBillPdf(),
        ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Updated Admin')
            ->assertJsonPath('data.community_admin_status', 'approved')
            ->assertJsonPath('data.profile.utility_bill_review_status', UtilityBillDocumentVerdict::LIKELY);

        $fresh = $admin->fresh('profile');
        $this->assertNotSame('/storage/utility-bills/existing.pdf', $fresh->profile->utility_bill_url);
        $this->assertStringContainsString('/storage/utility-bills/', (string) $fresh->profile->utility_bill_url);
        $this->assertSame('approved', $fresh->community_admin_status);
        $this->assertSame(UtilityBillDocumentVerdict::LIKELY, $fresh->profile->utility_bill_review_status);
    }

    private function utilityBillPdf(): UploadedFile
    {
        $text = 'Electric Utility Bill Account Number 12345 Amount Due Service Address Due Date';
        $escaped = str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $text);
        $stream = "BT /F1 12 Tf 72 700 Td ({$escaped}) Tj ET";
        $pdf = "%PDF-1.4\n1 0 obj<< /Length ".strlen($stream)." >>stream\n{$stream}\nendstream\nendobj\ntrailer<<>>\n%%EOF";
        $path = tempnam(sys_get_temp_dir(), 'bill').'.pdf';
        file_put_contents($path, $pdf);

        return new UploadedFile($path, 'utility-bill.pdf', 'application/pdf', null, true);
    }

    public function test_system_admin_cannot_save_a_logo_as_the_utility_bill(): void
    {
        Storage::fake('public');
        Sanctum::actingAs($this->systemAdmin());
        $admin = $this->communityAdmin();
        $admin->profile()->update([
            'utility_bill_url' => '/storage/utility-bills/existing.pdf',
            'utility_bill_review_status' => 'approved',
        ]);

        $this->post("/api/v1/admin/community-admins/{$admin->id}", [
            'name' => 'Should Not Save',
            'utility_bill' => $this->simpleLogoImage(),
        ], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['utility_bill'])
            ->assertJsonPath('errors.utility_bill.0', UtilityBillDocumentVerdict::REJECT_MESSAGE);

        $fresh = $admin->fresh('profile');
        $this->assertSame('Old Name', $fresh->name);
        $this->assertSame('/storage/utility-bills/existing.pdf', $fresh->profile->utility_bill_url);
        $this->assertSame('approved', $fresh->profile->utility_bill_review_status);
    }

    public function test_utility_bill_rejects_unsupported_type_and_oversized_files(): void
    {
        Storage::fake('public');
        Sanctum::actingAs($this->systemAdmin());
        $admin = $this->communityAdmin();
        $admin->profile()->update([
            'utility_bill_url' => '/storage/utility-bills/existing.pdf',
            'utility_bill_review_status' => 'approved',
        ]);

        $this->post("/api/v1/admin/community-admins/{$admin->id}", [
            'name' => 'Should Not Save',
            'utility_bill' => UploadedFile::fake()->create('notes.txt', 20, 'text/plain'),
        ], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['utility_bill'])
            ->assertJsonPath('errors.utility_bill.0', 'Upload a JPG, PNG, HEIC, or PDF file.');

        $this->post("/api/v1/admin/community-admins/{$admin->id}", [
            'name' => 'Should Not Save',
            'utility_bill' => UploadedFile::fake()->create('lease.pdf', 10241, 'application/pdf'),
        ], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['utility_bill'])
            ->assertJsonPath('errors.utility_bill.0', 'File must be 10 MB or smaller.');

        $fresh = $admin->fresh('profile');
        $this->assertSame('Old Name', $fresh->name);
        $this->assertSame('/storage/utility-bills/existing.pdf', $fresh->profile->utility_bill_url);
        $this->assertSame('approved', $fresh->profile->utility_bill_review_status);
        $this->assertSame('approved', $fresh->community_admin_status);
    }

    private function simpleLogoImage(): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'logo').'.png';
        $image = imagecreatetruecolor(640, 640);
        $white = imagecolorallocate($image, 255, 255, 255);
        $blue = imagecolorallocate($image, 27, 79, 138);
        $navy = imagecolorallocate($image, 15, 40, 80);
        imagefilledrectangle($image, 0, 0, 639, 639, $white);
        imagefilledellipse($image, 320, 230, 200, 200, $blue);
        imagefilledellipse($image, 320, 230, 110, 110, $white);
        imagestring($image, 5, 255, 400, 'HAVENA', $navy);
        imagefilledrectangle($image, 180, 440, 460, 468, $navy);
        imagepng($image, $path);
        imagedestroy($image);

        return new UploadedFile($path, 'havena-logo.png', 'image/png', null, true);
    }

    public function test_non_system_admin_cannot_update_community_admin(): void
    {
        $admin = $this->communityAdmin();
        Sanctum::actingAs($admin);

        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}", [
            'name' => 'Hacker',
        ])->assertForbidden();
    }
}
