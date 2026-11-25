<?php

require __DIR__ . '/../backend/vendor/autoload.php';

$app = require __DIR__ . '/../backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$state = DB::table('states')
    ->join('countries', 'countries.id', '=', 'states.country_id')
    ->where('countries.code', 'PK')
    ->where('states.name', 'like', '%Punjab%')
    ->select('states.*', 'countries.name as country_name', 'countries.code as country_code')
    ->first();

$cityCount = $state
    ? DB::table('cities')->where('state_id', $state->id)->count()
    : 0;

$sample = $state
    ? DB::table('cities')->where('state_id', $state->id)->orderBy('name')->limit(15)->pluck('name')
    : [];

$pkStates = DB::table('states')
    ->join('countries', 'countries.id', '=', 'states.country_id')
    ->where('countries.code', 'PK')
    ->get(['states.id', 'states.name']);

echo json_encode([
    'state' => $state,
    'city_count' => $cityCount,
    'sample' => $sample,
    'pk_states' => $pkStates,
], JSON_PRETTY_PRINT);