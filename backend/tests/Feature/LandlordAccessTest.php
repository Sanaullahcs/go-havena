<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\Region;
use App\Models\User;
use App\Services\CommunityBillingService;
use App\Services\Landlord\UnitOwnershipService;
use App\Services\UnitAssignmentService;
use App\Support\Landlord\UnitOwnershipOccupancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LandlordAccessTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{community: Community, admin: User, units: UnitAssignmentService} */
    private function seedCommunity(): array
    {
        $region = Region::query()->create([
            'title' => 'Landlord Region',
            'area' => 'Area',
            'state' => 'ST',
            'users_label' => '0',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $community = Community::query()->create([
            'name' => 'Landlord Tower',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'password' => Hash::make('password'),
        ]);

        DB::table('community_memberships')->insert([
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $units = app(UnitAssignmentService::class);
        $units->assignUserToUnitNumber($community->id, $admin->id, 'Office', true);
        app(CommunityBillingService::class)->activateManualSubscription($community, 'growth');

        return ['community' => $community, 'admin' => $admin, 'units' => $units];
    }

    private function approvedResident(
        User $user,
        Community $community,
        string $unitNumber,
        bool $replaceOthers = true,
    ): int {
        if (! DB::table('profiles')->where('user_id', $user->id)->exists()) {
            DB::table('profiles')->insert([
                'user_id' => $user->id,
                'display_name' => $user->email ?? 'Resident',
                'unit_number' => $unitNumber,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        if (! DB::table('community_memberships')->where('user_id', $user->id)->where('community_id', $community->id)->exists()) {
            DB::table('community_memberships')->insert([
                'user_id' => $user->id,
                'community_id' => $community->id,
                'role' => 'member',
                'status' => 'approved',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $unit = app(UnitAssignmentService::class)->assignUserToUnitNumber(
            $community->id,
            $user->id,
            $unitNumber,
            false,
            $replaceOthers,
            'active',
            'invite',
        );

        return (int) $unit->id;
    }

    private function approveOwnership(int $ownershipId, int $adminId): void
    {
        app(UnitOwnershipService::class)->approve($ownershipId, $adminId);
    }

    public function test_use_case_1_rented_owner_keeps_resident_app_and_landlord_tools(): void
    {
        ['community' => $community, 'admin' => $admin, 'units' => $units] = $this->seedCommunity();

        $owner = User::factory()->create(['role' => 'resident', 'status' => 'active']);

        $unit = $units->createUnit($community->id, '302');
        DB::table('community_memberships')->insert([
            'user_id' => $owner->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $ownershipId = app(UnitOwnershipService::class)->claim(
            $community->id,
            (int) $unit->id,
            $owner->id,
            UnitOwnershipOccupancy::RENTED,
        );
        $this->approveOwnership($ownershipId, $admin->id);

        Sanctum::actingAs($owner);
        $this->getJson('/api/v1/landlord/access?community_id='.$community->id)
            ->assertOk()
            ->assertJsonPath('data.resident', true)
            ->assertJsonPath('data.landlord_dashboard', true)
            ->assertJsonPath('data.owner_only', false)
            ->assertJsonPath('data.active_resident_unit_count', 0)
            ->assertJsonPath('data.landlord_unit_count', 1)
            ->assertJsonPath('data.landlord_units.0.landlord_bill_status_only', false)
            ->assertJsonPath('data.landlord_units.0.landlord_can_pay_bills', true);
    }

    public function test_use_case_2_owner_occupier_resident_without_landlord_dashboard(): void
    {
        ['community' => $community, 'admin' => $admin, 'units' => $units] = $this->seedCommunity();

        $owner = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        $unitId = $this->approvedResident($owner, $community, '101');

        $ownershipId = app(UnitOwnershipService::class)->claim(
            $community->id,
            $unitId,
            $owner->id,
            UnitOwnershipOccupancy::LIVE_HERE,
        );
        $this->approveOwnership($ownershipId, $admin->id);

        Sanctum::actingAs($owner);
        $this->getJson('/api/v1/landlord/access?community_id='.$community->id)
            ->assertOk()
            ->assertJsonPath('data.resident', true)
            ->assertJsonPath('data.landlord_dashboard', false)
            ->assertJsonPath('data.owner_only', false);
    }

    public function test_use_case_3_live_in_one_unit_landlord_on_rented_other(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();

        $user = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        $unitA = $this->approvedResident($user, $community, '101');
        $unitB = app(UnitAssignmentService::class)->createUnit($community->id, '302');

        $ownershipId = app(UnitOwnershipService::class)->claim(
            $community->id,
            (int) $unitB->id,
            $user->id,
            UnitOwnershipOccupancy::RENTED,
        );
        $this->approveOwnership($ownershipId, $admin->id);
        app(UnitOwnershipService::class)->setPrimaryResidence($user->id, $community->id, $unitA);

        Sanctum::actingAs($user);
        $this->getJson('/api/v1/landlord/access?community_id='.$community->id)
            ->assertOk()
            ->assertJsonPath('data.resident', true)
            ->assertJsonPath('data.landlord_dashboard', true)
            ->assertJsonPath('data.owner_only', false)
            ->assertJsonPath('data.primary_residence_unit_id', $unitA)
            ->assertJsonPath('data.active_resident_unit_count', 1)
            ->assertJsonPath('data.approved_ownership_count', 1);
    }

    public function test_use_case_4_tenant_on_one_unit_landlord_on_rented_owned_other(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();

        $user = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        $tenantUnit = $this->approvedResident($user, $community, '205');
        $ownedUnit = app(UnitAssignmentService::class)->createUnit($community->id, '302');

        $ownershipId = app(UnitOwnershipService::class)->claim(
            $community->id,
            (int) $ownedUnit->id,
            $user->id,
            UnitOwnershipOccupancy::VACANT,
        );
        $this->approveOwnership($ownershipId, $admin->id);
        app(UnitOwnershipService::class)->setPrimaryResidence($user->id, $community->id, $tenantUnit);

        Sanctum::actingAs($user);
        $res = $this->getJson('/api/v1/landlord/access?community_id='.$community->id)->assertOk();

        $res->assertJsonPath('data.resident', true)
            ->assertJsonPath('data.landlord_dashboard', true)
            ->assertJsonPath('data.landlord_units.0.landlord_can_pay_bills', true);
    }

    public function test_rented_unit_resident_roster_count_on_landlord_payload(): void
    {
        ['community' => $community, 'admin' => $admin, 'units' => $units] = $this->seedCommunity();

        $landlord = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        DB::table('community_memberships')->insert([
            'user_id' => $landlord->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $unit = $units->createUnit($community->id, '401');
        $ownershipId = app(UnitOwnershipService::class)->claim(
            $community->id,
            (int) $unit->id,
            $landlord->id,
            UnitOwnershipOccupancy::RENTED,
        );
        $this->approveOwnership($ownershipId, $admin->id);

        $tenantA = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        $tenantB = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        $this->approvedResident($tenantA, $community, '401', false);
        $this->approvedResident($tenantB, $community, '401', false);

        Sanctum::actingAs($landlord);
        $this->getJson('/api/v1/landlord/access?community_id='.$community->id)
            ->assertOk()
            ->assertJsonPath('data.landlord_units.0.resident_count', 2);
    }

    public function test_become_landlord_claim_portfolio_and_admin_approve(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();

        $user = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        DB::table('community_memberships')->insert([
            'user_id' => $user->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($user);
        $claim = $this->postJson('/api/v1/landlord/ownership-claims?community_id='.$community->id, [
            'unit_number' => '550',
            'is_new_unit' => true,
            'occupancy' => UnitOwnershipOccupancy::RENTED,
            'proof_url' => 'https://example.test/ownership.pdf',
        ])->assertCreated();

        $ownershipId = (int) $claim->json('data.ownership_id');
        $this->assertGreaterThan(0, $ownershipId);

        $this->getJson('/api/v1/landlord/portfolio?community_id='.$community->id)
            ->assertOk()
            ->assertJsonPath('data.pending_claims.0.id', $ownershipId)
            ->assertJsonPath('data.access.landlord_enabled', true);

        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/admin/landlord-ownership-claims?status=pending')
            ->assertOk()
            ->assertJsonPath('data.0.id', $ownershipId)
            ->assertJsonPath('data.0.occupancy', UnitOwnershipOccupancy::RENTED);

        $this->postJson('/api/v1/admin/landlord-ownership-claims/'.$ownershipId.'/approve')
            ->assertOk();

        Sanctum::actingAs($user);
        $this->getJson('/api/v1/landlord/portfolio?community_id='.$community->id)
            ->assertOk()
            ->assertJsonPath('data.access.landlord_dashboard', true)
            ->assertJsonPath('data.landlord_units.0.unit_number', '550')
            ->assertJsonPath('data.landlord_units.0.bill_status.detail', 'owner_pays');
    }

    public function test_landlord_advisory_reject_does_not_remove_tenant(): void
    {
        ['community' => $community, 'admin' => $admin, 'units' => $units] = $this->seedCommunity();

        $landlord = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        DB::table('community_memberships')->insert([
            'user_id' => $landlord->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $unit = $units->createUnit($community->id, '880');
        $ownershipId = app(UnitOwnershipService::class)->claim(
            $community->id,
            (int) $unit->id,
            $landlord->id,
            UnitOwnershipOccupancy::RENTED,
            'become_landlord',
            'https://example.test/deed.pdf',
        );
        $this->approveOwnership($ownershipId, $admin->id);

        $tenant = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        $this->approvedResident($tenant, $community, '880', false);

        $reviewId = (int) DB::table('landlord_membership_reviews')
            ->where('subject_user_id', $tenant->id)
            ->value('id');
        $this->assertGreaterThan(0, $reviewId);

        Sanctum::actingAs($landlord);
        $this->postJson('/api/v1/landlord/advisory-reviews/'.$reviewId, [
            'status' => 'rejected',
            'reason' => 'Need a lease',
        ])->assertOk()->assertJsonPath('data.blocks_admin', false);

        $this->assertSame(
            'active',
            DB::table('unit_residents')->where('user_id', $tenant->id)->where('unit_id', $unit->id)->value('status'),
        );
    }

    public function test_live_here_blocked_when_other_residents_exist(): void
    {
        ['community' => $community, 'admin' => $admin, 'units' => $units] = $this->seedCommunity();
        $landlord = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        DB::table('community_memberships')->insert([
            'user_id' => $landlord->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $unit = $units->createUnit($community->id, '881');
        $ownershipId = app(UnitOwnershipService::class)->claim(
            $community->id,
            (int) $unit->id,
            $landlord->id,
            UnitOwnershipOccupancy::RENTED,
        );
        $this->approveOwnership($ownershipId, $admin->id);
        $tenant = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        $this->approvedResident($tenant, $community, '881', false);

        Sanctum::actingAs($landlord);
        $this->patchJson('/api/v1/landlord/ownerships/'.$ownershipId.'/occupancy', [
            'occupancy' => UnitOwnershipOccupancy::LIVE_HERE,
        ])->assertStatus(422);
    }

    public function test_non_resident_owner_can_open_resident_feed(): void
    {
        ['community' => $community, 'admin' => $admin, 'units' => $units] = $this->seedCommunity();
        $owner = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        DB::table('community_memberships')->insert([
            'user_id' => $owner->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $unit = $units->createUnit($community->id, '882');
        $ownershipId = app(UnitOwnershipService::class)->claim(
            $community->id,
            (int) $unit->id,
            $owner->id,
            UnitOwnershipOccupancy::VACANT,
        );
        $this->approveOwnership($ownershipId, $admin->id);

        $owner->forceFill(['active_context_community_id' => $community->id])->save();

        Sanctum::actingAs($owner);
        $this->getJson('/api/v1/feed')->assertOk();
        $this->assertSame(
            0,
            DB::table('unit_residents')->where('user_id', $owner->id)->where('status', 'active')->count(),
        );
    }

    public function test_vacant_signup_shows_on_my_units_with_occupancy_and_approval(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();
        $owner = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        DB::table('community_memberships')->insert([
            'user_id' => $owner->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $package = app(\App\Services\UnitRegistrationPackageService::class)->submitPackage(
            $owner->id,
            $community->id,
            'initial',
            [[
                'unit_number' => '775',
                'is_new_unit' => true,
                'residence_type' => 'homeowner',
                'occupancy' => UnitOwnershipOccupancy::VACANT,
                'utility_bill_url' => '/storage/proofs/utility-775.jpg',
                'ownership_proof_url' => '/storage/proofs/own-775.jpg',
            ]],
        );

        Sanctum::actingAs($owner);
        $pending = $this->getJson('/api/v1/units/mine?community_id='.$community->id)->assertOk();
        $pending->assertJsonPath('units.0.unit_number', '775')
            ->assertJsonPath('units.0.occupancy', 'vacant')
            ->assertJsonPath('units.0.approval_status', 'pending')
            ->assertJsonPath('meta.unit_count', 0);

        app(\App\Services\UnitRegistrationPackageService::class)->approvePackage((int) $package->id, $admin->id);

        $approved = $this->getJson('/api/v1/units/mine?community_id='.$community->id)->assertOk();
        $approved->assertJsonPath('units.0.unit_number', '775')
            ->assertJsonPath('units.0.occupancy', 'vacant')
            ->assertJsonPath('units.0.approval_status', 'approved')
            ->assertJsonPath('meta.unit_count', 0);
        $this->assertSame(
            0,
            DB::table('unit_residents')->where('user_id', $owner->id)->where('status', 'active')->count(),
        );

        $unitId = (int) DB::table('units')->where('unit_number', '775')->value('id');
        $this->assertSame($owner->id, (int) DB::table('units')->where('id', $unitId)->value('billing_contact_user_id'));
    }

    public function test_rented_unit_transfers_billing_to_approved_tenant(): void
    {
        ['community' => $community, 'admin' => $admin, 'units' => $units] = $this->seedCommunity();

        $owner = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        DB::table('community_memberships')->insert([
            'user_id' => $owner->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $unit = $units->createUnit($community->id, '450');
        $ownershipId = app(UnitOwnershipService::class)->claim(
            $community->id,
            (int) $unit->id,
            $owner->id,
            UnitOwnershipOccupancy::RENTED,
        );
        $this->approveOwnership($ownershipId, $admin->id);
        $this->assertSame($owner->id, (int) DB::table('units')->where('id', $unit->id)->value('billing_contact_user_id'));

        $tenant = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        DB::table('community_memberships')->insert([
            'user_id' => $tenant->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $units->attachUserToUnit($community->id, $tenant->id, (int) $unit->id, UnitAssignmentService::RESIDENT_PENDING, 'invite');

        $this->assertSame($owner->id, (int) DB::table('units')->where('id', $unit->id)->value('billing_contact_user_id'));

        $units->attachUserToUnit($community->id, $tenant->id, (int) $unit->id, UnitAssignmentService::RESIDENT_ACTIVE, 'invite');
        $this->assertSame($tenant->id, (int) DB::table('units')->where('id', $unit->id)->value('billing_contact_user_id'));

        $this->assertTrue(app(\App\Services\Landlord\LandlordAccessService::class)->rentedOwnerCannotPay($owner->id, (int) $unit->id));
        $this->assertFalse(app(\App\Services\Landlord\LandlordAccessService::class)->rentedOwnerCannotPay($tenant->id, (int) $unit->id));
    }

    public function test_admin_members_list_includes_landlord_owned_units_when_not_resident(): void
    {
        ['community' => $community, 'admin' => $admin, 'units' => $units] = $this->seedCommunity();

        $owner = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        DB::table('community_memberships')->insert([
            'user_id' => $owner->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $vacant = $units->createUnit($community->id, '775');
        $rented = $units->createUnit($community->id, '201');
        foreach ([[$vacant, UnitOwnershipOccupancy::VACANT], [$rented, UnitOwnershipOccupancy::RENTED]] as [$unit, $occupancy]) {
            $ownershipId = app(UnitOwnershipService::class)->claim(
                $community->id,
                (int) $unit->id,
                $owner->id,
                $occupancy,
            );
            $this->approveOwnership($ownershipId, $admin->id);
        }

        Sanctum::actingAs($admin);
        $response = $this->getJson('/api/v1/admin/members?community_id='.$community->id.'&status=approved')
            ->assertOk();

        $row = collect($response->json('data'))->firstWhere('id', $owner->id);
        $this->assertNotNull($row);
        $this->assertCount(2, $row['units'] ?? []);
        $this->assertSame('ownership', $row['units'][0]['association_status'] ?? null);
        $this->assertSame('ownership', $row['units'][1]['association_status'] ?? null);
        $numbers = collect($row['units'])->pluck('unit_number')->sort()->values()->all();
        $this->assertSame(['201', '775'], $numbers);
    }

    public function test_member_occupancy_kind_landlord_until_active_residency(): void
    {
        ['community' => $community, 'admin' => $admin, 'units' => $units] = $this->seedCommunity();

        $owner = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        DB::table('community_memberships')->insert([
            'user_id' => $owner->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $liveHere = $units->createUnit($community->id, '002');
        $rented = $units->createUnit($community->id, '201');
        $vacant = $units->createUnit($community->id, '775');

        app(UnitOwnershipService::class)->claim(
            $community->id,
            (int) $liveHere->id,
            $owner->id,
            UnitOwnershipOccupancy::LIVE_HERE,
        );
        foreach ([[$rented, UnitOwnershipOccupancy::RENTED], [$vacant, UnitOwnershipOccupancy::VACANT]] as [$unit, $occ]) {
            $ownershipId = app(UnitOwnershipService::class)->claim($community->id, (int) $unit->id, $owner->id, $occ);
            $this->approveOwnership($ownershipId, $admin->id);
        }

        Sanctum::actingAs($admin);
        $row = collect(
            $this->getJson('/api/v1/admin/members?community_id='.$community->id.'&status=approved')
                ->assertOk()
                ->json('data'),
        )->firstWhere('id', $owner->id);
        $this->assertSame('landlord', $row['occupancy_kind'] ?? null);

        $detail = $this->getJson('/api/v1/admin/members/'.$owner->id.'?community_id='.$community->id)
            ->assertOk()
            ->json('data');
        $this->assertSame('landlord', $detail['occupancy_kind'] ?? null);

        $units->attachUserToUnit(
            $community->id,
            $owner->id,
            (int) $liveHere->id,
            UnitAssignmentService::RESIDENT_ACTIVE,
            'ownership',
        );

        $after = $this->getJson('/api/v1/admin/members/'.$owner->id.'?community_id='.$community->id)
            ->assertOk()
            ->json('data');
        $this->assertSame('landlord', $after['occupancy_kind'] ?? null);
    }

    public function test_admin_landlord_claims_queue_excludes_live_here_occupancy(): void
    {
        ['community' => $community, 'admin' => $admin, 'units' => $units] = $this->seedCommunity();

        $owner = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        DB::table('community_memberships')->insert([
            'user_id' => $owner->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $liveHere = $units->createUnit($community->id, '002');
        $rented = $units->createUnit($community->id, '201');
        app(UnitOwnershipService::class)->claim(
            $community->id,
            (int) $liveHere->id,
            $owner->id,
            UnitOwnershipOccupancy::LIVE_HERE,
        );
        app(UnitOwnershipService::class)->claim(
            $community->id,
            (int) $rented->id,
            $owner->id,
            UnitOwnershipOccupancy::RENTED,
        );

        Sanctum::actingAs($admin);
        $numbers = collect(
            $this->getJson('/api/v1/admin/landlord-ownership-claims?status=all')
                ->assertOk()
                ->json('data'),
        )->pluck('unit_number')->all();

        $this->assertNotContains('002', $numbers);
        $this->assertContains('201', $numbers);
    }

    public function test_admin_members_list_hides_pending_unit_request_until_approved(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunity();

        $owner = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        DB::table('community_memberships')->insert([
            'user_id' => $owner->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $package = app(\App\Services\UnitRegistrationPackageService::class)->submitPackage(
            $owner->id,
            $community->id,
            'initial',
            [[
                'unit_number' => '882',
                'is_new_unit' => true,
                'residence_type' => 'homeowner',
                'occupancy' => UnitOwnershipOccupancy::VACANT,
                'utility_bill_url' => '/storage/proofs/utility-882.jpg',
                'ownership_proof_url' => '/storage/proofs/own-882.jpg',
            ]],
        );

        Sanctum::actingAs($admin);
        $before = $this->getJson('/api/v1/admin/members?community_id='.$community->id.'&status=approved')
            ->assertOk();
        $rowBefore = collect($before->json('data'))->firstWhere('id', $owner->id);
        $this->assertNotNull($rowBefore);
        $this->assertSame([], $rowBefore['units'] ?? []);

        app(\App\Services\UnitRegistrationPackageService::class)->approvePackage((int) $package->id, $admin->id);

        $after = $this->getJson('/api/v1/admin/members?community_id='.$community->id.'&status=approved')
            ->assertOk();
        $rowAfter = collect($after->json('data'))->firstWhere('id', $owner->id);
        $this->assertNotNull($rowAfter);
        $numbers = collect($rowAfter['units'] ?? [])->pluck('unit_number')->all();
        $this->assertContains('882', $numbers);
        $this->assertSame('landlord', $rowAfter['occupancy_kind'] ?? null);
    }

    public function test_admin_members_list_excludes_live_here_landlord_units(): void
    {
        ['community' => $community, 'admin' => $admin, 'units' => $units] = $this->seedCommunity();

        $owner = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        DB::table('community_memberships')->insert([
            'user_id' => $owner->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $liveHere = $units->createUnit($community->id, '002');
        $rented = $units->createUnit($community->id, '201');
        foreach ([[$liveHere, UnitOwnershipOccupancy::LIVE_HERE], [$rented, UnitOwnershipOccupancy::RENTED]] as [$unit, $occupancy]) {
            $ownershipId = app(UnitOwnershipService::class)->claim(
                $community->id,
                (int) $unit->id,
                $owner->id,
                $occupancy,
            );
            $this->approveOwnership($ownershipId, $admin->id);
        }

        Sanctum::actingAs($admin);
        $response = $this->getJson('/api/v1/admin/members?community_id='.$community->id.'&status=approved')
            ->assertOk();

        $row = collect($response->json('data'))->firstWhere('id', $owner->id);
        $this->assertNotNull($row);
        $numbers = collect($row['units'] ?? [])->pluck('unit_number')->sort()->values()->all();
        $this->assertSame(['201'], $numbers);
        $this->assertSame('rented', $row['units'][0]['occupancy'] ?? null);
    }

    public function test_vacant_ownership_forces_owner_as_billing_contact(): void
    {
        ['community' => $community, 'admin' => $admin, 'units' => $units] = $this->seedCommunity();

        $owner = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        $tenant = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        foreach ([$owner, $tenant] as $user) {
            DB::table('community_memberships')->insert([
                'user_id' => $user->id,
                'community_id' => $community->id,
                'role' => 'member',
                'status' => 'approved',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $unit = $units->createUnit($community->id, '460');
        DB::table('units')->where('id', $unit->id)->update(['billing_contact_user_id' => $tenant->id]);

        $ownershipId = app(UnitOwnershipService::class)->claim(
            $community->id,
            (int) $unit->id,
            $owner->id,
            UnitOwnershipOccupancy::VACANT,
        );
        $this->approveOwnership($ownershipId, $admin->id);

        $this->assertSame($owner->id, (int) DB::table('units')->where('id', $unit->id)->value('billing_contact_user_id'));
    }
}