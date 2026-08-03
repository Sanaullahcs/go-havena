<?php

/**
 * Role-based amenity flow smoke test.
 * Covers: Community Admin, Resident (creator), second Resident (booker).
 *
 * Usage: php scripts/smoke-test-amenity-roles.php
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
    $errno = curl_errno($ch);
    $error = curl_error($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return [
        'status' => $status,
        'json' => json_decode($raw ?: 'null', true),
        'raw' => $raw,
        'curl_error' => $errno ? $error : null,
    ];
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
        $failures[] = $label.($detail ? " — {$detail}" : '');
        echo "  ✗ {$label}".($detail ? " ({$detail})" : '')."\n";
    }
}

function login(string $email): ?array
{
    $res = request('POST', '/auth/login', ['email' => $email, 'password' => 'password']);
    if ($res['status'] === 200 && ! empty($res['json']['token'])) {
        echo "  ✓ login {$email}\n";

        return [
            'token' => $res['json']['token'],
            'user' => $res['json']['user'] ?? $res['json']['data'] ?? null,
            'email' => $email,
        ];
    }
    echo "  ✗ login failed for {$email} (HTTP {$res['status']}".($res['curl_error'] ? ', '.$res['curl_error'] : '').")\n";

    return null;
}

function amenityPayload(string $name, string $status = 'bookable', array $extra = []): array
{
    return array_merge([
        'name' => $name,
        'description' => 'Role-flow smoke amenity',
        'status' => $status,
        'capacity' => 10,
        'floor' => 'Level 1',
        'hours' => '5:00 PM – 11:00 PM',
        'start_time' => '17:00',
        'end_time' => '23:00',
        'weekends_available' => true,
        'slot_duration_minutes' => $status === 'bookable' ? 60 : null,
        'icon_key' => 'meeting',
    ], $extra);
}

function findAmenity(array $list, int $id): ?array
{
    foreach ($list as $row) {
        if ((int) ($row['id'] ?? 0) === $id) {
            return $row;
        }
    }

    return null;
}

echo "══════════════════════════════════════════════\n";
echo " Amenity role-flow smoke test\n";
echo "══════════════════════════════════════════════\n\n";

$health = request('GET', '/health');
assertOk($health['status'] === 200, 'API health', $health['curl_error'] ?? ('HTTP '.$health['status']));
if ($health['status'] !== 200) {
    fwrite(STDERR, "\nAPI not reachable at ".BASE.". Start Laravel (`php artisan serve`) and retry.\n");
    exit(1);
}

$adminEmails = [
    'test.community.admin@havena.app',
    'community.admin@havena.app',
    'alex@gmail.com',
];
$residentEmails = [
    'test.resident@havena.app',
    'turner@gmail.com',
];
$secondResidentEmails = [
    'turner@gmail.com',
    'ahmadqasim1929@gmail.com',
    'ahmadqasim@gmail.com',
    'rehman@gmail.com',
    'hasam@gmail.com',
    'brty@gmail.com',
    'sa@gmail.com',
];

$admin = null;
foreach ($adminEmails as $email) {
    $admin = login($email);
    if ($admin) {
        break;
    }
}
assertOk($admin !== null, 'community admin session');
if (! $admin) {
    exit(1);
}

$creator = null;
foreach ($residentEmails as $email) {
    $creator = login($email);
    if ($creator) {
        break;
    }
}
assertOk($creator !== null, 'resident creator session');
if (! $creator) {
    exit(1);
}

$booker = null;
foreach ($secondResidentEmails as $email) {
    if ($email === $creator['email']) {
        continue;
    }
    $booker = login($email);
    if ($booker) {
        break;
    }
}
if (! $booker) {
    // Fall back: reuse creator for negative cases only; mark booker unavailable.
    echo "  ! second resident unavailable — booking-as-other cases will be skipped\n";
}

$stamp = time();
$weekday = (new DateTime('next monday'))->format('Y-m-d');
$createdIds = [];

echo "\n── 1) Community Admin creates amenity (no approval) ──\n";
$adminCreate = request('POST', '/admin/amenities', amenityPayload("Admin Live {$stamp}"), $admin['token']);
assertOk($adminCreate['status'] === 201, 'admin create amenity HTTP 201', 'HTTP '.$adminCreate['status'].' '.$adminCreate['raw']);
$adminAmenityId = (int) ($adminCreate['json']['data']['id'] ?? 0);
$createdIds[] = $adminAmenityId;
assertOk($adminAmenityId > 0, 'admin amenity id returned');
assertOk(($adminCreate['json']['data']['review_status'] ?? '') === 'approved', 'admin amenity review_status=approved');
assertOk(($adminCreate['json']['data']['is_mine'] ?? false) === true, 'admin amenity is_mine=true for creator');

$adminList = request('GET', '/amenities', null, $admin['token']);
$adminRow = findAmenity($adminList['json']['data'] ?? [], $adminAmenityId);
assertOk($adminRow !== null, 'admin sees own amenity in resident list');
assertOk(($adminRow['is_mine'] ?? false) === true, 'listed admin amenity marked is_mine');

$selfBook = request('POST', '/bookings', [
    'amenity_id' => $adminAmenityId,
    'date' => $weekday,
    'time_slot' => '5:00 PM – 6:00 PM',
], $admin['token']);
assertOk($selfBook['status'] === 422, 'admin cannot book own amenity', 'HTTP '.$selfBook['status']);

echo "\n── 2) Resident creates amenity (needs approval) ──\n";
$residentCreate = request('POST', '/amenities', amenityPayload("Resident Pending {$stamp}"), $creator['token']);
assertOk($residentCreate['status'] === 201, 'resident create amenity HTTP 201', 'HTTP '.$residentCreate['status'].' '.$residentCreate['raw']);
$residentAmenityId = (int) ($residentCreate['json']['data']['id'] ?? 0);
$createdIds[] = $residentAmenityId;
assertOk(($residentCreate['json']['data']['review_status'] ?? '') === 'pending', 'resident amenity pending review');
assertOk(($residentCreate['json']['data']['is_mine'] ?? false) === true, 'resident amenity is_mine for creator');

$creatorList = request('GET', '/amenities', null, $creator['token']);
$creatorPending = findAmenity($creatorList['json']['data'] ?? [], $residentAmenityId);
assertOk($creatorPending !== null, 'creator sees own pending amenity in list');

if ($booker) {
    $bookerListBefore = request('GET', '/amenities', null, $booker['token']);
    $bookerSeesPending = findAmenity($bookerListBefore['json']['data'] ?? [], $residentAmenityId);
    assertOk($bookerSeesPending === null, 'other resident does not see pending amenity');
}

$bookPending = request('POST', '/bookings', [
    'amenity_id' => $residentAmenityId,
    'date' => $weekday,
    'time_slot' => '5:00 PM – 6:00 PM',
], $admin['token']);
assertOk($bookPending['status'] === 422, 'cannot book amenity before approval', 'HTTP '.$bookPending['status']);

$approve = request('PATCH', "/admin/amenities/{$residentAmenityId}/approve", [], $admin['token']);
assertOk($approve['status'] === 200, 'admin approves resident amenity', 'HTTP '.$approve['status']);
assertOk(($approve['json']['data']['review_status'] ?? '') === 'approved', 'approved amenity now live');

echo "\n── 3) Slots + booking by non-creator ──\n";
$slots = request('GET', "/amenities/{$residentAmenityId}/slots?date={$weekday}", null, $admin['token']);
assertOk($slots['status'] === 200, 'slots endpoint OK');
$slotValues = array_column($slots['json']['data'] ?? [], 'value');
assertOk(count($slotValues) === 6, 'generates 6 hourly slots for 5PM–11PM', 'count='.count($slotValues));
$firstSlot = $slotValues[0] ?? '5:00 PM – 6:00 PM';
assertOk($firstSlot === '5:00 PM – 6:00 PM' || str_contains($firstSlot, '5:00'), 'first slot starts at 5:00 PM', $firstSlot);

$selfBookCreator = request('POST', '/bookings', [
    'amenity_id' => $residentAmenityId,
    'date' => $weekday,
    'time_slot' => $firstSlot,
], $creator['token']);
assertOk($selfBookCreator['status'] === 422, 'creator cannot book own amenity', 'HTTP '.$selfBookCreator['status']);

$bookingId = null;
$openBookingId = null;
$adminOwnedBookingId = null;
$bookerToken = $booker['token'] ?? $admin['token'];
$bookerLabel = $booker ? 'second resident' : 'admin (fallback booker)';

$bookOther = request('POST', '/bookings', [
    'amenity_id' => $residentAmenityId,
    'date' => $weekday,
    'time_slot' => $firstSlot,
    'guests' => 2,
], $bookerToken);
assertOk($bookOther['status'] === 201, "{$bookerLabel} can book approved amenity", 'HTTP '.$bookOther['status'].' '.$bookOther['raw']);
$bookingId = (int) ($bookOther['json']['data']['id'] ?? 0);
assertOk($bookingId > 0, 'booking id returned');
assertOk(($bookOther['json']['data']['status'] ?? '') === 'pending', 'booking starts pending');

$creatorInbox = request('GET', '/bookings/inbox?status=pending', null, $creator['token']);
assertOk($creatorInbox['status'] === 200, 'creator booking inbox OK');
$inboxHas = false;
foreach ($creatorInbox['json']['data'] ?? [] as $row) {
    if ((int) ($row['id'] ?? 0) === $bookingId) {
        $inboxHas = true;
        break;
    }
}
assertOk($inboxHas, 'creator inbox contains booking request');

$creatorApprove = request('PATCH', "/bookings/{$bookingId}/approve", [], $creator['token']);
assertOk($creatorApprove['status'] === 200, 'amenity creator approves booking', 'HTTP '.$creatorApprove['status']);

echo "\n── 4) Open availability amenity ──\n";
$openCreate = request('POST', '/admin/amenities', amenityPayload("Open Access {$stamp}", 'open'), $admin['token']);
assertOk($openCreate['status'] === 201, 'admin creates open amenity');
$openId = (int) ($openCreate['json']['data']['id'] ?? 0);
$createdIds[] = $openId;

$openBook = request('POST', '/bookings', [
    'amenity_id' => $openId,
    'date' => $weekday,
], $creator['token']);
assertOk($openBook['status'] === 201, 'open amenity accepts request without slot', 'HTTP '.$openBook['status']);
$openBookingId = (int) ($openBook['json']['data']['id'] ?? 0);

$adminApproveOpen = request('PATCH', "/bookings/{$openBookingId}/approve", [], $admin['token']);
assertOk($adminApproveOpen['status'] === 200, 'admin (creator) approves open-access request');

echo "\n── 5) Admin booking inbox override ──\n";
$adminBookAdminAmenity = null;
if ($booker) {
    // Create a second booking on admin amenity via booker, then admin approves from inbox.
    $slotsAdmin = request('GET', "/amenities/{$adminAmenityId}/slots?date={$weekday}", null, $booker['token']);
    $adminSlots = array_column($slotsAdmin['json']['data'] ?? [], 'value');
    $slot2 = $adminSlots[1] ?? ($adminSlots[0] ?? '6:00 PM – 7:00 PM');
    $adminBookAdminAmenity = request('POST', '/bookings', [
        'amenity_id' => $adminAmenityId,
        'date' => $weekday,
        'time_slot' => $slot2,
    ], $booker['token']);
    assertOk($adminBookAdminAmenity['status'] === 201, 'resident books admin-owned amenity');
    $adminOwnedBookingId = (int) ($adminBookAdminAmenity['json']['data']['id'] ?? 0);
    $adminInbox = request('GET', '/bookings/inbox?status=pending', null, $admin['token']);
    $adminSees = false;
    foreach ($adminInbox['json']['data'] ?? [] as $row) {
        if ((int) ($row['id'] ?? 0) === $adminOwnedBookingId) {
            $adminSees = true;
            break;
        }
    }
    assertOk($adminSees, 'admin creator sees booking in inbox');
    $reject = request('PATCH', "/bookings/{$adminOwnedBookingId}/reject", ['reason' => 'Smoke test reject'], $admin['token']);
    assertOk($reject['status'] === 200, 'admin creator rejects booking');
}

echo "\n── Cleanup ──\n";
foreach ([$bookingId, $openBookingId ?? null, $adminOwnedBookingId ?? null] as $bid) {
    if ($bid) {
        request('DELETE', "/bookings/{$bid}", null, $bookerToken);
        request('DELETE', "/bookings/{$bid}", null, $admin['token']);
        request('DELETE', "/bookings/{$bid}", null, $creator['token']);
    }
}
// Cancel remaining active bookings then delete amenities.
foreach ($createdIds as $aid) {
    if (! $aid) {
        continue;
    }
    $active = request('GET', '/admin/bookings?status=pending', null, $admin['token']);
    foreach ($active['json']['data'] ?? [] as $b) {
        if ((int) ($b['amenity_id'] ?? 0) === $aid) {
            request('PATCH', '/bookings/'.((int) $b['id']).'/reject', [], $admin['token']);
            request('DELETE', '/bookings/'.((int) $b['id']), null, $admin['token']);
        }
    }
    $del = request('DELETE', "/admin/amenities/{$aid}", null, $admin['token']);
    assertOk(in_array($del['status'], [200, 404], true), "cleanup delete amenity #{$aid}", 'HTTP '.$del['status']);
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

exit($failed > 0 ? 1 : 0);
