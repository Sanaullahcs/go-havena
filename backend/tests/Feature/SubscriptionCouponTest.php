<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\Region;
use App\Models\SubscriptionCoupon;
use App\Models\SubscriptionCouponRedemption;
use App\Models\User;
use App\Services\CommunityBillingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SubscriptionCouponTest extends TestCase
{
    use RefreshDatabase;

    private function systemAdmin(): User
    {
        return User::factory()->create([
            'role' => 'system_admin',
            'status' => 'active',
            'email' => 'coupon-admin@example.com',
        ]);
    }

    private function seedCommunity(string $reviewStatus = 'approved'): Community
    {
        $region = Region::query()->create([
            'title' => 'Coupon Region',
            'area' => 'Test',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        return Community::query()->create([
            'name' => 'Coupon Community',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '1 Coupon Lane',
            'status' => 'active',
            'review_status' => $reviewStatus,
            'estimated_residents' => 120,
        ]);
    }

    private function seedCommunityAdmin(Community $community): User
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

    public function test_system_admin_can_create_update_and_deactivate_coupon(): void
    {
        config(['billing.driver' => 'manual', 'billing.stripe.secret' => null]);

        $token = $this->systemAdmin()->createToken('test')->plainTextToken;

        $create = $this->withToken($token)
            ->postJson('/api/v1/admin/subscription-coupons', [
                'code' => 'launch20',
                'name' => 'Launch 20',
                'description' => 'Twenty percent off first paid invoice.',
                'discount_type' => 'percent',
                'percent_off' => 20,
                'discount_duration' => 'once',
                'max_redemptions' => 50,
            ])
            ->assertCreated()
            ->assertJsonPath('data.code', 'LAUNCH20')
            ->assertJsonPath('data.percent_off', 20)
            ->assertJsonPath('data.discount_duration', 'once');

        $id = $create->json('data.id');

        $this->withToken($token)
            ->putJson("/api/v1/admin/subscription-coupons/{$id}", [
                'name' => 'Launch 25',
                'discount_type' => 'percent',
                'percent_off' => 25,
                'discount_duration' => 'once',
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Launch 25')
            ->assertJsonPath('data.percent_off', 25);

        $this->withToken($token)
            ->patchJson("/api/v1/admin/subscription-coupons/{$id}/status", ['is_active' => false])
            ->assertOk()
            ->assertJsonPath('data.is_active', false);
    }

    public function test_community_admin_can_apply_and_remove_pending_coupon(): void
    {
        config(['billing.enabled' => true, 'billing.driver' => 'manual', 'billing.stripe.secret' => null]);

        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);
        $adminToken = $admin->createToken('test')->plainTextToken;

        SubscriptionCoupon::query()->create([
            'code' => 'SAVE100',
            'name' => 'Save 100',
            'discount_type' => SubscriptionCoupon::TYPE_FIXED,
            'amount_off_cents' => 10000,
            'currency' => 'usd',
            'discount_duration' => SubscriptionCoupon::DURATION_ONCE,
            'is_active' => true,
            'stripe_coupon_id' => 'coupon_test_1',
            'stripe_promotion_code_id' => 'promo_test_1',
        ]);

        $this->withToken($adminToken)
            ->postJson('/api/v1/admin/billing/coupon/apply', [
                'code' => 'SAVE100',
                'plan_slug' => 'growth',
                'interval' => 'year',
            ])
            ->assertOk()
            ->assertJsonPath('data.coupon.code', 'SAVE100')
            ->assertJsonPath('data.coupon.original_price_cents', 249000)
            ->assertJsonPath('data.coupon.discounted_price_cents', 239000)
            ->assertJsonPath('data.coupon.savings_cents', 10000);

        $this->assertDatabaseHas('subscription_coupon_redemptions', [
            'community_id' => $community->id,
            'code' => 'SAVE100',
            'status' => SubscriptionCouponRedemption::STATUS_PENDING,
            'billing_interval' => 'year',
        ]);

        $this->withToken($adminToken)
            ->deleteJson('/api/v1/admin/billing/coupon')
            ->assertOk();

        $this->assertDatabaseHas('subscription_coupon_redemptions', [
            'community_id' => $community->id,
            'code' => 'SAVE100',
            'status' => SubscriptionCouponRedemption::STATUS_REMOVED,
        ]);
    }

    public function test_coupon_edit_does_not_change_existing_redemption_snapshot(): void
    {
        config(['billing.driver' => 'manual', 'billing.stripe.secret' => null]);

        $systemToken = $this->systemAdmin()->createToken('test')->plainTextToken;
        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);

        $coupon = SubscriptionCoupon::query()->create([
            'code' => 'EDITME',
            'name' => 'Editable',
            'discount_type' => SubscriptionCoupon::TYPE_PERCENT,
            'percent_off' => 10,
            'currency' => 'usd',
            'discount_duration' => SubscriptionCoupon::DURATION_ONCE,
            'is_active' => true,
            'stripe_coupon_id' => 'coupon_edit_1',
            'stripe_promotion_code_id' => 'promo_edit_1',
        ]);

        SubscriptionCouponRedemption::query()->create([
            'subscription_coupon_id' => $coupon->id,
            'community_id' => $community->id,
            'code' => 'EDITME',
            'discount_type' => SubscriptionCoupon::TYPE_PERCENT,
            'percent_off' => 10,
            'currency' => 'usd',
            'discount_duration' => SubscriptionCoupon::DURATION_ONCE,
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'stripe_coupon_id' => 'coupon_edit_1',
            'stripe_promotion_code_id' => 'promo_edit_1',
            'status' => SubscriptionCouponRedemption::STATUS_APPLIED,
            'redeemed_at' => now()->subDay(),
            'applied_at' => now()->subDay(),
        ]);

        $this->withToken($systemToken)
            ->putJson("/api/v1/admin/subscription-coupons/{$coupon->id}", [
                'name' => 'Editable',
                'discount_type' => 'percent',
                'percent_off' => 30,
                'discount_duration' => 'once',
            ])
            ->assertOk()
            ->assertJsonPath('data.percent_off', 30);

        $this->assertDatabaseHas('subscription_coupon_redemptions', [
            'community_id' => $community->id,
            'percent_off' => 10,
            'status' => SubscriptionCouponRedemption::STATUS_APPLIED,
        ]);

        $this->assertDatabaseHas('subscription_coupons', [
            'id' => $coupon->id,
            'percent_off' => 30,
        ]);
    }

    public function test_pending_coupon_is_applied_when_trial_starts_after_approval(): void
    {
        config([
            'billing.enabled' => true,
            'billing.enforce' => true,
            'billing.driver' => 'manual',
            'billing.stripe.secret' => null,
        ]);

        $community = $this->seedCommunity('approved');
        $admin = $this->seedCommunityAdmin($community);

        $coupon = SubscriptionCoupon::query()->create([
            'code' => 'TRIALPLUS',
            'name' => 'Trial Plus',
            'discount_type' => SubscriptionCoupon::TYPE_PERCENT,
            'percent_off' => 15,
            'currency' => 'usd',
            'discount_duration' => SubscriptionCoupon::DURATION_REPEATING,
            'discount_months' => 3,
            'is_active' => true,
            'stripe_coupon_id' => 'coupon_trial_1',
            'stripe_promotion_code_id' => 'promo_trial_1',
        ]);

        $redemption = SubscriptionCouponRedemption::query()->create([
            'subscription_coupon_id' => $coupon->id,
            'community_id' => $community->id,
            'code' => 'TRIALPLUS',
            'discount_type' => SubscriptionCoupon::TYPE_PERCENT,
            'percent_off' => 15,
            'currency' => 'usd',
            'discount_duration' => SubscriptionCoupon::DURATION_REPEATING,
            'discount_months' => 3,
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'stripe_coupon_id' => 'coupon_trial_1',
            'stripe_promotion_code_id' => 'promo_trial_1',
            'status' => SubscriptionCouponRedemption::STATUS_PENDING,
            'redeemed_at' => now(),
        ]);

        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_PENDING_TRIAL,
            'seat_limit' => 150,
            'stripe_customer_id' => 'cus_test',
            'meta' => [
                'card_on_file' => true,
                'payment_method_id' => 'pm_test',
                'pending_coupon_redemption_id' => $redemption->id,
            ],
        ]);

        app(CommunityBillingService::class)->startTrialIfEligible($community);

        $subscription = CommunitySubscription::query()->where('community_id', $community->id)->firstOrFail();
        $this->assertSame(CommunitySubscription::STATUS_TRIALING, $subscription->status);
        $this->assertSame('TRIALPLUS', data_get($subscription->meta, 'coupon.code'));
        $this->assertSame(15, data_get($subscription->meta, 'coupon.percent_off'));

        $this->assertDatabaseHas('subscription_coupon_redemptions', [
            'id' => $redemption->id,
            'status' => SubscriptionCouponRedemption::STATUS_APPLIED,
        ]);
    }

    public function test_invalid_expired_and_plan_mismatch_coupons_are_rejected(): void
    {
        config(['billing.driver' => 'manual', 'billing.stripe.secret' => null]);

        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);
        $token = $admin->createToken('test')->plainTextToken;

        SubscriptionCoupon::query()->create([
            'code' => 'EXPIRED',
            'name' => 'Expired',
            'discount_type' => SubscriptionCoupon::TYPE_PERCENT,
            'percent_off' => 10,
            'currency' => 'usd',
            'discount_duration' => SubscriptionCoupon::DURATION_ONCE,
            'valid_until' => now()->subDay(),
            'is_active' => true,
        ]);

        SubscriptionCoupon::query()->create([
            'code' => 'STARTERONLY',
            'name' => 'Starter only',
            'discount_type' => SubscriptionCoupon::TYPE_PERCENT,
            'percent_off' => 10,
            'currency' => 'usd',
            'discount_duration' => SubscriptionCoupon::DURATION_ONCE,
            'applicable_plan_slugs' => ['starter'],
            'is_active' => true,
        ]);

        $this->withToken($token)
            ->postJson('/api/v1/admin/billing/coupon/apply', [
                'code' => 'NOPE',
                'plan_slug' => 'growth',
                'interval' => 'month',
            ])
            ->assertStatus(404)
            ->assertJsonPath('code', 'COUPON_NOT_FOUND');

        $this->withToken($token)
            ->postJson('/api/v1/admin/billing/coupon/apply', [
                'code' => 'EXPIRED',
                'plan_slug' => 'growth',
                'interval' => 'month',
            ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'COUPON_INVALID');

        $this->withToken($token)
            ->postJson('/api/v1/admin/billing/coupon/apply', [
                'code' => 'STARTERONLY',
                'plan_slug' => 'growth',
                'interval' => 'month',
            ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'COUPON_PLAN_MISMATCH');
    }

    public function test_system_admin_can_update_coupon_with_unlimited_redemptions(): void
    {
        config(['billing.driver' => 'manual', 'billing.stripe.secret' => null]);

        $token = $this->systemAdmin()->createToken('test')->plainTextToken;

        $create = $this->withToken($token)
            ->postJson('/api/v1/admin/subscription-coupons', [
                'code' => 'UNLIMITED30',
                'name' => 'Unlimited 30',
                'discount_type' => 'percent',
                'percent_off' => 20,
                'discount_duration' => 'once',
                'max_redemptions' => null,
            ])
            ->assertCreated()
            ->assertJsonPath('data.max_redemptions', null);

        $id = $create->json('data.id');

        $this->withToken($token)
            ->putJson("/api/v1/admin/subscription-coupons/{$id}", [
                'name' => 'Unlimited 30 updated',
                'discount_type' => 'percent',
                'percent_off' => 30,
                'discount_duration' => 'once',
                'max_redemptions' => null,
                'is_active' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.percent_off', 30)
            ->assertJsonPath('data.max_redemptions', null)
            ->assertJsonPath('data.name', 'Unlimited 30 updated');
    }
}
