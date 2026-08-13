<?php

namespace App\Console\Commands;

use App\Services\CommunityBillingService;
use Illuminate\Console\Command;

class StripeBillingStatusCommand extends Command
{
    protected $signature = 'billing:stripe-status';

    protected $description = 'Show Stripe billing configuration status for local testing';

    public function handle(CommunityBillingService $billing): int
    {
        $plans = config('billing.plans', []);
        $rows = [];

        foreach ($plans as $slug => $plan) {
            $monthly = config("billing.plans.{$slug}.stripe_price_monthly");
            $yearly = config("billing.plans.{$slug}.stripe_price_yearly");
            $rows[] = [
                $slug,
                filled($monthly) ? 'yes' : 'no',
                filled($yearly) ? 'yes' : 'no',
                (string) ($plan['seat_limit'] ?? ''),
            ];
        }

        $this->table(['Plan', 'Monthly price', 'Yearly price', 'Seats'], $rows);

        $this->line('Billing enabled: '.(config('billing.enabled') ? 'yes' : 'no'));
        $this->line('Enforce seats: '.(config('billing.enforce') ? 'yes' : 'no'));
        $this->line('Driver: '.config('billing.driver'));
        $this->line('Stripe secret: '.(filled(config('billing.stripe.secret')) ? 'set' : 'missing'));
        $this->line('Stripe publishable: '.(filled(config('billing.stripe.publishable')) ? 'set' : 'missing'));
        $this->line('Webhook secret: '.(filled(config('billing.stripe.webhook_secret')) ? 'set' : 'missing (optional for confirm-checkout fallback)'));
        $this->line('Stripe configured (API): '.($billing->stripeConfigured() ? 'yes' : 'no'));

        $appUrl = rtrim((string) config('app.url', 'http://localhost:8000'), '/');
        $this->line('Webhook URL: '.$appUrl.'/api/v1/billing/stripe/webhook');

        if (! $billing->stripeConfigured()) {
            $this->newLine();
            $this->warn('Run: php artisan billing:setup-stripe --key=pk_test_... --secret=sk_test_... --write-env');

            return self::FAILURE;
        }

        $missingPrices = collect($plans)->filter(function ($plan, $slug) {
            return ! filled(config("billing.plans.{$slug}.stripe_price_monthly"))
                || ! filled(config("billing.plans.{$slug}.stripe_price_yearly"));
        });

        if ($missingPrices->isNotEmpty()) {
            $this->newLine();
            $this->warn('Some plan price IDs are missing. Re-run billing:setup-stripe --write-env.');

            return self::FAILURE;
        }

        $this->info('Stripe billing looks ready for test checkout.');
        $this->newLine();
        $this->line('Checkout policy: USD only · card only · 30-day trial (see billing.checkout in config/billing.php)');
        $this->line('If Checkout still shows Neighborlink / PKR / extra wallets, update Stripe Dashboard (see docs/BILLING-STRIPE-TEST.md §1).');

        return self::SUCCESS;
    }
}
