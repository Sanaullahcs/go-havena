<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Profile;
use App\Models\Region;
use App\Models\User;
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
            'unit_number' => 'A-1',
            'residence_type' => 'homeowner',
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
            'unit_number' => 'B-12',
            'residence_type' => 'tenant',
        ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Updated Admin')
            ->assertJsonPath('data.email', 'old.admin@example.com')
            ->assertJsonPath('data.phone', '+14155552671')
            ->assertJsonPath('data.profile.display_name', 'Updated Display')
            ->assertJsonPath('data.profile.unit_number', 'B-12')
            ->assertJsonPath('data.profile.residence_type', 'tenant');

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

    public function test_update_rejects_name_and_unit_over_character_limits(): void
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
            'unit_number' => str_repeat('1', 21),
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['unit_number'])
            ->assertJsonPath('errors.unit_number.0', 'Unit / apartment cannot exceed 20 characters.');

        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}", [
            'name' => str_repeat('A', 50),
            'unit_number' => str_repeat('1', 20),
        ])->assertOk()
            ->assertJsonPath('data.name', str_repeat('A', 50))
            ->assertJsonPath('data.profile.unit_number', str_repeat('1', 20));
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
            'unit_number' => str_repeat('2', 21),
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['unit_number'])
            ->assertJsonPath('errors.unit_number.0', 'Unit / apartment cannot exceed 20 characters.');
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
            'utility_bill' => UploadedFile::fake()->image('lease.jpg'),
        ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Updated Admin')
            ->assertJsonPath('data.community_admin_status', 'approved')
            ->assertJsonPath('data.profile.utility_bill_review_status', 'approved');

        $fresh = $admin->fresh('profile');
        $this->assertNotSame('/storage/utility-bills/existing.pdf', $fresh->profile->utility_bill_url);
        $this->assertStringContainsString('/storage/utility-bills/', (string) $fresh->profile->utility_bill_url);
        $this->assertSame('approved', $fresh->community_admin_status);
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

    public function test_non_system_admin_cannot_update_community_admin(): void
    {
        $admin = $this->communityAdmin();
        Sanctum::actingAs($admin);

        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}", [
            'name' => 'Hacker',
        ])->assertForbidden();
    }
}
