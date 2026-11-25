<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\User;
use Database\Seeders\BostonDemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BostonDemoAccountsTest extends TestCase
{
    use RefreshDatabase;

    public function test_boston_showcase_accounts_are_presentation_ready(): void
    {
        $this->seed(BostonDemoSeeder::class);

        $community = Community::query()->where('name', BostonDemoSeeder::COMMUNITY_NAME)->first();
        $this->assertNotNull($community);
        $this->assertSame('Massachusetts - Boston', $community->region);
        $this->assertSame(BostonDemoSeeder::COMMUNITY_ADDRESS, $community->address);
        $this->assertSame('approved', $community->review_status);

        $resident = User::query()->where('email', BostonDemoSeeder::RESIDENT_EMAIL)->first();
        $admin = User::query()->where('email', BostonDemoSeeder::ADMIN_EMAIL)->first();

        $this->assertNotNull($resident);
        $this->assertSame('James Whitaker', $resident->name);
        $this->assertSame('resident', $resident->role);
        $this->assertSame('1204', $resident->profile?->unit_number);
        $this->assertSame('homeowner', $resident->profile?->residence_type);

        $this->assertNotNull($admin);
        $this->assertSame('Elena Vasquez', $admin->name);
        $this->assertSame('community_admin', $admin->role);
        $this->assertSame('approved', $admin->community_admin_status);

        $this->assertTrue(
            $resident->memberships->contains(
                fn ($m) => (int) $m->community_id === (int) $community->id
                    && $m->role === 'member'
                    && $m->status === 'approved',
            ),
        );
        $this->assertTrue(
            $admin->memberships->contains(
                fn ($m) => (int) $m->community_id === (int) $community->id
                    && $m->role === 'admin'
                    && $m->status === 'approved',
            ),
        );

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => BostonDemoSeeder::RESIDENT_EMAIL,
            'intent' => 'login',
        ])->assertStatus(202);

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => BostonDemoSeeder::RESIDENT_EMAIL,
            'code' => BostonDemoSeeder::DEMO_OTP,
            'intent' => 'login',
        ])->assertOk()
            ->assertJsonPath('user.email', BostonDemoSeeder::RESIDENT_EMAIL)
            ->assertJsonPath('user.profile.display_name', 'James Whitaker');

        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.profile_complete', true)
            ->assertJsonPath('data.access.billing_complete', true)
            ->assertJsonPath('data.access.next_step', 'ready')
            ->assertJsonPath('data.access.can_use_mobile_app', true);
    }
}
