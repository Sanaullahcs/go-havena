<?php

require __DIR__ . '/../backend/vendor/autoload.php';

$app = require __DIR__ . '/../backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$rows = DB::table('regions')
    ->leftJoin('states', 'states.id', '=', 'regions.state_id')
    ->where('regions.title', 'like', '%Lahore%')
    ->orWhere('regions.area', 'like', '%Lahore%')
    ->get([
        'regions.id',
        'regions.title',
        'regions.area',
        'regions.state',
        'regions.state_id',
        'states.name as state_name',
    ]);

echo json_encode($rows, JSON_PRETTY_PRINT);