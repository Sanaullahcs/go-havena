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

class CommunityAdminSignupTest extends TestCase
{
    use RefreshDatabase;

    private function seedRegion(): Region
    {
        return Region::query()->create([
            'title'       => 'Cairo Metro',
            'area'        => 'Cairo',
            'users_label' => '0 users',
            'sort_order'  => 1,
            'status'      => 'active',
        ]);
    }

    private function seedUnassignedCommunity(Region $region, string $name = 'Unassigned Oaks'): Community
    {
        return Community::query()->create([
            'name'          => $name,
            'region_id'     => $region->id,
            'region'        => $region->title,
            'status'        => 'active',
            'review_status' => 'approved',
        ]);
    }

    private function assignAdmin(Community $community): User
    {
        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        return $admin;
    }

    private function pendingCommunityAdmin(): User
    {
        return User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'pending',
            'status'                 => 'active',
        ]);
    }

    public function test_search_returns_all_communities_with_has_admin_flag(): void
    {
        $region = $this->seedRegion();
        $open = $this->seedUnassignedCommunity($region, 'Open Community');
        $assigned = $this->seedUnassignedCommunity($region, 'Assigned Community');
        $this->assignAdmin($assigned);

        $response = $this->getJson('/api/v1/communities/search?'.http_build_query([
            'region_id' => $region->id,
        ]));

        $response->assertOk();

        $openRow = collect($response->json('data'))->firstWhere('id', $open->id);
        $assignedRow = collect($response->json('data'))->firstWhere('id', $assigned->id);

        $this->assertNotNull($openRow);
        $this->assertNotNull($assignedRow);
        $this->assertFalse($openRow['has_admin']);
        $this->assertTrue($assignedRow['has_admin']);
    }

    public function test_search_supports_pagination_when_page_requested(): void
    {
        $region = $this->seedRegion();
        foreach (range(1, 20) as $i) {
            $this->seedUnassignedCommunity($region, "Community {$i}");
        }

        $page1 = $this->getJson('/api/v1/communities/search?'.http_build_query([
            'region_id' => $region->id,
            'page' => 1,
            'per_page' => 10,
        ]));

        $page1->assertOk();
        $page1->assertJsonCount(10, 'data');
        $page1->assertJsonPath('meta.current_page', 1);
        $page1->assertJsonPath('meta.per_page', 10);
        $page1->assertJsonPath('meta.total', 20);
        $page1->assertJsonPath('meta.has_more', true);

        $page2 = $this->getJson('/api/v1/communities/search?'.http_build_query([
            'region_id' => $region->id,
            'page' => 2,
            'per_page' => 10,
        ]));

        $page2->assertOk();
        $page2->assertJsonCount(10, 'data');
        $page2->assertJsonPath('meta.has_more', false);
    }

    public function test_search_unassigned_only_excludes_communities_with_admin(): void
    {
        $region = $this->seedRegion();
        $open = $this->seedUnassignedCommunity($region, 'Open Community');
        $assigned = $this->seedUnassignedCommunity($region, 'Assigned Community');
        $this->assignAdmin($assigned);

        $response = $this->getJson('/api/v1/communities/search?'.http_build_query([
            'region_id'       => $region->id,
            'unassigned_only' => 1,
        ]));

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();

        $this->assertContains($open->id, $ids);
        $this->assertNotContains($assigned->id, $ids);
    }

    public function test_community_admin_can_claim_unassigned_community(): void
    {
        $region = $this->seedRegion();
        $community = $this->seedUnassignedCommunity($region);
        $applicant = $this->pendingCommunityAdmin();
        Sanctum::actingAs($applicant);

        $response = $this->postJson("/api/v1/communities/{$community->id}/join");

        $response->assertCreated()
            ->assertJsonPath('data.membership.role', 'admin')
            ->assertJsonPath('data.membership.status', 'pending');

        $this->assertDatabaseHas('community_memberships', [
            'user_id'      => $applicant->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'pending',
        ]);
    }

    public function test_community_admin_cannot_claim_assigned_community(): void
    {
        $region = $this->seedRegion();
        $community = $this->seedUnassignedCommunity($region);
        $this->assignAdmin($community);

        $applicant = $this->pendingCommunityAdmin();
        Sanctum::actingAs($applicant);

        $this->postJson("/api/v1/communities/{$community->id}/join")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['community_id']);
    }

    public function test_community_admin_needs_both_approvals_for_access(): void
    {
        $region = $this->seedRegion();
        $applicant = $this->pendingCommunityAdmin();

        $community = Community::query()->create([
            'name'                   => 'Requested Community',
            'region_id'              => $region->id,
            'region'                 => $region->title,
            'status'                 => 'inactive',
            'review_status'          => 'pending',
            'requested_by_user_id'   => $applicant->id,
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $applicant->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'pending',
        ]);

        $this->seed(SystemAdminSeeder::class);
        $systemAdmin = User::query()->where('email', 'admin@havena.app')->firstOrFail();
        Sanctum::actingAs($systemAdmin);

        $this->patchJson("/api/v1/admin/community-requests/{$community->id}/approve", [
            'region_id' => $region->id,
        ])->assertOk();

        $applicant->refresh();
        $this->assertSame('pending', $applicant->community_admin_status);
        $this->assertTrue(
            CommunityMembership::query()
                ->where('user_id', $applicant->id)
                ->where('community_id', $community->id)
                ->where('status', 'approved')
                ->exists()
        );

        $this->patchJson("/api/v1/admin/community-admins/{$applicant->id}/approve")
            ->assertOk();

        $applicant->refresh();
        $this->assertSame('approved', $applicant->community_admin_status);
        $this->assertSame('approved', $community->fresh()->review_status);
    }

    public function test_approving_community_admin_does_not_approve_membership_for_pending_community(): void
    {
        $region = $this->seedRegion();
        $applicant = $this->pendingCommunityAdmin();

        $community = Community::query()->create([
            'name'                 => 'Requested Community',
            'region_id'            => $region->id,
            'region'               => $region->title,
            'status'               => 'inactive',
            'review_status'        => 'pending',
            'requested_by_user_id' => $applicant->id,
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $applicant->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'pending',
        ]);

        $this->seed(SystemAdminSeeder::class);
        $systemAdmin = User::query()->where('email', 'admin@havena.app')->firstOrFail();
        Sanctum::actingAs($systemAdmin);

        $this->patchJson("/api/v1/admin/community-admins/{$applicant->id}/approve")
            ->assertOk();

        $applicant->refresh();
        $this->assertSame('approved', $applicant->community_admin_status);
        $this->assertDatabaseHas('community_memberships', [
            'user_id'      => $applicant->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'pending',
        ]);
    }

    public function test_approving_community_admin_also_approves_pending_admin_membership(): void
    {
        $region = $this->seedRegion();
        $community = $this->seedUnassignedCommunity($region);
        $applicant = $this->pendingCommunityAdmin();

        CommunityMembership::query()->create([
            'user_id'      => $applicant->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'pending',
        ]);

        $this->seed(SystemAdminSeeder::class);
        $systemAdmin = User::query()->where('email', 'admin@havena.app')->firstOrFail();
        Sanctum::actingAs($systemAdmin);

        $this->patchJson("/api/v1/admin/community-admins/{$applicant->id}/approve")
            ->assertOk();

        $this->assertDatabaseHas('community_memberships', [
            'user_id'      => $applicant->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);
    }
}
