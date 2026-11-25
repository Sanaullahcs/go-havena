<?php

/**
 * End-to-end smoke test over HTTP for the Acton community: OTP login as the
 * community admin and as a resident, then read back the pages each of them
 * sees in the portal.
 *
 * Usage: php scripts/smoke-acton-api.php [base-url]
 */

$base = rtrim($argv[1] ?? 'http://127.0.0.1:8000/api/v1', '/');
$otp = '221322';

$failures = 0;

function request(string $method, string $url, array $body = [], ?string $token = null): array
{
    $headers = ['Accept: application/json'];
    if ($body !== []) {
        $headers[] = 'Content-Type: application/json';
    }
    if ($token) {
        $headers[] = 'Authorization: Bearer '.$token;
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 30,
    ]);
    if ($body !== []) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }

    $raw = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($raw === false) {
        return ['status' => 0, 'json' => null, 'error' => $error];
    }

    return ['status' => $status, 'json' => json_decode((string) $raw, true), 'raw' => $raw];
}

function login(string $base, string $email, string $otp): ?string
{
    $start = request('POST', $base.'/auth/otp/request', ['email' => $email]);
    if ($start['status'] >= 300) {
        echo "  ! otp/request {$email} -> HTTP {$start['status']} ".substr((string) ($start['raw'] ?? ''), 0, 200)."\n";

        return null;
    }

    $verify = request('POST', $base.'/auth/otp/verify', ['email' => $email, 'code' => $otp]);
    $token = $verify['json']['data']['token'] ?? $verify['json']['token'] ?? null;

    if (! $token) {
        echo "  ! otp/verify {$email} -> HTTP {$verify['status']} ".substr((string) ($verify['raw'] ?? ''), 0, 300)."\n";

        return null;
    }

    return $token;
}

/**
 * @param  callable(array): (int|string)  $summarise
 */
function check(string $label, array $response, callable $summarise): bool
{
    global $failures;

    if ($response['status'] !== 200) {
        printf("  FAIL %-42s HTTP %d %s\n", $label, $response['status'], substr((string) ($response['raw'] ?? ''), 0, 160));
        $failures++;

        return false;
    }

    $summary = $summarise($response['json'] ?? []);

    if ($summary === 0 || $summary === '0' || $summary === '') {
        printf("  EMPTY %-41s (200 but no rows)\n", $label);
        $failures++;

        return false;
    }

    printf("  ok   %-42s %s\n", $label, $summary);

    return true;
}

$rows = fn (array $json) => count($json['data']['data'] ?? $json['data'] ?? []);

echo "Base: {$base}\n\n";

/* ───────────────── community admin ───────────────── */

echo "Community admin — acton@gohavena.com\n";
$adminToken = login($base, 'acton@gohavena.com', $otp);

if (! $adminToken) {
    echo "  cannot continue without an admin token\n";
    exit(1);
}

$me = request('GET', $base.'/me', [], $adminToken);
check('me', $me, function (array $json) {
    $user = $json['data']['user'] ?? $json['data'] ?? [];
    $communities = array_filter(array_map(
        fn ($m) => $m['community']['name'] ?? null,
        $user['memberships'] ?? $json['data']['memberships'] ?? [],
    ));

    return sprintf(
        '%s (%s) · %s',
        $user['name'] ?? '?',
        $user['role'] ?? '?',
        $communities ? implode(', ', $communities) : 'no community',
    );
});

$adminEndpoints = [
    'admin dashboard stats' => '/admin/dashboard/stats',
    'admin members' => '/admin/members',
    'admin amenities' => '/admin/amenities',
    'admin bookings' => '/admin/bookings',
    'admin notices' => '/admin/notices',
    'admin events' => '/admin/notices?category=event',
    'admin posts' => '/admin/posts',
    'admin listings' => '/listings',
    'admin businesses' => '/businesses',
    'admin deals' => '/admin/deals',
    'admin community rules' => '/admin/community-rules',
    'admin documents' => '/admin/documents',
    'admin billing' => '/admin/billing',
];

