<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Sends push notifications via Firebase Cloud Messaging HTTP v1.
 * Used for web browsers and optional native FCM tokens.
 */
class FcmNotificationService
{
    private static ?array $serviceAccount = null;

    public static function sendToUser(int $userId, string $title, string $body, ?array $data = null): void
    {
        try {
            self::sendToUserInternal($userId, $title, $body, $data);
        } catch (\Throwable $e) {
            Log::warning('FCM send aborted', [
                'user_id' => $userId,
                'title'   => $title,
                'error'   => $e->getMessage(),
            ]);
        }
    }

    private static function sendToUserInternal(int $userId, string $title, string $body, ?array $data = null): void
    {
        if (! Schema::hasTable('devices')) {
            return;
        }

        $devices = DB::table('devices')
            ->where('user_id', $userId)
            ->whereNotNull('fcm_token')
            ->where('fcm_token', '!=', '')
            ->get(['fcm_token', 'platform']);

        if ($devices->isEmpty()) {
            return;
        }

        $accessToken = self::getAccessToken();
        if (! $accessToken) {
            return;
        }

        $projectId = self::getProjectId();
        if (! $projectId) {
            Log::warning('FCM send skipped: missing Firebase project id');

            return;
        }

        $stringData = self::stringifyData(array_merge($data ?? [], [
            'title' => $title,
            'body'  => $body,
        ]));
        $webLink    = self::resolveWebLink($stringData);
        $url        = "https://fcm.googleapis.com/v1/projects/{$projectId}/messages:send";

        foreach ($devices as $device) {
            $token    = (string) $device->fcm_token;
            $platform = (string) ($device->platform ?? '');

            $payload = $platform === 'web'
                ? self::buildWebPushPayload($token, $title, $body, $stringData, $webLink)
                : self::buildNativePushPayload($token, $title, $body, $stringData, $webLink);

            try {
                Http::withToken($accessToken)
                    ->acceptJson()
                    ->timeout(8)
                    ->post($url, $payload);
            } catch (\Throwable $e) {
                Log::warning('FCM send failed', [
                    'user_id'  => $userId,
                    'platform' => $platform,
                    'title'    => $title,
                    'error'    => $e->getMessage(),
                ]);
            }
        }
    }

    /** Web: data-only payload so our service worker shows exactly one notification. */
    private static function buildWebPushPayload(
        string $token,
        string $title,
        string $body,
        array $data,
        string $webLink,
    ): array {
        return [
            'message' => [
                'token' => $token,
                'data'  => array_merge($data, [
                    'title' => $title,
                    'body'  => $body,
                    'link'  => $webLink,
                    'icon'  => self::webPushIconUrl(),
                ]),
                'webpush' => [
                    'headers' => [
                        'Urgency' => 'high',
                    ],
                    'fcm_options' => [
                        'link' => $webLink,
                    ],
                ],
            ],
        ];
    }

    private static function buildNativePushPayload(
        string $token,
        string $title,
        string $body,
        array $data,
        string $webLink,
    ): array {
        return [
            'message' => [
                'token' => $token,
                'notification' => [
                    'title' => $title,
                    'body'  => $body,
                ],
                'data' => $data,
                'webpush' => [
                    'notification' => [
                        'title' => $title,
                        'body'  => $body,
                        'icon'  => self::webPushIconUrl(),
                    ],
                    'fcm_options' => [
                        'link' => $webLink,
                    ],
                ],
                'android' => [
                    'priority'     => 'HIGH',
                    'notification' => [
                        'channel_id' => 'default',
                        'sound'      => 'default',
                    ],
                ],
                'apns' => [
                    'payload' => [
                        'aps' => [
                            'sound' => 'default',
                            'badge' => 1,
                        ],
                    ],
                ],
            ],
        ];
    }

    private static function frontendBaseUrl(): string
    {
        $base = env('FRONTEND_ADMIN_URL') ?: env('FRONTEND_USER_URL') ?: config('app.url');

        return rtrim((string) $base, '/');
    }

    private static function webPushIconUrl(): string
    {
        return self::frontendBaseUrl() . '/app-icon.png';
    }

    private static function resolveWebLink(array $data): string
    {
        $action = $data['action_url'] ?? $data['actionUrl'] ?? '/admin/notifications';
        $action = self::mapActionUrlForWeb((string) $action, $data);

        if (str_starts_with($action, 'http')) {
            return $action;
        }

        $base = self::frontendBaseUrl();

        return $base . (str_starts_with($action, '/') ? $action : "/{$action}");
    }

    private static function mapActionUrlForWeb(string $action, array $data = []): string
    {
        if (str_starts_with($action, '/admin/')) {
            return self::rerouteAdminNoticeHref($action, $data) ?? $action;
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
            return self::noticeAdminHref($matches[1], $data);
        }

        if (str_starts_with($path, '/messages')) {
            return '/admin/messages';
        }

        if (str_starts_with($path, '/marketplace')) {
            return '/admin/marketplace';
        }

        if (str_starts_with($path, '/moderation')) {
            return '/admin/moderation';
        }

        $mapped = self::mapMobileScreenToAdminHref($path, $query);
        if ($mapped !== null) {
            return $mapped;
        }

        if (str_starts_with($path, '/screens/')) {
            return '/admin/notifications';
        }

        // Never return an unknown path that could 404 in the admin dashboard.
        return '/admin/notifications';
    }

