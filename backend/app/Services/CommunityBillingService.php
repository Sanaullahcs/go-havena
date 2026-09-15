<?php

namespace App\Services;

use App\Exceptions\BillingException;
use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySeatReservation;
use App\Models\CommunitySubscription;
use App\Models\InviteCode;
use App\Models\SubscriptionPlan;
use App\Models\SubscriptionPlanPrice;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Stripe\Exception\ApiErrorException;
use Stripe\StripeClient;
use Stripe\Webhook;

class CommunityBillingService
{
    public function enabled(): bool
    {
        return (bool) config('billing.enabled', true);
    }

    public function enforce(): bool
    {
        return $this->enabled() && (bool) config('billing.enforce', true);
    }

    public function driver(): string
    {
        return (string) config('billing.driver', 'stripe');
    }

    public function plans(): array
    {
        if (Schema::hasTable('subscription_plans')) {
            $rows = SubscriptionPlan::query()->orderBy('sort_order')->orderBy('name')->get();
            if ($rows->isNotEmpty()) {
                return $rows->mapWithKeys(fn (SubscriptionPlan $plan) => [$plan->slug => $plan->toBillingArray()])->all();
            }
        }

        $plans = config('billing.plans', []);
        uasort($plans, fn ($a, $b) => ($a['sort'] ?? 99) <=> ($b['sort'] ?? 99));

        return $plans;
    }

    public function plan(string $slug): ?array
    {
        if (Schema::hasTable('subscription_plans')) {
            $row = SubscriptionPlan::query()->where('slug', $slug)->first();
            if ($row) {
                return $row->toBillingArray();
            }
        }

        $plan = config("billing.plans.{$slug}");

        return is_array($plan) ? array_merge(['slug' => $slug], $plan) : null;
    }

    public function recommendPlanSlug(?int $estimatedResidents): string
    {
        $active = $this->activePlans();

        if ($estimatedResidents === null) {
            foreach ($active as $slug => $plan) {
                if ($plan['recommended'] ?? false) {
                    return $slug;
                }
            }
        }

        $count = max(0, (int) $estimatedResidents);
        foreach ($active as $slug => $plan) {
            if ($count <= (int) $plan['seat_limit']) {
                return $slug;
            }
        }

        return array_key_last($active) ?: array_key_last($this->plans()) ?: 'campus';
    }

    /** @return array<string, array<string, mixed>> */
    protected function activePlans(): array
    {
        return array_filter(
            $this->plans(),
            fn ($plan) => (bool) ($plan['is_active'] ?? true),
        );
    }

    public function trialDaysForPlan(?array $plan): int
    {
        if (is_array($plan) && array_key_exists('trial_period_days', $plan) && $plan['trial_period_days'] !== null) {
            return max(0, (int) $plan['trial_period_days']);
        }

        return max(0, (int) config('billing.trial_period_days', 30));
    }

    /** Free trial days remaining for this community (0 when the one-time trial was consumed). */
    public function eligibleTrialDays(?CommunitySubscription $subscription, ?array $plan = null): int
    {
        if ($subscription?->hasConsumedTrial()) {
            return 0;
        }

        return $this->trialDaysForPlan($plan);
    }

    public function markTrialConsumed(CommunitySubscription $subscription, string $reason): CommunitySubscription
    {
        if ((bool) data_get($subscription->meta, 'trial_consumed', false)) {
            return $subscription;
        }

        $meta = is_array($subscription->meta) ? $subscription->meta : [];
        $meta['trial_consumed'] = true;
        $meta['trial_consumed_at'] = now()->toIso8601String();
        $meta['trial_consumed_reason'] = $reason;
        $subscription->update(['meta' => $meta]);

        return $subscription->fresh();
    }

    protected function shouldMarkTrialConsumedOnCancel(CommunitySubscription $subscription): bool
    {
        if ($subscription->hasConsumedTrial()) {
            return false;
        }

        // Only consume the one-time trial after it actually started (trialing/paid/grace),
        // not when a card was saved but the trial had not begun yet (pending_trial).
        return in_array($subscription->status, [
            CommunitySubscription::STATUS_TRIALING,
            CommunitySubscription::STATUS_ACTIVE,
            CommunitySubscription::STATUS_GRACE,
            CommunitySubscription::STATUS_PAST_DUE,
        ], true);
    }

    public function assertPlanAvailable(?array $plan, ?CommunitySubscription $existing = null): array
    {
        if (! $plan) {
            throw new BillingException('Invalid plan selected.', 'INVALID_PLAN');
        }

        $slug = (string) ($plan['slug'] ?? '');
        $inherited = $existing
            && $existing->isAdminTransition()
            && $slug !== ''
            && $existing->plan_slug === $slug;

        if (! ($plan['is_active'] ?? true) && ! $inherited) {
            throw new BillingException('This plan is not available.', 'PLAN_INACTIVE');
        }

        return $plan;
    }

    public function getSubscription(int $communityId): ?CommunitySubscription
    {
        return CommunitySubscription::query()->where('community_id', $communityId)->first();
    }

    /**
     * Approved non-guest, non-admin memberships count as seats.
     * Active invite reservations also count until claimed/expired.
     */
    public function seatsUsed(int $communityId): int
    {
        $approved = CommunityMembership::query()
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->whereNotIn('role', ['guest', 'admin'])
            ->count();

        if (! $this->seatReservationsAvailable()) {
            return $approved;
        }

        $reserved = CommunitySeatReservation::query()
            ->where('community_id', $communityId)
            ->where('status', CommunitySeatReservation::STATUS_RESERVED)
            ->where(function ($q) {
                $q->whereNull('expires_at')->orWhere('expires_at', '>', now());
            })
            // Avoid double-count when reservation points at an already-approved member.
            ->where(function ($q) {
                $q->whereNull('user_id')
                    ->orWhereNotExists(function ($sub) {
                        $sub->select(DB::raw(1))
                            ->from('community_memberships as cm')
                            ->whereColumn('cm.user_id', 'community_seat_reservations.user_id')
                            ->whereColumn('cm.community_id', 'community_seat_reservations.community_id')
                            ->where('cm.status', 'approved')
                            ->whereNotIn('cm.role', ['guest', 'admin']);
                    });
            })
            ->count();

        return $approved + $reserved;
    }

    public function seatLimitFor(CommunitySubscription $subscription): int
    {
        return $subscription->totalSeatLimit();
    }

    public function seatSummary(int $communityId): array
    {
        $billingExempt = app(RegionBillingPolicy::class)->isBillingExempt($communityId);
        $subscription = $this->getSubscription($communityId);
        $used = $this->seatsUsed($communityId);

        if ($billingExempt) {
            return [
                'seats_used' => $used,
                'seat_limit' => null,
                'seats_available' => 1_000_000,
                'unlimited_seats' => true,
                'has_subscription' => false,
                'subscription_status' => null,
                'allows_allocation' => true,
                'in_grace' => false,
                'grace_ends_at' => null,
                'plan_slug' => null,
                'billing_interval' => null,
                'current_period_end' => null,
                'cancel_at_period_end' => false,
                'billing_exempt' => true,
            ];
        }

        $limit = $subscription ? $this->seatLimitFor($subscription) : 0;

        return [
            'seats_used' => $used,
            'seat_limit' => $limit,
            'seats_available' => max(0, $limit - $used),
            'has_subscription' => (bool) $subscription,
            'subscription_status' => $subscription?->status,
            'allows_allocation' => $subscription?->allowsSeatAllocation() ?? false,
            'in_grace' => $subscription?->isInGrace() ?? false,
            'grace_ends_at' => $subscription?->grace_ends_at?->toIso8601String(),
            'plan_slug' => $subscription?->plan_slug,
            'billing_interval' => $subscription?->billing_interval,
            'current_period_end' => $subscription?->current_period_end?->toIso8601String(),
            'cancel_at_period_end' => (bool) ($subscription?->cancel_at_period_end),
            'billing_exempt' => false,
            'unlimited_seats' => false,
        ];
    }

    public function assertCanAllocateSeat(int $communityId, int $seatsNeeded = 1): void
    {
        if (app(RegionBillingPolicy::class)->isBillingExempt($communityId)) {
            return;
        }

        if (! $this->enforce()) {
            return;
        }

        $this->refreshGraceIfNeeded($communityId);

        $subscription = $this->getSubscription($communityId);
        if (! $subscription) {
            throw BillingException::subscriptionRequired();
        }

        if (! $subscription->allowsSeatAllocation()) {
            throw BillingException::subscriptionInactive($subscription->status);
        }

        $used = $this->seatsUsed($communityId);
        $limit = $this->seatLimitFor($subscription);
        if ($used + $seatsNeeded > $limit) {
            throw BillingException::seatsFull($used, $limit);
        }
    }

    public function refreshGraceIfNeeded(int $communityId): void
    {
        $subscription = $this->getSubscription($communityId);
        if (! $subscription) {
            return;
        }

        if (in_array($subscription->status, [CommunitySubscription::STATUS_GRACE, CommunitySubscription::STATUS_PAST_DUE], true)
            && $subscription->grace_ends_at
            && $subscription->grace_ends_at->isPast()
        ) {
            $meta = is_array($subscription->meta) ? $subscription->meta : [];

            if ($subscription->isAdminTransition() && $subscription->hasCardOnFile()) {
                $community = Community::query()->find($communityId);
                if ($community) {
                    $planSlug = (string) (data_get($meta, 'resumed_plan_slug')
                        ?: data_get($meta, 'inherited_plan_slug')
                        ?: $subscription->plan_slug);
                    $interval = $subscription->billing_interval === 'year' ? 'year' : 'month';

                    try {
                        $this->applyReplacementResume(
                            $community,
                            $subscription,
                            $planSlug,
                            $interval,
                            (string) data_get($meta, 'payment_method_id', ''),
                            (string) ($subscription->stripe_customer_id ?? ''),
                        );
                    } catch (BillingException $e) {
                        if ($e->codeKey !== 'DOWNGRADE_BLOCKED') {
                            throw $e;
                        }

                        $subscription->update([
                            'status' => CommunitySubscription::STATUS_UNPAID,
                            'meta' => $meta,
                        ]);
                    }

                    return;
                }
            }

            $subscription->update([
                'status' => CommunitySubscription::STATUS_UNPAID,
                'meta' => $meta,
            ]);
        }
    }

    public function formattedPlans(?int $estimatedResidents = null, ?string $includeSlug = null): array
    {
        $recommended = $this->recommendPlanSlug($estimatedResidents);
        $catalog = $this->activePlans();
        if ($includeSlug && ! isset($catalog[$includeSlug]) && $this->plan($includeSlug)) {
            $catalog[$includeSlug] = $this->plan($includeSlug);
        }
        $items = [];

        foreach ($catalog as $slug => $plan) {
            $items[] = [
                'slug' => $slug,
                'name' => $plan['name'],
                'description' => $plan['description'] ?? '',
                'seat_limit' => (int) $plan['seat_limit'],
                'price_monthly_cents' => (int) ($plan['price_monthly_cents'] ?? 0),
                'price_yearly_cents' => (int) ($plan['price_yearly_cents'] ?? 0),
                'trial_period_days' => $this->trialDaysForPlan($plan),
                'currency' => config('billing.currency', 'usd'),
                'recommended' => $slug === $recommended,
                'has_stripe_prices' => filled($plan['stripe_price_monthly'] ?? null) || filled($plan['stripe_price_yearly'] ?? null),
            ];
        }

        return $items;
    }

