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

];
