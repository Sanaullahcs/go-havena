<?php

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$user = App\Models\User::query()->where('email', 'admin@havena.app')->first();
if (! $user) {
    echo "no admin user\n";
    exit(1);
}

$token = $user->createToken('probe-dashboard')->plainTextToken;
$request = Illuminate\Http\Request::create('/api/v1/admin/dashboard/stats', 'GET');
$request->headers->set('Authorization', 'Bearer '.$token);
$request->headers->set('Accept', 'application/json');

$response = $kernel->handle($request);
echo 'status='.$response->getStatusCode().PHP_EOL;
if ($response->getStatusCode() >= 400) {
    echo $response->getContent().PHP_EOL;
    exit(1);
}
$data = json_decode($response->getContent(), true);
echo 'communities='.($data['data']['stats']['total_communities'] ?? '?').PHP_EOL;
echo 'regions='.($data['data']['stats']['active_regions'] ?? '?').PHP_EOL;
