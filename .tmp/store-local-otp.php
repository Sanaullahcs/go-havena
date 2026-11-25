<?php

require __DIR__ . '/../backend/vendor/autoload.php';

$app = require __DIR__ . '/../backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$otp = app(App\Services\OtpService::class);

$emails = [
    'sanaullah6065cs@gmail.com',
    'sanaullh6065cs@gmail.com',
];

foreach ($emails as $email) {
    $otp->send($email);
}

DB::table('email_otps')
    ->whereIn('email', $emails)
    ->update([
        'attempts' => 0,
        'expires_at' => now()->addHours(2),
        'updated_at' => now(),
    ]);

$rows = DB::table('email_otps')
    ->whereIn('email', $emails)
    ->orderByDesc('id')
    ->get();

$checks = [];
foreach ($emails as $email) {
    $checks[$email] = $otp->check($email, '123456');
}

echo json_encode([
    'now' => now()->toDateTimeString(),
    'stored' => $rows,
    'check_without_consume' => $checks,
], JSON_PRETTY_PRINT);