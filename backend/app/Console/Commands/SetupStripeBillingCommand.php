<?php

namespace App\Console\Commands;

use App\Models\SubscriptionPlan;
use App\Models\SubscriptionPlanPrice;
use Illuminate\Console\Command;
use Stripe\StripeClient;

class SetupStripeBillingCommand extends Command
{
    protected $signature = 'billing:setup-stripe
        {--key= : Stripe publishable key (pk_test_...)}
        {--secret= : Stripe secret key (sk_test_...)}
        {--write-env : Persist keys and price IDs to backend/.env}';

    protected $description = 'Create Havena test-mode Stripe products/prices and store IDs on subscription plans';

    public function handle(): int
    {
        $publishable = trim((string) ($this->option('key') ?: config('billing.stripe.publishable') ?: env('STRIPE_KEY', '')));
        $secret = trim((string) ($this->option('secret') ?: config('billing.stripe.secret') ?: env('STRIPE_SECRET', '')));

        if ($publishable === '' || $secret === '') {
            $this->error('Stripe test keys are missing.');
            $this->line('Get them from Stripe Dashboard → Developers → API keys (Test mode).');
            $this->line('Then run:');
            $this->line('  php artisan billing:setup-stripe --key=pk_test_... --secret=sk_test_... --write-env');

            return self::FAILURE;
        }

        if (! str_starts_with($publishable, 'pk_test_') && ! str_starts_with($publishable, 'pk_live_')) {
            $this->warn('Publishable key should start with pk_test_ for local testing.');
        }

        if (! str_starts_with($secret, 'sk_test_') && ! str_starts_with($secret, 'sk_live_')) {
            $this->warn('Secret key should start with sk_test_ for local testing.');
        }

        $stripe = new StripeClient($secret);

        try {
            $stripe->balance->retrieve();
        } catch (\Throwable $e) {
            $this->error('Unable to connect to Stripe: '.$e->getMessage());

            return self::FAILURE;
        }

        $this->info('Connected to Stripe. Syncing products and prices for database plans…');

        $plans = SubscriptionPlan::query()->orderBy('sort_order')->get();
        if ($plans->isEmpty()) {
            $this->error('No subscription plans found. Run migrations first.');

            return self::FAILURE;
        }

        $priceVars = [];
        $currency = strtolower((string) config('billing.currency', 'usd'));

        foreach ($plans as $plan) {
            if (! filled($plan->stripe_product_id) && filled($plan->stripe_price_monthly)) {
                try {
                    $existingPrice = $stripe->prices->retrieve((string) $plan->stripe_price_monthly);
                    $productId = is_object($existingPrice->product)
                        ? (string) data_get($existingPrice->product, 'id')
                        : (string) $existingPrice->product;
                    if ($productId !== '') {
                        $plan->stripe_product_id = $productId;
                    }
                } catch (\Throwable) {
                    // Create a new product below if the stored price cannot be loaded.
                }
            }

            if (! filled($plan->stripe_product_id)) {
                $product = $stripe->products->create([
                    'name' => 'Havena '.$plan->name,
                    'description' => sprintf(
                        '%d resident seats · %d-day free trial · USD billing only',
                        $plan->seat_limit,
                        $plan->trial_period_days,
                    ),
                    'metadata' => [
                        'plan_slug' => $plan->slug,
                        'seat_limit' => (string) $plan->seat_limit,
                        'billing_currency' => $currency,
                    ],
                ]);
                $plan->stripe_product_id = $product->id;
            }

            if (! filled($plan->stripe_price_monthly)) {
                $monthly = $stripe->prices->create([
                    'product' => $plan->stripe_product_id,
                    'unit_amount' => (int) $plan->price_monthly_cents,
                    'currency' => $currency,
                    'recurring' => ['interval' => 'month'],
                    'metadata' => [
                        'plan_slug' => $plan->slug,
                        'billing_interval' => 'month',
                    ],
                ]);
                $plan->stripe_price_monthly = $monthly->id;
                $this->recordPrice($plan, 'month', (int) $plan->price_monthly_cents, $monthly->id);
            }

            if (! filled($plan->stripe_price_yearly)) {
                $yearly = $stripe->prices->create([
                    'product' => $plan->stripe_product_id,
                    'unit_amount' => (int) $plan->price_yearly_cents,
                    'currency' => $currency,
                    'recurring' => ['interval' => 'year'],
                    'metadata' => [
                        'plan_slug' => $plan->slug,
                        'billing_interval' => 'year',
                    ],
                ]);
                $plan->stripe_price_yearly = $yearly->id;
                $this->recordPrice($plan, 'year', (int) $plan->price_yearly_cents, $yearly->id);
            }

            $plan->save();

            $upper = strtoupper(str_replace('-', '_', $plan->slug));
            $priceVars["STRIPE_PRICE_{$upper}_MONTHLY"] = (string) $plan->stripe_price_monthly;
            $priceVars["STRIPE_PRICE_{$upper}_YEARLY"] = (string) $plan->stripe_price_yearly;

            $this->line("  {$plan->slug}: {$plan->stripe_price_monthly} (month), {$plan->stripe_price_yearly} (year)");
        }

        if ($this->option('write-env')) {
            $this->writeEnv(array_merge([
                'BILLING_ENABLED' => 'true',
                'BILLING_ENFORCE_SEATS' => 'true',
                'BILLING_DRIVER' => 'stripe',
                'BILLING_GRACE_DAYS' => '7',
                'BILLING_CURRENCY' => 'usd',
                'STRIPE_CHECKOUT_LOCALE' => 'en',
                'STRIPE_BUSINESS_NAME' => 'Havena',
                'STRIPE_KEY' => $publishable,
                'STRIPE_SECRET' => $secret,
            ], $priceVars));

            $this->info('Updated backend/.env with Stripe keys (price IDs are stored on subscription_plans).');
            $this->line('Restart the Laravel server if it is already running.');
        } else {
            $this->info('Stripe product and price IDs were saved on subscription_plans in the database.');
        }

        $appUrl = rtrim((string) config('app.url', 'http://localhost:8000'), '/');
        $webhookUrl = $appUrl.'/api/v1/billing/stripe/webhook';

        $this->newLine();
        $this->info('Stripe billing is ready for test checkout.');
        $this->line('Webhook endpoint: '.$webhookUrl);
        $this->line('Local forwarding (Stripe CLI):');
        $this->line('  stripe listen --forward-to '.$webhookUrl);
        $this->line('Copy the whsec_... secret into STRIPE_WEBHOOK_SECRET in .env.');
        $this->line('Admin billing UI: '.rtrim((string) env('FRONTEND_ADMIN_URL', 'http://localhost:3000'), '/').'/admin/billing');
        $this->line('Test card: 4242 4242 4242 4242 · any future expiry · any CVC');
        $this->newLine();
        $this->warn('Stripe Dashboard (Test mode) — one-time setup for a professional Checkout:');
        $this->line('  1. Settings → Business details → Public business name: Havena (not Neighborlink)');
        $this->line('  2. Settings → Branding → accent #0d9488, brand #0A2A43, upload Havena logo');
        $this->line('  3. Settings → Adaptive pricing → OFF (Checkout is forced to USD in code)');
        $this->line('  4. Settings → Payment methods → keep Cards ON; disable Link, Amazon Pay, Cash App Pay, Apple Pay if shown');
        $this->line('  5. Settings → Checkout → add support email + terms/privacy links (optional)');

        return self::SUCCESS;
    }

