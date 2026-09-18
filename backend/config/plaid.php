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
