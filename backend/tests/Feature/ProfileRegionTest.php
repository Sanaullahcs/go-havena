<?php

namespace Tests\Feature;

use App\Models\Region;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProfileRegionTest extends TestCase
{
    use RefreshDatabase;

    private function seedRegion(): Region
    {
        return Region::query()->create([
            'title'       => 'Test Region',
            'area'        => 'Test Area',
            'users_label' => '0 users',
            'sort_order'  => 1,
            'status'      => 'active',
        ]);
    }

    public function test_pending_community_admin_can_save_region_with_mobile_token(): void
    {
        $region = $this->seedRegion();

        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'pending',
            'phone'                  => '+201700000099',
            'phone_verified_at'      => now(),
        ]);

        $admin->profile()->create(['display_name' => '']);

        $token = $admin->createToken('mobile')->plainTextToken;

        $this->withToken($token)
            ->putJson('/api/v1/me', ['region_id' => $region->id])
            ->assertOk()
            ->assertJsonPath('data.profile.region_id', $region->id);

        $this->assertSame($region->id, $admin->fresh()->profile?->region_id);
    }

    public function test_pending_community_admin_me_blocked_with_web_admin_token(): void
    {
        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'pending',
            'phone'                  => '+201700000098',
            'phone_verified_at'      => now(),
        ]);

        $token = $admin->createToken('web-admin')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/me')
            ->assertStatus(403)
            ->assertJsonPath('code', 'COMMUNITY_ADMIN_PENDING');
    }
}
