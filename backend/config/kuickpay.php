<?php

return [

    /*
    |--------------------------------------------------------------------------
    | KuickPay (Pakistan payments)
    |--------------------------------------------------------------------------
    |
    | Pakistan communities pay through KuickPay; US communities keep Plaid.
    | Credentials are backend-only and never reach the mobile app or logs.
    |
    | mode:
    |   sandbox  Havena's built-in KuickPay simulator. No network calls. Used
    |            locally and in demos until UAT credentials are issued.
    |   uat      KuickPay UAT hosts with UAT credentials.
    |   live     KuickPay production hosts. Requires every production gate in
    |            the payments spec to be signed off.
    |
    */

    'enabled' => (bool) env('KUICKPAY_ENABLED', true),

    'mode' => env('KUICKPAY_MODE', 'sandbox'),

    /*
    | The sandbox settles bills without moving money, so it is refused when
    | APP_ENV=production unless this is explicitly set (e.g. a demo server).
    */
    'allow_sandbox_in_production' => (bool) env('KUICKPAY_ALLOW_SANDBOX_IN_PRODUCTION', false),

    'country_codes' => array_values(array_filter(array_map(
        static fn (string $code) => strtoupper(trim($code)),
        explode(',', (string) env('KUICKPAY_COUNTRY_CODES', 'PK')),
    ))),

    'currency' => 'PKR',

    'checkout' => [
        'base_url' => env('KUICKPAY_CHECKOUT_BASE_URL', 'https://sandbox-api.kuickpay.com'),
        'session_path' => env('KUICKPAY_CHECKOUT_SESSION_PATH', '/checkout/api/session'),
        // KuickPay's session status endpoint, issued during onboarding. Empty means
        // reconciliation relies on the signed return only.
        'status_path' => env('KUICKPAY_CHECKOUT_STATUS_PATH', ''),
        'company_id' => env('KUICKPAY_COMPANY_ID'),
        'secured_key' => env('KUICKPAY_SECURED_KEY'),
    ],

    'bill_initiator' => [
        'base_url' => env('KUICKPAY_BILL_INITIATOR_BASE_URL', 'https://sandbox-kpcore.kuickpay.com'),
        'api_key' => env('KUICKPAY_API_KEY'),
        'initiator_id' => env('KUICKPAY_INITIATOR_ID'),
        'channel' => env('KUICKPAY_CHANNEL', 'MOBILE'),
    ],

    /*
    | Institution End-to-End: KuickPay calls Havena to inquire and pay
    | Havena-generated bills. Credentials are the username/password Havena
    | shares with KuickPay during onboarding.
    */
    'institution' => [
        'id' => env('KUICKPAY_INSTITUTION_ID'),
        'prefix' => env('KUICKPAY_INSTITUTION_PREFIX', '01999'),
        'name' => env('KUICKPAY_INSTITUTION_NAME', 'Havena'),
        'username' => env('KUICKPAY_INSTITUTION_USERNAME'),
        'password' => env('KUICKPAY_INSTITUTION_PASSWORD'),
    ],

    'timeout_seconds' => (int) env('KUICKPAY_TIMEOUT_SECONDS', 20),

    'ca_bundle' => env('KUICKPAY_CA_BUNDLE'),

    /** Signing key for the built-in sandbox only; live mode uses checkout.secured_key. */
    'sandbox_secret' => env('KUICKPAY_SANDBOX_SECRET', 'havena-kuickpay-sandbox'),

    /** Minutes before an unauthorised checkout is expired and Pay Now re-enabled. */
    'attempt_ttl_minutes' => (int) env('KUICKPAY_ATTEMPT_TTL_MINUTES', 30),

    /** Seconds between resident refreshes of the same external bill. */
    'refresh_throttle_seconds' => (int) env('KUICKPAY_REFRESH_THROTTLE_SECONDS', 30),

    /** Reconciliation backoff, in minutes after the attempt entered pending_confirmation. */
    'reconcile_backoff_minutes' => [1, 5, 15, 30, 60, 180, 720, 1440],

    /** Stop automatic reconciliation and raise an exception after this many hours. */
    'reconcile_max_hours' => (int) env('KUICKPAY_RECONCILE_MAX_HOURS', 72),

    /** Public API origin used to build hosted checkout launch and return URLs. */
    'public_api_url' => env('KUICKPAY_PUBLIC_API_URL', env('APP_URL')),

    /** Resident web origin for browser-based returns. */
    'web_url' => env('KUICKPAY_WEB_URL', env('FRONTEND_USER_URL', env('FRONTEND_ADMIN_URL', 'http://localhost:3000'))),

    /** Only these app schemes are accepted as a post-payment deep link target. */
    'app_return_schemes' => ['havena', 'exp', 'exps'],

    /** Payment methods shown on the checkout page, in display order. */
    'methods' => [
        ['id' => 'easypaisa', 'label' => 'Easypaisa'],
        ['id' => 'jazzcash', 'label' => 'JazzCash'],
        ['id' => 'card', 'label' => 'Debit / Credit card'],
        ['id' => 'bank', 'label' => 'Bank account'],
        ['id' => 'raast', 'label' => 'Raast'],
    ],

];
