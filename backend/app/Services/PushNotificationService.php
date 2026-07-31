<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class PushNotificationService
{
    public static function sendToUser(int $userId, string $title, string $body, ?array $data = null): void
    {
        if (! Schema::hasTable('devices')) {
            return;
        }

        $tokens = DB::table('devices')
            ->where('user_id', $userId)
            ->whereNotNull('expo_push_token')
            ->where('expo_push_token', '!=', '')
            ->pluck('expo_push_token')
            ->filter(fn ($token) => is_string($token) && $token !== '')
            ->unique()
            ->values()
            ->all();

        if ($tokens === []) {
            return;
        }

        $payloadData = self::normalizeData($data);

        $messages = array_map(function (string $token) use ($title, $body, $payloadData) {
            $payload = [
                'to'        => $token,
                'title'     => $title,
                'body'      => $body,
                'sound'     => 'default',
                'priority'  => 'high',
                'channelId' => 'default',
            ];

            if ($payloadData !== []) {
                $payload['data'] = $payloadData;
            }

            return $payload;
        }, $tokens);

        try {
            Http::timeout(8)
                ->acceptJson()
                ->post('https://exp.host/--/api/v2/push/send', $messages);
        } catch (\Throwable $e) {
            Log::warning('Expo push send failed', [
                'user_id' => $userId,
                'title'   => $title,
                'error'   => $e->getMessage(),
            ]);
        }
    }

    /** Expo requires string values in the data payload. */
    private static function normalizeData(?array $data): array
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
}
