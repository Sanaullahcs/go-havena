<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\Region;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Services\CommunityBillingService;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CommunityAdminBillingReassignTest extends TestCase
{
    use RefreshDatabase;

    private function seedCommunity(): Community
    {
        $region = Region::query()->create([
            'title' => 'Reassign Billing',
            'area' => 'Test',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        return Community::query()->create([
            'name' => 'Palm Court',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '1 Palm St',
            'status' => 'active',
            'review_status' => 'approved',
            'estimated_residents' => 80,
        ]);
    }

    private function seedAdmin(Community $community): User
    {
        $admin = User::factory()->create([
            'name' => 'Old Admin',
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'phone' => '+1'.fake()->unique()->numerify('##########'),
            'phone_verified_at' => now(),
            'email' => 'old.admin@example.com',
        ]);

        CommunityMembership::query()->create([
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);

        return $admin;
    }

    private function systemAdmin(): User
    {
        $this->seed(SystemAdminSeeder::class);

        return User::query()->where('email', 'admin@havena.app')->firstOrFail();
    }

    private function activeSubscription(Community $community, array $overrides = []): CommunitySubscription
    {
        return CommunitySubscription::query()->create(array_merge([
            'community_id' => $community->id,
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_TRIALING,
            'seat_limit' => 150,
            'stripe_customer_id' => 'cus_old_admin',
            'stripe_subscription_id' => 'sub_old_admin',
            'current_period_start' => now(),
            'current_period_end' => now()->addDays(12),
            'meta' => ['card_on_file' => true],
        ], $overrides));
    }

    private function asSystem(): User
    {
        $system = $this->systemAdmin();
        Sanctum::actingAs($system);

        return $system;
    }

    private function assignReplacement(Community $community): User
    {
        $this->asSystem();
        $this->postJson("/api/v1/admin/communities/{$community->id}/assign-admin", [
            'name' => 'New Admin',
            'email' => 'new.admin@example.com',
            'phone' => '+201555000999',
        ])->assertOk();

        return User::query()->where('email', 'new.admin@example.com')->firstOrFail();
    }

    public function test_suspend_pauses_billing_for_leftover_subscription_days(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);
        $this->activeSubscription($community, ['current_period_end' => now()->addDays(12)]);

        $this->asSystem();
        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}/suspend")->assertOk();

        $subscription = CommunitySubscription::query()->where('community_id', $community->id)->firstOrFail();
        $this->assertTrue($subscription->isAdminTransition());
        $this->assertFalse((bool) data_get($subscription->meta, 'card_on_file'));
        $this->assertSame(CommunitySubscription::STATUS_GRACE, $subscription->status);
        $this->assertTrue($subscription->hasLeftoverService());
        $this->assertSame('growth', $subscription->plan_slug);
        $this->assertTrue($subscription->grace_ends_at?->isSameDay(now()->addDays(12)));
    }

    public function test_one_day_leftover_still_grants_replacement_admin_access(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);
        $this->activeSubscription($community, ['current_period_end' => now()->addDay()]);

        $this->asSystem();
        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}/suspend")->assertOk();

        $replacement = $this->assignReplacement($community);
        Sanctum::actingAs($replacement);

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.billing_complete', true)
            ->assertJsonPath('data.access.can_use_dashboard', true)
            ->assertJsonPath('data.access.has_leftover_service', true)
            ->assertJsonPath('data.access.card_on_file', false)
            ->assertJsonPath('data.access.plan_slug', 'growth')
            ->assertJsonPath('data.access.next_step', 'ready');

        $this->postJson('/api/v1/admin/members/invite', [
            'name' => 'Leftover Resident',
            'email' => 'leftover.resident@example.com',
        ])->assertCreated();
    }

    public function test_pending_trial_suspend_requires_card_immediately(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);
        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_PENDING_TRIAL,
            'seat_limit' => 150,
            'meta' => ['card_on_file' => true],
        ]);

        $this->asSystem();
        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}/suspend")->assertOk();

        $subscription = CommunitySubscription::query()->where('community_id', $community->id)->firstOrFail();
        $this->assertTrue($subscription->isAdminTransition());
        $this->assertFalse($subscription->hasLeftoverService());
        $this->assertSame(CommunitySubscription::STATUS_UNPAID, $subscription->status);

        $replacement = $this->assignReplacement($community);
        Sanctum::actingAs($replacement);
        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.billing_complete', false)
            ->assertJsonPath('data.access.can_use_dashboard', false)
            ->assertJsonPath('data.access.requires_replacement_card', true)
            ->assertJsonPath('data.access.next_step', 'complete_billing_web');
    }

    public function test_leftover_expiry_requires_replacement_card_and_allows_plan_choice(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);
        $this->activeSubscription($community, ['current_period_end' => now()->addDay()]);

        $this->asSystem();
        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}/suspend")->assertOk();
        $replacement = $this->assignReplacement($community);

        $this->travel(2)->days();

        Sanctum::actingAs($replacement);
        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.billing_complete', false)
            ->assertJsonPath('data.access.can_use_dashboard', false)
            ->assertJsonPath('data.access.requires_replacement_card', true)
            ->assertJsonPath('data.access.next_step', 'complete_billing_web');

        $resumed = app(CommunityBillingService::class)->resumeReplacementBilling(
            $community->fresh(),
            $replacement,
            'starter',
            'month',
        );

        $this->assertSame('starter', $resumed->plan_slug);
        $this->assertSame(CommunitySubscription::STATUS_ACTIVE, $resumed->status);
        $this->assertFalse($resumed->isAdminTransition());
        $this->assertTrue($resumed->hasCardOnFile());

        Sanctum::actingAs($replacement);
        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.can_use_dashboard', true)
            ->assertJsonPath('data.access.plan_slug', 'starter')
            ->assertJsonPath('data.access.next_step', 'ready');
    }

    public function test_downgrade_blocked_when_residents_exceed_new_plan(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);
        $this->activeSubscription($community, [
            'plan_slug' => 'campus',
            'seat_limit' => 500,
            'current_period_end' => now()->addDay(),
        ]);

        for ($i = 0; $i < 60; $i++) {
            $resident = User::factory()->create(['role' => 'resident']);
            CommunityMembership::query()->create([
                'user_id' => $resident->id,
                'community_id' => $community->id,
                'role' => 'member',
                'status' => 'approved',
            ]);
        }

        $this->asSystem();
        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}/suspend")->assertOk();
        $replacement = $this->assignReplacement($community);
        $this->travel(2)->days();

        $this->expectException(\App\Exceptions\BillingException::class);
        app(CommunityBillingService::class)->resumeReplacementBilling(
            $community->fresh(),
            $replacement,
            'starter',
            'month',
        );
    }

    public function test_inherited_inactive_plan_can_be_kept_at_resume(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        SubscriptionPlan::query()->where('slug', 'growth')->update(['is_active' => false]);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);
        $this->activeSubscription($community, ['current_period_end' => now()->addDay()]);

        $this->asSystem();
        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}/suspend")->assertOk();
        $replacement = $this->assignReplacement($community);
        $this->travel(2)->days();

        $resumed = app(CommunityBillingService::class)->resumeReplacementBilling(
            $community->fresh(),
            $replacement,
            'growth',
            'month',
        );

        $this->assertSame('growth', $resumed->plan_slug);
        $this->assertTrue($resumed->hasCardOnFile());
    }

    public function test_reject_still_cancels_subscription_immediately(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);
        $this->activeSubscription($community);

        $this->asSystem();
        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}/reject")
            ->assertOk()
            ->assertJsonPath('message', 'Community admin revoked. Billing canceled.');

        $this->assertDatabaseHas('community_subscriptions', [
            'community_id' => $community->id,
            'status' => CommunitySubscription::STATUS_CANCELED,
        ]);
    }

    public function test_checkout_blocked_during_leftover_period(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);
        $this->activeSubscription($community, ['current_period_end' => now()->addDays(8)]);

        $this->asSystem();
        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}/suspend")->assertOk();
        $replacement = $this->assignReplacement($community);
        Sanctum::actingAs($replacement);

        $this->postJson('/api/v1/admin/billing/checkout', [
            'plan_slug' => 'starter',
            'interval' => 'month',
        ])
            ->assertOk()
            ->assertJsonPath('data.mode', 'already_active');
    }
}
