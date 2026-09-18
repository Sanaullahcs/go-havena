<?php

use App\Models\EmailOtp;
use App\Models\User;
use App\Services\ContactIdentityService;
use App\Services\OtpRateLimitService;
use App\Services\OtpService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$emails = User::withTrashed()
    ->where(function ($q) {
        $q->where('email', 'like', '%mahnoor%')
            ->orWhere('name', 'like', '%mahnoor%');
    })
    ->get(['id', 'email', 'name', 'status', 'deleted_at', 'created_at']);

echo "users_mahnoor=".$emails->count()."\n";
foreach ($emails as $u) {
    echo "user {$u->id} {$u->email} status={$u->status} deleted=".($u->deleted_at ?? 'null')." created={$u->created_at}\n";
}

$otps = DB::table('email_otps')->where('email', 'like', '%mahnoor%')->orderByDesc('id')->limit(20)->get();
echo "email_otps=".$otps->count()."\n";
foreach ($otps as $otp) {
    echo "otp {$otp->id} {$otp->email} expires={$otp->expires_at} attempts={$otp->attempts} created={$otp->created_at}\n";
}

$recentOtps = DB::table('email_otps')->orderByDesc('id')->limit(10)->get(['id', 'email', 'created_at', 'expires_at']);
echo "recent_otps=".$recentOtps->count()."\n";
foreach ($recentOtps as $otp) {
    echo "recent_otp {$otp->id} {$otp->email} created={$otp->created_at} expires={$otp->expires_at}\n";
}

if (Schema::hasTable('transactional_email_sends')) {
    $sends = DB::table('transactional_email_sends')
        ->where('recipient_email', 'like', '%mahnoor%')
        ->orderByDesc('id')
        ->limit(10)
        ->get();
    echo "tx_sends=".$sends->count()."\n";
    foreach ($sends as $s) {
        $status = $s->status ?? $s->mailer_status ?? 'n/a';
        echo "send {$s->id} {$s->recipient_email} status={$status} created=".($s->created_at ?? '')."\n";
    }
}

$service = app(OtpService::class);
$rate = app(OtpRateLimitService::class);
$candidates = [
    'mahnoorayaztabusu@gmail.com',
    'mahnoorayazkhan5@gmail.com',
    'mahnoorayazkhan6@gmail.com',
    'mahnoorayazkhan7@gmail.com',
    'mahnoorayaz8181@gmail.com',
    'mahnoorayaz2819@gmail.com',
    'mahnoorkhan192002@gmail.com',
    'mahnoor.ayaz@tabsusa.com',
    'mahnoorayaz4@gmail.com',
];

foreach ($candidates as $email) {
    $found = ContactIdentityService::findUserByEmail($email, withTrashed: true);
    $status = $rate->status($email);
    $demo = method_exists($service, 'normalizedEmail') ? $service->normalizedEmail($email) : $email;
    echo "check {$email} user=".($found ? $found->id.' trashed='.($found->trashed() ? 'yes' : 'no') : 'none')." locked=".(($status['locked'] ?? false) ? 'yes' : 'no')." cooldown=".($status['retry_after_seconds'] ?? 0)." remaining=".($status['resends_remaining'] ?? '?')."\n";
}

echo "mailer=".config('mail.default')." from=".config('mail.from.address')."\n";
echo "otp_fixed_emails=".config('otp.fixed_emails')."\n";
echo "otp_demo_keys=".implode(',', array_keys(config('otp.demo_email_codes', [])))."\n";
echo "otp_rate_limit=".(config('otp.rate_limit_enabled') ? 'yes' : 'no')."\n";
