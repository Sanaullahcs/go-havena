<?php

namespace App\Services;

use App\Models\User;
use App\Support\NotificationText;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class NotificationService
{
    public static function send(
        int    $userId,
        string $type,
        string $title,
        string $body,
        ?string $actionUrl = null,
        ?array $data = null,
        ?int $communityId = null,
    ): void {
        if ($communityId) {
            $data ??= [];
            $data['community_id'] = $data['community_id'] ?? $communityId;
        }
        if (isset($data['community_id']) && $data['community_id'] !== '' && $data['community_id'] !== null) {
            $data['community_id'] = (int) $data['community_id'];
        }

        $title = NotificationText::title($title);
        $body = NotificationText::body($body);

        if (! CommunityAdminNotificationPreferences::allows(
            $userId,
            CommunityAdminNotificationPreferences::categoryFor($type, $title, $actionUrl, $data),
        )) {
            return;
        }

        $payload = [
            'user_id'    => $userId,
            'type'       => $type,
            'title'      => $title,
            'body'       => $body,
            'action_url' => $actionUrl,
            'read_at'    => null,
            'created_at' => now(),
            'updated_at' => now(),
        ];

        if ($data !== null && Schema::hasColumn('app_notifications', 'data')) {
            $payload['data'] = json_encode($data);
        }

        try {
            DB::table('app_notifications')->insert($payload);
        } catch (\Throwable $e) {
            Log::warning('Notification insert failed', [
                'user_id' => $userId,
                'title'   => $title,
                'error'   => $e->getMessage(),
            ]);
        }

        self::deliverPush($userId, $type, $title, $body, $actionUrl, $data);
    }

    /** Push to registered devices without writing another inbox row. */
    public static function deliverPush(
        int $userId,
        string $type,
        string $title,
        string $body,
        ?string $actionUrl = null,
        ?array $data = null,
    ): void {
        if (! self::shouldDeliverPush($userId, $data)) {
            return;
        }

        $pushData = array_merge($data ?? [], array_filter([
            'type'       => $type,
            'title'      => $title,
            'body'       => $body,
            'action_url' => $actionUrl,
            'actionUrl'  => $actionUrl,
        ], static fn ($value) => $value !== null && $value !== ''));

        try {
            PushNotificationService::sendToUser($userId, $title, $body, $pushData);
        } catch (\Throwable $e) {
            Log::warning('Push notification failed', [
                'user_id' => $userId,
                'title'   => $title,
                'error'   => $e->getMessage(),
            ]);
        }

        try {
            FcmNotificationService::sendToUser($userId, $title, $body, $pushData);
        } catch (\Throwable $e) {
            Log::warning('FCM notification failed', [
                'user_id' => $userId,
                'title'   => $title,
                'error'   => $e->getMessage(),
            ]);
        }
    }

    /**
     * Community-stamped alerts are pushed only to an admin who is currently
     * approved for that community. The inbox row is still stored.
     */
    private static function shouldDeliverPush(int $userId, ?array $data): bool
    {
        if (($data['scope'] ?? null) === 'account') {
            return true;
        }

        $communityId = $data['community_id'] ?? null;
        if (! $communityId) {
            return true;
        }

        $user = User::query()->find($userId);
        if (! $user || ! NotificationCommunityScope::appliesTo($user)) {
            return true;
        }

        $allowed = NotificationCommunityScope::authorizedCommunityId($user);

        return $allowed !== null && (int) $allowed === (int) $communityId;
    }
}
