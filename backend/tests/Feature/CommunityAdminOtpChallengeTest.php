<?php

namespace Tests\Feature;

use App\Models\EmailOtp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Tests\TestCase;

class CommunityAdminOtpChallengeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set('otp.rate_limit_enabled', true);
        Config::set('otp.resend_cooldown_seconds', 60);
        Config::set('otp.max_resends', 3);
        Config::set('otp.resend_lock_seconds', 900);
        Config::set('otp.wrong_verify_lock_seconds', 3600);
        Config::set('otp.expire_minutes', 5);
        Cache::flush();
    }

    public function test_signup_request_reaches_verify_and_exposes_challenge(): void
    {
        $email = 'ca.challenge.start@example.com';

        $request = $this->requestSignupOtp($email)->assertStatus(202);

        $this->assertDatabaseCount('email_otps', 1);
        $this->assertNotNull($request->json('data.expires_at'));

        $this->getChallenge($email)
            ->assertOk()
            ->assertJsonPath('data.active', true)
            ->assertJsonPath('data.email', $email)
            ->assertJsonPath('data.expires_at', $request->json('data.expires_at'));
    }

    public function test_challenge_lookup_does_not_issue_a_new_otp_or_change_expiry(): void
    {
        $email = 'ca.challenge.reuse@example.com';

        $this->requestSignupOtp($email)->assertStatus(202);

        $otp = EmailOtp::query()->where('email', $email)->first();
        $this->assertNotNull($otp);
        $expiresAt = $otp->expires_at?->toIso8601String();
        $hash = $otp->code_hash;

        $this->travel(15)->seconds();

        $this->getChallenge($email)
            ->assertOk()
            ->assertJsonPath('data.active', true)
            ->assertJsonPath('data.expires_at', $expiresAt);

        $this->assertDatabaseCount('email_otps', 1);
        $this->assertDatabaseHas('email_otps', [
            'email' => $email,
            'code_hash' => $hash,
        ]);

        $fresh = EmailOtp::query()->where('email', $email)->first();
        $this->assertSame($expiresAt, $fresh?->expires_at?->toIso8601String());
    }

    public function test_existing_otp_still_verifies_after_challenge_lookup(): void
    {
        $email = 'ca.challenge.verify@example.com';

        $this->requestSignupOtp($email)->assertStatus(202);
        $this->getChallenge($email)->assertOk()->assertJsonPath('data.active', true);

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '123456',
            'intent' => 'signup',
            'role' => 'admin',
            'portal' => 'community_admin_dashboard',
        ])->assertOk()
            ->assertJsonPath('user.role', 'community_admin');
    }

    public function test_challenge_preserves_resend_cooldown(): void
    {
        $email = 'ca.challenge.cooldown@example.com';

        $request = $this->requestSignupOtp($email)->assertStatus(202);
        $retryAfter = (int) $request->json('data.rate_limit.retry_after_seconds');
        $this->assertGreaterThan(0, $retryAfter);

        $this->travel(12)->seconds();

        $challenge = $this->getChallenge($email)
            ->assertOk()
            ->assertJsonPath('data.active', true);

        $remaining = (int) $challenge->json('data.rate_limit.retry_after_seconds');
        $this->assertGreaterThan(0, $remaining);
        $this->assertLessThan($retryAfter, $remaining);
        $this->assertEqualsWithDelta($retryAfter - 12, $remaining, 1);
    }

    public function test_expired_challenge_is_inactive_and_does_not_keep_session(): void
    {
        $email = 'ca.challenge.expired@example.com';

        $this->requestSignupOtp($email)->assertStatus(202);
        $this->travel(302)->seconds();

        $this->getChallenge($email)
            ->assertOk()
            ->assertJsonPath('data.active', false)
            ->assertJsonMissingPath('data.expires_at');
    }

    public function test_challenge_lookup_does_not_bypass_rate_limiting(): void
    {
        $email = 'ca.challenge.ratelimit@example.com';

        $this->requestSignupOtp($email)->assertStatus(202);
        $this->getChallenge($email)->assertOk()->assertJsonPath('data.active', true);

        $this->requestSignupOtp($email)
            ->assertStatus(429)
            ->assertJsonPath('code', 'OTP_COOLDOWN');

        $this->assertDatabaseCount('email_otps', 1);
    }

    public function test_challenge_does_not_record_a_send_against_rate_limit(): void
    {
        Config::set('otp.resend_cooldown_seconds', 0);

        $email = 'ca.challenge.nosend@example.com';

        $this->requestSignupOtp($email)->assertStatus(202);

        for ($i = 0; $i < 5; $i++) {
            $this->getChallenge($email)->assertOk()->assertJsonPath('data.active', true);
        }

        $this->requestSignupOtp($email)->assertStatus(202);
        $this->assertDatabaseCount('email_otps', 1);
    }

    private function requestSignupOtp(string $email)
    {
        return $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'signup',
            'portal' => 'community_admin_dashboard',
        ]);
    }

    private function getChallenge(string $email)
    {
        return $this->getJson('/api/v1/auth/otp/challenge?'.http_build_query([
            'email' => $email,
            'intent' => 'signup',
            'portal' => 'community_admin_dashboard',
        ]));
    }
}
