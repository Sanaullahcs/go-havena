<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AppVersionSetting;
use App\Services\PushNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class AppVersionController extends Controller
{
    /** GET /v1/app/version-policy?platform=ios|android */
    public function policy(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'platform' => ['nullable', Rule::in(['ios', 'android'])],
        ]);

        $settings = AppVersionSetting::current();
        $platform = strtolower((string) ($validated['platform'] ?? ''));

        if ($platform === 'ios' || $platform === 'android') {
            return response()->json([
                'data' => $settings->platformPayload($platform),
            ]);
        }

        return response()->json([
            'data' => [
                'ios' => $settings->platformPayload('ios'),
                'android' => $settings->platformPayload('android'),
            ],
        ]);
    }

    /** GET /v1/admin/app-version/settings */
    public function settings(): JsonResponse
    {
        return response()->json([
            'data' => AppVersionSetting::current()->toAdminArray(),
        ]);
    }

    /** PUT /v1/admin/app-version/settings */
    public function updateSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ios.latest_version' => ['required', 'string', 'max:32', 'regex:/^\d+(\.\d+){0,3}$/'],
            'ios.minimum_version' => ['required', 'string', 'max:32', 'regex:/^\d+(\.\d+){0,3}$/'],
            'ios.force_update' => ['required', 'boolean'],
            'ios.store_url' => ['required', 'url', 'max:500'],
            'android.latest_version' => ['required', 'string', 'max:32', 'regex:/^\d+(\.\d+){0,3}$/'],
            'android.minimum_version' => ['required', 'string', 'max:32', 'regex:/^\d+(\.\d+){0,3}$/'],
            'android.force_update' => ['required', 'boolean'],
            'android.store_url' => ['required', 'url', 'max:500'],
        ]);

        $ios = $validated['ios'];
        $android = $validated['android'];

        if ($this->compareSemver($ios['minimum_version'], $ios['latest_version']) > 0) {
            return response()->json([
                'message' => 'iOS minimum version cannot be higher than the latest version.',
                'errors' => ['ios.minimum_version' => ['Minimum version cannot exceed latest version.']],
            ], 422);
        }

        if ($this->compareSemver($android['minimum_version'], $android['latest_version']) > 0) {
            return response()->json([
                'message' => 'Android minimum version cannot be higher than the latest version.',
                'errors' => ['android.minimum_version' => ['Minimum version cannot exceed latest version.']],
            ], 422);
        }

        $settings = AppVersionSetting::current();
        $settings->fill([
            'ios_latest_version' => $ios['latest_version'],
            'ios_minimum_version' => $ios['minimum_version'],
            // Force update never auto-enables from version edits; only explicit boolean writes.
            'ios_force_update' => (bool) $ios['force_update'],
            'ios_store_url' => $ios['store_url'],
            'android_latest_version' => $android['latest_version'],
            'android_minimum_version' => $android['minimum_version'],
            'android_force_update' => (bool) $android['force_update'],
            'android_store_url' => $android['store_url'],
            'updated_by' => $request->user()?->id,
        ]);
        $settings->save();

        return response()->json([
            'data' => $settings->fresh()->toAdminArray(),
            'message' => 'App version settings updated.',
        ]);
    }

    /**
     * POST /v1/admin/app-version/send-update-notification
     * Expo push only — does not create inbox (app_notifications) rows.
     */
    public function sendUpdateNotification(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'platform' => ['nullable', Rule::in(['ios', 'android', 'all'])],
        ]);

        $platformFilter = strtolower((string) ($validated['platform'] ?? 'all'));
        $settings = AppVersionSetting::current();

        if (! Schema::hasTable('devices')) {
            return response()->json([
                'message' => 'No devices table available.',
                'data' => ['users_notified' => 0, 'tokens_targeted' => 0],
            ], 422);
        }

        $query = DB::table('devices')
            ->whereNotNull('expo_push_token')
            ->where('expo_push_token', '!=', '')
            ->whereNotNull('user_id');

        if ($platformFilter === 'ios' || $platformFilter === 'android') {
            $query->where('platform', $platformFilter);
        } else {
            $query->whereIn('platform', ['ios', 'android']);
        }

        $rows = $query->get(['user_id', 'platform', 'expo_push_token']);
        if ($rows->isEmpty()) {
            return response()->json([
                'message' => 'No registered mobile devices with Expo push tokens.',
                'data' => ['users_notified' => 0, 'tokens_targeted' => 0],
            ]);
        }

        $byUser = [];
        foreach ($rows as $row) {
            $uid = (int) $row->user_id;
            $plat = strtolower((string) ($row->platform ?? ''));
            if (! isset($byUser[$uid])) {
                $byUser[$uid] = [];
            }
            if ($plat === 'ios' || $plat === 'android') {
                $byUser[$uid][$plat] = true;
            }
        }

        $title = 'Havena Update Available';
        $body = 'A new version of Havena is available. Please update the app.';
        $sentUsers = 0;

        foreach ($byUser as $userId => $platforms) {
            $preferred = isset($platforms['ios']) ? 'ios' : 'android';
            if ($platformFilter === 'ios' || $platformFilter === 'android') {
                $preferred = $platformFilter;
            }

            $storeUrl = $preferred === 'ios'
                ? ($settings->ios_store_url ?: AppVersionSetting::DEFAULT_IOS_STORE_URL)
                : ($settings->android_store_url ?: AppVersionSetting::DEFAULT_ANDROID_STORE_URL);

            try {
                PushNotificationService::sendToUser($userId, $title, $body, [
                    'kind' => 'app_update',
                    'type' => 'app_update',
                    'platform' => $preferred,
                    'store_url' => $storeUrl,
                    'action_url' => $storeUrl,
                    'actionUrl' => $storeUrl,
                    'ios_store_url' => $settings->ios_store_url ?: AppVersionSetting::DEFAULT_IOS_STORE_URL,
                    'android_store_url' => $settings->android_store_url ?: AppVersionSetting::DEFAULT_ANDROID_STORE_URL,
                ]);
                $sentUsers++;
            } catch (\Throwable $e) {
                Log::warning('App update push failed', [
                    'user_id' => $userId,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return response()->json([
            'message' => 'Update notification sent.',
            'data' => [
                'users_notified' => $sentUsers,
                'tokens_targeted' => $rows->count(),
                'platform' => $platformFilter,
            ],
        ]);
    }

    /** @return int negative if a < b, 0 if equal, positive if a > b */
    private function compareSemver(string $a, string $b): int
    {
        $pa = array_map('intval', explode('.', preg_replace('/[^0-9.]/', '', $a) ?: '0'));
        $pb = array_map('intval', explode('.', preg_replace('/[^0-9.]/', '', $b) ?: '0'));
        $len = max(count($pa), count($pb), 3);
        for ($i = 0; $i < $len; $i++) {
            $ai = $pa[$i] ?? 0;
            $bi = $pb[$i] ?? 0;
            if ($ai < $bi) {
                return -1;
            }
            if ($ai > $bi) {
                return 1;
            }
        }

        return 0;
    }
}
