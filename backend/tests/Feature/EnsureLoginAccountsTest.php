<?php

namespace Tests\Feature;

use Database\Seeders\TgiCommunitySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EnsureLoginAccountsTest extends TestCase
{
    use RefreshDatabase;

    public function test_command_restores_platform_and_tgi_admin_logins(): void
    {
        $this->artisan('havena:ensure-login-accounts')->assertSuccessful();

        $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@havena.app',
            'password' => 'password',
        ])->assertOk()
            ->assertJsonPath('user.role', 'system_admin');

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => TgiCommunitySeeder::ADMIN_EMAIL,
            'intent' => 'login',
            'portal' => 'community_admin_dashboard',
        ])->assertStatus(202)
            ->assertJsonPath('data.email', TgiCommunitySeeder::ADMIN_EMAIL);
    }

    public function test_phpunit_does_not_target_live_database(): void
    {
        $this->assertSame('testing', app()->environment());
        $this->assertSame(
            'havena_test',
            config('database.connections.'.config('database.default').'.database'),
        );
    }
}
