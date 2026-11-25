<?php

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$updated = Illuminate\Support\Facades\DB::table('users')
    ->where('email', 'hay.resident@gohavena.com')
    ->update([
        'email' => 'haly.resident@gohavena.com',
        'updated_at' => now(),
    ]);

$row = Illuminate\Support\Facades\DB::table('users')
    ->where('email', 'haly.resident@gohavena.com')
    ->first(['id', 'email', 'role', 'status']);

echo "updated={$updated}\n";
echo $row ? "#{$row->id} {$row->email} {$row->role} {$row->status}\n" : "missing\n";
