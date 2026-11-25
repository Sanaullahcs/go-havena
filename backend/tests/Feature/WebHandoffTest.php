<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WebHandoffTest extends TestCase
{
    use RefreshDatabase;

    private function seedAdmin(): User
    {
        $region = Region::query()->create([
            'title' => 'Handoff Region',
            'area' => 'Test Area',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $community = Community::query()->create([
            'name' => 'Handoff Community',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '1 Test Lane',
            'status' => 'active',
            'review_status' => 'pending',
        ]);

        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'pending',
            'phone' => '+15551230001',
            'phone_verified_at' => now(),
        ]);

        CommunityMembership::query()->create([
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'pending',
        ]);

        return $admin;
    }

    public function test_mobile_session_can_create_and_consume_web_handoff(): void
    {
        $admin = $this->seedAdmin();
        $mobileToken = $admin->createToken('mobile')->plainTextToken;

        $create = $this->withToken($mobileToken)
            ->postJson('/api/v1/auth/web-handoff')
            ->assertOk()
            ->assertJsonStructure(['code', 'expires_in']);

        $code = $create->json('code');
        $this->assertNotEmpty($code);

        $consume = $this->postJson('/api/v1/auth/web-handoff/consume', ['code' => $code])
            ->assertOk()
            ->assertJsonStructure(['token', 'user' => ['id', 'role', 'access']]);

        $this->assertSame('community_admin', $consume->json('user.role'));
        $this->assertSame('complete_billing_web', $consume->json('user.access.next_step'));

        $webToken = $consume->json('token');
        $this->withToken($webToken)
            ->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.id', $admin->id);

        $this->postJson('/api/v1/auth/web-handoff/consume', ['code' => $code])
            ->assertStatus(422)
            ->assertJsonPath('code', 'HANDOFF_EXPIRED');
    }

    public function test_guest_cannot_create_web_handoff(): void
    {
        $this->postJson('/api/v1/auth/web-handoff')->assertStatus(401);
    }

    public function test_unknown_handoff_code_is_rejected(): void
    {
        $this->postJson('/api/v1/auth/web-handoff/consume', [
            'code' => str_repeat('a', 40),
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'HANDOFF_EXPIRED');
    }
}
