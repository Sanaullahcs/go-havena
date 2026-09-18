<?php

require __DIR__ . '/../backend/vendor/autoload.php';

$app = require __DIR__ . '/../backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$attempts = [
    ['country' => 'Pakistan', 'state' => 'Punjab'],
    ['country' => 'Pakistan', 'state' => 'Punjab Province'],
    ['country' => 'Pakistan', 'state' => 'PB'],
];

$out = [];
foreach ($attempts as $payload) {
    try {
        $response = Illuminate\Support\Facades\Http::acceptJson()
            ->timeout(15)
            ->post('https://countriesnow.space/api/v0.1/countries/state/cities', $payload);
        $data = $response->json('data');
        $out[] = [
            'payload' => $payload,
            'status' => $response->status(),
            'error' => $response->json('error'),
            'msg' => $response->json('msg'),
            'count' => is_array($data) ? count($data) : 0,
            'sample' => is_array($data) ? array_slice($data, 0, 8) : $data,
        ];
    } catch (Throwable $e) {
        $out[] = ['payload' => $payload, 'exception' => $e->getMessage()];
    }
}

try {
    $states = Illuminate\Support\Facades\Http::acceptJson()
        ->timeout(15)
        ->post('https://countriesnow.space/api/v0.1/countries/states', ['country' => 'Pakistan']);
    $stateNames = collect($states->json('data.states') ?? [])->pluck('name')->take(20)->values();
    $out[] = [
        'pakistan_states_status' => $states->status(),
        'pakistan_states' => $stateNames,
    ];
} catch (Throwable $e) {
    $out[] = ['pakistan_states_exception' => $e->getMessage()];
}

echo json_encode($out, JSON_PRETTY_PRINT);