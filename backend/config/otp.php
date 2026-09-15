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
    | Per-email fallback codes (sales / presentation / client setup).
    | These are accepted on verify in every environment and do not replace
    | the emailed one-time code.
    */
    'demo_email_codes' => (static function (): array {
        $codes = [
            'resident@gohavena.com' => env('OTP_DEMO_RESIDENT_CODE', '221322'),
            'community@gohavena.com' => env('OTP_DEMO_COMMUNITY_CODE', '221322'),
            'umer@namuve.com' => env('OTP_DEMO_UMER_CODE', '221322'),
        ];

        $fallback = trim((string) env('OTP_DEMO_FALLBACK_CODE', '221322'));
        if ($fallback === '' || preg_match('/^\d{4,8}$/', $fallback) !== 1) {
            $fallback = '221322';
        }

        foreach (explode(',', (string) env('OTP_DEMO_FALLBACK_EMAILS', '')) as $email) {
            $email = strtolower(trim($email));
            if ($email !== '') {
                $codes[$email] = $fallback;
            }
        }

        return $codes;
    })(),

    'expire_minutes' => (int) env('OTP_EXPIRE_MINUTES', 5),

    /*
    |--------------------------------------------------------------------------
    | Resend / verify rate limits (all OTP verification screens)
    |--------------------------------------------------------------------------
    */
    'resend_cooldown_seconds' => (int) env('OTP_RESEND_COOLDOWN_SECONDS', 60),
    'max_resends' => (int) env('OTP_MAX_RESENDS', 3),
    'resend_lock_seconds' => (int) env('OTP_RESEND_LOCK_SECONDS', 900),
    'wrong_verify_lock_seconds' => (int) env('OTP_WRONG_VERIFY_LOCK_SECONDS', 3600),

    'rate_limit_enabled' => filter_var(env('OTP_RATE_LIMIT_ENABLED', true), FILTER_VALIDATE_BOOLEAN),

];
