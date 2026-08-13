<?php

namespace Tests\Feature;

use App\Models\Region;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CommunityAdminSelfServeTest extends TestCase
{
    use RefreshDatabase;

    public function test_unknown_phone_can_signup_via_community_admin_portal_otp(): void
    {
        $phone = '+15553334444';

        $this->postJson('/api/v1/auth/otp/request', [
            'phone' => $phone,
            'intent' => 'signup',
            'portal' => 'community_admin_dashboard',
        ])->assertStatus(202);

        $verify = $this->postJson('/api/v1/auth/otp/verify', [
            'phone' => $phone,
            'code' => '123456',
            'intent' => 'signup',
            'role' => 'admin',
            'portal' => 'community_admin_dashboard',
        ])->assertOk();

        $verify->assertJsonPath('user.role', 'community_admin')
            ->assertJsonPath('user.community_admin_status', 'pending');

        $this->assertDatabaseHas('users', [
            'phone' => $phone,
            'role' => 'community_admin',
            'community_admin_status' => 'pending',
        ]);
    }

    public function test_self_serve_creates_pending_community_and_membership(): void
    {
        $region = Region::query()->create([
            'title' => 'Florida',
            'area' => 'FL',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'pending',
            'status' => 'active',
            'name' => '',
        ]);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/communities/self-serve', [
            'community_name' => 'Palm Court HOA',
            'address' => '100 Palm Ave, Miami, FL',
            'region_id' => $region->id,
            'estimated_residents' => 120,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.community.name', 'Palm Court HOA')
            ->assertJsonPath('data.membership.role', 'admin')
            ->assertJsonPath('data.membership.status', 'pending')
            ->assertJsonPath('data.access.next_step', 'complete_profile');

        $this->assertDatabaseHas('communities', [
            'name' => 'Palm Court HOA',
            'status' => 'inactive',
            'review_status' => 'pending',
            'estimated_residents' => 120,
        ]);
    }
}
