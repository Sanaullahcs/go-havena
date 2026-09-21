<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Plaid bank linking (Sandbox / production)
    |--------------------------------------------------------------------------
    |
    | Credentials are backend-only. Never expose PLAID_SECRET to the frontend.
    | Status: php artisan plaid:status
    |
    */

    'client_id' => env('PLAID_CLIENT_ID'),

    'secret' => env('PLAID_SECRET'),

    /** sandbox | development | production */
    'environment' => env('PLAID_ENV', 'sandbox'),

    'link' => [
        'client_name' => env('PLAID_LINK_CLIENT_NAME', 'GoHavena'),
        'language' => env('PLAID_LINK_LANGUAGE', 'en'),
        'country_codes' => ['US'],
        'products' => ['auth'],
        'resident_products' => ['auth', 'transfer'],
    ],

    /*
    | Resident → community ACH. Live Plaid Transfer is used when the product is
    | enabled on the Plaid account. Sandbox falls back to a ledgered simulation
    | so local/demo communities can still complete amenity payments.
    */
    'transfer' => [
        'enabled' => (bool) env('PLAID_TRANSFER_ENABLED', true),
        'simulate' => env('PLAID_TRANSFER_SIMULATE'),
        'ach_class_debit' => env('PLAID_ACH_CLASS_DEBIT', 'web'),
        'ach_class_credit' => env('PLAID_ACH_CLASS_CREDIT', 'ccd'),
        'currency' => 'USD',
    ],

    /*
    | Countries where Community Admins may use Plaid bank linking.
    | Pakistan (PK) is never included. Comma-separated in .env.
    */
    'supported_country_codes' => array_values(array_filter(array_map(
        static fn (string $code) => strtoupper(trim($code)),
        explode(',', (string) env('PLAID_SUPPORTED_COUNTRY_CODES', 'US')),
    ))),

    /** Public HTTPS URL Plaid should call. Leave empty in local sandbox if unused. */
    'webhook_url' => env('PLAID_WEBHOOK_URL'),

    /**
     * When true, Plaid-Verification JWT must validate. Default false keeps Sandbox usable locally.
     */
    'verify_webhooks' => (bool) env('PLAID_VERIFY_WEBHOOKS', false),

];
