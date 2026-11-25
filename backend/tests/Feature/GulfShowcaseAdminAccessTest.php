<?php

namespace Tests\Feature;

use Database\Seeders\GulfCommunitiesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class GulfShowcaseAdminAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_doha_showcase_admin_skips_post_login_profile_and_billing(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $this->seed(GulfCommunitiesSeeder::class);

        $admin = \App\Models\User::query()->where('email', 'admin.doha@gohavena.com')->first();
        $this->assertNotNull($admin);

        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.profile_complete', true)
            ->assertJsonPath('data.access.billing_complete', true)
            ->assertJsonPath('data.access.next_step', 'ready')
            ->assertJsonPath('data.access.can_use_dashboard', true);
    }
}