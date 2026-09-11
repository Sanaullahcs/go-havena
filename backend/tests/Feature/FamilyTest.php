<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\Family;
use App\Models\FamilyAddMemberRequest;
use App\Models\FamilyBlock;
use App\Models\FamilyJoinRequest;
use App\Models\FamilyMember;
use App\Models\Region;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FamilyTest extends TestCase
{
    use RefreshDatabase;

    private function seedCommunity(): array
    {
        $region = Region::query()->create([
            'title'       => 'Test Region',
            'area'        => 'Test Area',
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

        return [$community, $region];
    }

    private function seedResident(Community $community, array $overrides = []): User
    {
        $resident = User::factory()->create(array_merge([
            'role'              => 'resident',
            'phone'             => '+1201'.random_int(1000000, 9999999),
            'phone_verified_at' => now(),
        ], $overrides));

        CommunityMembership::query()->create([
            'user_id'      => $resident->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        \App\Models\Profile::query()->updateOrCreate(
            ['user_id' => $resident->id],
            [
                'display_name'   => $resident->name ?: 'Resident',
                'unit_number'    => 'A-'.random_int(100, 999),
                'residence_type' => 'owner',
            ],
        );

        return $resident->fresh(['profile', 'memberships']);
    }

    public function test_resident_can_create_family_and_becomes_head(): void
    {
        [$community] = $this->seedCommunity();
        $head = $this->seedResident($community);
        Sanctum::actingAs($head);

        $response = $this->postJson('/api/v1/families', ['name' => 'The Smiths']);

        $response->assertCreated()
            ->assertJsonPath('data.my_role', 'head')
            ->assertJsonPath('data.is_head', true)
            ->assertJsonPath('data.members.0.user.phone', $head->phone)
            ->assertJsonPath('data.members.0.user.email', $head->email);

        $familyNumber = $response->json('data.family_number');
        $this->assertMatchesRegularExpression('/^FAM-[A-Z0-9]{6}$/', $familyNumber);

        $this->assertDatabaseHas('family_members', [
            'user_id' => $head->id,
            'role'    => 'head',
            'status'  => 'active',
        ]);
    }

    public function test_community_admin_can_create_family_with_chosen_number(): void
    {
        [$community] = $this->seedCommunity();

        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'phone'                  => '+1201'.random_int(1000000, 9999999),
            'phone_verified_at'      => now(),
        ]);
        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);
        \App\Models\Profile::query()->updateOrCreate(
            ['user_id' => $admin->id],
            [
                'display_name'   => 'Admin Head',
                'unit_number'    => 'HQ-1',
                'residence_type' => 'homeowner',
            ],
        );

        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/families/ensure', [
            'family_number' => 'FAM-ADMIN1',
        ])->assertOk()->assertJsonPath('data', null);

        $response = $this->postJson('/api/v1/families', [
            'family_number' => 'FAM-ADMIN1',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.family_number', 'FAM-ADMIN1')
            ->assertJsonPath('data.is_head', true);

        $this->assertDatabaseHas('family_members', [
            'user_id' => $admin->id,
            'role'    => 'head',
            'status'  => 'active',
        ]);
    }

    public function test_resident_can_request_join_by_family_number(): void
    {
        [$community] = $this->seedCommunity();
        $head = $this->seedResident($community);
        $joiner = $this->seedResident($community);

        Sanctum::actingAs($head);
        $create = $this->postJson('/api/v1/families');
        $familyNumber = $create->json('data.family_number');

        Sanctum::actingAs($joiner);
        $response = $this->postJson('/api/v1/families/join', [
            'family_number' => $familyNumber,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', 'pending');

        $this->assertDatabaseHas('family_join_requests', [
            'requester_user_id' => $joiner->id,
            'status'            => 'pending',
        ]);

        $this->assertDatabaseMissing('family_members', [
            'user_id' => $joiner->id,
        ]);
    }

    public function test_head_can_approve_join_request(): void
    {
        [$community] = $this->seedCommunity();
        $head = $this->seedResident($community);
        $joiner = $this->seedResident($community);

        Sanctum::actingAs($head);
        $familyNumber = $this->postJson('/api/v1/families')->json('data.family_number');

        Sanctum::actingAs($joiner);
        $requestId = $this->postJson('/api/v1/families/join', [
            'family_number' => $familyNumber,
        ])->json('data.id');

        Sanctum::actingAs($head);
        $response = $this->patchJson("/api/v1/family-join-requests/{$requestId}/approve");

        $response->assertOk()
            ->assertJsonPath('data.role', 'member')
            ->assertJsonPath('data.status', 'active');

        $this->assertDatabaseHas('family_members', [
            'user_id' => $joiner->id,
            'role'    => 'member',
            'status'  => 'active',
        ]);
    }

    public function test_blocked_user_cannot_rejoin(): void
    {
        [$community] = $this->seedCommunity();
        $head = $this->seedResident($community);
        $member = $this->seedResident($community);

        Sanctum::actingAs($head);
        $familyNumber = $this->postJson('/api/v1/families')->json('data.family_number');

        Sanctum::actingAs($member);
        $requestId = $this->postJson('/api/v1/families/join', ['family_number' => $familyNumber])->json('data.id');

        Sanctum::actingAs($head);
        $this->patchJson("/api/v1/family-join-requests/{$requestId}/approve");

        Sanctum::actingAs($head);
        $this->patchJson("/api/v1/families/members/{$member->id}/block");

        Sanctum::actingAs($member);
        $response = $this->postJson('/api/v1/families/join', ['family_number' => $familyNumber]);

        $response->assertStatus(422);

        $this->assertDatabaseHas('family_blocks', [
            'user_id' => $member->id,
        ]);
    }

    public function test_mine_returns_suspended_state(): void
    {
        [$community] = $this->seedCommunity();
        $head = $this->seedResident($community);
        $member = $this->seedResident($community);

        Sanctum::actingAs($head);
        $familyNumber = $this->postJson('/api/v1/families')->json('data.family_number');

        Sanctum::actingAs($member);
        $requestId = $this->postJson('/api/v1/families/join', ['family_number' => $familyNumber])->json('data.id');

        Sanctum::actingAs($head);
        $this->patchJson("/api/v1/family-join-requests/{$requestId}/approve");

        Sanctum::actingAs($head);
        $this->patchJson("/api/v1/families/members/{$member->id}/suspend");

        Sanctum::actingAs($member);
        $response = $this->getJson('/api/v1/families/mine');

        $response->assertOk()
            ->assertJsonPath('data.state', 'suspended');
    }

    public function test_profile_complete_auto_creates_family(): void
    {
        [$community] = $this->seedCommunity();
        $resident = User::factory()->create([
            'role'              => 'resident',
            'phone'             => '+12017776666',
            'phone_verified_at' => now(),
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $resident->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        Sanctum::actingAs($resident);

        $resident->profile()->updateOrCreate(
            ['user_id' => $resident->id],
            ['utility_bill_url' => '/storage/utility-bills/autofamily.jpg'],
        );

        $this->putJson('/api/v1/me', [
            'display_name'   => 'Auto Family Resident',
            'email'          => 'autofamily@example.com',
            'unit_number'    => 'Unit 101',
            'residence_type' => 'homeowner',
        ])->assertOk();

        $customNumber = 'FAM-CUSTOM1';
        $response = $this->postJson('/api/v1/families/ensure', [
            'family_number' => $customNumber,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.family_number', $customNumber);

        $this->assertDatabaseHas('families', [
            'family_number' => $customNumber,
            'head_user_id'  => $resident->id,
        ]);
    }

    public function test_suggest_and_check_family_number(): void
    {
        [$community] = $this->seedCommunity();
        $resident = $this->seedResident($community);
        Sanctum::actingAs($resident);

        $suggest = $this->getJson('/api/v1/families/suggest-number');
        $suggest->assertOk();
        $number = $suggest->json('data.family_number');
        $this->assertMatchesRegularExpression('/^FAM-[A-Z0-9]{6}$/', $number);

        $this->getJson('/api/v1/families/check-number?family_number='.$number)
            ->assertOk()
            ->assertJsonPath('data.available', true);

        $head = $this->seedResident($community);
        Family::query()->create([
            'community_id'  => $community->id,
            'head_user_id'  => $head->id,
            'family_number' => $number,
            'status'        => 'active',
        ]);

        $this->getJson('/api/v1/families/check-number?family_number='.$number)
            ->assertOk()
            ->assertJsonPath('data.available', false);
    }

    public function test_add_member_requires_community_admin_then_family_head(): void
    {
        [$community] = $this->seedCommunity();

        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'phone'                  => '+12015550100',
            'phone_verified_at'      => now(),
        ]);
        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        $head = $this->seedResident($community, [
            'email' => 'head@example.com',
            'phone' => '+12015550101',
        ]);
        Sanctum::actingAs($head);
        $familyId = $this->postJson('/api/v1/families', ['name' => 'Head Family'])
            ->assertCreated()
            ->json('data.id');

        $this->postJson('/api/v1/families/add-member-requests', [
            'first_name' => 'Sam',
            'last_name'  => 'Neighbor',
            'email'      => 'sam.neighbor@example.com',
            'phone'      => '+12015550102',
            'age'        => 28,
            'unit_number'=> 'B-12',
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending_admin');

        $this->assertDatabaseHas('family_add_member_requests', [
            'family_id' => $familyId,
            'email'     => 'sam.neighbor@example.com',
            'status'    => 'pending_admin',
        ]);

        $candidateId = FamilyAddMemberRequest::query()->where('email', 'sam.neighbor@example.com')->value('candidate_user_id');
        $this->assertNotNull($candidateId);
        $this->assertDatabaseHas('community_memberships', [
            'user_id'      => $candidateId,
            'community_id' => $community->id,
            'status'       => 'pending',
        ]);

        Sanctum::actingAs($head);
        $this->getJson('/api/v1/families/join-requests/pending')
            ->assertOk()
            ->assertJsonPath('meta.count', 0);

        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/admin/members/{$candidateId}/approve")
            ->assertOk();

        $this->assertDatabaseHas('community_memberships', [
            'user_id'      => $candidateId,
            'community_id' => $community->id,
            'status'       => 'approved',
        ]);
        $this->assertDatabaseHas('family_add_member_requests', [
            'email'  => 'sam.neighbor@example.com',
            'status' => 'awaiting_head',
        ]);
        $this->assertDatabaseHas('family_join_requests', [
            'family_id'         => $familyId,
            'requester_user_id' => $candidateId,
            'status'            => 'pending',
        ]);

        Sanctum::actingAs($head);
        $joinId = $this->getJson('/api/v1/families/join-requests/pending')
            ->assertOk()
            ->assertJsonPath('meta.count', 1)
            ->json('data.0.id');

        $this->patchJson("/api/v1/family-join-requests/{$joinId}/approve")
            ->assertOk();

        $this->assertDatabaseHas('family_members', [
            'family_id' => $familyId,
            'user_id'   => $candidateId,
            'role'      => 'member',
            'status'    => 'active',
        ]);
        $this->assertDatabaseHas('family_add_member_requests', [
            'email'  => 'sam.neighbor@example.com',
            'status' => 'approved',
        ]);
    }

    public function test_community_admin_reject_cancels_family_add_without_join_request(): void
    {
        [$community] = $this->seedCommunity();

        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'phone'                  => '+12015550200',
            'phone_verified_at'      => now(),
        ]);
        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        $head = $this->seedResident($community, [
            'email' => 'head2@example.com',
            'phone' => '+12015550201',
        ]);
        Sanctum::actingAs($head);
        $familyId = $this->postJson('/api/v1/families', ['name' => 'Reject Family'])
            ->assertCreated()
            ->json('data.id');

        $this->postJson('/api/v1/families/add-member-requests', [
            'first_name' => 'Pat',
            'last_name'  => 'Rejected',
            'email'      => 'pat.rejected@example.com',
            'phone'      => '+12015550202',
            'age'        => 34,
            'unit_number'=> 'C-3',
        ])->assertCreated();

        $candidateId = FamilyAddMemberRequest::query()->where('email', 'pat.rejected@example.com')->value('candidate_user_id');

        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/admin/members/{$candidateId}/reject", [
            'reason' => 'Could not verify residence',
        ])->assertOk();

        $this->assertDatabaseHas('family_add_member_requests', [
            'family_id' => $familyId,
            'email'     => 'pat.rejected@example.com',
            'status'    => 'rejected',
        ]);
        $this->assertDatabaseMissing('family_join_requests', [
            'family_id'         => $familyId,
            'requester_user_id' => $candidateId,
            'status'            => 'pending',
        ]);
        $this->assertDatabaseMissing('family_members', [
            'family_id' => $familyId,
            'user_id'   => $candidateId,
        ]);
    }

    public function test_already_approved_resident_add_uses_admin_family_endpoint(): void
    {
        [$community] = $this->seedCommunity();

        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'phone'                  => '+12015550300',
            'phone_verified_at'      => now(),
        ]);
        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        $head = $this->seedResident($community, [
            'email' => 'head3@example.com',
            'phone' => '+12015550301',
        ]);
        $existing = $this->seedResident($community, [
            'name'  => 'Existing Neighbor',
            'email' => 'existing.neighbor@example.com',
            'phone' => '+12015550302',
        ]);

        Sanctum::actingAs($head);
        $familyId = $this->postJson('/api/v1/families', ['name' => 'Existing Family'])
            ->assertCreated()
            ->json('data.id');

        $addId = $this->postJson('/api/v1/families/add-member-requests', [
            'first_name' => 'Existing',
            'last_name'  => 'Neighbor',
            'email'      => 'existing.neighbor@example.com',
            'phone'      => '+12015550302',
            'age'        => 40,
            'unit_number'=> 'D-9',
        ])
            ->assertCreated()
            ->json('data.id');

        $this->assertDatabaseHas('family_add_member_requests', [
            'id'                => $addId,
            'candidate_user_id' => $existing->id,
            'status'            => 'pending_admin',
        ]);
        $this->assertDatabaseHas('community_memberships', [
            'user_id'      => $existing->id,
            'community_id' => $community->id,
            'status'       => 'approved',
        ]);

        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/admin/family-add-member-requests/{$addId}/approve")
            ->assertOk();

        $this->assertDatabaseHas('family_join_requests', [
            'family_id'         => $familyId,
            'requester_user_id' => $existing->id,
            'status'            => 'pending',
        ]);
        $this->assertDatabaseHas('family_add_member_requests', [
            'id'     => $addId,
            'status' => 'awaiting_head',
        ]);
    }

    public function test_complete_profile_join_is_head_then_community_admin(): void
    {
        [$community] = $this->seedCommunity();

        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'phone'                  => '+12015550400',
            'phone_verified_at'      => now(),
        ]);
        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        $head = $this->seedResident($community, [
            'email' => 'head.onboarding@example.com',
            'phone' => '+12015550401',
        ]);
        Sanctum::actingAs($head);
        $familyNumber = $this->postJson('/api/v1/families', ['name' => 'Onboarding Family'])
            ->assertCreated()
            ->json('data.family_number');

        $joiner = User::factory()->create([
            'role'              => 'resident',
            'phone'             => '+12015550402',
            'phone_verified_at' => now(),
            'email'             => 'joiner.onboarding@example.com',
        ]);
        CommunityMembership::query()->create([
            'user_id'      => $joiner->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'pending',
        ]);
        \App\Models\Profile::query()->updateOrCreate(
            ['user_id' => $joiner->id],
            [
                'display_name'   => 'Joiner Onboarding',
                'unit_number'    => 'E-1',
                'residence_type' => 'tenant',
            ],
        );

        Sanctum::actingAs($joiner);
        $joinId = $this->postJson('/api/v1/families/join', [
            'family_number' => $familyNumber,
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->json('data.id');

        $this->assertDatabaseMissing('family_members', [
            'user_id' => $joiner->id,
        ]);

        // Still listed as pending so Members cards/tabs match the table.
        Sanctum::actingAs($admin);
        $pendingMembers = $this->getJson('/api/v1/admin/members?status=pending&role=member')
            ->assertOk();
        $this->assertTrue(collect($pendingMembers->json('data'))->contains(fn ($m) => (int) $m['id'] === (int) $joiner->id));
        $this->assertSame(1, $pendingMembers->json('meta.stats.pending'));

        Sanctum::actingAs($head);
        $this->patchJson("/api/v1/family-join-requests/{$joinId}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'awaiting_admin');

        $this->assertDatabaseHas('family_join_requests', [
            'id'     => $joinId,
            'status' => 'awaiting_admin',
        ]);
        $this->assertDatabaseMissing('family_members', [
            'user_id' => $joiner->id,
        ]);
        $this->assertDatabaseHas('community_memberships', [
            'user_id'      => $joiner->id,
            'community_id' => $community->id,
            'status'       => 'pending',
        ]);

        Sanctum::actingAs($joiner);
        $this->getJson('/api/v1/families/mine')
            ->assertOk()
            ->assertJsonPath('data.state', 'awaiting_admin');

        // Now visible to community admin.
        Sanctum::actingAs($admin);
        $pendingAfterHead = $this->getJson('/api/v1/admin/members?status=pending&role=member')
            ->assertOk()
            ->json('data');
        $this->assertTrue(collect($pendingAfterHead)->contains(fn ($m) => (int) $m['id'] === (int) $joiner->id));

        $this->patchJson("/api/v1/admin/members/{$joiner->id}/approve")
            ->assertOk();

        $this->assertDatabaseHas('community_memberships', [
            'user_id'      => $joiner->id,
            'community_id' => $community->id,
            'status'       => 'approved',
        ]);
        $this->assertDatabaseHas('family_members', [
            'user_id' => $joiner->id,
            'role'    => 'member',
            'status'  => 'active',
        ]);
        $this->assertDatabaseHas('family_join_requests', [
            'id'     => $joinId,
            'status' => 'approved',
        ]);

        Sanctum::actingAs($joiner);
        $this->getJson('/api/v1/families/mine')
            ->assertOk()
            ->assertJsonPath('data.state', 'member');
    }

    public function test_complete_profile_join_head_reject_sets_rejected_state(): void
    {
        [$community] = $this->seedCommunity();

        $head = $this->seedResident($community, [
            'email' => 'head.reject@example.com',
            'phone' => '+12015550501',
        ]);
        Sanctum::actingAs($head);
        $familyNumber = $this->postJson('/api/v1/families')
            ->assertCreated()
            ->json('data.family_number');

        $joiner = User::factory()->create([
            'role'              => 'resident',
            'phone'             => '+12015550502',
            'phone_verified_at' => now(),
            'email'             => 'joiner.reject@example.com',
        ]);
        CommunityMembership::query()->create([
            'user_id'      => $joiner->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'pending',
        ]);
        \App\Models\Profile::query()->updateOrCreate(
            ['user_id' => $joiner->id],
            [
                'display_name'   => 'Joiner Reject',
                'unit_number'    => 'F-2',
                'residence_type' => 'tenant',
            ],
        );

        Sanctum::actingAs($joiner);
        $joinId = $this->postJson('/api/v1/families/join', [
            'family_number' => $familyNumber,
        ])->json('data.id');

        Sanctum::actingAs($head);
        $this->patchJson("/api/v1/family-join-requests/{$joinId}/reject", [
            'reason' => 'Unknown resident',
        ])->assertOk();

        Sanctum::actingAs($joiner);
        $this->getJson('/api/v1/families/mine')
            ->assertOk()
            ->assertJsonPath('data.state', 'rejected')
            ->assertJsonPath('data.rejected_request.rejection_reason', 'Unknown resident');

        $this->assertDatabaseMissing('family_members', [
            'user_id' => $joiner->id,
        ]);

        // Create My Family still works after rejection.
        $created = $this->postJson('/api/v1/families/ensure', [
            'family_number' => 'FAM-NEW999',
        ])->assertOk();

        $this->assertSame('FAM-NEW999', $created->json('data.family_number'));
        $this->assertDatabaseHas('family_members', [
            'user_id' => $joiner->id,
            'role'    => 'head',
            'status'  => 'active',
        ]);
    }

    public function test_community_admin_approve_does_not_auto_create_family_for_skip_resident(): void
    {
        [$community] = $this->seedCommunity();

        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'phone'                  => '+12015550600',
            'phone_verified_at'      => now(),
        ]);
        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        $resident = User::factory()->create([
            'role'              => 'resident',
            'phone'             => '+12015550601',
            'phone_verified_at' => now(),
            'email'             => 'skip.family@example.com',
        ]);
        CommunityMembership::query()->create([
            'user_id'      => $resident->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'pending',
        ]);
        \App\Models\Profile::query()->updateOrCreate(
            ['user_id' => $resident->id],
            [
                'display_name'   => 'Skip Family',
                'unit_number'    => 'G-1',
                'residence_type' => 'tenant',
            ],
        );

        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/admin/members/{$resident->id}/approve")
            ->assertOk();

        $this->assertDatabaseMissing('family_members', [
            'user_id' => $resident->id,
        ]);

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/families/mine')
            ->assertOk()
            ->assertJsonPath('data.state', 'none')
            ->assertJsonPath('data.can_create', true)
            ->assertJsonPath('data.can_join', true);

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.family.state', 'none')
            ->assertJsonPath('data.family.family_status', 'none')
            ->assertJsonPath('data.family.family_id', null);
    }
}
