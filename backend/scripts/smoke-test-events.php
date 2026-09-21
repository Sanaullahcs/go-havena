<?php

/**
 * Live API smoke test for the event feature (create, list, RSVP, waitlist).
 * Usage: php scripts/smoke-test-events.php
 */

const BASE = 'http://127.0.0.1:8000/api/v1';

function request(string $method, string $path, ?array $body = null, ?string $token = null, array $headers = []): array
{
    $url = BASE . $path;
    $ch = curl_init($url);
    $hdrs = ['Accept: application/json', 'Content-Type: application/json'];
    if ($token) {
        $hdrs[] = 'Authorization: Bearer ' . $token;
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

function assertOk(bool $cond, string $label): void
{
    if (! $cond) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "  ✓ {$label}\n";
}

function login(string $email): string
{
    $res = request('POST', '/auth/login', ['email' => $email, 'password' => 'password']);
    if ($res['status'] !== 200 || empty($res['json']['token'])) {
        fwrite(STDERR, "Login failed for {$email}: HTTP {$res['status']} {$res['raw']}\n");
        exit(1);
    }
    echo "  ✓ login {$email}\n";
    return $res['json']['token'];
}

echo "Event feature live API smoke test\n\n";

$adminToken = login('alex@gmail.com');
$resident1Token = login('turner@gmail.com');
$resident2Token = login('rehman@gmail.com');

$tomorrow = (new DateTime('+2 days'))->format('Y-m-d');

echo "Create capped event\n";
$create = request('POST', '/admin/events', [
    'title' => 'Smoke Test Event ' . time(),
    'body' => 'Automated smoke test for RSVP and waitlist.',
    'location' => 'Community Hall',
    'event_date' => $tomorrow,
    'event_time' => '18:00',
    'event_time_end' => '20:00',
    'event_capacity' => 1,
    'requires_rsvp' => true,
    'status' => 'published',
], $adminToken, ['X-Community-Id: 1']);

assertOk($create['status'] === 201 || $create['status'] === 200, 'admin creates event');
$eventId = $create['json']['data']['id'] ?? null;
assertOk($eventId !== null, 'event id returned');
assertOk(($create['json']['data']['category'] ?? '') === 'event', 'category is event');

echo "Resident list includes event\n";
$list = request('GET', '/notices?category=event&per_page=50', null, $resident1Token, ['X-Community-Id: 1']);
assertOk($list['status'] === 200, 'resident lists events');
$ids = array_column($list['json']['data'] ?? [], 'id');
assertOk(in_array($eventId, $ids, true), 'new event visible in list');

echo "RSVP + waitlist flow\n";
$join1 = request('POST', "/notices/{$eventId}/rsvp", ['status' => 'going'], $resident1Token, ['X-Community-Id: 1']);
assertOk($join1['status'] === 200, 'resident 1 joins');
assertOk(($join1['json']['data']['is_joined'] ?? false) === true, 'resident 1 joined');
assertOk((int) ($join1['json']['data']['rsvp_count'] ?? 0) === 1, 'rsvp count is 1');

$join2 = request('POST', "/notices/{$eventId}/rsvp", ['status' => 'going'], $resident2Token, ['X-Community-Id: 1']);
assertOk($join2['status'] === 200, 'resident 2 joins when full');
assertOk(($join2['json']['data']['is_waitlisted'] ?? false) === true, 'resident 2 waitlisted');
assertOk((int) ($join2['json']['data']['waitlist_position'] ?? 0) === 1, 'waitlist position 1');

$leave = request('POST', "/notices/{$eventId}/rsvp", ['status' => 'not_going'], $resident1Token, ['X-Community-Id: 1']);
assertOk($leave['status'] === 200, 'resident 1 leaves');

$promoted = request('GET', "/notices/{$eventId}", null, $resident2Token, ['X-Community-Id: 1']);
assertOk($promoted['status'] === 200, 'fetch after promotion');
assertOk(($promoted['json']['data']['is_joined'] ?? false) === true, 'resident 2 promoted to going');
assertOk(($promoted['json']['data']['is_waitlisted'] ?? true) === false, 'resident 2 no longer waitlisted');

echo "Organizer can view waitlist metadata\n";
$adminView = request('GET', "/notices/{$eventId}", null, $adminToken, ['X-Community-Id: 1']);
assertOk($adminView['status'] === 200, 'admin views event');
assertOk(isset($adminView['json']['data']['waitlist']), 'waitlist field present');

echo "Resident event submission\n";
$submit = request('POST', '/events', [
    'title' => 'Resident Submitted Event',
    'body' => 'Pending admin approval.',
    'location' => 'Park',
    'event_date' => $tomorrow,
    'event_time' => '10:00',
    'event_time_end' => '12:00',
], $resident1Token, ['X-Community-Id: 1']);
assertOk($submit['status'] === 201 || $submit['status'] === 200, 'resident submits event');
$pendingId = $submit['json']['data']['id'] ?? null;
assertOk(($submit['json']['data']['review_status'] ?? '') === 'pending', 'submission pending review');

$hidden = request('GET', '/notices?category=event', null, $resident2Token, ['X-Community-Id: 1']);
$hiddenIds = array_column($hidden['json']['data'] ?? [], 'id');
assertOk(! in_array($pendingId, $hiddenIds, true), 'pending event hidden from residents');

echo "\nAll live event smoke checks passed.\n";
