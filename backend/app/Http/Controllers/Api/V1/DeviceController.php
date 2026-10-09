<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\PushNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class DeviceController extends Controller
{
    /** POST /v1/devices — register or refresh a push token (Expo mobile or FCM web/native) */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'expo_push_token' => 'nullable|string|max:255',
            'fcm_token'       => 'nullable|string|max:512',
            'platform'        => ['required', 'string', Rule::in(['ios', 'android', 'web'])],
        ]);

        $expoToken = trim((string) ($validated['expo_push_token'] ?? ''));
        $fcmToken  = trim((string) ($validated['fcm_token'] ?? ''));

        if ($expoToken === '' && $fcmToken === '') {
            return response()->json([
                'message' => 'Provide expo_push_token (mobile) or fcm_token (web).',
            ], 422);
        }

        $userId = (int) $request->user()->id;
        $now    = now();

        if ($expoToken !== '') {
            $this->upsertExpoToken($userId, $expoToken, $validated['platform'], $now);
        }

        if ($fcmToken !== '') {
            $this->upsertFcmToken($userId, $fcmToken, $validated['platform'], $now);
        }

        return response()->json(['success' => true]);
    }

    /** DELETE /v1/devices — unregister push token(s) for this user */
    public function destroy(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'expo_push_token' => 'nullable|string|max:255',
            'fcm_token'       => 'nullable|string|max:512',
            'platform'        => ['nullable', 'string', Rule::in(['ios', 'android', 'web'])],
        ]);

        $userId = (int) $request->user()->id;
        $query  = DB::table('devices')->where('user_id', $userId);

        if (! empty($validated['platform'])) {
            $query->where('platform', $validated['platform']);
        }

        if (! empty($validated['expo_push_token'])) {
            $query->where('expo_push_token', trim($validated['expo_push_token']));
        }

        if (! empty($validated['fcm_token'])) {
            $query->where('fcm_token', trim($validated['fcm_token']));
        }

        $query->delete();

        return response()->json(['success' => true]);
    }

    /** POST /v1/devices/test-push — send yourself a test notification (local/testing) */
    public function testPush(Request $request): JsonResponse
    {
        if (! app()->environment(['local', 'testing'])) {
            abort(404);
        }

        $validated = $request->validate([
            'title' => 'nullable|string|max:120',
            'body'  => 'nullable|string|max:500',
        ]);

        $userId = (int) $request->user()->id;
        $title  = $validated['title'] ?? 'Havena test';
        $body   = $validated['body'] ?? 'Push notifications are working!';

        $payload = [
            'type'       => 'test_push',
            'action_url' => '/admin/notifications',
            'actionUrl'  => '/admin/notifications',
        ];

        $deviceCount = DB::table('devices')
            ->where('user_id', $userId)
            ->where(function ($query) {
                $query->where(function ($inner) {
                    $inner->whereNotNull('expo_push_token')
                        ->where('expo_push_token', '!=', '');
                })->orWhereNotNull('fcm_token');
            })
            ->count();

        if ($deviceCount === 0) {
            return response()->json([
                'success' => false,
                'message' => 'No push device registered for this account. Click Test push again and allow browser notifications when prompted.',
            ], 422);
        }

        PushNotificationService::sendToUser($userId, $title, $body, $payload);
        \App\Services\FcmNotificationService::sendToUser($userId, $title, $body, $payload);

        return response()->json([
            'success' => true,
            'message' => "Test push sent to {$deviceCount} device(s).",
            'devices' => $deviceCount,
        ]);
    }

    private function upsertExpoToken(int $userId, string $token, string $platform, $now): void
    {
        $existing = DB::table('devices')
            ->where('user_id', $userId)
            ->where('expo_push_token', $token)
            ->first();

        if ($existing) {
            DB::table('devices')
                ->where('id', $existing->id)
                ->update([
                    'platform'     => $platform,
                    'last_seen_at' => $now,
                    'updated_at'   => $now,
                ]);

            return;
        }

        DB::table('devices')->insert([
            'user_id'         => $userId,
            'platform'        => $platform,
            'expo_push_token' => $token,
            'fcm_token'       => null,
            'last_seen_at'    => $now,
            'created_at'      => $now,
            'updated_at'      => $now,
        ]);
    }

    private function upsertFcmToken(int $userId, string $token, string $platform, $now): void
    {
        $existing = DB::table('devices')
            ->where('user_id', $userId)
            ->where('platform', $platform)
            ->whereNotNull('fcm_token')
            ->first();

        if ($existing) {
            DB::table('devices')
                ->where('id', $existing->id)
                ->update([
                    'fcm_token'    => $token,
                    'last_seen_at' => $now,
                    'updated_at'   => $now,
                ]);
            $keepId = (int) $existing->id;
        } else {
            $keepId = (int) DB::table('devices')->insertGetId([
                'user_id'         => $userId,
                'platform'        => $platform,
                'expo_push_token' => null,
                'fcm_token'       => $token,
                'last_seen_at'    => $now,
                'created_at'      => $now,
                'updated_at'      => $now,
            ]);
        }

        DB::table('devices')
            ->where('user_id', $userId)
            ->where('platform', $platform)
            ->whereNotNull('fcm_token')
            ->where('id', '!=', $keepId)
            ->delete();
    }
}
