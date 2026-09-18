<?php
require '/home/gohvena/public_html/prod_apis/vendor/autoload.php';
$app = require '/home/gohvena/public_html/prod_apis/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$us = DB::table('countries')->where('code', 'US')->first();
$de = $us
    ? DB::table('states')->where('country_id', $us->id)->where('name', 'Delaware')->first()
    : null;
$deRegion = $de
    ? DB::table('regions')->where('state_id', $de->id)->whereNull('deleted_at')->first()
    : null;

echo json_encode([
    'countries' => DB::table('countries')->where('status', 'active')->count(),
    'states' => DB::table('states')->where('status', 'active')->count(),
    'us_states' => $us ? DB::table('states')->where('country_id', $us->id)->where('status', 'active')->count() : 0,
    'delaware' => $de->name ?? null,
    'delaware_region' => $deRegion->title ?? null,
    'active_regions' => DB::table('regions')->where('status', 'active')->whereNull('deleted_at')->count(),
    'cities_table' => Schema::hasTable('cities'),
], JSON_UNESCAPED_SLASHES) . "\n";
