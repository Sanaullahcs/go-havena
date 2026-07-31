<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\GuestInvitation;
use App\Models\User;
use App\Services\AdminRoleService;
use App\Services\GuestActivityService;
use App\Services\GuestAccessService;
use App\Services\GuestInvitationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class GuestController extends Controller
{
    /** GET /v1/admin/guests */
    public function index(Request $request): JsonResponse
    {
        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);

        $query = GuestInvitation::query()
            ->with(['invitedBy.profile', 'guestUser.profile', 'community'])
            ->where('community_id', $communityId);

        if ($request->filled('status') && $request->status !== 'all') {
            if ($request->status === 'pending') {
                $query->whereIn('status', ['pending_verification', 'pending_approval']);
            } else {
                $query->where('status', $request->status);
            }
        }

        if ($request->filled('search')) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('guest_name', 'like', "%{$s}%")
                    ->orWhere('guest_email', 'like', "%{$s}%")
                    ->orWhere('guest_phone', 'like', "%{$s}%")
                    ->orWhere('invite_code', 'like', "%{$s}%");
            });
        }

        $items = $query->orderByDesc('created_at')
            ->paginate(min((int) ($request->per_page ?? 15), 100));

        return response()->json([
            'data' => collect($items->items())->map(
                fn ($i) => GuestInvitationService::formatInvitation($i),
            )->values(),
            'meta' => [
                'current_page' => $items->currentPage(),
                'last_page'    => $items->lastPage(),
                'total'        => $items->total(),
                'per_page'     => $items->perPage(),
                'stats'        => $this->stats($communityId),
            ],
        ]);
    }

    /** GET /v1/admin/guests/{id} */
    public function show(Request $request, int $id): JsonResponse
    {
        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);
        $invitation = $this->findInCommunity($id, $communityId);

        return response()->json([
            'data' => GuestInvitationService::formatInvitation($invitation, true),
        ]);
    }

    /** POST /v1/admin/guests/invite */
    public function invite(Request $request): JsonResponse
    {
        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);

        $data = $request->validate(array_merge([
            'guest_name'  => 'required|string|max:100',
            'guest_email' => 'required|email|max:200',
            'guest_phone' => 'required|string|max:30',
            'starts_at'   => 'required|date',
            'ends_at'     => 'required|date|after:starts_at',
        ], GuestAccessService::permissionValidationRules()));

        $invitation = GuestInvitationService::create(
            $communityId,
            $request->user(),
            'admin',
            $data,
        );

        if ($invitation->guest_email) {
            // Email not implemented — notification placeholder for guest email would go here
        }

        return response()->json([
            'data'    => GuestInvitationService::formatInvitation($invitation, true),
            'message' => 'Guest invitation created successfully.',
        ], 201);
    }

    /** PATCH /v1/admin/guests/{id}/approve */
    public function approve(Request $request, int $id): JsonResponse
    {
        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);
        $invitation = $this->findInCommunity($id, $communityId);

        if ($invitation->status !== 'pending_approval') {
            return response()->json([
                'message' => 'This invitation is not awaiting approval.',
                'code'    => 'NOT_PENDING_APPROVAL',
            ], 422);
        }

        $this->assertInviterCanApproveOrReject($invitation, $request->user());

        $invitation = GuestInvitationService::approve($invitation, $request->user());

        return response()->json([
            'data'    => GuestInvitationService::formatInvitation($invitation),
            'message' => 'Guest access approved.',
        ]);
    }

    /** PATCH /v1/admin/guests/{id}/reject */
    public function reject(Request $request, int $id): JsonResponse
    {
        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);
        $invitation = $this->findInCommunity($id, $communityId);

        if ($invitation->status !== 'pending_approval') {
            return response()->json([
                'message' => 'This invitation is not awaiting approval.',
                'code'    => 'NOT_PENDING_APPROVAL',
            ], 422);
        }

        $this->assertInviterCanApproveOrReject($invitation, $request->user());

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

    /** PATCH /v1/admin/guests/{id}/revoke */
    public function revoke(Request $request, int $id): JsonResponse
    {
        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);
        $invitation = $this->findInCommunity($id, $communityId);
        $invitation = GuestInvitationService::revoke($invitation, $request->user());

        return response()->json([
            'data'    => GuestInvitationService::formatInvitation($invitation),
            'message' => 'Guest access revoked.',
        ]);
    }

    /** PATCH /v1/admin/guests/{id}/extend */
    public function extend(Request $request, int $id): JsonResponse
    {
        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);
        $invitation = $this->findInCommunity($id, $communityId);

        $data = $request->validate([
            'ends_at' => 'sometimes|date|after:starts_at',
        ]);

        $invitation = GuestInvitationService::extend($invitation, $data, $request->user());

        return response()->json([
            'data'    => GuestInvitationService::formatInvitation($invitation),
            'message' => 'Guest access extended.',
        ]);
    }

    /** GET /v1/admin/guests/{id}/activity */
    public function activity(Request $request, int $id): JsonResponse
    {
        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);
        $invitation = $this->findInCommunity($id, $communityId);

        $perPage = min(max((int) ($request->per_page ?? 10), 1), 50);
        $page = max((int) ($request->page ?? 1), 1);

        $query = DB::table('guest_activity_logs')
            ->where('guest_invitation_id', $invitation->id)
            ->orderByDesc('created_at');

        $total = (clone $query)->count();
        $logs = $query->forPage($page, $perPage)->get();

        return response()->json([
            'data' => $logs->map(fn ($log) => [
                'id'          => $log->id,
                'action'      => $log->action,
                'description' => $log->description,
                'meta'        => $log->meta ? json_decode($log->meta, true) : null,
                'created_at'  => $log->created_at,
            ])->values(),
            'meta' => [
                'current_page' => $page,
                'last_page'    => max(1, (int) ceil($total / $perPage)),
                'total'        => $total,
                'per_page'     => $perPage,
            ],
        ]);
    }

    private function findInCommunity(int $id, int $communityId): GuestInvitation
    {
        return GuestInvitation::query()
            ->where('id', $id)
            ->where('community_id', $communityId)
            ->firstOrFail();
    }

    /** Inviter, or a community admin for dashboard admin invites, may approve or reject. */
    private function assertInviterCanApproveOrReject(GuestInvitation $invitation, User $user): void
    {
        if ((int) $invitation->invited_by_user_id === (int) $user->id) {
            return;
        }

        if (
            $invitation->invitation_type === 'admin'
            && AdminRoleService::canManageCommunity($user, (int) $invitation->community_id)
        ) {
            return;
        }

        abort(403, 'Only the host who invited this guest can approve or reject their access.');
    }

    /** @return array<string, int> */
    private function stats(int $communityId): array
    {
        $rows = GuestInvitation::query()
            ->where('community_id', $communityId)
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status');

        return [
            'total'                 => (int) $rows->sum(),
            'pending_verification'  => (int) ($rows['pending_verification'] ?? 0),
            'pending_approval'      => (int) ($rows['pending_approval'] ?? 0),
            'active'                => (int) ($rows['active'] ?? 0),
            'expired'               => (int) ($rows['expired'] ?? 0),
            'revoked'               => (int) ($rows['revoked'] ?? 0),
            'rejected'              => (int) ($rows['rejected'] ?? 0),
        ];
    }
}
