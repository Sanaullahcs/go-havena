<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\AdminRoleService;
use App\Services\BillingContactTransferService;
use App\Services\UnitAssignmentService;
use App\Services\UnitRegistrationPackageService;
use App\Services\UserActingContextService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class UnitController extends Controller
{
    public function __construct(
        private UnitAssignmentService $units,
        private BillingContactTransferService $transfers,
        private UnitRegistrationPackageService $packages,
    ) {}

    /** GET /v1/communities/{id}/units — complete-profile picker. */
    public function communityIndex(Request $request, int $id): JsonResponse
    {
        $this->assertCommunityUnitsAccess($request, $id, mutating: false);
        $includeOffice = AdminRoleService::isCommunityAdminRole($request->user())
            || AdminRoleService::isSystemAdmin($request->user());

        return response()->json([
            'data' => $this->units->listCommunityUnits($id, $includeOffice),
        ]);
    }

    /** POST /v1/communities/{id}/units — onboarding / profile unit catalog. */
    public function communityStore(Request $request, int $id): JsonResponse
    {
        $this->assertCommunityUnitsAccess($request, $id, mutating: true);
        $data = $request->validate([
            'unit_number' => 'required|string|max:50',
        ]);

        $unitNumber = trim($data['unit_number']);
        if ($this->units->unitNumberExistsInCommunity($id, $unitNumber)) {
            throw ValidationException::withMessages([
                'unit_number' => [UnitAssignmentService::DUPLICATE_UNIT_MESSAGE],
            ]);
        }

        $unit = $this->units->createUnit($id, $unitNumber);

        return response()->json([
            'data' => $this->units->formatUnit($unit),
            'message' => 'Unit created.',
        ], 201);
    }

    /** GET /v1/units/mine — multi-unit list (+ legacy single `unit` for older clients). */
    public function mine(Request $request): JsonResponse
    {
        $communityId = $this->resolveResidentCommunityId($request);
        $list = $this->units->userUnitsBrief($request->user(), $communityId);
        $list = array_map(
            fn (array $row) => $this->transfers->enrichResidentUnit($row, $request->user()),
            $list,
        );

        $active = array_values(array_filter(
            $list,
            fn (array $row) => ($row['association_status'] ?? 'active') === 'active',
        ));
        $billingUnits = array_values(array_filter(
            $active,
            fn (array $row) => (bool) ($row['is_billing_contact'] ?? false),
        ));

        $pendingPackage = null;
        if ($this->packages->hasPendingInitialPackage((int) $request->user()->id, $communityId)) {
            $pendingPackage = ['kind' => 'initial', 'status' => 'pending'];
        }

        return response()->json([
            // Legacy: first active unit (or first association).
            'data' => $active[0] ?? $list[0] ?? null,
            'units' => $list,
            'meta' => [
                'unit_count' => count($active),
                'association_count' => count($list),
                'billing_contact_unit_count' => count($billingUnits),
                'has_full_access' => $this->packages->residentHasFullUnitAccess((int) $request->user()->id, $communityId),
                'pending_initial_package' => $pendingPackage,
            ],
        ]);
    }

    /** POST /v1/units/mine/registration-packages — self-signup initial or add-on request. */
    public function submitRegistrationPackage(Request $request): JsonResponse
    {
        $communityId = $this->resolveResidentCommunityId($request);
        $data = $request->validate([
            'kind' => 'required|in:initial,addon',
            'units' => 'required|array|min:1|max:20',
            'units.*.unit_number' => 'required|string|max:50',
            'units.*.is_new_unit' => 'sometimes|boolean',
            'units.*.residence_type' => 'nullable|in:homeowner,tenant',
            'units.*.utility_bill_url' => 'required|string|max:1024',
            'units.*.ownership_proof_url' => 'nullable|string|max:1024',
            'units.*.tenancy_proof_url' => 'nullable|string|max:1024',
        ]);

        $package = $this->packages->submitPackage(
            (int) $request->user()->id,
            $communityId,
            (string) $data['kind'],
            $data['units'],
        );

        return response()->json([
            'data' => $this->packages->formatPackage($package),
            'message' => $data['kind'] === 'addon'
                ? 'Additional unit request submitted for admin review.'
                : 'Unit registration submitted for admin review.',
        ], 201);
    }

    /**
     * POST /v1/units/mine/onboarding-units
     * Complete-profile multi-unit submit: invited → assign + proofs; self-signup → initial package.
     */
    public function completeOnboardingUnits(Request $request): JsonResponse
    {
        $communityId = $this->resolveResidentCommunityIdFlexible($request);
        $data = $request->validate([
            'units' => 'required|array|min:1|max:20',
            'units.*.unit_number' => 'required|string|max:50',
            'units.*.is_new_unit' => 'sometimes|boolean',
            'units.*.residence_type' => 'required|in:homeowner,tenant',
            'units.*.occupancy' => 'nullable|in:live_here,rented,vacant',
            'units.*.utility_bill_url' => 'required|string|max:1024',
            'units.*.ownership_proof_url' => 'nullable|string|max:1024',
            'units.*.tenancy_proof_url' => 'nullable|string|max:1024',
        ]);

        $user = $request->user();
        $inviteUnits = $this->units->listInviteUnitNumbers($communityId, (int) $user->id);
        $invitedHere = $inviteUnits !== []
            || DB::table('community_memberships')
                ->where('user_id', $user->id)
                ->where('community_id', $communityId)
                ->whereNotNull('invite_code_used')
                ->where('invite_code_used', '!=', '')
                ->exists();

        if ($invitedHere) {
            $assigned = $this->packages->completeInvitedOnboarding(
                (int) $user->id,
                $communityId,
                $data['units'],
            );

            return response()->json([
                'data' => [
                    'mode' => 'invite',
                    'units' => array_map(
                        fn ($row) => $this->units->formatUnit($row, (int) $user->id),
                        $assigned,
                    ),
                ],
                'message' => 'Units and proofs saved.',
            ]);
        }

        $package = $this->packages->submitPackage(
            (int) $user->id,
            $communityId,
            UnitRegistrationPackageService::KIND_INITIAL,
            $data['units'],
        );

        return response()->json([
            'data' => [
                'mode' => 'package',
                'package' => $this->packages->formatPackage($package),
            ],
            'message' => 'Unit registration submitted for admin review.',
        ], 201);
    }

    /** GET /v1/admin/unit-registration-packages */
    public function adminPackagesIndex(Request $request): JsonResponse
    {
        $communityId = $this->resolveAdminCommunityId($request);
        $status = $request->query('status');
        $kind = $request->query('kind');

        return response()->json([
            'data' => $this->packages->listPackagesForCommunity(
                $communityId,
                is_string($status) && $status !== 'all' ? $status : null,
                is_string($kind) && $kind !== 'all' ? $kind : null,
            ),
        ]);
    }

    /** POST /v1/admin/unit-registration-packages/{id}/approve */
    public function adminApprovePackage(Request $request, int $id): JsonResponse
    {
        $package = DB::table('unit_registration_packages')->find($id);
        abort_if(! $package, 404);
        $communityId = $this->resolvePackageAdminCommunityId($request, $package);
        abort_if((int) $package->community_id !== $communityId, 404);

        $fresh = $this->packages->approvePackage($id, (int) $request->user()->id);

        return response()->json([
            'data' => $this->packages->formatPackage($fresh),
            'message' => 'Unit registration approved.',
        ]);
    }

    /** POST /v1/admin/unit-registration-packages/{id}/reject */
    public function adminRejectPackage(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'reason' => 'required|string|max:1000',
        ]);
        $package = DB::table('unit_registration_packages')->find($id);
        abort_if(! $package, 404);
        $communityId = $this->resolvePackageAdminCommunityId($request, $package);
        abort_if((int) $package->community_id !== $communityId, 404);

        $fresh = $this->packages->rejectPackage($id, (int) $request->user()->id, $data['reason']);

        return response()->json([
            'data' => $this->packages->formatPackage($fresh),
            'message' => 'Unit registration rejected.',
        ]);
    }

    /** POST /v1/units/mine/billing-contact-transfers */
    public function requestTransfer(Request $request): JsonResponse
    {
        $data = $request->validate([
            'nominee_user_id' => 'required|integer|exists:users,id',
            'unit_id' => 'nullable|integer|exists:units,id',
            'message' => 'nullable|string|max:500',
        ]);

        return response()->json([
            'data' => $this->transfers->requestTransfer(
                $request->user()->loadMissing('profile'),
                (int) $data['nominee_user_id'],
                $data['message'] ?? null,
                isset($data['unit_id']) ? (int) $data['unit_id'] : null,
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
        $this->units->pruneCopiedUnitsForCommunity($communityId);
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

        $unitNumber = trim($data['unit_number']);
        if ($this->units->unitNumberExistsInCommunity($communityId, $unitNumber)) {
            throw ValidationException::withMessages([
                'unit_number' => [UnitAssignmentService::DUPLICATE_UNIT_MESSAGE],
            ]);
        }

        $unit = $this->units->createUnit($communityId, $unitNumber, $data['kind'] ?? 'residential');

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

    /** DELETE /v1/admin/units/{id} */
    public function adminDestroy(Request $request, int $id): JsonResponse
    {
        $communityId = $this->resolveAdminCommunityId($request);
        $this->units->deleteUnit($communityId, $id);

        return response()->json([
            'message' => 'Unit deleted.',
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

        return UserActingContextService::requireCurrentCommunityId($request->user());
    }

    /** Allow pending membership during complete-profile onboarding. */
    private function resolveResidentCommunityIdFlexible(Request $request): int
    {
        if ($request->filled('community_id')) {
            $communityId = (int) $request->community_id;
            $allowed = DB::table('community_memberships')
                ->where('user_id', $request->user()->id)
                ->where('community_id', $communityId)
                ->whereIn('status', ['approved', 'pending', 'onboarding'])
                ->exists();
            // Self-signup may submit before membership exists — still accept community_id.
            if ($allowed || $request->user()) {
                return $communityId;
            }
        }

        $current = UserActingContextService::currentCommunityId($request->user());
        if ($current) {
            return $current;
        }

        $membership = DB::table('community_memberships')
            ->where('user_id', $request->user()->id)
            ->whereIn('status', ['approved', 'pending'])
            ->orderBy('created_at')
            ->first();

        abort_if(! $membership, 422, 'Join a community before submitting units.');

        return (int) $membership->community_id;
    }

    private function resolveAdminCommunityId(Request $request): int
    {
        $scope = AdminRoleService::resolveAdminCommunityScope($request->user(), $request);
        abort_if(! $scope, 422, 'No community scope available.');

        return (int) $scope;
    }

    /**
     * Community admins stay inside their managed community.
     * System admins have no single community, so a package review uses that package's community.
     */
    private function resolvePackageAdminCommunityId(Request $request, object $package): int
    {
        $scope = AdminRoleService::resolveAdminCommunityScope($request->user(), $request);
        if ($scope) {
            return (int) $scope;
        }

        if (AdminRoleService::isSystemAdmin($request->user())) {
            return (int) $package->community_id;
        }

        abort(422, 'No community scope available.');
    }

    private function assertCommunityUnitsAccess(Request $request, int $communityId, bool $mutating = false): void
    {
        $user = $request->user();
        if (AdminRoleService::canManageCommunity($user, $communityId)) {
            return;
        }

        $allowed = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('community_id', $communityId)
            ->whereIn('status', ['approved', 'pending'])
            ->exists();

        if ($allowed) {
            return;
        }

        if (! $mutating) {
            $open = DB::table('communities')
                ->where('id', $communityId)
                ->whereNull('deleted_at')
                ->where(function ($query) {
                    $query->whereNull('status')->orWhere('status', 'active');
                })
                ->where(function ($query) {
                    $query->whereNull('review_status')->orWhere('review_status', 'approved');
                })
                ->exists();
            if ($open) {
                return;
            }
        }

        abort(403, 'You cannot access units for this community.');
    }
}
