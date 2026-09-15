<?php

namespace Tests\Feature;

use App\Models\EmailOtp;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class AuthOtpTest extends TestCase
{
    use RefreshDatabase;

    public function test_signup_otp_request_and_verify_flow(): void
    {
        $email = 'resident.signup@example.com';

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'signup',
        ])->assertStatus(202)
            ->assertJsonPath('data.email', $email);

        $response = $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '123456',
            'intent' => 'signup',
            'role' => 'resident',
        ])->assertOk();

        $response->assertJsonStructure(['token', 'user' => ['id', 'uuid', 'email', 'phone', 'profile', 'memberships']]);
        $response->assertJsonPath('user.role', 'resident');
        $response->assertJsonPath('user.email', $email);
        $response->assertJsonPath('user.phone', null);

        $token = $response->json('token');

        $this->withToken($token)
            ->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.email', $email);

        $this->assertDatabaseHas('users', [
            'email' => $email,
            'phone' => null,
            'role' => 'resident',
        ]);
        $this->assertDatabaseMissing('users', [
            'email' => 'residentsignup@phone.havena.local',
        ]);
    }

    public function test_admin_signup_creates_pending_community_admin(): void
    {
        $email = 'community.admin.signup@example.com';

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'signup',
        ])->assertStatus(202);

        $response = $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '123456',
            'intent' => 'signup',
            'role' => 'admin',
        ])->assertOk();

        $response->assertJsonPath('user.role', 'community_admin');
        $response->assertJsonPath('user.community_admin_status', 'pending');
        $response->assertJsonPath('user.email', $email);
    }

    public function test_signup_rejects_existing_verified_user(): void
    {
        $email = 'already.registered@example.com';

        User::factory()->create([
            'email' => $email,
            'email_verified_at' => now(),
            'phone' => '+15555550111',
        ]);

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'signup',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'ACCOUNT_EXISTS_USE_LOGIN');
    }

    public function test_signup_rejects_existing_unverified_user_and_verify(): void
    {
        $email = 'unverified.existing@example.com';

        User::factory()->create([
            'email' => $email,
            'email_verified_at' => null,
            'phone' => '+15555550112',
            'phone_verified_at' => null,
        ]);

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'signup',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'ACCOUNT_EXISTS_USE_LOGIN');

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '123456',
            'intent' => 'signup',
            'role' => 'resident',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'ACCOUNT_EXISTS_USE_LOGIN');
    }

    public function test_signup_rejects_existing_email_case_insensitively(): void
    {
        User::factory()->create([
            'email' => 'CaseFold.Unique@example.test',
            'email_verified_at' => now(),
            'phone' => '+15555550999',
        ]);

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => 'casefold.unique@example.test',
            'intent' => 'signup',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'ACCOUNT_EXISTS_USE_LOGIN')
            ->assertJsonPath('errors.email.0', \App\Services\ContactIdentityService::DUPLICATE_EMAIL_MESSAGE);
    }

    public function test_login_rejects_unknown_email_on_request(): void
    {
        $this->postJson('/api/v1/auth/otp/request', [
            'email' => 'unknown.user@example.com',
            'intent' => 'login',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'ACCOUNT_NOT_FOUND_USE_SIGNUP');
    }

    public function test_login_rejects_placeholder_email(): void
    {
        $this->postJson('/api/v1/auth/otp/request', [
            'email' => '15555555555@phone.havena.local',
            'intent' => 'login',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'INVALID_EMAIL');
    }

    public function test_login_otp_flow_for_existing_user(): void
    {
        $email = 'existing.resident@example.com';

        User::factory()->create([
            'email' => $email,
            'email_verified_at' => now(),
            'phone' => '+15555555555',
            'phone_verified_at' => now(),
        ]);

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'login',
        ])->assertStatus(202);

        $response = $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '123456',
            'intent' => 'login',
        ])->assertOk();

        $response->assertJsonStructure(['token', 'user']);
        $response->assertJsonPath('user.email', $email);
    }

    public function test_join_by_invite_code(): void
    {
        $this->seed(\Database\Seeders\CommunitySeeder::class);

        $email = 'invite.joiner@example.com';

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'signup',
        ])->assertStatus(202);

        $verify = $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '123456',
            'intent' => 'signup',
            'role' => 'resident',
        ])->assertOk();

        $token = $verify->json('token');

        $this->withToken($token)
            ->postJson('/api/v1/communities/join-by-invite', ['invite_code' => 'MAPLE 2024 XYZ'])
            ->assertCreated()
            ->assertJsonPath('data.membership.status', 'approved')
            ->assertJsonPath('data.community.name', 'Oak Valley Residences');
    }

    public function test_community_admin_dashboard_otp_login(): void
    {
        $email = 'community.admin@havena.app';

        User::factory()->create([
            'email' => $email,
            'email_verified_at' => now(),
            'phone' => '+15556668888',
            'phone_verified_at' => now(),
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
        ]);

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'login',
            'portal' => 'community_admin_dashboard',
        ])->assertStatus(202)
            ->assertJsonPath('data.email', $email);

        $response = $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '123456',
            'intent' => 'login',
            'portal' => 'community_admin_dashboard',
        ])->assertOk();

        $response->assertJsonPath('user.role', 'community_admin');
    }

    public function test_resident_rejected_from_community_admin_dashboard(): void
    {
        $email = 'plain.resident@example.com';

        User::factory()->create([
            'email' => $email,
            'email_verified_at' => now(),
            'phone' => '+15555550113',
            'phone_verified_at' => now(),
            'role' => 'resident',
        ]);

        $message = 'Account not found. Please verify your email address and try again.';

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'login',
            'portal' => 'community_admin_dashboard',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'ACCOUNT_NOT_FOUND')
            ->assertJsonPath('message', $message);

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'login',
        ])->assertStatus(202);

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '123456',
            'intent' => 'login',
            'portal' => 'community_admin_dashboard',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'ACCOUNT_NOT_FOUND')
            ->assertJsonPath('message', $message);
    }

    public function test_wrong_code_does_not_expire_a_valid_otp(): void
    {
        $email = 'retry.code@example.com';

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'signup',
        ])->assertStatus(202);

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '000000',
            'intent' => 'signup',
            'role' => 'admin',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'INVALID_OTP');

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '123456',
            'intent' => 'signup',
            'role' => 'admin',
        ])->assertOk()
            ->assertJsonPath('user.email', $email);
    }

    public function test_hashed_otp_expires_when_it_is_not_the_master_code(): void
    {
        $email = 'expired.otp@example.com';
        $stored = '654321';

        EmailOtp::query()->create([
            'email' => $email,
            'code_hash' => hash_hmac('sha256', $stored, (string) config('app.key')),
            'attempts' => 0,
            'expires_at' => now()->subMinute(),
        ]);

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => $stored,
            'intent' => 'signup',
            'role' => 'resident',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'INVALID_OTP');
    }

    public function test_configured_master_otp_works_only_for_allowlisted_email_after_expiry(): void
    {
        $reviewer = 'test.resident@havena.app';

        User::factory()->create([
            'email' => $reviewer,
            'email_verified_at' => now(),
            'phone' => '+15555550114',
        ]);

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $reviewer,
            'intent' => 'login',
        ])->assertStatus(202);

        $this->travel(30)->minutes();

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $reviewer,
            'code' => '123456',
            'intent' => 'login',
        ])->assertOk()
            ->assertJsonPath('user.email', $reviewer);

        $other = 'real.user@example.com';

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $other,
            'intent' => 'signup',
        ])->assertStatus(202);

        $this->travel(30)->minutes();

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $other,
            'code' => '123456',
            'intent' => 'signup',
            'role' => 'resident',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'INVALID_OTP');
    }

    public function test_gohavena_demo_otp_works_only_for_showcase_emails(): void
    {
        $resident = 'resident@gohavena.com';
        $admin = 'community@gohavena.com';

        User::factory()->create([
            'email' => $resident,
            'email_verified_at' => now(),
            'phone' => '+16175551901',
            'role' => 'resident',
        ]);
        User::factory()->create([
            'email' => $admin,
            'email_verified_at' => now(),
            'phone' => '+16175551902',
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
        ]);

        Mail::fake();
        config(['mail.default' => 'smtp']);

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $resident,
            'intent' => 'login',
        ])->assertStatus(202);

        Mail::assertNothingSent();

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $resident,
            'code' => '221322',
            'intent' => 'login',
        ])->assertOk()
            ->assertJsonPath('user.email', $resident);

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $admin,
            'intent' => 'login',
        ])->assertStatus(202);

        $this->travel(30)->minutes();

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $admin,
            'code' => '221322',
            'intent' => 'login',
        ])->assertOk()
            ->assertJsonPath('user.email', $admin);

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $resident,
            'code' => '123456',
            'intent' => 'login',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'INVALID_OTP');

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => 'real.user@example.com',
            'intent' => 'signup',
        ])->assertStatus(202);

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => 'real.user@example.com',
            'code' => '221322',
            'intent' => 'signup',
            'role' => 'resident',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'INVALID_OTP');
    }

    public function test_client_fallback_otp_does_not_replace_emailed_code(): void
    {
        $email = 'umer@namuve.com';

        User::factory()->create([
            'email' => $email,
            'email_verified_at' => now(),
            'phone' => '+923001112233',
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
        ]);

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'login',
        ])->assertStatus(202);

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '123456',
            'intent' => 'login',
        ])->assertOk()
            ->assertJsonPath('user.email', $email);

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'login',
        ])->assertStatus(202);

        $this->travel(30)->minutes();

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '221322',
            'intent' => 'login',
        ])->assertOk()
            ->assertJsonPath('user.email', $email);
    }
}
