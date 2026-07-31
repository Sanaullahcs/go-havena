<?php

namespace Tests\Feature;

use App\Models\ContactSubmission;
use App\Models\User;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ContactSubmissionTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_can_submit_contact_form(): void
    {
        $response = $this->postJson('/api/v1/contact', [
            'role'      => 'resident',
            'name'      => 'Sarah Chen',
            'email'     => 'sarah@example.com',
            'community' => 'Greenwood HOA',
            'message'   => 'We would love to bring NeighborLink to our community.',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.name', 'Sarah Chen')
            ->assertJsonPath('data.status', 'new');

        $this->assertDatabaseHas('contact_submissions', [
            'email'   => 'sarah@example.com',
            'role'    => 'resident',
            'status'  => 'new',
        ]);
    }

    public function test_public_contact_form_validates_required_fields(): void
    {
        $response = $this->postJson('/api/v1/contact', [
            'role' => 'other',
        ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'email', 'message']);
    }

    public function test_system_admin_can_list_contact_submissions(): void
    {
        $this->seed(SystemAdminSeeder::class);
        Sanctum::actingAs(User::query()->where('email', 'admin@neighborlink.app')->firstOrFail());

        ContactSubmission::query()->create([
            'role'    => 'admin',
            'name'    => 'Alex Rivera',
            'email'   => 'alex@example.com',
            'message' => 'Interested in onboarding our HOA.',
            'status'  => 'new',
        ]);

        ContactSubmission::query()->create([
            'role'    => 'resident',
            'name'    => 'Jamie Lee',
            'email'   => 'jamie@example.com',
            'message' => 'How do I join my building?',
            'status'  => 'read',
        ]);

        $response = $this->getJson('/api/v1/admin/contact-submissions?status=new');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.email', 'alex@example.com')
            ->assertJsonPath('meta.stats.new', 1)
            ->assertJsonPath('meta.stats.total', 2);
    }

    public function test_non_admin_cannot_list_contact_submissions(): void
    {
        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/admin/contact-submissions')->assertForbidden();
    }

    public function test_system_admin_can_update_submission_status(): void
    {
        $this->seed(SystemAdminSeeder::class);
        Sanctum::actingAs(User::query()->where('email', 'admin@neighborlink.app')->firstOrFail());

        $submission = ContactSubmission::query()->create([
            'role'    => 'other',
            'name'    => 'Taylor Brooks',
            'email'   => 'taylor@example.com',
            'message' => 'Partnership inquiry.',
            'status'  => 'new',
        ]);

        $response = $this->patchJson("/api/v1/admin/contact-submissions/{$submission->id}", [
            'status' => 'archived',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.status', 'archived');

        $this->assertDatabaseHas('contact_submissions', [
            'id'     => $submission->id,
            'status' => 'archived',
        ]);
    }
}
