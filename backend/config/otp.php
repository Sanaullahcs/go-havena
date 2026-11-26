<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Fixed OTP (demo / no SMS provider)
    |--------------------------------------------------------------------------
    |
    | OTP_FIXED_CODE is accepted only for emails in OTP_FIXED_EMAILS
    | (Play / App Store review accounts). Everyone else is emailed a
    | random code. OTP_UNIVERSAL_CODE is also accepted for every user
    | while that emailed code is still valid.
    |
    */

    'fixed_code' => env('OTP_FIXED_CODE'),

    /*
    | Accepted for every account in addition to the emailed code.
    | It does not replace the code that is sent.
    */
    'universal_code' => env('OTP_UNIVERSAL_CODE', '221322'),

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
            'syed@gohavena.com' => env('OTP_DEMO_SYED_CODE', '221322'),
            'admin@gohavena.com' => env('OTP_DEMO_ADMIN_CODE', '221322'),
            'community@gohavena.com' => env('OTP_DEMO_COMMUNITY_CODE', '221322'),
            'acton@gohavena.com' => env('OTP_DEMO_ACTON_CODE', '221322'),
            'resident.acton@gohavena.com' => env('OTP_DEMO_ACTON_RESIDENT_CODE', '221322'),
            'admin.muscat@gohavena.com' => env('OTP_DEMO_MUSCAT_CODE', '221322'),
            'admin.doha@gohavena.com' => env('OTP_DEMO_DOHA_CODE', '221322'),
            'admin.jeddah@gohavena.com' => env('OTP_DEMO_JEDDAH_CODE', '221322'),
            'faisalaljamil@gmail.com' => env('OTP_DEMO_FAISAL_CODE', '221322'),
            'zaeem.chaudhry@gmail.com' => env('OTP_DEMO_ZAEEM_CODE', '221322'),
            'haly@gohavena.com' => env('OTP_DEMO_HALY_CODE', '221322'),
            'haly.resident@gohavena.com' => env('OTP_DEMO_HALY_RESIDENT_CODE', '221322'),
            'aida@gohavena.com' => env('OTP_DEMO_AIDA_CODE', '221322'),
            'umer@namuve.com' => env('OTP_DEMO_UMER_CODE', '221322'),
            'tgi.admin@havena.app' => env('OTP_DEMO_TGI_ADMIN_CODE', '123456'),
            'tgiadmin@havena.app' => env('OTP_DEMO_TGI_ADMIN_CODE', '123456'),
            'tgi.resident1@havena.app' => env('OTP_DEMO_TGI_RESIDENT_CODE', '123456'),
            'tgi.resident2@havena.app' => env('OTP_DEMO_TGI_RESIDENT_CODE', '123456'),
            'tgi.resident3@havena.app' => env('OTP_DEMO_TGI_RESIDENT_CODE', '123456'),
            'tgi.resident4@havena.app' => env('OTP_DEMO_TGI_RESIDENT_CODE', '123456'),
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
    | When true, a mail transport failure returns OTP_MAIL_FAILED (503).
    | Defaults to production only so local SMTP outages do not block login.
    */
    'require_mail' => env('OTP_REQUIRE_MAIL') === null
        ? null
        : filter_var(env('OTP_REQUIRE_MAIL'), FILTER_VALIDATE_BOOLEAN),

    /*
    |--------------------------------------------------------------------------
    | Resend / verify rate limits (all OTP verification screens)
    |--------------------------------------------------------------------------
    */
    'resend_cooldown_seconds' => (int) env('OTP_RESEND_COOLDOWN_SECONDS', 60),
    'max_resends' => (int) env('OTP_MAX_RESENDS', 3),
    'resend_lock_seconds' => (int) env('OTP_RESEND_LOCK_SECONDS', 900),
    'wrong_verify_lock_seconds' => (int) env('OTP_WRONG_VERIFY_LOCK_SECONDS', 3600),
    /** Wrong verify attempts before a security lock (default 3). */
    'verify_fail_threshold' => (int) env('OTP_VERIFY_FAIL_THRESHOLD', 3),
    /** First-tier lock after threshold (seconds); default 15 minutes. */
    'verify_fail_lock_seconds' => (int) env('OTP_VERIFY_FAIL_LOCK_SECONDS', 900),
    /** Escalating lock durations: 15m, 30m, 60m by default. */
    'verify_fail_lock_schedule' => array_values(array_filter(array_map(
        'intval',
        explode(',', (string) env('OTP_VERIFY_FAIL_LOCK_SCHEDULE', '900,1800,3600')),
    ))),

    'rate_limit_enabled' => filter_var(env('OTP_RATE_LIMIT_ENABLED', true), FILTER_VALIDATE_BOOLEAN),

];
