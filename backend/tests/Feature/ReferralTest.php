<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\ReferralAttribution;
use App\Models\ReferralCode;
use App\Models\ReferralProgramSetting;
use App\Models\ReferralReward;
use App\Models\Region;
use App\Models\User;
use App\Services\ReferralService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReferralTest extends TestCase
{
    use RefreshDatabase;

    private function seedRegion(): Region
    {
        return Region::query()->create([
            'title' => 'Referral Region',
            'area' => 'Test',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);
    }

    private function seedCommunity(string $name = 'Referral Community'): Community
    {
        $region = $this->seedRegion();

        return Community::query()->create([
            'name' => $name,
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '1 Referral Lane',
            'status' => 'active',
            'review_status' => 'approved',
            'estimated_residents' => 100,
        ]);
    }

    private function seedApprovedCommunityAdmin(Community $community, ?string $phone = null): User
    {
        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'phone' => $phone ?? '+1'.fake()->unique()->numerify('##########'),
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

    private function seedReferrerWithCode(): array
    {
        $community = $this->seedCommunity('Referrer Community');
        $referrer = $this->seedApprovedCommunityAdmin($community);
        $code = app(ReferralService::class)->ensureReferralCode($referrer);

        return [$referrer, $code, $community];
    }

    private function seedSubscription(Community $community, array $overrides = []): CommunitySubscription
    {
        return CommunitySubscription::query()->create(array_merge([
            'community_id' => $community->id,
            'plan_slug' => 'starter',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_ACTIVE,
            'seat_limit' => 100,
            'stripe_customer_id' => 'cus_referrer_test',
            'stripe_subscription_id' => 'sub_referrer_test',
        ], $overrides));
    }

    public function test_signup_locks_referral_attribution_with_valid_code(): void
    {
        [, $code] = $this->seedReferrerWithCode();
        $email = 'referral.signup@example.com';

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'signup',
            'portal' => 'community_admin_dashboard',
        ])->assertStatus(202);

        $verify = $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '123456',
            'intent' => 'signup',
            'role' => 'admin',
            'portal' => 'community_admin_dashboard',
            'referral_code' => $code->code,
        ])->assertOk();

        $refereeId = (int) $verify->json('user.id');

        $this->assertDatabaseHas('referral_attributions', [
            'referrer_user_id' => $code->user_id,
            'referee_user_id' => $refereeId,
            'status' => ReferralAttribution::STATUS_LOCKED,
            'reward_percent' => 5,
        ]);
    }

    public function test_self_referral_is_not_attributed(): void
    {
        [$referrer, $code] = $this->seedReferrerWithCode();

        $attribution = app(ReferralService::class)->lockAtSignup($referrer, $code->code);

        $this->assertNull($attribution);
        $this->assertDatabaseCount('referral_attributions', 0);
    }

    public function test_link_community_moves_attribution_to_pending_qualification(): void
    {
        [, $code] = $this->seedReferrerWithCode();
        $referee = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'pending',
            'phone' => '+15558889999',
            'phone_verified_at' => now(),
        ]);

        app(ReferralService::class)->lockAtSignup($referee, $code->code);
        $community = $this->seedCommunity('Referee Community');

        app(ReferralService::class)->linkCommunity($referee, $community);

        $this->assertDatabaseHas('referral_attributions', [
            'referee_user_id' => $referee->id,
            'referee_community_id' => $community->id,
            'status' => ReferralAttribution::STATUS_PENDING_QUALIFICATION,
        ]);
    }

    public function test_first_paid_invoice_creates_referral_reward(): void
    {
        config(['billing.driver' => 'manual', 'billing.stripe.secret' => null]);

        [$referrer, $code, $referrerCommunity] = $this->seedReferrerWithCode();
        $this->seedSubscription($referrerCommunity);
        $referee = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'phone' => '+15559990000',
            'phone_verified_at' => now(),
        ]);
        $refereeCommunity = $this->seedCommunity('Paid Referee Community');

        app(ReferralService::class)->lockAtSignup($referee, $code->code);
        app(ReferralService::class)->linkCommunity($referee, $refereeCommunity);

        CommunitySubscription::query()->create([
            'community_id' => $refereeCommunity->id,
            'plan_slug' => 'starter',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_ACTIVE,
            'seat_limit' => 100,
            'stripe_customer_id' => 'cus_referee_test',
            'stripe_subscription_id' => 'sub_referee_paid',
        ]);

        app(ReferralService::class)->handleInvoicePaid([
            'id' => 'in_referral_test_1',
            'subscription' => 'sub_referee_paid',
            'amount_paid' => 9900,
            'subtotal' => 10000,
            'currency' => 'usd',
            'billing_reason' => 'subscription_create',
        ]);

        $this->assertDatabaseHas('referral_rewards', [
            'referrer_user_id' => $referrer->id,
            'referee_community_id' => $refereeCommunity->id,
            'invoice_subtotal_cents' => 10000,
            'reward_amount_cents' => 500,
            'stripe_invoice_id' => 'in_referral_test_1',
            'status' => ReferralReward::STATUS_FAILED,
        ]);

        $this->assertDatabaseHas('referral_attributions', [
            'referee_user_id' => $referee->id,
            'status' => ReferralAttribution::STATUS_PENDING_QUALIFICATION,
        ]);
    }

    public function test_subscription_update_invoice_counts_as_first_paid_charge(): void
    {
        config(['billing.driver' => 'manual', 'billing.stripe.secret' => null]);

        [$referrer, $code, $referrerCommunity] = $this->seedReferrerWithCode();
        $this->seedSubscription($referrerCommunity);
        $referee = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'phone' => '+15559991111',
            'phone_verified_at' => now(),
        ]);
        $refereeCommunity = $this->seedCommunity('Trial To Paid Community');

        app(ReferralService::class)->lockAtSignup($referee, $code->code);
        app(ReferralService::class)->linkCommunity($referee, $refereeCommunity);

        CommunitySubscription::query()->create([
            'community_id' => $refereeCommunity->id,
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_ACTIVE,
            'seat_limit' => 150,
            'stripe_customer_id' => 'cus_referee_update',
            'stripe_subscription_id' => 'sub_referee_update',
        ]);

        app(ReferralService::class)->handleInvoicePaid([
            'id' => 'in_referral_update_1',
            'subscription' => 'sub_referee_update',
            'amount_paid' => 23900,
            'subtotal' => 24900,
            'currency' => 'usd',
            'billing_reason' => 'subscription_update',
        ]);

        $this->assertDatabaseHas('referral_rewards', [
            'referrer_user_id' => $referrer->id,
            'referee_community_id' => $refereeCommunity->id,
            'invoice_subtotal_cents' => 24900,
            'reward_amount_cents' => 1245,
            'stripe_invoice_id' => 'in_referral_update_1',
        ]);
    }

    public function test_community_admin_can_fetch_referral_dashboard(): void
    {
        [$referrer, $code] = $this->seedReferrerWithCode();
        $token = $referrer->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/admin/referrals/me')
            ->assertOk()
            ->assertJsonPath('data.referral_code', $code->code)
            ->assertJsonPath('data.reward_percent', 5)
            ->assertJsonStructure([
                'data' => [
                    'program_active',
                    'referral_link',
                    'stats' => [
                        'total_referrals',
                        'pending_referrals',
                        'successful_referrals',
                        'total_credit_earned_cents',
                    ],
                    'history',
                ],
            ]);
    }

    public function test_system_admin_can_update_settings_and_list_attributions(): void
    {
        [, $code] = $this->seedReferrerWithCode();
        $email = 'referral.settings@example.com';

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'signup',
            'portal' => 'community_admin_dashboard',
        ])->assertStatus(202);

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '123456',
            'intent' => 'signup',
            'role' => 'admin',
            'portal' => 'community_admin_dashboard',
            'referral_code' => $code->code,
        ])->assertOk();

        $systemAdmin = User::factory()->create([
            'role' => 'system_admin',
            'status' => 'active',
        ]);
        $token = $systemAdmin->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->putJson('/api/v1/admin/referral-program/settings', [
                'reward_type' => 'percent',
                'reward_percent' => 7.5,
                'is_active' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.reward_percent', 7.5)
            ->assertJsonPath('data.reward_type', 'percent');

        $this->withToken($token)
            ->getJson('/api/v1/admin/referral-program/attributions')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.referral_code', $code->code);
    }

    public function test_zero_amount_invoice_does_not_create_reward(): void
    {
        [, $code] = $this->seedReferrerWithCode();
        $referee = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'phone' => '+15551112233',
            'phone_verified_at' => now(),
        ]);
        $community = $this->seedCommunity('Trial Referee Community');

        app(ReferralService::class)->lockAtSignup($referee, $code->code);
        app(ReferralService::class)->linkCommunity($referee, $community);

        $this->seedSubscription($community, [
            'status' => CommunitySubscription::STATUS_TRIALING,
            'stripe_customer_id' => null,
            'stripe_subscription_id' => 'sub_trial_zero',
        ]);

        app(ReferralService::class)->handleInvoicePaid([
            'id' => 'in_zero_trial',
            'subscription' => 'sub_trial_zero',
            'amount_paid' => 0,
            'subtotal' => 0,
            'currency' => 'usd',
            'billing_reason' => 'subscription_create',
        ]);

        $this->assertDatabaseCount('referral_rewards', 0);
    }

    public function test_fixed_reward_creates_flat_payout_amount(): void
    {
        config(['billing.driver' => 'manual', 'billing.stripe.secret' => null]);

        ReferralProgramSetting::query()->delete();
        ReferralProgramSetting::query()->create([
            'reward_type' => ReferralProgramSetting::REWARD_TYPE_FIXED,
            'reward_percent' => 0,
            'reward_fixed_cents' => 7500,
            'is_active' => true,
        ]);

        [$referrer, $code, $referrerCommunity] = $this->seedReferrerWithCode();
        $this->seedSubscription($referrerCommunity);
        $referee = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'phone' => '+15558887766',
            'phone_verified_at' => now(),
        ]);
        $refereeCommunity = $this->seedCommunity('Fixed Reward Community');

        app(ReferralService::class)->lockAtSignup($referee, $code->code);
        app(ReferralService::class)->linkCommunity($referee, $refereeCommunity);

        CommunitySubscription::query()->create([
            'community_id' => $refereeCommunity->id,
            'plan_slug' => 'starter',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_ACTIVE,
            'seat_limit' => 100,
            'stripe_customer_id' => 'cus_referee_fixed',
            'stripe_subscription_id' => 'sub_referee_fixed',
        ]);

        app(ReferralService::class)->handleInvoicePaid([
            'id' => 'in_referral_fixed_1',
            'subscription' => 'sub_referee_fixed',
            'amount_paid' => 9900,
            'subtotal' => 10000,
            'currency' => 'usd',
            'billing_reason' => 'subscription_create',
        ]);

        $this->assertDatabaseHas('referral_rewards', [
            'referrer_user_id' => $referrer->id,
            'reward_amount_cents' => 7500,
            'reward_type' => ReferralProgramSetting::REWARD_TYPE_FIXED,
            'stripe_invoice_id' => 'in_referral_fixed_1',
        ]);
    }

    public function test_system_admin_can_switch_reward_type_to_fixed(): void
    {
        $systemAdmin = User::factory()->create([
            'role' => 'system_admin',
            'status' => 'active',
        ]);
        $token = $systemAdmin->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->putJson('/api/v1/admin/referral-program/settings', [
                'reward_type' => 'fixed',
                'reward_fixed_cents' => 5000,
                'is_active' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.reward_type', 'fixed')
            ->assertJsonPath('data.reward_fixed_cents', 5000);

        $this->withToken($token)
            ->getJson('/api/v1/admin/referral-program/settings')
            ->assertOk()
            ->assertJsonPath('data.reward_type', 'fixed')
            ->assertJsonPath('data.reward_fixed_cents', 5000)
            ->assertJsonPath('data.is_active', true);
    }

    public function test_invalid_referral_code_is_ignored_on_signup(): void
    {
        $email = 'referral.invalid@example.com';

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'signup',
            'portal' => 'community_admin_dashboard',
        ])->assertStatus(202);

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '123456',
            'intent' => 'signup',
            'role' => 'admin',
            'portal' => 'community_admin_dashboard',
            'referral_code' => 'NOTREAL',
        ])->assertOk();

        $this->assertDatabaseCount('referral_attributions', 0);
    }

    public function test_pending_reward_can_be_retried_when_referrer_gets_stripe_customer(): void
    {
        config(['billing.driver' => 'manual', 'billing.stripe.secret' => null]);

        [$referrer, $code, $referrerCommunity] = $this->seedReferrerWithCode();
        $referee = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'phone' => '+15556667788',
            'phone_verified_at' => now(),
        ]);
        $refereeCommunity = $this->seedCommunity('Retry Reward Community');

        app(ReferralService::class)->lockAtSignup($referee, $code->code);
        app(ReferralService::class)->linkCommunity($referee, $refereeCommunity);

        $attribution = ReferralAttribution::query()->where('referee_user_id', $referee->id)->firstOrFail();
        ReferralReward::query()->create([
            'referral_attribution_id' => $attribution->id,
            'referrer_user_id' => $referrer->id,
            'referee_community_id' => $refereeCommunity->id,
            'reward_type' => ReferralProgramSetting::REWARD_TYPE_PERCENT,
            'reward_percent' => 5,
            'invoice_subtotal_cents' => 9900,
            'reward_amount_cents' => 495,
            'currency' => 'usd',
            'stripe_invoice_id' => 'in_retry_test',
            'status' => ReferralReward::STATUS_PENDING,
            'qualified_at' => now(),
            'failure_reason' => 'Referrer has no Stripe customer yet.',
        ]);

        $this->seedSubscription($referrerCommunity, [
            'stripe_customer_id' => 'cus_referrer_retry',
            'stripe_subscription_id' => 'sub_referrer_retry',
        ]);

        $this->assertTrue($attribution->fresh(['reward'])->isEligibleForReward());
        $this->assertSame('payout_pending', app(ReferralService::class)->transformAttribution($attribution->fresh(['reward']))['display_status']);
    }
}
