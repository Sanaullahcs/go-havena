<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminMembersListTest extends TestCase
{
    use RefreshDatabase;

    public function test_members_list_includes_community_admins_with_membership(): void
    {
        $this->seed(SystemAdminSeeder::class);
        Sanctum::actingAs(User::query()->where('email', 'admin@neighborlink.app')->firstOrFail());

        $region = Region::query()->create([
            'title'       => 'Cairo Metro',
            'area'        => 'Cairo',
            'state'       => 'EG',
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

        $communityAdmin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
        ]);

        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $communityAdmin->id,
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

        $response = $this->getJson('/api/v1/admin/members?community_id=all');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id');

        $this->assertTrue($ids->contains($resident->id));
        $this->assertTrue($ids->contains($communityAdmin->id));
        $this->assertSame(2, $response->json('meta.stats.total'));
    }

    public function test_residents_list_excludes_community_admins_when_role_member_filter(): void
    {
        $this->seed(SystemAdminSeeder::class);
        Sanctum::actingAs(User::query()->where('email', 'admin@neighborlink.app')->firstOrFail());

        $region = Region::query()->create([
            'title'       => 'Cairo Metro',
            'area'        => 'Cairo',
            'state'       => 'EG',
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

        $communityAdmin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
        ]);

        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
        ]);

        $onboarding = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $communityAdmin->id,
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

        $response = $this->getJson('/api/v1/admin/members?community_id=all&role=member');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id');

        $this->assertTrue($ids->contains($resident->id));
        $this->assertTrue($ids->contains($onboarding->id));
        $this->assertFalse($ids->contains($communityAdmin->id));
        $this->assertSame(2, $response->json('meta.stats.total'));
        $this->assertSame(2, $response->json('meta.total'));
        $this->assertSame(1, $response->json('meta.stats.onboarding'));
    }

    public function test_onboarding_tab_lists_residents_without_membership(): void
    {
        $this->seed(SystemAdminSeeder::class);
        Sanctum::actingAs(User::query()->where('email', 'admin@neighborlink.app')->firstOrFail());

        User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
        ]);

        $response = $this->getJson('/api/v1/admin/members?community_id=all&role=member&status=onboarding');

        $response->assertOk();
        $this->assertSame(1, $response->json('meta.total'));
        $this->assertSame('onboarding', $response->json('data.0.status'));
    }

    public function test_community_admin_sees_self_in_members_list_when_only_member(): void
    {
        $region = Region::query()->create([
            'title'       => 'Cairo Metro',
            'area'        => 'Cairo',
            'state'       => 'EG',
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

        $communityAdmin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $communityAdmin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        Sanctum::actingAs($communityAdmin);

        $response = $this->getJson('/api/v1/admin/members');

        $response->assertOk();
        $this->assertSame(1, $response->json('meta.stats.total'));
        $this->assertSame(1, $response->json('meta.total'));
        $this->assertSame($communityAdmin->id, $response->json('data.0.id'));
    }

    public function test_community_admin_cannot_approve_system_rejected_resident(): void
    {
        $region = Region::query()->create([
            'title'       => 'Cairo Metro',
            'area'        => 'Cairo',
            'state'       => 'EG',
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

        $communityAdmin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
        ]);

        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $communityAdmin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        CommunityMembership::query()->create([
            'user_id'           => $resident->id,
            'community_id'      => $community->id,
            'role'              => 'member',
            'status'            => 'rejected',
            'rejection_reason'  => 'Incomplete documents',
            'rejected_by'       => 'system_admin',
        ]);

        Sanctum::actingAs($communityAdmin);

        $this->patchJson('/api/v1/admin/members/'.$resident->id.'/approve')
            ->assertStatus(403)
            ->assertJsonPath('code', 'SYSTEM_REJECTION_REQUIRES_SYSTEM_ADMIN');
    }

    public function test_system_admin_can_approve_system_rejected_resident(): void
    {
        $this->seed(SystemAdminSeeder::class);
        Sanctum::actingAs(User::query()->where('email', 'admin@neighborlink.app')->firstOrFail());

        $region = Region::query()->create([
            'title'       => 'Cairo Metro',
            'area'        => 'Cairo',
            'state'       => 'EG',
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
            'role'   => 'resident',
            'status' => 'active',
        ]);

        CommunityMembership::query()->create([
            'user_id'           => $resident->id,
            'community_id'      => $community->id,
            'role'              => 'member',
            'status'            => 'rejected',
            'rejection_reason'  => 'Policy violation',
            'rejected_by'       => 'system_admin',
        ]);

        $this->patchJson('/api/v1/admin/members/'.$resident->id.'/approve?community_id='.$community->id)
            ->assertOk();

        $this->assertDatabaseHas('community_memberships', [
            'user_id'      => $resident->id,
            'community_id' => $community->id,
            'status'       => 'approved',
            'rejected_by'  => null,
        ]);
    }

    public function test_community_admin_can_approve_community_rejected_resident(): void
    {
        $region = Region::query()->create([
            'title'       => 'Cairo Metro',
            'area'        => 'Cairo',
            'state'       => 'EG',
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

        $communityAdmin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
        ]);

        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $communityAdmin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        CommunityMembership::query()->create([
            'user_id'           => $resident->id,
            'community_id'      => $community->id,
            'role'              => 'member',
            'status'            => 'rejected',
            'rejection_reason'  => 'Wrong unit number',
            'rejected_by'       => 'community_admin',
        ]);

        Sanctum::actingAs($communityAdmin);

        $this->patchJson('/api/v1/admin/members/'.$resident->id.'/approve')
            ->assertOk();

        $this->assertDatabaseHas('community_memberships', [
            'user_id'      => $resident->id,
            'community_id' => $community->id,
            'status'       => 'approved',
        ]);
    }

    public function test_reject_sets_rejected_by_for_community_admin(): void
    {
        $region = Region::query()->create([
            'title'       => 'Cairo Metro',
            'area'        => 'Cairo',
            'state'       => 'EG',
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

        $communityAdmin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
        ]);

        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $communityAdmin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $resident->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'pending',
        ]);

        Sanctum::actingAs($communityAdmin);

        $this->patchJson('/api/v1/admin/members/'.$resident->id.'/reject', [
            'reason' => 'Incomplete profile details',
        ])->assertOk();

        $this->assertDatabaseHas('community_memberships', [
            'user_id'          => $resident->id,
            'community_id'     => $community->id,
            'status'           => 'rejected',
            'rejected_by'      => 'community_admin',
            'rejection_reason' => 'Incomplete profile details',
        ]);
    }

    public function test_community_admin_can_reject_pending_resident_with_required_reason(): void
    {
        $region = Region::query()->create([
            'title'       => 'Cairo Metro',
            'area'        => 'Cairo',
            'state'       => 'EG',
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

        $communityAdmin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
        ]);

        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $communityAdmin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $resident->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'pending',
        ]);

        Sanctum::actingAs($communityAdmin);

        $this->patchJson('/api/v1/admin/members/'.$resident->id.'/reject', [])
            ->assertStatus(422);

        $this->patchJson('/api/v1/admin/members/'.$resident->id.'/reject', [
            'reason' => 'Incomplete profile details',
        ])->assertOk();

        $this->assertDatabaseHas('community_memberships', [
            'user_id'          => $resident->id,
            'community_id'     => $community->id,
            'status'           => 'rejected',
            'rejection_reason' => 'Incomplete profile details',
        ]);

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $resident->id,
            'title'   => 'Membership request declined',
        ]);
    }
}