foreach ($adminEndpoints as $label => $path) {
    $response = request('GET', $base.$path, [], $adminToken);
    if ($response['status'] === 404) {
        printf("  skip %-42s (no such route)\n", $label);

        continue;
    }
    check($label, $response, function (array $json) use ($rows) {
        $data = $json['data'] ?? [];
        if (isset($data['data']) && is_array($data['data'])) {
            return count($data['data']).' rows';
        }
        if (array_is_list($data)) {
            return count($data).' rows';
        }

        return implode(' · ', array_map(
            fn ($k, $v) => $k.'='.(is_scalar($v) ? $v : (is_array($v) ? count($v).' items' : '?')),
            array_slice(array_keys($data), 0, 5),
            array_slice(array_values($data), 0, 5),
        )) ?: $rows($json).' rows';
    });
}

/* ───────────────── resident ───────────────── */

echo "\nResident — resident.acton@gohavena.com\n";
$residentToken = login($base, 'resident.acton@gohavena.com', $otp);

if (! $residentToken) {
    echo "  cannot continue without a resident token\n";
    exit(1);
}

$residentEndpoints = [
    'dashboard stats' => '/dashboard/stats',
    'notices' => '/notices',
    'events' => '/notices?category=event',
    'feed' => '/feed',
    'amenities' => '/amenities',
    'my bookings' => '/bookings',
    'marketplace listings' => '/listings',
    'businesses' => '/businesses',
    'deals' => '/deals',
    'community rules' => '/community-rules',
    'documents' => '/documents',
    'neighbours' => '/community-members',
    'ach capability' => '/plaid/resident/capability',
];

foreach ($residentEndpoints as $label => $path) {
    $response = request('GET', $base.$path, [], $residentToken);
    if ($response['status'] === 404) {
        printf("  skip %-42s (no such route)\n", $label);

        continue;
    }
    check($label, $response, function (array $json) {
        $data = $json['data'] ?? [];
        if (isset($data['data']) && is_array($data['data'])) {
            return count($data['data']).' rows';
        }
        if (array_is_list($data)) {
            return count($data).' rows';
        }

        return implode(' · ', array_map(
            fn ($k, $v) => $k.'='.(is_scalar($v) ? $v : (is_array($v) ? count($v).' items' : '?')),
            array_slice(array_keys($data), 0, 6),
            array_slice(array_values($data), 0, 6),
        ));
    });
}

/* ───────────── shared billing, both sides ───────────── */

echo "\nShared billing\n";

$amenities = request('GET', $base.'/amenities', [], $residentToken);
$billed = null;
foreach ($amenities['json']['data']['data'] ?? $amenities['json']['data'] ?? [] as $amenity) {
    if (! empty($amenity['shared_billing_enabled'])) {
        $billed = $amenity;
        break;
    }
}

if (! $billed) {
    echo "  FAIL no amenity with shared_billing_enabled returned to the resident\n";
    $failures++;
} else {
    printf("  amenity: %s (#%d) \$%s due day %s\n", $billed['name'], $billed['id'], $billed['shared_billing_amount'], $billed['shared_billing_due_day']);

    check('resident bills for amenity', request('GET', $base.'/amenities/'.$billed['id'].'/bills', [], $residentToken), function (array $json) {
        $bills = $json['data']['bills'] ?? $json['data']['data'] ?? $json['data'] ?? [];

        return count($bills).' bills'.(isset($bills[0]['status_label']) ? ' · first: '.$bills[0]['status_label'] : '');
    });

    check('admin bill runs for amenity', request('GET', $base.'/admin/amenities/'.$billed['id'].'/bills', [], $adminToken), function (array $json) {
        $runs = $json['data']['bills'] ?? $json['data']['data'] ?? $json['data'] ?? [];

        return count($runs).' monthly runs';
    });
}

echo "\n";
if ($failures === 0) {
    echo "All checks passed.\n";
    exit(0);
}

echo "{$failures} check(s) failed.\n";
exit(1);
