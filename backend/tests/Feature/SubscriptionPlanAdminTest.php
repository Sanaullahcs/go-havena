<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\Region;
use App\Models\SubscriptionPlan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SubscriptionPlanAdminTest extends TestCase
{
    use RefreshDatabase;

    private function systemAdmin(): User
    {
        return User::factory()->create([
            'role' => 'system_admin',
            'status' => 'active',
            'email' => 'plans-admin@example.com',
        ]);
    }

    public function test_migration_seeds_default_plans(): void
    {
        $this->assertDatabaseHas('subscription_plans', [
            'slug' => 'growth',
            'seat_limit' => 150,
            'is_active' => 1,
        ]);
        $this->assertGreaterThanOrEqual(3, SubscriptionPlan::query()->count());
    }

    public function test_public_plans_hide_inactive_plans(): void
    {
        SubscriptionPlan::query()->where('slug', 'starter')->update(['is_active' => false]);

        $response = $this->getJson('/api/v1/billing/plans')->assertOk();
        $slugs = collect($response->json('data'))->pluck('slug');

        $this->assertFalse($slugs->contains('starter'));
        $this->assertTrue($slugs->contains('growth'));
    }

    public function test_system_admin_can_create_and_update_a_plan(): void
    {
        config(['billing.driver' => 'manual', 'billing.stripe.secret' => null]);

        $admin = $this->systemAdmin();
        $token = $admin->createToken('test')->plainTextToken;

        $create = $this->withToken($token)
            ->postJson('/api/v1/admin/subscription-plans', [
                'name' => 'Neighborhood',
                'description' => 'For mid-size streets.',
                'seat_limit' => 80,
                'price_monthly_cents' => 12900,
                'price_yearly_cents' => 129000,
                'trial_period_days' => 14,
                'is_recommended' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('data.slug', 'neighborhood')
            ->assertJsonPath('data.seat_limit', 80)
            ->assertJsonPath('data.trial_period_days', 14)
            ->assertJsonPath('data.is_recommended', true);

        $id = $create->json('data.id');
        $this->assertSame(1, SubscriptionPlan::query()->where('is_recommended', true)->count());

        $this->withToken($token)
            ->putJson("/api/v1/admin/subscription-plans/{$id}", [
                'name' => 'Neighborhood Plus',
                'seat_limit' => 90,
                'price_monthly_cents' => 14900,
                'price_yearly_cents' => 149000,
                'trial_period_days' => 21,
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Neighborhood Plus')
            ->assertJsonPath('data.seat_limit', 90)
            ->assertJsonPath('data.price_monthly_cents', 14900)
            ->assertJsonPath('data.trial_period_days', 21);

        $this->assertDatabaseHas('subscription_plan_prices', [
            'subscription_plan_id' => $id,
            'interval' => 'month',
            'amount_cents' => 14900,
            'is_current' => 1,
        ]);
    }

    public function test_deactivated_plan_cannot_be_purchased(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        SubscriptionPlan::query()->where('slug', 'growth')->update(['is_active' => false]);

        $region = Region::query()->create([
            'title' => 'Plan Region',
            'area' => 'Test',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);
        $community = Community::query()->create([
            'name' => 'Plan Community',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '1 Test St',
            'status' => 'active',
            'review_status' => 'approved',
            'estimated_residents' => 80,
        ]);
        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
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

        $this->withToken($admin->createToken('test')->plainTextToken)
            ->postJson('/api/v1/admin/billing/checkout', [
                'plan_slug' => 'growth',
                'interval' => 'month',
            ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'PLAN_INACTIVE');
    }

    public function test_price_change_does_not_alter_existing_subscription_price_id(): void
    {
        config(['billing.driver' => 'manual', 'billing.stripe.secret' => null]);

        $plan = SubscriptionPlan::query()->where('slug', 'growth')->firstOrFail();
        $region = Region::query()->create([
            'title' => 'Keep Price',
            'area' => 'Test',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);
        $community = Community::query()->create([
            'name' => 'Existing Sub Community',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '2 Test St',
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_TRIALING,
            'seat_limit' => 150,
            'stripe_price_id' => 'price_existing_growth_monthly',
        ]);

        $admin = $this->systemAdmin();
        $this->withToken($admin->createToken('test')->plainTextToken)
            ->putJson("/api/v1/admin/subscription-plans/{$plan->id}", [
                'price_monthly_cents' => 29900,
                'price_yearly_cents' => 299000,
            ])
            ->assertOk()
            ->assertJsonPath('data.price_monthly_cents', 29900);

        $this->assertDatabaseHas('community_subscriptions', [
            'community_id' => $community->id,
            'plan_slug' => 'growth',
            'seat_limit' => 150,
            'stripe_price_id' => 'price_existing_growth_monthly',
        ]);
    }

    public function test_community_admin_cannot_manage_plans(): void
    {
        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
        ]);

        $this->withToken($admin->createToken('test')->plainTextToken)
            ->getJson('/api/v1/admin/subscription-plans')
            ->assertForbidden();
    }
}
