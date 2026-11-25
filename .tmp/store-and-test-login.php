<?php

require __DIR__ . '/../backend/vendor/autoload.php';

$app = require __DIR__ . '/../backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$email = 'sanaullah6065cs@gmail.com';
app(App\Services\OtpService::class)->send($email);

DB::table('email_otps')->where('email', $email)->update([
    'attempts' => 0,
    'expires_at' => now()->addHours(2),
    'updated_at' => now(),
]);

$row = DB::table('email_otps')->where('email', $email)->first();
echo json_encode(['stored' => $row], JSON_PRETTY_PRINT) . PHP_EOL;