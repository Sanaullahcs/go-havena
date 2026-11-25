<?php

require __DIR__ . '/../backend/vendor/autoload.php';

$app = require __DIR__ . '/../backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$email = 'sanaullh6065cs@gmail.com';

$schema = [
    'email_otps' => Schema::hasTable('email_otps'),
    'users' => Schema::hasTable('users'),
];

$allOtps = $schema['email_otps']
    ? DB::table('email_otps')->orderByDesc('id')->limit(20)->get()
    : [];

$otpCount = $schema['email_otps'] ? DB::table('email_otps')->count() : null;
$userCount = $schema['users'] ? DB::table('users')->count() : null;

$users = $schema['users']
    ? DB::table('users')
        ->where('email', 'like', '%sanaull%')
        ->orWhere('email', 'like', '%6065%')
        ->orWhere('email', 'like', '%gohavena%')
        ->limit(20)
        ->get(['id', 'email', 'email_verified_at', 'role', 'created_at'])
    : [];

echo json_encode([
    'connection' => config('database.default'),
    'database' => config('database.connections.'.config('database.default').'.database'),
    'host' => config('database.connections.'.config('database.default').'.host'),
    'env' => app()->environment(),
    'fixed' => config('otp.fixed_code'),
    'now' => now()->toDateTimeString(),
    'schema' => $schema,
    'otp_count' => $otpCount,
    'user_count' => $userCount,
    'all_otps' => $allOtps,
    'matching_users' => $users,
], JSON_PRETTY_PRINT);