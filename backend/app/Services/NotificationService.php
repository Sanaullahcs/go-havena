<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use App\Services\FcmNotificationService;
use App\Services\PushNotificationService;

class NotificationService
{
    public static function send(
        int    $userId,
        string $type,
        string $title,
        string $body,
        ?string $actionUrl = null,
        ?array $data = null
    ): void {
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

        $pushData = array_merge($data ?? [], array_filter([
            'type'       => $type,
            'action_url' => $actionUrl,
            'actionUrl'  => $actionUrl,
        ]));

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
}
