<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use App\Services\CommunityBillingService;
use App\Services\ContactIdentityService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ContactIdentityTest extends TestCase
{
    use RefreshDatabase;

    private function seedCommunityAdmin(): array
    {
        $region = Region::query()->create([
            'title'       => 'Test Region',
            'area'        => 'Test Area',
            'users_label' => '0 users',
            'sort_order'  => 1,
            'status'      => 'active',
        ]);

        $community = Community::query()->create([
            'name'          => 'Test Community',
            'region_id'     => $region->id,
            'region'        => $region->title,
            'status'        => 'active',
            'review_status' => 'approved',
        ]);

        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'phone'                  => '+12015555555',
            'phone_verified_at'      => now(),
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        app(CommunityBillingService::class)->activateManualSubscription($community, 'growth');

        return [$community, $admin, $region];
    }

    public function test_provision_resident_rejects_duplicate_phone_for_different_accounts(): void
    {
        [$community, $admin, $region] = $this->seedCommunityAdmin();

        User::factory()->create([
            'role'              => 'resident',
            'email'             => 'phone-owner@example.com',
            'phone'             => '+14155552681',
            'phone_verified_at' => now(),
        ]);

        User::factory()->create([
            'role'  => 'resident',
            'email' => 'email-owner@example.com',
            'phone' => '+14155552690',
        ]);

        $systemAdmin = User::factory()->create([
            'role'  => 'system_admin',
            'email' => 'sysadmin@example.com',
            'phone' => '+12019999999',
        ]);

        Sanctum::actingAs($systemAdmin);

        $this->postJson('/api/v1/admin/users', [
            'type'         => 'resident',
            'name'         => 'Conflicting Resident',
            'email'        => 'email-owner@example.com',
            'phone'        => '+14155552681',
            'region_id'    => $region->id,
            'community_id' => $community->id,
        ])
            ->assertStatus(422)
            ->assertJsonPath('message', ContactIdentityService::DUPLICATE_PHONE_MESSAGE);
    }

    public function test_provision_resident_invites_existing_email_to_new_community(): void
    {
        [$community, $admin, $region] = $this->seedCommunityAdmin();

        $resident = User::factory()->create([
            'role'  => 'resident',
            'email' => 'taken@example.com',
            'phone' => '+14155552682',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $resident->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        $otherCommunity = Community::query()->create([
            'name'          => 'Second Community',
            'region_id'     => $region->id,
            'region'        => $region->title,
            'status'        => 'active',
            'review_status' => 'approved',
        ]);
        app(CommunityBillingService::class)->activateManualSubscription($otherCommunity, 'growth');

        $systemAdmin = User::factory()->create([
            'role'  => 'system_admin',
            'email' => 'sysadmin@example.com',
            'phone' => '+12019999999',
        ]);

        Sanctum::actingAs($systemAdmin);

        $this->postJson('/api/v1/admin/users', [
            'type'         => 'resident',
            'name'         => 'New Resident',
            'email'        => 'taken@example.com',
            'phone'        => '+14155552683',
            'region_id'    => $region->id,
            'community_id' => $otherCommunity->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.id', $resident->id);

        $this->assertDatabaseHas('invite_codes', [
            'invited_user_id' => $resident->id,
            'community_id'    => $otherCommunity->id,
        ]);
    }

    public function test_provision_resident_rejects_when_already_in_same_community(): void
    {
        [$community, $admin, $region] = $this->seedCommunityAdmin();

        $resident = User::factory()->create([
            'role'  => 'resident',
            'email' => 'taken@example.com',
            'phone' => '+14155552682',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $resident->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        $systemAdmin = User::factory()->create([
            'role'  => 'system_admin',
            'email' => 'sysadmin@example.com',
            'phone' => '+12019999999',
        ]);

        Sanctum::actingAs($systemAdmin);

        $this->postJson('/api/v1/admin/users', [
            'type'         => 'resident',
            'name'         => 'New Resident',
            'email'        => 'taken@example.com',
            'phone'        => '+14155552683',
            'region_id'    => $region->id,
            'community_id' => $community->id,
        ])
            ->assertStatus(422)
            ->assertJsonPath('errors.email.0', 'This resident already belongs to this community.');
    }
}
