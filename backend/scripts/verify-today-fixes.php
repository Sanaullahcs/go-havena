<?php

/**
 * Live verification for fixes shipped today — run against dev DB + running API.
 */

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$base = rtrim(getenv('HAVENA_API_ORIGIN') ?: 'http://127.0.0.1:8000', '/');
$passed = 0;
$failed = 0;

function check(string $label, bool $ok, ?string $detail = null): void
{
    global $passed, $failed;
    if ($ok) {
        $passed++;
        echo "  ✓ {$label}".($detail ? " — {$detail}" : '').PHP_EOL;
        return;
    }
    $failed++;
    echo "  ✗ {$label}".($detail ? " — {$detail}" : '').PHP_EOL;
}

function httpJson(string $method, string $url, ?array $payload = null, ?string $token = null): array
{
    $headers = "Accept: application/json\r\n";
    if ($token) {
        $headers .= "Authorization: Bearer {$token}\r\n";
    }
    $body = null;
    if ($payload !== null) {
        $headers .= "Content-Type: application/json\r\n";
        $body = json_encode($payload);
    }

    $context = stream_context_create([
        'http' => [
            'method' => $method,
            'header' => $headers,
            'content' => $body ?? '',
            'timeout' => 60,
            'ignore_errors' => true,
        ],
    ]);

    $raw = @file_get_contents($url, false, $context);
    $status = 0;
    if (isset($http_response_header[0]) && preg_match('/\d{3}/', $http_response_header[0], $m)) {
        $status = (int) $m[0];
    }

    return [
        'status' => $status,
        'body' => json_decode($raw ?: 'null', true),
        'raw' => $raw,
    ];
}

echo PHP_EOL.'=== Havena — verify today fixes ==='.PHP_EOL.PHP_EOL;

/* 1. Backend health */
echo "Backend health".PHP_EOL;
$health = httpJson('GET', "{$base}/api/v1/health");
check('API health endpoint', $health['status'] === 200 && ($health['body']['data']['status'] ?? '') === 'ok');

$lan = @file_get_contents('http://192.168.0.134:8000/up', false, stream_context_create(['http' => ['timeout' => 5]]));
check('LAN API reachable (192.168.0.134:8000)', $lan !== false);

/* 2. Admin dashboard */
echo PHP_EOL.'Admin dashboard'.PHP_EOL;
$admin = App\Models\User::query()->where('email', 'admin@havena.app')->first();
check('System admin exists', $admin !== null);
$adminToken = $admin?->createToken('verify-today')->plainTextToken;
$dash = httpJson('GET', "{$base}/api/v1/admin/dashboard/stats", null, $adminToken);
check('Dashboard stats returns 200', $dash['status'] === 200, 'status='.$dash['status']);
$stats = $dash['body']['data']['stats'] ?? [];
check('Dashboard has stats payload', is_array($stats) && array_key_exists('total_communities', $stats));
check('Active regions counted', ($stats['active_regions'] ?? 0) >= 1, 'regions='.($stats['active_regions'] ?? 0));

/* 3. Community name uniqueness */
echo PHP_EOL.'Community name uniqueness (case-insensitive per region)'.PHP_EOL;
$existing = App\Models\Community::query()->whereNotNull('region_id')->first();
$region = $existing ? App\Models\Region::query()->find($existing->region_id) : null;
check('Seed region + community available', $region !== null && $existing !== null);

if ($region && $existing) {
    $duplicateName = strtoupper($existing->name);
    $dup = httpJson('POST', "{$base}/api/v1/admin/communities", [
        'name' => $duplicateName,
        'region_id' => $region->id,
        'address' => '123 Test St',
    ], $adminToken);
    check('Rejects duplicate name in same region', $dup['status'] === 422, 'status='.$dup['status']);

    $otherRegion = App\Models\Region::query()
        ->where('status', 'active')
        ->where('id', '!=', $region->id)
        ->first();
    if ($otherRegion) {
        $allow = httpJson('POST', "{$base}/api/v1/admin/communities", [
            'name' => $duplicateName.' '.uniqid(),
            'region_id' => $otherRegion->id,
            'address' => '456 Other St',
        ], $adminToken);
        $createdId = $allow['body']['data']['id'] ?? null;
        check('Allows new name in different region', in_array($allow['status'], [200, 201], true), 'status='.$allow['status']);
        if ($createdId) {
            App\Models\Community::query()->where('id', $createdId)->delete();
        }
    }
}

