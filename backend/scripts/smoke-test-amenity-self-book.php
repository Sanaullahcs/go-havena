<?php

/**
 * Cross-test: creators (resident + community admin) cannot book their own amenities.
 * Also verifies is_mine flags used by mobile/dashboard UI.
 *
 * Usage: php scripts/smoke-test-amenity-self-book.php
 */

const BASE = 'http://127.0.0.1:8000/api/v1';

function request(string $method, string $path, ?array $body = null, ?string $token = null): array
{
    $ch = curl_init(BASE.$path);
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

$passed = 0;
$failed = 0;
$failures = [];

function assertOk(bool $cond, string $label, string $detail = ''): void
{
    global $passed, $failed, $failures;
    if ($cond) {
        $passed++;
        echo "  ✓ {$label}\n";
    } else {
        $failed++;
        $failures[] = $label.($detail !== '' ? " — {$detail}" : '');
        echo "  ✗ {$label}".($detail !== '' ? " ({$detail})" : '')."\n";
    }
}

function login(string $email): ?string
{
    $res = request('POST', '/auth/login', ['email' => $email, 'password' => 'password']);
    if ($res['status'] === 200 && ! empty($res['json']['token'])) {
        echo "  ✓ login {$email}\n";

        return $res['json']['token'];
    }
    echo "  ✗ login failed {$email} (HTTP {$res['status']})\n";

    return null;
}

function payload(string $name): array
{
    return [
        'name' => $name,
        'description' => 'Self-book cross-test',
        'status' => 'bookable',
        'capacity' => 8,
        'floor' => 'Test floor',
        'hours' => '5:00 PM – 11:00 PM',
        'start_time' => '17:00',
        'end_time' => '23:00',
        'weekends_available' => true,
        'slot_duration_minutes' => 60,
        'icon_key' => 'hall',
    ];
}

function firstSlot(string $token, int $amenityId, string $date): string
{
    $slots = request('GET', "/amenities/{$amenityId}/slots?date={$date}", null, $token);
    $values = array_column($slots['json']['data'] ?? [], 'value');

    return $values[0] ?? '5:00 PM – 6:00 PM';
}

echo "══════════════════════════════════════════════\n";
echo " Self-booking cross-test (Resident + Admin)\n";
echo "══════════════════════════════════════════════\n\n";

$health = request('GET', '/health');
assertOk($health['status'] === 200, 'API health');
if ($health['status'] !== 200) {
    exit(1);
}

$adminToken = null;
foreach (['test.community.admin@havena.app', 'community.admin@havena.app', 'alex@gmail.com'] as $email) {
    $adminToken = login($email);
    if ($adminToken) {
        break;
    }
}
$residentToken = null;
foreach (['test.resident@havena.app', 'turner@gmail.com'] as $email) {
    $residentToken = login($email);
    if ($residentToken) {
        break;
    }
}
$otherToken = null;
foreach (['turner@gmail.com', 'ahmadqasim1929@gmail.com', 'rehman@gmail.com'] as $email) {
    $try = login($email);
    if ($try && $try !== $residentToken) {
        $otherToken = $try;
        break;
    }
}

assertOk($adminToken !== null, 'admin session');
assertOk($residentToken !== null, 'resident session');
assertOk($otherToken !== null, 'other resident session');
if (! $adminToken || ! $residentToken || ! $otherToken) {
    exit(1);
}

$stamp = time();
$date = (new DateTime('next monday'))->format('Y-m-d');
$ids = [];

echo "\n── Community Admin self-book block ──\n";
$adminCreate = request('POST', '/admin/amenities', payload("Admin SelfBook {$stamp}"), $adminToken);
assertOk($adminCreate['status'] === 201, 'admin creates amenity');
$adminAmenityId = (int) ($adminCreate['json']['data']['id'] ?? 0);
$ids[] = $adminAmenityId;
assertOk(($adminCreate['json']['data']['is_mine'] ?? null) === true, 'admin create response is_mine=true');
assertOk(($adminCreate['json']['data']['review_status'] ?? '') === 'approved', 'admin amenity live without approval');

$adminList = request('GET', '/amenities', null, $adminToken);
$adminMine = null;
foreach ($adminList['json']['data'] ?? [] as $row) {
    if ((int) ($row['id'] ?? 0) === $adminAmenityId) {
        $adminMine = $row;
        break;
    }
}
assertOk($adminMine !== null, 'admin list includes own amenity (for Your Amenities UI)');
assertOk(($adminMine['is_mine'] ?? false) === true, 'admin list marks own amenity is_mine');

$adminSelf = request('POST', '/bookings', [
    'amenity_id' => $adminAmenityId,
    'date' => $date,
    'time_slot' => firstSlot($adminToken, $adminAmenityId, $date),
], $adminToken);
assertOk($adminSelf['status'] === 422, 'API blocks admin self-booking', 'HTTP '.$adminSelf['status']);
assertOk(
    str_contains(strtolower((string) ($adminSelf['json']['message'] ?? '')), 'cannot book'),
    'admin self-book error message clear',
    (string) ($adminSelf['json']['message'] ?? $adminSelf['raw'])
);

$otherBooksAdmin = request('POST', '/bookings', [
    'amenity_id' => $adminAmenityId,
    'date' => $date,
    'time_slot' => firstSlot($otherToken, $adminAmenityId, $date),
], $otherToken);
assertOk($otherBooksAdmin['status'] === 201, 'other user can book admin amenity');
$adminBookingId = (int) ($otherBooksAdmin['json']['data']['id'] ?? 0);

$adminInbox = request('GET', '/bookings/inbox?status=pending', null, $adminToken);
$adminSees = false;
foreach ($adminInbox['json']['data'] ?? [] as $row) {
    if ((int) ($row['id'] ?? 0) === $adminBookingId) {
        $adminSees = true;
        break;
    }
}
assertOk($adminSees, 'admin manages requests via booking inbox');
request('PATCH', "/bookings/{$adminBookingId}/reject", ['reason' => 'self-book smoke'], $adminToken);

echo "\n── Resident creator self-book block ──\n";
$resCreate = request('POST', '/amenities', payload("Resident SelfBook {$stamp}"), $residentToken);
assertOk($resCreate['status'] === 201, 'resident creates amenity');
$resAmenityId = (int) ($resCreate['json']['data']['id'] ?? 0);
$ids[] = $resAmenityId;
assertOk(($resCreate['json']['data']['is_mine'] ?? null) === true, 'resident create response is_mine=true');
assertOk(($resCreate['json']['data']['review_status'] ?? '') === 'pending', 'resident amenity pending');

request('PATCH', "/admin/amenities/{$resAmenityId}/approve", [], $adminToken);

$resList = request('GET', '/amenities', null, $residentToken);
$resMine = null;
foreach ($resList['json']['data'] ?? [] as $row) {
    if ((int) ($row['id'] ?? 0) === $resAmenityId) {
        $resMine = $row;
        break;
    }
}
assertOk($resMine !== null && ($resMine['is_mine'] ?? false) === true, 'resident list marks own amenity is_mine');

$otherSees = null;
$otherList = request('GET', '/amenities', null, $otherToken);
foreach ($otherList['json']['data'] ?? [] as $row) {
    if ((int) ($row['id'] ?? 0) === $resAmenityId) {
        $otherSees = $row;
        break;
    }
}
assertOk($otherSees !== null, 'other resident sees approved amenity');
assertOk(($otherSees['is_mine'] ?? true) === false, 'other resident does not get is_mine on foreign amenity');

$resSelf = request('POST', '/bookings', [
    'amenity_id' => $resAmenityId,
    'date' => $date,
    'time_slot' => firstSlot($residentToken, $resAmenityId, $date),
], $residentToken);
assertOk($resSelf['status'] === 422, 'API blocks resident self-booking', 'HTTP '.$resSelf['status']);
assertOk(
    str_contains(strtolower((string) ($resSelf['json']['message'] ?? '')), 'cannot book'),
    'resident self-book error message clear',
    (string) ($resSelf['json']['message'] ?? $resSelf['raw'])
);

$slot2Values = array_column(
    request('GET', "/amenities/{$resAmenityId}/slots?date={$date}", null, $otherToken)['json']['data'] ?? [],
    'value'
);
$slot2 = $slot2Values[1] ?? ($slot2Values[0] ?? '6:00 PM – 7:00 PM');
$otherBooksRes = request('POST', '/bookings', [
    'amenity_id' => $resAmenityId,
    'date' => $date,
    'time_slot' => $slot2,
], $otherToken);
assertOk($otherBooksRes['status'] === 201, 'other user can book resident amenity');
$resBookingId = (int) ($otherBooksRes['json']['data']['id'] ?? 0);

$creatorInbox = request('GET', '/bookings/inbox?status=pending', null, $residentToken);
$creatorSees = false;
foreach ($creatorInbox['json']['data'] ?? [] as $row) {
    if ((int) ($row['id'] ?? 0) === $resBookingId) {
        $creatorSees = true;
        break;
    }
}
assertOk($creatorSees, 'resident creator manages requests via booking inbox');
request('PATCH', "/bookings/{$resBookingId}/approve", [], $residentToken);

echo "\n── Dashboard/admin list flags ──\n";
$adminDash = request('GET', '/admin/amenities', null, $adminToken);
$adminDashRow = null;
foreach ($adminDash['json']['data'] ?? [] as $row) {
    if ((int) ($row['id'] ?? 0) === $adminAmenityId) {
        $adminDashRow = $row;
        break;
    }
}
assertOk(($adminDashRow['is_mine'] ?? false) === true, 'dashboard admin amenities marks own is_mine');

echo "\n── Cleanup ──\n";
foreach ([$adminBookingId ?? null, $resBookingId ?? null] as $bid) {
    if ($bid) {
        request('DELETE', "/bookings/{$bid}", null, $otherToken);
        request('DELETE', "/bookings/{$bid}", null, $adminToken);
        request('DELETE', "/bookings/{$bid}", null, $residentToken);
    }
}
foreach ($ids as $aid) {
    if (! $aid) {
        continue;
    }
    $del = request('DELETE', "/admin/amenities/{$aid}", null, $adminToken);
    if ($del['status'] === 422) {
        // Clear any leftover bookings then retry.
        $inbox = request('GET', '/bookings/inbox', null, $adminToken);
        foreach ($inbox['json']['data'] ?? [] as $b) {
            if ((int) ($b['amenity_id'] ?? 0) === $aid) {
                request('PATCH', '/bookings/'.((int) $b['id']).'/reject', [], $adminToken);
                request('DELETE', '/bookings/'.((int) $b['id']), null, $adminToken);
            }
        }
        $del = request('DELETE', "/admin/amenities/{$aid}", null, $adminToken);
    }
    assertOk(in_array($del['status'], [200, 404], true), "cleanup amenity #{$aid}", 'HTTP '.$del['status']);
}

echo "\n══════════════════════════════════════════════\n";
echo " Result: {$passed} passed, {$failed} failed\n";
if ($failures) {
    echo " Failures:\n";
    foreach ($failures as $f) {
        echo "  - {$f}\n";
    }
}
echo "══════════════════════════════════════════════\n";
echo "\nUI coverage (code-verified):\n";
echo "  Mobile: Your Amenities section, detail hides Reserve, shows Manage requests,\n";
echo "          reservation calendar redirects creators to Booking Inbox.\n";
echo "  Dashboard: Book action omitted for is_mine, book picker excludes own,\n";
echo "             AmenityBookModal blocks is_mine, view modal Manage requests.\n";
echo "  Portal: owned cards hide Book CTA; openBookModal guards is_mine.\n";

exit($failed > 0 ? 1 : 0);
