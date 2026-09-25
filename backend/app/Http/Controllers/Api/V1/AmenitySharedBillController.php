<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\AdminRoleService;
use App\Services\AmenitySharedBillService;
use App\Services\GuestAccessService;
use App\Services\PlaidAchService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AmenitySharedBillController extends Controller
{
    public function __construct(private AmenitySharedBillService $bills) {}

    /** GET /v1/admin/amenity-bills */
    public function communityIndex(Request $request): JsonResponse
    {
        $scope = AdminRoleService::resolveAdminCommunityScope($request->user(), $request);
        abort_if(! $scope, 422, 'No community scope available.');

        return response()->json([
            'data' => $this->bills->listCommunityResidentBills((int) $scope, $request),
        ]);
    }

    /** GET /v1/amenity-bills — signed-in resident's shared amenity bills. */
    public function myIndex(Request $request): JsonResponse
    {
        $user = $request->user();
        if (GuestAccessService::isGuest($user)) {
            return response()->json(['data' => []]);
        }

        $communityId = $this->resolveResidentCommunityId($request, $user);

        return response()->json([
            'data' => $this->bills->listMyResidentBills($communityId, (int) $user->id, $request),
        ]);
    }

    /** GET /v1/amenity-owner-bills — bills for amenities the current user created. */
    public function ownerIndex(Request $request): JsonResponse
    {
        $user = $request->user();
        if (GuestAccessService::isGuest($user)) {
            return response()->json(['data' => []]);
        }

        $communityId = $this->resolveResidentCommunityId($request, $user);

        return response()->json([
            'data' => $this->bills->listOwnerResidentBills($communityId, (int) $user->id, $request),
        ]);
    }

    /** PATCH /v1/amenities/{id}/resident-bills/{residentBillId}/approve */
    public function ownerApprove(Request $request, int $id, int $residentBillId): JsonResponse
    {
        $bill = $this->findOwnerReviewableBill($request, $id, $residentBillId);

        return response()->json([
            'data' => $this->bills->approveResidentPayment($bill, (int) $request->user()->id, $request),
            'message' => AmenitySharedBillService::APPROVED_MESSAGE,
        ]);
    }

    /** PATCH /v1/amenities/{id}/resident-bills/{residentBillId}/reject */
    public function ownerReject(Request $request, int $id, int $residentBillId): JsonResponse
    {
        $bill = $this->findOwnerReviewableBill($request, $id, $residentBillId);

        $data = $request->validate([
            'rejection_code' => ['required', 'string', Rule::in(array_keys(AmenitySharedBillService::REJECTION_REASONS))],
            'rejection_reason' => 'nullable|string|max:500',
        ]);

        $reason = $this->bills->resolveRejectionReason(
            $data['rejection_code'],
            $data['rejection_reason'] ?? null,
        );

        return response()->json([
            'data' => $this->bills->rejectResidentPayment($bill, (int) $request->user()->id, $reason, $request),
            'message' => AmenitySharedBillService::REJECTED_MESSAGE,
        ]);
    }

    /** GET /v1/admin/amenities/{id}/bills */
    public function adminIndex(Request $request, int $id): JsonResponse
    {
        $amenity = $this->findAdminAmenity($id, $request);
        abort_if(! $amenity, 404, 'Amenity not found.');

        return response()->json([
            'data' => $this->bills->listAdminBills((int) $amenity->id, $request),
        ]);
    }

    /** POST /v1/admin/amenities/{id}/bills */
    public function adminStore(Request $request, int $id): JsonResponse
    {
        $amenity = $this->findAdminAmenity($id, $request);
        abort_if(! $amenity, 404, 'Amenity not found.');

        $data = $request->validate([
            'billing_month' => 'required|string',
            'title' => 'required|string|max:200',
            'description' => 'nullable|string|max:2000',
            'amount_per_resident' => 'required|numeric|min:0.01|max:999999.99',
            'due_date' => 'required|date',
            'file' => AmenitySharedBillService::FILE_RULE,
        ]);

        try {
            $data['billing_month'] = $this->bills->normalizeBillingMonth($data['billing_month']);
        } catch (\Throwable) {
            return response()->json([
                'message' => 'The billing month is invalid.',
                'errors' => ['billing_month' => ['Enter a valid billing month.']],
            ], 422);
        }

        $bill = $this->bills->publish(
            $amenity,
            [
                'billing_month' => $data['billing_month'],
                'title' => trim($data['title']),
                'description' => isset($data['description']) && trim((string) $data['description']) !== ''
                    ? trim((string) $data['description'])
                    : null,
                'amount_per_resident' => $data['amount_per_resident'],
                'due_date' => $data['due_date'],
            ],
            $request->file('file'),
            (int) $request->user()->id,
            $request,
        );

        return response()->json([
            'data' => $bill,
            'message' => 'Monthly bill published.',
        ], 201);
    }

    /** GET /v1/admin/amenities/{id}/bills/{monthlyBillId}/residents */
    public function adminResidentIndex(Request $request, int $id, int $monthlyBillId): JsonResponse
    {
        $amenity = $this->findAdminAmenity($id, $request);
        abort_if(! $amenity, 404, 'Amenity not found.');

        return response()->json([
            'data' => $this->bills->listAdminResidentBills((int) $amenity->id, $monthlyBillId, $request),
        ]);
    }

    /** GET /v1/admin/amenities/{id}/resident-bills/{residentBillId}/reviews */
    public function adminReviews(Request $request, int $id, int $residentBillId): JsonResponse
    {
        $amenity = $this->findAdminAmenity($id, $request);
        abort_if(! $amenity, 404, 'Amenity not found.');

        return response()->json([
            'data' => $this->bills->listAdminReviews((int) $amenity->id, $residentBillId, $request),
        ]);
    }

    /** PATCH /v1/admin/amenities/{id}/resident-bills/{residentBillId}/approve */
    public function adminApprove(Request $request, int $id, int $residentBillId): JsonResponse
    {
        $bill = $this->findAdminReviewableBill($request, $id, $residentBillId);

        return response()->json([
            'data' => $this->bills->approveResidentPayment($bill, (int) $request->user()->id, $request),
            'message' => AmenitySharedBillService::APPROVED_MESSAGE,
        ]);
    }

    /** PATCH /v1/admin/amenities/{id}/resident-bills/{residentBillId}/reject */
    public function adminReject(Request $request, int $id, int $residentBillId): JsonResponse
    {
        $bill = $this->findAdminReviewableBill($request, $id, $residentBillId);

        $data = $request->validate([
            'rejection_code' => ['required', 'string', Rule::in(array_keys(AmenitySharedBillService::REJECTION_REASONS))],
            'rejection_reason' => 'nullable|string|max:500',
        ]);

        $reason = $this->bills->resolveRejectionReason(
            $data['rejection_code'],
            $data['rejection_reason'] ?? null,
        );

        return response()->json([
            'data' => $this->bills->rejectResidentPayment($bill, (int) $request->user()->id, $reason, $request),
            'message' => AmenitySharedBillService::REJECTED_MESSAGE,
        ]);
    }

    /** GET /v1/amenities/{id}/bills */
    public function residentIndex(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if (GuestAccessService::isGuest($user)) {
            return response()->json(['data' => []]);
        }

        $communityId = $this->resolveResidentCommunityId($request, $user);
        $amenity = DB::table('amenities')
            ->where('id', $id)
            ->where('community_id', $communityId)
            ->first();
        abort_if(! $amenity, 404, 'Amenity not found.');

        return response()->json([
            'data' => $this->bills->listResidentBills((int) $amenity->id, (int) $user->id, $request),
        ]);
    }

    /** POST /v1/amenities/{id}/bills/{residentBillId}/proof */
    public function residentSubmitProof(Request $request, int $id, int $residentBillId): JsonResponse
    {
        $user = $request->user();
        abort_if(GuestAccessService::isGuest($user), 403, 'Guests cannot submit payment proof.');

        $communityId = $this->resolveResidentCommunityId($request, $user);
        $amenity = DB::table('amenities')
            ->where('id', $id)
            ->where('community_id', $communityId)
            ->first();
        abort_if(! $amenity, 404, 'Amenity not found.');

        $owned = $this->bills->findOwnedResidentBill((int) $amenity->id, $residentBillId, (int) $user->id);
        abort_if(! $owned, 404, 'Bill not found.');

        $data = $request->validate([
            'file' => AmenitySharedBillService::FILE_RULE,
            'payment_date' => 'required|date|before_or_equal:today',
            'payment_reference' => 'nullable|string|max:100',
            'payment_note' => 'nullable|string|max:1000',
        ]);

        $bill = $this->bills->submitPaymentProof(
            $owned,
            $request->file('file'),
            [
                'payment_date' => $data['payment_date'],
                'payment_reference' => isset($data['payment_reference']) && trim((string) $data['payment_reference']) !== ''
                    ? trim((string) $data['payment_reference'])
                    : null,
                'payment_note' => isset($data['payment_note']) && trim((string) $data['payment_note']) !== ''
                    ? trim((string) $data['payment_note'])
                    : null,
            ],
            $request,
        );

        return response()->json([
            'data' => $bill,
            'message' => AmenitySharedBillService::PROOF_SUBMITTED_MESSAGE,
        ]);
    }

    /** POST /v1/amenities/{id}/bills/{residentBillId}/pay-bank */
    public function residentPayBank(Request $request, int $id, int $residentBillId): JsonResponse
    {
        $user = $request->user();
        abort_if(GuestAccessService::isGuest($user), 403, 'Guests cannot send bank payments.');

        $transfer = app(PlaidAchService::class)->paySharedBill($user, $id, $residentBillId);
        $owned = $this->bills->findOwnedResidentBill($id, $residentBillId, (int) $user->id);

        return response()->json([
            'data' => [
                'bill' => $owned ? $this->bills->formatResidentBill($owned, $request) : null,
                'transfer' => $transfer->toPublicPayload(),
            ],
            'message' => $transfer->isSuccessful()
                ? 'Paid from your bank to the community account.'
                : 'Bank payment submitted.',
        ], 201);
    }

    private function findAdminReviewableBill(Request $request, int $amenityId, int $residentBillId): object
    {
        $amenity = $this->findAdminAmenity($amenityId, $request);
        abort_if(! $amenity, 404, 'Amenity not found.');

        $bill = $this->bills->findAdminResidentBill((int) $amenity->id, $residentBillId);
        abort_if(! $bill, 404, 'Bill not found.');

        return $bill;
    }

    private function findOwnerReviewableBill(Request $request, int $amenityId, int $residentBillId): object
    {
        $user = $request->user();
        abort_if(GuestAccessService::isGuest($user), 403, 'Guests cannot review amenity payments.');

        $communityId = $this->resolveResidentCommunityId($request, $user);
        $amenity = DB::table('amenities')
            ->where('id', $amenityId)
            ->where('community_id', $communityId)
            ->first();
        abort_if(! $amenity, 404, 'Amenity not found.');

        $bill = $this->bills->findOwnerResidentBill((int) $amenity->id, $residentBillId, (int) $user->id);
        abort_if(! $bill, 403, 'Only the amenity creator can review this payment.');

        return $bill;
    }

    private function findAdminAmenity(int $id, Request $request): ?object
    {
        $scope = AdminRoleService::resolveAdminCommunityScope($request->user(), $request);
        abort_if(! $scope, 422, 'No community scope available.');

        return DB::table('amenities')
            ->where('id', $id)
            ->where('community_id', $scope)
            ->first();
    }

    private function resolveResidentCommunityId(Request $request, $user): int
    {
        if ($request->filled('community_id')) {
            return (int) $request->community_id;
        }

        $membership = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('status', 'approved')
            ->orderByDesc('created_at')
            ->first();

        abort_if(! $membership, 422, 'No approved community membership found.');

        return (int) $membership->community_id;
    }
}
