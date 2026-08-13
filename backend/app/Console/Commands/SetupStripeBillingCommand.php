<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Stripe\StripeClient;

class SetupStripeBillingCommand extends Command
{
    protected $signature = 'billing:setup-stripe
        {--key= : Stripe publishable key (pk_test_...)}
        {--secret= : Stripe secret key (sk_test_...)}
        {--write-env : Persist keys and price IDs to backend/.env}';

    protected $description = 'Create Havena test-mode Stripe products/prices and verify billing configuration';

    /** @var array<string, array{name: string, seats: int, month: int, year: int}> */
    private array $plans = [
        'starter' => ['name' => 'Havena Starter', 'seats' => 50, 'month' => 9900, 'year' => 99000],
        'growth' => ['name' => 'Havena Growth', 'seats' => 150, 'month' => 24900, 'year' => 249000],
        'campus' => ['name' => 'Havena Campus', 'seats' => 500, 'month' => 59900, 'year' => 599000],
    ];

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

        $this->info('Connected to Stripe. Creating test products and prices…');

        $priceVars = [];

        foreach ($this->plans as $slug => $plan) {
            $product = $stripe->products->create([
                'name' => $plan['name'],
                'description' => sprintf(
                    '%d resident seats · %d-day free trial · USD billing only',
                    $plan['seats'],
                    (int) config('billing.trial_period_days', 30),
                ),
                'metadata' => [
                    'plan_slug' => $slug,
                    'seat_limit' => (string) $plan['seats'],
                    'billing_currency' => 'usd',
                ],
            ]);

            $monthly = $stripe->prices->create([
                'product' => $product->id,
                'unit_amount' => $plan['month'],
                'currency' => 'usd',
                'recurring' => ['interval' => 'month'],
                'metadata' => [
                    'plan_slug' => $slug,
                    'billing_interval' => 'month',
                ],
            ]);

            $yearly = $stripe->prices->create([
                'product' => $product->id,
                'unit_amount' => $plan['year'],
                'currency' => 'usd',
                'recurring' => ['interval' => 'year'],
                'metadata' => [
                    'plan_slug' => $slug,
                    'billing_interval' => 'year',
                ],
            ]);

            $upper = strtoupper($slug);
            $priceVars["STRIPE_PRICE_{$upper}_MONTHLY"] = $monthly->id;
            $priceVars["STRIPE_PRICE_{$upper}_YEARLY"] = $yearly->id;

            $this->line("  {$slug}: {$monthly->id} (month), {$yearly->id} (year)");
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

            $this->info('Updated backend/.env with Stripe keys and price IDs.');
            $this->line('Restart the Laravel server if it is already running.');
        } else {
            $this->warn('Price IDs were not written to .env (pass --write-env to persist).');
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
}
