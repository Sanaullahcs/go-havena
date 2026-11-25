<?php

require __DIR__ . '/../backend/vendor/autoload.php';

$app = require __DIR__ . '/../backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$columns = Schema::hasTable('invite_codes')
    ? Schema::getColumnListing('invite_codes')
    : [];

$migration = DB::table('migrations')
    ->where('migration', 'like', '%invite%')
    ->orWhere('migration', 'like', '%2026_09_10%')
    ->get();

$user = DB::table('users')->where('id', 56)->orWhere('email', 'like', '%sanaullah6065%')->get(['id', 'email', 'email_verified_at', 'role', 'created_at']);

echo json_encode([
    'has_invite_codes' => Schema::hasTable('invite_codes'),
    'has_deleted_at' => Schema::hasColumn('invite_codes', 'deleted_at'),
    'columns' => $columns,
    'related_migrations' => $migration,
    'users' => $user,
], JSON_PRETTY_PRINT);