    private static function mapMobileScreenToAdminHref(string $pathname, string $query = ''): ?string
    {
        $path = strtolower($pathname);
        parse_str($query, $params);

        if (str_contains($path, '/screens/admin-bookings')) {
            return '/admin/bookings';
        }

        if (str_contains($path, '/screens/admin-amenities')) {
            return '/admin/amenities';
        }

        if (str_contains($path, '/screens/guest-approvals')) {
            return '/admin/guests';
        }

        if (str_contains($path, '/screens/notices')) {
            return '/admin/notices';
        }

        if (str_contains($path, '/screens/community-feed/comments')) {
            $postId = $params['postId'] ?? $params['post_id'] ?? null;

            return $postId ? '/admin/feed?post=' . $postId : '/admin/feed';
        }

        if (str_contains($path, '/screens/community-feed')) {
            return '/admin/feed';
        }

        if (str_contains($path, '/screens/listing-detail')) {
            $listingId = $params['id'] ?? $params['listingId'] ?? $params['listing_id'] ?? null;

            return $listingId ? '/admin/marketplace?listing=' . $listingId : '/admin/marketplace';
        }

        if (str_contains($path, '/screens/messages')) {
            return '/admin/messages';
        }

        if (str_contains($path, '/screens/property-management/my-booking')) {
            return '/admin/amenities';
        }

        if (str_contains($path, '/screens/property-management')) {
            return '/admin/amenities';
        }

        if (str_contains($path, '/screens/admin-content-review')) {
            $kind = strtolower((string) ($params['kind'] ?? 'notice'));

            return match ($kind) {
                'event' => '/admin/events?review_status=pending',
                'alert' => '/admin/alerts?review_status=pending',
                default => '/admin/notices?review_status=pending',
            };
        }

        return null;
    }

    private static function noticeAdminHref(string $noticeId, array $data): string
    {
        $board = self::inferNoticeBoard($data);
        $base  = match ($board) {
            'events'  => '/admin/events',
            'alerts'  => '/admin/alerts',
            default   => '/admin/notices',
        };

        return $base . '?notice=' . $noticeId;
    }

    private static function rerouteAdminNoticeHref(string $href, array $data): ?string
    {
        if (! preg_match('#^/admin/notices\?notice=(\d+)#', $href, $matches)) {
            return null;
        }

        $board = self::inferNoticeBoard($data);
        if ($board === 'notices') {
            return null;
        }

        $base = $board === 'events' ? '/admin/events' : '/admin/alerts';

        return $base . '?notice=' . $matches[1];
    }

    private static function inferNoticeBoard(array $data): string
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

    private static function stringifyData(?array $data): array
    {
        if ($data === null) {
            return [];
        }

        $normalized = [];
        foreach ($data as $key => $value) {
            if ($value === null) {
                continue;
            }
            $normalized[(string) $key] = is_scalar($value)
                ? (string) $value
                : json_encode($value);
        }

        return $normalized;
    }

    private static function getProjectId(): ?string
    {
        $account = self::loadServiceAccount();

        return $account['project_id'] ?? null;
    }

    private static function getAccessToken(): ?string
    {
        $account = self::loadServiceAccount();
        if (! $account) {
            return null;
        }

        try {
            $now     = time();
            $header  = self::base64UrlEncode(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
            $claim   = self::base64UrlEncode(json_encode([
                'iss'   => $account['client_email'],
                'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
                'aud'   => 'https://oauth2.googleapis.com/token',
                'iat'   => $now,
                'exp'   => $now + 3600,
            ]));
            $unsigned = "{$header}.{$claim}";

            $privateKey = openssl_pkey_get_private($account['private_key']);
            if (! $privateKey) {
                throw new \RuntimeException('Invalid Firebase private key');
            }

            openssl_sign($unsigned, $signature, $privateKey, OPENSSL_ALGO_SHA256);
            $jwt = $unsigned . '.' . self::base64UrlEncode($signature);

            $response = Http::asForm()->post('https://oauth2.googleapis.com/token', [
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion'  => $jwt,
            ]);

            if (! $response->successful()) {
                Log::warning('FCM OAuth failed', ['body' => $response->body()]);

                return null;
            }

            return $response->json('access_token');
        } catch (\Throwable $e) {
            Log::warning('FCM OAuth exception', ['error' => $e->getMessage()]);

            return null;
        }
    }

    private static function loadServiceAccount(): ?array
    {
        if (self::$serviceAccount !== null) {
            return self::$serviceAccount ?: null;
        }

        $path = config('services.firebase.credentials');
        if (! $path || ! is_readable($path)) {
            self::$serviceAccount = [];

            return null;
        }

        $json = json_decode((string) file_get_contents($path), true);
        if (! is_array($json)) {
            self::$serviceAccount = [];

            return null;
        }

        self::$serviceAccount = $json;

        return $json;
    }

    private static function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
