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
