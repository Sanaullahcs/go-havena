<?php

/**
 * Live API cross-test for amenities (create/approve, slots, open booking, creator inbox).
 * Usage: php scripts/smoke-test-amenities.php
 */

const BASE = 'http://127.0.0.1:8000/api/v1';

function request(string $method, string $path, ?array $body = null, ?string $token = null, array $headers = []): array
{
    $url = BASE.$path;
    $ch = curl_init($url);
    $hdrs = ['Accept: application/json', 'Content-Type: application/json'];
    if ($token) {
        $hdrs[] = 'Authorization: Bearer '.$token;
    }
    foreach ($headers as $h) {
        $hdrs[] = $h;
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
    $json = json_decode($raw ?: 'null', true);

    return ['status' => $status, 'json' => $json, 'raw' => $raw];
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

function login(string $email): ?string
{
    $res = request('POST', '/auth/login', ['email' => $email, 'password' => 'password']);
    if ($res['status'] === 200 && ! empty($res['json']['token'])) {
        echo "  ✓ login {$email}\n";

        return $res['json']['token'];
    }
    echo "  ✗ login failed for {$email} (HTTP {$res['status']})\n";

    return null;
}

echo "Amenities module cross-test\n\n";

$health = request('GET', '/health');
assertOk($health['status'] === 200, 'API health check');

$adminEmails = [
    'test.community.admin@neighborlink.app',
    'community.admin@neighborlink.app',
    'alex@gmail.com',
];
$adminToken = null;
foreach ($adminEmails as $email) {
    $adminToken = login($email);
    if ($adminToken) {
        break;
    }
}
if (! $adminToken) {
    fwrite(STDERR, "\nNo community admin login available. Seed users first.\n");
    exit(1);
}

$residentEmails = [
    'test.resident@neighborlink.app',
    'turner@gmail.com',
];
$residentToken = null;
foreach ($residentEmails as $email) {
    $residentToken = login($email);
    if ($residentToken) {
        break;
    }
}
assertOk($residentToken !== null, 'resident login');

echo "\nAdmin list & filters\n";
$list = request('GET', '/admin/amenities', null, $adminToken);
assertOk($list['status'] === 200, 'GET /admin/amenities');
assertOk(isset($list['json']['data']) && is_array($list['json']['data']), 'admin list returns data array');
$initialCount = count($list['json']['data']);

echo "\nValidation\n";
$badCreate = request('POST', '/admin/amenities', [
    'name' => '',
    'status' => 'invalid',
    'icon_key' => 'not-an-icon',
], $adminToken);
assertOk($badCreate['status'] === 422, 'reject invalid create payload');

echo "\nAdmin CRUD\n";
$stamp = time();
$createPayload = [
    'name' => "Cross-test Amenity {$stamp}",
    'description' => 'Automated cross-test facility.',
    'status' => 'bookable',
    'capacity' => 12,
    'floor' => 'Level 1',
    'hours' => '9:00 AM – 5:00 PM',
    'start_time' => '09:00',
    'end_time' => '17:00',
    'weekends_available' => true,
    'slot_duration_minutes' => 60,
    'icon_key' => 'meeting',
];
$create = request('POST', '/admin/amenities', $createPayload, $adminToken);
assertOk($create['status'] === 201, 'POST /admin/amenities creates amenity');
$amenityId = $create['json']['data']['id'] ?? null;
assertOk($amenityId !== null, 'create returns amenity id');
assertOk(($create['json']['data']['review_status'] ?? '') === 'approved', 'admin create is approved');

$weekday = new DateTime('next monday');
$weekdayKey = $weekday->format('Y-m-d');
$slots = request('GET', "/amenities/{$amenityId}/slots?date={$weekdayKey}", null, $residentToken);
assertOk($slots['status'] === 200, 'GET amenity slots');
$slotValues = array_column($slots['json']['data'] ?? [], 'value');
assertOk(count($slotValues) > 0, 'slots generated from hours + duration');
$firstSlot = $slotValues[0] ?? '9:00 AM – 10:00 AM';

echo "\nResident amenity submission\n";
$residentCreate = request('POST', '/amenities', [
    'name' => "Resident Amenity {$stamp}",
    'description' => 'Needs admin approval.',
    'status' => 'bookable',
    'capacity' => 8,
    'floor' => 'Roof',
    'hours' => '5:00 PM – 11:00 PM',
    'start_time' => '17:00',
    'end_time' => '23:00',
    'weekends_available' => true,
    'slot_duration_minutes' => 60,
    'icon_key' => 'terrace',
], $residentToken);
assertOk($residentCreate['status'] === 201, 'resident can create amenity');
$residentAmenityId = $residentCreate['json']['data']['id'] ?? null;
assertOk(($residentCreate['json']['data']['review_status'] ?? '') === 'pending', 'resident amenity pending review');

$approveAmenity = request('PATCH', "/admin/amenities/{$residentAmenityId}/approve", [], $adminToken);
assertOk($approveAmenity['status'] === 200, 'admin approves resident amenity');

echo "\nBooking rules\n";
$book = request('POST', '/bookings', [
    'amenity_id' => $amenityId,
    'date' => $weekdayKey,
    'time_slot' => $firstSlot,
    'guests' => 2,
], $residentToken);
assertOk($book['status'] === 201, 'resident can book bookable amenity');
$bookingId = $book['json']['data']['id'] ?? null;
assertOk($bookingId !== null, 'booking returns id');

$duplicate = request('POST', '/bookings', [
    'amenity_id' => $amenityId,
    'date' => $weekdayKey,
    'time_slot' => $firstSlot,
    'guests' => 1,
], $residentToken);
assertOk($duplicate['status'] === 422, 'reject duplicate slot booking');

$openAmenity = request('POST', '/admin/amenities', [
    'name' => "Open Access {$stamp}",
    'status' => 'open',
    'capacity' => 5,
    'floor' => 'Roof',
    'hours' => '6:00 AM – 8:00 PM',
    'start_time' => '06:00',
    'end_time' => '20:00',
    'weekends_available' => true,
    'icon_key' => 'terrace',
], $adminToken);
$openId = $openAmenity['json']['data']['id'] ?? null;
$bookOpen = request('POST', '/bookings', [
    'amenity_id' => $openId,
    'date' => $weekdayKey,
], $residentToken);
assertOk($bookOpen['status'] === 201, 'open amenity accepts access request without slot');

$closedAmenity = request('POST', '/admin/amenities', [
    'name' => "Closed Facility {$stamp}",
    'status' => 'closed',
    'capacity' => 0,
    'floor' => 'N/A',
    'hours' => '9:00 AM – 5:00 PM',
    'start_time' => '09:00',
    'end_time' => '17:00',
    'weekends_available' => false,
    'icon_key' => 'building',
], $adminToken);
$closedId = $closedAmenity['json']['data']['id'] ?? null;
$bookClosed = request('POST', '/bookings', [
    'amenity_id' => $closedId,
    'date' => $weekdayKey,
    'time_slot' => '3:00 PM – 4:00 PM',
], $residentToken);
assertOk($bookClosed['status'] === 422, 'cannot book closed amenity');

echo "\nCreator / admin booking inbox\n";
$inbox = request('GET', '/bookings/inbox', null, $adminToken);
assertOk($inbox['status'] === 200, 'GET /bookings/inbox');
$approve = request('PATCH', "/bookings/{$bookingId}/approve", [], $adminToken);
assertOk($approve['status'] === 200, 'PATCH approve booking');

$cancel = request('DELETE', "/bookings/{$bookingId}", null, $residentToken);
assertOk($cancel['status'] === 200, 'DELETE cancel own booking');

echo "\nCleanup\n";
$deleteWithBooking = request('POST', '/bookings', [
    'amenity_id' => $amenityId,
    'date' => $weekdayKey,
    'time_slot' => $slotValues[1] ?? '10:00 AM – 11:00 AM',
], $residentToken);
$pendingId = $deleteWithBooking['json']['data']['id'] ?? null;
$deleteBlocked = request('DELETE', "/admin/amenities/{$amenityId}", null, $adminToken);
assertOk($deleteBlocked['status'] === 422, 'cannot delete amenity with active booking');

if ($pendingId) {
    request('DELETE', "/bookings/{$pendingId}", null, $residentToken);
}
$openBookingId = $bookOpen['json']['data']['id'] ?? null;
if ($openBookingId) {
    request('DELETE', "/bookings/{$openBookingId}", null, $residentToken);
}

$deleteOk = request('DELETE', "/admin/amenities/{$amenityId}", null, $adminToken);
assertOk($deleteOk['status'] === 200, 'DELETE amenity after bookings cleared');
if ($openId) {
    request('DELETE', "/admin/amenities/{$openId}", null, $adminToken);
}
if ($closedId) {
    request('DELETE', "/admin/amenities/{$closedId}", null, $adminToken);
}
if ($residentAmenityId) {
    request('DELETE', "/admin/amenities/{$residentAmenityId}", null, $adminToken);
}

$afterList = request('GET', '/admin/amenities', null, $adminToken);
$afterCount = count($afterList['json']['data'] ?? []);
assertOk($afterCount === $initialCount, 'amenity count restored after cleanup');

echo "\n";
if ($failed > 0) {
    echo "FAILED: {$failed} test(s), passed {$passed}\n";
    exit(1);
}

echo "All {$passed} amenities cross-tests passed.\n";
