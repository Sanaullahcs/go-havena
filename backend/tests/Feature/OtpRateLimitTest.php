<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Tests\TestCase;

class OtpRateLimitTest extends TestCase
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
        Config::set('otp.verify_fail_threshold', 3);
        Config::set('otp.verify_fail_lock_seconds', 900);
        Config::set('otp.verify_fail_lock_schedule', [900, 1800, 3600]);
        Cache::flush();
    }

    public function test_otp_request_returns_rate_limit_metadata(): void
    {
        $email = 'ratelimit.meta@example.com';
        User::factory()->create(['email' => $email, 'email_verified_at' => now()]);

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'login',
        ])
            ->assertStatus(202)
            ->assertJsonPath('data.rate_limit.resends_remaining', 3)
            ->assertJsonPath('data.rate_limit.locked', false);
    }

    public function test_resend_cooldown_blocks_back_to_back_requests(): void
    {
        $email = 'ratelimit.cooldown@example.com';
        User::factory()->create(['email' => $email, 'email_verified_at' => now()]);

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'login',
        ])->assertStatus(202);

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'login',
        ])
            ->assertStatus(429)
            ->assertJsonPath('code', 'OTP_COOLDOWN')
            ->assertJsonStructure(['retry_after_seconds', 'rate_limit']);
    }

    public function test_fourth_send_returns_locked_rate_limit_in_success_payload(): void
    {
        Config::set('otp.resend_cooldown_seconds', 0);

        $email = 'ratelimit.fourth@example.com';
        User::factory()->create(['email' => $email, 'email_verified_at' => now()]);

        for ($i = 0; $i < 3; $i++) {
            $this->postJson('/api/v1/auth/otp/request', [
                'email' => $email,
                'intent' => 'login',
            ])->assertStatus(202);
        }

        $fourth = $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'login',
        ])
            ->assertStatus(202)
            ->assertJsonPath('data.rate_limit.locked', true)
            ->assertJsonPath('data.rate_limit.lock_type', 'resend_limit');

        $retryAfter = (int) $fourth->json('data.rate_limit.retry_after_seconds');
        $this->assertGreaterThanOrEqual(890, $retryAfter);
        $this->assertLessThanOrEqual(900, $retryAfter);
    }

    public function test_max_resends_triggers_fifteen_minute_lock(): void
    {
        Config::set('otp.resend_cooldown_seconds', 0);

        $email = 'ratelimit.resends@example.com';
        User::factory()->create(['email' => $email, 'email_verified_at' => now()]);

        for ($i = 0; $i < 4; $i++) {
            $this->postJson('/api/v1/auth/otp/request', [
                'email' => $email,
                'intent' => 'login',
            ])->assertStatus(202);
        }

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'login',
        ])
            ->assertStatus(429)
            ->assertJsonPath('code', 'OTP_RESEND_LOCKED')
            ->assertJsonPath('rate_limit.lock_type', 'resend_limit');
    }

    public function test_wrong_otp_after_resend_lock_expires_triggers_security_lock(): void
    {
        Config::set('otp.resend_cooldown_seconds', 0);

        $email = 'ratelimit.security@example.com';
        User::factory()->create(['email' => $email, 'email_verified_at' => now()]);

        for ($i = 0; $i < 4; $i++) {
            $this->postJson('/api/v1/auth/otp/request', [
                'email' => $email,
                'intent' => 'login',
            ])->assertStatus(202);
        }

        $this->travel(901)->seconds();

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '000000',
            'intent' => 'login',
        ])
            ->assertStatus(429)
            ->assertJsonPath('code', 'OTP_VERIFY_LOCKED')
            ->assertJsonPath('rate_limit.lock_type', 'security');
    }

    public function test_wrong_verify_extends_resend_cooldown_before_lock(): void
    {
        Config::set('otp.resend_cooldown_seconds', 60);

        $email = 'ratelimit.verify.cooldown@example.com';
        User::factory()->create(['email' => $email, 'email_verified_at' => now()]);

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'login',
        ])->assertStatus(202);

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '000000',
            'intent' => 'login',
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'INVALID_OTP')
            ->assertJsonPath('rate_limit.verify_fail_count', 1)
            ->assertJsonPath('rate_limit.retry_after_seconds', 60);

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'login',
        ])
            ->assertStatus(429)
            ->assertJsonPath('code', 'OTP_COOLDOWN');
    }

    public function test_second_wrong_verify_doubles_resend_cooldown(): void
    {
        Config::set('otp.resend_cooldown_seconds', 60);

        $email = 'ratelimit.verify.cooldown2@example.com';
        User::factory()->create(['email' => $email, 'email_verified_at' => now()]);

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'login',
        ])->assertStatus(202);

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '000000',
            'intent' => 'login',
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'INVALID_OTP');

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '000000',
            'intent' => 'login',
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'INVALID_OTP')
            ->assertJsonPath('rate_limit.verify_fail_count', 2)
            ->assertJsonPath('rate_limit.retry_after_seconds', 120);
    }

    public function test_three_wrong_verifies_trigger_fifteen_minute_security_lock(): void
    {
        Config::set('otp.resend_cooldown_seconds', 0);

        $email = 'ratelimit.verify.lock@example.com';
        User::factory()->create(['email' => $email, 'email_verified_at' => now()]);

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'login',
        ])->assertStatus(202);

        for ($i = 0; $i < 2; $i++) {
            $this->postJson('/api/v1/auth/otp/verify', [
                'email' => $email,
                'code' => '000000',
                'intent' => 'login',
            ])
                ->assertStatus(422)
                ->assertJsonPath('code', 'INVALID_OTP');
        }

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '000000',
            'intent' => 'login',
        ])
            ->assertStatus(429)
            ->assertJsonPath('code', 'OTP_VERIFY_LOCKED')
            ->assertJsonPath('rate_limit.lock_type', 'security')
            ->assertJsonPath('rate_limit.retry_after_seconds', 900);
    }

    public function test_verify_lock_escalates_on_repeat_offenses(): void
    {
        Config::set('otp.resend_cooldown_seconds', 0);

        $email = 'ratelimit.verify.escalate@example.com';
        User::factory()->create(['email' => $email, 'email_verified_at' => now()]);

        $this->triggerVerifySecurityLock($email);
        $this->travel(901)->seconds();

        $this->triggerVerifySecurityLock($email);
        $this->travel(1801)->seconds();

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'login',
        ])->assertStatus(202);

        for ($i = 0; $i < 2; $i++) {
            $this->postJson('/api/v1/auth/otp/verify', [
                'email' => $email,
                'code' => '000000',
                'intent' => 'login',
            ])->assertStatus(422);
        }

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '000000',
            'intent' => 'login',
        ])
            ->assertStatus(429)
            ->assertJsonPath('code', 'OTP_VERIFY_LOCKED')
            ->assertJsonPath('rate_limit.retry_after_seconds', 3600);
    }

    private function triggerVerifySecurityLock(string $email): void
    {
        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'login',
        ])->assertStatus(202);

        for ($i = 0; $i < 3; $i++) {
            $this->postJson('/api/v1/auth/otp/verify', [
                'email' => $email,
                'code' => '000000',
                'intent' => 'login',
            ])->assertStatus($i < 2 ? 422 : 429);
        }
    }

    public function test_successful_verify_clears_rate_limit_state(): void
    {
        $email = 'ratelimit.clear@example.com';
        User::factory()->create(['email' => $email, 'email_verified_at' => now()]);

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'login',
        ])->assertStatus(202);

        Config::set('otp.resend_cooldown_seconds', 0);

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '123456',
            'intent' => 'login',
        ])->assertOk();

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'login',
        ])->assertStatus(202);
    }
}
