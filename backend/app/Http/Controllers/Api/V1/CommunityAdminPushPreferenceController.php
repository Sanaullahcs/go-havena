<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\AdminRoleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CommunityAdminPushPreferenceController extends Controller
{
    /** GET /v1/me/push-notifications */
    public function show(Request $request): JsonResponse
    {
        $user = $this->pushAccount($request);

        return response()->json([
            'data' => [
                'enabled' => (bool) ($user->push_notifications_enabled ?? true),
            ],
        ]);
    }

    /** PATCH /v1/me/push-notifications */
    public function update(Request $request): JsonResponse
    {
        $user = $this->pushAccount($request);
        $validated = $request->validate([
            'enabled' => 'required|boolean',
        ]);

        $user->update([
            'push_notifications_enabled' => (bool) $validated['enabled'],
        ]);

        return response()->json([
            'data' => [
                'enabled' => (bool) $user->push_notifications_enabled,
            ],
        ]);
    }

    private function pushAccount(Request $request)
    {
        $user = $request->user();
        $allowed = AdminRoleService::isCommunityAdminRole($user) || ($user->role ?? '') === 'resident';
        if (! $allowed) {
            abort(403, 'Only a community admin or resident can change this preference.');
        }

        return $user;
    }
}
