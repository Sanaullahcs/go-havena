<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthOtpTest extends TestCase
{
    use RefreshDatabase;

    public function test_signup_otp_request_and_verify_flow(): void
    {
        $phone = '+15555555555';

        $this->postJson('/api/v1/auth/otp/request', [
            'phone' => '55555555555',
            'intent' => 'signup',
        ])->assertStatus(202);

        $response = $this->postJson('/api/v1/auth/otp/verify', [
            'phone' => $phone,
            'code' => '123456',
            'intent' => 'signup',
            'role' => 'resident',
        ])->assertOk();

        $response->assertJsonStructure(['token', 'user' => ['id', 'uuid', 'phone', 'profile', 'memberships']]);
        $response->assertJsonPath('user.role', 'resident');

        $token = $response->json('token');

        $this->withToken($token)
            ->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.phone', $phone);
    }

    public function test_admin_signup_creates_pending_community_admin(): void
    {
        $phone = '+15556667777';

        $this->postJson('/api/v1/auth/otp/request', [
            'phone' => $phone,
            'intent' => 'signup',
        ])->assertStatus(202);

        $response = $this->postJson('/api/v1/auth/otp/verify', [
            'phone' => $phone,
            'code' => '123456',
            'intent' => 'signup',
            'role' => 'admin',
        ])->assertOk();

        $response->assertJsonPath('user.role', 'community_admin');
        $response->assertJsonPath('user.community_admin_status', 'pending');
    }

    public function test_signup_rejects_existing_verified_user(): void
    {
        $phone = '+15555555555';

        User::factory()->create([
            'phone' => $phone,
            'phone_verified_at' => now(),
            'email' => '55555555555@phone.havena.local',
        ]);

        $this->postJson('/api/v1/auth/otp/request', [
            'phone' => $phone,
            'intent' => 'signup',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'ACCOUNT_EXISTS_USE_LOGIN');
    }

    public function test_login_rejects_unknown_phone_on_request(): void
    {
        $this->postJson('/api/v1/auth/otp/request', [
            'phone' => '+15555555555',
            'intent' => 'login',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'ACCOUNT_NOT_FOUND_USE_SIGNUP');
    }

    public function test_login_otp_flow_for_existing_user(): void
    {
        $phone = '+15555555555';

        User::factory()->create([
            'phone' => $phone,
            'phone_verified_at' => now(),
            'email' => '55555555555@phone.havena.local',
        ]);

        $this->postJson('/api/v1/auth/otp/request', [
            'phone' => $phone,
            'intent' => 'login',
        ])->assertStatus(202);

        $response = $this->postJson('/api/v1/auth/otp/verify', [
            'phone' => $phone,
            'code' => '123456',
            'intent' => 'login',
        ])->assertOk();

        $response->assertJsonStructure(['token', 'user']);
    }

    public function test_join_by_invite_code(): void
    {
        $this->seed(\Database\Seeders\CommunitySeeder::class);

        $phone = '+15555555555';

        $this->postJson('/api/v1/auth/otp/request', [
            'phone' => $phone,
            'intent' => 'signup',
        ])->assertStatus(202);

        $verify = $this->postJson('/api/v1/auth/otp/verify', [
            'phone' => $phone,
            'code' => '123456',
            'intent' => 'signup',
            'role' => 'resident',
        ])->assertOk();

        $token = $verify->json('token');

        $this->withToken($token)
            ->postJson('/api/v1/communities/join-by-invite', ['invite_code' => 'MAPLE-2024-XYZ'])
            ->assertCreated()
            ->assertJsonPath('data.membership.status', 'approved')
            ->assertJsonPath('data.community.name', 'Oak Valley Residences');
    }

    public function test_community_admin_dashboard_otp_login(): void
    {
        $phone = '+15556668888';

        User::factory()->create([
            'phone' => $phone,
            'phone_verified_at' => now(),
            'email' => 'community.admin@havena.app',
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
        ]);

        $this->postJson('/api/v1/auth/otp/request', [
            'phone' => $phone,
            'intent' => 'login',
            'portal' => 'community_admin_dashboard',
        ])->assertStatus(202);

        $response = $this->postJson('/api/v1/auth/otp/verify', [
            'phone' => $phone,
            'code' => '123456',
            'intent' => 'login',
            'portal' => 'community_admin_dashboard',
        ])->assertOk();

        $response->assertJsonPath('user.role', 'community_admin');
    }

    public function test_resident_rejected_from_community_admin_dashboard(): void
    {
        $phone = '+15555555555';

        User::factory()->create([
            'phone' => $phone,
            'phone_verified_at' => now(),
            'email' => '55555555555@phone.havena.local',
            'role' => 'resident',
        ]);

        $this->postJson('/api/v1/auth/otp/request', [
            'phone' => $phone,
            'intent' => 'login',
            'portal' => 'community_admin_dashboard',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'NOT_AUTHORIZED_COMMUNITY_ADMIN');

        $this->postJson('/api/v1/auth/otp/request', [
            'phone' => $phone,
            'intent' => 'login',
        ])->assertStatus(202);

        $this->postJson('/api/v1/auth/otp/verify', [
            'phone' => $phone,
            'code' => '123456',
            'intent' => 'login',
            'portal' => 'community_admin_dashboard',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'NOT_AUTHORIZED_COMMUNITY_ADMIN');
    }

    public function test_community_admin_dashboard_otp_login_with_misstored_international_phone(): void
    {
        User::factory()->create([
            'phone' => '+12017777777',
            'phone_verified_at' => now(),
            'email' => '2017777777@phone.havena.local',
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
        ]);

        $this->postJson('/api/v1/auth/otp/request', [
            'phone' => '+2017777777',
            'intent' => 'login',
            'portal' => 'community_admin_dashboard',
        ])->assertStatus(202)
            ->assertJsonPath('data.phone', '+2017777777');

        $this->assertDatabaseHas('users', [
            'phone' => '+2017777777',
            'role' => 'community_admin',
        ]);

        $this->postJson('/api/v1/auth/otp/verify', [
            'phone' => '+2017777777',
            'code' => '123456',
            'intent' => 'login',
            'portal' => 'community_admin_dashboard',
        ])->assertOk()
            ->assertJsonPath('user.role', 'community_admin');
    }

    public function test_signup_completes_for_legacy_misstored_international_phone(): void
    {
        User::factory()->create([
            'phone' => '+12018888888',
            'phone_verified_at' => null,
            'email' => '12018888888@phone.havena.local',
            'role' => 'resident',
        ]);

        $this->postJson('/api/v1/auth/otp/request', [
            'phone' => '+201888888888',
            'intent' => 'signup',
        ])->assertStatus(202);

        $response = $this->postJson('/api/v1/auth/otp/verify', [
            'phone' => '+201888888888',
            'code' => '123456',
            'intent' => 'signup',
            'role' => 'resident',
        ])->assertOk();

        $response->assertJsonPath('user.phone', '+201888888888');

        $this->assertDatabaseHas('users', [
            'phone' => '+201888888888',
            'email' => '201888888888@phone.havena.local',
        ]);
    }

    public function test_otp_expires_after_two_minutes(): void
    {
        $phone = '+15555555555';

        $this->postJson('/api/v1/auth/otp/request', [
            'phone' => $phone,
            'intent' => 'signup',
        ])->assertStatus(202);

        $this->travel(3)->minutes();

        $this->postJson('/api/v1/auth/otp/verify', [
            'phone' => $phone,
            'code' => '123456',
            'intent' => 'signup',
            'role' => 'resident',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'INVALID_OTP');
    }
}
