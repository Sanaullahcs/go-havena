<?php

namespace Tests\Feature;

use App\Models\Region;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CommunityAdminSelfServeTest extends TestCase
{
    use RefreshDatabase;

    public function test_unknown_email_can_signup_via_community_admin_portal_otp(): void
    {
        $email = 'self.serve.admin@example.com';

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'signup',
            'portal' => 'community_admin_dashboard',
        ])->assertStatus(202);

        $verify = $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '123456',
            'intent' => 'signup',
            'role' => 'admin',
            'portal' => 'community_admin_dashboard',
        ])->assertOk();

        $verify->assertJsonPath('user.role', 'community_admin')
            ->assertJsonPath('user.community_admin_status', 'pending');

        $this->assertDatabaseHas('users', [
            'email' => $email,
            'phone' => null,
            'role' => 'community_admin',
            'community_admin_status' => 'pending',
        ]);
    }

    public function test_signup_accepts_email_with_local_part_under_64_characters(): void
    {
        $email = str_repeat('a', 20).'@example.com';

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'signup',
            'portal' => 'community_admin_dashboard',
        ])->assertStatus(202);

        $this->assertDatabaseHas('email_otps', [
            'email' => $email,
        ]);
    }

    public function test_signup_accepts_email_with_local_part_exactly_64_characters(): void
    {
        $email = str_repeat('a', 64).'@example.com';

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'signup',
            'portal' => 'community_admin_dashboard',
        ])->assertStatus(202);

        $this->assertDatabaseHas('email_otps', [
            'email' => $email,
        ]);
    }

    public function test_signup_rejects_email_with_local_part_over_64_characters_without_otp(): void
    {
        $email = str_repeat('a', 65).'@example.com';

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'signup',
            'portal' => 'community_admin_dashboard',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'INVALID_EMAIL')
            ->assertJsonPath('message', 'Please enter a valid email address.')
            ->assertJsonPath('errors.email.0', 'Please enter a valid email address.');

        $this->assertDatabaseMissing('email_otps', [
            'email' => $email,
        ]);
        $this->assertDatabaseCount('email_otps', 0);
    }

    public function test_signup_rejects_overlong_local_part_when_frontend_validation_is_bypassed(): void
    {
        $email = str_repeat('b', 80).'@example.com';

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'signup',
            'portal' => 'community_admin_dashboard',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'INVALID_EMAIL')
            ->assertJsonPath('message', 'Please enter a valid email address.');

        $this->assertDatabaseCount('email_otps', 0);
    }

    public function test_self_serve_creates_pending_community_and_membership(): void
    {
        $region = Region::query()->create([
            'title' => 'Florida',
            'area' => 'FL',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'pending',
            'status' => 'active',
            'name' => '',
        ]);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/communities/self-serve', [
            'community_name' => 'Palm Court HOA',
            'address' => '100 Palm Ave, Miami, FL',
            'region_id' => $region->id,
            'estimated_residents' => 120,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.community.name', 'Palm Court HOA')
            ->assertJsonPath('data.membership.role', 'admin')
            ->assertJsonPath('data.membership.status', 'pending')
            ->assertJsonPath('data.access.next_step', 'complete_profile');

        $this->assertDatabaseHas('communities', [
            'name' => 'Palm Court HOA',
            'address' => '100 Palm Ave, Miami, FL',
            'description' => null,
            'status' => 'inactive',
            'review_status' => 'pending',
            'estimated_residents' => 120,
        ]);
    }

    public function test_self_serve_saves_description_separately_from_address(): void
    {
        $region = Region::query()->create([
            'title' => 'Florida',
            'area' => 'FL',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'pending',
            'status' => 'active',
            'name' => '',
        ]);

        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/communities/self-serve', [
            'community_name' => 'Palm Court HOA',
            'address' => '100 Palm Ave, Miami, FL',
            'description' => 'Gated community near the waterfront.',
            'region_id' => $region->id,
        ])->assertCreated();

        $this->assertDatabaseHas('communities', [
            'name' => 'Palm Court HOA',
            'address' => '100 Palm Ave, Miami, FL',
            'description' => 'Gated community near the waterfront.',
        ]);
    }
}
