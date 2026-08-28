<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\GuestInvitation;
use App\Services\AdminRoleService;
use App\Services\GuestAccessService;
use App\Services\GuestInvitationService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ResidentGuestController extends Controller
{
    /** GET /v1/guest-invitations/mine — invitations created by resident */
    public function mine(Request $request): JsonResponse
    {
        $user = $request->user();
        $communityId = $this->resolveCommunityId($user);

        $items = GuestInvitation::query()
            ->with(['invitedBy.profile', 'guestUser.profile', 'community'])
            ->where('invited_by_user_id', $user->id)
            ->when($communityId, fn ($q) => $q->where('community_id', $communityId))
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'data' => $items->map(fn ($i) => GuestInvitationService::formatInvitation($i))->values(),
        ]);
    }

    /** POST /v1/guest-invitations */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (($user->role ?? '') === 'guest') {
            abort(403, 'Guests cannot invite other users.');
        }

        $communityId = $this->resolveCommunityId($user);
        if (! $communityId) {
            abort(422, 'Join a community before inviting guests.');
        }

        $data = $request->validate(array_merge([
            'guest_name'  => 'required|string|max:100',
            'guest_email' => 'required|email|max:200',
            'guest_phone' => 'nullable|string|max:30',
            'starts_at'   => 'required|date',
            'ends_at'     => 'required|date|after:starts_at',
        ], GuestAccessService::permissionValidationRules()));

        $invitation = GuestInvitationService::create($communityId, $user, 'resident', $data);

        NotificationService::send(
            $user->id,
            'success',
            'Guest invitation created',
            "Invitation for {$invitation->guest_name} is ready. Share code {$invitation->invite_code}.",
            null,
            ['invite_code' => $invitation->invite_code],
        );

        return response()->json([
            'data'    => GuestInvitationService::formatInvitation($invitation, true),
            'message' => 'Guest invitation created. Share the invite code or QR with your guest.',
        ], 201);
    }

    /** PATCH /v1/guest-invitations/{id}/approve */
    public function approve(Request $request, int $id): JsonResponse
    {
        $invitation = $this->findOwnedPending($request, $id);
        $invitation = GuestInvitationService::approve($invitation, $request->user());

        return response()->json([
            'data'    => GuestInvitationService::formatInvitation($invitation),
            'message' => 'Guest access approved.',
        ]);
    }

    /** PATCH /v1/guest-invitations/{id}/reject */
    public function reject(Request $request, int $id): JsonResponse
    {
        $invitation = $this->findOwnedPending($request, $id);

        $data = $request->validate([
            'reason' => 'nullable|string|max:500',
        ]);

        $invitation = GuestInvitationService::reject(
            $invitation,
            $request->user(),
            $data['reason'] ?? null,
        );

        return response()->json([
            'data'    => GuestInvitationService::formatInvitation($invitation),
            'message' => 'Guest access rejected.',
        ]);
    }

    /** GET /v1/guest-invitations/pending-approval */
    public function pendingApproval(Request $request): JsonResponse
    {
        $user = $request->user();

        $items = GuestInvitation::query()
            ->with(['invitedBy.profile', 'guestUser.profile', 'community'])
            ->where('invited_by_user_id', $user->id)
            ->where('status', 'pending_approval')
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'data' => $items->map(fn ($i) => GuestInvitationService::formatInvitation($i))->values(),
        ]);
    }

    private function findOwnedPending(Request $request, int $id): GuestInvitation
    {
        return GuestInvitation::query()
            ->where('id', $id)
            ->where('invited_by_user_id', $request->user()->id)
            ->where('status', 'pending_approval')
            ->firstOrFail();
    }

    private function resolveCommunityId($user): ?int
    {
        $membership = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('status', 'approved')
            ->orderByDesc('created_at')
            ->first();

        return $membership ? (int) $membership->community_id : null;
    }
}
