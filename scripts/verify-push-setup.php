<?php

require __DIR__ . '/../backend/vendor/autoload.php';

$app = require __DIR__ . '/../backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

function inferNoticeBoard(array $data): string
{
    $category = strtolower((string) ($data['category'] ?? $data['notice_category'] ?? ''));
    if ($category === 'event') {
        return 'events';
    }
    if ($category === 'emergency') {
        return 'alerts';
    }

    $haystack = strtolower(trim(($data['title'] ?? '') . ' ' . ($data['body'] ?? '')));
    if (str_contains($haystack, 'event')) {
        return 'events';
    }
    if (str_contains($haystack, 'alert') || str_contains($haystack, 'emergency')) {
        return 'alerts';
    }

    return 'notices';
}

function noticeAdminHref(string $noticeId, array $data): string
{
    $board = inferNoticeBoard($data);
    $base  = match ($board) {
        'events'  => '/admin/events',
        'alerts'  => '/admin/alerts',
        default   => '/admin/notices',
    };

    return $base . '?notice=' . $noticeId;
}

function rerouteAdminNoticeHref(string $href, array $data): ?string
{
    if (! preg_match('#^/admin/notices\?notice=(\d+)#', $href, $matches)) {
        return null;
    }

    $board = inferNoticeBoard($data);
    if ($board === 'notices') {
        return null;
    }

    $base = $board === 'events' ? '/admin/events' : '/admin/alerts';

    return $base . '?notice=' . $matches[1];
}

function mapActionUrlForWeb(string $action, array $data = []): string
{
    if (str_starts_with($action, '/admin/')) {
        return rerouteAdminNoticeHref($action, $data) ?? $action;
    }

    $path  = $action;
    $query = '';

    if (str_starts_with($action, 'http://') || str_starts_with($action, 'https://')) {
        $parts = parse_url($action);
        $path  = $parts['path'] ?? $action;
        $query = $parts['query'] ?? '';
    } elseif (str_contains($action, '?')) {
        [$path, $query] = explode('?', $action, 2);
    }

    parse_str($query, $params);

    if ($path === '/screens/notification' || str_starts_with($path, '/screens/notification')) {
        return '/admin/notifications';
    }

    if (str_contains($path, '/screens/messages/chat')) {
        $conversationId = $params['conversationId'] ?? null;

        return $conversationId ? '/admin/messages?conversation=' . $conversationId : '/admin/messages';
    }

    if (str_contains($path, '/screens/community-feed/comments')) {
        $postId = $params['postId'] ?? null;

        return $postId ? '/admin/feed?post=' . $postId : '/admin/feed';
    }

    if (preg_match('#/notices/(\d+)#', $path, $matches)) {
        return noticeAdminHref($matches[1], $data);
    }

    if (str_starts_with($path, '/screens/')) {
        return '/admin/notifications';
    }

    return $path;
}

$cases = [
    ['/screens/community-feed/comments?postId=3', [], '/admin/feed?post=3'],
    ['http://localhost:3000/screens/community-feed/comments?postId=3', [], '/admin/feed?post=3'],
    ['/screens/messages/chat?conversationId=12', [], '/admin/messages?conversation=12'],
    ['/admin/feed?post=5', [], '/admin/feed?post=5'],
    ['/notices/42', ['title' => 'Event Update', 'body' => 'Jane joined your event.'], '/admin/events?notice=42'],
    ['/notices/7', ['title' => 'New Event'], '/admin/events?notice=7'],
    ['/notices/9', ['category' => 'emergency', 'title' => 'New Alert'], '/admin/alerts?notice=9'],
    ['/notices/11', ['title' => 'New Notice'], '/admin/notices?notice=11'],
    ['/admin/notices?notice=42', ['title' => 'Event Update'], '/admin/events?notice=42'],
];

$failed = 0;
foreach ($cases as [$input, $data, $expected]) {
    $actual = mapActionUrlForWeb($input, $data);
    if ($actual !== $expected) {
        echo "FAIL: mapActionUrlForWeb({$input}) => {$actual}, expected {$expected}\n";
        $failed++;
    }
}

if ($failed > 0) {
    exit(1);
}

echo 'OK: ' . count($cases) . " PHP link mapping cases passed.\n";

if (! Schema::hasTable('devices')) {
    echo "WARN: devices table missing\n";
    exit(0);
}

$devices = DB::table('devices')
    ->select('id', 'user_id', 'platform', 'fcm_token', 'expo_push_token', 'last_seen_at')
    ->orderByDesc('last_seen_at')
    ->limit(10)
    ->get();

echo "Registered devices:\n";
foreach ($devices as $device) {
    echo sprintf(
        "  #%d user=%d platform=%s fcm=%s expo=%s last_seen=%s\n",
        $device->id,
        $device->user_id,
        $device->platform ?? 'unknown',
        ! empty($device->fcm_token) ? 'yes' : 'no',
        ! empty($device->expo_push_token) ? 'yes' : 'no',
        $device->last_seen_at ?? 'n/a',
    );
}

$credentials = env('FIREBASE_CREDENTIALS');
$credPath = $credentials ? base_path($credentials) : null;
echo 'Firebase credentials: ' . ($credPath && is_file($credPath) ? 'present' : 'missing') . "\n";

echo "Service worker: " . (is_file(__DIR__ . '/../frontend/public/firebase-messaging-sw.js') ? 'present' : 'missing') . "\n";