    public function billingPayload(Community $community): array
    {
        $this->refreshGraceIfNeeded($community->id);
        $billingExempt = app(RegionBillingPolicy::class)->isBillingExempt($community->id);
        $subscription = $this->getSubscription($community->id);
        if (! $billingExempt && ! $subscription?->isAdminTransition()) {
            $this->startTrialIfEligible($community);
            $subscription = $this->getSubscription($community->id);
        }
        $summary = $this->seatSummary($community->id);
        $estimated = $community->estimated_residents
            ?? $subscription?->estimated_residents;
        $includeSlug = $subscription?->isAdminTransition() ? $subscription->plan_slug : null;
        $coupon = app(SubscriptionCouponService::class)->summaryForBilling(
            $community->id,
            $subscription,
        );

        return [
            'community' => [
                'id' => $community->id,
                'name' => $community->name,
                'status' => $community->status,
                'review_status' => $community->review_status,
                'estimated_residents' => $estimated,
                'is_active_for_residents' => $community->isActiveForResidents(),
            ],
            'plans' => $billingExempt
                ? []
                : $this->formattedPlans($estimated !== null ? (int) $estimated : null, $includeSlug),
            'recommended_plan' => $subscription?->isAdminTransition()
                ? $subscription->plan_slug
                : $this->recommendPlanSlug($estimated !== null ? (int) $estimated : null),
            'trial_period_days' => $this->eligibleTrialDays(
                $subscription,
                $this->plan($this->recommendPlanSlug($estimated !== null ? (int) $estimated : null)),
            ),
            'subscription' => $subscription ? [
                'plan_slug' => $subscription->plan_slug,
                'plan_name' => $this->plan($subscription->plan_slug)['name'] ?? $subscription->plan_slug,
                'billing_interval' => $subscription->billing_interval,
                'status' => $subscription->status,
                'seat_limit' => $subscription->seat_limit,
                'extra_seats' => $subscription->extra_seats,
                'total_seat_limit' => $subscription->totalSeatLimit(),
                'stripe_customer_id' => $subscription->stripe_customer_id,
                'stripe_subscription_id' => $subscription->stripe_subscription_id,
                'current_period_start' => $subscription->current_period_start?->toIso8601String(),
                'current_period_end' => $subscription->current_period_end?->toIso8601String(),
                'cancel_at_period_end' => $subscription->cancel_at_period_end,
                'grace_ends_at' => $subscription->grace_ends_at?->toIso8601String(),
                'allows_allocation' => $subscription->allowsSeatAllocation(),
                'in_grace' => $subscription->isInGrace(),
                'card_on_file' => $subscription->hasCardOnFile(),
                'trial_pending_approval' => $subscription->isPendingTrial(),
                'admin_transition' => $subscription->isAdminTransition(),
                'leftover_ends_at' => $subscription->leftoverEndsAt()?->toIso8601String(),
                'has_leftover_service' => $subscription->hasLeftoverService(),
                'requires_replacement_card' => $subscription->isAdminTransition() && ! $subscription->hasLeftoverService(),
                'trial_consumed' => (bool) data_get($subscription->meta, 'trial_consumed', false),
                'inherited_plan_slug' => $subscription->isAdminTransition()
                    ? (string) (data_get($subscription->meta, 'inherited_plan_slug') ?: $subscription->plan_slug)
                    : null,
            ] : null,
            'seats' => $summary,
            'billing' => [
                'enabled' => $this->enabled(),
                'enforce' => $this->enforce(),
                'driver' => $this->driver(),
                'stripe_configured' => $this->stripeConfigured(),
                'publishable_key' => config('billing.stripe.publishable'),
                'exempt' => $billingExempt,
            ],
            'setup' => [
                'community_details_complete' => filled($community->name) && filled($community->address ?? $community->description),
                'community_approved' => $community->review_status === null || $community->review_status === 'approved',
                'subscription_active' => $billingExempt || $summary['allows_allocation'],
                'card_on_file' => $billingExempt || ($subscription?->hasCardOnFile() ?? false),
                'trial_pending_approval' => $subscription?->isPendingTrial() ?? false,
                'admin_transition' => $subscription?->isAdminTransition() ?? false,
                'has_leftover_service' => $subscription?->hasLeftoverService() ?? false,
                'requires_replacement_card' => ($subscription?->isAdminTransition() ?? false)
                    && ! ($subscription?->hasLeftoverService() ?? false),
                'can_invite_residents' => $billingExempt
                    ? ($community->review_status === null || $community->review_status === 'approved')
                    : ($summary['allows_allocation'] && ($summary['seats_available'] ?? 0) > 0
                        && ($community->review_status === null || $community->review_status === 'approved')),
            ],
            'coupon' => $coupon,
            'next_charge' => $this->nextChargePayload($subscription, $coupon),
            'invoices' => $this->formattedInvoices($subscription),
        ];
    }

    /** Next charge date/amount for the admin subscription summary. */
    public function nextChargePayload(?CommunitySubscription $subscription, ?array $coupon = null): ?array
    {
        if (! $subscription) {
            return null;
        }

        $plan = $this->plan($subscription->plan_slug) ?? [];
        $interval = $subscription->billing_interval === 'year' ? 'year' : 'month';
        $amount = $interval === 'year'
            ? (int) ($plan['price_yearly_cents'] ?? 0)
            : (int) ($plan['price_monthly_cents'] ?? 0);

        if (is_array($coupon) && isset($coupon['discounted_price_cents'])) {
            $amount = (int) $coupon['discounted_price_cents'];
        }

        $leftover = $subscription->hasLeftoverService();
        $cancelScheduled = (bool) $subscription->cancel_at_period_end;
        $status = (string) $subscription->status;
        $willCharge = ! $leftover
            && ! $cancelScheduled
            && in_array($status, [
                CommunitySubscription::STATUS_TRIALING,
                CommunitySubscription::STATUS_ACTIVE,
                CommunitySubscription::STATUS_PAST_DUE,
            ], true)
            && $subscription->hasCardOnFile();

        $kind = $leftover
            ? 'leftover_ends'
            : ($cancelScheduled
                ? 'access_ends'
                : ($status === CommunitySubscription::STATUS_TRIALING
                    ? 'trial_ends'
                    : ($status === CommunitySubscription::STATUS_PENDING_TRIAL
                        ? 'trial_starts'
                        : 'renews')));

        $at = $leftover
            ? $subscription->leftoverEndsAt()?->toIso8601String()
            : ($status === CommunitySubscription::STATUS_PENDING_TRIAL
                ? null
                : $subscription->current_period_end?->toIso8601String());

        return [
            'at' => $at,
            'amount_cents' => $amount,
            'currency' => config('billing.currency', 'usd'),
            'interval' => $interval,
            'will_charge' => $willCharge,
            'kind' => $kind,
        ];
    }

    /** Recent Stripe invoices for the community customer. Empty when Stripe is unused. */
    public function formattedInvoices(?CommunitySubscription $subscription): array
    {
        if (! filled($subscription?->stripe_customer_id) || ! $this->stripeConfigured()) {
            return [];
        }

        try {
            $result = $this->stripe()->invoices->all([
                'customer' => $subscription->stripe_customer_id,
                'limit' => 12,
            ]);
        } catch (\Throwable $e) {
            Log::info('Billing invoice list skipped', [
                'subscription_id' => $subscription->id,
                'error' => $e->getMessage(),
            ]);

            return [];
        }

        return collect($result->data ?? [])->map(function ($invoice) {
            $created = isset($invoice->created) ? Carbon::createFromTimestamp((int) $invoice->created) : null;
            $periodStart = isset($invoice->period_start) ? Carbon::createFromTimestamp((int) $invoice->period_start) : null;
            $periodEnd = isset($invoice->period_end) ? Carbon::createFromTimestamp((int) $invoice->period_end) : null;

            return [
                'id' => (string) ($invoice->id ?? ''),
                'number' => $invoice->number ?? null,
                'status' => (string) ($invoice->status ?? ''),
                'amount_due_cents' => (int) ($invoice->amount_due ?? 0),
                'amount_paid_cents' => (int) ($invoice->amount_paid ?? 0),
                'currency' => strtolower((string) ($invoice->currency ?: config('billing.currency', 'usd'))),
                'created_at' => $created?->toIso8601String(),
                'period_start' => $periodStart?->toIso8601String(),
                'period_end' => $periodEnd?->toIso8601String(),
                'hosted_invoice_url' => $invoice->hosted_invoice_url ?? null,
                'invoice_pdf' => $invoice->invoice_pdf ?? null,
                'billing_reason' => $invoice->billing_reason ?? null,
            ];
        })->values()->all();
    }

    public function stripeConfigured(): bool
    {
        return filled(config('billing.stripe.secret'));
    }

    public function stripe(): StripeClient
    {
        if (! $this->stripeConfigured()) {
            throw BillingException::stripeNotConfigured();
        }

        return new StripeClient(config('billing.stripe.secret'));
    }