    /** @param array<string, string> $vars */
    private function writeEnv(array $vars): void
    {
        $path = base_path('.env');
        if (! is_file($path)) {
            throw new \RuntimeException('.env file not found at '.$path);
        }

        $lines = file($path, FILE_IGNORE_NEW_LINES);
        if ($lines === false) {
            throw new \RuntimeException('Unable to read .env');
        }

        $keys = array_keys($vars);
        $pattern = '/^('.implode('|', array_map(static fn ($k) => preg_quote($k, '/'), $keys)).')=/';

        $filtered = array_values(array_filter($lines, function ($line) use ($pattern) {
            $trim = trim($line);

            return $trim === '' || str_starts_with($trim, '#') || ! preg_match($pattern, $trim);
        }));

        while ($filtered && trim((string) end($filtered)) === '') {
            array_pop($filtered);
        }

        $filtered[] = '';
        $filtered[] = '# Community subscription billing (Stripe test mode)';
        foreach ($vars as $key => $value) {
            $filtered[] = $key.'='.$value;
        }

        file_put_contents($path, implode(PHP_EOL, $filtered).PHP_EOL);
    }

    private function recordPrice(SubscriptionPlan $plan, string $interval, int $amountCents, string $stripePriceId): void
    {
        SubscriptionPlanPrice::query()
            ->where('subscription_plan_id', $plan->id)
            ->where('interval', $interval)
            ->update(['is_current' => false]);

        SubscriptionPlanPrice::query()->create([
            'subscription_plan_id' => $plan->id,
            'interval' => $interval,
            'amount_cents' => $amountCents,
            'stripe_price_id' => $stripePriceId,
            'is_current' => true,
        ]);
    }
}
