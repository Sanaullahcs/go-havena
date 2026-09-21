<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\Family;
use App\Models\FamilyJoinRequest;
use App\Models\InviteCode;
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
        Sanctum::actingAs(User::query()->where('email', 'admin@havena.app')->firstOrFail());

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
        Sanctum::actingAs(User::query()->where('email', 'admin@havena.app')->firstOrFail());

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
        Sanctum::actingAs(User::query()->where('email', 'admin@havena.app')->firstOrFail());

        User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
        ]);

        $response = $this->getJson('/api/v1/admin/members?community_id=all&role=member&status=onboarding');

        $response->assertOk();
        $this->assertSame(1, $response->json('meta.total'));
        $this->assertSame('onboarding', $response->json('data.0.status'));
    }

    public function test_community_admin_only_account_is_excluded_from_members_list_and_stats(): void
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

        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'starter',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_ACTIVE,
            'seat_limit' => 100,
            'meta' => ['card_on_file' => true, 'activated_via' => 'manual'],
        ]);

        $communityAdmin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
            'name'                   => 'Community Admin Only',
        ]);

        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'name'   => 'Real Resident',
        ]);

        $dualRole = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
            'name'                   => 'Admin And Resident',
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

        CommunityMembership::query()->create([
            'user_id'      => $dualRole->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        Sanctum::actingAs($communityAdmin);

        $response = $this->getJson('/api/v1/admin/members');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id');

        $this->assertFalse($ids->contains($communityAdmin->id));
        $this->assertTrue($ids->contains($resident->id));
        $this->assertTrue($ids->contains($dualRole->id));
        $this->assertSame(2, $response->json('meta.total'));
        $this->assertSame(2, $response->json('meta.stats.total'));
        $this->assertSame(2, $response->json('meta.stats.approved'));
        $this->assertSame(0, $response->json('meta.stats.pending'));
        $this->assertSame(0, $response->json('meta.stats.invitation_sent'));
        $this->assertSame(0, $response->json('meta.stats.onboarding'));
        $this->assertSame(0, $response->json('meta.stats.banned'));
        $this->assertSame(0, $response->json('meta.stats.rejected'));
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
        Sanctum::actingAs(User::query()->where('email', 'admin@havena.app')->firstOrFail());

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

    public function test_members_list_excludes_guest_users(): void
    {
        $this->seed(SystemAdminSeeder::class);
        Sanctum::actingAs(User::query()->where('email', 'admin@havena.app')->firstOrFail());

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
            'name'   => 'Real Resident',
        ]);

        $guest = User::factory()->create([
            'role'   => 'guest',
            'status' => 'active',
            'name'   => 'Aliza Guest',
            'email'  => 'aliza@gmail.com',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $resident->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $guest->id,
            'community_id' => $community->id,
            'role'         => 'guest',
            'status'       => 'approved',
        ]);

        $response = $this->getJson('/api/v1/admin/members?community_id='.$community->id);

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id');

        $this->assertTrue($ids->contains($resident->id));
        $this->assertFalse($ids->contains($guest->id));
        $this->assertSame(1, $response->json('meta.stats.approved'));
    }

    public function test_pending_stats_match_listed_members_including_family_joiners(): void
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

        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'starter',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_ACTIVE,
            'seat_limit' => 100,
            'meta' => ['card_on_file' => true, 'activated_via' => 'manual'],
        ]);

        $communityAdmin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
        ]);

        $activeResident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
        ]);

        $pendingResident = User::factory()->create([
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
            'user_id'      => $activeResident->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $pendingResident->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'pending',
        ]);

        $family = Family::query()->create([
            'community_id'  => $community->id,
            'head_user_id'  => $activeResident->id,
            'family_number' => 'FAM-TEST1',
            'name'          => 'Test Family',
            'status'        => 'active',
        ]);

        FamilyJoinRequest::query()->create([
            'family_id'         => $family->id,
            'requester_user_id' => $pendingResident->id,
            'status'            => FamilyJoinRequest::STATUS_PENDING,
        ]);

        Sanctum::actingAs($communityAdmin);

        $all = $this->getJson('/api/v1/admin/members')->assertOk();
        $this->assertSame(2, $all->json('meta.total'));
        $this->assertSame(2, $all->json('meta.stats.total'));
        $this->assertSame(1, $all->json('meta.stats.approved'));
        $this->assertSame(1, $all->json('meta.stats.pending'));
        $this->assertFalse(collect($all->json('data'))->contains(
            fn ($m) => (int) $m['id'] === (int) $communityAdmin->id,
        ));
        $this->assertTrue(collect($all->json('data'))->contains(
            fn ($m) => (int) $m['id'] === (int) $pendingResident->id && $m['status'] === 'pending',
        ));

        $pending = $this->getJson('/api/v1/admin/members?status=pending')->assertOk();
        $this->assertSame(1, $pending->json('meta.total'));
        $this->assertSame(1, $pending->json('meta.stats.pending'));
        $this->assertSame($pendingResident->id, $pending->json('data.0.id'));
    }

    public function test_search_scopes_tab_counts_to_matching_members_without_changing_status_filters(): void
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

        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'starter',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_ACTIVE,
            'seat_limit' => 100,
            'meta' => ['card_on_file' => true, 'activated_via' => 'manual'],
        ]);

        $communityAdmin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
            'name'                   => 'Community Admin',
        ]);

        $active = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'name'   => 'Alice Active',
            'email'  => 'alice.active@example.com',
        ]);
        $pending = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'name'   => 'Pat Pending',
            'email'  => 'pat.pending@example.com',
        ]);
        $invited = User::factory()->create([
            'role'              => 'resident',
            'status'            => 'active',
            'name'              => 'Ivy Invite',
            'email'             => 'ivy.invite@example.com',
            'email_verified_at' => null,
            'phone_verified_at' => null,
        ]);
        $onboarding = User::factory()->create([
            'role'              => 'resident',
            'status'            => 'active',
            'name'              => 'Omar Onboard',
            'email'             => 'omar.onboard@example.com',
            'email_verified_at' => now(),
        ]);
        $suspended = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'name'   => 'Sam Suspended',
            'email'  => 'sam.suspended@example.com',
        ]);
        $rejected = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'name'   => 'Rita Rejected',
            'email'  => 'rita.rejected@example.com',
        ]);

        foreach ([
            [$communityAdmin, 'admin', 'approved'],
            [$active, 'member', 'approved'],
            [$pending, 'member', 'pending'],
            [$suspended, 'member', 'banned'],
            [$rejected, 'member', 'rejected'],
        ] as [$user, $role, $status]) {
            CommunityMembership::query()->create([
                'user_id'      => $user->id,
                'community_id' => $community->id,
                'role'         => $role,
                'status'       => $status,
            ]);
        }

        foreach ([$invited, $onboarding] as $user) {
            InviteCode::query()->create([
                'community_id'    => $community->id,
                'code'            => 'INVITE-'.$user->id,
                'created_by'      => $communityAdmin->id,
                'invited_user_id' => $user->id,
                'max_uses'        => 1,
                'used_count'      => 0,
                'expires_at'      => now()->addDays(7),
            ]);
        }

        Sanctum::actingAs($communityAdmin);

        $baseline = $this->getJson('/api/v1/admin/members')->assertOk();
        $this->assertFalse(collect($baseline->json('data'))->contains(
            fn ($m) => (int) $m['id'] === (int) $communityAdmin->id,
        ));
        $this->assertSame(6, $baseline->json('meta.stats.total'));
        $this->assertSame(1, $baseline->json('meta.stats.approved'));
        $this->assertSame(1, $baseline->json('meta.stats.pending'));
        $this->assertSame(1, $baseline->json('meta.stats.invitation_sent'));
        $this->assertSame(1, $baseline->json('meta.stats.onboarding'));
        $this->assertSame(1, $baseline->json('meta.stats.banned'));
        $this->assertSame(1, $baseline->json('meta.stats.rejected'));

        $inviteSearch = $this->getJson('/api/v1/admin/members?search='.urlencode('Ivy Invite'))->assertOk();
        $this->assertSame([$invited->id], collect($inviteSearch->json('data'))->pluck('id')->all());
        $this->assertSame(1, $inviteSearch->json('meta.total'));
        $this->assertSame(1, $inviteSearch->json('meta.last_page'));
        $this->assertSame(1, $inviteSearch->json('meta.stats.total'));
        $this->assertSame(0, $inviteSearch->json('meta.stats.approved'));
        $this->assertSame(0, $inviteSearch->json('meta.stats.pending'));
        $this->assertSame(1, $inviteSearch->json('meta.stats.invitation_sent'));
        $this->assertSame(0, $inviteSearch->json('meta.stats.onboarding'));
        $this->assertSame(0, $inviteSearch->json('meta.stats.banned'));
        $this->assertSame(0, $inviteSearch->json('meta.stats.rejected'));

        $inviteOnActiveTab = $this->getJson('/api/v1/admin/members?search='.urlencode('Ivy Invite').'&status=approved')->assertOk();
        $this->assertSame([], $inviteOnActiveTab->json('data'));
        $this->assertSame(0, $inviteOnActiveTab->json('meta.total'));
        $this->assertSame(1, $inviteOnActiveTab->json('meta.stats.total'));
        $this->assertSame(1, $inviteOnActiveTab->json('meta.stats.invitation_sent'));
        $this->assertSame(0, $inviteOnActiveTab->json('meta.stats.approved'));

        $activeSearch = $this->getJson('/api/v1/admin/members?search=alice.active@example.com')->assertOk();
        $this->assertSame([$active->id], collect($activeSearch->json('data'))->pluck('id')->all());
        $this->assertSame(1, $activeSearch->json('meta.stats.total'));
        $this->assertSame(1, $activeSearch->json('meta.stats.approved'));
        $this->assertSame(0, $activeSearch->json('meta.stats.invitation_sent'));

        foreach ([
            ['Pat Pending', 'pending', $pending->id],
            ['Omar Onboard', 'onboarding', $onboarding->id],
            ['Sam Suspended', 'banned', $suspended->id],
            ['Rita Rejected', 'rejected', $rejected->id],
        ] as [$term, $status, $id]) {
            $matched = $this->getJson('/api/v1/admin/members?search='.urlencode($term).'&status='.$status)->assertOk();
            $this->assertSame([$id], collect($matched->json('data'))->pluck('id')->all());
            $this->assertSame(1, $matched->json('meta.total'));
            $this->assertSame(1, $matched->json('meta.stats.total'));
            $this->assertSame(1, $matched->json("meta.stats.{$status}"));
        }

        $cleared = $this->getJson('/api/v1/admin/members')->assertOk();
        $this->assertSame(6, $cleared->json('meta.stats.total'));
        $this->assertSame(1, $cleared->json('meta.stats.approved'));
        $this->assertSame(1, $cleared->json('meta.stats.invitation_sent'));
    }
}
