<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\AdminRoleService;
use App\Services\BillingContactTransferService;
use App\Services\UnitAssignmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class UnitController extends Controller
{
    public function __construct(
        private UnitAssignmentService $units,
        private BillingContactTransferService $transfers,
    ) {}

    /** GET /v1/communities/{id}/units — complete-profile picker. */
    public function communityIndex(Request $request, int $id): JsonResponse
    {
        $includeOffice = AdminRoleService::isCommunityAdminRole($request->user())
            || AdminRoleService::isSystemAdmin($request->user());

        return response()->json([
            'data' => $this->units->listCommunityUnits($id, $includeOffice),
        ]);
    }

    /** GET /v1/units/mine */
    public function mine(Request $request): JsonResponse
    {
        $communityId = $this->resolveResidentCommunityId($request);
        $data = $this->units->userUnitBrief($request->user(), $communityId);
        if ($data) {
            $data = $this->transfers->enrichResidentUnit($data, $request->user());
        }

        return response()->json([
            'data' => $data,
        ]);
    }

    /** POST /v1/units/mine/billing-contact-transfers */
    public function requestTransfer(Request $request): JsonResponse
    {
        $data = $request->validate([
            'nominee_user_id' => 'required|integer|exists:users,id',
            'message' => 'nullable|string|max:500',
        ]);

        return response()->json([
            'data' => $this->transfers->requestTransfer(
                $request->user()->loadMissing('profile'),
                (int) $data['nominee_user_id'],
                $data['message'] ?? null,
            ),
            'message' => 'Billing contact request sent. The resident must accept before the contact changes.',
        ], 201);
    }

    /** PATCH /v1/billing-contact-transfers/{id}/accept */
    public function acceptTransfer(Request $request, int $id): JsonResponse
    {
        return response()->json([
            'data' => $this->transfers->accept($request->user()->loadMissing('profile'), $id),
            'message' => 'You are now the billing contact for this unit.',
        ]);
    }

    /** PATCH /v1/billing-contact-transfers/{id}/reject */
    public function rejectTransfer(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'rejection_reason' => 'nullable|string|max:500',
        ]);

        return response()->json([
            'data' => $this->transfers->reject(
                $request->user()->loadMissing('profile'),
                $id,
                $data['rejection_reason'] ?? null,
            ),
            'message' => 'Request declined. The current billing contact is unchanged.',
        ]);
    }

    /** PATCH /v1/billing-contact-transfers/{id}/cancel */
    public function cancelTransfer(Request $request, int $id): JsonResponse
    {
        return response()->json([
            'data' => $this->transfers->cancel($request->user()->loadMissing('profile'), $id),
            'message' => 'Request withdrawn. You remain the billing contact.',
        ]);
    }

    /** GET /v1/admin/units */
    public function adminIndex(Request $request): JsonResponse
    {
        $communityId = $this->resolveAdminCommunityId($request);
        $this->units->repairStaffAssignments($communityId);
        $rows = DB::table('units')
            ->where('community_id', $communityId)
            ->orderByRaw("CASE kind WHEN 'residential' THEN 0 ELSE 1 END")
            ->orderBy('unit_number')
            ->get();

        return response()->json([
            'data' => $rows->map(fn ($row) => $this->units->formatAdminUnit($row))->all(),
        ]);
    }

    /** POST /v1/admin/units */
    public function adminStore(Request $request): JsonResponse
    {
        $communityId = $this->resolveAdminCommunityId($request);
        $data = $request->validate([
            'unit_number' => 'required|string|max:50',
            'kind' => ['nullable', Rule::in(['residential', 'office'])],
        ]);

        $unit = $this->units->createUnit($communityId, $data['unit_number'], $data['kind'] ?? 'residential');

        return response()->json([
            'data' => $this->units->formatAdminUnit($unit),
            'message' => 'Unit created.',
        ], 201);
    }

    /** PATCH /v1/admin/units/{id} */
    public function adminUpdate(Request $request, int $id): JsonResponse
    {
        $communityId = $this->resolveAdminCommunityId($request);
        $data = $request->validate([
            'unit_number' => 'sometimes|required|string|max:50',
            'status' => ['sometimes', Rule::in(['active', 'inactive'])],
            'kind' => ['sometimes', Rule::in(['residential', 'office'])],
        ]);

        $unit = $this->units->updateUnit($communityId, $id, $data);

        return response()->json([
            'data' => $this->units->formatAdminUnit($unit),
            'message' => 'Unit updated.',
        ]);
    }

    /** PATCH /v1/admin/units/{id}/billing-contact */
    public function adminTransfer(Request $request, int $id): JsonResponse
    {
        $communityId = $this->resolveAdminCommunityId($request);
        $data = $request->validate([
            'user_id' => 'required|integer|exists:users,id',
        ]);

        $unit = $this->units->transferBillingContact($communityId, $id, (int) $data['user_id']);

        return response()->json([
            'data' => $this->units->formatAdminUnit($unit),
            'message' => 'Billing contact updated.',
        ]);
    }

    private function resolveResidentCommunityId(Request $request): int
    {
        if ($request->filled('community_id')) {
            return (int) $request->community_id;
        }

        $membership = DB::table('community_memberships')
            ->where('user_id', $request->user()->id)
            ->where('status', 'approved')
            ->orderByDesc('created_at')
            ->first();

        abort_if(! $membership, 422, 'No approved community membership found.');

        return (int) $membership->community_id;
    }

    private function resolveAdminCommunityId(Request $request): int
    {
        $scope = AdminRoleService::resolveAdminCommunityScope($request->user(), $request);
        abort_if(! $scope, 422, 'No community scope available.');

        return (int) $scope;
    }
}
