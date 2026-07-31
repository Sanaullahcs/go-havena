<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use App\Services\CommunityLifecycleService;
use App\Services\OtpService;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CommunityLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private function seedApprovedCommunity(): array
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

        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
            'phone'                  => '+201700000010',
        ]);

        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000011',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $resident->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        return compact('region', 'community', 'admin', 'resident');
    }

    public function test_deactivating_community_suspends_admins_and_residents(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedApprovedCommunity();

        app(CommunityLifecycleService::class)->deactivateCommunity($community->fresh());

        $this->assertSame('inactive', $community->fresh()->status);
        $this->assertSame('suspended', $admin->fresh()->status);
        $this->assertSame('community_deactivated', $admin->fresh()->suspension_reason);
        $this->assertSame('suspended', $resident->fresh()->status);
        $this->assertSame('community_deactivated', $resident->fresh()->suspension_reason);
    }

    public function test_reactivating_community_restores_members(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedApprovedCommunity();
        $lifecycle = app(CommunityLifecycleService::class);

        $lifecycle->deactivateCommunity($community->fresh());
        $lifecycle->activateCommunity($community->fresh());

        $this->assertSame('active', $community->fresh()->status);
        $this->assertSame('active', $admin->fresh()->status);
        $this->assertSame('active', $resident->fresh()->status);
    }

    public function test_suspending_community_admin_does_not_deactivate_community_or_residents(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedApprovedCommunity();

        app(CommunityLifecycleService::class)->suspendCommunityAdmin($admin);

        $this->assertSame('active', $community->fresh()->status);
        $this->assertSame('suspended', $admin->fresh()->status);
        $this->assertSame('admin_suspended', $admin->fresh()->suspension_reason);
        $this->assertSame('active', $resident->fresh()->status);
    }

    public function test_otp_login_blocked_for_deactivated_community(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedApprovedCommunity();
        app(CommunityLifecycleService::class)->deactivateCommunity($community->fresh());

        $this->mock(OtpService::class, function ($mock) {
            $mock->shouldReceive('verify')->andReturn(true);
        });

        $this->postJson('/api/v1/auth/otp/verify', [
            'phone' => $resident->phone,
            'code'  => '123456',
            'intent' => 'login',
        ])->assertStatus(422)
            ->assertJsonPath('code', 'COMMUNITY_DEACTIVATED');
    }

    public function test_system_admin_can_toggle_community_status_via_api(): void
    {
        $this->seed(SystemAdminSeeder::class);
        Sanctum::actingAs(User::query()->where('email', 'admin@neighborlink.app')->firstOrFail());

        ['community' => $community] = $this->seedApprovedCommunity();

        $this->patchJson("/api/v1/admin/communities/{$community->id}/status", [
            'status' => 'inactive',
        ])->assertOk()
            ->assertJsonPath('data.status', 'inactive');
    }
}
