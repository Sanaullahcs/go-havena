<?php

namespace App\Services;

use App\Exceptions\BillingException;
use App\Models\CommunitySubscription;
use App\Models\SubscriptionPlan;
use App\Models\SubscriptionPlanPrice;
use Illuminate\Support\Str;
use Stripe\Exception\ApiErrorException;

class SubscriptionPlanAdminService
{
    public function __construct(private readonly CommunityBillingService $billing)
    {
    }

    /** @return array<string, mixed> */
    public function transform(SubscriptionPlan $plan): array
    {
        return [
            'id' => $plan->id,
            'slug' => $plan->slug,
            'name' => $plan->name,
            'description' => $plan->description,
            'seat_limit' => (int) $plan->seat_limit,
            'price_monthly_cents' => (int) $plan->price_monthly_cents,
            'price_yearly_cents' => (int) $plan->price_yearly_cents,
            'trial_period_days' => (int) $plan->trial_period_days,
            'stripe_product_id' => $plan->stripe_product_id,
            'stripe_price_monthly' => $plan->stripe_price_monthly,
            'stripe_price_yearly' => $plan->stripe_price_yearly,
            'is_active' => (bool) $plan->is_active,
            'is_recommended' => (bool) $plan->is_recommended,
            'sort_order' => (int) $plan->sort_order,
            'has_stripe_prices' => filled($plan->stripe_price_monthly) || filled($plan->stripe_price_yearly),
            'subscriber_count' => $this->subscriberCount($plan->slug),
            'currency' => (string) config('billing.currency', 'usd'),
            'created_at' => $plan->created_at?->toIso8601String(),
            'updated_at' => $plan->updated_at?->toIso8601String(),
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): SubscriptionPlan
    {
        if (! empty($data['is_recommended'])) {
            SubscriptionPlan::query()->update(['is_recommended' => false]);
        }

        $plan = new SubscriptionPlan([
            'slug' => $this->uniqueSlug((string) ($data['slug'] ?? $data['name'])),
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'seat_limit' => (int) $data['seat_limit'],
            'price_monthly_cents' => (int) $data['price_monthly_cents'],
            'price_yearly_cents' => (int) $data['price_yearly_cents'],
            'trial_period_days' => (int) ($data['trial_period_days'] ?? config('billing.trial_period_days', 30)),
            'is_active' => array_key_exists('is_active', $data) ? (bool) $data['is_active'] : true,
            'is_recommended' => (bool) ($data['is_recommended'] ?? false),
            'sort_order' => (int) ($data['sort_order'] ?? ((int) SubscriptionPlan::query()->max('sort_order') + 1)),
        ]);

        $this->syncStripeCatalog($plan, rotateMonthly: true, rotateYearly: true);
        $plan->save();
        $this->recordCurrentPrices($plan);

        return $plan->fresh();
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(SubscriptionPlan $plan, array $data): SubscriptionPlan
    {
        $rotateMonthly = array_key_exists('price_monthly_cents', $data)
            && (int) $data['price_monthly_cents'] !== (int) $plan->price_monthly_cents;
        $rotateYearly = array_key_exists('price_yearly_cents', $data)
            && (int) $data['price_yearly_cents'] !== (int) $plan->price_yearly_cents;

        if (! empty($data['is_recommended']) && ! $plan->is_recommended) {
            SubscriptionPlan::query()->where('id', '!=', $plan->id)->update(['is_recommended' => false]);
        }

        $plan->fill([
            'name' => $data['name'] ?? $plan->name,
            'description' => array_key_exists('description', $data) ? $data['description'] : $plan->description,
            'seat_limit' => array_key_exists('seat_limit', $data) ? (int) $data['seat_limit'] : $plan->seat_limit,
            'price_monthly_cents' => array_key_exists('price_monthly_cents', $data)
                ? (int) $data['price_monthly_cents']
                : $plan->price_monthly_cents,
            'price_yearly_cents' => array_key_exists('price_yearly_cents', $data)
                ? (int) $data['price_yearly_cents']
                : $plan->price_yearly_cents,
            'trial_period_days' => array_key_exists('trial_period_days', $data)
                ? (int) $data['trial_period_days']
                : $plan->trial_period_days,
            'is_active' => array_key_exists('is_active', $data) ? (bool) $data['is_active'] : $plan->is_active,
            'is_recommended' => array_key_exists('is_recommended', $data)
                ? (bool) $data['is_recommended']
                : $plan->is_recommended,
            'sort_order' => array_key_exists('sort_order', $data) ? (int) $data['sort_order'] : $plan->sort_order,
        ]);

        $beforeMonthly = $plan->stripe_price_monthly;
        $beforeYearly = $plan->stripe_price_yearly;
        $this->syncStripeCatalog($plan, $rotateMonthly, $rotateYearly);
        $plan->save();
        $this->recordCurrentPrices(
            $plan,
            $rotateMonthly || $plan->stripe_price_monthly !== $beforeMonthly,
            $rotateYearly || $plan->stripe_price_yearly !== $beforeYearly,
        );

        return $plan->fresh();
    }

    public function setActive(SubscriptionPlan $plan, bool $active): SubscriptionPlan
    {
        $plan->is_active = $active;
        $this->syncStripeProductActive($plan);
        $plan->save();

        return $plan->fresh();
    }

    /**
     * Create Stripe product/price IDs when the plan row is missing them (e.g. after migrate or slug rename).
     */
    public function ensureMissingStripePrices(SubscriptionPlan $plan): SubscriptionPlan
    {
        if (! $this->billing->stripeConfigured()) {
            return $plan;
        }

        if (filled($plan->stripe_price_monthly) && filled($plan->stripe_price_yearly)) {
            return $plan;
        }

        $beforeMonthly = $plan->stripe_price_monthly;
        $beforeYearly = $plan->stripe_price_yearly;

        $this->syncStripeCatalog($plan, rotateMonthly: false, rotateYearly: false);

        $plan->save();
        $this->recordCurrentPrices(
            $plan,
            ! filled($beforeMonthly) && filled($plan->stripe_price_monthly),
            ! filled($beforeYearly) && filled($plan->stripe_price_yearly),
        );

        return $plan->fresh();
    }

    protected function subscriberCount(string $slug): int
    {
        return CommunitySubscription::query()
            ->where('plan_slug', $slug)
            ->whereIn('status', [
                CommunitySubscription::STATUS_ACTIVE,
                CommunitySubscription::STATUS_TRIALING,
                CommunitySubscription::STATUS_GRACE,
                CommunitySubscription::STATUS_PAST_DUE,
                CommunitySubscription::STATUS_INCOMPLETE,
            ])
            ->count();
    }

    protected function uniqueSlug(string $source): string
    {
        $base = Str::slug($source) ?: 'plan';
        $base = Str::limit($base, 40, '');
        $slug = $base;
        $i = 2;
        while (SubscriptionPlan::query()->where('slug', $slug)->exists()) {
            $slug = $base.'-'.$i;
            $i++;
        }

        return $slug;
    }

    protected function syncStripeCatalog(SubscriptionPlan $plan, bool $rotateMonthly, bool $rotateYearly): void
    {
        if (! $this->billing->stripeConfigured()) {
            return;
        }

        $stripe = $this->billing->stripe();
        $currency = strtolower((string) config('billing.currency', 'usd'));
        $needsMonthly = $rotateMonthly || ! filled($plan->stripe_price_monthly);
        $needsYearly = $rotateYearly || ! filled($plan->stripe_price_yearly);

        try {
            if (! filled($plan->stripe_product_id) && filled($plan->stripe_price_monthly)) {
                try {
                    $existingPrice = $stripe->prices->retrieve((string) $plan->stripe_price_monthly);
                    $productId = $existingPrice->product;
                    if (is_object($productId)) {
                        $productId = data_get($productId, 'id');
                    }
                    if (filled($productId)) {
                        $plan->stripe_product_id = (string) $productId;
                    }
                } catch (ApiErrorException) {
                    // Fall through and create a new product.
                }
            }

            if (! filled($plan->stripe_product_id)) {
                $product = $stripe->products->create($this->productPayload($plan));
                $plan->stripe_product_id = (string) $product->id;
            } else {
                $stripe->products->update((string) $plan->stripe_product_id, $this->productPayload($plan, includeActive: true));
            }

            if ($needsMonthly) {
                $previous = $plan->stripe_price_monthly;
                $monthly = $stripe->prices->create([
                    'product' => $plan->stripe_product_id,
                    'unit_amount' => (int) $plan->price_monthly_cents,
                    'currency' => $currency,
                    'recurring' => ['interval' => 'month'],
                    'metadata' => [
                        'plan_slug' => (string) $plan->slug,
                        'billing_interval' => 'month',
                    ],
                ]);
                $plan->stripe_price_monthly = (string) $monthly->id;
                $this->archiveStripePrice($previous);
            }

            if ($needsYearly) {
                $previous = $plan->stripe_price_yearly;
                $yearly = $stripe->prices->create([
                    'product' => $plan->stripe_product_id,
                    'unit_amount' => (int) $plan->price_yearly_cents,
                    'currency' => $currency,
                    'recurring' => ['interval' => 'year'],
                    'metadata' => [
                        'plan_slug' => (string) $plan->slug,
                        'billing_interval' => 'year',
                    ],
                ]);
                $plan->stripe_price_yearly = (string) $yearly->id;
                $this->archiveStripePrice($previous);
            }
        } catch (ApiErrorException $e) {
            throw new BillingException(
                'Unable to sync this plan with Stripe: '.$e->getMessage(),
                'STRIPE_PLAN_SYNC_FAILED',
                502,
            );
        }
    }

    protected function syncStripeProductActive(SubscriptionPlan $plan): void
    {
        if (! $this->billing->stripeConfigured() || ! filled($plan->stripe_product_id)) {
            return;
        }

        try {
            $this->billing->stripe()->products->update((string) $plan->stripe_product_id, [
                'active' => (bool) $plan->is_active,
            ]);
        } catch (ApiErrorException $e) {
            throw new BillingException(
                'Unable to update Stripe product: '.$e->getMessage(),
                'STRIPE_PLAN_SYNC_FAILED',
                502,
            );
        }
    }

    /** @return array<string, mixed> */
    protected function productPayload(SubscriptionPlan $plan, bool $includeActive = false): array
    {
        $payload = [
            'name' => 'Havena '.$plan->name,
            'description' => sprintf(
                '%s · %d resident seats · %d-day free trial · USD billing only',
                $plan->description ?: $plan->name,
                (int) $plan->seat_limit,
                (int) $plan->trial_period_days,
            ),
            'metadata' => [
                'plan_slug' => (string) $plan->slug,
                'seat_limit' => (string) $plan->seat_limit,
                'trial_period_days' => (string) $plan->trial_period_days,
                'billing_currency' => 'usd',
            ],
        ];

        if ($includeActive) {
            $payload['active'] = (bool) $plan->is_active;
        }

        return $payload;
    }

    protected function archiveStripePrice(?string $priceId): void
    {
        if (! filled($priceId) || ! $this->billing->stripeConfigured()) {
            return;
        }

        try {
            $this->billing->stripe()->prices->update($priceId, ['active' => false]);
        } catch (ApiErrorException) {
            // Old prices stay valid for existing subscribers even if they cannot be archived.
        }
    }

    protected function recordCurrentPrices(SubscriptionPlan $plan, bool $monthly = true, bool $yearly = true): void
    {
        if (! $plan->id) {
            return;
        }

        if ($monthly) {
            $this->recordPrice($plan, 'month', (int) $plan->price_monthly_cents, $plan->stripe_price_monthly);
        }

        if ($yearly) {
            $this->recordPrice($plan, 'year', (int) $plan->price_yearly_cents, $plan->stripe_price_yearly);
        }
    }

    protected function recordPrice(SubscriptionPlan $plan, string $interval, int $amountCents, ?string $stripePriceId): void
    {
        $existing = SubscriptionPlanPrice::query()
            ->where('subscription_plan_id', $plan->id)
            ->where('interval', $interval)
            ->where('is_current', true)
            ->first();

        if (
            $existing
            && (int) $existing->amount_cents === $amountCents
            && (string) ($existing->stripe_price_id ?? '') === (string) ($stripePriceId ?? '')
        ) {
            return;
        }

        SubscriptionPlanPrice::query()
            ->where('subscription_plan_id', $plan->id)
            ->where('interval', $interval)
            ->update(['is_current' => false]);

        SubscriptionPlanPrice::query()->create([
            'subscription_plan_id' => $plan->id,
            'interval' => $interval,
            'amount_cents' => $amountCents,
            'stripe_price_id' => filled($stripePriceId) ? $stripePriceId : null,
            'is_current' => true,
        ]);
    }
}
