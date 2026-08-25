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

];
