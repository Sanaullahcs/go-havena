<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\Region;
use App\Models\User;
use App\Services\CommunityBillingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CommunityBillingTest extends TestCase
{
    use RefreshDatabase;

    private function seedCommunity(): Community
    {
        $region = Region::query()->create([
            'title' => 'Billing Region',
            'area' => 'Test Area',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        return Community::query()->create([
            'name' => 'Billing Community',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '100 Test Lane',
            'status' => 'active',
            'review_status' => 'approved',
            'estimated_residents' => 120,
        ]);
    }

    private function seedAdmin(Community $community): User
    {
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

        return $admin;
    }

    public function test_invite_requires_active_subscription(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);
        $token = $admin->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/v1/admin/members/invite', [
                'name' => 'No Seat Resident',
                'email' => 'noseat@example.com',
            ])
            ->assertStatus(403)
            ->assertJsonPath('code', 'COMMUNITY_ADMIN_ACCESS_REQUIRED');
    }

    public function test_self_serve_checkout_without_card_does_not_start_trial(): void
    {
        config([
            'billing.enabled' => true,
            'billing.enforce' => true,
            'billing.driver' => 'manual',
            'billing.stripe.secret' => null,
            'billing.stripe.publishable' => null,
        ]);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);
        $token = $admin->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/v1/admin/billing/checkout', [
                'plan_slug' => 'growth',
                'interval' => 'month',
            ])
            ->assertStatus(503)
            ->assertJsonPath('code', 'STRIPE_NOT_CONFIGURED');

        $this->assertDatabaseMissing('community_subscriptions', [
            'community_id' => $community->id,
        ]);

        $this->withToken($token)
            ->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.billing_complete', false)
            ->assertJsonPath('data.access.can_use_dashboard', false)
            ->assertJsonPath('data.access.card_on_file', false)
            ->assertJsonPath('data.access.next_step', 'complete_billing_web');

        $this->withToken($token)
            ->postJson('/api/v1/admin/members/invite', [
                'name' => 'Jane Resident',
                'email' => 'jane.billing@example.com',
                'unit_number' => 'A1',
            ])
            ->assertStatus(403)
            ->assertJsonPath('code', 'COMMUNITY_ADMIN_ACCESS_REQUIRED');
    }

    public function test_trialing_without_card_does_not_unlock_dashboard_or_invites(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true]);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);

        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_TRIALING,
            'seat_limit' => 150,
            'stripe_customer_id' => 'cus_no_card',
            'stripe_subscription_id' => 'sub_no_card',
            'current_period_start' => now(),
            'current_period_end' => now()->addDays(30),
            'meta' => ['card_on_file' => false],
        ]);

        $token = $admin->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.billing_complete', false)
            ->assertJsonPath('data.access.can_use_dashboard', false)
            ->assertJsonPath('data.access.card_on_file', false)
            ->assertJsonPath('data.access.next_step', 'complete_billing_web');

        $this->withToken($token)
            ->postJson('/api/v1/admin/members/invite', [
                'name' => 'No Card Resident',
                'email' => 'nocard@example.com',
            ])
            ->assertStatus(403)
            ->assertJsonPath('code', 'COMMUNITY_ADMIN_ACCESS_REQUIRED');
    }

    public function test_card_on_file_trial_completes_billing_and_allows_invite(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true]);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);

        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_TRIALING,
            'seat_limit' => 150,
            'stripe_customer_id' => 'cus_card',
            'stripe_subscription_id' => 'sub_card',
            'current_period_start' => now(),
            'current_period_end' => now()->addDays(30),
            'meta' => ['card_on_file' => true],
        ]);

        $token = $admin->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.billing_complete', true)
            ->assertJsonPath('data.access.card_on_file', true)
            ->assertJsonPath('data.access.can_use_dashboard', true);

        $this->withToken($token)
            ->postJson('/api/v1/admin/members/invite', [
                'name' => 'Jane Resident',
                'email' => 'jane.billing@example.com',
                'unit_number' => 'A1',
            ])
            ->assertCreated();
    }

    public function test_seats_full_blocks_invite(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);

        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'starter',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_ACTIVE,
            'seat_limit' => 1,
            'extra_seats' => 0,
            'current_period_start' => now(),
            'current_period_end' => now()->addMonth(),
            'meta' => ['activated_via' => 'manual'],
        ]);

        $existing = User::factory()->create(['role' => 'resident', 'email' => 'taken@example.com']);
        CommunityMembership::query()->create([
            'user_id' => $existing->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        $token = $admin->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/v1/admin/members/invite', [
                'name' => 'Overflow',
                'email' => 'overflow@example.com',
            ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'SEATS_FULL');
    }

    public function test_billing_show_recommends_growth_for_120_residents(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);
        $token = $admin->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/admin/billing')
            ->assertOk()
            ->assertJsonPath('data.recommended_plan', 'growth')
            ->assertJsonPath('data.setup.subscription_active', false)
            ->assertJsonPath('data.next_charge', null)
            ->assertJsonPath('data.invoices', []);
    }

    public function test_system_admin_can_grant_subscription(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $system = User::factory()->create([
            'role' => 'system_admin',
            'email' => fake()->unique()->safeEmail(),
            'phone' => '+1'.fake()->unique()->numerify('##########'),
        ]);
        $token = $system->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/v1/admin/billing/grant', [
                'community_id' => $community->id,
                'plan_slug' => 'campus',
                'extra_seats' => 25,
            ])
            ->assertOk()
            ->assertJsonPath('data.subscription.plan_slug', 'campus')
            ->assertJsonPath('data.subscription.extra_seats', 25)
            ->assertJsonPath('data.seats.seat_limit', 525)
            ->assertJsonPath('data.next_charge.kind', 'renews')
            ->assertJsonPath('data.invoices', []);
    }

    public function test_approve_pending_member_requires_seat(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);

        $pending = User::factory()->create(['role' => 'resident', 'email' => 'pending.seat@example.com']);
        CommunityMembership::query()->create([
            'user_id' => $pending->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'pending',
        ]);

        $token = $admin->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->patchJson("/api/v1/admin/members/{$pending->id}/approve")
            ->assertStatus(403)
            ->assertJsonPath('code', 'COMMUNITY_ADMIN_ACCESS_REQUIRED');

        app(CommunityBillingService::class)->activateManualSubscription($community, 'starter');

        $this->withToken($token)
            ->patchJson("/api/v1/admin/members/{$pending->id}/approve")
            ->assertOk();
    }

    public function test_card_saved_before_approval_does_not_start_trial_or_unlock_dashboard(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true]);

        $community = $this->seedCommunity();
        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'pending',
            'phone' => '+1'.fake()->unique()->numerify('##########'),
            'phone_verified_at' => now(),
            'email' => fake()->unique()->safeEmail(),
        ]);
        CommunityMembership::query()->create([
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'pending',
        ]);

        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_PENDING_TRIAL,
            'seat_limit' => 150,
            'stripe_customer_id' => 'cus_pending_trial',
            'stripe_subscription_id' => null,
            'meta' => ['card_on_file' => true, 'trial_starts_on_approval' => true],
        ]);

        $token = $admin->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.billing_complete', true)
            ->assertJsonPath('data.access.card_on_file', true)
            ->assertJsonPath('data.access.can_use_dashboard', false)
            ->assertJsonPath('data.access.subscription_status', 'pending_trial')
            ->assertJsonPath('data.access.next_step', 'await_approval');

        $this->assertDatabaseHas('community_subscriptions', [
            'community_id' => $community->id,
            'status' => CommunitySubscription::STATUS_PENDING_TRIAL,
            'stripe_subscription_id' => null,
        ]);
    }

    public function test_approval_starts_local_trial_after_card_is_saved(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.stripe.secret' => null]);

        $community = $this->seedCommunity();
        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'pending',
            'phone' => '+1'.fake()->unique()->numerify('##########'),
            'phone_verified_at' => now(),
            'email' => fake()->unique()->safeEmail(),
        ]);
        CommunityMembership::query()->create([
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'pending',
        ]);
        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_PENDING_TRIAL,
            'seat_limit' => 150,
            'stripe_customer_id' => 'cus_start_trial',
            'meta' => ['card_on_file' => true, 'trial_starts_on_approval' => true],
        ]);

        $system = User::factory()->create([
            'role' => 'system_admin',
            'email' => fake()->unique()->safeEmail(),
            'phone' => '+1'.fake()->unique()->numerify('##########'),
        ]);
        $systemToken = $system->createToken('test')->plainTextToken;

        $this->withToken($systemToken)
            ->patchJson("/api/v1/admin/community-admins/{$admin->id}/approve")
            ->assertOk();

        $this->assertDatabaseHas('community_subscriptions', [
            'community_id' => $community->id,
            'status' => CommunitySubscription::STATUS_TRIALING,
        ]);

        $this->actingAs($admin->fresh(), 'sanctum')
            ->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.can_use_dashboard', true)
            ->assertJsonPath('data.access.subscription_status', 'trialing');
    }

    public function test_rejecting_approved_admin_months_later_cancels_billing_immediately(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true]);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);

        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_ACTIVE,
            'seat_limit' => 150,
            'stripe_customer_id' => 'cus_paid',
            'stripe_subscription_id' => 'sub_paid_later',
            'current_period_start' => now()->subMonths(3),
            'current_period_end' => now()->addMonth(),
            'meta' => ['card_on_file' => true],
        ]);

        $system = User::factory()->create([
            'role' => 'system_admin',
            'email' => fake()->unique()->safeEmail(),
            'phone' => '+1'.fake()->unique()->numerify('##########'),
        ]);

        $this->actingAs($system, 'sanctum')
            ->patchJson("/api/v1/admin/community-admins/{$admin->id}/reject", [
                'reason' => 'Community shut down',
            ])
            ->assertOk();

        $this->assertSame('rejected', $admin->fresh()->community_admin_status);
        $this->assertDatabaseHas('community_subscriptions', [
            'community_id' => $community->id,
            'status' => CommunitySubscription::STATUS_CANCELED,
        ]);

        $subscription = CommunitySubscription::query()->where('community_id', $community->id)->first();
        $this->assertNotNull($subscription?->canceled_at);
        $this->assertSame('community_admin_revoked', data_get($subscription->meta, 'canceled_reason'));
    }

    public function test_rejecting_pending_admin_cancels_saved_card_before_trial(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true]);

        $community = $this->seedCommunity();
        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'pending',
            'phone' => '+1'.fake()->unique()->numerify('##########'),
            'phone_verified_at' => now(),
            'email' => fake()->unique()->safeEmail(),
        ]);
        CommunityMembership::query()->create([
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'pending',
        ]);
        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_PENDING_TRIAL,
            'seat_limit' => 150,
            'stripe_customer_id' => 'cus_reject_pending',
            'meta' => ['card_on_file' => true],
        ]);

        $system = User::factory()->create([
            'role' => 'system_admin',
            'email' => fake()->unique()->safeEmail(),
            'phone' => '+1'.fake()->unique()->numerify('##########'),
        ]);

        $this->actingAs($system, 'sanctum')
            ->patchJson("/api/v1/admin/community-admins/{$admin->id}/reject")
            ->assertOk();

        $this->assertDatabaseHas('community_subscriptions', [
            'community_id' => $community->id,
            'status' => CommunitySubscription::STATUS_CANCELED,
        ]);
    }

    public function test_reject_after_trial_marks_trial_consumed(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true]);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);

        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_TRIALING,
            'seat_limit' => 150,
            'stripe_customer_id' => 'cus_trial_used',
            'stripe_subscription_id' => 'sub_trial_used',
            'current_period_start' => now()->subDays(28),
            'current_period_end' => now()->addDays(2),
            'meta' => [
                'card_on_file' => true,
                'trial_started_on_approval' => now()->subDays(28)->toIso8601String(),
            ],
        ]);

        $system = User::factory()->create([
            'role' => 'system_admin',
            'email' => fake()->unique()->safeEmail(),
            'phone' => '+1'.fake()->unique()->numerify('##########'),
        ]);

        $this->actingAs($system, 'sanctum')
            ->patchJson("/api/v1/admin/community-admins/{$admin->id}/reject")
            ->assertOk();

        $subscription = CommunitySubscription::query()->where('community_id', $community->id)->first();
        $this->assertTrue($subscription?->hasConsumedTrial());
        $this->assertSame(CommunitySubscription::STATUS_CANCELED, $subscription?->status);
        $this->assertSame('community_admin_revoked', data_get($subscription?->meta, 'canceled_reason'));
    }

    public function test_reapproved_admin_with_consumed_trial_starts_paid_subscription(): void
    {
        config([
            'billing.enabled' => true,
            'billing.enforce' => true,
            'billing.driver' => 'manual',
            'billing.stripe.secret' => null,
            'billing.stripe.publishable' => null,
        ]);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);

        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_PENDING_TRIAL,
            'seat_limit' => 150,
            'stripe_customer_id' => 'cus_reactivate',
            'meta' => [
                'card_on_file' => true,
                'payment_method_id' => 'pm_reactivate',
                'trial_consumed' => true,
                'trial_consumed_reason' => 'community_admin_revoked',
                'trial_started_on_approval' => now()->subDays(28)->toIso8601String(),
            ],
        ]);

        $activated = app(CommunityBillingService::class)->startTrialIfEligible($community);

        $this->assertSame(CommunitySubscription::STATUS_ACTIVE, $activated?->status);
        $this->assertTrue($activated?->hasConsumedTrial());
        $this->assertTrue($activated?->grantsPaidAccess());
    }

    public function test_manual_grant_respects_trial_consumed(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_CANCELED,
            'seat_limit' => 150,
            'meta' => [
                'trial_consumed' => true,
                'trial_started_on_approval' => now()->subMonth()->toIso8601String(),
            ],
        ]);

        $system = User::factory()->create([
            'role' => 'system_admin',
            'email' => fake()->unique()->safeEmail(),
            'phone' => '+1'.fake()->unique()->numerify('##########'),
        ]);

        $this->actingAs($system, 'sanctum')
            ->postJson('/api/v1/admin/billing/grant', [
                'community_id' => $community->id,
                'plan_slug' => 'growth',
                'interval' => 'month',
            ])
            ->assertOk();

        $subscription = CommunitySubscription::query()->where('community_id', $community->id)->first();
        $this->assertSame(CommunitySubscription::STATUS_ACTIVE, $subscription?->status);
        $this->assertTrue($subscription?->hasConsumedTrial());
        $this->assertSame(0, data_get($subscription?->meta, 'trial_days'));
    }

    public function test_checkout_payload_reports_zero_trial_days_when_consumed(): void
    {
        config([
            'billing.enabled' => true,
            'billing.enforce' => true,
            'billing.driver' => 'manual',
            'billing.stripe.secret' => null,
        ]);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);

        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_CANCELED,
            'seat_limit' => 150,
            'meta' => [
                'trial_consumed' => true,
                'trial_started_on_approval' => now()->subDays(20)->toIso8601String(),
            ],
        ]);

        $token = $admin->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/admin/billing')
            ->assertOk()
            ->assertJsonPath('data.trial_period_days', 0)
            ->assertJsonPath('data.subscription.trial_consumed', true);
    }

    public function test_subscription_deleted_webhook_cancels_active_subscription_even_with_stale_ignore_flag(): void
    {
        config(['billing.stripe.webhook_secret' => '']);

        $community = $this->seedCommunity();
        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'starter',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_TRIALING,
            'seat_limit' => 50,
            'stripe_subscription_id' => 'sub_cancel_test',
            'meta' => [
                'card_on_file' => true,
                'ignore_subscription_deleted' => true,
            ],
        ]);

        $payload = json_encode([
            'type' => 'customer.subscription.deleted',
            'data' => [
                'object' => [
                    'id' => 'sub_cancel_test',
                    'status' => 'canceled',
                ],
            ],
        ]);

        app(CommunityBillingService::class)->handleWebhook($payload, null);

        $subscription = CommunitySubscription::query()->where('community_id', $community->id)->first();
        $this->assertSame(CommunitySubscription::STATUS_CANCELED, $subscription?->status);
        $this->assertNotNull($subscription?->canceled_at);
        $this->assertFalse((bool) $subscription?->cancel_at_period_end);
    }

    public function test_subscription_deleted_webhook_is_ignored_while_pending_trial(): void
    {
        config(['billing.stripe.webhook_secret' => '']);

        $community = $this->seedCommunity();
        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'starter',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_PENDING_TRIAL,
            'seat_limit' => 50,
            'stripe_subscription_id' => 'sub_deferred_checkout',
            'meta' => [
                'card_on_file' => true,
                'ignore_subscription_deleted' => true,
            ],
        ]);

        $payload = json_encode([
            'type' => 'customer.subscription.deleted',
            'data' => [
                'object' => [
                    'id' => 'sub_deferred_checkout',
                    'status' => 'canceled',
                ],
            ],
        ]);

        app(CommunityBillingService::class)->handleWebhook($payload, null);

        $subscription = CommunitySubscription::query()->where('community_id', $community->id)->first();
        $this->assertSame(CommunitySubscription::STATUS_PENDING_TRIAL, $subscription?->status);
        $this->assertNull($subscription?->canceled_at);
    }
}
