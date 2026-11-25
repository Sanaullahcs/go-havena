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
            'message'   => 'We would love to bring Havena to our community.',
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
        Sanctum::actingAs(User::query()->where('email', 'admin@havena.app')->firstOrFail());

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
        Sanctum::actingAs(User::query()->where('email', 'admin@havena.app')->firstOrFail());

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

    public function test_system_admin_can_list_demo_requests_only(): void
    {
        $this->seed(SystemAdminSeeder::class);
        $admin = User::query()->where('role', 'system_admin')->firstOrFail();
        Sanctum::actingAs($admin);

        ContactSubmission::query()->create([
            'role'      => 'admin',
            'name'      => 'Demo Person',
            'email'     => 'demo@example.com',
            'community' => 'Demo HOA',
            'message'   => "[Demo request]\nPhone: +15550100\nCommunity size: 1–50 residents\nPreferred time: Weekday morning\n\nWe want a walkthrough.",
            'status'    => 'new',
        ]);

        ContactSubmission::query()->create([
            'role'      => 'resident',
            'name'      => 'General Contact',
            'email'     => 'hello@example.com',
            'community' => 'Somewhere',
            'message'   => 'Just a general question.',
            'status'    => 'new',
        ]);

        $response = $this->getJson('/api/v1/admin/contact-submissions?source=demo');

        $response->assertOk()
            ->assertJsonPath('meta.stats.total', 1)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.is_demo_request', true)
            ->assertJsonPath('data.0.demo.community_size', '1–50 residents')
            ->assertJsonPath('data.0.demo.preferred_time', 'Weekday morning')
            ->assertJsonPath('data.0.demo.note', 'We want a walkthrough.');
    }

    public function test_demo_request_sends_notification_email(): void
    {
        \Illuminate\Support\Facades\Mail::fake();

        $response = $this->postJson('/api/v1/contact', [
            'role'      => 'admin',
            'name'      => 'Jordan Hale',
            'email'     => 'jordan@community.org',
            'community' => 'Phoenix Tower HOA',
            'message'   => "[Demo request]\nPhone: +15551234567\nCommunity size: 51–200 residents\nPreferred time: Weekday morning\n\nShow us notices and membership.",
        ]);

        $response->assertCreated();

        \Illuminate\Support\Facades\Mail::assertSent(\App\Mail\DemoRequestSubmittedMail::class, function ($mail) {
            return $mail->submission->email === 'jordan@community.org'
                && $mail->hasTo(config('mail.contact_to'));
        });
    }
}
