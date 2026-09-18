<?php

require __DIR__ . '/../backend/vendor/autoload.php';

$app = require __DIR__ . '/../backend/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);

$email = 'sanaullah6065cs@gmail.com';
$otp = app(App\Services\OtpService::class);
$otp->send($email);

DB::table('email_otps')
    ->where('email', $email)
    ->update([
        'attempts' => 0,
        'expires_at' => now()->addHours(2),
        'updated_at' => now(),
    ]);

$request = Illuminate\Http\Request::create('/api/v1/auth/otp/verify', 'POST', [
    'email' => $email,
    'code' => '123456',
    'intent' => 'login',
]);
$request->headers->set('Accept', 'application/json');

$response = $kernel->handle($request);

echo json_encode([
    'status' => $response->getStatusCode(),
    'body' => json_decode($response->getContent(), true),
    'user' => DB::table('users')->where('email', $email)->first(['id', 'email', 'role', 'community_admin_status', 'email_verified_at']),
    'otp_rows' => DB::table('email_otps')->where('email', $email)->get(),
], JSON_PRETTY_PRINT);