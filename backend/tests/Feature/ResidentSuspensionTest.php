<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use App\Services\CommunityLifecycleService;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ResidentSuspensionTest extends TestCase
{
    use RefreshDatabase;

    private function seedResidentWithCommunity(): array
    {
        $region = Region::query()->create([
            'title'       => 'Cairo Metro',
            'area'        => 'Cairo',
            'users_label' => '0 users',
            'sort_order'  => 1,
            'status'      => 'active',
        ]);

        $community = Community::query()->create([
            'name'          => 'Oak Valley',
            'region_id'     => $region->id,
            'region'        => $region->title,
            'status'        => 'active',
            'review_status' => 'approved',
        ]);

        $resident = User::factory()->create([
            'role'              => 'resident',
            'status'            => 'active',
            'phone'             => '+201700000099',
            'phone_verified_at' => now(),
            'email'             => 'suspended.resident@example.com',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $resident->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        return compact('community', 'resident');
    }

    public function test_suspended_resident_blocked_on_otp_request(): void
    {
        ['resident' => $resident] = $this->seedResidentWithCommunity();

        $resident->update([
            'status'            => 'suspended',
            'suspension_reason' => CommunityLifecycleService::REASON_MEMBER_SUSPENDED,
        ]);
        CommunityMembership::query()->where('user_id', $resident->id)->update(['status' => 'banned']);

        $this->postJson('/api/v1/auth/otp/request', [
            'email'  => $resident->email,
            'intent' => 'login',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'ACCOUNT_SUSPENDED');
    }

    public function test_suspended_resident_blocked_on_otp_verify(): void
    {
        ['resident' => $resident] = $this->seedResidentWithCommunity();

        $resident->update([
            'status'            => 'suspended',
            'suspension_reason' => CommunityLifecycleService::REASON_MEMBER_SUSPENDED,
        ]);
        CommunityMembership::query()->where('user_id', $resident->id)->update(['status' => 'banned']);

        $this->postJson('/api/v1/auth/otp/verify', [
            'email'  => $resident->email,
            'code'   => '123456',
            'intent' => 'login',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'ACCOUNT_SUSPENDED');
    }

    public function test_admin_suspend_member_blocks_mobile_login(): void
    {
        $this->seed(SystemAdminSeeder::class);
        ['community' => $community, 'resident' => $resident] = $this->seedResidentWithCommunity();

        $admin = User::query()->where('email', 'admin@havena.app')->firstOrFail();
        Sanctum::actingAs($admin);

        $this->patchJson("/api/v1/admin/members/{$resident->id}/suspend", [
            'community_id' => $community->id,
        ])->assertOk();

        $this->assertSame('suspended', $resident->fresh()->status);
        $this->assertSame('banned', CommunityMembership::query()
            ->where('user_id', $resident->id)
            ->value('status'));

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/feed')
            ->assertStatus(403)
            ->assertJsonPath('code', 'ACCOUNT_SUSPENDED')
            ->assertJsonStructure(['suspended_at']);

        $this->postJson('/api/v1/auth/otp/request', [
            'email'  => $resident->email,
            'intent' => 'login',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'ACCOUNT_SUSPENDED');
    }

    public function test_suspended_resident_me_endpoint_revokes_access(): void
    {
        ['resident' => $resident] = $this->seedResidentWithCommunity();

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/me')->assertOk();

        $resident->update([
            'status'            => 'suspended',
            'suspension_reason' => CommunityLifecycleService::REASON_MEMBER_SUSPENDED,
        ]);
        CommunityMembership::query()->where('user_id', $resident->id)->update(['status' => 'banned']);

        $this->getJson('/api/v1/me')
            ->assertStatus(403)
            ->assertJsonPath('code', 'ACCOUNT_SUSPENDED')
            ->assertJsonStructure(['suspended_at']);
    }

    public function test_suspended_resident_feed_endpoint_returns_block_details(): void
    {
        ['resident' => $resident] = $this->seedResidentWithCommunity();

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/feed')->assertOk();

        $resident->update([
            'status'            => 'suspended',
            'suspension_reason' => CommunityLifecycleService::REASON_MEMBER_SUSPENDED,
        ]);
        CommunityMembership::query()->where('user_id', $resident->id)->update(['status' => 'banned']);

        $this->getJson('/api/v1/feed')
            ->assertStatus(403)
            ->assertJsonPath('code', 'ACCOUNT_SUSPENDED')
            ->assertJsonStructure(['suspended_at']);
    }
}
