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

    public function assertPlanAvailable(?array $plan): array
    {
        if (! $plan) {
            throw new BillingException('Invalid plan selected.', 'INVALID_PLAN');
        }

        if (! ($plan['is_active'] ?? true)) {
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
        $subscription = $this->getSubscription($communityId);
        $used = $this->seatsUsed($communityId);
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
        ];
    }

    public function assertCanAllocateSeat(int $communityId, int $seatsNeeded = 1): void
    {
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
            $subscription->update([
                'status' => CommunitySubscription::STATUS_UNPAID,
            ]);
        }
    }

    public function formattedPlans(?int $estimatedResidents = null): array
    {
        $recommended = $this->recommendPlanSlug($estimatedResidents);
        $items = [];

        foreach ($this->activePlans() as $slug => $plan) {
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
        $this->startTrialIfEligible($community);
        $subscription = $this->getSubscription($community->id);
        $summary = $this->seatSummary($community->id);
        $estimated = $community->estimated_residents
            ?? $subscription?->estimated_residents;

        return [
            'community' => [
                'id' => $community->id,
                'name' => $community->name,
                'status' => $community->status,
                'review_status' => $community->review_status,
                'estimated_residents' => $estimated,
                'is_active_for_residents' => $community->isActiveForResidents(),
            ],
            'plans' => $this->formattedPlans($estimated !== null ? (int) $estimated : null),
            'recommended_plan' => $this->recommendPlanSlug($estimated !== null ? (int) $estimated : null),
            'trial_period_days' => $this->trialDaysForPlan(
                $this->plan($this->recommendPlanSlug($estimated !== null ? (int) $estimated : null))
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
            ] : null,
            'seats' => $summary,
            'billing' => [
                'enabled' => $this->enabled(),
                'enforce' => $this->enforce(),
                'driver' => $this->driver(),
                'stripe_configured' => $this->stripeConfigured(),
                'publishable_key' => config('billing.stripe.publishable'),
            ],
            'setup' => [
                'community_details_complete' => filled($community->name) && filled($community->address ?? $community->description),
                'community_approved' => $community->review_status === null || $community->review_status === 'approved',
                'subscription_active' => $summary['allows_allocation'],
                'card_on_file' => $subscription?->hasCardOnFile() ?? false,
                'trial_pending_approval' => $subscription?->isPendingTrial() ?? false,
                'can_invite_residents' => $summary['allows_allocation'] && $summary['seats_available'] > 0
                    && ($community->review_status === null || $community->review_status === 'approved'),
            ],
        ];
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
        $plan = $this->assertPlanAvailable($this->plan($planSlug));

        $interval = $interval === 'year' ? 'year' : 'month';
        $priceId = $interval === 'year'
            ? ($plan['stripe_price_yearly'] ?? null)
            : ($plan['stripe_price_monthly'] ?? null);

        if (! $this->stripeConfigured()) {
            throw BillingException::stripeNotConfigured();
        }

        if (! filled($priceId)) {
            throw BillingException::stripePriceMissing();
        }

        $stripe = $this->stripe();
        $customerId = $this->ensureStripeCustomer($community, $admin, $stripe);
        $this->assertUsdStripePrice($stripe, (string) $priceId);

        $trialDays = $this->trialDaysForPlan($plan);
        $priceCents = $interval === 'year'
            ? (int) ($plan['price_yearly_cents'] ?? 0)
            : (int) ($plan['price_monthly_cents'] ?? 0);

        $existing = $this->getSubscription($community->id);
        if ($existing?->grantsPaidAccess()) {
            return [
                'mode' => 'already_active',
                'checkout_url' => null,
                'message' => '30-day free trial is already active.',
            ];
        }

        if ($existing?->isPendingTrial()) {
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

        $intentId = (string) data_get($existing?->meta, 'intent_id', '');
        if (
            $existing?->status === CommunitySubscription::STATUS_INCOMPLETE
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
        CommunitySubscription::query()->updateOrCreate(
            ['community_id' => $community->id],
            [
                'plan_slug' => $planSlug,
                'billing_interval' => $interval,
                'status' => CommunitySubscription::STATUS_INCOMPLETE,
                'seat_limit' => (int) ($plan['seat_limit'] ?? 0),
                'estimated_residents' => $community->estimated_residents,
                'stripe_customer_id' => $customerId,
                'stripe_subscription_id' => str_starts_with($stripeSubscriptionId, 'sub_') ? $stripeSubscriptionId : null,
                'stripe_price_id' => $priceId,
                'meta' => [
                    'intent_type' => $intent['type'],
                    'intent_id' => $intent['id'],
                    'initiated_by' => $admin->id,
                    'checkout_ui' => 'elements',
                    'trial_starts_on_approval' => true,
                ],
            ],
        );

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

        return [
            'mode' => 'elements',
            'client_secret' => $intent['client_secret'],
            'intent_type' => $intent['type'],
            'stripe_subscription_id' => $stripeSubscriptionId,
            'stripe_setup_intent_id' => $intent['type'] === 'setup' ? $intent['id'] : null,
            'trial_starts_on_approval' => true,
            'publishable_key' => config('billing.stripe.publishable'),
            'trial_days' => $trialDays,
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
     * Create the Stripe subscription + 30-day trial only after the community and admin are approved.
     */
    public function startTrialIfEligible(Community $community): ?CommunitySubscription
    {
        $subscription = $this->getSubscription($community->id);
        if (! $subscription?->hasCardOnFile()) {
            return $subscription;
        }

        if ($subscription->grantsPaidAccess()) {
            return $subscription;
        }

        if (! $this->isCommunityApprovedForTrial($community)) {
            return $subscription;
        }

        $plan = $this->plan($subscription->plan_slug) ?? [];
        $trialDays = $this->trialDaysForPlan($plan);
        $interval = $subscription->billing_interval === 'year' ? 'year' : 'month';
        $priceId = $interval === 'year'
            ? ($plan['stripe_price_yearly'] ?? $subscription->stripe_price_id)
            : ($plan['stripe_price_monthly'] ?? $subscription->stripe_price_id);

        if (! $this->stripeConfigured()) {
            $meta = is_array($subscription->meta) ? $subscription->meta : [];
            $meta['trial_started_on_approval'] = now()->toIso8601String();

            $subscription->update([
                'status' => $trialDays > 0
                    ? CommunitySubscription::STATUS_TRIALING
                    : CommunitySubscription::STATUS_ACTIVE,
                'current_period_start' => now(),
                'current_period_end' => now()->addDays($trialDays > 0 ? $trialDays : 30),
                'canceled_at' => null,
                'meta' => $meta,
            ]);

            return $subscription->fresh();
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
            Log::warning('Cannot start trial after approval — missing Stripe customer, card, or price', [
                'community_id' => $community->id,
                'has_customer' => $customerId !== '',
                'has_payment_method' => $paymentMethodId !== '',
                'has_price' => filled($priceId),
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

        try {
            $stripeSub = $this->stripe()->subscriptions->create($createParams);
        } catch (ApiErrorException $e) {
            Log::error('Failed to start Stripe trial after approval', [
                'community_id' => $community->id,
                'error' => $e->getMessage(),
            ]);

            return $subscription;
        }

        $synced = $this->syncFromStripeSubscription($stripeSub, $community->id, $customerId);
        $meta = is_array($synced->meta) ? $synced->meta : [];
        $meta['card_on_file'] = true;
        $meta['payment_method_id'] = $paymentMethodId;
        $meta['trial_started_on_approval'] = now()->toIso8601String();
        $synced->update(['meta' => $meta]);

        return $synced->fresh();
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
        $plan = $this->assertPlanAvailable($this->plan($planSlug));

        $subscription = $this->getSubscription($community->id);
        if (! $subscription || ! $subscription->allowsSeatAllocation()) {
            throw BillingException::subscriptionRequired();
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
        $trialDays = $this->trialDaysForPlan($plan);
        $isTrial = $trialDays > 0;
        $periodEnd = $isTrial
            ? now()->addDays($trialDays)
            : ($interval === 'year' ? now()->addYear() : now()->addMonth());

        return CommunitySubscription::query()->updateOrCreate(
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
                'meta' => [
                    'activated_via' => 'manual',
                    'activated_by' => $actor?->id,
                    'trial_days' => $isTrial ? $trialDays : 0,
                ],
            ],
        );
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
     * Immediately cancel a community subscription (platform rejection / hard revoke).
     * Cancels Stripe subscription when present so no future charges occur.
     */
    public function cancelSubscriptionImmediately(int $communityId, string $reason = 'platform_rejected'): void
    {
        $subscription = $this->getSubscription($communityId);
        if (! $subscription) {
            return;
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

        $meta = is_array($subscription->meta) ? $subscription->meta : [];
        $meta['canceled_reason'] = $reason;
        $meta['canceled_via'] = 'platform_rejection';

        $subscription->update([
            'status' => CommunitySubscription::STATUS_CANCELED,
            'canceled_at' => now(),
            'cancel_at_period_end' => false,
            'grace_ends_at' => null,
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

    private function seatReservationsAvailable(): bool
    {
        return Schema::hasTable('community_seat_reservations');
    }

    public function ensureStripeCustomer(Community $community, User $admin, ?StripeClient $stripe = null): string
    {
        $stripe ??= $this->stripe();
        $existing = $this->getSubscription($community->id)?->stripe_customer_id;
        if ($existing) {
            return $existing;
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

        return $customer->id;
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

        if ($local->status === CommunitySubscription::STATUS_PENDING_TRIAL
            || data_get($local->meta, 'ignore_subscription_deleted')
        ) {
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