    public function createCheckoutSession(
        Community $community,
        User $admin,
        string $planSlug,
        string $interval = 'month',
        ?string $returnOrigin = null,
    ): array {
        $this->refreshGraceIfNeeded($community->id);
        $existing = $this->getSubscription($community->id);
        $plan = $this->assertPlanAvailable($this->plan($planSlug), $existing);

        $interval = $interval === 'year' ? 'year' : 'month';
        $priceId = $interval === 'year'
            ? ($plan['stripe_price_yearly'] ?? null)
            : ($plan['stripe_price_monthly'] ?? null);

        if ($existing?->hasLeftoverService()) {
            return [
                'mode' => 'already_active',
                'checkout_url' => null,
                'message' => 'This community is still within the inherited subscription period. Add your card when that period ends.',
            ];
        }

        if ($existing?->grantsPaidAccess()) {
            return [
                'mode' => 'already_active',
                'checkout_url' => null,
                'message' => '30-day free trial is already active.',
            ];
        }

        if ($existing?->isPendingTrial() && ! $existing->isAdminTransition()) {
            $started = $this->startTrialIfEligible($community);
            if ($started?->grantsPaidAccess()) {
                return [
                    'mode' => 'already_active',
                    'checkout_url' => null,
                    'message' => '30-day free trial started.',
                ];
            }

            return [
                'mode' => 'already_active',
                'checkout_url' => null,
                'message' => 'Your card is saved. The 30-day free trial starts when a system administrator approves your account.',
            ];
        }

        if (! $this->stripeConfigured()) {
            throw BillingException::stripeNotConfigured();
        }

        if (! filled($priceId)) {
            throw BillingException::stripePriceMissing();
        }

        $stripe = $this->stripe();
        $customerId = $this->ensureStripeCustomer($community, $admin, $stripe);
        $this->assertUsdStripePrice($stripe, (string) $priceId);

        $trialDays = $this->eligibleTrialDays($existing, $plan);
        $priceCents = $interval === 'year'
            ? (int) ($plan['price_yearly_cents'] ?? 0)
            : (int) ($plan['price_monthly_cents'] ?? 0);

        $intentId = (string) data_get($existing?->meta, 'intent_id', '');
        if (
            $existing?->status === CommunitySubscription::STATUS_INCOMPLETE
            && ! $existing->isAdminTransition()
            && str_starts_with($intentId, 'seti_')
            && $existing->plan_slug === $planSlug
            && $existing->billing_interval === $interval
        ) {
            try {
                $setup = $stripe->setupIntents->retrieve($intentId);
                $intentStatus = (string) data_get($setup, 'status', '');
                if (in_array($intentStatus, ['succeeded', 'processing'], true)) {
                    $this->confirmElementsCheckout($community, $intentId);
                    $fresh = $this->getSubscription($community->id);

                    return [
                        'mode' => 'already_active',
                        'checkout_url' => null,
                        'message' => $fresh?->grantsPaidAccess()
                            ? '30-day free trial started.'
                            : 'Your card is saved. The 30-day free trial starts when a system administrator approves your account.',
                    ];
                }

                if (in_array($intentStatus, ['requires_payment_method', 'requires_confirmation', 'requires_action'], true)
                    && filled(data_get($setup, 'client_secret'))
                ) {
                    return $this->elementsCheckoutPayload(
                        $community,
                        $admin,
                        $plan,
                        $planSlug,
                        $interval,
                        $trialDays,
                        $priceCents,
                        $intentId,
                        [
                            'client_secret' => (string) data_get($setup, 'client_secret'),
                            'type' => 'setup',
                            'id' => $intentId,
                        ],
                        $customerId,
                        (string) $priceId,
                    );
                }
            } catch (ApiErrorException $e) {
                Log::info('Could not reuse incomplete SetupIntent', [
                    'community_id' => $community->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        if (
            $existing?->stripe_subscription_id
            && in_array($existing->status, [
                CommunitySubscription::STATUS_INCOMPLETE,
                CommunitySubscription::STATUS_PENDING_TRIAL,
            ], true)
        ) {
            try {
                $this->stripe()->subscriptions->cancel($existing->stripe_subscription_id, [
                    'invoice_now' => false,
                    'prorate' => false,
                ]);
            } catch (ApiErrorException $e) {
                Log::info('Could not cancel previous incomplete Stripe subscription', [
                    'community_id' => $community->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        try {
            $setupIntent = $stripe->setupIntents->create([
                'customer' => $customerId,
                'payment_method_types' => ['card'],
                'usage' => 'off_session',
                'metadata' => [
                    'community_id' => (string) $community->id,
                    'plan_slug' => $planSlug,
                    'billing_interval' => $interval,
                    'admin_user_id' => (string) $admin->id,
                ],
            ]);
        } catch (ApiErrorException $e) {
            Log::error('Stripe setup intent checkout failed', [
                'error' => $e->getMessage(),
                'community_id' => $community->id,
                'plan_slug' => $planSlug,
            ]);
            throw new BillingException(
                'Unable to start checkout: '.$e->getMessage(),
                'STRIPE_CHECKOUT_FAILED',
                502,
            );
        }

        $intent = [
            'client_secret' => (string) $setupIntent->client_secret,
            'type' => 'setup',
            'id' => (string) $setupIntent->id,
        ];

        return $this->elementsCheckoutPayload(
            $community,
            $admin,
            $plan,
            $planSlug,
            $interval,
            $trialDays,
            $priceCents,
            $intent['id'],
            $intent,
            $customerId,
            (string) $priceId,
        );
    }

    /**
     * @return array{client_secret: string, type: string, id: string}
     */
    protected function resolveSubscriptionPaymentIntent(StripeClient $stripe, object $stripeSub): array
    {
        $setup = data_get($stripeSub, 'pending_setup_intent');
        if (is_string($setup) && $setup !== '') {
            $setup = $stripe->setupIntents->retrieve($setup);
        }
        $setupSecret = is_object($setup) ? (string) (data_get($setup, 'client_secret') ?? '') : '';
        if ($setupSecret !== '') {
            return [
                'client_secret' => $setupSecret,
                'type' => 'setup',
                'id' => (string) data_get($setup, 'id'),
            ];
        }

        $payment = data_get($stripeSub, 'latest_invoice.payment_intent');
        if (is_string($payment) && $payment !== '') {
            $payment = $stripe->paymentIntents->retrieve($payment);
        }
        $paymentSecret = is_object($payment) ? (string) (data_get($payment, 'client_secret') ?? '') : '';
        if ($paymentSecret !== '') {
            return [
                'client_secret' => $paymentSecret,
                'type' => 'payment',
                'id' => (string) data_get($payment, 'id'),
            ];
        }

        $setupIntent = $stripe->setupIntents->create([
            'customer' => (string) data_get($stripeSub, 'customer'),
            'payment_method_types' => ['card'],
            'usage' => 'off_session',
            'metadata' => [
                'community_id' => (string) data_get($stripeSub, 'metadata.community_id'),
                'stripe_subscription_id' => (string) data_get($stripeSub, 'id'),
            ],
        ]);

        return [
            'client_secret' => (string) $setupIntent->client_secret,
            'type' => 'setup',
            'id' => (string) $setupIntent->id,
        ];
    }

    protected function subscriptionHasAttachedIntent(object $stripeSub): bool
    {
        $setup = data_get($stripeSub, 'pending_setup_intent');
        if ((is_string($setup) && $setup !== '') || (is_object($setup) && filled(data_get($setup, 'client_secret')))) {
            return true;
        }

        $payment = data_get($stripeSub, 'latest_invoice.payment_intent');

        return (is_string($payment) && $payment !== '')
            || (is_object($payment) && filled(data_get($payment, 'client_secret')));
    }

    /**
     * @param  array{client_secret: string, type: string, id: string}  $intent
     */
    protected function retrieveIntentStatus(StripeClient $stripe, array $intent): string
    {
        $id = (string) ($intent['id'] ?? '');
        $type = (string) ($intent['type'] ?? 'setup');
        if ($id === '') {
            return '';
        }

        try {
            if ($type === 'payment') {
                return (string) data_get($stripe->paymentIntents->retrieve($id), 'status', '');
            }

            return (string) data_get($stripe->setupIntents->retrieve($id), 'status', '');
        } catch (ApiErrorException) {
            return '';
        }
    }

    /**
     * @param  array<string, mixed>  $plan
     * @param  array{client_secret: string, type: string, id: string}  $intent
     * @return array<string, mixed>
     */
    protected function elementsCheckoutPayload(
        Community $community,
        User $admin,
        array $plan,
        string $planSlug,
        string $interval,
        int $trialDays,
        int $priceCents,
        string $stripeSubscriptionId,
        array $intent,
        string $customerId,
        string $priceId,
    ): array {
        $existing = $this->getSubscription($community->id);
        $meta = is_array($existing?->meta) ? $existing->meta : [];
        $meta['intent_type'] = $intent['type'];
        $meta['intent_id'] = $intent['id'];
        $meta['initiated_by'] = $admin->id;
        $meta['checkout_ui'] = 'elements';
        $replacement = $existing?->isAdminTransition() ?? false;
        $meta['trial_starts_on_approval'] = $trialDays > 0;
        if ($replacement) {
            $meta['admin_transition'] = true;
        }

        CommunitySubscription::query()->updateOrCreate(
            ['community_id' => $community->id],
            [
                'plan_slug' => $planSlug,
                'billing_interval' => $interval,
                'status' => $replacement
                    ? (string) $existing->status
                    : CommunitySubscription::STATUS_INCOMPLETE,
                'seat_limit' => (int) ($plan['seat_limit'] ?? $existing?->seat_limit ?? 0),
                'estimated_residents' => $community->estimated_residents,
                'stripe_customer_id' => $customerId,
                'stripe_subscription_id' => $replacement && filled($existing?->stripe_subscription_id)
                    ? $existing->stripe_subscription_id
                    : (str_starts_with($stripeSubscriptionId, 'sub_') ? $stripeSubscriptionId : null),
                'stripe_price_id' => $priceId,
                'meta' => $meta,
            ],
        );

        $saved = $this->getSubscription($community->id);
        if ($saved) {
            app(SubscriptionCouponService::class)->linkPendingToSubscription($community->id, $saved);
        }

        app(\App\Services\ReferralService::class)->markBillingStarted($admin->id);

        $email = $admin->email;
        if (filled($email) && str_contains((string) $email, '@invited')) {
            $email = null;
        }
        if (filled($email) && str_contains((string) $email, '@phone.havena.local')) {
            $email = null;
        }

        $admin->loadMissing('profile');
        $customerName = trim((string) ($admin->profile?->display_name ?: $admin->name ?: $community->name));
        if ($customerName === '') {
            $customerName = 'Community admin';
        }

        $requiresReplacementCard = $replacement && ! ($existing?->hasLeftoverService() ?? false);

        return [
            'mode' => 'elements',
            'client_secret' => $intent['client_secret'],
            'intent_type' => $intent['type'],
            'stripe_subscription_id' => $stripeSubscriptionId,
            'stripe_setup_intent_id' => $intent['type'] === 'setup' ? $intent['id'] : null,
            'trial_starts_on_approval' => $trialDays > 0,
            'publishable_key' => config('billing.stripe.publishable'),
            'trial_days' => $trialDays,
            'admin_transition' => $replacement,
            'requires_replacement_card' => $requiresReplacementCard,
            'promo_code_allowed' => true,
            'customer_email' => $email,
            'customer_name' => $customerName,
            'customer_phone' => $admin->phone,
            'community_name' => $community->name,
            'plan' => [
                'slug' => $planSlug,
                'name' => (string) ($plan['name'] ?? ucfirst($planSlug)),
                'seat_limit' => (int) ($plan['seat_limit'] ?? 0),
                'interval' => $interval,
                'price_cents' => $priceCents,
                'currency' => (string) config('billing.currency', 'usd'),
            ],
            'coupon' => app(SubscriptionCouponService::class)->summaryForBilling(
                $community->id,
                $saved,
                $priceCents,
            ),
        ];
    }

    public function confirmElementsCheckout(Community $community, string $stripeSubscriptionId): CommunitySubscription
    {
        if (! $this->stripeConfigured()) {
            throw BillingException::stripeNotConfigured();
        }

        $local = $this->getSubscription($community->id);
        $setupIntentId = str_starts_with($stripeSubscriptionId, 'seti_')
            ? $stripeSubscriptionId
            : (string) data_get($local?->meta, 'intent_id', '');

        if (str_starts_with($setupIntentId, 'seti_') && ! str_starts_with($stripeSubscriptionId, 'sub_')) {
            return $this->confirmCardSetupIntent($community, $setupIntentId);
        }

        try {
            $stripeSub = $this->stripe()->subscriptions->retrieve($stripeSubscriptionId);
        } catch (ApiErrorException $e) {
            throw new BillingException('Unable to confirm payment: '.$e->getMessage(), 'STRIPE_CONFIRM_FAILED', 502);
        }

        $metaCommunity = (int) data_get($stripeSub, 'metadata.community_id');
        if ($metaCommunity && $metaCommunity !== (int) $community->id) {
            throw new BillingException('Checkout does not belong to this community.', 'CHECKOUT_MISMATCH', 403);
        }

        $defaultPm = data_get($stripeSub, 'default_payment_method');
        if (! $defaultPm) {
            $intentId = (string) data_get($local?->meta, 'intent_id', '');
            $intentType = (string) data_get($local?->meta, 'intent_type', 'setup');
            if ($intentId !== '') {
                try {
                    $intent = $intentType === 'payment'
                        ? $this->stripe()->paymentIntents->retrieve($intentId)
                        : $this->stripe()->setupIntents->retrieve($intentId);
                    $pm = data_get($intent, 'payment_method');
                    if ($pm) {
                        $stripeSub = $this->stripe()->subscriptions->update($stripeSubscriptionId, [
                            'default_payment_method' => $pm,
                        ]);
                    }
                } catch (ApiErrorException $e) {
                    Log::info('Could not attach payment method after elements confirm', [
                        'community_id' => $community->id,
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        }

        if (! $this->stripeObjectHasCard($stripeSub)) {
            throw BillingException::cardRequired();
        }

        $synced = $this->syncFromStripeSubscription($stripeSub, $community->id);

        if (! $this->isCommunityApprovedForTrial($community) && $synced->grantsPaidAccess()) {
            return $this->deferTrialUntilApproval($community, $synced, (string) data_get($stripeSub, 'default_payment_method'));
        }

        return $synced;
    }

    /**
     * Save the card on the Stripe customer without starting a subscription.
     * Trial starts later via startTrialIfEligible() after platform approval.
     */
    protected function confirmCardSetupIntent(Community $community, string $setupIntentId): CommunitySubscription
    {
        try {
            $intent = $this->stripe()->setupIntents->retrieve($setupIntentId);
        } catch (ApiErrorException $e) {
            throw new BillingException('Unable to confirm payment: '.$e->getMessage(), 'STRIPE_CONFIRM_FAILED', 502);
        }

        $metaCommunity = (int) data_get($intent, 'metadata.community_id');
        if ($metaCommunity && $metaCommunity !== (int) $community->id) {
            throw new BillingException('Checkout does not belong to this community.', 'CHECKOUT_MISMATCH', 403);
        }

        $status = (string) data_get($intent, 'status', '');
        if (! in_array($status, ['succeeded', 'processing'], true)) {
            throw BillingException::cardRequired();
        }

        $paymentMethod = data_get($intent, 'payment_method');
        $paymentMethodId = is_string($paymentMethod) ? $paymentMethod : (string) data_get($paymentMethod, 'id', '');
        if ($paymentMethodId === '') {
            throw BillingException::cardRequired();
        }

        $local = $this->getSubscription($community->id);
        $customerId = (string) (data_get($intent, 'customer') ?: $local?->stripe_customer_id);
        if ($customerId === '') {
            throw new BillingException('Unable to confirm payment: missing Stripe customer.', 'STRIPE_CONFIRM_FAILED', 502);
        }

        try {
            $this->stripe()->customers->update($customerId, [
                'invoice_settings' => [
                    'default_payment_method' => $paymentMethodId,
                ],
            ]);
        } catch (ApiErrorException $e) {
            throw new BillingException('Unable to save card: '.$e->getMessage(), 'STRIPE_CONFIRM_FAILED', 502);
        }

        $planSlug = (string) (data_get($intent, 'metadata.plan_slug') ?: $local?->plan_slug ?: 'growth');
        $interval = (string) (data_get($intent, 'metadata.billing_interval') ?: $local?->billing_interval ?: 'month');
        $interval = $interval === 'year' ? 'year' : 'month';
        $plan = $this->plan($planSlug) ?? [];

        $meta = is_array($local?->meta) ? $local->meta : [];
        $meta['card_on_file'] = true;
        $meta['payment_method_id'] = $paymentMethodId;
        $meta['intent_id'] = $setupIntentId;
        $meta['intent_type'] = 'setup';
        $meta['trial_starts_on_approval'] = true;

        if ($local?->isAdminTransition()) {
            if ($local->hasLeftoverService()) {
                throw new BillingException(
                    'Billing resumes when the inherited subscription period ends. Add your card then.',
                    'LEFTOVER_PERIOD_ACTIVE',
                );
            }

            return $this->applyReplacementResume(
                $community,
                $local,
                $planSlug,
                $interval,
                $paymentMethodId,
                $customerId,
            );
        }

        CommunitySubscription::query()->updateOrCreate(
            ['community_id' => $community->id],
            [
                'plan_slug' => $planSlug,
                'billing_interval' => $interval,
                'status' => CommunitySubscription::STATUS_PENDING_TRIAL,
                'seat_limit' => (int) ($plan['seat_limit'] ?? $local?->seat_limit ?? 0),
                'estimated_residents' => $community->estimated_residents,
                'stripe_customer_id' => $customerId,
                'stripe_subscription_id' => null,
                'stripe_price_id' => $interval === 'year'
                    ? ($plan['stripe_price_yearly'] ?? $local?->stripe_price_id)
                    : ($plan['stripe_price_monthly'] ?? $local?->stripe_price_id),
                'current_period_start' => null,
                'current_period_end' => null,
                'canceled_at' => null,
                'meta' => $meta,
            ],
        );

        $saved = $this->getSubscription($community->id);
        if ($saved) {
            app(SubscriptionCouponService::class)->linkPendingToSubscription($community->id, $saved);
        }

        return $this->startTrialIfEligible($community) ?? $this->getSubscription($community->id);
    }

    /**
     * Convert a premature Stripe trial (created before approval) into card-on-file only.
     */
    protected function deferTrialUntilApproval(
        Community $community,
        CommunitySubscription $subscription,
        string $paymentMethodId,
    ): CommunitySubscription {
        $meta = is_array($subscription->meta) ? $subscription->meta : [];
        $meta['card_on_file'] = true;
        $meta['trial_starts_on_approval'] = true;
        $meta['ignore_subscription_deleted'] = true;
        if ($paymentMethodId !== '') {
            $meta['payment_method_id'] = $paymentMethodId;
        }

        $subscription->update(['meta' => $meta]);

        if (filled($subscription->stripe_customer_id) && $paymentMethodId !== '') {
            try {
                $this->stripe()->customers->update($subscription->stripe_customer_id, [
                    'invoice_settings' => [
                        'default_payment_method' => $paymentMethodId,
                    ],
                ]);
            } catch (ApiErrorException $e) {
                Log::info('Could not store default payment method while deferring trial', [
                    'community_id' => $community->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        if (filled($subscription->stripe_subscription_id) && $this->stripeConfigured()) {
            try {
                $this->stripe()->subscriptions->cancel($subscription->stripe_subscription_id, [
                    'invoice_now' => false,
                    'prorate' => false,
                ]);
            } catch (ApiErrorException $e) {
                Log::warning('Could not cancel premature Stripe trial before approval', [
                    'community_id' => $community->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $subscription->update([
            'status' => CommunitySubscription::STATUS_PENDING_TRIAL,
            'stripe_subscription_id' => null,
            'current_period_start' => null,
            'current_period_end' => null,
            'canceled_at' => null,
            'meta' => $meta,
        ]);

        return $subscription->fresh();
    }

    /**
     * Activate billing after platform approval: free trial when eligible, otherwise paid subscription.
     */
    public function startTrialIfEligible(Community $community): ?CommunitySubscription
    {
        return DB::transaction(function () use ($community) {
            $subscription = CommunitySubscription::query()
                ->where('community_id', $community->id)
                ->lockForUpdate()
                ->first();

            if (! $subscription?->hasCardOnFile()) {
                return $subscription;
            }

            if ($subscription->grantsPaidAccess()) {
                return $subscription;
            }

            if (! $this->isCommunityApprovedForTrial($community)) {
                return $subscription;
            }

            // Another approval request may have already created a live Stripe sub.
            if ($this->stripeConfigured() && filled($subscription->stripe_customer_id)) {
                $existingRemote = $this->findLiveStripeSubscriptionForCustomer((string) $subscription->stripe_customer_id);
                if ($existingRemote) {
                    return $this->finalizeActivatedSubscription(
                        $this->syncFromStripeSubscription($existingRemote, $community->id, (string) $subscription->stripe_customer_id),
                        (string) data_get($subscription->meta, 'payment_method_id', ''),
                        $this->eligibleTrialDays($subscription, $this->plan($subscription->plan_slug) ?? []) > 0
                            || (string) data_get($existingRemote, 'status') === 'trialing',
                    );
                }
            }

            $plan = $this->plan($subscription->plan_slug) ?? [];
            $trialDays = $this->eligibleTrialDays($subscription, $plan);
            $interval = $subscription->billing_interval === 'year' ? 'year' : 'month';
            $priceId = $interval === 'year'
                ? ($plan['stripe_price_yearly'] ?? $subscription->stripe_price_id)
                : ($plan['stripe_price_monthly'] ?? $subscription->stripe_price_id);

            if (! $this->stripeConfigured()) {
                $meta = is_array($subscription->meta) ? $subscription->meta : [];
                if ($trialDays > 0) {
                    $meta['trial_started_on_approval'] = now()->toIso8601String();
                }

                $subscription->update([
                    'status' => $trialDays > 0
                        ? CommunitySubscription::STATUS_TRIALING
                        : CommunitySubscription::STATUS_ACTIVE,
                    'current_period_start' => now(),
                    'current_period_end' => $trialDays > 0
                        ? now()->addDays($trialDays)
                        : ($interval === 'year' ? now()->addYear() : now()->addMonth()),
                    'canceled_at' => null,
                    'meta' => $meta,
                ]);

                if ($trialDays > 0) {
                    $this->markTrialConsumed($subscription->fresh(), 'trial_started');
                }

                $fresh = $subscription->fresh();
                app(SubscriptionCouponService::class)->markApplied($fresh);

                return $fresh;
            }

            $customerId = (string) $subscription->stripe_customer_id;
            $paymentMethodId = (string) data_get($subscription->meta, 'payment_method_id', '');
            if ($paymentMethodId === '' && $customerId !== '') {
                try {
                    $customer = $this->stripe()->customers->retrieve($customerId);
                    $paymentMethodId = (string) data_get($customer, 'invoice_settings.default_payment_method', '');
                } catch (ApiErrorException) {
                    $paymentMethodId = '';
                }
            }

            if ($customerId === '' || $paymentMethodId === '' || ! filled($priceId)) {
                Log::warning('Cannot activate billing after approval — missing Stripe customer, card, or price', [
                    'community_id' => $community->id,
                    'has_customer' => $customerId !== '',
                    'has_payment_method' => $paymentMethodId !== '',
                    'has_price' => filled($priceId),
                    'trial_consumed' => $subscription->hasConsumedTrial(),
                ]);

                return $subscription;
            }

            $planLabel = (string) ($plan['name'] ?? ucfirst((string) $subscription->plan_slug));
            $intervalLabel = $interval === 'year' ? 'yearly' : 'monthly';
            $createParams = [
                'customer' => $customerId,
                'items' => [['price' => $priceId, 'quantity' => 1]],
                'default_payment_method' => $paymentMethodId,
                'off_session' => true,
                'payment_settings' => [
                    'save_default_payment_method' => 'on_subscription',
                    'payment_method_types' => ['card'],
                ],
                'collection_method' => 'charge_automatically',
                'description' => sprintf(
                    'Havena %s · %s · %d resident seats',
                    $planLabel,
                    $intervalLabel,
                    (int) ($plan['seat_limit'] ?? $subscription->seat_limit),
                ),
                'metadata' => [
                    'community_id' => (string) $community->id,
                    'plan_slug' => (string) $subscription->plan_slug,
                    'billing_interval' => $interval,
                ],
            ];

            if ($trialDays > 0) {
                $createParams['trial_period_days'] = $trialDays;
                $createParams['trial_settings'] = [
                    'end_behavior' => [
                        'missing_payment_method' => 'cancel',
                    ],
                ];
            }

            $createParams = app(SubscriptionCouponService::class)
                ->appendDiscountToSubscriptionCreate($createParams, $subscription);

            try {
                $stripeSub = $this->stripe()->subscriptions->create($createParams);
            } catch (ApiErrorException $e) {
                // Parallel approval may have created the subscription first.
                $existingRemote = $this->findLiveStripeSubscriptionForCustomer($customerId);
                if ($existingRemote) {
                    Log::warning('Stripe subscription create raced; reusing existing live subscription', [
                        'community_id' => $community->id,
                        'stripe_subscription_id' => data_get($existingRemote, 'id'),
                        'error' => $e->getMessage(),
                    ]);

                    return $this->finalizeActivatedSubscription(
                        $this->syncFromStripeSubscription($existingRemote, $community->id, $customerId),
                        $paymentMethodId,
                        $trialDays > 0 || (string) data_get($existingRemote, 'status') === 'trialing',
                    );
                }

                Log::error('Failed to activate Stripe subscription after approval', [
                    'community_id' => $community->id,
                    'trial_days' => $trialDays,
                    'error' => $e->getMessage(),
                ]);

                return $subscription;
            }

            $synced = $this->syncFromStripeSubscription($stripeSub, $community->id, $customerId);

            return $this->finalizeActivatedSubscription(
                $synced,
                $paymentMethodId,
                $trialDays > 0 && $synced->status === CommunitySubscription::STATUS_TRIALING,
            );
        });
    }

    /**
     * Prefer an existing trialing/active Stripe subscription so concurrent approvals
     * do not create a second paid subscription.
     */
    protected function findLiveStripeSubscriptionForCustomer(string $customerId): ?object
    {
        if ($customerId === '' || ! $this->stripeConfigured()) {
            return null;
        }

        try {
            $subs = $this->stripe()->subscriptions->all([
                'customer' => $customerId,
                'status' => 'all',
                'limit' => 10,
            ]);
        } catch (ApiErrorException $e) {
            Log::warning('Could not list Stripe subscriptions before activation', [
                'customer' => $customerId,
                'error' => $e->getMessage(),
            ]);

            return null;
        }

        $preferred = null;
        foreach ($subs->data as $remote) {
            $status = (string) data_get($remote, 'status', '');
            if ($status === 'trialing') {
                return $remote;
            }
            if ($status === 'active' && $preferred === null) {
                $preferred = $remote;
            }
        }

        return $preferred;
    }

    protected function finalizeActivatedSubscription(
        CommunitySubscription $synced,
        string $paymentMethodId,
        bool $trialStarted,
    ): CommunitySubscription {
        $meta = is_array($synced->meta) ? $synced->meta : [];
        $meta['card_on_file'] = true;
        if ($paymentMethodId !== '') {
            $meta['payment_method_id'] = $paymentMethodId;
        }
        unset($meta['ignore_subscription_deleted']);
        if ($trialStarted && $synced->status === CommunitySubscription::STATUS_TRIALING) {
            $meta['trial_started_on_approval'] = data_get($meta, 'trial_started_on_approval') ?: now()->toIso8601String();
        }
        $synced->update(['meta' => $meta]);

        if ($trialStarted && $synced->fresh()->status === CommunitySubscription::STATUS_TRIALING) {
            $this->markTrialConsumed($synced->fresh(), 'trial_started');
        }

        $fresh = $synced->fresh();
        app(SubscriptionCouponService::class)->markApplied($fresh);

        return $fresh;
    }

    protected function isCommunityApprovedForTrial(Community $community): bool
    {
        if (in_array($community->review_status, ['pending', 'rejected'], true)) {
            return false;
        }

        if ($community->status && $community->status !== 'active') {
            return false;
        }

        return CommunityMembership::query()
            ->where('community_id', $community->id)
            ->where('role', 'admin')
            ->where('status', 'approved')
            ->whereHas('user', function ($query) {
                $query->where('community_admin_status', 'approved')
                    ->where(function ($status) {
                        $status->whereNull('status')->orWhere('status', '!=', 'suspended');
                    });
            })
            ->exists();
    }

    /**
     * Create a Checkout Session, dropping optional params Stripe's API version may not support.
     *
     * @param  array<string, mixed>  $payload
     */
    protected function createStripeCheckoutSession(StripeClient $stripe, array $payload): \Stripe\Checkout\Session
    {
        $optionalKeys = ['name_collection', 'branding_settings', 'wallet_options', 'automatic_tax', 'phone_number_collection'];

        for ($attempt = 0; $attempt < 6; $attempt++) {
            try {
                return $stripe->checkout->sessions->create($payload);
            } catch (ApiErrorException $e) {
                $message = strtolower($e->getMessage());
                $dropped = false;
                foreach ($optionalKeys as $key) {
                    if (array_key_exists($key, $payload) && str_contains($message, strtolower($key))) {
                        unset($payload[$key]);
                        $dropped = true;
                    }
                }
                if (! $dropped) {
                    throw $e;
                }
            }
        }

        return $stripe->checkout->sessions->create($payload);
    }

    public function createPortalSession(Community $community): array
    {
        $subscription = $this->getSubscription($community->id);
        if (! $subscription?->stripe_customer_id) {
            throw new BillingException('No Stripe customer found for this community.', 'NO_STRIPE_CUSTOMER');
        }

        $stripe = $this->stripe();

        try {
            $session = $stripe->billingPortal->sessions->create([
                'customer' => $subscription->stripe_customer_id,
                'return_url' => config('billing.portal_return_url'),
            ]);
        } catch (ApiErrorException $e) {
            throw new BillingException('Unable to open billing portal: '.$e->getMessage(), 'STRIPE_PORTAL_FAILED', 502);
        }

        return ['portal_url' => $session->url];
    }

    public function changePlan(Community $community, string $planSlug, string $interval = 'month'): CommunitySubscription
    {
        $this->refreshGraceIfNeeded($community->id);
        $subscription = $this->getSubscription($community->id);
        $plan = $this->assertPlanAvailable($this->plan($planSlug), $subscription);

        if (! $subscription || ! $subscription->allowsSeatAllocation()) {
            throw BillingException::subscriptionRequired();
        }

        if ($subscription->isAdminTransition()) {
            if ($subscription->hasLeftoverService()) {
                throw new BillingException(
                    'Plan changes are available when the inherited subscription period ends.',
                    'LEFTOVER_PERIOD_ACTIVE',
                );
            }

            throw new BillingException(
                'Add a card to resume billing before changing plans.',
                'ADMIN_TRANSITION_CARD_REQUIRED',
            );
        }

        $used = $this->seatsUsed($community->id);
        $newLimit = (int) $plan['seat_limit'] + (int) $subscription->extra_seats;
        if ($used > $newLimit) {
            throw BillingException::downgradeBlocked($used, $newLimit);
        }

        $interval = $interval === 'year' ? 'year' : 'month';

        if ($subscription->stripe_subscription_id && $this->stripeConfigured()) {
            $priceId = $interval === 'year'
                ? ($plan['stripe_price_yearly'] ?? null)
                : ($plan['stripe_price_monthly'] ?? null);

            if (! filled($priceId)) {
                throw BillingException::stripeNotConfigured();
            }

            $stripe = $this->stripe();
            $stripeSub = $stripe->subscriptions->retrieve($subscription->stripe_subscription_id);
            $itemId = $stripeSub->items->data[0]->id ?? null;
            if (! $itemId) {
                throw new BillingException('Stripe subscription item missing.', 'STRIPE_SUBSCRIPTION_INVALID', 502);
            }

            $updated = $stripe->subscriptions->update($subscription->stripe_subscription_id, [
                'items' => [[
                    'id' => $itemId,
                    'price' => $priceId,
                ]],
                'proration_behavior' => 'create_prorations',
                'metadata' => [
                    'community_id' => (string) $community->id,
                    'plan_slug' => $planSlug,
                    'billing_interval' => $interval,
                ],
            ]);

            return $this->syncFromStripeSubscription($updated, $community->id);
        }

        $subscription->update([
            'plan_slug' => $planSlug,
            'billing_interval' => $interval,
            'seat_limit' => (int) $plan['seat_limit'],
            'status' => CommunitySubscription::STATUS_ACTIVE,
        ]);

        return $subscription->fresh();
    }

    public function activateManualSubscription(
        Community $community,
        string $planSlug,
        string $interval = 'month',
        ?User $actor = null,
    ): CommunitySubscription {
        $plan = $this->assertPlanAvailable($this->plan($planSlug));

        $interval = $interval === 'year' ? 'year' : 'month';
        $existing = $this->getSubscription($community->id);
        $trialDays = $this->eligibleTrialDays($existing, $plan);
        $isTrial = $trialDays > 0;
        $periodEnd = $isTrial
            ? now()->addDays($trialDays)
            : ($interval === 'year' ? now()->addYear() : now()->addMonth());

        $meta = is_array($existing?->meta) ? $existing->meta : [];
        $meta['activated_via'] = 'manual';
        $meta['activated_by'] = $actor?->id;
        $meta['trial_days'] = $isTrial ? $trialDays : 0;

        $subscription = CommunitySubscription::query()->updateOrCreate(
            ['community_id' => $community->id],
            [
                'plan_slug' => $planSlug,
                'billing_interval' => $interval,
                'status' => $isTrial
                    ? CommunitySubscription::STATUS_TRIALING
                    : CommunitySubscription::STATUS_ACTIVE,
                'seat_limit' => (int) $plan['seat_limit'],
                'estimated_residents' => $community->estimated_residents,
                'current_period_start' => now(),
                'current_period_end' => $periodEnd,
                'cancel_at_period_end' => false,
                'grace_ends_at' => null,
                'canceled_at' => null,
                'meta' => $meta,
            ],
        );

        if ($isTrial) {
            $this->markTrialConsumed($subscription, 'manual_grant_trial');
        }

        return $subscription->fresh();
    }

    public function reserveSeatForInvite(int $communityId, ?int $userId, ?InviteCode $invite = null): CommunitySeatReservation
    {
        $this->assertCanAllocateSeat($communityId);

        return CommunitySeatReservation::query()->create([
            'community_id' => $communityId,
            'invite_code_id' => $invite?->id,
            'user_id' => $userId,
            'status' => CommunitySeatReservation::STATUS_RESERVED,
            'expires_at' => $invite?->expires_at ?? now()->addDays(30),
        ]);
    }

    public function consumeReservationsForUser(int $communityId, int $userId): void
    {
        CommunitySeatReservation::query()
            ->where('community_id', $communityId)
            ->where('user_id', $userId)
            ->where('status', CommunitySeatReservation::STATUS_RESERVED)
            ->update([
                'status' => CommunitySeatReservation::STATUS_CONSUMED,
                'updated_at' => now(),
            ]);
    }

    /** Free reserved seats when a pending member invitation is cancelled. */
    public function releaseReservationsForUser(int $communityId, int $userId): int
    {
        if (! $this->seatReservationsAvailable()) {
            return 0;
        }

        return CommunitySeatReservation::query()
            ->where('community_id', $communityId)
            ->where('user_id', $userId)
            ->where('status', CommunitySeatReservation::STATUS_RESERVED)
            ->update([
                'status' => CommunitySeatReservation::STATUS_RELEASED,
                'expires_at' => now(),
                'updated_at' => now(),
            ]);
    }

    public function releaseExpiredReservations(?int $communityId = null): int
    {
        if (! $this->seatReservationsAvailable()) {
            return 0;
        }

        $query = CommunitySeatReservation::query()
            ->where('status', CommunitySeatReservation::STATUS_RESERVED)
            ->whereNotNull('expires_at')
            ->where('expires_at', '<', now());

        if ($communityId) {
            $query->where('community_id', $communityId);
        }

        return $query->update([
            'status' => CommunitySeatReservation::STATUS_RELEASED,
            'updated_at' => now(),
        ]);
    }

    /**
     * Suspend billing when a community admin is removed: detach their card,
     * pause Stripe, and keep leftover paid/trial days as the grace window.
     */
    public function pauseForAdminTransition(int $communityId): ?CommunitySubscription
    {
        $this->refreshGraceIfNeeded($communityId);
        $subscription = $this->getSubscription($communityId);
        if (! $subscription || $subscription->status === CommunitySubscription::STATUS_CANCELED) {
            return $subscription;
        }

        $previousStatus = (string) $subscription->status;
        $periodEnd = $subscription->current_period_end;
        $plan = $this->plan($subscription->plan_slug) ?? [];
        $eligibleTrialDays = $this->eligibleTrialDays($subscription, $plan);
        $hadStartedService = in_array($previousStatus, [
            CommunitySubscription::STATUS_TRIALING,
            CommunitySubscription::STATUS_ACTIVE,
            CommunitySubscription::STATUS_GRACE,
            CommunitySubscription::STATUS_PAST_DUE,
        ], true) || $periodEnd !== null;

        $leftoverEnd = now();
        if ($hadStartedService && $periodEnd && $periodEnd->isFuture()) {
            $leftoverEnd = $periodEnd;
        } elseif (
            $previousStatus === CommunitySubscription::STATUS_PENDING_TRIAL
            && $eligibleTrialDays > 0
            && ! $subscription->hasConsumedTrial()
        ) {
            // Card was saved but the trial had not started — grant the full trial window to the replacement.
            $leftoverEnd = now()->addDays($eligibleTrialDays);
            $hadStartedService = true;
        }

        $this->detachCustomerPaymentMethods($subscription);
        $this->pauseStripeCollection($subscription);

        $meta = is_array($subscription->meta) ? $subscription->meta : [];
        $meta['admin_transition'] = true;
        $meta['card_on_file'] = false;
        unset($meta['payment_method_id']);
        $meta['paused_reason'] = 'community_admin_suspended';
        $meta['paused_at'] = now()->toIso8601String();
        $meta['previous_status'] = $previousStatus;
        $meta['inherited_plan_slug'] = $subscription->plan_slug;
        $meta['leftover_ends_at'] = $leftoverEnd->toIso8601String();

        $grantingPendingTrialLeftover = $previousStatus === CommunitySubscription::STATUS_PENDING_TRIAL
            && $eligibleTrialDays > 0
            && $leftoverEnd->isFuture()
            && ! $subscription->hasConsumedTrial();

        if ($grantingPendingTrialLeftover && ! filled(data_get($meta, 'trial_started_on_approval'))) {
            $meta['trial_started_on_approval'] = now()->toIso8601String();
        }

        $meta['trial_consumed'] = $subscription->hasConsumedTrial()
            || in_array($previousStatus, [
                CommunitySubscription::STATUS_TRIALING,
                CommunitySubscription::STATUS_ACTIVE,
                CommunitySubscription::STATUS_GRACE,
                CommunitySubscription::STATUS_PAST_DUE,
            ], true)
            || (bool) data_get($meta, 'trial_started_on_approval')
            || $grantingPendingTrialLeftover;

        if ($grantingPendingTrialLeftover && ! filled(data_get($meta, 'trial_consumed_at'))) {
            $meta['trial_consumed_at'] = now()->toIso8601String();
            $meta['trial_consumed_reason'] = 'admin_transition_leftover_trial';
        }

        $subscription->update([
            'status' => $leftoverEnd->isFuture()
                ? CommunitySubscription::STATUS_GRACE
                : CommunitySubscription::STATUS_UNPAID,
            'grace_ends_at' => $leftoverEnd,
            'canceled_at' => null,
            'meta' => $meta,
        ]);

        return $subscription->fresh();
    }

    public function onCommunityAdminReassigned(Community $community, User $newAdmin): void
    {
        $this->refreshGraceIfNeeded($community->id);
        $subscription = $this->getSubscription($community->id);
        if (! $subscription) {
            return;
        }

        $meta = is_array($subscription->meta) ? $subscription->meta : [];
        $meta['replacement_admin_id'] = $newAdmin->id;
        $subscription->update(['meta' => $meta]);

        if (! $this->stripeConfigured() || ! filled($subscription->stripe_customer_id)) {
            return;
        }

        try {
            $params = [
                'name' => $community->name ?: ('Community #'.$community->id),
                'metadata' => [
                    'community_id' => (string) $community->id,
                    'admin_user_id' => (string) $newAdmin->id,
                ],
            ];
            if (filled($newAdmin->email) && ! str_contains((string) $newAdmin->email, '@invited')) {
                $params['email'] = $newAdmin->email;
            } elseif (filled($newAdmin->phone)) {
                $params['phone'] = $newAdmin->phone;
            }
            $this->stripe()->customers->update((string) $subscription->stripe_customer_id, $params);
        } catch (ApiErrorException $e) {
            Log::info('Could not update Stripe customer after admin reassignment', [
                'community_id' => $community->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Replacement admin adds a card (and may choose a plan) after leftover days end.
     * Used by Stripe confirm and by tests with the manual driver.
     */
    public function resumeReplacementBilling(
        Community $community,
        User $admin,
        string $planSlug,
        string $interval = 'month',
    ): CommunitySubscription {
        $this->refreshGraceIfNeeded($community->id);
        $local = $this->getSubscription($community->id);
        if (! $local?->isAdminTransition()) {
            throw new BillingException('This community is not waiting for a replacement card.', 'NOT_IN_ADMIN_TRANSITION');
        }
        $interval = $interval === 'year' ? 'year' : 'month';

        if ($local->hasLeftoverService()) {
            throw new BillingException(
                'Add your card during the leftover period. Paid billing resumes automatically when that period ends.',
                'LEFTOVER_PERIOD_ACTIVE',
            );
        }

        $paymentMethodId = (string) data_get($local->meta, 'payment_method_id', '');
        if ($paymentMethodId === '') {
            throw BillingException::cardRequired();
        }

        return $this->applyReplacementResume(
            $community,
            $local,
            $planSlug,
            $interval,
            $paymentMethodId,
            (string) ($local->stripe_customer_id ?? ''),
        );
    }

    /**
     * Replacement admin saves a card during the leftover grace window.
     * Stripe billing resumes when leftover days end (or immediately if already expired).
     */
    protected function saveReplacementCardDuringTransition(
        Community $community,
        CommunitySubscription $local,
        string $planSlug,
        string $interval,
        string $paymentMethodId,
        string $customerId,
        string $setupIntentId,
    ): CommunitySubscription {
        $plan = $this->assertPlanAvailable($this->plan($planSlug), $local);
        $used = $this->seatsUsed($community->id);
        $newLimit = (int) ($plan['seat_limit'] ?? 0) + (int) $local->extra_seats;
        if ($used > $newLimit) {
            throw BillingException::downgradeBlocked($used, $newLimit);
        }

        $meta = is_array($local->meta) ? $local->meta : [];
        $meta['card_on_file'] = true;
        $meta['payment_method_id'] = $paymentMethodId;
        $meta['intent_id'] = $setupIntentId;
        $meta['intent_type'] = 'setup';
        $meta['replacement_card_saved_at'] = now()->toIso8601String();
        $meta['resumed_plan_slug'] = $planSlug;
        unset($meta['trial_starts_on_approval']);

        $local->update([
            'plan_slug' => $planSlug,
            'billing_interval' => $interval,
            'stripe_customer_id' => $customerId !== '' ? $customerId : $local->stripe_customer_id,
            'stripe_price_id' => $interval === 'year'
                ? ($plan['stripe_price_yearly'] ?? $local->stripe_price_id)
                : ($plan['stripe_price_monthly'] ?? $local->stripe_price_id),
            'meta' => $meta,
        ]);

        $fresh = $local->fresh();
        if (! $fresh->hasLeftoverService()) {
            return $this->applyReplacementResume(
                $community,
                $fresh,
                $planSlug,
                $interval,
                $paymentMethodId,
                $customerId,
            );
        }

        return $fresh;
    }

    protected function applyReplacementResume(
        Community $community,
        CommunitySubscription $local,
        string $planSlug,
        string $interval,
        string $paymentMethodId,
        string $customerId,
    ): CommunitySubscription {
        $plan = $this->assertPlanAvailable($this->plan($planSlug), $local);
        $used = $this->seatsUsed($community->id);
        $newLimit = (int) ($plan['seat_limit'] ?? 0) + (int) $local->extra_seats;
        if ($used > $newLimit) {
            throw BillingException::downgradeBlocked($used, $newLimit);
        }

        $trialDays = $this->eligibleTrialDays($local, $plan);
        $priceId = $interval === 'year'
            ? ($plan['stripe_price_yearly'] ?? $local->stripe_price_id)
            : ($plan['stripe_price_monthly'] ?? $local->stripe_price_id);

        $meta = is_array($local->meta) ? $local->meta : [];
        $meta['card_on_file'] = true;
        $meta['payment_method_id'] = $paymentMethodId;
        $meta['admin_transition'] = false;
        $meta['resumed_at'] = now()->toIso8601String();
        $meta['resumed_plan_slug'] = $planSlug;
        unset($meta['paused_reason'], $meta['trial_starts_on_approval']);

        if ($this->stripeConfigured() && filled($local->stripe_subscription_id)) {
            try {
                $stripe = $this->stripe();
                $stripeSub = $stripe->subscriptions->retrieve($local->stripe_subscription_id);
                $itemId = $stripeSub->items->data[0]->id ?? null;
                $update = [
                    'pause_collection' => '',
                    'default_payment_method' => $paymentMethodId !== '' ? $paymentMethodId : null,
                    'metadata' => [
                        'community_id' => (string) $community->id,
                        'plan_slug' => $planSlug,
                        'billing_interval' => $interval,
                    ],
                ];
                if ($itemId && filled($priceId)) {
                    $update['items'] = [[
                        'id' => $itemId,
                        'price' => $priceId,
                    ]];
                    $update['proration_behavior'] = 'none';
                }
                $updated = $stripe->subscriptions->update($local->stripe_subscription_id, array_filter(
                    $update,
                    fn ($value) => $value !== null,
                ));
                $synced = $this->syncFromStripeSubscription($updated, $community->id, $customerId ?: null);
                $syncedMeta = is_array($synced->meta) ? $synced->meta : [];
                $synced->update([
                    'plan_slug' => $planSlug,
                    'billing_interval' => $interval,
                    'seat_limit' => (int) ($plan['seat_limit'] ?? $synced->seat_limit),
                    'grace_ends_at' => null,
                    'canceled_at' => null,
                    'meta' => array_merge($syncedMeta, $meta, ['card_on_file' => true, 'admin_transition' => false]),
                ]);

                $fresh = $synced->fresh();
                app(SubscriptionCouponService::class)->markApplied($fresh);

                return $fresh;
            } catch (ApiErrorException $e) {
                Log::warning('Could not resume paused Stripe subscription; creating a new one', [
                    'community_id' => $community->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        if (
            $this->stripeConfigured()
            && ! filled($local->stripe_subscription_id)
            && filled($priceId)
            && $customerId !== ''
        ) {
            $local->update([
                'plan_slug' => $planSlug,
                'billing_interval' => $interval,
                'status' => CommunitySubscription::STATUS_PENDING_TRIAL,
                'seat_limit' => (int) ($plan['seat_limit'] ?? $local->seat_limit),
                'stripe_customer_id' => $customerId !== '' ? $customerId : $local->stripe_customer_id,
                'stripe_price_id' => $priceId,
                'stripe_subscription_id' => null,
                'current_period_start' => null,
                'current_period_end' => null,
                'grace_ends_at' => null,
                'canceled_at' => null,
                'meta' => $meta,
            ]);

            $started = $this->startTrialIfEligible($community);

            return $started ?? $local->fresh();
        }

        $periodEnd = $trialDays > 0
            ? now()->addDays($trialDays)
            : ($interval === 'year' ? now()->addYear() : now()->addMonth());

        $local->update([
            'plan_slug' => $planSlug,
            'billing_interval' => $interval,
            'status' => $trialDays > 0
                ? CommunitySubscription::STATUS_TRIALING
                : CommunitySubscription::STATUS_ACTIVE,
            'seat_limit' => (int) ($plan['seat_limit'] ?? $local->seat_limit),
            'stripe_customer_id' => $customerId !== '' ? $customerId : $local->stripe_customer_id,
            'stripe_price_id' => $priceId,
            'current_period_start' => now(),
            'current_period_end' => $periodEnd,
            'grace_ends_at' => null,
            'canceled_at' => null,
            'meta' => $meta,
        ]);

        if ($trialDays > 0) {
            $this->markTrialConsumed($local->fresh(), 'trial_started');
        }

        $fresh = $local->fresh();
        app(SubscriptionCouponService::class)->markApplied($fresh);

        return $fresh;
    }

    protected function detachCustomerPaymentMethods(CommunitySubscription $subscription): void
    {
        if (! $this->stripeConfigured() || ! filled($subscription->stripe_customer_id)) {
            return;
        }

        $stripe = $this->stripe();
        $customerId = (string) $subscription->stripe_customer_id;

        try {
            $methods = $stripe->paymentMethods->all([
                'customer' => $customerId,
                'type' => 'card',
            ]);
            foreach ($methods->data as $method) {
                try {
                    $stripe->paymentMethods->detach($method->id);
                } catch (ApiErrorException) {
                    // Card already detached.
                }
            }
            $stripe->customers->update($customerId, [
                'invoice_settings' => [
                    'default_payment_method' => '',
                ],
            ]);
        } catch (ApiErrorException $e) {
            Log::warning('Could not detach previous admin payment methods', [
                'community_id' => $subscription->community_id,
                'error' => $e->getMessage(),
            ]);
        }

        $setupIntentId = (string) data_get($subscription->meta, 'intent_id', '');
        if (str_starts_with($setupIntentId, 'seti_')) {
            try {
                $stripe->setupIntents->cancel($setupIntentId);
            } catch (ApiErrorException) {
                // Already canceled or consumed.
            }
        }
    }

    protected function pauseStripeCollection(CommunitySubscription $subscription): void
    {
        if (! $this->stripeConfigured() || ! filled($subscription->stripe_subscription_id)) {
            return;
        }

        try {
            $this->stripe()->subscriptions->update($subscription->stripe_subscription_id, [
                'pause_collection' => [
                    'behavior' => 'void',
                ],
            ]);
        } catch (ApiErrorException $e) {
            Log::warning('Could not pause Stripe collection after admin suspend', [
                'community_id' => $subscription->community_id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Immediately cancel a community subscription (platform rejection / hard revoke).
     * Cancels Stripe subscription when present so no future charges occur.
     */
    public function cancelSubscriptionImmediately(int $communityId, string $reason = 'platform_rejected'): void
    {
        $subscription = $this->getSubscription($communityId);
        if (! $subscription) {
            return;
        }

        if ($this->shouldMarkTrialConsumedOnCancel($subscription)) {
            $this->markTrialConsumed($subscription, $reason);
            $subscription = $subscription->fresh();
        }

        if (
            filled($subscription->stripe_subscription_id)
            && $this->stripeConfigured()
            && ! in_array($subscription->status, [CommunitySubscription::STATUS_CANCELED], true)
        ) {
            try {
                $this->stripe()->subscriptions->cancel($subscription->stripe_subscription_id, [
                    'invoice_now' => false,
                    'prorate' => false,
                ]);
            } catch (ApiErrorException $e) {
                Log::warning('Stripe subscription cancel failed on rejection', [
                    'community_id' => $communityId,
                    'stripe_subscription_id' => $subscription->stripe_subscription_id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $setupIntentId = (string) data_get($subscription->meta, 'intent_id', '');
        if (str_starts_with($setupIntentId, 'seti_') && $this->stripeConfigured()) {
            try {
                $this->stripe()->setupIntents->cancel($setupIntentId);
            } catch (ApiErrorException $e) {
                Log::info('SetupIntent cancel skipped on rejection', [
                    'community_id' => $communityId,
                    'setup_intent_id' => $setupIntentId,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $this->detachCustomerPaymentMethods($subscription);

        $meta = is_array($subscription->meta) ? $subscription->meta : [];
        $meta['canceled_reason'] = $reason;
        $meta['canceled_via'] = 'platform_rejection';
        $meta['card_on_file'] = false;
        $meta['admin_transition'] = false;
        unset(
            $meta['payment_method_id'],
            $meta['replacement_admin_id'],
            $meta['replacement_card_saved_at'],
            $meta['resumed_plan_slug'],
            $meta['paused_reason'],
            $meta['paused_at'],
            $meta['previous_status'],
            $meta['inherited_plan_slug'],
        );

        $subscription->update([
            'status' => CommunitySubscription::STATUS_CANCELED,
            'canceled_at' => now(),
            'cancel_at_period_end' => false,
            'grace_ends_at' => null,
            'stripe_subscription_id' => null,
            'current_period_start' => null,
            'current_period_end' => null,
            'meta' => $meta,
        ]);

        $this->releaseExpiredReservations($communityId);
        if ($this->seatReservationsAvailable()) {
            CommunitySeatReservation::query()
                ->where('community_id', $communityId)
                ->where('status', CommunitySeatReservation::STATUS_RESERVED)
                ->update([
                    'status' => CommunitySeatReservation::STATUS_RELEASED,
                    'updated_at' => now(),
                ]);
        }
    }

    /**
     * After a rejected admin is re-approved, require a fresh plan + card checkout.
     * Preserves trial_consumed so no second free trial is granted.
     */
    public function prepareBillingAfterAdminReApproval(int $communityId): void
    {
        $subscription = $this->getSubscription($communityId);
        if (! $subscription || $subscription->status !== CommunitySubscription::STATUS_CANCELED) {
            return;
        }

        $meta = is_array($subscription->meta) ? $subscription->meta : [];
        unset(
            $meta['card_on_file'],
            $meta['payment_method_id'],
            $meta['admin_transition'],
            $meta['replacement_admin_id'],
            $meta['intent_id'],
            $meta['intent_type'],
            $meta['trial_starts_on_approval'],
            $meta['replacement_card_saved_at'],
            $meta['resumed_plan_slug'],
            $meta['paused_reason'],
            $meta['paused_at'],
            $meta['previous_status'],
            $meta['inherited_plan_slug'],
            $meta['canceled_reason'],
            $meta['canceled_via'],
        );
        $meta['rebilling_required'] = true;
        $meta['rebilling_reason'] = 'admin_reapproved';

        $subscription->update([
            'status' => CommunitySubscription::STATUS_UNPAID,
            'stripe_subscription_id' => null,
            'current_period_start' => null,
            'current_period_end' => null,
            'grace_ends_at' => null,
            'canceled_at' => null,
            'cancel_at_period_end' => false,
            'meta' => $meta,
        ]);
    }

    private function seatReservationsAvailable(): bool
    {
        return Schema::hasTable('community_seat_reservations');
    }

    public function ensureStripeCustomer(Community $community, User $admin, ?StripeClient $stripe = null): string
    {
        $stripe ??= $this->stripe();
        $subscription = $this->getSubscription($community->id);
        $existing = $subscription?->stripe_customer_id;
        if (filled($existing)) {
            try {
                $update = [
                    'metadata' => [
                        'community_id' => (string) $community->id,
                        'admin_user_id' => (string) $admin->id,
                    ],
                ];
                if (filled($admin->email) && ! str_contains((string) $admin->email, '@invited')) {
                    $update['email'] = $admin->email;
                }
                $stripe->customers->update((string) $existing, $update);

                return (string) $existing;
            } catch (ApiErrorException $e) {
                if ($e->getStripeCode() !== 'resource_missing') {
                    // Keep the community customer even if the email update fails.
                    return (string) $existing;
                }

                Log::info('Stored Stripe customer is missing in this Stripe mode; creating a new one', [
                    'community_id' => $community->id,
                    'stripe_customer_id' => $existing,
                ]);
            }
        }

        $params = [
            'name' => $community->name ?: ('Community #'.$community->id),
            'metadata' => [
                'community_id' => (string) $community->id,
                'admin_user_id' => (string) $admin->id,
            ],
        ];

        if (filled($admin->email) && ! str_contains((string) $admin->email, '@invited')) {
            $params['email'] = $admin->email;
        } elseif (filled($admin->phone)) {
            $params['phone'] = $admin->phone;
        }

        $customer = $stripe->customers->create($params);

        if ($subscription) {
            $subscription->forceFill([
                'stripe_customer_id' => $customer->id,
            ])->save();
        }

        return $customer->id;
    }

    /**
     * Pull the latest Stripe subscription state (portal cancel, plan change, etc.)
     * when webhooks were missed — common in local dev without stripe listen.
     */
    public function reconcileStripeSubscription(Community $community): void
    {
        if (! $this->stripeConfigured()) {
            return;
        }

        $subscription = $this->getSubscription($community->id);
        if (! $subscription?->stripe_subscription_id) {
            return;
        }

        if ($subscription->status === CommunitySubscription::STATUS_INCOMPLETE) {
            return;
        }

        try {
            $stripeSub = $this->stripe()->subscriptions->retrieve($subscription->stripe_subscription_id);

            if ($subscription->isAdminTransition()) {
                $this->reconcileAdminTransitionLeftover($subscription, $stripeSub);
                $this->refreshGraceIfNeeded($community->id);

                return;
            }

            $this->syncFromStripeSubscription(
                $stripeSub,
                $community->id,
                $subscription->stripe_customer_id,
            );
        } catch (ApiErrorException $e) {
            if ($e->getStripeCode() === 'resource_missing') {
                if ($subscription->isAdminTransition()) {
                    $this->expireAdminTransitionLeftover($subscription);
                    $this->refreshGraceIfNeeded($community->id);

                    return;
                }

                if ($subscription->status !== CommunitySubscription::STATUS_PENDING_TRIAL) {
                    $subscription->update([
                        'status' => CommunitySubscription::STATUS_CANCELED,
                        'canceled_at' => now(),
                        'cancel_at_period_end' => false,
                    ]);
                }

                return;
            }

            Log::info('Stripe subscription reconcile skipped', [
                'community_id' => $community->id,
                'stripe_subscription_id' => $subscription->stripe_subscription_id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Keep replacement-admin leftover windows stable when Stripe changes underneath
     * (trial zeroed, subscription canceled, sync clearing grace_ends_at, etc.).
     */
    public function reconcileAdminTransitionLeftover(
        CommunitySubscription $subscription,
        object|array $stripeSub,
    ): CommunitySubscription {
        $meta = is_array($subscription->meta) ? $subscription->meta : [];

        $leftoverEnd = filled(data_get($meta, 'leftover_ends_at'))
            ? Carbon::parse((string) $meta['leftover_ends_at'])
            : ($subscription->grace_ends_at ?? $subscription->current_period_end ?? now());

        if (! filled(data_get($meta, 'leftover_ends_at'))) {
            $meta['leftover_ends_at'] = $leftoverEnd->toIso8601String();
        }

        $stripeStatus = (string) data_get($stripeSub, 'status', '');
        $canceledAt = data_get($stripeSub, 'canceled_at');
        if ($stripeStatus === 'canceled' && $canceledAt) {
            $cancelTime = Carbon::createFromTimestamp((int) $canceledAt);
            if ($cancelTime->lt($leftoverEnd)) {
                $leftoverEnd = $cancelTime;
                $meta['leftover_ends_at'] = $leftoverEnd->toIso8601String();
                $meta['leftover_ended_early'] = 'stripe_subscription_canceled';
            }
        }

        $subscription->update([
            'grace_ends_at' => $leftoverEnd,
            'status' => $leftoverEnd->isFuture()
                ? CommunitySubscription::STATUS_GRACE
                : CommunitySubscription::STATUS_UNPAID,
            'meta' => $meta,
        ]);

        return $subscription->fresh();
    }

    public function expireAdminTransitionLeftover(CommunitySubscription $subscription): CommunitySubscription
    {
        $meta = is_array($subscription->meta) ? $subscription->meta : [];
        $meta['leftover_ends_at'] = now()->toIso8601String();
        $meta['leftover_ended_early'] = 'stripe_subscription_removed';

        $subscription->update([
            'grace_ends_at' => now(),
            'status' => CommunitySubscription::STATUS_UNPAID,
            'meta' => $meta,
        ]);

        return $subscription->fresh();
    }

    /**
     * If local status is still incomplete, try confirming against Stripe
     * (covers missed return / host mismatch / Payment Element confirm).
     */
    public function reconcileIncompleteCheckout(Community $community): void
    {
        if (! $this->stripeConfigured()) {
            return;
        }

        $subscription = $this->getSubscription($community->id);
        if (! $subscription || ! in_array($subscription->status, [
            CommunitySubscription::STATUS_INCOMPLETE,
            CommunitySubscription::STATUS_PENDING_TRIAL,
        ], true)) {
            return;
        }

        if ($subscription->isPendingTrial()) {
            $this->startTrialIfEligible($community);

            return;
        }

        $sessionId = data_get($subscription->meta, 'checkout_session_id');
        if (filled($sessionId)) {
            try {
                $this->confirmCheckoutSession($community, (string) $sessionId);

                return;
            } catch (\Throwable $e) {
                Log::info('Incomplete checkout reconcile skipped', [
                    'community_id' => $community->id,
                    'session_id' => $sessionId,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        if (filled($subscription->stripe_subscription_id)) {
            try {
                $this->confirmElementsCheckout($community, (string) $subscription->stripe_subscription_id);
            } catch (\Throwable $e) {
                Log::info('Incomplete elements checkout reconcile skipped', [
                    'community_id' => $community->id,
                    'stripe_subscription_id' => $subscription->stripe_subscription_id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $setupIntentId = (string) data_get($subscription->meta, 'intent_id', '');
        if (str_starts_with($setupIntentId, 'seti_')) {
            try {
                $this->confirmElementsCheckout($community, $setupIntentId);
            } catch (\Throwable $e) {
                Log::info('Incomplete setup intent reconcile skipped', [
                    'community_id' => $community->id,
                    'setup_intent_id' => $setupIntentId,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }

    /** Confirm Checkout after browser return (works even before webhook delivery). */
    public function confirmCheckoutSession(Community $community, string $sessionId): CommunitySubscription
    {
        if (! $this->stripeConfigured()) {
            throw BillingException::stripeNotConfigured();
        }

        $session = null;
        $subscriptionId = null;
        $customerId = null;

        // Stripe can briefly return complete session without subscription expanded — retry.
        for ($attempt = 0; $attempt < 6; $attempt++) {
            try {
                $session = $this->stripe()->checkout->sessions->retrieve($sessionId, [
                    'expand' => ['subscription'],
                ]);
            } catch (ApiErrorException $e) {
                throw new BillingException('Unable to confirm payment: '.$e->getMessage(), 'STRIPE_CONFIRM_FAILED', 502);
            }

            $metaCommunity = (int) (data_get($session, 'metadata.community_id') ?: data_get($session, 'client_reference_id'));
            if ($metaCommunity && $metaCommunity !== (int) $community->id) {
                throw new BillingException('Checkout session does not belong to this community.', 'CHECKOUT_MISMATCH', 403);
            }

            $subscriptionId = data_get($session, 'subscription.id') ?: data_get($session, 'subscription');
            $customerId = data_get($session, 'customer');
            $sessionStatus = (string) data_get($session, 'status', '');

            if ($subscriptionId) {
                break;
            }

            if ($sessionStatus === 'open') {
                throw new BillingException(
                    'Checkout is still open. Finish card entry on Stripe, then return here.',
                    'CHECKOUT_STILL_OPEN',
                    409,
                );
            }

            usleep(700000);
        }

        if ($subscriptionId) {
            $stripeSub = is_object(data_get($session, 'subscription')) && data_get($session, 'subscription.id')
                ? data_get($session, 'subscription')
                : null;

            for ($attempt = 0; $attempt < 6; $attempt++) {
                if (! $stripeSub) {
                    $stripeSub = $this->stripe()->subscriptions->retrieve((string) $subscriptionId);
                }

                $status = (string) data_get($stripeSub, 'status', 'incomplete');
                if (in_array($status, ['trialing', 'active', 'past_due'], true)) {
                    return $this->syncFromStripeSubscription(
                        $stripeSub,
                        $community->id,
                        $customerId ? (string) $customerId : null,
                    );
                }

                usleep(700000);
                $stripeSub = $this->stripe()->subscriptions->retrieve((string) $subscriptionId);
            }

            // Last sync even if still incomplete — surface real Stripe status to the UI.
            return $this->syncFromStripeSubscription(
                $stripeSub,
                $community->id,
                $customerId ? (string) $customerId : null,
            );
        }

        // Session completed without a subscription id (rare). Prefer trial activation from metadata
        // over leaving the community stuck on "incomplete".
        if ((string) data_get($session, 'status') === 'complete') {
            $planSlug = (string) data_get($session, 'metadata.plan_slug', 'starter');
            $interval = (string) data_get($session, 'metadata.billing_interval', 'month');

            return $this->activateManualSubscription($community, $planSlug, $interval);
        }

        throw new BillingException(
            'Checkout finished but no subscription was found yet. Wait a moment and refresh billing.',
            'CHECKOUT_NO_SUBSCRIPTION',
            409,
        );
    }

    /**
     * Build Stripe return URLs from the browser origin that started checkout.
     * Falls back to config FRONTEND_ADMIN_URL.
     *
     * @return array{0: string, 1: string} [success, cancel]
     */
    protected function checkoutReturnUrls(?string $returnOrigin): array
    {
        $fallback = rtrim((string) env('FRONTEND_ADMIN_URL', 'http://localhost:3000'), '/');
        $origin = $this->sanitizeReturnOrigin($returnOrigin) ?? $fallback;

        return [
            $origin.'/admin/billing?checkout=success',
            $origin.'/admin/billing?checkout=cancel',
        ];
    }

    protected function assertUsdStripePrice(StripeClient $stripe, string $priceId): void
    {
        try {
            $price = $stripe->prices->retrieve($priceId);
        } catch (ApiErrorException $e) {
            throw new BillingException(
                'Unable to load Stripe price for checkout.',
                'STRIPE_PRICE_INVALID',
                502,
            );
        }

        $expected = strtolower((string) config('billing.currency', 'usd'));
        if (strtolower((string) $price->currency) !== $expected) {
            throw new BillingException(
                'Checkout prices must be configured in USD. Re-run billing:setup-stripe to recreate test prices.',
                'STRIPE_PRICE_CURRENCY',
                502,
            );
        }
    }

    protected function sanitizeReturnOrigin(?string $returnOrigin): ?string
    {
        if (! filled($returnOrigin)) {
            return null;
        }

        $origin = rtrim(trim($returnOrigin), '/');
        $parts = parse_url($origin);
        if (! is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
            return null;
        }

        $scheme = strtolower((string) $parts['scheme']);
        if (! in_array($scheme, ['http', 'https'], true)) {
            return null;
        }

        $host = strtolower((string) $parts['host']);
        $allowed =
            $host === 'localhost'
            || $host === '127.0.0.1'
            || str_ends_with($host, '.localhost')
            || str_ends_with($host, '.gohavena.com')
            || str_ends_with($host, '.havena.app')
            || preg_match('/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/', $host) === 1;

        if (! $allowed) {
            return null;
        }

        $port = isset($parts['port']) ? ':'.$parts['port'] : '';

        return $scheme.'://'.$host.$port;
    }

    public function handleWebhook(string $payload, ?string $signature): void
    {
        $secret = config('billing.stripe.webhook_secret');
        if (filled($secret)) {
            $event = Webhook::constructEvent($payload, (string) $signature, $secret);
        } else {
            $event = json_decode($payload);
            if (! $event) {
                throw new BillingException('Invalid webhook payload.', 'INVALID_WEBHOOK', 400);
            }
        }

        $type = is_array($event) ? ($event['type'] ?? null) : ($event->type ?? null);
        $object = is_array($event)
            ? ($event['data']['object'] ?? [])
            : ($event->data->object ?? null);

        match ($type) {
            'checkout.session.completed' => $this->onCheckoutCompleted($object),
            'customer.subscription.created',
            'customer.subscription.updated' => $this->onSubscriptionUpdated($object),
            'customer.subscription.deleted' => $this->onSubscriptionDeleted($object),
            'invoice.payment_failed' => $this->onPaymentFailed($object),
            'invoice.paid' => $this->onInvoicePaid($object),
            default => null,
        };
    }

    protected function onCheckoutCompleted(object|array $session): void
    {
        $communityId = (int) (data_get($session, 'metadata.community_id') ?: data_get($session, 'client_reference_id'));
        $subscriptionId = data_get($session, 'subscription');
        $customerId = data_get($session, 'customer');

        if (! $communityId || ! $subscriptionId) {
            return;
        }

        if ($this->stripeConfigured()) {
            $stripeSub = $this->stripe()->subscriptions->retrieve($subscriptionId);
            $this->syncFromStripeSubscription($stripeSub, $communityId, $customerId);

            return;
        }

        $planSlug = (string) data_get($session, 'metadata.plan_slug', 'starter');
        $interval = (string) data_get($session, 'metadata.billing_interval', 'month');
        $plan = $this->plan($planSlug) ?? $this->plan('starter');

        CommunitySubscription::query()->updateOrCreate(
            ['community_id' => $communityId],
            [
                'plan_slug' => $planSlug,
                'billing_interval' => $interval,
                'status' => CommunitySubscription::STATUS_ACTIVE,
                'seat_limit' => (int) ($plan['seat_limit'] ?? 50),
                'stripe_customer_id' => $customerId,
                'stripe_subscription_id' => $subscriptionId,
                'current_period_start' => now(),
                'current_period_end' => $interval === 'year' ? now()->addYear() : now()->addMonth(),
                'grace_ends_at' => null,
            ],
        );
    }

    protected function onSubscriptionUpdated(object|array $stripeSub): void
    {
        $communityId = (int) data_get($stripeSub, 'metadata.community_id');
        if (! $communityId) {
            $local = CommunitySubscription::query()
                ->where('stripe_subscription_id', data_get($stripeSub, 'id'))
                ->first();
            $communityId = (int) ($local?->community_id ?? 0);
        }
        if (! $communityId) {
            return;
        }

        $this->syncFromStripeSubscription($stripeSub, $communityId);
    }

    protected function onSubscriptionDeleted(object|array $stripeSub): void
    {
        $local = CommunitySubscription::query()
            ->where('stripe_subscription_id', data_get($stripeSub, 'id'))
            ->first();

        if (! $local) {
            return;
        }

        // Ignore deletion of the premature checkout subscription deferred until approval.
        if ($local->status === CommunitySubscription::STATUS_PENDING_TRIAL) {
            return;
        }

        $local->update([
            'status' => CommunitySubscription::STATUS_CANCELED,
            'canceled_at' => now(),
            'cancel_at_period_end' => false,
        ]);
    }

    protected function onPaymentFailed(object|array $invoice): void
    {
        $subscriptionId = data_get($invoice, 'subscription');
        if (! $subscriptionId) {
            return;
        }

        $local = CommunitySubscription::query()
            ->where('stripe_subscription_id', $subscriptionId)
            ->first();

        if (! $local) {
            return;
        }

        $graceDays = (int) config('billing.grace_days', 7);
        $local->update([
            'status' => CommunitySubscription::STATUS_GRACE,
            'grace_ends_at' => now()->addDays($graceDays),
        ]);
    }

    protected function onInvoicePaid(object|array $invoice): void
    {
        $subscriptionId = data_get($invoice, 'subscription');
        if (! $subscriptionId || ! $this->stripeConfigured()) {
            return;
        }

        $stripeSub = $this->stripe()->subscriptions->retrieve($subscriptionId);
        $communityId = (int) data_get($stripeSub, 'metadata.community_id');
        $local = CommunitySubscription::query()->where('stripe_subscription_id', $subscriptionId)->first();
        $communityId = $communityId ?: (int) ($local?->community_id ?? 0);
        if ($communityId) {
            $this->syncFromStripeSubscription($stripeSub, $communityId);
        }

        app(\App\Services\ReferralService::class)->handleInvoicePaid($invoice);
    }

    public function syncFromStripeSubscription(object|array $stripeSub, int $communityId, ?string $customerId = null): CommunitySubscription
    {
        $status = (string) data_get($stripeSub, 'status', 'incomplete');
        $mapped = match ($status) {
            'active' => CommunitySubscription::STATUS_ACTIVE,
            'trialing' => CommunitySubscription::STATUS_TRIALING,
            'past_due' => CommunitySubscription::STATUS_PAST_DUE,
            'unpaid' => CommunitySubscription::STATUS_UNPAID,
            'canceled' => CommunitySubscription::STATUS_CANCELED,
            'incomplete', 'incomplete_expired' => CommunitySubscription::STATUS_INCOMPLETE,
            default => $status,
        };

        $hasCard = $this->stripeObjectHasCard($stripeSub);
        if (! $hasCard && in_array($mapped, [
            CommunitySubscription::STATUS_TRIALING,
            CommunitySubscription::STATUS_ACTIVE,
        ], true)) {
            $mapped = CommunitySubscription::STATUS_INCOMPLETE;
        }

        $planSlug = (string) data_get($stripeSub, 'metadata.plan_slug', '');
        $interval = (string) data_get($stripeSub, 'metadata.billing_interval', 'month');
        $priceId = data_get($stripeSub, 'items.data.0.price.id');

        if ($planSlug === '') {
            $planSlug = $this->resolvePlanSlugFromPriceId($priceId) ?? 'starter';
        }

        $plan = $this->plan($planSlug) ?? [];
        $existing = $this->getSubscription($communityId);

        if ($existing?->isAdminTransition()) {
            return $this->reconcileAdminTransitionLeftover($existing, $stripeSub);
        }

        $seatLimit = (int) ($plan['seat_limit'] ?? 50);
        if ($existing && $existing->plan_slug === $planSlug && (int) $existing->seat_limit > 0) {
            $seatLimit = (int) $existing->seat_limit;
        }
        $periodStart = data_get($stripeSub, 'current_period_start');
        $periodEnd = data_get($stripeSub, 'current_period_end');

        $graceEndsAt = null;
        if ($mapped === CommunitySubscription::STATUS_PAST_DUE) {
            $graceEndsAt = now()->addDays((int) config('billing.grace_days', 7));
            $mapped = CommunitySubscription::STATUS_GRACE;
        }

        $meta = is_array($existing?->meta) ? $existing->meta : [];
        $meta['card_on_file'] = $hasCard;

        if (in_array($mapped, [CommunitySubscription::STATUS_TRIALING, CommunitySubscription::STATUS_ACTIVE], true)) {
            unset($meta['ignore_subscription_deleted']);
        }

        if ($existing?->hasConsumedTrial() && $mapped === CommunitySubscription::STATUS_TRIALING) {
            $trialEndTs = data_get($stripeSub, 'trial_end');
            $trialStillRunning = is_numeric($trialEndTs)
                && \Illuminate\Support\Carbon::createFromTimestamp((int) $trialEndTs)->isFuture();

            // Keep a live Stripe trial as trialing. Only collapse to active when Stripe
            // reports trialing without a future trial_end (stale / duplicate trial attempt).
            if (! $trialStillRunning) {
                Log::warning('Stripe returned trialing for a community that already consumed its trial; treating as active', [
                    'community_id' => $communityId,
                    'stripe_subscription_id' => data_get($stripeSub, 'id'),
                ]);
                $mapped = CommunitySubscription::STATUS_ACTIVE;
            }
        }

        return CommunitySubscription::query()->updateOrCreate(
            ['community_id' => $communityId],
            [
                'plan_slug' => $planSlug,
                'billing_interval' => $interval === 'year' ? 'year' : 'month',
                'status' => $mapped,
                'seat_limit' => $seatLimit,
                'stripe_customer_id' => $customerId ?: data_get($stripeSub, 'customer'),
                'stripe_subscription_id' => data_get($stripeSub, 'id'),
                'stripe_price_id' => $priceId,
                'current_period_start' => $periodStart ? Carbon::createFromTimestamp($periodStart) : null,
                'current_period_end' => $periodEnd ? Carbon::createFromTimestamp($periodEnd) : null,
                'cancel_at_period_end' => (bool) data_get($stripeSub, 'cancel_at_period_end', false),
                'grace_ends_at' => $mapped === CommunitySubscription::STATUS_GRACE ? $graceEndsAt : null,
                'canceled_at' => $mapped === CommunitySubscription::STATUS_CANCELED ? now() : null,
                'meta' => $meta,
            ],
        );
    }

    /** Stripe trial/active without a default card must not unlock Havena. */
    public function stripeObjectHasCard(object|array $stripeSub): bool
    {
        return filled(data_get($stripeSub, 'default_payment_method'))
            || filled(data_get($stripeSub, 'default_source'));
    }

    protected function resolvePlanSlugFromPriceId(?string $priceId): ?string
    {
        if (! filled($priceId)) {
            return null;
        }

        foreach ($this->plans() as $slug => $plan) {
            if (($plan['stripe_price_monthly'] ?? null) === $priceId
                || ($plan['stripe_price_yearly'] ?? null) === $priceId) {
                return $slug;
            }
        }

        if (Schema::hasTable('subscription_plan_prices')) {
            $historic = SubscriptionPlanPrice::query()
                ->where('stripe_price_id', $priceId)
                ->with('plan:id,slug')
                ->first();
            if ($historic?->plan?->slug) {
                return $historic->plan->slug;
            }
        }

        return null;
    }
}
