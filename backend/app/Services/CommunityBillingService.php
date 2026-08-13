<?php

namespace App\Services;

use App\Exceptions\BillingException;
use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySeatReservation;
use App\Models\CommunitySubscription;
use App\Models\InviteCode;
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
        $plans = config('billing.plans', []);
        uasort($plans, fn ($a, $b) => ($a['sort'] ?? 99) <=> ($b['sort'] ?? 99));

        return $plans;
    }

    public function plan(string $slug): ?array
    {
        $plan = config("billing.plans.{$slug}");

        return is_array($plan) ? array_merge(['slug' => $slug], $plan) : null;
    }

    public function recommendPlanSlug(?int $estimatedResidents): string
    {
        $count = max(0, (int) $estimatedResidents);
        foreach ($this->plans() as $slug => $plan) {
            if ($count <= (int) $plan['seat_limit']) {
                return $slug;
            }
        }

        return array_key_last($this->plans()) ?: 'campus';
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

        foreach ($this->plans() as $slug => $plan) {
            $items[] = [
                'slug' => $slug,
                'name' => $plan['name'],
                'description' => $plan['description'] ?? '',
                'seat_limit' => (int) $plan['seat_limit'],
                'price_monthly_cents' => (int) ($plan['price_monthly_cents'] ?? 0),
                'price_yearly_cents' => (int) ($plan['price_yearly_cents'] ?? 0),
                'currency' => config('billing.currency', 'usd'),
                'recommended' => $slug === $recommended,
                'has_stripe_prices' => filled($plan['stripe_price_monthly'] ?? null) || filled($plan['stripe_price_yearly'] ?? null),
            ];
        }

        return $items;
    }

    public function billingPayload(Community $community): array
    {
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
        $plan = $this->plan($planSlug);
        if (! $plan) {
            throw new BillingException('Invalid plan selected.', 'INVALID_PLAN');
        }

        $interval = $interval === 'year' ? 'year' : 'month';
        $priceId = $interval === 'year'
            ? ($plan['stripe_price_yearly'] ?? null)
            : ($plan['stripe_price_monthly'] ?? null);

        if ($this->driver() === 'manual' || ! $this->stripeConfigured() || ! filled($priceId)) {
            if ($this->driver() !== 'manual' && app()->environment('production')) {
                throw BillingException::stripeNotConfigured();
            }

            // Local/manual path: activate immediately without Stripe.
            $subscription = $this->activateManualSubscription($community, $planSlug, $interval, $admin);

            return [
                'mode' => 'manual',
                'checkout_url' => null,
                'subscription' => $subscription,
                'message' => '30-day free trial started (local billing driver).',
            ];
        }

        $stripe = $this->stripe();
        $customerId = $this->ensureStripeCustomer($community, $admin, $stripe);
        $this->assertUsdStripePrice($stripe, (string) $priceId);

        [$successUrl, $cancelUrl] = $this->checkoutReturnUrls($returnOrigin);
        $successUrl .= str_contains($successUrl, '?') ? '&' : '?';
        $successUrl .= 'session_id={CHECKOUT_SESSION_ID}';

        $trialDays = (int) config('billing.trial_period_days', 30);
        $planLabel = (string) ($plan['name'] ?? ucfirst($planSlug));
        $intervalLabel = $interval === 'year' ? 'yearly' : 'monthly';

        $payload = [
            'mode' => 'subscription',
            'customer' => $customerId,
            'client_reference_id' => (string) $community->id,
            'line_items' => [[
                'price' => $priceId,
                'quantity' => 1,
            ]],
            'success_url' => $successUrl,
            'cancel_url' => $cancelUrl,
            'locale' => config('billing.checkout.locale', 'en'),
            'billing_address_collection' => 'required',
            'allow_promotion_codes' => (bool) config('billing.checkout.allow_promotion_codes', false),
            'metadata' => [
                'community_id' => (string) $community->id,
                'plan_slug' => $planSlug,
                'billing_interval' => $interval,
                'admin_user_id' => (string) $admin->id,
            ],
            'subscription_data' => [
                'description' => sprintf(
                    'Havena %s (%s) — %d-day free trial, billed in USD after trial',
                    $planLabel,
                    $intervalLabel,
                    $trialDays,
                ),
                'metadata' => [
                    'community_id' => (string) $community->id,
                    'plan_slug' => $planSlug,
                    'billing_interval' => $interval,
                ],
            ],
            // Card only, USD list prices (disable local currency selector).
            'adaptive_pricing' => ['enabled' => false],
            'payment_method_collection' => 'always',
            'wallet_options' => [
                'link' => ['display' => 'never'],
            ],
            'custom_text' => [
                'submit' => [
                    'message' => sprintf(
                        'Start free trial — $0 due today · USD billing after %d days',
                        $trialDays,
                    ),
                ],
                'after_submit' => [
                    'message' => sprintf(
                        'Your card is saved securely by Stripe. You will not be charged for the first %d days. Cancel anytime before billing starts.',
                        $trialDays,
                    ),
                ],
            ],
            'customer_update' => [
                'address' => 'auto',
                'name' => 'auto',
            ],
        ];

        $pmcId = trim((string) config('billing.checkout.payment_method_configuration', ''));
        if ($pmcId !== '') {
            $payload['payment_method_configuration'] = $pmcId;
        } else {
            $payload['payment_method_types'] = ['card'];
        }

        if ($trialDays > 0) {
            $payload['subscription_data']['trial_period_days'] = $trialDays;
            $payload['subscription_data']['trial_settings'] = [
                'end_behavior' => [
                    'missing_payment_method' => 'cancel',
                ],
            ];
        }

        try {
            $session = $stripe->checkout->sessions->create($payload);
        } catch (ApiErrorException $e) {
            Log::error('Stripe checkout session failed', [
                'error' => $e->getMessage(),
                'community_id' => $community->id,
                'plan_slug' => $planSlug,
                'price_id' => $priceId,
            ]);
            throw new BillingException(
                'Unable to start checkout: '.$e->getMessage(),
                'STRIPE_CHECKOUT_FAILED',
                502,
            );
        }

        CommunitySubscription::query()->updateOrCreate(
            ['community_id' => $community->id],
            [
                'plan_slug' => $planSlug,
                'billing_interval' => $interval,
                'status' => CommunitySubscription::STATUS_INCOMPLETE,
                'seat_limit' => (int) $plan['seat_limit'],
                'estimated_residents' => $community->estimated_residents,
                'stripe_customer_id' => $customerId,
                'stripe_price_id' => $priceId,
                'meta' => [
                    'checkout_session_id' => $session->id,
                    'initiated_by' => $admin->id,
                ],
            ],
        );

        return [
            'mode' => 'stripe',
            'checkout_url' => $session->url,
            'session_id' => $session->id,
        ];
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
        $plan = $this->plan($planSlug);
        if (! $plan) {
            throw new BillingException('Invalid plan selected.', 'INVALID_PLAN');
        }

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
        $plan = $this->plan($planSlug);
        if (! $plan) {
            throw new BillingException('Invalid plan selected.', 'INVALID_PLAN');
        }

        $interval = $interval === 'year' ? 'year' : 'month';
        $trialDays = (int) config('billing.trial_period_days', 30);
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
     * If local status is still incomplete but we have a Checkout session id,
     * try confirming against Stripe (covers missed return / host mismatch).
     */
    public function reconcileIncompleteCheckout(Community $community): void
    {
        if (! $this->stripeConfigured()) {
            return;
        }

        $subscription = $this->getSubscription($community->id);
        if (! $subscription || $subscription->status !== CommunitySubscription::STATUS_INCOMPLETE) {
            return;
        }

        $sessionId = data_get($subscription->meta, 'checkout_session_id');
        if (! filled($sessionId)) {
            return;
        }

        try {
            $this->confirmCheckoutSession($community, (string) $sessionId);
        } catch (\Throwable $e) {
            Log::info('Incomplete checkout reconcile skipped', [
                'community_id' => $community->id,
                'session_id' => $sessionId,
                'error' => $e->getMessage(),
            ]);
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

        $planSlug = (string) data_get($stripeSub, 'metadata.plan_slug', '');
        $interval = (string) data_get($stripeSub, 'metadata.billing_interval', 'month');
        $priceId = data_get($stripeSub, 'items.data.0.price.id');

        if ($planSlug === '') {
            $planSlug = $this->resolvePlanSlugFromPriceId($priceId) ?? 'starter';
        }

        $plan = $this->plan($planSlug);
        $periodStart = data_get($stripeSub, 'current_period_start');
        $periodEnd = data_get($stripeSub, 'current_period_end');

        $graceEndsAt = null;
        if ($mapped === CommunitySubscription::STATUS_PAST_DUE) {
            $graceEndsAt = now()->addDays((int) config('billing.grace_days', 7));
            $mapped = CommunitySubscription::STATUS_GRACE;
        }

        return CommunitySubscription::query()->updateOrCreate(
            ['community_id' => $communityId],
            [
                'plan_slug' => $planSlug,
                'billing_interval' => $interval === 'year' ? 'year' : 'month',
                'status' => $mapped,
                'seat_limit' => (int) ($plan['seat_limit'] ?? 50),
                'stripe_customer_id' => $customerId ?: data_get($stripeSub, 'customer'),
                'stripe_subscription_id' => data_get($stripeSub, 'id'),
                'stripe_price_id' => $priceId,
                'current_period_start' => $periodStart ? Carbon::createFromTimestamp($periodStart) : null,
                'current_period_end' => $periodEnd ? Carbon::createFromTimestamp($periodEnd) : null,
                'cancel_at_period_end' => (bool) data_get($stripeSub, 'cancel_at_period_end', false),
                'grace_ends_at' => $mapped === CommunitySubscription::STATUS_GRACE ? $graceEndsAt : null,
                'canceled_at' => $mapped === CommunitySubscription::STATUS_CANCELED ? now() : null,
            ],
        );
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

        return null;
    }
}
