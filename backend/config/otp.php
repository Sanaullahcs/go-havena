<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Fixed OTP (demo / no SMS provider)
    |--------------------------------------------------------------------------
    |
    | Leave empty in production so each request emails a random 6-digit code.
    | Set OTP_FIXED_CODE only for local / demo. Local, testing, and uat
    | fall back to 123456 when this is empty.
    |
    */

    'fixed_code' => env('OTP_FIXED_CODE'),

    'expire_minutes' => (int) env('OTP_EXPIRE_MINUTES', 2),

];
