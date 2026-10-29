<?php

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\CommunityAdminAccessService;
use Illuminate\Http\Request;

$emails = $argv[1] ?? 'admin@gohavena.com,resident@gohavena.com';

foreach (explode(',', $emails) as $email) {
    $email = trim($email);
    $user = User::query()->where('email', $email)->first();
    if (! $user) {
        echo "-- {$email}: not found\n";
        continue;
    }

    $user->load(['profile.region', 'memberships.community']);
    $payload = (new UserResource($user))->toArray(Request::create('/api/v1/me'));

    echo "-- {$email} ({$user->role})\n";
    echo "   user.currency = ".var_export($payload['currency'] ?? null, true)."\n";

    foreach ($payload['memberships'] ?? [] as $m) {
        $c = $m['community'] ?? null;
        if ($c) {
            echo "   membership #{$c['id']} {$c['name']} -> ".var_export($c['currency'] ?? null, true)."\n";
        }
    }

    if ($user->role === 'community_admin') {
        $access = app(CommunityAdminAccessService::class)->accessPayload($user);
        echo "   access.country_code = ".var_export($access['country_code'], true)."\n";
        echo "   access.currency     = ".var_export($access['currency'], true)."\n";
    }
}
