<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SystemAdminLoginTest extends TestCase
{
    use RefreshDatabase;

    public function test_system_admin_can_login_with_email_and_password(): void
    {
        $this->seed(SystemAdminSeeder::class);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@neighborlink.app',
            'password' => 'password',
        ]);

        $response->assertOk()
            ->assertJsonStructure(['token', 'user' => ['id', 'email', 'role']]);

        $this->assertSame('system_admin', $response->json('user.role'));
    }

    public function test_system_admin_login_rejects_wrong_password(): void
    {
        User::factory()->create([
            'email' => 'admin@neighborlink.app',
            'password' => 'password',
            'role' => 'system_admin',
            'status' => 'active',
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@neighborlink.app',
            'password' => 'wrong-password',
        ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['email']);
    }
}
