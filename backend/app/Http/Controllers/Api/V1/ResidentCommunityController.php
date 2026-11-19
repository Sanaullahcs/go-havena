<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\Community;
use App\Models\InviteCode;
use App\Services\ActivityLogService;
use App\Services\InviteCodeService;
use App\Services\NotificationService;
use App\Services\UnitAssignmentService;
use App\Services\UserActingContextService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ResidentCommunityController extends Controller
{
    /** GET /v1/me/communities */
    public function communities(Request $request): JsonResponse
    {
        $user = $request->user()->load(['memberships.community']);
        $activeId = UserActingContextService::currentCommunityId($user);
        $needsUnits = array_fill_keys(
            UserActingContextService::pendingInviteCommunityIdsNeedingUnits($user),
            true,
        );

        $communities = $user->memberships
            ->filter(fn ($membership) => ($membership->role ?? '') !== 'guest')
            ->sortByDesc(fn ($membership) => $membership->updated_at?->timestamp ?? 0)
            ->values()
            ->map(function ($membership) use ($activeId, $needsUnits) {
                $community = $membership->community;

                return [
                    'id' => $membership->id,
                    'community_id' => (int) $membership->community_id,
                    'role' => $membership->role,
                    'status' => $membership->status,
                    'needs_units' => isset($needsUnits[(int) $membership->community_id]),
                    'is_active' => $activeId !== null && (int) $membership->community_id === (int) $activeId,
                    'invite_code_used' => $membership->invite_code_used,
                    'rejection_reason' => $membership->rejection_reason,
                    'rejected_by' => $membership->rejected_by,
                    'created_at' => $membership->created_at,
                    'updated_at' => $membership->updated_at,
                    'community' => $community ? $this->communityPayload($community) : null,
                ];
            });

        return response()->json([
            'data' => $communities,
            'meta' => [
                'active_community_id' => $activeId,
            ],
        ]);
    }

    /** GET /v1/me/invitations */
    public function invitations(Request $request): JsonResponse
    {
        $user = $request->user();
        $units = app(UnitAssignmentService::class);

        $invites = InviteCode::query()
            ->with(['community', 'creator.profile'])
            ->pendingForUser((int) $user->id)
            ->orderByDesc('id')
            ->get()
            ->map(fn (InviteCode $invite) => $this->invitationPayload($invite, $units));

        return response()->json([
            'data' => $invites->values(),
        ]);
    }

    /** POST /v1/me/invitations/{invite}/reject */
    public function rejectInvitation(Request $request, InviteCode $invite): JsonResponse
    {
        $user = $request->user();
        $invite = InviteCodeService::rejectForUser($invite, $user);
        $communityName = $invite->community?->name ?? 'the community';

        NotificationService::send(
            (int) $user->id,
            'info',
            'Invitation declined',
            "You declined the invitation to {$communityName}. Your other community memberships are unchanged.",
        );

        ActivityLogService::user(
            'member_invite_rejected',
            "{$user->name} declined the invitation to {$communityName}",
            'User',
            (int) $user->id,
        );

        return response()->json([
            'data' => [
                'id' => $invite->id,
                'status' => 'invite_rejected',
                'rejected_at' => $invite->rejected_at?->toIso8601String(),
                'user' => (new UserResource($user->fresh(['profile.region', 'memberships.community'])))->resolve(),
            ],
            'message' => 'Invitation declined.',
        ]);
    }

    /** @return array<string, mixed> */
    private function invitationPayload(InviteCode $invite, UnitAssignmentService $units): array
    {
        $community = $invite->community;
        $unitNumbers = $units->listInviteUnitNumbers((int) $invite->community_id, (int) $invite->invited_user_id);

        return [
            'id' => $invite->id,
            'code' => $invite->code,
            'expires_at' => $invite->expires_at?->toIso8601String(),
            'created_at' => $invite->created_at,
            'units' => array_map(
                fn (string $number) => ['unit_number' => $number, 'locked' => true],
                $unitNumbers,
            ),
            'invited_by' => $invite->creator ? [
                'id' => $invite->creator->id,
                'name' => $invite->creator->profile?->display_name ?: $invite->creator->name,
            ] : null,
            'community' => $community ? $this->communityPayload($community) : null,
        ];
    }

    /** @return array<string, mixed> */
    private function communityPayload(Community $community): array
    {
        return [
            'id' => $community->id,
            'name' => $community->name,
            'region' => $community->region,
            'region_id' => $community->region_id,
            'address' => $community->address,
            'description' => $community->description,
            'status' => $community->status,
            'review_status' => $community->review_status,
        ];
    }
}
