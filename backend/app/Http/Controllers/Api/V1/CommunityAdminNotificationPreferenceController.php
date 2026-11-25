<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\AdminRoleService;
use App\Services\CommunityAdminNotificationPreferences;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CommunityAdminNotificationPreferenceController extends Controller
{
    /** GET /v1/me/notification-preferences */
    public function show(Request $request): JsonResponse
    {
        return response()->json([
            'data' => CommunityAdminNotificationPreferences::forUser($this->account($request)),
        ]);
    }

    /** PATCH /v1/me/notification-preferences */
    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'new_member_alerts' => 'sometimes|boolean',
            'moderation_alerts' => 'sometimes|boolean',
            'system_alerts'     => 'sometimes|boolean',
            'weekly_digest'     => 'sometimes|boolean',
        ]);

        if ($validated === []) {
            return response()->json(['message' => 'Choose at least one preference.'], 422);
        }

        $saved = CommunityAdminNotificationPreferences::save($this->account($request), $validated);

        return response()->json(['data' => $saved]);
    }

    private function account(Request $request)
    {
        $user = $request->user();
        $allowed = AdminRoleService::isCommunityAdminRole($user) || AdminRoleService::isSystemAdmin($user);
        if (! $allowed) {
            abort(403, 'Only a dashboard admin can change these preferences.');
        }

        return $user;
    }
}