/* 4. Nearby places (OSM) */
echo PHP_EOL.'Nearby places / OSM'.PHP_EOL;
$communityWithPin = App\Models\Community::query()
    ->whereNotNull('latitude')
    ->whereNotNull('longitude')
    ->first();
check('Community with map pin exists', $communityWithPin !== null, $communityWithPin?->name);

if ($communityWithPin) {
    $resident = App\Models\User::factory()->create(['role' => 'resident', 'status' => 'active']);
    App\Models\CommunityMembership::query()->create([
        'user_id' => $resident->id,
        'community_id' => $communityWithPin->id,
        'role' => 'member',
        'status' => 'pending',
    ]);
    $residentToken = $resident->createToken('verify-nearby')->plainTextToken;
    $nearby = httpJson(
        'GET',
        "{$base}/api/v1/nearby-places?community_id={$communityWithPin->id}&all=1",
        null,
        $residentToken
    );
    $data = $nearby['body']['data'] ?? [];
    $count = 0;
    if (is_array($data)) {
        foreach ($data as $group) {
            if (is_array($group)) {
                $count += count($group);
            }
        }
    }
    check('Nearby places returns 200', $nearby['status'] === 200, 'status='.$nearby['status']);
    check('Nearby places returns businesses', $count > 0, "count={$count} for {$communityWithPin->name}");
    check('Overpass did not fail', ($nearby['body']['meta']['overpass_failed'] ?? true) === false);
}

/* 5. Onboarding — profile before approval */
echo PHP_EOL.'Onboarding — complete profile gate'.PHP_EOL;
$pendingCommunity = App\Models\Community::query()->where('status', 'active')->first();
if ($pendingCommunity) {
    $pendingResident = App\Models\User::factory()->create(['role' => 'resident', 'status' => 'active']);
    App\Models\CommunityMembership::query()->create([
        'user_id' => $pendingResident->id,
        'community_id' => $pendingCommunity->id,
        'role' => 'member',
        'status' => 'pending',
    ]);
    $me = httpJson('GET', "{$base}/api/v1/me", null, $pendingResident->createToken('verify-me')->plainTextToken);
    $profile = $me['body']['data']['profile'] ?? [];
    $memberships = $me['body']['data']['memberships'] ?? [];
    check('/me returns profile payload', is_array($profile));
    check(
        'Resident profile incomplete (mobile routes to complete-profile)',
        empty($profile['unit_number']) || empty($profile['residence_type'])
    );
    check(
        'Membership linked while profile incomplete',
        collect($memberships)->contains(fn ($m) => (int) ($m['community_id'] ?? 0) === (int) $pendingCommunity->id)
    );

    $ca = App\Models\User::factory()->create([
        'role' => 'community_admin',
        'community_admin_status' => 'pending',
        'status' => 'active',
        'name' => 'Incomplete Admin',
    ]);
    App\Models\Profile::query()->updateOrCreate(
        ['user_id' => $ca->id],
        ['display_name' => 'Incomplete Admin', 'unit_number' => null, 'utility_bill_url' => null]
    );
    App\Models\CommunityMembership::query()->create([
        'user_id' => $ca->id,
        'community_id' => $pendingCommunity->id,
        'role' => 'admin',
        'status' => 'approved',
    ]);
    $caMe = httpJson('GET', "{$base}/api/v1/me", null, $ca->createToken('verify-ca')->plainTextToken);
    $caAccess = $caMe['body']['data']['access'] ?? [];
    check('Community admin /me includes access payload', is_array($caAccess) && array_key_exists('profile_complete', $caAccess));
    check(
        'CA with linked community but incomplete profile',
        ($caAccess['has_linked_community'] ?? false) === true && ($caAccess['profile_complete'] ?? true) === false
    );
    check(
        'CA next_step prefers complete_profile over await_approval',
        ($caAccess['next_step'] ?? '') === 'complete_profile'
    );
}

/* 6. Frontend proxy */
echo PHP_EOL.'Frontend proxy'.PHP_EOL;
$proxy = @file_get_contents('http://127.0.0.1:3000/api/v1/health', false, stream_context_create(['http' => ['timeout' => 8]]));
check('Next.js /api proxy to Laravel', $proxy !== false && str_contains($proxy, '"status":"ok"'));

echo PHP_EOL."Results: {$passed} passed, {$failed} failed".PHP_EOL.PHP_EOL;
exit($failed > 0 ? 1 : 0);
