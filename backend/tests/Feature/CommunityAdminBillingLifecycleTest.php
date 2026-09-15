<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\Profile;
use App\Models\ReferralAttribution;
use App\Models\Region;
use App\Models\SubscriptionCoupon;
use App\Models\SubscriptionCouponRedemption;
use App\Models\User;
use App\Services\CommunityBillingService;
use App\Services\ReferralService;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Cross-feature billing lifecycle: active → suspend → reassign → leftover → resume,
 * reject → re-approve, plus coupon and referral interactions.
 */
class CommunityAdminBillingLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private function seedCommunity(string $name = 'Lifecycle Court'): Community
    {
        $region = Region::query()->create([
            'title' => 'Lifecycle Region',
            'area' => 'Test',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        return Community::query()->create([
            'name' => $name,
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '1 Lifecycle St',
            'status' => 'active',
            'review_status' => 'approved',
            'estimated_residents' => 80,
        ]);
    }

    private function seedAdmin(Community $community, array $overrides = []): User
    {
        $admin = User::factory()->create(array_merge([
            'name' => 'Primary Admin',
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'phone' => '+1'.fake()->unique()->numerify('##########'),
            'phone_verified_at' => now(),
            'email' => fake()->unique()->safeEmail(),
        ], $overrides));

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

    private function asSystem(): User
    {
        $system = $this->systemAdmin();
        Sanctum::actingAs($system);

        return $system;
    }

    private function activeSubscription(Community $community, array $overrides = []): CommunitySubscription
    {
        return CommunitySubscription::query()->create(array_merge([
            'community_id' => $community->id,
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_ACTIVE,
            'seat_limit' => 150,
            'stripe_customer_id' => 'cus_lifecycle',
            'stripe_subscription_id' => 'sub_lifecycle',
            'current_period_start' => now()->subDays(15),
            'current_period_end' => now()->addDays(15),
            'meta' => ['card_on_file' => true, 'trial_consumed' => true],
        ], $overrides));
    }

    private function completeAdminProfile(User $user): void
    {
        $profile = Profile::query()->firstOrNew(['user_id' => $user->id]);
        $profile->fill([
            'display_name' => $user->name ?: 'Replacement Admin',
            'unit_number' => 'B1',
            'utility_bill_url' => 'https://example.com/utility-bill.pdf',
            'utility_bill_review_status' => 'approved',
        ]);
        $profile->created_at = now()->subDay();
        $profile->updated_at = now();
        $profile->save();
    }

    private function assignReplacement(Community $community, array $payload = []): User
    {
        $this->asSystem();
        $merged = array_merge([
            'name' => 'Replacement Admin',
            'email' => 'replacement.admin@example.com',
            'phone' => '+201555000888',
        ], $payload);
        $this->postJson("/api/v1/admin/communities/{$community->id}/assign-admin", $merged)->assertOk();

        $replacement = User::query()->where('email', $merged['email'])->firstOrFail();
        $this->completeAdminProfile($replacement);

        return $replacement;
    }

    public function test_active_admin_has_full_dashboard_and_billing_access(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);
        $this->activeSubscription($community);
        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.billing_complete', true)
            ->assertJsonPath('data.access.can_use_dashboard', true)
            ->assertJsonPath('data.access.next_step', 'ready');

        $this->postJson('/api/v1/admin/members/invite', [
            'name' => 'Active Resident',
            'email' => 'active.resident@example.com',
            'phone' => '+15555550131',
            'unit_number' => 'A1',
        ])->assertCreated();
    }

    public function test_full_suspend_reassign_leftover_and_resume_lifecycle(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);
        $this->activeSubscription($community, ['current_period_end' => now()->addDays(10)]);

        $this->asSystem();
        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}/suspend")->assertOk();

        $subscription = CommunitySubscription::query()->where('community_id', $community->id)->firstOrFail();
        $this->assertTrue($subscription->isAdminTransition());
        $this->assertFalse((bool) data_get($subscription->meta, 'card_on_file'));

        $replacement = $this->assignReplacement($community);
        Sanctum::actingAs($replacement);

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.can_use_dashboard', true)
            ->assertJsonPath('data.access.has_leftover_service', true)
            ->assertJsonPath('data.access.requires_replacement_card', false)
            ->assertJsonPath('data.access.next_step', 'ready');

        $this->travel(11)->days();

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.can_use_dashboard', false)
            ->assertJsonPath('data.access.requires_replacement_card', true)
            ->assertJsonPath('data.access.next_step', 'complete_billing_web');

        $subscription = CommunitySubscription::query()->where('community_id', $community->id)->firstOrFail();
        $subscription->update([
            'meta' => array_merge(is_array($subscription->meta) ? $subscription->meta : [], [
                'payment_method_id' => 'pm_lifecycle',
            ]),
        ]);

        $resumed = app(CommunityBillingService::class)->resumeReplacementBilling(
            $community->fresh(),
            $replacement,
            'growth',
            'month',
        );

        $this->assertSame(CommunitySubscription::STATUS_ACTIVE, $resumed->status);
        $this->assertFalse($resumed->isAdminTransition());
        $this->assertTrue($resumed->hasCardOnFile());

        Sanctum::actingAs($replacement);
        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.can_use_dashboard', true)
            ->assertJsonPath('data.access.next_step', 'ready');
    }

    public function test_reject_then_reapprove_requires_fresh_billing_without_second_trial(): void
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

        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}/approve")
            ->assertOk()
            ->assertJsonPath('message', 'Community admin re-approved');

        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.billing_complete', false)
            ->assertJsonPath('data.access.can_use_dashboard', false)
            ->assertJsonPath('data.access.next_step', 'complete_billing_web');

        $this->getJson('/api/v1/admin/billing')
            ->assertOk()
            ->assertJsonPath('data.trial_period_days', 0)
            ->assertJsonPath('data.subscription.trial_consumed', true)
            ->assertJsonPath('data.subscription.status', CommunitySubscription::STATUS_UNPAID);
    }

    public function test_coupon_blocked_during_leftover_but_applies_after_expiry(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual', 'billing.stripe.secret' => null]);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);
        $this->activeSubscription($community, ['current_period_end' => now()->addDays(5)]);

        SubscriptionCoupon::query()->create([
            'code' => 'REASSIGN20',
            'name' => 'Reassign 20',
            'discount_type' => SubscriptionCoupon::TYPE_PERCENT,
            'percent_off' => 20,
            'currency' => 'usd',
            'discount_duration' => SubscriptionCoupon::DURATION_ONCE,
            'is_active' => true,
            'stripe_coupon_id' => 'coupon_reassign_1',
            'stripe_promotion_code_id' => 'promo_reassign_1',
        ]);

        $this->asSystem();
        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}/suspend")->assertOk();
        $replacement = $this->assignReplacement($community);
        Sanctum::actingAs($replacement);

        $this->postJson('/api/v1/admin/billing/coupon/apply', [
            'code' => 'REASSIGN20',
            'plan_slug' => 'growth',
            'interval' => 'month',
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'COUPON_NOT_ALLOWED');

        $this->travel(6)->days();

        $this->postJson('/api/v1/admin/billing/coupon/apply', [
            'code' => 'REASSIGN20',
            'plan_slug' => 'growth',
            'interval' => 'month',
        ])
            ->assertOk()
            ->assertJsonPath('data.coupon.code', 'REASSIGN20');

        $this->assertDatabaseHas('subscription_coupon_redemptions', [
            'community_id' => $community->id,
            'code' => 'REASSIGN20',
            'status' => SubscriptionCouponRedemption::STATUS_PENDING,
        ]);
    }

    public function test_pending_coupon_from_before_suspend_applies_on_replacement_resume(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual', 'billing.stripe.secret' => null]);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);
        $this->activeSubscription($community, ['current_period_end' => now()->addDays(3)]);

        $coupon = SubscriptionCoupon::query()->create([
            'code' => 'KEEPCOUPON',
            'name' => 'Keep Coupon',
            'discount_type' => SubscriptionCoupon::TYPE_PERCENT,
            'percent_off' => 10,
            'currency' => 'usd',
            'discount_duration' => SubscriptionCoupon::DURATION_ONCE,
            'is_active' => true,
            'stripe_coupon_id' => 'coupon_keep_1',
            'stripe_promotion_code_id' => 'promo_keep_1',
        ]);

        SubscriptionCouponRedemption::query()->create([
            'subscription_coupon_id' => $coupon->id,
            'community_id' => $community->id,
            'code' => 'KEEPCOUPON',
            'discount_type' => SubscriptionCoupon::TYPE_PERCENT,
            'percent_off' => 10,
            'currency' => 'usd',
            'discount_duration' => SubscriptionCoupon::DURATION_ONCE,
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'stripe_coupon_id' => 'coupon_keep_1',
            'stripe_promotion_code_id' => 'promo_keep_1',
            'status' => SubscriptionCouponRedemption::STATUS_PENDING,
            'redeemed_at' => now(),
        ]);

        $this->asSystem();
        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}/suspend")->assertOk();
        $replacement = $this->assignReplacement($community);
        $this->travel(4)->days();

        $subscription = CommunitySubscription::query()->where('community_id', $community->id)->firstOrFail();
        $subscription->update([
            'meta' => array_merge(is_array($subscription->meta) ? $subscription->meta : [], [
                'payment_method_id' => 'pm_coupon_resume',
            ]),
        ]);

        $resumed = app(CommunityBillingService::class)->resumeReplacementBilling(
            $community->fresh(),
            $replacement,
            'growth',
            'month',
        );

        $this->assertSame(SubscriptionCouponRedemption::STATUS_APPLIED, SubscriptionCouponRedemption::query()
            ->where('community_id', $community->id)
            ->where('code', 'KEEPCOUPON')
            ->value('status'));

        $this->assertSame('KEEPCOUPON', data_get($resumed->meta, 'coupon.code'));
    }

    public function test_referral_disqualified_on_reject_and_paid_resume_does_not_reward_disqualified(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual', 'billing.stripe.secret' => null]);

        $referrerCommunity = $this->seedCommunity('Referrer Community');
        $referrer = $this->seedAdmin($referrerCommunity, ['email' => 'referrer@example.com']);
        $code = app(ReferralService::class)->ensureReferralCode($referrer);
        CommunitySubscription::query()->create([
            'community_id' => $referrerCommunity->id,
            'plan_slug' => 'starter',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_ACTIVE,
            'seat_limit' => 100,
            'stripe_customer_id' => 'cus_referrer_lifecycle',
            'stripe_subscription_id' => 'sub_referrer_lifecycle',
        ]);

        $community = $this->seedCommunity('Referred Community');
        $admin = $this->seedAdmin($community);
        $this->activeSubscription($community, ['current_period_end' => now()->addDays(4)]);

        $this->asSystem();
        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}/suspend")->assertOk();

        $replacement = $this->assignReplacement($community, [
            'email' => 'referred.replacement@example.com',
        ]);

        app(ReferralService::class)->lockAtSignup($replacement, $code->code);
        app(ReferralService::class)->linkCommunity($replacement, $community);

        Sanctum::actingAs($this->systemAdmin());
        $this->patchJson("/api/v1/admin/community-admins/{$replacement->id}/reject")->assertOk();

        $this->assertDatabaseHas('referral_attributions', [
            'referee_user_id' => $replacement->id,
            'status' => ReferralAttribution::STATUS_DISQUALIFIED,
        ]);

        $this->assertDatabaseHas('community_subscriptions', [
            'community_id' => $community->id,
            'status' => CommunitySubscription::STATUS_CANCELED,
        ]);

        $subscription = CommunitySubscription::query()->where('community_id', $community->id)->firstOrFail();
        $subscription->update(['stripe_subscription_id' => 'sub_referred_paid']);

        app(ReferralService::class)->handleInvoicePaid([
            'id' => 'in_lifecycle_referral',
            'subscription' => 'sub_referred_paid',
            'amount_paid' => 24900,
            'subtotal' => 24900,
            'currency' => 'usd',
            'billing_reason' => 'subscription_create',
        ]);

        $this->assertDatabaseMissing('referral_rewards', [
            'referee_community_id' => $community->id,
            'stripe_invoice_id' => 'in_lifecycle_referral',
        ]);
    }

    public function test_replacement_referral_code_is_created_on_approval(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => true, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $admin = $this->seedAdmin($community);
        $this->activeSubscription($community, ['current_period_end' => now()->addDays(7)]);

        $this->asSystem();
        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}/suspend")->assertOk();
        $replacement = $this->assignReplacement($community);

        $this->assertDatabaseHas('referral_codes', [
            'user_id' => $replacement->id,
        ]);

        Sanctum::actingAs($replacement);
        $this->getJson('/api/v1/admin/referrals/me')
            ->assertOk()
            ->assertJsonStructure(['data' => ['referral_code', 'referral_link', 'stats']]);
    }

    public function test_replacement_rejected_and_reapproved_during_leftover_requires_fresh_billing(): void
    {
        config([
            'billing.enabled' => true,
            'billing.enforce' => true,
            'billing.driver' => 'manual',
            'billing.stripe.secret' => null,
        ]);

        $community = $this->seedCommunity('Leftover Reapprove Court');
        $admin = $this->seedAdmin($community);
        $this->activeSubscription($community, [
            'current_period_end' => now()->addDays(12),
            'meta' => ['card_on_file' => true, 'trial_consumed' => true],
        ]);

        SubscriptionCoupon::query()->create([
            'code' => 'REAPPROVE15',
            'name' => 'Reapprove 15',
            'discount_type' => SubscriptionCoupon::TYPE_PERCENT,
            'percent_off' => 15,
            'currency' => 'usd',
            'discount_duration' => SubscriptionCoupon::DURATION_ONCE,
            'is_active' => true,
            'stripe_coupon_id' => 'coupon_reapprove_1',
            'stripe_promotion_code_id' => 'promo_reapprove_1',
        ]);

        $this->asSystem();
        $this->patchJson("/api/v1/admin/community-admins/{$admin->id}/suspend")->assertOk();
        $replacement = $this->assignReplacement($community, [
            'email' => 'leftover.reapprove@example.com',
        ]);

        Sanctum::actingAs($replacement);
        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.can_use_dashboard', true)
            ->assertJsonPath('data.access.has_leftover_service', true)
            ->assertJsonPath('data.access.billing_complete', true)
            ->assertJsonPath('data.access.next_step', 'ready');

        $this->postJson('/api/v1/admin/members/invite', [
            'name' => 'During Leftover',
            'email' => 'during.leftover@example.com',
            'phone' => '+15555550132',
            'unit_number' => 'A1',
        ])->assertCreated();

        Sanctum::actingAs($this->systemAdmin());
        $this->patchJson("/api/v1/admin/community-admins/{$replacement->id}/reject")
            ->assertOk()
            ->assertJsonPath('message', 'Community admin revoked. Billing canceled.');

        $subscription = CommunitySubscription::query()->where('community_id', $community->id)->firstOrFail();
        $this->assertSame(CommunitySubscription::STATUS_CANCELED, $subscription->status);
        $this->assertNull($subscription->grace_ends_at);
        $this->assertFalse($subscription->isAdminTransition());
        $this->assertFalse($subscription->hasLeftoverService());

        Sanctum::actingAs($replacement);
        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.can_use_dashboard', false)
            ->assertJsonPath('data.access.billing_complete', false);

        $this->postJson('/api/v1/admin/members/invite', [
            'name' => 'After Reject',
            'email' => 'after.reject@example.com',
        ])->assertStatus(403);

        Sanctum::actingAs($this->systemAdmin());
        $this->patchJson("/api/v1/admin/community-admins/{$replacement->id}/approve")
            ->assertOk()
            ->assertJsonPath('message', 'Community admin re-approved');

        Sanctum::actingAs($replacement);
        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.billing_complete', false)
            ->assertJsonPath('data.access.can_use_dashboard', false)
            ->assertJsonPath('data.access.has_leftover_service', false)
            ->assertJsonPath('data.access.next_step', 'complete_billing_web');

        $this->getJson('/api/v1/admin/billing')
            ->assertOk()
            ->assertJsonPath('data.trial_period_days', 0)
            ->assertJsonPath('data.subscription.trial_consumed', true)
            ->assertJsonPath('data.subscription.status', CommunitySubscription::STATUS_UNPAID);

        $this->postJson('/api/v1/admin/billing/coupon/apply', [
            'code' => 'REAPPROVE15',
            'plan_slug' => 'growth',
            'interval' => 'month',
        ])
            ->assertOk()
            ->assertJsonPath('data.coupon.code', 'REAPPROVE15');

        $subscription = CommunitySubscription::query()->where('community_id', $community->id)->firstOrFail();
        $subscription->update([
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_PENDING_TRIAL,
            'seat_limit' => 150,
            'stripe_customer_id' => 'cus_reapprove_leftover',
            'meta' => array_merge(is_array($subscription->meta) ? $subscription->meta : [], [
                'card_on_file' => true,
                'payment_method_id' => 'pm_reapprove_leftover',
                'trial_consumed' => true,
            ]),
        ]);

        $activated = app(CommunityBillingService::class)->startTrialIfEligible($community->fresh());
        $this->assertSame(CommunitySubscription::STATUS_ACTIVE, $activated?->status);
        $this->assertTrue($activated?->hasConsumedTrial());
        $this->assertSame(SubscriptionCouponRedemption::STATUS_APPLIED, SubscriptionCouponRedemption::query()
            ->where('community_id', $community->id)
            ->where('code', 'REAPPROVE15')
            ->value('status'));

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.access.can_use_dashboard', true)
            ->assertJsonPath('data.access.billing_complete', true)
            ->assertJsonPath('data.access.next_step', 'ready');

        $this->postJson('/api/v1/admin/members/invite', [
            'name' => 'After Reapprove Billing',
            'email' => 'after.reapprove.billing@example.com',
            'phone' => '+15555550133',
            'unit_number' => 'A1',
        ])->assertCreated();
    }
}
