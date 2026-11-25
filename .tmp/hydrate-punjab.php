<?php

require __DIR__ . '/../backend/vendor/autoload.php';

$app = require __DIR__ . '/../backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$state = App\Models\State::query()
    ->where('status', 'active')
    ->whereHas('country', fn ($q) => $q->where('code', 'PK'))
    ->where('name', 'like', '%Punjab%')
    ->with('country')
    ->first();

if (! $state) {
    echo json_encode(['error' => 'Punjab not found']);
    return;
}

$directory = app(App\Services\OpenCityDirectory::class);
$cities = $directory->citiesForState($state);
$names = array_column($cities, 'name');

echo json_encode([
    'state_id' => $state->id,
    'state' => $state->name,
    'count' => count($cities),
    'has_lahore' => in_array('Lahore', $names, true),
    'sample' => array_slice($names, 0, 20),
], JSON_PRETTY_PRINT);