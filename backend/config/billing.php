<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Community subscription billing
    |--------------------------------------------------------------------------
    |
    | Community admins purchase a plan for their community. Seats are filled
    | by inviting/approving residents. Guests and community admins do not
    | consume seats.
    |
    */

    'enabled' => (bool) env('BILLING_ENABLED', true),

    /** When false, seat/subscription checks are skipped (emergency bypass). */
    'enforce' => (bool) env('BILLING_ENFORCE_SEATS', true),

    /**
     * stripe — real Checkout + webhooks
     * manual — system-admin grant / local activate without Stripe
     */
    'driver' => env('BILLING_DRIVER', 'stripe'),

    'grace_days' => (int) env('BILLING_GRACE_DAYS', 7),

    /** Free trial length for new Community Admin subscriptions (Stripe Checkout). */
    'trial_period_days' => (int) env('BILLING_TRIAL_PERIOD_DAYS', 30),

    'currency' => env('BILLING_CURRENCY', 'usd'),

    /** Hosted Stripe Checkout presentation (USD card-only, Havena branding copy). */
    'checkout' => [
        'locale' => env('STRIPE_CHECKOUT_LOCALE', 'en'),
        'business_name' => env('STRIPE_BUSINESS_NAME', 'Havena'),
        'allow_promotion_codes' => (bool) env('STRIPE_CHECKOUT_ALLOW_PROMO', false),
        /** Optional payment_method_configuration ID (card-only config from Dashboard or setup command). */
        'payment_method_configuration' => env('STRIPE_CHECKOUT_PMC_ID'),
    ],

    'stripe' => [
        'secret' => env('STRIPE_SECRET'),
        'publishable' => env('STRIPE_KEY'),
        'webhook_secret' => env('STRIPE_WEBHOOK_SECRET'),
    ],

    'checkout_success_url' => env(
        'BILLING_CHECKOUT_SUCCESS_URL',
        env('FRONTEND_ADMIN_URL', 'http://localhost:3000').'/admin/billing?checkout=success'
    ),

    'checkout_cancel_url' => env(
        'BILLING_CHECKOUT_CANCEL_URL',
        env('FRONTEND_ADMIN_URL', 'http://localhost:3000').'/admin/billing?checkout=cancel'
    ),

    'portal_return_url' => env(
        'BILLING_PORTAL_RETURN_URL',
        env('FRONTEND_ADMIN_URL', 'http://localhost:3000').'/admin/billing'
    ),

    /*
    | Plans are defined in config. Wire Stripe Price IDs from Test mode first.
    | Amounts are display-only (cents) when Stripe prices are not yet configured.
    */
    'plans' => [
        'starter' => [
            'name' => 'Starter',
            'description' => 'For smaller communities getting started.',
            'seat_limit' => 50,
            'price_monthly_cents' => 9900,
            'price_yearly_cents' => 99000,
            'stripe_price_monthly' => env('STRIPE_PRICE_STARTER_MONTHLY'),
            'stripe_price_yearly' => env('STRIPE_PRICE_STARTER_YEARLY'),
            'sort' => 1,
        ],
        'growth' => [
            'name' => 'Growth',
            'description' => 'For mid-size neighborhoods and HOAs.',
            'seat_limit' => 150,
            'price_monthly_cents' => 24900,
            'price_yearly_cents' => 249000,
            'stripe_price_monthly' => env('STRIPE_PRICE_GROWTH_MONTHLY'),
            'stripe_price_yearly' => env('STRIPE_PRICE_GROWTH_YEARLY'),
            'sort' => 2,
            'recommended' => true,
        ],
        'campus' => [
            'name' => 'Campus',
            'description' => 'For large communities and multi-building campuses.',
            'seat_limit' => 500,
            'price_monthly_cents' => 59900,
            'price_yearly_cents' => 599000,
            'stripe_price_monthly' => env('STRIPE_PRICE_CAMPUS_MONTHLY'),
            'stripe_price_yearly' => env('STRIPE_PRICE_CAMPUS_YEARLY'),
            'sort' => 3,
        ],
    ],

    /** Extra seat pack (optional add-on). */
    'seat_pack' => [
        'seats' => (int) env('BILLING_SEAT_PACK_SIZE', 25),
        'price_monthly_cents' => (int) env('BILLING_SEAT_PACK_PRICE_MONTHLY_CENTS', 4900),
        'stripe_price_monthly' => env('STRIPE_PRICE_SEAT_PACK_MONTHLY'),
    ],
];
