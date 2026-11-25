<?php

/**
 * Live smoke test against the dev database (not RefreshDatabase).
 * Run: php scripts/smoke-rules-documents.php
 */

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

require __DIR__ . '/../vendor/autoload.php';
$app = require __DIR__ . '/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);

function api(Illuminate\Contracts\Http\Kernel $kernel, string $method, string $uri, array $data = [], ?User $user = null, array $files = []): array
{
    if ($user) {
        Sanctum::actingAs($user);
    }

    $server = ['HTTP_ACCEPT' => 'application/json'];
    $content = null;

    if ($files) {
        $request = Illuminate\Http\Request::create($uri, $method, $data, [], $files, $server);
    } elseif ($method !== 'GET' && $data) {
        $content = json_encode($data);
        $server['CONTENT_TYPE'] = 'application/json';
        $request = Illuminate\Http\Request::create($uri, $method, [], [], [], $server, $content);
    } else {
        $query = $method === 'GET' ? $data : [];
        $request = Illuminate\Http\Request::create($uri, $method, $query, [], [], $server, $content);
    }

    $response = $kernel->handle($request);
    $kernel->terminate($request, $response);

    return [
        'status' => $response->getStatusCode(),
        'json'   => json_decode($response->getContent(), true),
    ];
}

function assertOk(string $label, array $res, int $expected = 200): void
{
    if ($res['status'] !== $expected) {
        $msg = $res['json']['message'] ?? json_encode($res['json']);
        throw new RuntimeException("FAIL {$label}: HTTP {$res['status']} — {$msg}");
    }
    echo "PASS {$label}\n";
}

$admin = User::query()->where('role', 'community_admin')->where('community_admin_status', 'approved')->first();
$resident = User::query()->where('role', 'resident')->whereHas('memberships', fn ($q) => $q->where('status', 'approved'))->first();
$systemAdmin = User::query()->where('role', 'system_admin')->first();

if (!$admin || !$resident) {
    fwrite(STDERR, "Missing dev users. Need approved community_admin and resident.\n");
    exit(1);
}

echo "=== Live smoke: Community Rules & Documents ===\n";
echo "Admin: {$admin->id} ({$admin->phone})\n";
echo "Resident: {$resident->id} ({$resident->phone})\n";
echo "System admin: " . ($systemAdmin?->id ?? 'n/a') . "\n\n";

Storage::fake('public');

// Rules — admin create
$res = api($kernel, 'POST', '/api/v1/admin/community-rules', [
    'title'                   => 'Smoke Test Rule',
    'category'                => 'General',
    'description'             => 'Automated smoke test rule.',
    'severity'                => 'important',
    'requires_acknowledgment' => true,
], $admin);
assertOk('Admin create rule', $res, 201);
$ruleId = $res['json']['data']['id'];

// Rules — resident list + acknowledge
$res = api($kernel, 'GET', '/api/v1/community-rules', [], $resident);
assertOk('Resident list rules', $res);
if (($res['json']['unacknowledged'] ?? 0) < 1) {
    throw new RuntimeException('FAIL Resident should see unacknowledged rule');
}
echo "PASS Resident sees unacknowledged rule\n";

$res = api($kernel, 'POST', "/api/v1/community-rules/{$ruleId}/acknowledge", [], $resident);
assertOk('Resident acknowledge rule', $res);

// Rules — resident forbidden on admin
$res = api($kernel, 'POST', '/api/v1/admin/community-rules', [
    'title' => 'X', 'category' => 'X', 'description' => 'X', 'severity' => 'info',
], $resident);
if ($res['status'] !== 403) {
    throw new RuntimeException("FAIL Resident should get 403 on admin rules, got {$res['status']}");
}
echo "PASS Resident blocked from admin rules\n";

// Rules — admin update + delete
$res = api($kernel, 'PATCH', "/api/v1/admin/community-rules/{$ruleId}", ['title' => 'Updated Smoke Rule'], $admin);
assertOk('Admin update rule', $res);

$res = api($kernel, 'DELETE', "/api/v1/admin/community-rules/{$ruleId}", [], $admin);
assertOk('Admin delete rule', $res);

// Documents — admin upload
$file = UploadedFile::fake()->create('smoke-test.pdf', 120, 'application/pdf');
$res = api($kernel, 'POST', '/api/v1/admin/documents', [
    'title'    => 'Smoke Test Document',
    'category' => 'Forms',
    'status'   => 'active',
], $admin, ['file' => $file]);
assertOk('Admin upload document', $res, 201);
$docId = $res['json']['data']['id'];

// Documents — resident list + show + download
$res = api($kernel, 'GET', '/api/v1/documents', [], $resident);
assertOk('Resident list documents', $res);

$res = api($kernel, 'GET', "/api/v1/documents/{$docId}", [], $resident);
assertOk('Resident view document', $res);

$res = api($kernel, 'POST', "/api/v1/documents/{$docId}/download", [], $resident);
assertOk('Resident download document', $res);
if (($res['json']['data']['download_count'] ?? 0) < 1) {
    throw new RuntimeException('FAIL Download count should increment');
}
echo "PASS Download count incremented\n";

// Documents — resident forbidden on admin
$res = api($kernel, 'GET', '/api/v1/admin/documents', [], $resident);
if ($res['status'] !== 403) {
    throw new RuntimeException("FAIL Resident should get 403 on admin docs, got {$res['status']}");
}
echo "PASS Resident blocked from admin documents\n";

// Documents — admin update + delete
$res = api($kernel, 'PATCH', "/api/v1/admin/documents/{$docId}", ['title' => 'Updated Smoke Doc'], $admin);
assertOk('Admin update document', $res);

$res = api($kernel, 'DELETE', "/api/v1/admin/documents/{$docId}", [], $admin);
assertOk('Admin delete document', $res);

// System admin (if has membership)
if ($systemAdmin && $systemAdmin->memberships()->where('status', 'approved')->exists()) {
    $res = api($kernel, 'GET', '/api/v1/admin/community-rules', [], $systemAdmin);
    assertOk('System admin admin rules index', $res);
    $res = api($kernel, 'GET', '/api/v1/admin/documents', [], $systemAdmin);
    assertOk('System admin admin documents index', $res);
}

// Unauthenticated check covered by PHPUnit (Sanctum state persists in this script)

echo "\nAll live smoke checks passed.\n";
