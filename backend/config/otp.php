<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Fixed OTP (demo / no SMS provider)
    |--------------------------------------------------------------------------
    |
    | OTP_FIXED_CODE is accepted only for emails in OTP_FIXED_EMAILS
    | (Play / App Store review accounts). Everyone else gets a random
    | emailed code in production.
    |
    */

    'fixed_code' => env('OTP_FIXED_CODE'),

    'fixed_emails' => env(
        'OTP_FIXED_EMAILS',
        'test.resident@havena.app,test.community.admin@havena.app',
    ),

    /*
    | Per-email demo codes (sales / presentation accounts). These work in
    | every environment and are not shared with other users.
    */
    'demo_email_codes' => [
        'resident@gohavena.com' => env('OTP_DEMO_RESIDENT_CODE', '221322'),
        'community@gohavena.com' => env('OTP_DEMO_COMMUNITY_CODE', '221322'),
    ],

    'expire_minutes' => (int) env('OTP_EXPIRE_MINUTES', 5),

];
