<?php

require __DIR__ . '/../backend/vendor/autoload.php';

$app = require __DIR__ . '/../backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$us = DB::table('countries')->where('code', 'US')->first();
$pk = DB::table('countries')->where('code', 'PK')->first();

echo json_encode([
    'countries' => Schema::hasTable('countries') ? DB::table('countries')->where('status', 'active')->count() : 0,
    'states' => Schema::hasTable('states') ? DB::table('states')->where('status', 'active')->count() : 0,
    'cities' => Schema::hasTable('cities') ? DB::table('cities')->count() : 0,
    'regions' => DB::table('regions')->where('status', 'active')->count(),
    'us' => $us,
    'us_states' => $us ? DB::table('states')->where('country_id', $us->id)->where('status', 'active')->count() : 0,
    'pk' => $pk,
    'pk_states' => $pk ? DB::table('states')->where('country_id', $pk->id)->where('status', 'active')->count() : 0,
    'sample_regions' => DB::table('regions')->where('status', 'active')->orderBy('title')->limit(8)->get(['id', 'title', 'area', 'state_id']),
], JSON_PRETTY_PRINT);