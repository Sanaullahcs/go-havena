<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Country;
use App\Models\Region;
use App\Models\State;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RegionBillingExemptionTest extends TestCase
{
    use RefreshDatabase;

    private function seedPakistanCommunity(): array
    {
        $country = Country::query()->updateOrCreate(
            ['code' => 'PK'],
            [
                'name' => 'Pakistan',
                'billing_policy' => Country::BILLING_EXEMPT,
                'sort_order' => 1,
                'status' => 'active',
            ],
        );

        $state = State::query()->updateOrCreate(
            ['country_id' => $country->id, 'name' => 'Punjab'],
            ['sort_order' => 1, 'status' => 'active'],
        );

        $region = Region::query()->create([
            'title' => 'Pakistan - Lahore',
            'area' => 'Lahore Division',
            'state' => 'Punjab',
            'state_id' => $state->id,
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $community = Community::query()->create([
            'name' => 'Lahore Heights',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '100 Mall Road',
            'status' => 'active',
            'review_status' => 'approved',
            'estimated_residents' => 120,
        ]);

        $admin = User::factory()->create([
            'name' => 'Primary Admin',
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'phone' => '+1'.fake()->unique()->numerify('##########'),
            'phone_verified_at' => now(),
            'email' => fake()->unique()->safeEmail(),
        ]);

        CommunityMembership::query()->create([
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);

        return [$community, $admin, $region];
    }

    private function seedUsCommunity(): array
    {
        $country = Country::query()->updateOrCreate(
            ['code' => 'US'],
            [
                'name' => 'United States',
                'billing_policy' => Country::BILLING_REQUIRED,
                'sort_order' => 1,
                'status' => 'active',
            ],
        );

        $state = State::query()->updateOrCreate(
            ['country_id' => $country->id, 'name' => 'Florida'],
            ['sort_order' => 1, 'status' => 'active'],
        );

        $region = Region::query()->create([
            'title' => 'Florida - Miami-Dade County',
            'area' => 'Miami-Dade County',
            'state' => 'Florida',
            'state_id' => $state->id,
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $community = Community::query()->create([
            'name' => 'Miami Community',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '100 Ocean Drive',
            'status' => 'active',
            'review_status' => 'approved',
            'estimated_residents' => 120,
        ]);

        $admin = User::factory()->create([
            'name' => 'Primary Admin',
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'phone' => '+1'.fake()->unique()->numerify('##########'),
            'phone_verified_at' => now(),
            'email' => fake()->unique()->safeEmail(),
        ]);

        CommunityMembership::query()->create([
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);

        return [$community, $admin];
    }

    public function test_pakistan_community_skips_billing_requirement(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        [, $admin] = $this->seedPakistanCommunity();
        $token = $admin->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.billing_complete', true)
            ->assertJsonPath('data.access.billing_exempt', true)
            ->assertJsonPath('data.access.next_step', 'ready');
    }

    public function test_pakistan_community_can_invite_without_subscription(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        [, $admin] = $this->seedPakistanCommunity();
        $token = $admin->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/v1/admin/members/invite', [
                'name' => 'Resident One',
                'email' => 'resident.pk@example.com',
                'phone' => '+15555550101',
                'unit_number' => 'A1',
            ])
            ->assertCreated();
    }

    public function test_us_community_still_requires_billing(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        [, $admin] = $this->seedUsCommunity();
        $token = $admin->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.billing_complete', false)
            ->assertJsonPath('data.access.billing_exempt', false)
            ->assertJsonPath('data.access.next_step', 'complete_billing_web');
    }

    public function test_public_regions_include_country_metadata(): void
    {
        [, , $region] = $this->seedPakistanCommunity();

        $this->getJson('/api/v1/regions')
            ->assertOk()
            ->assertJsonFragment([
                'id' => $region->id,
                'country_code' => 'PK',
                'billing_exempt' => true,
            ]);
    }

    public function test_admin_can_create_region_under_state(): void
    {
        $country = Country::query()->updateOrCreate(
            ['code' => 'PK'],
            [
                'name' => 'Pakistan',
                'billing_policy' => Country::BILLING_EXEMPT,
                'sort_order' => 1,
                'status' => 'active',
            ],
        );

        $state = State::query()->updateOrCreate(
            ['country_id' => $country->id, 'name' => 'Sindh'],
            ['sort_order' => 1, 'status' => 'active'],
        );

        $admin = User::factory()->create([
            'role' => 'system_admin',
            'status' => 'active',
        ]);

        $token = $admin->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/v1/admin/regions', [
                'title' => 'Pakistan - Hyderabad',
                'area' => 'Hyderabad Division',
                'state_id' => $state->id,
            ])
            ->assertCreated()
            ->assertJsonPath('data.country_code', 'PK')
            ->assertJsonPath('data.billing_exempt', true);
    }
}
