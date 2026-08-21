<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Fixed OTP (demo / no SMS provider)
    |--------------------------------------------------------------------------
    |
    | When set, every request uses this code and verify accepts it.
    | Leave empty in real production once an SMS provider is wired.
    | Local / testing / uat always fall back to 123456 when this is empty.
    |
    */

    'fixed_code' => env('OTP_FIXED_CODE'),

    'expire_minutes' => (int) env('OTP_EXPIRE_MINUTES', 2),

];
