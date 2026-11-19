<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\Region;
use App\Models\User;
use Database\Seeders\SystemAdminSeeder;
use App\Services\CommunityBillingService;
use App\Services\UnitAssignmentService;
use App\Services\UnitRegistrationPackageService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MultiUnitResidentTest extends TestCase
{
    use RefreshDatabase;

    private function seedCommunityWithAdmin(): array
    {
        $region = Region::query()->create([
            'title' => 'Test Region',
            'area' => 'Area',
            'state' => 'ST',
            'users_label' => '0',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $community = Community::query()->create([
            'name' => 'Multi Unit Tower',
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

        app(UnitAssignmentService::class)->assignUserToUnitNumber(
            $community->id,
            $admin->id,
            'Office',
            true,
        );

        app(CommunityBillingService::class)->activateManualSubscription($community, 'growth');

        return compact('community', 'admin');
    }

    public function test_resident_can_hold_multiple_active_units_in_one_community(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithAdmin();

        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        DB::table('profiles')->insert([
            'user_id' => $resident->id,
            'display_name' => 'Multi Resident',
            'unit_number' => '101',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('community_memberships')->insert([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $units = app(UnitAssignmentService::class);
        $units->assignUserToUnitNumber($community->id, $resident->id, '101', false, true, 'active', 'invite');
        $units->assignUserToUnitNumber($community->id, $resident->id, '202', false, false, 'active', 'invite');

        $this->assertSame(2, $units->activeUnitCountForUser($resident->id, $community->id));

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/units/mine')
            ->assertOk()
            ->assertJsonPath('meta.unit_count', 2)
            ->assertJsonCount(2, 'units');
    }

    public function test_addon_package_approve_activates_unit_without_dropping_existing(): void
    {
        ['community' => $community] = $this->seedCommunityWithAdmin();
        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        DB::table('profiles')->insert([
            'user_id' => $resident->id,
            'display_name' => 'Addon Resident',
            'unit_number' => '10',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('community_memberships')->insert([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $units = app(UnitAssignmentService::class);
        $units->assignUserToUnitNumber($community->id, $resident->id, '10', false, true, 'active', 'invite');

        $packages = app(UnitRegistrationPackageService::class);
        $package = $packages->submitPackage($resident->id, $community->id, 'addon', [
            [
                'unit_number' => '11',
                'is_new_unit' => true,
                'residence_type' => 'homeowner',
                'utility_bill_url' => '/storage/proofs/utility-11.jpg',
                'ownership_proof_url' => '/storage/proofs/own-11.jpg',
            ],
        ]);

        $this->assertSame(1, $units->activeUnitCountForUser($resident->id, $community->id));
        $this->assertDatabaseHas('unit_registration_packages', [
            'id' => $package->id,
            'kind' => 'addon',
            'status' => 'pending',
        ]);
        $this->assertDatabaseHas('unit_residents', [
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'status' => UnitAssignmentService::RESIDENT_PENDING,
            'source' => 'addon',
        ]);

        // Mine must keep association_status=pending (not collapse to unit.status=active).
        Sanctum::actingAs($resident);
        $mine = $this->getJson('/api/v1/units/mine')->assertOk();
        $mine->assertJsonPath('meta.unit_count', 1);
        $addonRow = collect($mine->json('units'))->firstWhere('unit_number', '11');
        $this->assertNotNull($addonRow);
        $this->assertSame('pending', $addonRow['association_status'] ?? null);

        $admin = User::query()->where('role', 'community_admin')->firstOrFail();
        $packages->approvePackage((int) $package->id, (int) $admin->id);

        $this->assertSame(2, $units->activeUnitCountForUser($resident->id, $community->id));
        $this->assertDatabaseHas('unit_residents', [
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'status' => UnitAssignmentService::RESIDENT_ACTIVE,
            'source' => 'addon',
        ]);
    }

    public function test_addon_package_reject_only_marks_requested_unit_rejected(): void
    {
        ['community' => $community] = $this->seedCommunityWithAdmin();
        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        DB::table('profiles')->insert([
            'user_id' => $resident->id,
            'display_name' => 'Addon Reject Resident',
            'unit_number' => '20',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('community_memberships')->insert([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $units = app(UnitAssignmentService::class);
        $units->assignUserToUnitNumber($community->id, $resident->id, '20', false, true, 'active', 'invite');
        $units->assignUserToUnitNumber($community->id, $resident->id, '21', false, false, 'active', 'invite');

        $packages = app(UnitRegistrationPackageService::class);
        $package = $packages->submitPackage($resident->id, $community->id, 'addon', [
            [
                'unit_number' => '22',
                'is_new_unit' => true,
                'residence_type' => 'tenant',
                'utility_bill_url' => '/storage/proofs/utility-22.jpg',
            ],
        ]);

        $admin = User::query()->where('role', 'community_admin')->firstOrFail();
        $packages->rejectPackage((int) $package->id, (int) $admin->id, 'Unit proof unclear');

        $this->assertSame(2, $units->activeUnitCountForUser($resident->id, $community->id));
        $this->assertDatabaseHas('unit_residents', [
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'status' => UnitAssignmentService::RESIDENT_REJECTED,
            'source' => 'addon',
        ]);
        $this->assertDatabaseHas('unit_residents', [
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'status' => UnitAssignmentService::RESIDENT_ACTIVE,
        ]);

        Sanctum::actingAs($resident);
        $mine = $this->getJson('/api/v1/units/mine')->assertOk();
        $mine->assertJsonPath('meta.unit_count', 2);
        $rejected = collect($mine->json('units'))->firstWhere('unit_number', '22');
        $this->assertSame('rejected', $rejected['association_status'] ?? null);
        $this->assertSame('Unit proof unclear', $rejected['association_rejection_reason'] ?? null);
    }

    public function test_member_approve_clears_pending_initial_unit_package(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithAdmin();

        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        DB::table('profiles')->insert([
            'user_id' => $resident->id,
            'display_name' => 'Pending Package Resident',
            'unit_number' => '401',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('community_memberships')->insert([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $packages = app(UnitRegistrationPackageService::class);
        $package = $packages->submitPackage($resident->id, $community->id, 'initial', [
            [
                'unit_number' => '401',
                'is_new_unit' => true,
                'residence_type' => 'tenant',
                'utility_bill_url' => '/storage/proofs/utility-401.jpg',
            ],
            [
                'unit_number' => '402',
                'is_new_unit' => true,
                'residence_type' => 'tenant',
                'utility_bill_url' => '/storage/proofs/utility-402.jpg',
            ],
        ]);

        $this->assertTrue($packages->hasPendingInitialPackage($resident->id, $community->id));

        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/admin/members/{$resident->id}/approve", [
            'community_id' => $community->id,
        ])->assertOk();

        $this->assertDatabaseHas('community_memberships', [
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'status' => 'approved',
        ]);
        $this->assertDatabaseHas('unit_registration_packages', [
            'id' => $package->id,
            'status' => 'approved',
        ]);
        $this->assertFalse($packages->hasPendingInitialPackage($resident->id, $community->id));
        $this->assertTrue($packages->residentHasFullUnitAccess($resident->id, $community->id));
    }

    public function test_admin_invite_stores_multiple_invite_units(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithAdmin();
        Sanctum::actingAs($admin);

        $res = $this->postJson('/api/v1/admin/members/invite', [
            'name' => 'Sara Khan',
            'email' => 'sara.multi@havena.test',
            'phone' => '+12025550199',
            'role' => 'member',
            'units' => ['301', '302'],
            'community_id' => $community->id,
        ]);

        $res->assertCreated();
        $userId = (int) $res->json('data.id');
        $this->assertDatabaseHas('invite_unit_assignments', [
            'user_id' => $userId,
            'community_id' => $community->id,
            'unit_number_normalized' => '301',
        ]);
        $this->assertDatabaseHas('invite_unit_assignments', [
            'user_id' => $userId,
            'community_id' => $community->id,
            'unit_number_normalized' => '302',
        ]);
    }

    public function test_invited_resident_can_add_extra_unit_that_stays_pending(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithAdmin();
        Sanctum::actingAs($admin);

        $res = $this->postJson('/api/v1/admin/members/invite', [
            'name' => 'Invited Extra Unit',
            'email' => 'invited.extra@havena.test',
            'phone' => '+12025550301',
            'role' => 'member',
            'unit_number' => '301',
            'community_id' => $community->id,
        ])->assertCreated();

        $userId = (int) $res->json('data.id');
        $inviteCode = $res->json('data.invite_code');
        $resident = User::query()->findOrFail($userId);
        $resident->profile()->update([
            'display_name' => 'Invited Extra Unit',
            'unit_number' => '301',
            'residence_type' => 'homeowner',
            'utility_bill_url' => '/storage/utility-bills/invited.jpg',
        ]);

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/communities/join-by-invite', [
            'invite_code' => $inviteCode,
        ])->assertSuccessful();

        $this->getJson('/api/v1/me?invite_community_id='.$community->id)
            ->assertOk()
            ->assertJsonPath('data.invite_units.0.unit_number', '301');

        $this->putJson('/api/v1/me', [
            'display_name' => 'Invited Extra Unit',
            'residence_type' => 'homeowner',
        ])->assertOk();

        $this->postJson('/api/v1/units/mine/onboarding-units', [
            'community_id' => $community->id,
            'units' => [
                [
                    'unit_number' => '301',
                    'is_new_unit' => false,
                    'residence_type' => 'homeowner',
                    'utility_bill_url' => '/storage/proofs/utility-301.jpg',
                ],
                [
                    'unit_number' => '305',
                    'is_new_unit' => true,
                    'residence_type' => 'tenant',
                    'utility_bill_url' => '/storage/proofs/utility-305.jpg',
                ],
            ],
        ])
            ->assertOk()
            ->assertJsonPath('data.mode', 'invite');

        $this->assertDatabaseHas('community_memberships', [
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'status' => 'approved',
        ]);
        $this->assertDatabaseHas('unit_residents', [
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'status' => UnitAssignmentService::RESIDENT_ACTIVE,
            'source' => 'invite',
        ]);
        $this->assertDatabaseHas('unit_registration_packages', [
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'kind' => UnitRegistrationPackageService::KIND_ADDON,
            'status' => UnitRegistrationPackageService::STATUS_PENDING,
        ]);
        $this->assertTrue(
            app(UnitRegistrationPackageService::class)->residentHasFullUnitAccess(
                $resident->id,
                $community->id,
            ),
        );
        $this->assertFalse(
            app(UnitRegistrationPackageService::class)->hasPendingInitialPackage(
                $resident->id,
                $community->id,
            ),
        );
    }

    public function test_system_admin_can_invite_a_resident_without_a_unit(): void
    {
        ['community' => $community] = $this->seedCommunityWithAdmin();
        $this->seed(SystemAdminSeeder::class);
        $systemAdmin = User::query()->where('email', 'admin@havena.app')->firstOrFail();
        Sanctum::actingAs($systemAdmin);

        $response = $this->postJson('/api/v1/admin/members/invite', [
            'name' => 'Open Unit Resident',
            'email' => 'open.unit@havena.test',
            'phone' => '+12025550193',
            'role' => 'member',
            'community_id' => $community->id,
        ]);

        $response->assertCreated();
        $userId = (int) $response->json('data.id');
        $this->assertDatabaseMissing('invite_unit_assignments', [
            'user_id' => $userId,
            'community_id' => $community->id,
        ]);
    }

    public function test_admin_invite_requires_a_unit_and_stores_several(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithAdmin();
        Sanctum::actingAs($admin);

        $empty = $this->postJson('/api/v1/admin/members/invite', [
            'name' => 'No Unit Resident',
            'email' => 'no.unit@havena.test',
            'phone' => '+12025550191',
            'role' => 'member',
            'community_id' => $community->id,
        ]);
        $empty->assertStatus(422);
        $empty->assertJsonValidationErrors(['units']);

        $many = $this->postJson('/api/v1/admin/members/invite', [
            'name' => 'Many Unit Resident',
            'email' => 'many.units@havena.test',
            'phone' => '+12025550192',
            'role' => 'member',
            'units' => ['899', '900', '901'],
            'community_id' => $community->id,
        ]);
        $many->assertCreated();
        $manyUserId = (int) $many->json('data.id');
        foreach (['899', '900', '901'] as $unit) {
            $this->assertDatabaseHas('invite_unit_assignments', [
                'user_id' => $manyUserId,
                'community_id' => $community->id,
                'unit_number_normalized' => $unit,
            ]);
        }
    }

    public function test_system_admin_can_approve_unit_package_without_community_scope(): void
    {
        ['community' => $community] = $this->seedCommunityWithAdmin();
        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        $system = User::factory()->create(['role' => 'system_admin', 'status' => 'active']);

        $packageId = DB::table('unit_registration_packages')->insertGetId([
            'community_id' => $community->id,
            'user_id' => $resident->id,
            'kind' => UnitRegistrationPackageService::KIND_ADDON,
            'status' => UnitRegistrationPackageService::STATUS_PENDING,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('unit_registration_package_items')->insert([
            'package_id' => $packageId,
            'unit_number' => '899',
            'unit_number_normalized' => '899',
            'is_new_unit' => true,
            'residence_type' => 'tenant',
            'status' => UnitRegistrationPackageService::STATUS_PENDING,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($system);
        $this->postJson("/api/v1/admin/unit-registration-packages/{$packageId}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', UnitRegistrationPackageService::STATUS_APPROVED);

        $this->assertDatabaseHas('unit_registration_packages', [
            'id' => $packageId,
            'status' => UnitRegistrationPackageService::STATUS_APPROVED,
            'reviewed_by' => $system->id,
        ]);
    }
}
