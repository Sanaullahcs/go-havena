<?php

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\Community;
use App\Services\CommunityCurrencyService;
use App\Support\Currency;
use Illuminate\Support\Facades\DB;

echo "=== communities.currency ===\n";
foreach (DB::table('communities')->orderBy('id')->get(['id', 'name', 'region', 'currency']) as $c) {
    printf("#%-3d %-10s %-34s %s\n", $c->id, $c->currency ?? 'NULL', mb_substr((string) $c->name, 0, 34), $c->region);
}

echo "\n=== resolver ===\n";
$svc = app(CommunityCurrencyService::class);
foreach (Community::query()->orderBy('id')->get() as $c) {
    printf("#%-3d %-4s %s\n", $c->id, $svc->forCommunity($c), $c->name);
}

echo "\n=== pakistan regions -> currency ===\n";
foreach (App\Models\Region::query()->with('stateRecord.country')->get() as $r) {
    $cur = $svc->forRegion($r);
    if ($cur !== 'USD') {
        printf("#%-3d %-4s %s\n", $r->id, $cur, $r->title);
    }
}

echo "\n=== format samples ===\n";
foreach (['USD' => [75, 1250.5, 18000], 'PKR' => [18000, 2500, 450000]] as $code => $amounts) {
    foreach ($amounts as $a) {
        echo str_pad($code, 5).' '.Currency::format($a, $code)."\n";
    }
}
