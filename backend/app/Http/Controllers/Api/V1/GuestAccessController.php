<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\GuestInvitation;
use App\Services\GuestAccessService;
use App\Services\GuestInvitationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GuestAccessController extends Controller
{
    /** GET /v1/guest-access/status — current guest invitation for the logged-in guest account. */
    public function status(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! GuestAccessService::isGuest($user)) {
            return response()->json([
                'message' => 'Guest access required.',
                'code'    => 'NOT_GUEST',
            ], 403);
        }

        $invitation = GuestInvitation::query()
            ->with(['invitedBy.profile', 'community'])
            ->where('guest_user_id', $user->id)
            ->orderByDesc('id')
            ->first();

        if (! $invitation) {
            return response()->json([
                'message' => 'No guest invitation found for this account.',
                'code'    => 'NO_GUEST_INVITATION',
            ], 404);
        }

        return response()->json([
            'data' => GuestInvitationService::formatInvitation($invitation),
        ]);
    }
}
