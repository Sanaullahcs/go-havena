<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Family;
use App\Models\FamilyAddMemberRequest;
use App\Models\FamilyJoinRequest;
use App\Models\FamilyMember;
use App\Services\FamilyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FamilyController extends Controller
{
    /** GET /v1/families/mine */
    public function mine(Request $request): JsonResponse
    {
        return response()->json([
            'data' => FamilyService::minePayload($request->user()),
        ]);
    }

    /** GET /v1/families/suggest-number */
    public function suggestNumber(): JsonResponse
    {
        return response()->json([
            'data' => [
                'family_number' => FamilyService::generateFamilyNumber(),
            ],
        ]);
    }

    /** GET /v1/families/check-number?family_number= */
    public function checkNumber(Request $request): JsonResponse
    {
        $data = $request->validate([
            'family_number' => 'required|string|max:30',
        ]);

        try {
            $normalized = FamilyService::validateFamilyNumberFormat($data['family_number']);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'data' => [
                    'available'  => false,
                    'normalized' => null,
                    'message'    => $e->errors()['family_number'][0] ?? 'Invalid family number format.',
                ],
            ]);
        }

        $excludeFamilyId = null;
        $membership = FamilyService::activeMembership($request->user());
        if ($membership) {
            $excludeFamilyId = (int) $membership->family_id;
        }

        $available = FamilyService::isFamilyNumberAvailable($normalized, $excludeFamilyId);

        return response()->json([
            'data' => [
                'available'  => $available,
                'normalized' => $normalized,
                'message'    => $available ? null : 'This Family Number already exists.',
            ],
        ]);
    }

    /** POST /v1/families/ensure — create family with optional custom number */
    public function ensure(Request $request): JsonResponse
    {
        $data = $request->validate([
            'family_number' => 'nullable|string|max:30',
        ]);

        $family = FamilyService::ensureDefaultFamilyForUser(
            $request->user(),
            $data['family_number'] ?? null,
        );

        return response()->json([
            'data' => $family ? FamilyService::formatFamilyBrief($family) : null,
        ]);
    }

    /** POST /v1/families */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'          => 'nullable|string|max:120',
            'family_number' => 'nullable|string|max:30',
        ]);

        $communityId = FamilyService::resolveCommunityIdForProvision($request->user())
            ?? FamilyService::resolveCommunityId($request->user());

        if (! $communityId) {
            abort(422, 'Join a community before creating a family.');
        }

        $familyNumber = isset($data['family_number']) && trim($data['family_number']) !== ''
            ? FamilyService::validateFamilyNumberFormat($data['family_number'])
            : null;

        if ($familyNumber && ! FamilyService::isFamilyNumberAvailable($familyNumber)) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'family_number' => ['This family number is already taken. Choose another.'],
            ]);
        }

        $existing = FamilyService::activeMembership($request->user(), $communityId);
        if ($existing) {
            $family = $existing->family;
        } else {
            $family = FamilyService::ensureDefaultFamilyForUser($request->user(), $familyNumber);
            if (! $family) {
                abort(422, 'Complete your profile before creating a family.');
            }
            $membership = FamilyService::activeMembership($request->user(), $communityId);
            return response()->json([
                'data'    => FamilyService::formatFamily($family, $membership),
                'message' => 'Family created successfully.',
            ], 201);
        }

        $membership = FamilyService::activeMembership($request->user(), $communityId);

        return response()->json([
            'data'    => FamilyService::formatFamily($family, $membership),
            'message' => 'Family created successfully.',
        ], 201);
    }

    /** POST /v1/families/join */
    public function join(Request $request): JsonResponse
    {
        $data = $request->validate([
            'family_number' => 'required|string|max:30',
            'message'       => 'nullable|string|max:500',
        ]);

        $joinRequest = FamilyService::requestJoinByNumber(
            $data['family_number'],
            $request->user(),
            $data['message'] ?? null,
        );

        return response()->json([
            'data'    => FamilyService::formatJoinRequest($joinRequest),
            'message' => 'Join request sent. The family head must approve it.',
        ], 201);
    }

    /** GET /v1/families/join-requests/pending */
    public function pendingJoinRequests(Request $request): JsonResponse
    {
        $communityId = FamilyService::resolveCommunityId($request->user());
        $membership = FamilyService::activeMembership($request->user(), $communityId);

        if (! $membership || $membership->role !== 'head') {
            abort(403, 'Only the family head can view pending requests.');
        }

        $joinItems = FamilyJoinRequest::query()
            ->with(['requester.profile', 'family.community'])
            ->where('family_id', $membership->family_id)
            ->where('status', 'pending')
            ->orderByDesc('created_at')
            ->get()
            ->map(fn ($item) => FamilyService::formatJoinRequest($item));

        // Head only reviews join requests. Add-member nominations wait on community
        // admin first; after admin approval a join request is created automatically.
        return response()->json([
            'data' => $joinItems->values(),
            'meta' => ['count' => $joinItems->count()],
        ]);
    }

    /** POST /v1/families/add-member-requests */
    public function storeAddMemberRequest(Request $request): JsonResponse
    {
        $family = $this->resolveHeadFamily($request);

        $data = $request->validate([
            'first_name' => 'required|string|max:80',
            'last_name'  => 'required|string|max:80',
            'email'      => 'required|email|max:191',
            'phone'      => 'nullable|string|max:32',
            'age'        => 'required|integer|min:1|max:120',
            'unit_number'=> 'required|string|max:50',
        ]);

        $addRequest = FamilyService::requestAddMember($family, $request->user(), $data);

        return response()->json([
            'data'    => FamilyService::formatAddMemberRequest($addRequest),
            'message' => 'Add member request sent to your community admin for approval.',
        ], 201);
    }

    /** PATCH /v1/family-add-member-requests/{id}/approve */
    public function approveAddMemberRequest(Request $request, int $id): JsonResponse
    {
        abort(422, 'After community admin approval, confirm this person from Family requests.');
    }

    /** PATCH /v1/family-add-member-requests/{id}/reject — head cancels while awaiting community admin */
    public function rejectAddMemberRequest(Request $request, int $id): JsonResponse
    {
        $addRequest = $this->findHeadPendingAddRequest($request, $id);

        $data = $request->validate([
            'reason' => 'nullable|string|max:500',
        ]);

        $addRequest = FamilyService::rejectAddMemberRequest(
            $addRequest,
            $request->user(),
            $data['reason'] ?? null,
        );

        return response()->json([
            'data'    => FamilyService::formatAddMemberRequest($addRequest),
            'message' => 'Add member request cancelled.',
        ]);
    }

    /** PATCH /v1/admin/family-add-member-requests/{id}/approve */
    public function adminApproveAddMemberRequest(Request $request, int $id): JsonResponse
    {
        $addRequest = FamilyAddMemberRequest::query()
            ->with(['family.community', 'candidate.profile', 'requestedBy.profile'])
            ->where('id', $id)
            ->whereIn('status', [
                FamilyAddMemberRequest::STATUS_PENDING_ADMIN,
                'pending',
            ])
            ->firstOrFail();

        $joinRequest = FamilyService::approveAddMemberByCommunityAdmin($addRequest, $request->user());

        return response()->json([
            'data' => [
                'add_member_request' => FamilyService::formatAddMemberRequest($addRequest->fresh([
                    'requestedBy.profile',
                    'candidate.profile',
                    'family.community',
                ])),
                'join_request' => FamilyService::formatJoinRequest($joinRequest),
            ],
            'message' => 'Resident approved. Family head has been notified to confirm membership.',
        ]);
    }

    /** PATCH /v1/admin/family-add-member-requests/{id}/reject */
    public function adminRejectAddMemberRequest(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'reason' => 'required|string|min:3|max:500',
        ]);

        $addRequest = FamilyAddMemberRequest::query()
            ->with(['family.community', 'candidate.profile', 'requestedBy.profile'])
            ->where('id', $id)
            ->whereIn('status', [
                FamilyAddMemberRequest::STATUS_PENDING_ADMIN,
                'pending',
            ])
            ->firstOrFail();

        $addRequest = FamilyService::rejectAddMemberByCommunityAdmin(
            $addRequest,
            $request->user(),
            $data['reason'],
        );

        return response()->json([
            'data'    => FamilyService::formatAddMemberRequest($addRequest),
            'message' => 'Family add request rejected.',
        ]);
    }

    /** PATCH /v1/family-join-requests/{id}/approve */
    public function approveJoinRequest(Request $request, int $id): JsonResponse
    {
        $joinRequest = $this->findHeadPendingRequest($request, $id);
        $result = FamilyService::approveJoinRequest($joinRequest, $request->user());

        if (($result['outcome'] ?? '') === 'awaiting_admin') {
            return response()->json([
                'data'    => FamilyService::formatJoinRequest($result['join_request']),
                'message' => 'Join request approved. The resident will now wait for community admin approval.',
            ]);
        }

        return response()->json([
            'data'    => FamilyService::formatMember($result['member']),
            'message' => 'Join request approved.',
        ]);
    }

    /** PATCH /v1/family-join-requests/{id}/reject */
    public function rejectJoinRequest(Request $request, int $id): JsonResponse
    {
        $joinRequest = $this->findHeadPendingRequest($request, $id);

        $data = $request->validate([
            'reason' => 'nullable|string|max:500',
        ]);

        $joinRequest = FamilyService::rejectJoinRequest(
            $joinRequest,
            $request->user(),
            $data['reason'] ?? null,
        );

        return response()->json([
            'data'    => FamilyService::formatJoinRequest($joinRequest),
            'message' => 'Join request rejected.',
        ]);
    }

    /** PATCH /v1/family-join-requests/{id}/cancel — requester cancels their own pending request */
    public function cancelJoinRequest(Request $request, int $id): JsonResponse
    {
        $joinRequest = FamilyJoinRequest::query()
            ->with(['requester.profile', 'family.community'])
            ->where('id', $id)
            ->where('requester_user_id', $request->user()->id)
            ->where('status', 'pending')
            ->firstOrFail();

        $joinRequest = FamilyService::cancelJoinRequest($joinRequest, $request->user());

        return response()->json([
            'data'    => FamilyService::formatJoinRequest($joinRequest),
            'message' => 'Join request cancelled.',
        ]);
    }

    /** PATCH /v1/families/members/{userId}/suspend */
    public function suspendMember(Request $request, int $userId): JsonResponse
    {
        $family = $this->resolveHeadFamily($request);
        $member = FamilyService::suspendMember($family, $request->user(), $userId);

        return response()->json([
            'data'    => FamilyService::formatMember($member),
            'message' => 'Member suspended.',
        ]);
    }

    /** PATCH /v1/families/members/{userId}/unsuspend */
    public function unsuspendMember(Request $request, int $userId): JsonResponse
    {
        $family = $this->resolveHeadFamily($request);
        $member = FamilyService::unsuspendMember($family, $request->user(), $userId);

        return response()->json([
            'data'    => FamilyService::formatMember($member),
            'message' => 'Member access restored.',
        ]);
    }

    /** DELETE /v1/families/members/{userId} */
    public function removeMember(Request $request, int $userId): JsonResponse
    {
        $family = $this->resolveHeadFamily($request);
        FamilyService::removeMember($family, $request->user(), $userId);

        return response()->json([
            'success' => true,
            'message' => 'Member removed.',
        ]);
    }

    /** PATCH /v1/families/members/{userId}/block */
    public function blockMember(Request $request, int $userId): JsonResponse
    {
        $family = $this->resolveHeadFamily($request);
        FamilyService::blockMember($family, $request->user(), $userId);

        return response()->json([
            'success' => true,
            'message' => 'Member blocked.',
        ]);
    }

    /** POST /v1/families/leave */
    public function leave(Request $request): JsonResponse
    {
        $communityId = FamilyService::resolveCommunityId($request->user());
        $membership = FamilyService::activeMembership($request->user(), $communityId);

        if (! $membership) {
            abort(422, 'You are not in a family.');
        }

        FamilyService::leaveFamily($request->user(), $membership->family);

        return response()->json([
            'success' => true,
            'message' => 'You left the family.',
        ]);
    }

    private function resolveHeadFamily(Request $request): Family
    {
        $communityId = FamilyService::resolveCommunityId($request->user());
        $membership = FamilyService::activeMembership($request->user(), $communityId);

        if (! $membership || $membership->role !== 'head') {
            abort(403, 'Only the family head can perform this action.');
        }

        return $membership->family;
    }

    private function findHeadPendingRequest(Request $request, int $id): FamilyJoinRequest
    {
        $family = $this->resolveHeadFamily($request);

        return FamilyJoinRequest::query()
            ->with(['requester.profile', 'family.community'])
            ->where('id', $id)
            ->where('family_id', $family->id)
            ->where('status', 'pending')
            ->firstOrFail();
    }

    private function findHeadPendingAddRequest(Request $request, int $id): FamilyAddMemberRequest
    {
        $family = $this->resolveHeadFamily($request);

        return FamilyAddMemberRequest::query()
            ->with(['requestedBy.profile', 'candidate.profile', 'family.community'])
            ->where('id', $id)
            ->where('family_id', $family->id)
            ->whereIn('status', [
                FamilyAddMemberRequest::STATUS_PENDING_ADMIN,
                'pending',
            ])
            ->firstOrFail();
    }
}
