<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\Region;
use App\Models\User;
use App\Services\CommunityBillingService;
use App\Services\CommunityLifecycleService;
use App\Services\UnitAssignmentService;
use App\Services\UnitRegistrationPackageService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MultiCommunityResidentTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array{region: Region, communityA: Community, communityB: Community, adminA: User, adminB: User, resident: User}
     */
    private function seedTwoCommunitiesWithResident(): array
    {
        $region = Region::query()->create([
            'title' => 'Test Region',
            'area' => 'Area',
            'state' => 'ST',
            'users_label' => '0',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $communityA = Community::query()->create([
            'name' => 'Community Alpha',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);
        $communityB = Community::query()->create([
            'name' => 'Community Beta',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $adminA = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'password' => Hash::make('password'),
        ]);
        $adminB = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'password' => Hash::make('password'),
        ]);

        DB::table('community_memberships')->insert([
            [
                'user_id' => $adminA->id,
                'community_id' => $communityA->id,
                'role' => 'admin',
                'status' => 'approved',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'user_id' => $adminB->id,
                'community_id' => $communityB->id,
                'role' => 'admin',
                'status' => 'approved',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        app(CommunityBillingService::class)->activateManualSubscription($communityA, 'growth');
        app(CommunityBillingService::class)->activateManualSubscription($communityB, 'growth');

        $resident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'active_context_community_id' => $communityA->id,
        ]);
        DB::table('profiles')->insert([
            'user_id' => $resident->id,
            'display_name' => 'Multi Community Resident',
            'unit_number' => '101',
            'residence_type' => 'homeowner',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('community_memberships')->insert([
            'user_id' => $resident->id,
            'community_id' => $communityA->id,
            'role' => 'member',
            'status' => 'approved',
            'created_at' => now()->subDay(),
            'updated_at' => now()->subDay(),
        ]);

        app(UnitAssignmentService::class)->assignUserToUnitNumber(
            $communityA->id,
            $resident->id,
            '101',
            false,
            true,
            'active',
            'invite',
        );

        return compact('region', 'communityA', 'communityB', 'adminA', 'adminB', 'resident');
    }

    public function test_join_second_community_stays_pending_without_leaving_first(): void
    {
        $world = $this->seedTwoCommunitiesWithResident();
        Sanctum::actingAs($world['resident']);

        $this->postJson("/api/v1/communities/{$world['communityB']->id}/join")
            ->assertCreated()
            ->assertJsonPath('data.membership.status', 'pending')
            ->assertJsonPath('data.membership.community_id', $world['communityB']->id);

        $this->assertDatabaseHas('community_memberships', [
            'user_id' => $world['resident']->id,
            'community_id' => $world['communityA']->id,
            'status' => 'approved',
        ]);
        $this->assertDatabaseHas('community_memberships', [
            'user_id' => $world['resident']->id,
            'community_id' => $world['communityB']->id,
            'status' => 'pending',
        ]);
        $this->assertDatabaseHas('users', [
            'id' => $world['resident']->id,
            'active_context_community_id' => $world['communityA']->id,
        ]);

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.active_context_community_id', $world['communityA']->id)
            ->assertJsonPath('data.pending_unit_package', false)
            ->assertJsonPath('data.can_switch_communities', false);

        $this->getJson('/api/v1/units/mine')
            ->assertOk()
            ->assertJsonPath('meta.unit_count', 1)
            ->assertJsonPath('units.0.unit_number', '101');
    }

    public function test_cannot_switch_to_pending_second_community(): void
    {
        $world = $this->seedTwoCommunitiesWithResident();
        DB::table('community_memberships')->insert([
            'user_id' => $world['resident']->id,
            'community_id' => $world['communityB']->id,
            'role' => 'member',
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($world['resident']);

        $this->putJson('/api/v1/me/active-context', [
            'community_id' => $world['communityB']->id,
        ])->assertStatus(422)->assertJsonValidationErrors(['community_id']);

        $this->assertDatabaseHas('users', [
            'id' => $world['resident']->id,
            'active_context_community_id' => $world['communityA']->id,
        ]);
    }

    public function test_switch_among_approved_communities_scopes_units_and_pending_package(): void
    {
        $world = $this->seedTwoCommunitiesWithResident();
        DB::table('community_memberships')->insert([
            'user_id' => $world['resident']->id,
            'community_id' => $world['communityB']->id,
            'role' => 'member',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        app(UnitRegistrationPackageService::class)->submitPackage(
            $world['resident']->id,
            $world['communityB']->id,
            'initial',
            [
                [
                    'unit_number' => '202',
                    'is_new_unit' => true,
                    'residence_type' => 'homeowner',
                    'utility_bill_url' => '/storage/proofs/utility-202.jpg',
                ],
            ],
        );

        Sanctum::actingAs($world['resident']);

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.active_context_community_id', $world['communityA']->id)
            ->assertJsonPath('data.pending_unit_package', false)
            ->assertJsonPath('data.has_full_unit_access', true)
            ->assertJsonPath('data.can_switch_communities', true);

        $this->getJson('/api/v1/units/mine')
            ->assertOk()
            ->assertJsonPath('meta.unit_count', 1)
            ->assertJsonPath('units.0.unit_number', '101');

        $this->putJson('/api/v1/me/active-context', [
            'community_id' => $world['communityB']->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.active_context_community_id', $world['communityB']->id)
            ->assertJsonPath('data.pending_unit_package', true)
            ->assertJsonPath('data.has_full_unit_access', false);

        $this->assertDatabaseHas('community_memberships', [
            'user_id' => $world['resident']->id,
            'community_id' => $world['communityA']->id,
            'status' => 'approved',
        ]);

        $this->getJson('/api/v1/units/mine')
            ->assertOk()
            ->assertJsonPath('meta.unit_count', 0)
            ->assertJsonPath('meta.has_full_access', false);
    }

    public function test_approving_second_membership_does_not_auto_switch_active_community(): void
    {
        $world = $this->seedTwoCommunitiesWithResident();
        DB::table('community_memberships')->insert([
            'user_id' => $world['resident']->id,
            'community_id' => $world['communityB']->id,
            'role' => 'member',
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('community_memberships')
            ->where('user_id', $world['resident']->id)
            ->where('community_id', $world['communityB']->id)
            ->update(['status' => 'approved', 'updated_at' => now()]);

        Sanctum::actingAs($world['resident']->fresh());

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.active_context_community_id', $world['communityA']->id)
            ->assertJsonPath('data.can_switch_communities', true);

        $this->getJson('/api/v1/units/mine')
            ->assertOk()
            ->assertJsonPath('units.0.unit_number', '101');
    }

    public function test_rejected_second_community_does_not_block_first(): void
    {
        $world = $this->seedTwoCommunitiesWithResident();
        DB::table('community_memberships')->insert([
            'user_id' => $world['resident']->id,
            'community_id' => $world['communityB']->id,
            'role' => 'member',
            'status' => 'rejected',
            'rejection_reason' => 'Incomplete documents',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($world['resident']);

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.active_context_community_id', $world['communityA']->id);

        $this->getJson('/api/v1/units/mine')
            ->assertOk()
            ->assertJsonPath('meta.unit_count', 1);
    }

    public function test_join_second_community_with_units_keeps_first_active(): void
    {
        $world = $this->seedTwoCommunitiesWithResident();
        Sanctum::actingAs($world['resident']);

        $this->getJson("/api/v1/communities/{$world['communityB']->id}/units")
            ->assertOk();

        $this->postJson("/api/v1/communities/{$world['communityB']->id}/join")
            ->assertCreated()
            ->assertJsonPath('data.membership.status', 'pending');

        $this->postJson('/api/v1/units/mine/onboarding-units', [
            'community_id' => $world['communityB']->id,
            'units' => [
                [
                    'unit_number' => '12A',
                    'is_new_unit' => true,
                    'residence_type' => 'homeowner',
                    'utility_bill_url' => '/storage/proofs/utility-12a.jpg',
                ],
                [
                    'unit_number' => '12B',
                    'is_new_unit' => true,
                    'residence_type' => 'tenant',
                    'utility_bill_url' => '/storage/proofs/utility-12b.jpg',
                ],
            ],
        ])
            ->assertCreated()
            ->assertJsonPath('data.mode', 'package');

        $this->assertDatabaseHas('users', [
            'id' => $world['resident']->id,
            'active_context_community_id' => $world['communityA']->id,
        ]);
        $this->assertDatabaseHas('unit_registration_packages', [
            'user_id' => $world['resident']->id,
            'community_id' => $world['communityB']->id,
            'kind' => 'initial',
            'status' => 'pending',
        ]);
        $this->assertDatabaseHas('unit_registration_package_items', [
            'unit_number' => '12A',
            'status' => 'pending',
        ]);
        $this->assertDatabaseHas('unit_registration_package_items', [
            'unit_number' => '12B',
            'status' => 'pending',
        ]);

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.active_context_community_id', $world['communityA']->id)
            ->assertJsonPath('data.pending_unit_package', false);

        $this->getJson('/api/v1/units/mine')
            ->assertOk()
            ->assertJsonPath('units.0.unit_number', '101');
    }

    public function test_community_admin_still_cannot_join_a_second_community(): void
    {
        $world = $this->seedTwoCommunitiesWithResident();
        $open = Community::query()->create([
            'name' => 'Open Community',
            'region_id' => $world['region']->id,
            'region' => $world['region']->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        Sanctum::actingAs($world['adminA']);

        $this->postJson("/api/v1/communities/{$open->id}/join")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['phone']);
    }

    public function test_approving_second_community_does_not_copy_first_community_unit(): void
    {
        $world = $this->seedTwoCommunitiesWithResident();
        Sanctum::actingAs($world['resident']);

        $this->postJson("/api/v1/communities/{$world['communityB']->id}/join")
            ->assertCreated();

        $this->postJson('/api/v1/units/mine/onboarding-units', [
            'community_id' => $world['communityB']->id,
            'units' => [
                [
                    'unit_number' => 'A-301',
                    'is_new_unit' => true,
                    'residence_type' => 'homeowner',
                    'utility_bill_url' => '/storage/proofs/utility-a301.jpg',
                ],
            ],
        ])->assertCreated();

        Sanctum::actingAs($world['adminB']);
        $this->patchJson('/api/v1/admin/members/'.$world['resident']->id.'/approve')
            ->assertOk();

        $this->assertDatabaseHas('community_memberships', [
            'user_id' => $world['resident']->id,
            'community_id' => $world['communityB']->id,
            'status' => 'approved',
        ]);

        $this->assertTrue(
            DB::table('units')
                ->where('community_id', $world['communityA']->id)
                ->where('unit_number_normalized', '101')
                ->exists(),
        );
        $this->assertFalse(
            DB::table('units')
                ->where('community_id', $world['communityB']->id)
                ->where('unit_number_normalized', '101')
                ->exists(),
            'First-community unit 101 must not be created in the second community.',
        );
        $this->assertDatabaseHas('units', [
            'community_id' => $world['communityB']->id,
            'unit_number' => 'A-301',
        ]);

        $bUnitId = (int) DB::table('units')
            ->where('community_id', $world['communityB']->id)
            ->where('unit_number', 'A-301')
            ->value('id');
        $this->assertDatabaseHas('unit_residents', [
            'user_id' => $world['resident']->id,
            'community_id' => $world['communityB']->id,
            'unit_id' => $bUnitId,
            'status' => 'active',
        ]);

        $members = $this->getJson('/api/v1/admin/members');
        $members->assertOk();
        $row = collect($members->json('data'))->firstWhere('id', $world['resident']->id);
        $this->assertNotNull($row);
        $this->assertSame(['A-301'], array_column($row['units'] ?? [], 'unit_number'));
        $this->assertSame('A-301', $row['unit_number']);

        $adminUnits = $this->getJson('/api/v1/admin/units')->assertOk()->json('data');
        $this->assertSame(
            ['A-301'],
            collect($adminUnits)
                ->where('kind', 'residential')
                ->pluck('unit_number')
                ->values()
                ->all(),
        );

        Sanctum::actingAs($world['resident']->fresh());
        $this->getJson('/api/v1/units/mine')
            ->assertOk()
            ->assertJsonPath('units.0.unit_number', '101')
            ->assertJsonPath('meta.unit_count', 1);

        $this->putJson('/api/v1/me/active-context', [
            'community_id' => $world['communityB']->id,
        ])->assertOk();

        $mineB = $this->getJson('/api/v1/units/mine')->assertOk();
        $mineB->assertJsonPath('meta.unit_count', 1);
        $this->assertSame(['A-301'], array_column($mineB->json('units') ?? [], 'unit_number'));
    }

    public function test_copied_foreign_unit_is_pruned_from_current_community(): void
    {
        $world = $this->seedTwoCommunitiesWithResident();
        DB::table('community_memberships')->insert([
            'user_id' => $world['resident']->id,
            'community_id' => $world['communityB']->id,
            'role' => 'member',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        app(UnitAssignmentService::class)->assignUserToUnitNumber(
            $world['communityB']->id,
            $world['resident']->id,
            'A-301',
            false,
            false,
            'active',
            'package',
        );
        app(UnitAssignmentService::class)->assignUserToUnitNumber(
            $world['communityB']->id,
            $world['resident']->id,
            '101',
            false,
            false,
            'active',
            null,
        );

        $this->assertTrue(
            DB::table('units')
                ->where('community_id', $world['communityB']->id)
                ->where('unit_number_normalized', '101')
                ->exists(),
        );

        Sanctum::actingAs($world['resident']->fresh());
        $this->putJson('/api/v1/me/active-context', [
            'community_id' => $world['communityB']->id,
        ])->assertOk();

        $mine = $this->getJson('/api/v1/units/mine')->assertOk();
        $this->assertSame(['A-301'], array_column($mine->json('units') ?? [], 'unit_number'));

        $this->assertFalse(
            DB::table('units')
                ->where('community_id', $world['communityB']->id)
                ->where('unit_number_normalized', '101')
                ->exists(),
        );
        $this->assertTrue(
            DB::table('units')
                ->where('community_id', $world['communityA']->id)
                ->where('unit_number_normalized', '101')
                ->exists(),
        );

        Sanctum::actingAs($world['adminB']);
        $adminUnits = $this->getJson('/api/v1/admin/units')->assertOk()->json('data');
        $this->assertSame(
            ['A-301'],
            collect($adminUnits)
                ->where('kind', 'residential')
                ->pluck('unit_number')
                ->values()
                ->all(),
        );
    }

    public function test_existing_resident_can_be_invited_to_another_community_without_copying_units(): void
    {
        $world = $this->seedTwoCommunitiesWithResident();
        $resident = $world['resident']->fresh();

        Sanctum::actingAs($world['adminB']);
        $invite = $this->postJson('/api/v1/admin/members/invite', [
            'name' => 'Multi Community Resident',
            'email' => $resident->email,
            'phone' => '+12025550999',
            'unit_number' => 'B-12',
        ])->assertCreated();

        $this->assertSame($resident->id, $invite->json('data.id'));
        $this->assertDatabaseHas('profiles', [
            'user_id' => $resident->id,
            'unit_number' => '101',
        ]);
        $this->assertDatabaseHas('invite_unit_assignments', [
            'user_id' => $resident->id,
            'community_id' => $world['communityB']->id,
            'unit_number' => 'B-12',
        ]);

        Sanctum::actingAs($resident->fresh());
        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.needs_invite_code', false)
            ->assertJsonPath('data.active_context_community_id', $world['communityA']->id)
            ->assertJsonPath('data.pending_invitation_count', 1);

        $this->getJson('/api/v1/me/communities')
            ->assertOk()
            ->assertJsonPath('data.0.community_id', $world['communityA']->id)
            ->assertJsonPath('data.0.status', 'approved')
            ->assertJsonPath('data.0.is_active', true);

        $this->getJson('/api/v1/me/invitations')
            ->assertOk()
            ->assertJsonPath('data.0.community.id', $world['communityB']->id)
            ->assertJsonPath('data.0.code', $invite->json('data.invite_code'))
            ->assertJsonPath('data.0.units.0.unit_number', 'B-12');

        Sanctum::actingAs($world['adminB']);
        $members = $this->getJson('/api/v1/admin/members?status=invitation_sent')->assertOk();
        $row = collect($members->json('data'))->firstWhere('id', $resident->id);
        $this->assertNotNull($row);
        $this->assertSame('invitation_sent', $row['status']);
        $this->assertSame(['B-12'], array_column($row['units'] ?? [], 'unit_number'));
    }

    public function test_resident_can_reject_invitation_without_losing_existing_membership(): void
    {
        $world = $this->seedTwoCommunitiesWithResident();
        $resident = $world['resident']->fresh();

        Sanctum::actingAs($world['adminB']);
        $invite = $this->postJson('/api/v1/admin/members/invite', [
            'name' => 'Multi Community Resident',
            'email' => $resident->email,
            'phone' => '+12025550999',
            'unit_number' => 'B-12',
        ])->assertCreated();

        $inviteId = (int) \App\Models\InviteCode::query()
            ->where('code', $invite->json('data.invite_code'))
            ->value('id');

        Sanctum::actingAs($resident->fresh());
        $this->postJson("/api/v1/me/invitations/{$inviteId}/reject")
            ->assertOk()
            ->assertJsonPath('data.status', 'invite_rejected');

        $this->getJson('/api/v1/me/invitations')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->assertDatabaseHas('users', [
            'id' => $resident->id,
            'active_context_community_id' => $world['communityA']->id,
        ]);
        $this->assertDatabaseHas('community_memberships', [
            'user_id' => $resident->id,
            'community_id' => $world['communityA']->id,
            'status' => 'approved',
        ]);
        $this->assertDatabaseMissing('community_memberships', [
            'user_id' => $resident->id,
            'community_id' => $world['communityB']->id,
        ]);

        Sanctum::actingAs($world['adminB']);
        $members = $this->getJson('/api/v1/admin/members?status=invitation_sent')->assertOk();
        $row = collect($members->json('data'))->firstWhere('id', $resident->id);
        $this->assertNotNull($row);
        $this->assertSame('invite_rejected', $row['status']);
    }

    public function test_accepting_invitation_redeems_code_without_switching_or_copying_units(): void
    {
        $world = $this->seedTwoCommunitiesWithResident();
        $resident = $world['resident']->fresh();

        Sanctum::actingAs($world['adminB']);
        $invite = $this->postJson('/api/v1/admin/members/invite', [
            'name' => 'Multi Community Resident',
            'email' => $resident->email,
            'phone' => '+12025550999',
            'unit_number' => 'B-12',
        ])->assertCreated();

        Sanctum::actingAs($resident->fresh());
        $this->postJson('/api/v1/communities/join-by-invite', [
            'invite_code' => $invite->json('data.invite_code'),
        ])
            ->assertSuccessful()
            ->assertJsonPath('data.membership.community_id', $world['communityB']->id)
            ->assertJsonPath('data.membership.status', 'pending');

        $this->assertDatabaseHas('users', [
            'id' => $resident->id,
            'active_context_community_id' => $world['communityA']->id,
        ]);
        $this->assertDatabaseHas('profiles', [
            'user_id' => $resident->id,
            'unit_number' => '101',
        ]);
        $this->assertFalse(
            DB::table('units')
                ->where('community_id', $world['communityB']->id)
                ->where('unit_number_normalized', '101')
                ->exists(),
        );

        $this->getJson('/api/v1/me?invite_community_id='.$world['communityB']->id)
            ->assertOk()
            ->assertJsonPath('data.invite_units.0.unit_number', 'B-12')
            ->assertJsonPath('data.needs_invite_code', false);

        $this->getJson('/api/v1/me/communities')
            ->assertOk();
        $statuses = collect($this->getJson('/api/v1/me/communities')->json('data'))
            ->pluck('status', 'community_id')
            ->all();
        $this->assertSame('approved', $statuses[$world['communityA']->id] ?? null);
        $this->assertSame('pending', $statuses[$world['communityB']->id] ?? null);

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.invite_units.0.unit_number', 'B-12')
            ->assertJsonPath('data.invite_units.0.locked', true);

        $this->assertDatabaseHas('community_memberships', [
            'user_id' => $resident->id,
            'community_id' => $world['communityB']->id,
            'status' => 'pending',
        ]);

        Sanctum::actingAs($world['adminB']);
        $detail = $this->getJson('/api/v1/admin/members/'.$resident->id)->assertOk();
        $this->assertSame('pending', $detail->json('data.status'));
        $this->assertSame(
            ['B-12'],
            array_column($detail->json('data.units') ?? [], 'unit_number'),
        );
        $this->assertSame(
            ['pending'],
            array_column($detail->json('data.units') ?? [], 'association_status'),
            'Pending second-community membership must not surface unit status as invite.',
        );
    }

    public function test_invited_second_community_auto_approves_admin_unit_and_queues_extra_units(): void
    {
        $world = $this->seedTwoCommunitiesWithResident();
        $resident = $world['resident']->fresh();

        DB::table('profiles')->where('user_id', $resident->id)->update([
            'residence_type' => 'homeowner',
            'utility_bill_url' => '/storage/utility-bills/multi.jpg',
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($world['adminB']);
        $invite = $this->postJson('/api/v1/admin/members/invite', [
            'name' => 'Multi Community Resident',
            'email' => $resident->email,
            'phone' => '+12025550999',
            'unit_number' => 'B-12',
        ])->assertCreated();

        Sanctum::actingAs($resident->fresh());
        $this->postJson('/api/v1/communities/join-by-invite', [
            'invite_code' => $invite->json('data.invite_code'),
        ])->assertSuccessful();

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.invite_units.0.unit_number', 'B-12')
            ->assertJsonPath('data.invite_units.0.locked', true);

        $this->assertDatabaseHas('community_memberships', [
            'user_id' => $resident->id,
            'community_id' => $world['communityB']->id,
            'status' => 'pending',
        ]);

        $this->getJson('/api/v1/me?invite_community_id='.$world['communityB']->id)
            ->assertOk()
            ->assertJsonPath('data.invite_units.0.unit_number', 'B-12');

        $this->putJson('/api/v1/me', [
            'display_name' => 'Multi Community Resident',
            'residence_type' => 'homeowner',
        ])->assertOk();

        $this->assertDatabaseHas('community_memberships', [
            'user_id' => $resident->id,
            'community_id' => $world['communityB']->id,
            'status' => 'approved',
        ]);

        $this->postJson('/api/v1/units/mine/onboarding-units', [
            'community_id' => $world['communityB']->id,
            'units' => [
                [
                    'unit_number' => 'B-12',
                    'is_new_unit' => false,
                    'residence_type' => 'homeowner',
                    'utility_bill_url' => '/storage/proofs/utility-b12.jpg',
                ],
                [
                    'unit_number' => 'C-3',
                    'is_new_unit' => true,
                    'residence_type' => 'tenant',
                    'utility_bill_url' => '/storage/proofs/utility-c3.jpg',
                ],
            ],
        ])
            ->assertOk()
            ->assertJsonPath('data.mode', 'invite');

        $this->assertDatabaseHas('unit_residents', [
            'user_id' => $resident->id,
            'community_id' => $world['communityB']->id,
            'status' => UnitAssignmentService::RESIDENT_ACTIVE,
            'source' => 'invite',
        ]);
        $this->assertDatabaseHas('units', [
            'community_id' => $world['communityB']->id,
            'unit_number' => 'B-12',
        ]);
        $this->assertDatabaseHas('unit_registration_packages', [
            'user_id' => $resident->id,
            'community_id' => $world['communityB']->id,
            'kind' => UnitRegistrationPackageService::KIND_ADDON,
            'status' => UnitRegistrationPackageService::STATUS_PENDING,
        ]);
        $this->assertDatabaseHas('unit_registration_package_items', [
            'unit_number' => 'C-3',
            'status' => 'pending',
        ]);
        $this->assertDatabaseHas('unit_residents', [
            'user_id' => $resident->id,
            'community_id' => $world['communityB']->id,
            'status' => UnitAssignmentService::RESIDENT_PENDING,
            'source' => 'addon',
        ]);

        $this->assertFalse(
            app(UnitRegistrationPackageService::class)->hasPendingInitialPackage(
                $resident->id,
                $world['communityB']->id,
            ),
        );
        $this->assertTrue(
            app(UnitRegistrationPackageService::class)->residentHasFullUnitAccess(
                $resident->id,
                $world['communityB']->id,
            ),
        );

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.active_context_community_id', $world['communityA']->id)
            ->assertJsonPath('data.pending_unit_package', false)
            ->assertJsonPath('data.has_full_unit_access', true);
    }

    public function test_resident_activity_does_not_leak_other_community_profile_logs(): void
    {
        $world = $this->seedTwoCommunitiesWithResident();
        $resident = $world['resident'];

        DB::table('community_memberships')->insert([
            'user_id' => $resident->id,
            'community_id' => $world['communityB']->id,
            'role' => 'member',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($resident);
        \App\Services\ActivityLogService::user(
            'profile_updated',
            'Resident, updated Region: Pakistan - Kotli → Pakistan - Lahore',
            'User',
            (int) $resident->id,
            'info',
            (int) $resident->id,
            ['related_item' => $resident->name],
        );
        DB::table('activity_logs')
            ->where('action', 'profile_updated')
            ->where('entity_id', $resident->id)
            ->update(['community_id' => null]);

        \App\Services\ActivityLogService::user(
            'profile_updated',
            'Resident, updated Region in Beta',
            'User',
            (int) $resident->id,
            'info',
            (int) $resident->id,
            [
                'community_id' => $world['communityB']->id,
                'related_item' => $resident->name,
            ],
        );
        \App\Services\ActivityLogService::user(
            'post_created',
            'Posted in Alpha',
            'Post',
            1,
            'info',
            (int) $resident->id,
            ['community_id' => $world['communityA']->id],
        );

        Sanctum::actingAs($world['adminA']);
        $alpha = collect($this->getJson(
            "/api/v1/admin/members/{$resident->id}/activity-logs?community_id={$world['communityA']->id}"
        )->assertOk()->json('data'));
        $this->assertTrue($alpha->contains(fn ($row) => $row['action'] === 'post_created'));
        $this->assertFalse($alpha->contains(fn ($row) => str_contains((string) ($row['description'] ?? ''), 'Kotli')));
        $this->assertFalse($alpha->contains(fn ($row) => str_contains((string) ($row['description'] ?? ''), 'Beta')));
        $this->assertSame('101', $this->getJson(
            "/api/v1/admin/members/{$resident->id}/activity-logs?community_id={$world['communityA']->id}"
        )->json('meta.member.unit_number'));

        Sanctum::actingAs($world['adminB']);
        $betaResponse = $this->getJson(
            "/api/v1/admin/members/{$resident->id}/activity-logs?community_id={$world['communityB']->id}"
        )->assertOk();
        $beta = collect($betaResponse->json('data'));
        $this->assertTrue($beta->contains(fn ($row) => str_contains((string) ($row['description'] ?? ''), 'Beta')));
        $this->assertFalse($beta->contains(fn ($row) => str_contains((string) ($row['description'] ?? ''), 'Kotli')));
        $this->assertFalse($beta->contains(fn ($row) => $row['action'] === 'post_created'));
        $this->assertNull($betaResponse->json('meta.member.unit_number'));
    }

    public function test_profile_update_while_joining_second_community_stamps_that_community(): void
    {
        $world = $this->seedTwoCommunitiesWithResident();
        $resident = $world['resident']->fresh();

        DB::table('community_memberships')->insert([
            'user_id' => $resident->id,
            'community_id' => $world['communityB']->id,
            'role' => 'member',
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $lahore = Region::query()->create([
            'title' => 'Pakistan - Lahore',
            'area' => 'Lahore',
            'state' => 'PB',
            'users_label' => '0',
            'sort_order' => 2,
            'status' => 'active',
        ]);

        Sanctum::actingAs($resident);
        $this->putJson('/api/v1/me', [
            'region_id' => $lahore->id,
        ])->assertOk();

        $log = DB::table('activity_logs')
            ->where('action', 'profile_updated')
            ->where('entity_id', $resident->id)
            ->orderByDesc('id')
            ->first();

        $this->assertNotNull($log);
        $this->assertSame($world['communityB']->id, (int) $log->community_id);
    }

    public function test_suspend_in_one_community_keeps_other_approved_memberships(): void
    {
        $world = $this->seedTwoCommunitiesWithResident();
        $communityC = Community::query()->create([
            'name' => 'Community Gamma',
            'region_id' => $world['region']->id,
            'region' => $world['region']->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);
        app(CommunityBillingService::class)->activateManualSubscription($communityC, 'growth');

        DB::table('community_memberships')->insert([
            [
                'user_id' => $world['resident']->id,
                'community_id' => $world['communityB']->id,
                'role' => 'member',
                'status' => 'approved',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'user_id' => $world['resident']->id,
                'community_id' => $communityC->id,
                'role' => 'member',
                'status' => 'approved',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        Sanctum::actingAs($world['adminA']);
        $this->patchJson("/api/v1/admin/members/{$world['resident']->id}/suspend", [
            'community_id' => $world['communityA']->id,
        ])->assertOk();

        $resident = $world['resident']->fresh();
        $this->assertSame('active', $resident->status);
        $this->assertSame($world['communityB']->id, (int) $resident->active_context_community_id);
        $this->assertDatabaseHas('community_memberships', [
            'user_id' => $resident->id,
            'community_id' => $world['communityA']->id,
            'status' => 'banned',
        ]);
        $this->assertDatabaseHas('community_memberships', [
            'user_id' => $resident->id,
            'community_id' => $world['communityB']->id,
            'status' => 'approved',
        ]);
        $this->assertDatabaseHas('community_memberships', [
            'user_id' => $resident->id,
            'community_id' => $communityC->id,
            'status' => 'approved',
        ]);

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.active_context_community_id', $world['communityB']->id)
            ->assertJsonPath('data.can_switch_communities', true);

        $communities = collect($this->getJson('/api/v1/me/communities')->assertOk()->json('data'));
        $this->assertSame('banned', $communities->firstWhere('community_id', $world['communityA']->id)['status']);
        $this->assertSame('approved', $communities->firstWhere('community_id', $world['communityB']->id)['status']);
        $this->assertSame('approved', $communities->firstWhere('community_id', $communityC->id)['status']);
        $this->assertTrue((bool) $communities->firstWhere('community_id', $world['communityB']->id)['is_active']);

        $this->putJson('/api/v1/me/active-context', [
            'community_id' => $communityC->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.active_context_community_id', $communityC->id);

        $this->putJson('/api/v1/me/active-context', [
            'community_id' => $world['communityB']->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.active_context_community_id', $world['communityB']->id);

        $this->putJson('/api/v1/me/active-context', [
            'community_id' => $world['communityA']->id,
        ])->assertStatus(422)->assertJsonValidationErrors(['community_id']);

        $this->getJson('/api/v1/feed')->assertOk();
    }

    public function test_stale_account_suspend_self_heals_when_other_communities_remain_approved(): void
    {
        $world = $this->seedTwoCommunitiesWithResident();
        DB::table('community_memberships')->insert([
            'user_id' => $world['resident']->id,
            'community_id' => $world['communityB']->id,
            'role' => 'member',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('community_memberships')
            ->where('user_id', $world['resident']->id)
            ->where('community_id', $world['communityA']->id)
            ->update(['status' => 'banned']);
        $world['resident']->update([
            'status' => 'suspended',
            'suspension_reason' => CommunityLifecycleService::REASON_MEMBER_SUSPENDED,
            'active_context_community_id' => $world['communityA']->id,
        ]);

        Sanctum::actingAs($world['resident']->fresh());

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.active_context_community_id', $world['communityB']->id);

        $this->getJson('/api/v1/me/communities')
            ->assertOk()
            ->assertJsonPath('meta.active_community_id', $world['communityB']->id);

        $this->assertDatabaseHas('users', [
            'id' => $world['resident']->id,
            'status' => 'active',
            'active_context_community_id' => $world['communityB']->id,
        ]);
        $this->assertDatabaseHas('community_memberships', [
            'user_id' => $world['resident']->id,
            'community_id' => $world['communityB']->id,
            'status' => 'approved',
        ]);
    }
}
