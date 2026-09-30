<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\Region;
use App\Models\User;
use App\Services\UnitAssignmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminUnitStoreTest extends TestCase
{
    use RefreshDatabase;

    private function seedAdminCommunity(): array
    {
        $region = Region::query()->create([
            'title' => 'Units Test Region',
            'area' => 'Test',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $community = Community::query()->create([
            'name' => 'Units Test Community',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
        ]);

        CommunityMembership::query()->create([
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);

        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'starter',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_ACTIVE,
            'seat_limit' => 100,
            'meta' => ['card_on_file' => true],
        ]);

        app(UnitAssignmentService::class)->assignUserToUnitNumber($community->id, $admin->id, 'Office', true);

        return compact('community', 'admin');
    }

    public function test_admin_cannot_create_duplicate_unit_case_insensitive(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedAdminCommunity();
        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/admin/units', [
            'unit_number' => 'A-101',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.unit_number', 'A-101');

        $this->postJson('/api/v1/admin/units', [
            'unit_number' => 'a-101',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['unit_number'])
            ->assertJsonPath('errors.unit_number.0', UnitAssignmentService::DUPLICATE_UNIT_MESSAGE);
    }

    public function test_admin_can_delete_unassigned_unit(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedAdminCommunity();
        Sanctum::actingAs($admin);

        $created = $this->postJson('/api/v1/admin/units', [
            'unit_number' => 'B-202',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        $unitId = (int) $created->json('data.id');

        $this->deleteJson("/api/v1/admin/units/{$unitId}", [], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('message', 'Unit deleted.');

        $this->assertDatabaseMissing('units', ['id' => $unitId]);
    }

    public function test_admin_cannot_delete_unit_with_residents(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedAdminCommunity();
        $resident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);
        $resident->profile()->updateOrCreate(['user_id' => $resident->id], [
            'unit_number' => 'C-303',
        ]);
        app(UnitAssignmentService::class)->syncUserToCommunity($resident->fresh('profile'), $community->id);

        $unitId = (int) \Illuminate\Support\Facades\DB::table('units')
            ->where('community_id', $community->id)
            ->where('unit_number_normalized', 'c-303')
            ->value('id');

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/v1/admin/units/{$unitId}", [], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['unit_id'])
            ->assertJsonPath('errors.unit_id.0', UnitAssignmentService::CANNOT_DELETE_ASSIGNED_UNIT_MESSAGE);
    }

    public function test_resident_can_create_unit_during_onboarding(): void
    {
        ['community' => $community] = $this->seedAdminCommunity();
        $resident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'pending',
        ]);

        Sanctum::actingAs($resident);

        $this->postJson("/api/v1/communities/{$community->id}/units", [
            'unit_number' => 'D-404',
        ])
            ->assertCreated()
            ->assertJsonPath('data.unit_number', 'D-404');
    }
}
