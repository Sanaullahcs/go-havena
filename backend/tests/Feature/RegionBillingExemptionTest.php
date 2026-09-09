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

        [$community, $admin] = $this->seedPakistanCommunity();
        $token = $admin->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/admin/billing?community_id='.$community->id)
            ->assertOk()
            ->assertJsonPath('data.billing.exempt', true)
            ->assertJsonPath('data.seats.billing_exempt', true)
            ->assertJsonPath('data.seats.unlimited_seats', true)
            ->assertJsonPath('data.seats.seat_limit', null)
            ->assertJsonPath('data.setup.can_invite_residents', true)
            ->assertJsonPath('data.setup.subscription_active', true)
            ->assertJsonCount(0, 'data.plans');

        $this->withToken($token)
            ->postJson('/api/v1/admin/billing/checkout', [
                'plan_slug' => 'starter',
                'interval' => 'month',
            ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'BILLING_EXEMPT');

        $this->withToken($token)
            ->postJson('/api/v1/admin/members/invite', [
                'name' => 'Resident One',
                'email' => 'resident.pk@example.com',
                'phone' => '+15555550101',
                'unit_number' => 'A1',
            ])
            ->assertCreated();
    }

    public function test_pakistan_community_can_approve_without_subscription(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        [$community, $admin] = $this->seedPakistanCommunity();

        $pending = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'email' => 'pending.pk@example.com',
            'phone' => '+15555550102',
            'phone_verified_at' => now(),
        ]);
        CommunityMembership::query()->create([
            'user_id' => $pending->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'pending',
        ]);

        $token = $admin->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->postJson("/api/v1/admin/members/{$pending->id}/approve", [
                'community_id' => $community->id,
            ])
            ->assertOk();

        $this->assertDatabaseHas('community_memberships', [
            'user_id' => $pending->id,
            'community_id' => $community->id,
            'status' => 'approved',
        ]);
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

        $community = Community::query()->where('name', 'Miami Community')->first();
        $this->withToken($token)
            ->getJson('/api/v1/admin/billing?community_id='.$community->id)
            ->assertOk()
            ->assertJsonPath('data.billing.exempt', false)
            ->assertJsonPath('data.seats.billing_exempt', false)
            ->assertJsonPath('data.seats.unlimited_seats', false);

        $this->assertNotEmpty(
            $this->withToken($token)
                ->getJson('/api/v1/admin/billing?community_id='.$community->id)
                ->json('data.plans')
        );
    }

    public function test_pakistan_community_without_state_id_is_still_exempt(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $region = Region::query()->create([
            'title' => 'Pakistan - Karachi',
            'area' => 'Karachi Division',
            'state' => 'Sindh',
            'state_id' => null,
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $community = Community::query()->create([
            'name' => 'Karachi Court',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '1 Clifton',
            'status' => 'active',
            'review_status' => 'approved',
            'estimated_residents' => 80,
        ]);

        $admin = User::factory()->create([
            'name' => 'Karachi Admin',
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

        $token = $admin->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.billing_exempt', true)
            ->assertJsonPath('data.access.billing_complete', true);

        $this->withToken($token)
            ->getJson('/api/v1/admin/billing?community_id='.$community->id)
            ->assertOk()
            ->assertJsonPath('data.seats.unlimited_seats', true)
            ->assertJsonCount(0, 'data.plans');
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
