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
    | Resident → Havena Plaid Ledger (debit) → community bank (credit).
    | `enabled` is the global kill switch for new payments; webhooks and
    | reconciliation keep running when it is off.
    | `simulate=true` records ledgered fake transfers without calling Plaid. It is
    | never automatic: a Plaid error fails the payment instead of faking success.
    | Simulation is refused when PLAID_ENV=production.
    */
    'transfer' => [
        'enabled' => (bool) env('PLAID_TRANSFER_ENABLED', true),
        'simulate' => filter_var(env('PLAID_TRANSFER_SIMULATE', false), FILTER_VALIDATE_BOOLEAN),
        /** APP_ENV=production with PLAID_ENV!=production moves no real money; refuse unless explicitly allowed. */
        'allow_sandbox_in_production' => filter_var(env('PLAID_ALLOW_SANDBOX_IN_PRODUCTION', false), FILTER_VALIDATE_BOOLEAN),
        /** Minutes after which an unresolved payment is listed as stale for reconciliation. */
        'stale_after_minutes' => (int) env('PLAID_TRANSFER_STALE_MINUTES', 60 * 24 * 4),
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
     * When true, the Plaid-Verification JWT (ES256, body SHA-256, iat ≤ 5 min) must validate.
     * Defaults to on when PLAID_ENV=production.
     */
    'verify_webhooks' => filter_var(env('PLAID_VERIFY_WEBHOOKS', env('PLAID_ENV') === 'production'), FILTER_VALIDATE_BOOLEAN),

    'webhook_max_age_seconds' => 300,

    /** Optional path to a CA bundle. WAMP often has empty curl.cainfo. */
    'ca_bundle' => env('PLAID_CA_BUNDLE'),

];
