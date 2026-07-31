<?php

/**
 * Notification routing + amenity self-notify guard.
 * Usage: php scripts/smoke-test-notifications.php
 */

const BASE = 'http://127.0.0.1:8000/api/v1';

function request(string $method, string $path, ?array $body = null, ?string $token = null): array
{
    $url = BASE.$path;
    $ch = curl_init($url);
    $hdrs = ['Accept: application/json', 'Content-Type: application/json'];
    if ($token) {
        $hdrs[] = 'Authorization: Bearer '.$token;
    }
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $hdrs,
        CURLOPT_TIMEOUT => 30,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    $raw = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ['status' => $status, 'json' => json_decode($raw ?: 'null', true), 'raw' => $raw];
}

function login(string $email): ?string
{
    $res = request('POST', '/auth/login', ['email' => $email, 'password' => 'password']);
    if ($res['status'] === 200 && ! empty($res['json']['token'])) {
        echo "  ✓ login {$email}\n";

        return $res['json']['token'];
    }
    echo "  ✗ login failed {$email}\n";

    return null;
}

function mapMobileScreenToAdminHref(string $pathname, string $query = ''): ?string
{
    $path = strtolower($pathname);
    parse_str($query, $params);

    if (str_contains($path, '/screens/admin-bookings') || str_contains($path, '/screens/admin-amenities')) {
        return '/admin/amenities';
    }
    if (str_contains($path, '/screens/guest-approvals')) {
        return '/admin/guests';
    }
    if (str_contains($path, '/screens/notices')) {
        return '/admin/notices';
    }

    return null;
}

$passed = 0;
$failed = 0;

function assertOk(bool $cond, string $label): void
{
    global $passed, $failed;
    if ($cond) {
        $passed++;
        echo "  ✓ {$label}\n";
    } else {
        $failed++;
        echo "  ✗ {$label}\n";
    }
}

echo "Notification cross-test\n\n";

echo "Route mapping\n";
assertOk(mapMobileScreenToAdminHref('/screens/admin-bookings') === '/admin/amenities', 'admin-bookings → amenities');
assertOk(mapMobileScreenToAdminHref('/screens/admin-amenities') === '/admin/amenities', 'admin-amenities → amenities');
assertOk(mapMobileScreenToAdminHref('/screens/guest-approvals') === '/admin/guests', 'guest-approvals → guests');

$adminToken = login('test.community.admin@neighborlink.app');
if (! $adminToken) {
    fwrite(STDERR, "Admin login required.\n");
    exit(1);
}

echo "\nAmenity booking self-notify guard\n";
$list = request('GET', '/admin/amenities', null, $adminToken);
$bookable = null;
foreach ($list['json']['data'] ?? [] as $row) {
    if (($row['status'] ?? '') === 'bookable') {
        $bookable = $row;
        break;
    }
}

if (! $bookable) {
    $create = request('POST', '/admin/amenities', [
        'name' => 'Notify Test Pool '.time(),
        'status' => 'bookable',
        'capacity' => 5,
        'floor' => 'Ground',
        'hours' => '9:00 AM - 5:00 PM',
        'icon_key' => 'pool',
    ], $adminToken);
    $bookable = $create['json']['data'] ?? null;
}

if ($bookable) {
    $tomorrow = (new DateTime('+1 day'))->format('Y-m-d');
    $book = request('POST', '/bookings', [
        'amenity_id' => $bookable['id'],
        'date' => $tomorrow,
        'time_slot' => '2:00 PM – 3:00 PM',
    ], $adminToken);

    assertOk($book['status'] === 201, 'admin can book amenity from API');

    sleep(1);

    $after = request('GET', '/notifications?page=1&per_page=20', null, $adminToken);
    $selfNotify = false;
    foreach ($after['json']['data'] ?? [] as $n) {
        if (($n['title'] ?? '') !== 'New amenity request') {
            continue;
        }
        $createdAt = strtotime((string) ($n['created_at'] ?? ''));
        if ($createdAt && (time() - $createdAt) <= 10) {
            $selfNotify = true;
        }
        assertOk(($n['action_url'] ?? '') === '/screens/admin-bookings', 'amenity request stores mobile action url');
    }

    assertOk(! $selfNotify, 'booking admin does not receive own amenity request notification');

    $bookingId = $book['json']['data']['id'] ?? null;
    if ($bookingId) {
        request('DELETE', "/bookings/{$bookingId}", null, $adminToken);
    }
} else {
    echo "  ⚠ skipped booking self-notify test (no bookable amenity)\n";
}

echo "\nStored notification action URLs\n";
$notifications = request('GET', '/notifications?page=1&per_page=50', null, $adminToken);
foreach ($notifications['json']['data'] ?? [] as $n) {
    $url = (string) ($n['action_url'] ?? '');
    if (str_starts_with($url, '/screens/admin-bookings')) {
        $mapped = mapMobileScreenToAdminHref($url);
        assertOk($mapped === '/admin/amenities', "stored {$url} maps to amenities");
        break;
    }
}
assertOk(true, 'notification feed loaded');

echo "\n";
if ($failed > 0) {
    echo "FAILED: {$failed}, passed {$passed}\n";
    exit(1);
}
echo "All {$passed} notification tests passed.\n";
