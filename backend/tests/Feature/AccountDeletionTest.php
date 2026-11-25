<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccountDeletionTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_delete_their_account(): void
    {
        $user = User::factory()->create([
            'phone' => '+15555550999',
            'phone_verified_at' => now(),
            'status' => 'active',
        ]);
        $token = $user->createToken('mobile')->plainTextToken;

        $this->withToken($token)
            ->deleteJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('message', 'Account deleted');

        $this->assertSoftDeleted('users', ['id' => $user->id]);
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $user->id]);
        $this->assertNull(User::query()->where('phone', '+15555550999')->first());
    }

    public function test_guest_cannot_delete_an_account(): void
    {
        $this->deleteJson('/api/v1/me')->assertUnauthorized();
    }
}
